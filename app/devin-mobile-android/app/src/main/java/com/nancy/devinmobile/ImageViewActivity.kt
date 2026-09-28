package com.nancy.devinmobile

import android.annotation.SuppressLint
import android.graphics.Matrix
import android.os.Bundle
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import coil.load

/** 图片查看器：黑底全屏，双指捏合缩放（1x–8x）、双击切换放大/复原、拖动平移、点 ✕ 或返回关闭。 */
class ImageViewActivity : AppCompatActivity() {

    private lateinit var iv: ImageView
    private val mat = Matrix()
    private val base = Matrix()
    private var scale = 1f
    private var tx = 0f
    private var ty = 0f
    private var baseReady = false
    private var lastX = 0f
    private var lastY = 0f
    private var dragging = false

    private fun apply() {
        val m = Matrix(base)
        m.postScale(scale, scale, iv.width / 2f, iv.height / 2f)
        m.postTranslate(tx, ty)
        iv.imageMatrix = m
    }

    /** 计算适配屏幕的基础矩阵：图片按 contain 居中，之后叠加用户缩放/平移。 */
    private fun setupBase() {
        if (baseReady) return
        val d = iv.drawable ?: return
        val vw = iv.width.toFloat(); val vh = iv.height.toFloat()
        if (vw <= 0 || vh <= 0) return
        val iw = d.intrinsicWidth.toFloat(); val ih = d.intrinsicHeight.toFloat()
        if (iw <= 0 || ih <= 0) return
        baseReady = true
        val s = minOf(vw / iw, vh / ih)
        base.setScale(s, s)
        base.postTranslate((vw - iw * s) / 2f, (vh - ih * s) / 2f)
        apply()
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val root = FrameLayout(this).apply {
            setBackgroundColor(0xFF141414.toInt())
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        iv = ImageView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            scaleType = ImageView.ScaleType.MATRIX
        }
        root.addView(iv)
        val dp = resources.displayMetrics.density
        val close = TextView(this).apply {
            text = "✕"
            textSize = 20f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding((14 * dp).toInt(), (14 * dp).toInt(),
                (14 * dp).toInt(), (14 * dp).toInt())
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = android.view.Gravity.TOP or android.view.Gravity.END
                topMargin = (26 * dp).toInt(); marginEnd = (8 * dp).toInt()
            }
            setOnClickListener { finish() }
        }
        root.addView(close)
        setContentView(root)

        val scaleDet = ScaleGestureDetector(this,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(d: ScaleGestureDetector): Boolean {
                    scale = (scale * d.scaleFactor).coerceIn(1f, 8f)
                    apply()
                    return true
                }
            })
        val tapDet = GestureDetector(this,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onDoubleTap(e: MotionEvent): Boolean {
                    if (scale > 1.05f) { scale = 1f; tx = 0f; ty = 0f }
                    else scale = 2.6f
                    apply()
                    return true
                }
                override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                    close.visibility =
                        if (close.visibility == View.VISIBLE) View.GONE else View.VISIBLE
                    return true
                }
            })

        iv.setOnTouchListener { _, ev ->
            scaleDet.onTouchEvent(ev)
            tapDet.onTouchEvent(ev)
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> { lastX = ev.x; lastY = ev.y; dragging = true }
                MotionEvent.ACTION_MOVE -> if (dragging && !scaleDet.isInProgress) {
                    tx += ev.x - lastX; ty += ev.y - lastY
                    lastX = ev.x; lastY = ev.y
                    if (scale > 1f) apply()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> dragging = false
            }
            true
        }

        // key=附件原 URL：行内缩略图已按此 key 存过 Coil 磁盘缓存，直接命中秒显
        val key = intent.getStringExtra("key")
        iv.load(intent.getStringExtra("url")) {
            if (key != null) { memoryCacheKey(key); diskCacheKey(key) }
            listener(onSuccess = { _, _ -> setupBase() })
        }
        iv.post { setupBase() }
    }
}
