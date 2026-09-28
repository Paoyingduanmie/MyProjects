package com.nancy.playground

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 在线更新：读仓库里 playground/dist/version.json，比本机 versionCode 新则提示下载安装。
 * 与 app/devin-mobile-android 的 Updater 同套机制；
 * Android 不允许静默安装，系统安装器仍需用户点一次「安装」。
 */
object Updater {

    data class Release(
        val versionCode: Int,
        val apkUrl: String,
        val notes: String,
        val versionName: String = "",
        /** 各版本更新内容（含本版），用于跨多版本更新时展示跳过的版本 */
        val history: List<Release> = emptyList(),
    )

    /** 因未授权「安装未知应用」而中断的更新；授权返回后由 onResume 续上。 */
    private var pendingInstall: Release? = null
    /** 是否正停在系统「允许安装未知应用」授权页；用户取消安装器不算，避免回来又弹安装 */
    private var awaitingInstallPermission = false

    fun clearPending() {
        pendingInstall = null
        awaitingInstallPermission = false
    }

    private fun prefs(activity: Activity) =
        activity.getSharedPreferences("updater", Activity.MODE_PRIVATE)

    /** 清掉已安装版本的更新包残留（装完没删的 APK + 校验标记） */
    fun purgeInstalledApks(activity: Activity) {
        activity.cacheDir.listFiles()?.forEach { f ->
            val m = Regex("update-(\\d+)\\.apk(\\.ok)?").matchEntire(f.name)
            if (m != null && (m.groupValues[1].toIntOrNull() ?: Int.MAX_VALUE) <= BuildConfig.VERSION_CODE) {
                f.delete()
            }
        }
    }

    fun retryPendingInstall(activity: Activity) {
        val release = pendingInstall ?: return
        pendingInstall = null
        if (!awaitingInstallPermission) return
        awaitingInstallPermission = false
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) return
        val apk = File(activity.cacheDir, "update-${release.versionCode}.apk")
        if (apk.isFile) install(activity, apk, release) else downloadAndInstall(activity, release)
    }

    suspend fun check(activity: Activity, manual: Boolean = false) {
        val release = try {
            latestRelease()
        } catch (e: Exception) {
            if (manual) Toast.makeText(activity, "检查失败：${e.message}", Toast.LENGTH_SHORT).show()
            return   // 自动检查失败静默忽略，不影响主功能
        }
        if (release == null || release.versionCode <= BuildConfig.VERSION_CODE) {
            activity.cacheDir.listFiles()?.forEach { f ->
                if (f.name.startsWith("update-")) f.delete()
            }
            if (manual) Toast.makeText(activity, "已是最新版本 v${BuildConfig.VERSION_NAME}", Toast.LENGTH_SHORT).show()
            return
        }

        activity.cacheDir.listFiles()?.forEach { f ->
            if (f.name.startsWith("update-") &&
                !f.name.startsWith("update-${release.versionCode}.")) f.delete()
        }

        // 用户在「以后再说」里跳过过的版本，自动检查不再打扰；手动检查不受影响
        if (!manual && prefs(activity).getInt("skip_version", -1) == release.versionCode) return

        // 弹窗内容：本机版本之后所有版本的更新点都列出（跨多版本更新时不漏）
        val notes = release.history
            .filter { it.versionCode > BuildConfig.VERSION_CODE }
            .sortedByDescending { it.versionCode }
            .joinToString("\n\n") {
                "v${it.versionName.ifEmpty { it.versionCode.toString() }}：${it.notes}"
            }
            .ifEmpty { release.notes }

        val alreadyDownloaded = File(activity.cacheDir, "update-${release.versionCode}.apk.ok").isFile
        AlertDialog.Builder(activity)
            .setTitle("发现新版本 v${release.versionName.ifEmpty { release.versionCode.toString() }}")
            .setMessage(if (notes.isEmpty()) "当前 v${BuildConfig.VERSION_NAME}，要下载安装吗？" else notes)
            .setNegativeButton("以后再说") { _, _ ->
                prefs(activity).edit().putInt("skip_version", release.versionCode).apply()
            }
            .setPositiveButton(if (alreadyDownloaded) "安装" else "下载安装") { _, _ ->
                prefs(activity).edit().remove("skip_version").apply()
                if (alreadyDownloaded) {
                    install(activity, File(activity.cacheDir, "update-${release.versionCode}.apk"), release)
                } else {
                    downloadAndInstall(activity, release)
                }
            }
            .show()
    }

    /** 已下载完成的更新包版本号，无则 null */
    fun cachedVersionCode(activity: Activity): Int? =
        activity.cacheDir.listFiles()
            ?.firstNotNullOfOrNull { f ->
                Regex("update-(\\d+)\\.apk\\.ok").matchEntire(f.name)
                    ?.groupValues?.get(1)?.toIntOrNull()
            }
            ?.takeIf { File(activity.cacheDir, "update-$it.apk").isFile }

    /** 直接安装已下载完成的更新包；没有可装的包返回 false */
    fun installCached(activity: Activity): Boolean {
        val code = cachedVersionCode(activity) ?: return false
        install(activity, File(activity.cacheDir, "update-$code.apk"), Release(code, "", ""))
        return true
    }

    /** 静默查最新版本（失败返回 null）——供更新日志页判断是否提示。 */
    suspend fun peek(): Release? = try { latestRelease() } catch (e: Exception) { null }

    private suspend fun latestRelease(): Release? = withContext(Dispatchers.IO) {
        val conn = URL("$VERSION_URL?t=${System.currentTimeMillis()}").openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Cache-Control", "no-cache")
        try {
            if (conn.responseCode != 200) return@withContext null
            val j = JSONObject(conn.inputStream.bufferedReader().readText())
            val apkUrl = j.getString("apkUrl")
            val history = j.optJSONArray("releases")?.let { arr ->
                (0 until arr.length()).map { i ->
                    val r = arr.getJSONObject(i)
                    Release(
                        versionCode = r.getInt("versionCode"),
                        apkUrl = apkUrl,
                        notes = r.optString("notes"),
                        versionName = r.optString("versionName"),
                    )
                }
            } ?: emptyList()
            Release(
                versionCode = j.getInt("versionCode"),
                apkUrl = apkUrl,
                notes = j.optString("notes"),
                versionName = j.optString("versionName"),
                history = history,
            )
        } finally {
            conn.disconnect()
        }
    }

    private fun downloadAndInstall(activity: Activity, release: Release) {
        val status = TextView(activity).apply {
            setPadding(48, 32, 48, 0)
            text = "下载中… 0%"
        }
        val dialog = AlertDialog.Builder(activity)
            .setTitle("下载更新")
            .setView(status)
            .setNegativeButton(android.R.string.cancel, null)
            .setCancelable(false)
            .show()

        Thread {
            try {
                val apk = File(activity.cacheDir, "update-${release.versionCode}.apk")
                val conn = URL("${release.apkUrl}?v=${release.versionCode}").openConnection() as HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 30000
                val total = conn.contentLength
                var cancelled = false
                conn.inputStream.use { input ->
                    apk.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        var read: Int
                        var done = 0L
                        while (input.read(buf).also { read = it } != -1) {
                            if (!dialog.isShowing) { cancelled = true; break }
                            out.write(buf, 0, read)
                            done += read
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                activity.runOnUiThread { status.text = "下载中… $pct%" }
                            }
                        }
                    }
                }
                conn.disconnect()
                if (cancelled) {
                    apk.delete()
                    File(activity.cacheDir, "update-${release.versionCode}.apk.ok").delete()
                    pendingInstall = null
                    return@Thread
                }
                File(activity.cacheDir, "update-${release.versionCode}.apk.ok").createNewFile()
                activity.runOnUiThread {
                    dialog.dismiss()
                    install(activity, apk, release)
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    dialog.dismiss()
                    Toast.makeText(activity, "下载失败：${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun install(activity: Activity, apk: File, release: Release) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            pendingInstall = release
            awaitingInstallPermission = true
            Toast.makeText(activity, "请先允许本应用安装应用，返回后自动继续", Toast.LENGTH_LONG).show()
            activity.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}"),
                )
            )
            return
        }
        pendingInstall = null
        val uri = FileProvider.getUriForFile(
            activity, "${activity.packageName}.fileprovider", apk,
        )
        activity.startActivity(
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )
    }

    private const val VERSION_URL =
        "https://gitlab.com/moonnancy881-dotcom/myprojects/-/raw/main/playground/dist/version.json"
}
