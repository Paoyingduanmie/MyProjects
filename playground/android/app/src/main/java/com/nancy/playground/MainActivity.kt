package com.nancy.playground

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.net.Uri
import android.provider.OpenableColumns
import android.graphics.BitmapFactory
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.view.Gravity
import android.view.PixelCopy
import android.view.View
import android.view.WindowManager
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.graphics.Outline
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private val scope = MainScope()
    private var lastBack = 0L

    private var bgmPlayer: ExoPlayer? = null
    private var bgmFile: String? = null

    // 音效：ExoPlayer 内挂的软件 PCM 处理器（不依赖厂商开放系统 audiofx）
    private val fxProcessor = FxAudioProcessor()
    private val fxPrefs get() = getSharedPreferences("bgm_fx", MODE_PRIVATE)

    // 播放状态独立跟踪：桥接口和 WebView 都能读
    @Volatile private var bgmPlaying = false

    private fun applyFx() {
        fxProcessor.configure(
            fxPrefs.getInt("preset", 0),
            fxPrefs.getInt("bass", 0) / 1000f * 12f,   // 0/300/650/1000 → 0~12dB
            fxPrefs.getBoolean("virt", false),
            fxPrefs.getBoolean("loud", false)
        )
    }

    /** mode: 0 单曲循环 1 列表循环 2 随机 */
    private fun applyPlayMode(player: ExoPlayer, mode: Int) {
        player.repeatMode = if (mode == 0) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL
        player.shuffleModeEnabled = mode == 2
    }

    private fun buildPlayer(): ExoPlayer {
        val renderersFactory = object : DefaultRenderersFactory(this) {
            override fun buildAudioSink(
                context: android.content.Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean
            ): AudioSink = DefaultAudioSink.Builder()
                .setAudioProcessors(arrayOf(fxProcessor))
                .build()
        }
        return ExoPlayer.Builder(this, renderersFactory)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus= */ true
            )
            .setHandleAudioBecomingNoisy(true)   // 拔耳机自动暂停
            .build()
    }

    /** 音量渐变：切歌/停止时的淡入淡出 */
    private fun fadeVolume(player: ExoPlayer, target: Float, durationMs: Long, onDone: (() -> Unit)? = null) {
        ValueAnimator.ofFloat(player.volume, target).apply {
            duration = durationMs
            addUpdateListener { player.volume = it.animatedValue as Float }
            if (onDone != null) addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) = onDone()
            })
            start()
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        // 不设 WebChromeClient 时 confirm() 不弹框且直接返回 false（删除确认依赖它）
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(Bridge(), "Android")
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?, request: WebResourceRequest?
            ): WebResourceResponse? =
                request?.url?.let { assetLoader.shouldInterceptRequest(it) }
            override fun onPageFinished(view: WebView?, url: String?) {
                dismissSplash()
            }
        }
        // 游戏页屏蔽系统长按（识图/传送门等手势），避免打断蓄力类操作
        webView.setOnLongClickListener {
            webView.url?.contains("/assets/games/") == true
        }
        val root = FrameLayout(this)
        root.addView(webView)
        splash = makeSplash()
        root.addView(splash)
        setContentView(root)
        webView.loadUrl(LAUNCHER_URL)
        applyChrome()
        applyFx()
        scope.launch { Updater.check(this@MainActivity) }
        Thread { devRegister() }.start()
    }

    // ---- 启动画面：图标+名字，页面加载好且最短展示后淡出 ----
    private var splash: View? = null
    private val splashShownAt = SystemClock.uptimeMillis()
    private var splashDone = false

    private fun makeSplash(): View {
        val dp = resources.displayMetrics.density
        val bg = FrameLayout(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(0xFFFDF5EF.toInt(), 0xFFFBE9E4.toInt(), 0xFFF6D9D3.toInt())
            )
        }
        // 四角散落小樱花（WebView 里同款的 🌸 点缀）
        listOf(
            Triple(0.14f, 0.12f, -20f), Triple(0.80f, 0.20f, 30f),
            Triple(0.18f, 0.72f, 45f), Triple(0.74f, 0.82f, -35f)
        ).forEach { (fx, fy, rot) ->
            bg.addView(TextView(this).apply {
                text = "🌸"; textSize = 20f; rotation = rot; alpha = 0.85f
            }, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = (resources.displayMetrics.widthPixels * fx).toInt(); topMargin = (resources.displayMetrics.heightPixels * fy).toInt() })
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val icon = ImageView(this).apply {
            val bmp = BitmapFactory.decodeResource(resources, R.drawable.ic_launcher)
            setImageDrawable(RoundedBitmapDrawableFactory.create(resources, bmp).apply {
                cornerRadius = 36 * dp
                setAntiAlias(true)
            })
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, 36 * dp)
                }
            }
            clipToOutline = true
            elevation = 12 * dp
        }
        col.addView(icon, LinearLayout.LayoutParams((150 * dp).toInt(), (150 * dp).toInt()))
        col.addView(TextView(this).apply {
            text = getString(R.string.app_name)
            textSize = 46f; setTextColor(0xFF8A5A5E.toInt())
            letterSpacing = 0.28f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = (28 * dp).toInt() })
        col.addView(TextView(this).apply {
            text = "一 隅 天 地 · 小 憩 之 所"
            textSize = 14f; setTextColor(0xFFC19A9C.toInt()); letterSpacing = 0.22f
        }, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = (12 * dp).toInt() })
        bg.addView(col, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))
        col.alpha = 0f; col.scaleX = 0.92f; col.scaleY = 0.92f
        col.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(600).start()
        return bg
    }

    private fun dismissSplash() {
        if (splashDone) return
        splashDone = true
        val wait = (1100 - (SystemClock.uptimeMillis() - splashShownAt)).coerceAtLeast(0)
        webView.postDelayed({
            val s = splash ?: return@postDelayed
            s.animate().alpha(0f).setDuration(400).withEndAction {
                (s.parent as? ViewGroup)?.removeView(s)
                splash = null
            }.start()
        }, wait)
    }

    // 保留系统状态栏/导航键，只是染成和内容一体的浅色
    private fun applyChrome() {
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = 0xFFFDF5EF.toInt()
        window.navigationBarColor = 0xFFF6D9D3.toInt()
        WindowInsetsControllerCompat(window, webView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
    }

    override fun onResume() {
        super.onResume()
        Updater.purgeInstalledApks(this)
        Updater.retryPendingInstall(this)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
            return
        }
        val now = System.currentTimeMillis()
        if (now - lastBack < 2000) {
            finish()
        } else {
            lastBack = now
            Toast.makeText(this, "再按一次退出", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        stopBgm()
        webView.destroy()
        super.onDestroy()
    }

    private fun stopBgm() {
        bgmPlayer?.let { p ->
            fadeVolume(p, 0f, 300) { p.release() }
        }
        bgmPlayer = null
        bgmFile = null
        bgmPlaying = false
    }

    /** 用户导入的 BGM 存放目录（app 私有，持久）。 */
    private val userBgmDir get() = File(filesDir, "bgm").apply { mkdirs() }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if ((requestCode == REQ_BGM || requestCode == REQ_BGM_DIRECT) &&
            resultCode == RESULT_OK && data != null) {
            val uris = mutableListOf<Uri>()
            data.clipData?.let { cd ->
                for (i in 0 until cd.itemCount) uris.add(cd.getItemAt(i).uri)
            }
            data.data?.let { uris.add(it) }
            if (requestCode == REQ_BGM) importBgmBatch(uris) else uploadDirectBatch(uris)
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    private fun displayName(uri: Uri): String? =
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { c -> if (c.moveToFirst()) c.getString(0) else null }

    /** 批量导入：逐个复制进 filesDir/bgm，每首回调 __bgmImported，全部完回调 __bgmImportDone */
    private fun importBgmBatch(uris: List<Uri>) {
        if (uris.isEmpty()) return
        Thread {
            var ok = 0
            for (uri in uris) {
                try {
                    val raw = displayName(uri) ?: "bgm-${System.currentTimeMillis()}.mp3"
                    val name = File(raw).name   // 去路径
                    val dest = File(userBgmDir, name)
                    val part = File(userBgmDir, "$name.part")
                    try {
                        contentResolver.openInputStream(uri)?.use { input ->
                            part.outputStream().use { input.copyTo(it) }
                        } ?: error("读不到文件")
                        if (!part.renameTo(dest)) part.copyTo(dest, true).also { part.delete() }
                    } catch (e: Exception) {
                        part.delete()
                        throw e
                    }
                    ok++
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "window.__bgmImported && window.__bgmImported(${org.json.JSONObject.quote(name)})", null
                        )
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        Toast.makeText(this, "导入失败：${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            runOnUiThread {
                Toast.makeText(this, "已导入 $ok 首", Toast.LENGTH_SHORT).show()
                webView.evaluateJavascript(
                    "window.__bgmImportDone && window.__bgmImportDone()", null
                )
            }
        }.start()
    }

    // ---- 仅传云端（不入本地）：记住 URI 供重试 ----
    private val lastDirectUris = mutableMapOf<String, Uri>()
    private var pendingDirectCloud: List<String> = emptyList()

    private fun normTrack(s: String): String =
        s.substringBeforeLast('.').lowercase().replace(Regex("[^0-9a-z一-鿿]+"), "")
    private fun sameSong(a: String, b: String): Boolean {
        val na = normTrack(a); val nb = normTrack(b)
        return na.isNotEmpty() && nb.isNotEmpty() &&
            (na == nb || (na.length >= 2 && nb.length >= 2 && (na.contains(nb) || nb.contains(na))))
    }

    private fun uploadDirectBatch(uris: List<Uri>) {
        if (uris.isEmpty()) return
        Thread {
            for (uri in uris) {
                val name = File(displayName(uri) ?: "track-${System.currentTimeMillis()}.mp3").name
                if (pendingDirectCloud.any { sameSong(name, it) }) {
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "window.__bgmUploadSkip && window.__bgmUploadSkip(${org.json.JSONObject.quote(name)})", null
                        )
                    }
                    continue
                }
                lastDirectUris[name] = uri
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.__bgmUploading && window.__bgmUploading(${org.json.JSONObject.quote(name)})", null
                    )
                }
                uploadDirectUri(uri, name)
            }
            runOnUiThread {
                webView.evaluateJavascript(
                    "window.__bgmImportDone && window.__bgmImportDone()", null
                )
            }
        }.start()
    }

    /** 流式上传 content:// URI 到云端曲库，不落本地曲库 */
    private fun uploadDirectUri(uri: Uri, name: String) {
        val token = BuildConfig.GITLAB_TOKEN
        var tmp: File? = null
        try {
            var size = contentResolver.query(
                uri, arrayOf(OpenableColumns.SIZE), null, null, null
            )?.use { c -> if (c.moveToFirst()) c.getLong(0) else -1L } ?: -1L
            // 拿不到大小就先落临时文件
            if (size < 0) {
                val t = File(cacheDir, "upl-${System.currentTimeMillis()}")
                contentResolver.openInputStream(uri)?.use { input ->
                    t.outputStream().use { input.copyTo(it) }
                } ?: throw Exception("读不到文件")
                tmp = t
                size = t.length()
            }
            if (size > 100L * 1024 * 1024) throw Exception("文件太大（>100MB），云端传不了")
            val encPath = URLEncoder.encode("playground/music/$name", "UTF-8")
            val url = "https://gitlab.com/api/v4/projects/moonnancy881-dotcom%2Fmyprojects" +
                "/repository/files/$encPath"
            val commitMsg = "music: upload $name via app"
            val open: () -> InputStream = {
                val t = tmp
                if (t != null) t.inputStream()
                else contentResolver.openInputStream(uri) ?: throw Exception("读不到文件")
            }
            var res = httpUpload(url, "POST", open, size, commitMsg, token)
            if (res.first == 400 || res.first == 409) {
                res = httpUpload(url, "PUT", open, size, commitMsg, token)   // 已存在则覆盖
            }
            tmp?.delete()
            if (res.first !in 200..299) throw Exception("HTTP ${res.first} ${res.second}")
            runOnUiThread {
                webView.evaluateJavascript(
                    "window.__bgmUploaded && window.__bgmUploaded(${org.json.JSONObject.quote(name)})", null
                )
            }
        } catch (e: Exception) {
            tmp?.delete()
            runOnUiThread {
                webView.evaluateJavascript(
                    "window.__bgmUploadError && window.__bgmUploadError(${org.json.JSONObject.quote(name)},${org.json.JSONObject.quote(e.message ?: "上传失败")})", null
                )
            }
        }
    }

    // JSON body 里的 base64 内容边读边编码直接写进连接，整首歌不进内存（防 OOM）
    private fun httpUpload(url: String, method: String, open: () -> InputStream, size: Long, commitMsg: String, token: String): Pair<Int, String> {
        if (token.isEmpty()) return -1 to "no token"
        val head = "{\"branch\":\"main\",\"encoding\":\"base64\",\"commit_message\":" +
            org.json.JSONObject.quote(commitMsg) + ",\"content\":\""
        val b64len = (size + 2) / 3 * 4   // NO_WRAP: 4*ceil(n/3)
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 10000
        conn.readTimeout = 60000
        conn.doOutput = true
        conn.setFixedLengthStreamingMode(head.toByteArray().size + b64len + 2)
        conn.setRequestProperty("PRIVATE-TOKEN", token)
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { raw ->
            raw.write(head.toByteArray())
            // 块大小取 3 的倍数，每段独立编码无缝拼接，只有最后一段可能带 = 补齐
            val buf = ByteArray(3 * 512 * 1024)
            open().use { fis ->
                while (true) {
                    var off = 0
                    while (off < buf.size) {
                        val n = fis.read(buf, off, buf.size - off)
                        if (n <= 0) break
                        off += n
                    }
                    if (off == 0) break
                    raw.write(android.util.Base64.encode(buf, 0, off, android.util.Base64.NO_WRAP))
                    if (off < buf.size) break   // 文件尾
                }
            }
            raw.write("\"}".toByteArray())   // 闭合 content 字符串 + JSON 对象
        }
        val code = conn.responseCode
        val err = if (code >= 400) {
            try {
                conn.errorStream?.bufferedReader()?.readText()?.take(120) ?: ""
            } catch (_: Exception) { "" }
        } else ""
        return code to err
    }

    private fun httpGet(url: String): String? {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 10000
        conn.readTimeout = 10000
        return try {
            if (conn.responseCode != 200) return null
            conn.inputStream.bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            null
        }
    }

    // ---- 意见反馈：GitLab issue 当留言板 ----
    // 每台设备一个持久 ID；每条反馈 = 一条标题含 ID 的 issue（confidential），
    // 维护者在 issue 下评论即回复，app 按自己建过的 issue 拉评论。
    private val fbPrefs get() = getSharedPreferences("feedback", MODE_PRIVATE)

    private fun fbDeviceId(): String {
        var id = fbPrefs.getString("id", null)
        if (id == null) {
            id = try {
                android.provider.Settings.Secure.getString(
                    contentResolver, android.provider.Settings.Secure.ANDROID_ID
                )?.take(8)
            } catch (e: Exception) { null }
            if (id.isNullOrEmpty()) id = java.util.UUID.randomUUID().toString().take(8)
            fbPrefs.edit().putString("id", id).apply()
        }
        return id
    }

    private fun fbIssues(): org.json.JSONArray =
        try { org.json.JSONArray(fbPrefs.getString("issues", "[]")) } catch (e: Exception) { org.json.JSONArray() }

    /** 带 token 的 GitLab API 调用，返回 (httpCode, body) */
    private fun fbApi(path: String, method: String = "GET", body: String? = null): Pair<Int, String> {
        val conn = URL(
            "https://gitlab.com/api/v4/projects/moonnancy881-dotcom%2Fmyprojects$path"
        ).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 10000
        conn.readTimeout = 15000
        conn.setRequestProperty("PRIVATE-TOKEN", BuildConfig.GITLAB_TOKEN)
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = conn.responseCode
        val txt = try {
            (if (code < 400) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.readText() ?: ""
        } catch (e: Exception) { "" }
        return code to txt
    }

    // ---- 装机登记：仓库一条 confidential issue，每台设备一条 note ----
    private val regIid = 5

    /** IP 反查城市（免费接口，失败返回空串） */
    private fun ipCity(): String {
        try {
            val t = httpGet("https://ipwho.is/") ?: return ""
            val j = org.json.JSONObject(t)
            if (!j.optBoolean("success")) return ""
            return listOf(j.optString("region"), j.optString("city"))
                .filter { it.isNotEmpty() }.distinct().joinToString("·")
        } catch (e: Exception) { return "" }
    }

    private fun regNoteBody(city: String): String {
        val model = (Build.MANUFACTURER + " " + Build.MODEL).trim()
        val t = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US)
            .format(java.util.Date())
        return "📱 id=" + fbDeviceId() + " | " + model +
            " | v" + BuildConfig.VERSION_NAME +
            (if (city.isEmpty()) "" else " | " + city) + " | " + t
    }

    /** 找本机在登记 issue 下的所有 note id；拉取失败返回 null（本次跳过，避免误 POST 重复） */
    private fun regFindNotes(): List<Long>? {
        return try {
            val (code, body) = fbApi("/issues/$regIid/notes?per_page=100")
            if (code != 200) return null
            val arr = org.json.JSONArray(body)
            val ids = mutableListOf<Long>()
            for (i in 0 until arr.length()) {
                val n = arr.getJSONObject(i)
                if (!n.optBoolean("system") &&
                    n.optString("body").startsWith("📱 id=" + fbDeviceId() + " |")
                ) ids.add(n.getLong("id"))   // GitLab note id 超 21 亿，必须按 Long 取
            }
            ids
        } catch (e: Exception) { null }
    }

    /** 读取存储的登记 note id；旧版按 Int 存溢出成负值，自动清掉重查 */
    private fun regNoteId(): Long {
        return try {
            val v = fbPrefs.getLong("reg_note_id", 0L)
            if (v <= 0) { fbPrefs.edit().remove("reg_note_id").apply(); 0L } else v
        } catch (e: Exception) {
            fbPrefs.edit().remove("reg_note_id").apply(); 0L
        }
    }

    /** 启动登记/更新一条 note：未登记、版本变了、或上次没拿到城市都回写 */
    private fun devRegister(sync: Boolean = false) {
        if (BuildConfig.GITLAB_TOKEN.isEmpty()) return
        val ver = BuildConfig.VERSION_NAME
        val verKey = ver + "/" + BuildConfig.VERSION_CODE   // 版本名可能复用，判重按 code
        val need = !fbPrefs.getBoolean("reg_done", false)
            || fbPrefs.getString("reg_ver", "") != verKey
            || fbPrefs.getString("reg_city", null) == null
        if (!need && !sync) return
        var ok = false
        var city = ""
        // 埋点放在最前：BuildConfig 是常量不抛异常，prefs 读取可能炸所以进 try
        val diag = StringBuilder("|code:").append(BuildConfig.VERSION_CODE)
        try {
            val nid0 = regNoteId()
            diag.append("|nid:").append(nid0)
                .append("|tryv:").append(fbPrefs.getString("reg_try_ver", "-"))
            city = ipCity()
            val body = regNoteBody(city)
            var noteId = nid0
            if (noteId > 0L) {   // 已记住服务端记录，直接更新
                val (code, _) = fbApi(
                    "/issues/$regIid/notes/$noteId", "PUT",
                    org.json.JSONObject().apply { put("body", body) }.toString()
                )
                ok = code in 200..299
                diag.append("put-stored:").append(code)
                if (!ok) {   // 404 或其他失败都走查找/补写路径，pref 保留下次再试
                    noteId = 0L
                    if (code == 404) fbPrefs.edit().remove("reg_note_id").apply()
                }
            }
            if (!ok && noteId == 0L) {
                val noteIds = regFindNotes()
                diag.append("|get:").append(noteIds?.size?.toString() ?: "exc")
                if (noteIds == null && fbPrefs.getString("reg_try_ver", "") == verKey) {
                    diag.append("|skip")
                } else if (noteIds != null && noteIds.isNotEmpty()) {
                    val (code, _) = fbApi(
                        "/issues/$regIid/notes/${noteIds[0]}", "PUT",
                        org.json.JSONObject().apply { put("body", body) }.toString()
                    )
                    ok = code in 200..299
                    diag.append("|put:").append(code)
                    if (ok) {
                        fbPrefs.edit().putLong("reg_note_id", noteIds[0]).apply()
                        if (noteIds.size > 1) {
                            for (dup in noteIds.drop(1)) {
                                fbApi("/issues/$regIid/notes/$dup", "DELETE")
                            }
                        }
                    } else {
                        // PUT 可能被网络拦（404）：改 POST 新记录，再尽力删旧
                        val (pcode, presp) = fbApi(
                            "/issues/$regIid/notes", "POST",
                            org.json.JSONObject().apply { put("body", body) }.toString()
                        )
                        ok = pcode in 200..299
                        diag.append("|post2:").append(pcode)
                        if (ok) {
                            try {
                                fbPrefs.edit()
                                    .putLong("reg_note_id", org.json.JSONObject(presp).getLong("id"))
                                    .apply()
                            } catch (e: Exception) {}
                            for (old in noteIds) {
                                fbApi("/issues/$regIid/notes/$old", "DELETE")
                            }
                        }
                    }
                } else {
                    // 查旧记录失败时兜底新写，写成功才记 reg_try_ver 防止同版本重复补写
                    val (code, resp) = fbApi(
                        "/issues/$regIid/notes", "POST",
                        org.json.JSONObject().apply { put("body", body) }.toString()
                    )
                    ok = code in 200..299
                    diag.append("|post:").append(code)
                    if (ok) {
                        fbPrefs.edit().putString("reg_try_ver", verKey).apply()
                        try {
                            fbPrefs.edit()
                                .putLong("reg_note_id", org.json.JSONObject(resp).getLong("id"))
                                .apply()
                        } catch (e: Exception) {}
                    }
                }
            }
        } catch (e: Exception) {
            diag.append("|exc:").append(e.javaClass.simpleName)
        }
        if (!ok && fbPrefs.getString("reg_diag_ver", "") != verKey) {
            // 登记失败：发一条诊断 note，帮助定位死在哪一步（每版本最多一条）
            try {
                val d = fbApi(
                    "/issues/$regIid/notes", "POST",
                    org.json.JSONObject().apply {
                        put("body", "🩺 id=" + fbDeviceId() + " | v" + ver +
                            " | diag: " + diag.toString())
                    }.toString()
                )
                if (d.first in 200..299)
                    fbPrefs.edit().putString("reg_diag_ver", verKey).apply()
            } catch (e: Exception) {}
            return
        }
        if (ok) {
            val e = fbPrefs.edit()
                .putBoolean("reg_done", true)
                .putString("reg_ver", verKey)
            if (city.isNotEmpty()) e.putString("reg_city", city)   // 空则不存，下次启动再试
            e.apply()
        }
    }

    @SuppressLint("ObsoleteSdkInt")
    private fun doVibrate(ms: Long) {
        val v = if (Build.VERSION.SDK_INT >= 31) {
            (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(VIBRATOR_SERVICE) as Vibrator
        }
        if (Build.VERSION.SDK_INT >= 26) {
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(ms)
        }
    }

    private fun shareScoreText(text: String) {
        runOnUiThread {
            try {
                val bmp = Bitmap.createBitmap(
                    webView.width, webView.height, Bitmap.Config.ARGB_8888
                )
                // PixelCopy 抓真实屏幕像素（含 WebGL/视频层）；API<26 回退 draw
                if (Build.VERSION.SDK_INT >= 26) {
                    PixelCopy.request(window, bmp, { rc ->
                        if (rc != PixelCopy.SUCCESS) webView.draw(Canvas(bmp))
                        doShareImage(bmp, text)
                    }, Handler(Looper.getMainLooper()))
                } else {
                    webView.draw(Canvas(bmp))
                    doShareImage(bmp, text)
                }
            } catch (e: Exception) {
                Toast.makeText(this, "分享失败：${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun doShareImage(bmp: Bitmap, text: String) {
        try {
            val dir = File(cacheDir, "share").apply { mkdirs() }
            val f = File(dir, "score.png")
            FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 90, it) }
            val uri = FileProvider.getUriForFile(
                this, "$packageName.fileprovider", f
            )
            startActivity(Intent.createChooser(
                Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_TEXT, text)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                },
                "分享战绩"
            ))
        } catch (e: Exception) {
            Toast.makeText(this, "分享失败：${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private inner class Bridge {
        /** 合并方块等事件触发的短震动，单位毫秒 */
        @JavascriptInterface
        fun vibrate(ms: Long) = doVibrate(ms.coerceIn(1, 500))

        /** 分享战绩：WebView 截图 + 文案走系统分享 */
        @JavascriptInterface
        fun shareScore(text: String) = shareScoreText(text)

        /** 页面请求屏幕方向："landscape" 横屏，其余恢复跟随系统 */
        @JavascriptInterface
        fun orientation(mode: String?) {
            runOnUiThread {
                requestedOrientation = if (mode == "landscape")
                    ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
                else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            }
        }

        @JavascriptInterface
        fun themeGet(): String =
            getSharedPreferences("appearance", MODE_PRIVATE).getString("theme", "") ?: ""

        @JavascriptInterface
        @SuppressLint("ApplySharedPref")
        fun themeSet(theme: String) {
            if (theme !in setOf("light", "dark", "warm")) return
            getSharedPreferences("appearance", MODE_PRIVATE).edit().putString("theme", theme).commit()
        }

        /** BGM：用户导入的优先取 filesDir/bgm/，否则取 assets/music/；null/空串停止。
         *  ExoPlayer 自动处理音频焦点（来电/他 app 发声暂停或压低）与拔耳机暂停。
         *  桥接口跑在 JavaBridge 线程，ExoPlayer 必须在主线程创建和访问，否则抛
         *  "Player is accessed on the wrong thread" 直接闪退。 */
        @JavascriptInterface
        fun bgmSet(file: String?) {
            runOnUiThread {
                if (file.isNullOrEmpty()) { stopBgm(); return@runOnUiThread }
                if (file == bgmFile) { bgmPlayer?.play(); return@runOnUiThread }
                bgmFile = file
                try {
                    val userFile = File(userBgmDir, file)
                    val uri = if (userFile.isFile) {
                        Uri.fromFile(userFile)
                    } else {
                        Uri.parse("asset:///music/$file")
                    }
                    val player = buildPlayer()
                    player.addListener(object : Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            bgmPlaying = isPlaying
                        }
                        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                            val tag = mediaItem?.mediaId ?: return
                            bgmFile = tag
                            webView.evaluateJavascript(
                                "window.__bgmTrack && window.__bgmTrack(${org.json.JSONObject.quote(tag)})", null
                            )
                        }
                        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                            Toast.makeText(this@MainActivity, "无法播放 $file", Toast.LENGTH_SHORT).show()
                        }
                    })
                    player.setMediaItem(MediaItem.fromUri(uri))
                    player.repeatMode = Player.REPEAT_MODE_ONE
                    player.volume = 0f
                    player.prepare()
                    player.play()
                    // 旧歌淡出 + 新歌淡入（叠加期并存）
                    bgmPlayer?.let { old ->
                        fadeVolume(old, 0f, 400) { old.release() }
                    }
                    bgmPlayer = player
                    fadeVolume(player, 1f, 500)
                    Toast.makeText(this@MainActivity, "♪ 播放：$file", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    bgmPlayer = null
                    bgmFile = null
                    Toast.makeText(this@MainActivity, "无法播放 $file", Toast.LENGTH_SHORT).show()
                }
            }
        }

        /** 播放歌单：{"files":[...],"cur":"name","mode":0|1|2}  mode=单曲循环/列表循环/随机 */
        @JavascriptInterface
        fun bgmPlay(json: String?) {
            runOnUiThread {
                if (json.isNullOrEmpty()) { stopBgm(); return@runOnUiThread }
                try {
                    val obj = org.json.JSONObject(json)
                    val arr = obj.getJSONArray("files")
                    val cur = obj.getString("cur")
                    val mode = obj.getInt("mode")
                    val vol = obj.optDouble("vol", 1.0).toFloat().coerceIn(0f, 1f)
                    val files = (0 until arr.length()).map { arr.getString(it) }
                    val items = files.map { name ->
                        val userFile = File(userBgmDir, name)
                        val uri = if (userFile.isFile) {
                            Uri.fromFile(userFile)
                        } else {
                            Uri.parse("asset:///music/$name")
                        }
                        MediaItem.Builder().setUri(uri).setMediaId(name).build()
                    }
                    val idx = files.indexOf(cur).coerceAtLeast(0)
                    val player = buildPlayer()
                    player.addListener(object : Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            bgmPlaying = isPlaying
                        }
                        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                            val tag = mediaItem?.mediaId ?: return
                            bgmFile = tag
                            webView.evaluateJavascript(
                                "window.__bgmTrack && window.__bgmTrack(${org.json.JSONObject.quote(tag)})", null
                            )
                        }
                        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                            Toast.makeText(this@MainActivity, "无法播放 $cur", Toast.LENGTH_SHORT).show()
                        }
                    })
                    player.setMediaItems(items, idx, 0L)
                    applyPlayMode(player, mode)
                    player.volume = 0f
                    player.prepare()
                    player.play()
                    bgmPlayer?.let { old -> fadeVolume(old, 0f, 400) { old.release() } }
                    bgmPlayer = player
                    bgmFile = cur
                    fadeVolume(player, vol, 500)
                    Toast.makeText(this@MainActivity, "♪ 播放：$cur", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "无法播放", Toast.LENGTH_SHORT).show()
                }
            }
        }

        /** 热切换播放模式（不重建队列、不打断当前曲目） */
        @JavascriptInterface
        fun bgmSetMode(mode: Int) {
            runOnUiThread { bgmPlayer?.let { applyPlayMode(it, mode) } }
        }

        /** 全局音量滑条实时调 BGM 音量（0..1）。 */
        @JavascriptInterface
        fun bgmVolume(v: Float) {
            runOnUiThread { bgmPlayer?.volume = v.coerceIn(0f, 1f) }
        }

        /** 云端曲库：GitLab 仓库 playground/music/ 下的音频文件名列表（JSON 数组字符串） */
        @JavascriptInterface
        fun bgmCloudList(): String {
            val api = "https://gitlab.com/api/v4/projects/moonnancy881-dotcom%2Fmyprojects" +
                "/repository/tree?path=playground/music&per_page=100"
            return try {
                val body = httpGet(api) ?: return "{\"err\":\"网络错误\"}"
                val arr = org.json.JSONArray(body)
                val names = org.json.JSONArray()
                val re = Regex("(?i)\\.(mp3|m4a|ogg|wav|flac)$")
                for (i in 0 until arr.length()) {
                    val n = arr.getJSONObject(i).getString("name")
                    if (re.containsMatchIn(n)) names.put(n)
                }
                "{\"tracks\":$names}"
            } catch (e: Exception) {
                "{\"err\":${org.json.JSONObject.quote(e.message ?: "读取失败")}}"
            }
        }

        /** 下载云端曲目到本地「我的音乐」，完成后回调 __bgmDownloaded/__bgmDownloadError */
        @JavascriptInterface
        fun bgmDownload(name: String) {
            Thread {
                try {
                    val enc = URLEncoder.encode(name, "UTF-8").replace("+", "%20")
                    val url = "https://gitlab.com/moonnancy881-dotcom/myprojects/-/raw/main/playground/music/$enc"
                    val conn = URL(url).openConnection() as HttpURLConnection
                    conn.connectTimeout = 10000
                    conn.readTimeout = 30000
                    if (conn.responseCode != 200) throw Exception("HTTP ${conn.responseCode}")
                    val dest = File(userBgmDir, name)
                    val part = File(userBgmDir, "$name.part")
                    try {
                        conn.inputStream.use { input ->
                            FileOutputStream(part).use { out -> input.copyTo(out) }
                        }
                        if (!part.renameTo(dest)) part.copyTo(dest, true).also { part.delete() }
                    } catch (e: Exception) {
                        part.delete()
                        throw e
                    }
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "window.__bgmDownloaded && window.__bgmDownloaded(${org.json.JSONObject.quote(name)})", null
                        )
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "window.__bgmDownloadError && window.__bgmDownloadError(${org.json.JSONObject.quote(name)})", null
                        )
                    }
                }
            }.start()
        }

        /** 是否有构建时注入的上传 token */
        @JavascriptInterface
        fun hasUploadToken(): Boolean = BuildConfig.GITLAB_TOKEN.isNotEmpty()

        /** 上传「我的音乐」曲目到云端曲库（GitLab files API），回调 __bgmUploaded/__bgmUploadError */
        @JavascriptInterface
        fun bgmUpload(name: String) {
            val token = BuildConfig.GITLAB_TOKEN
            Thread {
                try {
                    val file = File(userBgmDir, name)
                    if (!file.isFile) throw Exception("本地没有这首歌")
                    if (file.length() > 100L * 1024 * 1024) throw Exception("文件太大（>100MB），云端传不了")
                    val encPath = URLEncoder.encode("playground/music/$name", "UTF-8")
                    val url = "https://gitlab.com/api/v4/projects/moonnancy881-dotcom%2Fmyprojects" +
                        "/repository/files/$encPath"
                    val commitMsg = "music: upload $name via app"
                    val open: () -> InputStream = { file.inputStream() }
                    var res = httpUpload(url, "POST", open, file.length(), commitMsg, token)
                    if (res.first == 400 || res.first == 409) {
                        res = httpUpload(url, "PUT", open, file.length(), commitMsg, token)   // 已存在则覆盖
                    }
                    if (res.first !in 200..299) throw Exception("HTTP ${res.first} ${res.second}")
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "window.__bgmUploaded && window.__bgmUploaded(${org.json.JSONObject.quote(name)})", null
                        )
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "window.__bgmUploadError && window.__bgmUploadError(${org.json.JSONObject.quote(name)},${org.json.JSONObject.quote(e.message ?: "上传失败")})", null
                        )
                    }
                }
            }.start()
        }

        /** 音效配置（JSON）：软件处理器，任何机型全支持，无需探测 */
        @JavascriptInterface
        fun audioFxConfig(): String {
            val presets = fxProcessor.presetNames.joinToString(",") { org.json.JSONObject.quote(it) }
            return "{" +
                "\"playing\":$bgmPlaying," +
                "\"err\":null," +
                "\"presets\":[$presets]," +
                "\"preset\":${fxPrefs.getInt("preset", 0).coerceIn(0, fxProcessor.presetNames.size - 1)}," +
                "\"bass\":${fxPrefs.getInt("bass", 0)}," +
                "\"virt\":${fxPrefs.getBoolean("virt", false)}," +
                "\"loud\":${fxPrefs.getBoolean("loud", false)}," +
                "\"supported\":{\"eq\":true,\"bass\":true,\"virt\":true,\"loud\":true}" +
                "}"
        }

        @JavascriptInterface
        fun audioSetPreset(idx: Int) {
            fxPrefs.edit().putInt("preset", idx).apply()
            runOnUiThread { applyFx() }
        }

        @JavascriptInterface
        fun audioSetBass(strength: Int) {
            fxPrefs.edit().putInt("bass", strength.coerceIn(0, 1000)).apply()
            runOnUiThread { applyFx() }
        }

        @JavascriptInterface
        fun audioSetVirtualizer(on: Boolean) {
            fxPrefs.edit().putBoolean("virt", on).apply()
            runOnUiThread { applyFx() }
        }

        @JavascriptInterface
        fun audioSetLoudness(on: Boolean) {
            fxPrefs.edit().putBoolean("loud", on).apply()
            runOnUiThread { applyFx() }
        }

        @JavascriptInterface
        fun bgmStop() = runOnUiThread { stopBgm() }

        @JavascriptInterface
        fun bgmState(): String = bgmFile ?: ""

        /** 用户已导入的 BGM 文件名列表（JSON 数组字符串） */
        @JavascriptInterface
        fun bgmList(): String {
            val names = userBgmDir.listFiles()
                ?.filter { it.isFile }
                ?.sortedBy { it.name }
                ?.joinToString(",") { org.json.JSONObject.quote(it.name) } ?: ""
            return "[$names]"
        }

        /** 手动检查更新：弹原生对话框提示结果 */
        @JavascriptInterface
        fun checkUpdate() {
            runOnUiThread {
                Toast.makeText(this@MainActivity, "正在检查更新…", Toast.LENGTH_SHORT).show()
            }
            scope.launch { Updater.check(this@MainActivity, manual = true) }
        }

        /** 已下载完成的更新包版本号，无则空串（设置页显示安装/删除按钮用） */
        @JavascriptInterface
        fun updateReady(): String =
            Updater.cachedVersionCode(this@MainActivity)?.toString() ?: ""

        /** 直接安装已下载完成的更新包 */
        @JavascriptInterface
        fun installDownloadedUpdate() {
            runOnUiThread {
                if (!Updater.installCached(this@MainActivity))
                    Toast.makeText(this@MainActivity, "没有已下载的更新包", Toast.LENGTH_SHORT).show()
            }
        }

        /** 已下载更新包占用（如 "18.3 MB"），无缓存返回空串 */
        @JavascriptInterface
        fun updateCacheSize(): String {
            val bytes = cacheDir.listFiles()
                ?.filter { it.name.startsWith("update-") }
                ?.sumOf { it.length() } ?: 0
            return if (bytes <= 0) "" else "%.1f MB".format(bytes / 1024.0 / 1024.0)
        }

        /** 清掉已下载的更新包，同时取消待安装状态 */
        @JavascriptInterface
        fun clearUpdateCache() {
            var bytes = 0L
            cacheDir.listFiles()?.filter { it.name.startsWith("update-") }?.forEach {
                bytes += it.length()
                it.delete()
            }
            Updater.clearPending()
            runOnUiThread {
                Toast.makeText(
                    this@MainActivity,
                    if (bytes > 0) "已清理 %.1f MB".format(bytes / 1024.0 / 1024.0)
                    else "没有可清理的更新缓存",
                    Toast.LENGTH_SHORT,
                ).show()
            }
        }

        /** 静默探测新版本，结果回传 window.__updatePeek(json) */
        @JavascriptInterface
        fun peekUpdate() {
            scope.launch {
                val rel = Updater.peek()
                val json = if (rel != null && rel.versionCode > BuildConfig.VERSION_CODE) {
                    """{"versionCode":${rel.versionCode},"versionName":${
                        org.json.JSONObject.quote(rel.versionName)
                    },"notes":${org.json.JSONObject.quote(rel.notes)}}"""
                } else "null"
                webView.evaluateJavascript(
                    "window.__updatePeek && window.__updatePeek($json)", null
                )
            }
        }

        /** "1.0 (1)" 形式的版本号 */
        @JavascriptInterface
        fun appVersion(): String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

        /** 打包进 assets 的更新日志 */
        @JavascriptInterface
        fun changelog(): String = try {
            assets.open("changelog.md").bufferedReader().readText()
        } catch (e: Exception) { "" }

        /** 设备标识（反馈用），8 位持久 ID */
        @JavascriptInterface
        fun fbId(): String = fbDeviceId()

        /** 提交反馈：开一条 confidential issue，回调 __fbResult(ok, msg) */
        @JavascriptInterface
        fun fbSubmit(nick: String, text: String) {
            Thread {
                val msg = try {
                    if (BuildConfig.GITLAB_TOKEN.isEmpty()) throw Exception("反馈通道未配置")
                    val t = text.trim()
                    if (t.isEmpty()) throw Exception("先写点内容再提交")
                    if (t.length > 2000) throw Exception("太长了（限 2000 字）")
                    val last = fbPrefs.getLong("lastAt", 0)
                    if (System.currentTimeMillis() - last < 60_000)
                        throw Exception("刚发过，歇一分钟再提")
                    val n = nick.trim().take(20)
                    val title = ("[反馈] " + fbDeviceId() + if (n.isEmpty()) "" else " $n").trim()
                    val body = org.json.JSONObject().apply {
                        put("title", title)
                        put("description", t)
                        put("confidential", true)
                        put("labels", "feedback")
                    }
                    val (code, resp) = fbApi("/issues", "POST", body.toString())
                    if (code !in 200..299) throw Exception("提交失败 HTTP $code")
                    val iid = org.json.JSONObject(resp).getInt("iid")
                    val arr = fbIssues()
                    arr.put(org.json.JSONObject().apply {
                        put("iid", iid); put("text", t)
                        put("at", System.currentTimeMillis())
                    })
                    fbPrefs.edit()
                        .putString("issues", arr.toString())
                        .putLong("lastAt", System.currentTimeMillis()).apply()
                    devRegister(sync = true)
                    "ok"
                } catch (e: Exception) { e.message ?: "提交失败" }
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.__fbResult && window.__fbResult(${msg == "ok"},${org.json.JSONObject.quote(msg)})", null
                    )
                }
            }.start()
        }

        /** 在自己已提交的那条反馈下追评（用户回复），回调 __fbResult(ok, msg) */
        @JavascriptInterface
        fun fbReply(iid: Int, text: String) {
            Thread {
                val msg = try {
                    if (BuildConfig.GITLAB_TOKEN.isEmpty()) throw Exception("反馈通道未配置")
                    val t = text.trim()
                    if (t.isEmpty()) throw Exception("先写点内容再提交")
                    if (t.length > 2000) throw Exception("太长了（限 2000 字）")
                    var found = false
                    val mine = fbIssues()
                    for (i in 0 until mine.length()) if (mine.getJSONObject(i).getInt("iid") == iid) found = true
                    if (!found) throw Exception("这条反馈不存在")
                    val body = org.json.JSONObject().apply { put("body", "[用户] $t") }
                    val (code, _) = fbApi("/issues/$iid/notes", "POST", body.toString())
                    if (code !in 200..299) throw Exception("发送失败 HTTP $code")
                    "ok"
                } catch (e: Exception) { e.message ?: "发送失败" }
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.__fbResult && window.__fbResult(${msg == "ok"},${org.json.JSONObject.quote(msg)})", null
                    )
                }
            }.start()
        }

        /** 拉取我提过的反馈及回复，回调 __fbData(json 数组)；mine=true 是用户自己追评的 */
        @JavascriptInterface
        fun fbSync() {
            Thread {
                val json = try {
                    val res = org.json.JSONArray()
                    val mine = fbIssues()
                    for (i in 0 until mine.length()) {
                        val it = mine.getJSONObject(i)
                        val iid = it.getInt("iid")
                        val replies = org.json.JSONArray()
                        val (code, nb) = fbApi("/issues/$iid/notes?sort=asc&per_page=100")
                        if (code == 200) {
                            val notes = org.json.JSONArray(nb)
                            for (j in 0 until notes.length()) {
                                val n = notes.getJSONObject(j)
                                if (n.optBoolean("system")) continue
                                var b = n.getString("body")
                                val self = b.startsWith("[用户] ")
                                if (self) b = b.removePrefix("[用户] ")
                                replies.put(
                                    org.json.JSONObject().apply {
                                        put("body", b)
                                        put("at", n.getString("created_at"))
                                        put("by", if (self) "我" else n.getJSONObject("author").optString("name"))
                                        put("mine", self)
                                    }
                                )
                            }
                        }
                        res.put(org.json.JSONObject().apply {
                            put("iid", iid); put("text", it.getString("text"))
                            put("at", it.getLong("at")); put("replies", replies)
                        })
                    }
                    res.toString()
                } catch (e: Exception) { "[]" }
                runOnUiThread {
                    webView.evaluateJavascript("window.__fbData && window.__fbData($json)", null)
                }
            }.start()
        }

        /** 删除用户导入的 BGM 文件；正在播会先停 */
        @JavascriptInterface
        fun bgmDelete(name: String) {
            runOnUiThread {
                if (name == bgmFile) stopBgm()
                val ok = File(userBgmDir, name).delete()
                Toast.makeText(
                    this@MainActivity,
                    if (ok) "已删除 $name" else "删除失败", Toast.LENGTH_SHORT
                ).show()
                webView.evaluateJavascript(
                    "window.__bgmDeleted && window.__bgmDeleted(${org.json.JSONObject.quote(name)})", null
                )
            }
        }

        /** 打开系统文件选择器选音频导入（可多选） */
        @JavascriptInterface
        fun bgmImport() {
            runOnUiThread {
                startActivityForResult(
                    Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "audio/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    },
                    REQ_BGM
                )
            }
        }

        /** 打开系统文件选择器（可多选），选中文件仅传云端、不导入本地。
         *  cloudJson: JS 侧传入的云端曲目名数组，用于跳过已在云端的同名歌 */
        @JavascriptInterface
        fun bgmImportDirect(cloudJson: String) {
            pendingDirectCloud = try {
                val a = org.json.JSONArray(cloudJson)
                (0 until a.length()).map { a.getString(it) }
            } catch (e: Exception) { emptyList() }
            runOnUiThread {
                startActivityForResult(
                    Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "audio/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    },
                    REQ_BGM_DIRECT
                )
            }
        }

        /** 重试仅传云端的某首（URI 记在本批选择里） */
        @JavascriptInterface
        fun bgmUploadDirect(name: String) {
            val uri = lastDirectUris[name]
            if (uri == null) {
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.__bgmUploadError && window.__bgmUploadError(${org.json.JSONObject.quote(name)},${org.json.JSONObject.quote("请重新选择文件")})", null
                    )
                }
                return
            }
            Thread { uploadDirectUri(uri, name) }.start()
        }
    }

    companion object {
        private const val LAUNCHER_URL = "https://appassets.androidplatform.net/assets/index.html"
        private const val REQ_BGM = 42
        private const val REQ_BGM_DIRECT = 43
    }
}
