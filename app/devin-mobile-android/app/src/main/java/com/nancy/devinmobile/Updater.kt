package com.nancy.devinmobile

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
 * 在线更新：读仓库里 app/dist/version.json，比本机 versionCode 新则提示下载安装。
 * Android 不允许静默安装，系统安装器仍需用户点一次「安装」；
 * 首次还会要求允许本应用「安装未知应用」。
 */
object Updater {

    data class HistEntry(val versionCode: Int, val label: String, val notes: String)

    data class Release(val versionCode: Int, val apkUrl: String, val notes: String, val versionName: String = "",
                       /** 本机跳过的各版本更新说明（新→旧），来自 version.json 的 history */
                       val changelog: String = "",
                       /** 全部版本记录（新→旧）——更新记录页数据源 */
                       val history: List<HistEntry> = emptyList(),
                       /** history 的原始 JSON 串——更新记录页整份落缓存用 */
                       val historyJson: String = "")

    /** 因未授权「安装未知应用」而中断的更新；授权返回后由 onResume 续上。 */
    private var pendingInstall: Release? = null

    fun retryPendingInstall(activity: Activity) {
        val release = pendingInstall ?: return
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) return
        pendingInstall = null
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
            // 本机版本 ≥ 远程 → 任何缓存的旧安装包都没用了（含上次装完残留的）
            activity.cacheDir.listFiles()?.forEach { f ->
                if (f.name.startsWith("update-")) f.delete()
            }
            if (manual) Toast.makeText(activity, "已是最新版本 v${BuildConfig.VERSION_NAME}", Toast.LENGTH_SHORT).show()
            return
        }

        // 清掉其它版本残留的下载包/标记
        activity.cacheDir.listFiles()?.forEach { f ->
            if (f.name.startsWith("update-") &&
                !f.name.startsWith("update-${release.versionCode}.")) f.delete()
        }

        // 同版本已完整下载过（上次安装时被用户取消）：直接拉起安装，不重复下载
        val alreadyDownloaded = File(activity.cacheDir, "update-${release.versionCode}.apk.ok").isFile
        // 连跳多个版本时逐条列出每个版本的说明；history 缺失或为空回退单条 notes
        val msg = release.changelog.ifEmpty { release.notes }
        AlertDialog.Builder(activity)
            .setTitle("发现新版本 v${release.versionName.ifEmpty { release.versionCode.toString() }}")
            .setMessage(if (msg.isEmpty()) "当前 v${BuildConfig.VERSION_NAME}，要下载安装吗？" else msg)
            .setNegativeButton("以后再说", null)
            .setPositiveButton(if (alreadyDownloaded) "安装" else "下载安装") { _, _ ->
                if (alreadyDownloaded) {
                    install(activity, File(activity.cacheDir, "update-${release.versionCode}.apk"), release)
                } else {
                    downloadAndInstall(activity, release)
                }
            }
            .show()
    }

    /** 静默查最新版本（失败返回 null）——供更新记录页判断是否提示。 */
    suspend fun peek(): Release? = try { latestRelease() } catch (e: Exception) { null }

    private suspend fun latestRelease(): Release? = withContext(Dispatchers.IO) {
        // 加时间戳参数破 GitLab CDN 对 raw 文件的缓存
        val conn = URL("$VERSION_URL?t=${System.currentTimeMillis()}").openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("Cache-Control", "no-cache")
        try {
            if (conn.responseCode != 200) return@withContext null
            val j = JSONObject(conn.inputStream.bufferedReader().readText())
            val hist = j.optJSONArray("history")?.let { arr ->
                (0 until arr.length()).map { arr.getJSONObject(it) }
                    .sortedByDescending { it.optInt("versionCode") }
                    .map {
                        HistEntry(
                            it.optInt("versionCode"),
                            "v" + it.optString("versionName")
                                .ifEmpty { it.optInt("versionCode").toString() },
                            it.optString("notes"))
                    }
            } ?: emptyList()
            Release(
                versionCode = j.getInt("versionCode"),
                apkUrl = j.getString("apkUrl"),
                notes = j.optString("notes"),
                versionName = j.optString("versionName"),
                changelog = hist.filter { it.versionCode > BuildConfig.VERSION_CODE }
                    .take(20)   // 弹窗超长时截断，最多列最近 20 个跳过版本
                    .joinToString("\n\n") { it.label + "\n" + it.notes },
                history = hist,
                historyJson = j.optJSONArray("history")?.toString() ?: "",
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
                // raw/main 的 APK 会被 GitLab CDN 缓存住旧版本——带版本参数强制拉新
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
                    apk.delete()   // 丢弃截断包，避免后续误装
                    File(activity.cacheDir, "update-${release.versionCode}.apk.ok").delete()
                    pendingInstall = null
                    return@Thread
                }
                File(activity.cacheDir, "update-${release.versionCode}.apk.ok").createNewFile()   // 下载完成标记
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
        // Android 8+ 需先授权「安装未知应用」
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            pendingInstall = release
            Toast.makeText(activity, "请先允许本应用安装应用，返回后自动继续", Toast.LENGTH_LONG).show()
            activity.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}"),
                )
            )
            return
        }
        pendingInstall = release   // 安装器里点取消/返回后由 onResume 重拉安装，不重新下载
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
        "https://gitlab.com/moonnancy881-dotcom/myprojects/-/raw/main/app/dist/version.json"
}
