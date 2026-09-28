package com.nancy.devinmobile

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Format {
    fun ago(millis: Long): String {
        if (millis <= 0) return ""
        val seconds = (System.currentTimeMillis() - millis) / 1000
        return when {
            seconds < 60 -> "刚刚"
            seconds < 3600 -> "${seconds / 60} 分钟前"
            seconds < 86400 -> "${seconds / 3600} 小时前"
            else -> "${seconds / 86400} 天前"
        }
    }

    fun clock(millis: Long): String =
        if (millis <= 0) "" else SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(millis))

    fun statusLabel(statusEnum: String): String = when (statusEnum) {
        "working", "running" -> "Working"
        "finished", "exited", "exit" -> "Done"
        "blocked" -> "Blocked"
        "expired" -> "Error"
        "suspended" -> "Suspended"
        else -> statusEnum.ifEmpty { "Idle" }
    }

    fun statusColor(statusEnum: String): Int = when (statusEnum) {
        "working", "running" -> 0xFF2F9E62.toInt()
        "blocked" -> 0xFFD08A1E.toInt()
        "expired" -> 0xFFD44540.toInt()
        "finished", "exited", "exit" -> 0xFF6D5AE0.toInt()
        else -> 0xFF8B8F9A.toInt()
    }

    /** 详情页补充显示 status_detail（等待用户/批准等具体原因）。 */
    fun statusDetailLabel(session: Session): String = when (session.statusDetail) {
        "waiting_for_user" -> "等你回复"
        "waiting_for_approval" -> "等你批准"
        "usage_limit_exceeded", "out_of_credits", "out_of_quota", "no_quota_allocation" -> "额度不足"
        else -> statusLabel(session.statusEnum)
    }

    /** PR 徽标文本与颜色：open 绿 / merged 紫 / closed 红（与 GitHub 一致）。 */
    fun prLabel(state: String?): String = when (state) {
        "open" -> "PR·open"
        "merged" -> "PR·merged"
        "closed" -> "PR·closed"
        "draft" -> "PR·draft"
        else -> "PR"
    }

    fun prColor(state: String?): Int = when (state) {
        "open" -> 0xFF2F9E62.toInt()
        "merged" -> 0xFF6D5AE0.toInt()
        "closed" -> 0xFFD44540.toInt()
        else -> 0xFF8B8F9A.toInt()
    }

    /** mdLite 渲染结果缓存——同一条消息每次绑定都跑正则链+Html.fromHtml
     *  太贵，按原文缓存 CharSequence，长会话滚动明显更顺。 */
    private val mdCache = android.util.LruCache<String, CharSequence>(128)

    fun mdCached(src: String): CharSequence =
        mdCache.get(src) ?: mdLite(src).also { mdCache.put(src, it) }

    /** 极简 markdown：转义后渲染 `code`、**bold**、标题行。链接靠 autoLink。 */
    fun mdLite(src: String): CharSequence {
        var t = src.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
        t = Regex("`([^`\n]+)`").replace(t) { "<tt><font color='#7c4dff'>${it.groupValues[1]}</font></tt>" }
        t = Regex("\\[([^\\]\n]+)\\]\\((https?://[^)\\s]+)\\)").replace(t) {
            "<a href='" + it.groupValues[2] + "'>" + it.groupValues[1] + "</a>" }
        t = Regex("[*][*]([^*\n]+)[*][*]").replace(t) { "<b>${it.groupValues[1]}</b>" }
        t = Regex("(?m)^#{1,6}\\s*(.+)$").replace(t) { "<b>${it.groupValues[1]}</b>" }
        t = t.replace("\n", "<br>")
        return android.text.Html.fromHtml(t, android.text.Html.FROM_HTML_MODE_LEGACY)
    }
}
