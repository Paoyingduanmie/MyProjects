package com.nancy.devinmobile

import org.json.JSONArray
import org.json.JSONObject

/** 聊天流条目类型（对齐 web renderItem 的 kind）。 */
enum class ChatKind { USER, DEVIN, THOUGHT, TOOL, TOOL_GROUP, EV, PLAN, PERM, SECRETREQ, PLANREQ, QUESTION, OLDER }

data class ChatItem(
    val key: String,
    val kind: ChatKind,
    var title: String = "",
    var text: String = "",
    var status: String = "",      // tool_call: running/done/failed
    var done: String = "",        // perm/secretreq/planreq 已处理标记
    var reqId: Int = 0,           // perm：待回执的 rpc id
    var requestId: String = "",   // secretreq：request_id
    var secretName: String = "",
    var planId: String = "",
    var eventId: String = "",
    var options: List<Pair<String, String>> = emptyList(), // perm: optionId -> name
    var multi: Boolean = false,       // 选项卡多选（allow_multiple）
    var picked: MutableList<String> = mutableListOf(), // 多选已勾选的 optionId
    var open: Boolean = false,        // 折叠卡是否展开（th thinking/tool 聚合）
    var children: List<ChatItem> = emptyList(), // TOOL_GROUP 聚合的子事件
    var ts: Long = 0,                  // 事件时间戳（毫秒）；0=未知
)

data class ConfigOption(val value: String, val name: String, val description: String, val section: String)
data class ConfigEntry(val configId: String, val name: String, var currentValue: String, val options: List<ConfigOption>)

/**
 * 把 ACP session/update 和 iapi 密集事件聚合为可渲染列表——
 * 逐行对齐 web/app.js 的 applyUpdate / applyDenseEvent / makeEventStore。
 */
class EventStore {

    val items = mutableListOf<ChatItem>()
    private val byKey = mutableMapOf<String, ChatItem>()

    var state = ""                // working / suspended / expired / finished ...
    var statusText = ""
    var mode = ""
    var activity = ""
    var userAction = ""
    var devinVersion = ""
    var acuLimit: Double? = null
    var starred = false
    var keepAlive = false
    var prs = JSONArray()
    var queued = JSONArray()
    val configs = linkedMapOf<String, ConfigEntry>()

    fun find(k: String?) = if (k == null) null else byKey[k]

    /** live 尾部首项——之后到达的 iapi 历史事件时序上都早于它，应插到它前面。
     *  用引用而非下标，loadOlder 顶部插入时下标整体位移也能自动跟随。 */
    private var liveTailHead: ChatItem? = null
    private var inDense = false
    private var collectInto: MutableList<ChatItem>? = null

    fun push(e: ChatItem): ChatItem {
        val dts = pendingTs
        if (e.ts == 0L) e.ts = dts ?: System.currentTimeMillis()
        if (inDense) {
            // 回放按事件时间戳归位：liveTailHead 只标记「首条实况」，
            // 其后的实况仍持续进列且时序更晚，回放一律插它前面会乱序
            val idx = if (dts != null)
                items.indexOfFirst { it.ts > dts }.takeIf { it >= 0 } ?: items.size
            else
                liveTailHead?.let { items.indexOf(it).takeIf { i -> i >= 0 } } ?: items.size
            items.add(idx, e)
        } else {
            items.add(e)
            if (liveTailHead == null) liveTailHead = e
        }
        byKey[e.key] = e
        collectInto?.add(e)
        return e
    }

    /** 收集本次调用期间 push 的条目（loadOlder 用于识别新拉到的旧消息）。 */
    fun <T> collecting(out: MutableList<ChatItem>, block: () -> T): T {
        collectInto = out
        try { return block() } finally { collectInto = null }
    }

    private var pendingTs: Long? = null

    /** ISO-8601 / epoch 秒/毫秒 → 毫秒。解析失败返回 null。 */
    private fun parseTs(v: String?): Long? {
        if (v.isNullOrBlank()) return null
        v.toLongOrNull()?.let { return if (it > 1e12) it else it * 1000 }
        return runCatching {
            java.time.Instant.parse(v.trim().replace(" ", "T")
                .let { if ('T' in it) it else "${it}T00:00:00Z" }
                .let { if (it.contains("Z") || it.contains("+")) it else "${it}Z" })
                .toEpochMilli()
        }.getOrNull()
    }
    fun unshift(e: ChatItem) { items.add(0, e); byKey[e.key] = e }

    /* ---------- ACP session/update ---------- */

    fun applyUpdate(params: JSONObject) {
        val u = params.optJSONObject("update") ?: return
        val kind = u.optString("sessionUpdate").ifEmpty { u.optString("type", "unknown") }
        val meta = u.optJSONObject("_meta") ?: JSONObject()

        val q = u.optJSONArray("queuedMessages") ?: u.optJSONArray("queued_messages")
            ?: params.optJSONArray("queuedMessages")
        if (q != null) queued = q

        val eid = u.optString("eventId").ifEmpty {
            u.optString("event_id").ifEmpty {
                metaString(meta, "eventId").ifEmpty { metaString(meta, "event_id") }
            }
        }.ifEmpty { null }
        val text = extractText(u)

        // secret 请求卡片
        when (metaString(meta, "eventType")) {
            "request_secret" -> {
                val rid = metaString(meta, "requestId").ifEmpty { eid ?: "" }
                val k = "sec-$rid"
                if (metaString(meta, "completedTimestamp").isNotEmpty()) {
                    find(k)?.done = "done"
                } else if (find(k) == null) {
                    push(ChatItem(k, ChatKind.SECRETREQ,
                        title = u.optString("title").ifEmpty { "Devin 请求机密" },
                        requestId = rid,
                        secretName = metaString(meta, "secretName").ifEmpty { "secret" }))
                }
                return
            }
            "send_secrets" -> {
                find("sec-" + metaString(meta, "requestId").ifEmpty { eid ?: "" })?.done = "done"
                return
            }
            // 云端审批卡：不走 session/request_permission，以事件形式出现在 update 流
            "permission_request" -> {
                val rid = metaString(meta, "requestId").ifEmpty { eid ?: "" }
                if (rid.isNotEmpty() && find("perm-$rid") == null) {
                    val cmd = metaString(meta, "command")
                    val tool = metaString(meta, "toolName")
                    push(ChatItem("perm-$rid", ChatKind.PERM,
                        title = cmd.ifEmpty { u.optString("title").ifEmpty { "Devin 请求权限" } },
                        text = if (tool.isNotEmpty() && cmd.isNotEmpty()) "$tool · $cmd"
                               else cmd.ifEmpty { tool },
                        requestId = rid,
                        options = listOf("approve" to "批准", "deny" to "拒绝")))
                }
                return
            }
            "permission_resolved" -> {
                val rid = metaString(meta, "requestId").ifEmpty { eid ?: "" }
                find("perm-$rid")?.done =
                    if (metaString(meta, "approved") == "true") "已批准" else "已拒绝"
                return
            }
        }

        // 计划审批卡片
        val planId = u.optString("planId").ifEmpty { metaString(meta, "planId") }
        if (planId.isNotEmpty() && find("planreq-$planId") == null) {
            push(ChatItem("planreq-$planId", ChatKind.PLANREQ,
                planId = planId,
                eventId = metaString(meta, "planEventId").ifEmpty {
                    u.optString("planEventId").ifEmpty { eid ?: "" } },
                text = text.ifEmpty { "Devin 提交了实施计划" }))
            return
        }

        // 服务端推送的 config 变更
        val cfgId = u.optString("configId")
        if (cfgId.isNotEmpty() && u.has("currentValue") && configs.containsKey(cfgId)) {
            configs[cfgId]?.currentValue = u.optString("currentValue")
            return
        }
        // 与历史去重：非 chunk 的完整事件若已存在则跳过；
        // 用户消息的终态即使跳过也要清掉对应的排队消息
        if (eid != null && !kind.endsWith("_chunk") && kind != "tool_call_update" && find(eid) != null) {
            if (kind == "user_message" || kind == "initial_user_message") drainQueued(text)
            return
        }

        when (kind) {
            "user_message", "initial_user_message" -> {
                dropStreaming("user_message_chunk-cur")
                // 同内容去重：同一消息以不同 eid/形态（chunk、initial、重放）到达时只保留一条
                if (items.takeLast(6).none { it.kind == ChatKind.USER && it.text == text && text.isNotEmpty() })
                    push(ChatItem(eid ?: "u${items.size}", ChatKind.USER, text = text))
                drainQueued(text)
            }
            "agent_message", "devin_message" -> {
                dropStreaming("agent_message_chunk-cur"); dropStreaming("devin_message_chunk-cur")
                if (items.takeLast(6).none { it.kind == ChatKind.DEVIN && it.text == text && text.isNotEmpty() })
                    push(ChatItem(eid ?: "a${items.size}", ChatKind.DEVIN, text = text))
            }
            "user_message_chunk", "agent_message_chunk", "devin_message_chunk" -> {
                // 流式行只在仍是末位时合并——中间插入了别的事件说明新一轮开始了。
                // chunk 也带 eventId：登记到 byKey 让 dense 回放/终态命中 existing 路径；
                // eid 已指向别的条目（终态或回放先到）说明这是尾部重放，整条跳过防重复。
                val k = "$kind-cur"
                val cur = find(k)
                val prior = eid?.let { find(it) }
                if (prior != null && prior !== cur) {
                    // replayed chunk——已固化，忽略
                } else if (cur != null && items.lastOrNull() === cur) {
                    cur.text = mergeChunk(cur.text, text)
                    if (eid != null) byKey[eid] = cur
                } else {
                    val it = push(ChatItem(k,
                        if (kind.startsWith("user")) ChatKind.USER else ChatKind.DEVIN,
                        text = text))
                    if (eid != null) byKey[eid] = it
                }
            }
            "agent_thought", "agent_thought_chunk" -> {
                // 同上：新一轮思考开新行，不再合并进早先的 thinking 行
                val cur = find("thought-cur")
                if (cur != null && items.lastOrNull() === cur) cur.text = mergeChunk(cur.text, text)
                else push(ChatItem("thought-cur", ChatKind.THOUGHT, text = text))
            }
            "tool_call" -> {
                val k = u.optString("toolCallId").ifEmpty {
                    u.optString("tool_call_id").ifEmpty { eid ?: "tc${items.size}" } }
                push(ChatItem(k, ChatKind.TOOL,
                    title = u.optString("title").ifEmpty { u.optString("kind", "tool_call") },
                    text = text, status = u.optString("status", "running")))
            }
            "tool_call_update" -> {
                val k = u.optString("toolCallId").ifEmpty { u.optString("tool_call_id") }
                if (k.isNotEmpty()) {
                    // 实况流可能只推 update 不推 create——找不到就建占位条
                    val cur = find(k) ?: push(ChatItem(k, ChatKind.TOOL,
                        title = u.optString("title").ifEmpty { "tool_call" })).also { }
                    if (u.has("status")) cur.status = u.optString("status")
                    val t2 = extractText(u)
                    if (t2.isNotEmpty()) cur.text = if (cur.text.isEmpty()) t2 else "${cur.text}\n$t2"
                    if (u.has("title")) cur.title = u.optString("title")
                }
            }
            "plan" -> {
                val entries = u.optJSONArray("entries")
                val sb = StringBuilder()
                if (entries != null) for (i in 0 until entries.length()) {
                    val e = entries.optJSONObject(i) ?: continue
                    val mark = when (e.optString("status")) {
                        "completed" -> "☑"; "in_progress" -> "▶"; else -> "☐"
                    }
                    sb.append("$mark ${e.optString("content").ifEmpty { e.optString("title") }}\n")
                }
                push(ChatItem("plan", ChatKind.PLAN, text = sb.toString().trim().ifEmpty { text }))
            }
            "status_update" -> statusText = text.ifEmpty { u.optString("status") }
            "state_update" -> state = u.optString("state")
            "current_mode_update" -> { u.optString("currentModeId").takeIf { it.isNotEmpty() }?.let { mode = it } }
            "available_commands_update", "usage_update" -> { /* 元信息跳过 */ }
            else -> if (text.isNotEmpty())
                push(ChatItem(eid ?: kind + items.size, ChatKind.EV, title = kind, text = text))
        }
    }

    /** 服务端消费/移除排队消息后本地同步——按文本匹配移除一条同文条目。
     *  终态事件的 message 可能附带附件块或首尾空白，与入队原文不是严格相等——
     *  两侧 trim 后按相等或前缀匹配，防止已消费的排队项残留。 */
    private fun drainQueued(text: String) {
        if (queued.length() == 0) return
        val t = text.trim()
        val tStrip = Attachments.strip(t).trim()
        var removed = false
        val keep = JSONArray()
        for (i in 0 until queued.length()) {
            val e = queued.opt(i) ?: continue
            if (!removed && e is JSONObject) {
                val q = queuedText(e).trim()
                val qStrip = Attachments.strip(q).trim()
                // 终态文本可能带附件块/占位符——剥离附件再比，且任一形态前缀命中即消费
                val hit = q.isNotEmpty() && (q == t || t.startsWith(q) || q.startsWith(t) ||
                    (qStrip.isNotEmpty() && tStrip.isNotEmpty() &&
                        (qStrip == tStrip || tStrip.startsWith(qStrip) || qStrip.startsWith(tStrip))))
                if (hit) {
                    removed = true; continue
                }
            }
            keep.put(e)
        }
        queued = keep
    }

    /** 服务端排队项的 message 可能是 {"message":"…"} 字典——optString 会把整个
     *  JSON 串返回，先看字典再退化到字符串字段，否则队列显示原始 JSON、
     *  drainQueued 也匹配不上导致已消费的消息残留。 */
    fun queuedText(m: JSONObject): String =
        m.optJSONObject("message")?.optString("message")
            ?: m.optString("message").ifEmpty {
                m.optString("text").ifEmpty { m.optString("body") }
            }

    /* ---------- iapi 密集历史事件（GET /iapi/events/{sid}） ---------- */

    fun applyDenseEvent(e: JSONObject) {
        inDense = true
        try { applyDenseEventInner(e) } finally { inDense = false }
    }

    private fun applyDenseEventInner(e: JSONObject) {
        val t = e.optString("type", "unknown")
        val eid = e.optString("id").ifEmpty { e.optString("event_id") }.ifEmpty { null }
        pendingTs = parseTs(e.optString("timestamp").ifEmpty {
            e.optString("created_at").ifEmpty { e.optString("created_timestamp") } })
        val data = e.optJSONObject("data")
        val msg = e.optString("message").ifEmpty { data?.optString("message") ?: "" }
        // 选项卡提问事件要先识别——同 eid 的消息常由 ACP 实况先推到，命中 existing
        // 提前返回就永远变不成卡。卡用独立 key "q-$eid"，与消息气泡并存。
        val isQuestion = t == "devin_message" &&
            (e.optString("content_type").ifEmpty { data?.optString("content_type") ?: "" }
                == "user_question")
        if (isQuestion && find("q-$eid") == null) {
            val qs = e.optJSONArray("questions") ?: data?.optJSONArray("questions")
            if (qs != null && qs.length() > 0) {
                val qtexts = (0 until qs.length()).map {
                    qs.optJSONObject(it)?.optString("question") ?: "" }
                val opts = mutableListOf<Pair<String, String>>()
                for (qi in 0 until qs.length()) {
                    val o = qs.optJSONObject(qi)?.optJSONArray("options") ?: continue
                    for (i in 0 until o.length()) {
                        val n = o.optString(i)
                        opts += (if (qs.length() > 1) "${qtexts[qi]}：$n" else n) to n
                    }
                }
                val multi = (0 until qs.length()).any {
                    qs.optJSONObject(it)?.optBoolean("allow_multiple") == true }
                push(ChatItem("q-$eid", ChatKind.QUESTION,
                    title = "Devin 的提问",
                    text = qtexts.joinToString("\n"),
                    options = opts, multi = multi))
            }
        }
        val existing = eid?.let { find(it) }
        if (existing != null) {
            // ACP 实况先到的消息文本缺附件块——密集历史带来完整文本时补齐，附件才能实时渲染
            denseMatched += existing.key
            if (msg.isNotEmpty() && msg != existing.text &&
                (existing.kind == ChatKind.USER || existing.kind == ChatKind.DEVIN))
                existing.text = msg
            if (t == "user_message" || t == "initial_user_message") drainQueued(msg)
            return
        }
        when {
            t == "user_message" || t == "initial_user_message" -> {
                mergeOrPush(ChatKind.USER, eid, msg)
                // 实况流可能因 eid 去重跳过 drainQueued——回放兜底再清一次排队
                drainQueued(msg)
            }
            t == "user_question_answered" -> {
                val oid = e.optString("original_event_id")
                    .ifEmpty { data?.optString("original_event_id") ?: "" }
                val ans = (e.optJSONArray("answers") ?: data?.optJSONArray("answers"))
                    ?.optJSONObject(0)
                val sel = ans?.optJSONArray("selected_options")
                val picked = if (sel != null)
                    (0 until sel.length()).joinToString(",") { sel.optString(it) }
                    else ""
                find("q-$oid")?.done = picked.ifEmpty {
                    ans?.optString("other_text")?.ifEmpty {
                        e.optString("skip_reason").ifEmpty { "已回答" } } ?: "已回答" }
            }
            t == "devin_message" -> mergeOrPush(ChatKind.DEVIN, eid, msg)
            t == "thought_summary" || t == "devin_thought" || t == "agent_thought" ||
                t == "devin_thoughts" || t == "one_line_thoughts" ->
                push(ChatItem(eid ?: "h${items.size}", ChatKind.THOUGHT,
                    text = msg.ifEmpty { data?.optString("thought") ?: "" }))
            t == "status_update" -> statusText = msg.ifEmpty { data?.optString("status") ?: "" }
            t == "request_secret" || data?.optString("eventType") == "request_secret" -> {
                val rid = (data?.optString("request_id")
                    ?.ifEmpty { data.optString("requestId") })?.ifEmpty { null } ?: eid ?: ""
                val completed = data?.optString("completed_timestamp")
                    ?.ifEmpty { data.optString("completedTimestamp") }?.isNotEmpty() == true
                if (!completed && find("sec-$rid") == null) {
                    push(ChatItem("sec-$rid", ChatKind.SECRETREQ,
                        secretName = data?.optString("secret_name")
                            ?.ifEmpty { data.optString("secretName") } ?: "secret",
                        requestId = rid,
                        title = data?.optString("title")?.ifEmpty { null } ?: "Devin 请求机密"))
                }
            }
            // 密集事件里字段在顶层（request_id/command/tool_name/approved），data 内兜底
            t == "permission_request" || data?.optString("eventType") == "permission_request" -> {
                val rid = (e.optString("request_id").ifEmpty { data?.optString("request_id") }
                    ?.ifEmpty { data.optString("requestId") })?.ifEmpty { null } ?: eid ?: ""
                if (rid.isNotEmpty() && find("perm-$rid") == null) {
                    val cmd = e.optString("command").ifEmpty { data?.optString("command") ?: "" }
                    val tool = e.optString("tool_name").ifEmpty {
                        data?.optString("tool_name")?.ifEmpty { data.optString("toolName") } ?: "" }
                    push(ChatItem("perm-$rid", ChatKind.PERM,
                        title = cmd.ifEmpty {
                            (data?.optString("title")?.ifEmpty { null }) ?: "Devin 请求权限" },
                        text = if (tool.isNotEmpty() && cmd.isNotEmpty()) "$tool · $cmd"
                               else cmd.ifEmpty { tool },
                        requestId = rid,
                        options = listOf("approve" to "批准", "deny" to "拒绝")))
                }
            }
            t == "permission_resolved" || t == "permission_request_response" ||
                data?.optString("eventType") == "permission_resolved" -> {
                val rid = (e.optString("request_id").ifEmpty { data?.optString("request_id") }
                    ?.ifEmpty { data.optString("requestId") })?.ifEmpty { null } ?: eid ?: ""
                val approved = (e.opt("approved") ?: data?.opt("approved"))?.toString() == "true"
                find("perm-$rid")?.done = if (approved) "已批准" else "已拒绝"
            }
            data?.optString("plan_id")?.isNotEmpty() == true ||
                data?.optString("planId")?.isNotEmpty() == true -> {
                val pid = data.optString("plan_id").ifEmpty { data.optString("planId") }
                if (find("planreq-$pid") == null) {
                    push(ChatItem("planreq-$pid", ChatKind.PLANREQ, planId = pid,
                        eventId = data.optString("plan_event_id")
                            .ifEmpty { data.optString("planEventId") }.ifEmpty { eid ?: "" },
                        text = msg.ifEmpty { "Devin 提交了实施计划" }))
                }
            }
            t == "set_devin_version" ->
                push(ChatItem(eid ?: "h${items.size}", ChatKind.EV, title = "model",
                    text = "模型 → " + (data?.optString("version")?.ifEmpty { null }
                        ?: e.optString("version").ifEmpty { msg })))
            t == "simple_activity_update" || t == "context_growth_update" || t.startsWith("acu_") -> {}
            Regex("tool|command|shell|terminal|edit|read|search|browser|file|exec|write|git",
                RegexOption.IGNORE_CASE).containsMatchIn(t) ->
                push(ChatItem(eid ?: "h${items.size}", ChatKind.TOOL, title = t,
                    text = msg.ifEmpty { data?.toString()?.take(300) ?: "" }, status = "done"))
            msg.isNotEmpty() ->
                push(ChatItem(eid ?: "h${items.size}", ChatKind.EV, title = t, text = msg))
        }
    }

    /** 已与某条密集事件配对过的条目 key——同文消息可能合法连发（“看到了”xN），
     *  每条回放只配对一个未配对副本，回放里该文出现几次列表就留几条。
     *  ACP 实况副本与回放副本 eid 可能不同、ts 也可能有偏差，故按全文配对。
     *  实况文本缺附件块时同文（去附件块）即同条，用完整文本替换。 */
    private val denseMatched = HashSet<String>()

    private fun mergeOrPush(kind: ChatKind, eid: String?, msg: String) {
        if (msg.isEmpty()) return
        val strip = Attachments.strip(msg)
        val dup = items.firstOrNull {
            it.kind == kind && it.key !in denseMatched &&
                (it.text == msg ||
                    (strip.isNotEmpty() && Attachments.strip(it.text) == strip)) }
        if (dup != null) {
            if (msg.length > dup.text.length) dup.text = msg
            denseMatched += dup.key
            if (eid != null) byKey[eid] = dup   // 同 eid 的后续回放走 existing 短路
            return
        }
        push(ChatItem(eid ?: "h${items.size}", kind, text = msg))
    }

    /** chunk 流式占位条目在完整消息到达时移除，避免一条变两条。 */
    private fun dropStreaming(k: String) {
        find(k)?.let {
            items.remove(it); byKey.remove(it.key)
            if (liveTailHead === it) liveTailHead = null
        }
    }

    /** chunk 可能是增量也可能是累计快照——新文本已包含旧文本前缀时直接替换，
     *  否则追加；旧文本以新文本结尾说明是同段重发，忽略。 */
    private fun mergeChunk(cur: String, next: String): String = when {
        next.isEmpty() -> cur
        next.startsWith(cur) -> next
        cur.endsWith(next) || cur.contains(next) -> cur
        else -> cur + next
    }

    /* ---------- helpers ---------- */

    private fun metaString(meta: JSONObject, k: String): String =
        meta.opt("cognition.ai/$k")?.toString() ?: ""

    companion object {
        fun extractText(u: JSONObject?): String {
            if (u == null) return ""
            u.optString("message").takeIf { it.isNotEmpty() }?.let { return it }
            u.optString("text").takeIf { it.isNotEmpty() }?.let { return it }
            return when (val c = u.opt("content")) {
                is String -> c
                is JSONObject -> c.optString("text")
                is JSONArray -> (0 until c.length())
                    .joinToString("") { c.optJSONObject(it)?.optString("text") ?: "" }
                else -> u.optJSONObject("delta")?.optString("text") ?: ""
            }
        }
    }
}
