package com.nancy.devinmobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.os.IBinder
import android.provider.Settings
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * 前台服务：挂一条常驻通知让 app 保持前台优先级——
 * 系统省电策略（MIUI 等）就不会掐后台的 WebSocket/轮询，PAT 连接不再易断。
 * 开关在设置页「后台保连接」。
 */
class ConnService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL, "后台保连接", NotificationManager.IMPORTANCE_MIN))
        val tap = PendingIntent.getActivity(this, 0,
            Intent(this, SessionListActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle("Devin 后台运行中（保活）")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(tap)
            .setOngoing(true)
            .build()
        startForeground(ID, n)
        return START_STICKY
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "conn"
        private const val ID = 1

        /** 按开关状态启停服务。 */
        fun sync(ctx: Context) {
            if (Prefs(ctx).fgService) {
                ctx.startForegroundService(Intent(ctx, ConnService::class.java))
            } else {
                ctx.stopService(Intent(ctx, ConnService::class.java))
            }
        }
    }
}

/** 暂存会话来新消息的瞬时提醒：heads-up 弹一下后自动消失
 * （setTimeoutAfter），不保留在通知栏。点击直达该会话。 */
object Notifier {
    private const val CHANNEL = "msgs"

    fun msg(ctx: Context, sid: String, title: String) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL, "新消息", NotificationManager.IMPORTANCE_HIGH))
        val tap = PendingIntent.getActivity(ctx, sid.hashCode(),
            Intent(ctx, SessionActivity::class.java)
                .putExtra(SessionActivity.EXTRA_ID, sid)
                .putExtra(SessionActivity.EXTRA_TITLE, title),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(ctx, CHANNEL)
            .setContentTitle(title)
            .setContentText("有新消息")
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setTimeoutAfter(5_000)
            .build()
        nm.notify(sid.hashCode(), n)
    }

    /**
     * 状态迁移提醒（批量）：同一批多个迁移合成一条——
     * 单个：标题=「任务已完成」内容=会话名，点开直达会话；
     * 多个：标题=「N 个任务有更新」内容=逐行「状态·会话名」，点开会话列表。
     */
    fun statusAll(ctx: Context, events: List<Triple<String, String, String>>) {
        // 正在看的会话不弹「跳进去」提醒——你已经在那了；同批其它会话照常
        val viewing = (App.top as? SessionActivity)?.currentSid
        val evts = if (viewing.isNullOrEmpty()) events else
            events.filter { it.first != viewing }
        if (evts.isEmpty()) return
        val single = evts.size == 1
        val (sid, name, text) = evts.first()
        val head = if (single) text else "${evts.size} 个任务有更新"
        val body = if (single) name else
            evts.joinToString("\n") { "${it.third} · ${it.second}" }
        // 单个跳会话，多个回列表
        val tapIntent = if (single)
            Intent(ctx, SessionActivity::class.java)
                .putExtra(SessionActivity.EXTRA_ID, sid)
                .putExtra(SessionActivity.EXTRA_TITLE, name)
        else Intent(ctx, SessionListActivity::class.java)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(
            CHANNEL, "新消息", NotificationManager.IMPORTANCE_HIGH))
        val tap = PendingIntent.getActivity(ctx, 7_000 + evts.size,
            tapIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(ctx, CHANNEL)
            .setContentTitle(head)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setTimeoutAfter(5_000)
            .build()
        nm.notify(sid.hashCode() + 7, n)
        val top = App.top
        if (top != null) {
            // app 在前台：通知栏横幅容易被错过——当前屏幕上弹模态卡，不点不消失
            top.runOnUiThread {
                if (top.isFinishing || top.isDestroyed) return@runOnUiThread
                androidx.appcompat.app.AlertDialog.Builder(top)
                    .setTitle(head)
                    .setMessage(body)
                    .setPositiveButton("查看") { _, _ ->
                        top.startActivity(if (single)
                            Intent(top, SessionActivity::class.java)
                                .putExtra(SessionActivity.EXTRA_ID, sid)
                                .putExtra(SessionActivity.EXTRA_TITLE, name)
                        else Intent(top, SessionListActivity::class.java))
                    }
                    .setNegativeButton("知道了", null)
                    .show()
            }
        } else if (Settings.canDrawOverlays(ctx)) {
            // 加悬浮窗必须在主线程——本函数可能从 StatusWatch 的 IO 轮询被调到
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                overlay(ctx, evts)
            }
        }
    }

    /** 悬浮窗容器：竖排叠放多条胶囊卡，各管各的跳/关；最多 4 条，新的压掉最旧的。 */
    private var overlayBox: LinearLayout? = null

    private fun overlay(ctx: Context, events: List<Triple<String, String, String>>) {
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val density = ctx.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()
        fun attrColor(resid: Int, def: Int): Int {
            val ta = ctx.theme.obtainStyledAttributes(intArrayOf(resid))
            val c = ta.getColor(0, def); ta.recycle(); return c
        }
        // 容器已挂在窗口上就直接往里加，没有才新建挂上去
        val box = overlayBox ?: LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                android.graphics.PixelFormat.TRANSLUCENT)
            lp.gravity = android.view.Gravity.TOP or android.view.Gravity.CENTER_HORIZONTAL
            lp.y = dp(56)
            lp.horizontalMargin = 0.03f
            try { wm.addView(this, lp); overlayBox = this }
            catch (e: Exception) { return }
        }
        fun removePill(v: android.view.View) {
            box.removeView(v)
            if (box.childCount == 0) {
                try { wm.removeView(box) } catch (e: Exception) { }
                overlayBox = null
            }
        }
        events.forEach { (sid, name, text) ->
            // 同一会话的旧卡还挂着就先下掉，不重复弹
            (0 until box.childCount).map { box.getChildAt(it) }
                .firstOrNull { it.tag == sid }?.let { removePill(it) }
            if (box.childCount >= 4) box.getChildAt(0)?.let { removePill(it) }
            val pill = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(dp(16), dp(10), dp(10), dp(10))
                background = GradientDrawable().apply {
                    setColor(attrColor(com.google.android.material.R.attr.colorSurface, 0xFFFAF7F0.toInt()))
                    cornerRadius = dp(999).toFloat()   // 全圆角胶囊
                    setStroke(dp(1), 0x22000000)
                }
                elevation = dp(8).toFloat()
                isClickable = true
                tag = sid
            }
            // 绿色圆点+对勾：状态迁移（完成/被阻）的通用状态标
            pill.addView(TextView(ctx).apply {
                this.text = "✓"
                textSize = 11f
                gravity = android.view.Gravity.CENTER
                setTextColor(0xFFFFFFFF.toInt())
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(0xFF2E9E5B.toInt())
                }
                layoutParams = LinearLayout.LayoutParams(dp(22), dp(22))
            })
            pill.addView(TextView(ctx).apply {
                this.text = "$text · $name"
                textSize = 14f
                setTextColor(attrColor(android.R.attr.textColorPrimary, 0xFF222222.toInt()))
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
                layoutParams = LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginStart = dp(10); marginEnd = dp(10)
                }
            })
            pill.addView(TextView(ctx).apply {
                this.text = "✕"
                textSize = 15f
                gravity = android.view.Gravity.CENTER
                setTextColor(attrColor(android.R.attr.textColorSecondary, 0xFF777777.toInt()))
                setPadding(dp(8), dp(4), dp(8), dp(4))
                setOnClickListener { removePill(pill) }
            })
            pill.setOnClickListener {
                removePill(pill)
                ctx.startActivity(Intent(ctx, SessionActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra(SessionActivity.EXTRA_ID, sid)
                    .putExtra(SessionActivity.EXTRA_TITLE, name))
            }
            box.addView(pill, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) })
        }
    }
}
