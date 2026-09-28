package com.nancy.devinmobile

import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** 内置网页页：PR/官方网页/消息链接都在 app 内打开，不跳外部浏览器。 */
class WebActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        App.applyTheme(this)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_web)
        val web = findViewById<WebView>(R.id.webview)
        val bar = findViewById<ProgressBar>(R.id.progress)
        findViewById<TextView>(R.id.back).setOnClickListener { finish() }
        findViewById<TextView>(R.id.open_ext).setOnClickListener {
            startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,
                android.net.Uri.parse(web.url ?: intent.getStringExtra("url"))))
        }
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        val local = intent.getStringExtra("local")
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(v: WebView?, u: String?, f: Bitmap?) {
                bar.visibility = View.VISIBLE
            }
            override fun onPageFinished(v: WebView?, u: String?) {
                bar.visibility = View.GONE
                findViewById<TextView>(R.id.web_title).text = v?.title ?: u
            }
            // 本地缓存文件经伪 https 主机回送：file:// 子资源在 WebView 里会被拦
            override fun shouldInterceptRequest(v: WebView?,
                r: android.webkit.WebResourceRequest?): android.webkit.WebResourceResponse? {
                if (local != null && r?.url?.toString()?.startsWith("https://localvideo/") == true) {
                    return try {
                        android.webkit.WebResourceResponse("video/mp4", null,
                            java.io.FileInputStream(local))
                    } catch (e: Exception) { null }
                }
                return super.shouldInterceptRequest(v, r)
            }
        }
        val url = intent.getStringExtra("url") ?: "https://app.devin.ai"
        if (intent.getBooleanExtra("video", false)) {
            // 视频用 <video> 标签包一层：WebView 直接 loadUrl mp4 可能触发下载而非播放
            web.settings.mediaPlaybackRequiresUserGesture = false
            web.loadDataWithBaseURL(null,
                "<html><body style='margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh'>" +
                "<video src='${if (local != null) "https://localvideo/" else url}' controls autoplay style='max-width:100%;max-height:100%'></video>" +
                "</body></html>", "text/html", "utf-8", null)
        } else {
            web.loadUrl(url)
        }
    }

    override fun onBackPressed() {
        val web = findViewById<WebView>(R.id.webview)
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
