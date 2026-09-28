package com.nancy.devinmobile

import android.content.Context

/** API key 与 org_id（v3 key 用）的读写来源。 */
interface Credentials {
    var apiKey: String
    var orgId: String
}

/** 未落盘的候选凭据，用于保存前先验证。 */
class MemoryCredentials(apiKey: String, orgId: String) : Credentials {
    override var apiKey: String = apiKey.trim()
    override var orgId: String = orgId.trim()
}

/** API key 与自动探测到的 org_id（v3 key 用）本地存储。 */
class Prefs(context: Context) : Credentials {
    private val sp = context.getSharedPreferences("devin-mobile", Context.MODE_PRIVATE)

    override var apiKey: String
        get() = sp.getString(KEY_API, "") ?: ""
        set(value) = sp.edit().putString(KEY_API, value.trim()).apply()

    override var orgId: String
        get() = sp.getString(KEY_ORG, "") ?: ""
        set(value) = sp.edit().putString(KEY_ORG, value.trim()).apply()

    /** system / light / dark */
    var theme: String
        get() = sp.getString(KEY_THEME, "system") ?: "system"
        set(value) = sp.edit().putString(KEY_THEME, value).apply()

    /** 会话输入框草稿（web 用 localStorage draft:<id>，这里用 SharedPreferences）。 */
    fun draft(sessionId: String): String = sp.getString(KEY_DRAFT_PREFIX + sessionId, "") ?: ""

    fun setDraft(sessionId: String, text: String) {
        if (text.isEmpty()) sp.edit().remove(KEY_DRAFT_PREFIX + sessionId).apply()
        else sp.edit().putString(KEY_DRAFT_PREFIX + sessionId, text).apply()
    }

    /** ACP 实时模式用的 PAT（Settings→PATs）；有它则走 WebSocket ACP。 */
    var pat: String
        get() = sp.getString(KEY_PAT, "") ?: ""
        set(value) = sp.edit().putString(KEY_PAT, value.trim()).apply()

    /** ACP 下会话→文件夹映射（web 的 localStorage foldermap）。 */
    var folderMapJson: String
        get() = sp.getString(KEY_FOLDER_MAP, "{}") ?: "{}"
        set(value) = sp.edit().putString(KEY_FOLDER_MAP, value).apply()

    /** 会话→最新一条消息副标题缓存：先显上次的值，拉到新的静默覆盖。 */
    var latestMsgJson: String
        get() = sp.getString(KEY_LATEST_MSG, "{}") ?: "{}"
        set(value) = sp.edit().putString(KEY_LATEST_MSG, value).apply()

    /** 上次连通性探测结果——设置页直接显示，探测到再更新，不闪「已配置」。 */
    var keyConn: Boolean
        get() = sp.getBoolean(KEY_CONN_API, false)
        set(value) = sp.edit().putBoolean(KEY_CONN_API, value).apply()

    var patConn: Boolean
        get() = sp.getBoolean(KEY_CONN_PAT, false)
        set(value) = sp.edit().putBoolean(KEY_CONN_PAT, value).apply()

    var fgService: Boolean
        get() = sp.getBoolean(KEY_FG_SERVICE, false)
        set(v) { sp.edit().putBoolean(KEY_FG_SERVICE, v).apply() }

    /** 用默认模式建过的会话响应里带回解析后的 org 默认 devin_mode——缓存用于显示。 */
    var orgDefaultMode: String
        get() = sp.getString(KEY_ORG_DEFAULT_MODE, "") ?: ""
        set(v) { sp.edit().putString(KEY_ORG_DEFAULT_MODE, v).apply() }

    /** @ 弹层的 skills 列表（逗号分隔）；空 = 用内置种子。服务无可枚举接口，用户可自定义。 */
    var skillsCsv: String
        get() = sp.getString(KEY_SKILLS_CSV, "") ?: ""
        set(v) { sp.edit().putString(KEY_SKILLS_CSV, v).apply() }

    /** 更新记录页的远端 history 缓存（原始 JSON 数组串）——打开页面先渲染缓存再增量更新。 */
    var changelogJson: String
        get() = sp.getString(KEY_CHANGELOG, "") ?: ""
        set(v) { sp.edit().putString(KEY_CHANGELOG, v).apply() }

    /** 上次 ACP session/list 返回的真会话 id 集合（逗号分隔），用于剔除 REST 里的已删除幽灵。 */
    var lastAcpIds: String
        get() = sp.getString(KEY_ACP_IDS, "") ?: ""
        set(v) { sp.edit().putString(KEY_ACP_IDS, v).apply() }

    /** 上次 ACP 真列表同步时间（epoch ms）。 */
    var lastAcpSyncAt: Long
        get() = sp.getLong(KEY_ACP_SYNC, 0)
        set(v) { sp.edit().putLong(KEY_ACP_SYNC, v).apply() }

    /** 悬浮窗权限引导是否已问过（只问一次）。 */
    var overlayAsked: Boolean
        get() = sp.getBoolean(KEY_OVERLAY_ASKED, false)
        set(v) { sp.edit().putBoolean(KEY_OVERLAY_ASKED, v).apply() }

    val configured: Boolean get() = apiKey.isNotEmpty()

    companion object {
        private const val KEY_API = "api_key"
        private const val KEY_ORG = "org_id"
        private const val KEY_THEME = "theme"
        private const val KEY_PAT = "pat"
        private const val KEY_FOLDER_MAP = "folder_map"
        private const val KEY_LATEST_MSG = "latest_msg"
        private const val KEY_CONN_API = "conn_api"
        private const val KEY_CONN_PAT = "conn_pat"
        private const val KEY_DRAFT_PREFIX = "draft:"
        private const val KEY_FG_SERVICE = "fg_service"
        private const val KEY_ORG_DEFAULT_MODE = "org_default_mode"
        private const val KEY_SKILLS_CSV = "skills_csv"
        private const val KEY_CHANGELOG = "changelog_json"
        private const val KEY_ACP_IDS = "last_acp_ids"
        private const val KEY_ACP_SYNC = "last_acp_sync"
        private const val KEY_OVERLAY_ASKED = "overlay_asked"
    }
}
