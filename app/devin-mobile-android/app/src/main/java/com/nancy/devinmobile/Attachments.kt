package com.nancy.devinmobile

import android.content.Intent
import android.util.LruCache
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import coil.load
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder

/**
 * Devin 附件 URL（app.devin.ai/attachments/<uuid>/<name>）→ S3 预签名 URL。
 * 与 wecom-bridge 同机制：v3 端点（cog_ PAT）/v1 端点（apk_ key）+ Bearer → 307 Location。
 */
object Attachments {

    private val ATTACH_RE = Regex(
        "https://app\\.devin\\.ai/attachments/[0-9a-f-]+/[^\\s\"')\\]]+",
        RegexOption.IGNORE_CASE)

    private val IMG_EXT = listOf(".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg")
    private val VID_EXT = listOf(".mp4", ".webm", ".mov", ".m4v", ".mkv")
    private val AUD_EXT = listOf(".mp3", ".m4a", ".aac", ".ogg", ".wav", ".flac", ".opus")

    /** s3 url -> 过期时间(ms)。S3 预签名 URL 有有效期，过期必须重新解析。 */
    private val cache = LruCache<String, Pair<String, Long>>(64)

    /** 视频首帧缓存：滚动重绑不再重复联网抓帧；失败也记 5 分钟，防止每次重绑都重新抓。 */
    private val frameCache = LruCache<String, android.graphics.Bitmap>(32)
    private val frameFail = LruCache<String, Long>(32)

    /** 从 X-Amz-Date + X-Amz-Expires 算过期时间；解析不出兜底 4 分钟。 */
    private fun expiryOf(s3: String): Long {
        val d = Regex("X-Amz-Date=(\\d{8}T\\d{6})Z").find(s3)?.groupValues?.get(1)
        val e = Regex("X-Amz-Expires=(\\d+)").find(s3)?.groupValues?.get(1)?.toLongOrNull()
        if (d != null && e != null) {
            return try {
                java.text.SimpleDateFormat("yyyyMMdd'T'HHmmss", java.util.Locale.US).apply {
                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                }.parse(d)!!.time + e * 1000 - 30_000
            } catch (ex: Exception) { System.currentTimeMillis() + 240_000 }
        }
        return System.currentTimeMillis() + 240_000
    }

    fun urlsIn(text: String): List<String> =
        ATTACH_RE.findAll(text).map { it.value.substringBefore('#') }.toList()

    /** Devin 消息里的附件占位，实际有 JSON 数组/对象和裸引号 URL 三种形态：
     *  ATTACHMENT:[{...}] · ATTACHMENT:{...} · ATTACHMENT:"https://…" */
    private val ATTACH_BLOCK_RE = Regex(
        "ATTACHMENT\\s*:\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\}|\"[^\"]*\")",
        RegexOption.IGNORE_CASE)

    /** 正文里抠掉附件占位块和已渲染的 URL，剩余文本为空串则调用方隐藏 TextView。 */
    fun strip(text: String): String =
        ATTACH_RE.replace(ATTACH_BLOCK_RE.replace(text, " "), " ")
            .replace(Regex("[ \\t]+"), " ")
            .replace(Regex(" ?\\n ?"), "\n").trim()

    fun isImage(url: String) = IMG_EXT.any { url.lowercase().endsWith(it) }
    fun isVideo(url: String) = VID_EXT.any { url.lowercase().endsWith(it) }
    fun isAudio(url: String) = AUD_EXT.any { url.lowercase().endsWith(it) }

    fun fileName(url: String): String = try {
        URLDecoder.decode(url.substringAfterLast('/'), "UTF-8")
    } catch (e: Exception) { "附件" }

    /** 解析成可直接加载的 S3 URL；过期或失败返回 null 时重新解析。 */
    suspend fun resolve(prefs: Prefs, url: String): String? = withContext(Dispatchers.IO) {
        cache.get(url)?.let { (s3, exp) ->
            if (System.currentTimeMillis() < exp) return@withContext s3
            cache.remove(url)
        }
        val m = Regex("/attachments/([0-9a-f-]+)/([^?#\\s]+)").find(url) ?: return@withContext null
        val id = m.groupValues[1]
        val name = try { URLDecoder.decode(m.groupValues[2], "UTF-8") } catch (e: Exception) { m.groupValues[2] }
        val pat = prefs.pat
        val candidates = mutableListOf<Pair<String, String>>()
        if (pat.startsWith("cog_") && prefs.orgId.isNotEmpty())
            candidates += "https://api.devin.ai/v3/organizations/${prefs.orgId}/attachments/$id/$name" to pat
        if (prefs.apiKey.isNotEmpty())
            candidates += "https://api.devin.ai/v1/attachments/$id/$name" to prefs.apiKey
        if (pat.isNotEmpty() && pat !in candidates.map { it.second })
            candidates += "https://api.devin.ai/v1/attachments/$id/$name" to pat
        for ((endpoint, key) in candidates) {
            val loc = try { redirectLocation(endpoint, key) } catch (e: Exception) { null }
            if (loc != null) {
                cache.put(url, loc to expiryOf(loc))
                return@withContext loc
            }
        }
        null
    }

    private fun redirectLocation(endpoint: String, key: String): String? {
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            setRequestProperty("Authorization", "Bearer $key")
            connectTimeout = 15_000
            readTimeout = 15_000
        }
        try {
            val code = conn.responseCode
            if (code in 200..299) return endpoint // 直接就是内容
            if (code in listOf(301, 302, 303, 307, 308))
                return conn.getHeaderField("Location")
            return null
        } finally {
            conn.disconnect()
        }
    }

    private fun openImage(ctx: android.content.Context, url: String, prefs: Prefs,
                          scope: CoroutineScope) {
        scope.launch {
            // 行内缩略图已用 Coil 以下载（disk key=原 URL）——把 key 带过去，查看页直接命中磁盘缓存秒开
            val s3 = resolve(prefs, url) ?: return@launch
            try {
                ctx.startActivity(Intent(ctx, ImageViewActivity::class.java)
                    .putExtra("url", s3).putExtra("key", url))
            } catch (e: Exception) { }
        }
    }

    private fun playVideo(ctx: android.content.Context, url: String, prefs: Prefs,
                          scope: CoroutineScope) {
        scope.launch {
            // 优先喂本地缓存文件——行内已下过的进去秒播，不再联网重载
            val f = AudioPlayer.localFile(ctx, prefs, url)
            val s3 = if (f == null) resolve(prefs, url) else url
            if (s3 == null) return@launch
            try {
                ctx.startActivity(Intent(ctx, WebActivity::class.java)
                    .putExtra("url", s3).putExtra("video", true)
                    .apply { if (f != null) putExtra("local", f.absolutePath) })
            } catch (e: Exception) { }
        }
    }

    /** 远程视频抓首帧做预览；失败返回 null 走文件名行。 */
    private suspend fun videoFrame(s3: String): android.graphics.Bitmap? =
        withContext(Dispatchers.IO) {
            try {
                val r = android.media.MediaMetadataRetriever()
                r.setDataSource(s3, HashMap<String, String>())
                val f = r.getFrameAtTime(0)
                r.release()
                f
            } catch (e: Exception) { null }
        }

    private fun dp(ctx: android.content.Context, v: Int) =
        (v * ctx.resources.displayMetrics.density).toInt()

    /** 首帧 + 行内播放：居中 ▶/⏸ 控制钮、底部已播/总时长、右上角跳转外部播放器。 */
    private fun videoWrap(ctx: android.content.Context, frame: android.graphics.Bitmap,
                          u: String, prefs: Prefs, scope: CoroutineScope): View {
        val wrap = android.widget.FrameLayout(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(ctx, 4); bottomMargin = dp(ctx, 4) }
            tag = u
        }
        val vv = android.widget.VideoView(ctx).apply {
            visibility = View.GONE
        }
        val poster = ImageView(ctx).apply {
            adjustViewBounds = true
            maxHeight = dp(ctx, 142)
            maxWidth = dp(ctx, 160)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setImageBitmap(frame)
        }
        wrap.addView(vv); wrap.addView(poster)
        fun chip() = android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.OVAL
            setColor(android.graphics.Color.argb(0x88, 0, 0, 0))
        }
        val s = dp(ctx, 36)
        val play = ImageView(ctx).apply {
            tag = "play"
            setImageResource(R.drawable.ic_play)
            setColorFilter(android.graphics.Color.WHITE)
            background = chip()
            setPadding(dp(ctx, 8), dp(ctx, 8), dp(ctx, 8), dp(ctx, 8))
            layoutParams = android.widget.FrameLayout.LayoutParams(s, s).apply {
                gravity = android.view.Gravity.CENTER
            }
        }
        // 右上角小跳转钮：才打开原来的外部播放器
        val open = ImageView(ctx).apply {
            setImageResource(R.drawable.ic_open)
            setColorFilter(android.graphics.Color.WHITE)
            background = chip()
            setPadding(dp(ctx, 5), dp(ctx, 5), dp(ctx, 5), dp(ctx, 5))
            layoutParams = android.widget.FrameLayout.LayoutParams(
                dp(ctx, 26), dp(ctx, 26)).apply {
                gravity = android.view.Gravity.TOP or android.view.Gravity.END
                topMargin = dp(ctx, 4); rightMargin = dp(ctx, 4)
            }
        }
        val time = TextView(ctx).apply {
            textSize = 10f
            setTextColor(android.graphics.Color.WHITE)
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = dp(ctx, 6).toFloat()
                setColor(android.graphics.Color.argb(0x88, 0, 0, 0))
            }
            setPadding(dp(ctx, 5), dp(ctx, 1), dp(ctx, 5), dp(ctx, 1))
            layoutParams = android.widget.FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                gravity = android.view.Gravity.BOTTOM or android.view.Gravity.END
                bottomMargin = dp(ctx, 4); rightMargin = dp(ctx, 4)
            }
        }
        wrap.addView(play); wrap.addView(open); wrap.addView(time)
        open.setOnClickListener { v -> playVideo(v.context, u, prefs, scope) }

        var prepared = false
        var preparing = false
        fun refreshV() {
            play.setImageResource(if (vv.isPlaying) R.drawable.ic_pause
                else R.drawable.ic_play)
            val dur = if (prepared) vv.duration else AudioPlayer.cachedDuration(u)
            time.text = if (dur > 0)
                fmtMs(if (prepared) vv.currentPosition else 0, dur) else ""
        }
        fun resetUi() {
            prepared = false; preparing = false
            runCatching { vv.stopPlayback() }
            vv.visibility = View.GONE
            poster.visibility = View.VISIBLE
            refreshV()
        }
        fun vtick() = scope.launch {
            // detach/表面重建期间 vv 的播放器处于过渡态，getter 会抛——容错保活循环
            while (prepared) {
                runCatching { refreshV() }
                kotlinx.coroutines.delay(500)
            }
        }
        fun startVideo() {
            scope.launch {
                preparing = true
                time.text = "加载中…"
                val f = AudioPlayer.localFile(ctx, prefs, u)
                    ?: run { resetUi(); return@launch }
                if (wrap.tag != u || !wrap.isShown || !preparing) {
                    preparing = false; refreshV(); return@launch
                }
                vv.setOnPreparedListener {
                    prepared = true; preparing = false
                    poster.visibility = View.GONE
                    vv.start()
                    refreshV(); vtick()
                }
                vv.setOnCompletionListener {
                    prepared = false
                    poster.visibility = View.VISIBLE
                    vv.visibility = View.GONE
                    refreshV()
                }
                vv.setOnErrorListener { _, what, _ ->
                    if (what == -38) true else {
                        prepared = false; preparing = false
                        poster.visibility = View.VISIBLE
                        vv.visibility = View.GONE; refreshV(); true
                    }
                }
                // 视频画面跟首帧预览同尺寸（同源同宽高比不会变形）
                vv.layoutParams = android.widget.FrameLayout.LayoutParams(
                    poster.width, poster.height)
                vv.setVideoPath(f.absolutePath)
                vv.visibility = View.VISIBLE
            }
        }
        // 播放/暂停：中央钮或播画面点按；加载中再点=取消重试；滚动出屏即停并复位
        play.setOnClickListener {
            when {
                preparing -> resetUi()
                prepared -> { if (vv.isPlaying) vv.pause() else vv.start(); refreshV() }
                else -> startVideo()
            }
        }
        poster.setOnClickListener { if (!preparing && !prepared) startVideo() }
        vv.setOnClickListener {
            if (prepared) { if (vv.isPlaying) vv.pause() else vv.start(); refreshV() }
        }
        wrap.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                // 短暂 detach（流式事件触发的局部重排）后回来：恢复计时走字
                if (prepared) vtick()
            }
            override fun onViewDetachedFromWindow(v: View) {
                if (prepared || preparing) scope.launch {
                    // 局部重排的 detach 几毫秒内就回来——延迟判定，真的滚出屏/回收才停
                    kotlinx.coroutines.delay(600)
                    if (!v.isAttachedToWindow) resetUi()
                }
            }
        })
        // 预载：拿总时长显示在角标上，顺带把文件下到本地缓存，首点秒开
        scope.launch {
            val d = AudioPlayer.metaDuration(ctx, prefs, u)
            if (d > 0 && wrap.tag == u && !prepared) time.text = fmtMs(0, d)
        }
        return wrap
    }

    /** 消息文本里的附件 URL 渲染成媒体控件：图片内嵌、视频/文件为可点行。 */
    fun bind(container: LinearLayout, prefs: Prefs, text: String, scope: CoroutineScope) {
        val urls = urlsIn(text)
        // 同一组附件不重绑：滚动/rebind 反复触发 removeAllViews+重建是主要闪动源
        if (container.tag == urls) { container.visibility = if (urls.isEmpty()) View.GONE else View.VISIBLE; return }
        container.removeAllViews()
        container.tag = urls
        container.visibility = if (urls.isEmpty()) View.GONE else View.VISIBLE
        for (u in urls) {
            if (isImage(u)) {
                val iv = ImageView(container.context).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply { topMargin = dp(context, 4); bottomMargin = dp(context, 4) }
                    adjustViewBounds = true
                    maxHeight = dp(context, 214)
                    maxWidth = dp(context, 240)
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    tag = u
                }
                container.addView(iv)
                scope.launch {
                    val s3 = resolve(prefs, u)
                    // key 用附件原 URL 而非会过期的 S3：S3 刷新后字节缓存仍命中，不重下
                    if (s3 != null && iv.tag == u) iv.load(s3) {
                        memoryCacheKey(u); diskCacheKey(u)
                    }
                }
                // 点图全屏查看（ImageViewActivity 原生查看器可双指缩放）；顺带兜底重试加载失败的解析
                iv.setOnClickListener { v ->
                    val c = v.context
                    if (iv.drawable == null) scope.launch {
                        val s3 = resolve(prefs, u)
                        if (s3 != null && iv.tag == u) iv.load(s3) {
                            memoryCacheKey(u); diskCacheKey(u)
                        }
                    }
                    openImage(c, u, prefs, scope)
                }
            } else if (isVideo(u)) {
                // 视频：先显文件名行，解析后抓首帧当预览图；点击行内播放，仅右上角钮跳外部
                val tv = TextView(container.context).apply {
                    setText("▶ " + fileName(u))
                    textSize = 14f
                    setPadding(dp(context, 8), dp(context, 6), dp(context, 8), dp(context, 6))
                    tag = u
                }
                container.addView(tv)
                var vw: View? = null
                tv.setOnClickListener { v ->
                    val p = vw?.findViewWithTag<View>("play")
                    if (p != null) p.performClick()
                    else playVideo(v.context, u, prefs, scope)
                }
                val cachedFrame = frameCache.get(u)
                if (cachedFrame == null && frameFail.get(u)
                        ?.let { System.currentTimeMillis() - it < 300_000 } == true)
                    continue
                if (cachedFrame != null) {
                    vw = videoWrap(container.context, cachedFrame, u, prefs, scope)
                    container.addView(vw, container.indexOfChild(tv) + 1)
                } else scope.launch {
                    val s3 = resolve(prefs, u) ?: return@launch
                    val frame = videoFrame(s3)
                    if (frame != null && tv.tag == u) {
                        frameCache.put(u, frame)
                        vw = videoWrap(container.context, frame, u, prefs, scope)
                        container.addView(vw, container.indexOfChild(tv) + 1)
                    } else if (frame == null) frameFail.put(u, System.currentTimeMillis())
                }
            } else if (isAudio(u)) {
                // 音频：文件名 + 已播时长 + 右侧 ▶ 播放钮；点即播/再点暂停，一次只播一个
                val row = LinearLayout(container.context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = android.view.Gravity.CENTER_VERTICAL
                    setPadding(dp(context, 8), dp(context, 6), dp(context, 8), dp(context, 6))
                    tag = u
                }
                val name = TextView(container.context)
                name.text = fileName(u)
                name.textSize = 14f
                name.layoutParams = LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                name.maxLines = 1
                name.ellipsize = android.text.TextUtils.TruncateAt.END
                val time = TextView(container.context).apply { textSize = 12f }
                // ⏸/▶ 字符在部分机型字库缺失——用矢量图标，着色跟正文色
                val icon = android.widget.ImageView(container.context).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        dp(container.context, 22), dp(container.context, 22))
                    val ta = context.obtainStyledAttributes(
                        intArrayOf(android.R.attr.textColorPrimary))
                    setColorFilter(ta.getColor(0, 0xFF000000.toInt()))
                    ta.recycle()
                }
                icon.setPadding(dp(container.context, 8), 0, 0, 0)
                row.addView(name); row.addView(time); row.addView(icon)
                fun refreshRow() {
                    icon.setImageResource(if (AudioPlayer.isPlaying(u))
                        R.drawable.ic_pause else R.drawable.ic_play)
                    // 激活时显示 已播/总时长；非激活显示缓存的总时长
                    time.text = if (AudioPlayer.activeUrl() == u) {
                        // 准备中 duration() 返回 0——回落到缓存总时长，仍然显示 0:00 / 0:06
                        val d = AudioPlayer.duration().let { if (it > 0) it else AudioPlayer.cachedDuration(u) }
                        fmtMs(AudioPlayer.position(), d)
                    } else AudioPlayer.cachedDuration(u).let { if (it > 0) fmtMs(0, it) else "" }
                }
                refreshRow()
                container.addView(row)
                // 后台取一次音频元数据，行上常驻总时长
                scope.launch {
                    val d = AudioPlayer.metaDuration(container.context, prefs, u)
                    if (d > 0 && row.tag == u && AudioPlayer.activeUrl() != u)
                        time.text = fmtMs(0, d)
                }
                // 行内计时：该音频激活期间每半秒刷一次（含暂停态）
                fun tick() = scope.launch {
                    while (AudioPlayer.activeUrl() == u && row.tag == u) {
                        refreshRow()
                        kotlinx.coroutines.delay(500)
                    }
                    refreshRow()
                }
                // 该音频正在播时行重建（列表刷新）也要恢复计时
                if (AudioPlayer.activeUrl() == u) tick()
                row.setOnClickListener {
                    // 正在播/暂停/准备中的同一条：立即响应，不再走网络解析
                    if (AudioPlayer.activeUrl() == u) {
                        runCatching { AudioPlayer.toggle(u, "") }
                        refreshRow()
                        tick()
                        return@setOnClickListener
                    }
                    // 新条：先给即时反馈再后台下载
                    time.text = "加载中…"
                    scope.launch {
                        // 音频先落本地缓存再播：首次之后秒开、可任意重播/暂停
                        val f = AudioPlayer.localFile(container.context, prefs, u)
                        if (f == null) { refreshRow(); return@launch }
                        runCatching { AudioPlayer.toggle(u, f.absolutePath) }
                        refreshRow()
                        tick()
                    }
                }
            } else {
                val tv = TextView(container.context).apply {
                    setText("📎 " + fileName(u))
                    textSize = 14f
                    setPadding(dp(context, 8), dp(context, 6), dp(context, 8), dp(context, 6))
                    tag = u
                }
                container.addView(tv)
                tv.setOnClickListener { v ->
                    val ctx = v.context
                    scope.launch {
                        val s3 = resolve(prefs, u) ?: return@launch
                        try {
                            ctx.startActivity(
                                Intent(Intent.ACTION_VIEW).setData(android.net.Uri.parse(s3)))
                        } catch (e: Exception) { }
                    }
                }
            }
        }
    }

    private fun fmtMs(pos: Int, dur: Int): String {
        fun f(ms: Int) = "%d:%02d".format(ms / 60000, (ms / 1000) % 60)
        return if (dur > 0) "${f(pos)} / ${f(dur)}" else f(pos)
    }
}

/** 行内音频播放单例：一次只播一个，滚动出屏也不中断；换条/播完自动停。 */
object AudioPlayer {
    private var mp: android.media.MediaPlayer? = null
    private var playing: String? = null   // 附件原始 URL
    private val durCache = java.util.concurrent.ConcurrentHashMap<String, Int>()

    /** 音视频下载到本地缓存（URL 全量编码命名防碰撞）。已存在直接复用，秒开可重播。 */
    suspend fun localFile(ctx: android.content.Context, prefs: Prefs, attachUrl: String): java.io.File? =
        withContext(Dispatchers.IO) {
            val dir = java.io.File(ctx.cacheDir, "media")
            // 老的 audio/ 目录留过一次——顺手挪过来不重复下载（得在 dir 建好前 rename）
            val legacy = java.io.File(ctx.cacheDir, "audio")
            if (legacy.isDirectory && !dir.exists()) legacy.renameTo(dir)
            dir.mkdirs()
            val name = java.net.URLEncoder.encode(attachUrl, "UTF-8")
                .let { if (it.length > 180) it.takeLast(180) else it } + ".bin"
            val f = java.io.File(dir, name)
            if (f.exists() && f.length() > 0) return@withContext f
            val s3 = Attachments.resolve(prefs, attachUrl) ?: return@withContext null
            // 先下 .tmp 再改名——半截文件不会被当成完整缓存复用
            val tmp = java.io.File(dir, "$name.tmp")
            runCatching {
                URL(s3).openStream().use { inp ->
                    java.io.FileOutputStream(tmp).use { out -> inp.copyTo(out) }
                }
                if (tmp.renameTo(f)) f else null
            }.getOrElse { null }.also { if (it == null) runCatching { tmp.delete() } }
        }

    /** 取音频总时长（ms）：优先用本地缓存文件，没有再解析远端。结果按附件 URL 缓存 */
    suspend fun metaDuration(ctx: android.content.Context, prefs: Prefs, attachUrl: String): Int =
        durCache[attachUrl] ?: run {
            val f = localFile(ctx, prefs, attachUrl) ?: return@run 0
            val d = runCatching {
                val r = android.media.MediaMetadataRetriever()
                try {
                    r.setDataSource(f.absolutePath)
                    r.extractMetadata(
                        android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)
                        ?.toIntOrNull() ?: 0
                } finally {
                    runCatching { r.release() }
                }
            }.getOrDefault(0)
            if (d > 0) durCache[attachUrl] = d
            d
        }

    fun activeUrl() = playing
    fun cachedDuration(url: String) = durCache[url] ?: 0
    fun isPlaying(url: String) = playing == url && mp?.isPlaying == true
    // PREPARING 状态下调 getDuration/getCurrentPosition 会以 -38 触发 onError 清掉播放态
    // ——未 prepare 完时这两个值一律返回 0，不许碰 MediaPlayer
    fun position() = if (prepared) runCatching { mp?.currentPosition ?: 0 }.getOrDefault(0) else 0
    fun duration() = if (prepared) runCatching { mp?.duration ?: 0 }.getOrDefault(0) else 0

    fun toggle(attachUrl: String, s3: String) {
        val cur = mp
        if (playing == attachUrl && cur != null) {
            // 准备中再点 = 取消本次加载（不会再被忽略，行回到可重试状态）
            if (!prepared) { stop(); return }
            if (cur.isPlaying) cur.pause() else cur.start()
            return
        }
        stop()
        playing = attachUrl
        prepared = false
        mp = android.media.MediaPlayer().apply {
            setDataSource(s3)
            setOnPreparedListener { prepared = true; start() }
            setOnCompletionListener { playing = null; prepared = false }
            // -38=非法调用（如误碰 wrong-state getter）——不是播放错误，忽略；真错误才清状态
            setOnErrorListener { _, what, _ ->
                if (what == -38) true else { playing = null; prepared = false; true }
            }
            prepareAsync()
        }
    }

    private var prepared = false

    /** 暂停中也显示当前位置（activeUrl 仍指向它）——配合 refreshRow 的 time 显示 */

    fun stop() {
        runCatching { mp?.release() }
        mp = null
        playing = null
    }
}
