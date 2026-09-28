package com.nancy.devinmobile

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Devin REST 客户端（手机直连 api.devin.ai，无需电脑代理）。
 *
 * key 前缀决定 API 版本：`cog_` 走 v3（/v3/organizations/{org}/...，org 经 /v3/self 探测），
 * 其余（apk_user_ / apk_）走 v1。
 */
class DevinApi(private val prefs: Credentials) {

    private val key: String get() = prefs.apiKey
    val isV3: Boolean get() = key.startsWith("cog_")

    suspend fun listSessions(limit: Int = 50): List<Session> = withContext(Dispatchers.IO) {
        if (isV3) {
            val qs = URLEncoder.encode(JSONObject().put("first", limit).toString(), "UTF-8")
            val body = request("GET", scoped("/sessions?qs=$qs"))
            body.optJSONArray("items").orEmpty().map { parseV3Session(it) }
        } else {
            val body = request("GET", "$BASE/v1/sessions?limit=$limit")
            body.optJSONArray("sessions").orEmpty().map { parseV1Session(it) }
        }
    }

    suspend fun session(id: String): Session = withContext(Dispatchers.IO) {
        val body = if (isV3) request("GET", scoped("/sessions/$id")) else request("GET", "$BASE/v1/sessions/$id")
        if (isV3) parseV3Session(body) else parseV1Session(body)
    }

    suspend fun messages(id: String, limit: Int = 200): List<Message> = withContext(Dispatchers.IO) {
        if (isV3) {
            val body = request("GET", scoped("/sessions/$id/messages?first=$limit"))
            body.optJSONArray("items").orEmpty().map {
                Message(
                    fromUser = it.optString("source") == "user",
                    text = it.optString("message"),
                    timestamp = epochMillis(it.opt("created_at")),
                )
            }
        } else {
            val body = request("GET", "$BASE/v1/sessions/$id")
            body.optJSONArray("messages").orEmpty().mapNotNull {
                val type = it.optString("type")
                val text = it.optString("message")
                if (text.isEmpty()) return@mapNotNull null
                Message(
                    fromUser = type == "user_message",
                    text = text,
                    timestamp = epochMillis(it.opt("timestamp")),
                )
            }
        }
    }

    suspend fun sendMessage(id: String, text: String) = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("message", text)
        if (isV3) request("POST", scoped("/sessions/$id/messages"), payload)
        else request("POST", "$BASE/v1/sessions/$id/message", payload)
        Unit
    }

    /** 返回 (sessionId, devin_mode)。响应里的 devin_mode 是 org 默认的解析结果（未显式传时）。 */
    suspend fun createSession(prompt: String, playbookId: String?, platform: String?, devinMode: String? = null): Pair<String, String?> = withContext(Dispatchers.IO) {
        val payload = JSONObject().put("prompt", prompt)
        if (!playbookId.isNullOrBlank()) payload.put("playbook_id", playbookId)
        if (!platform.isNullOrBlank()) payload.put("platform", platform)
        if (!devinMode.isNullOrBlank()) payload.put("devin_mode", devinMode)
        val body = if (isV3) request("POST", scoped("/sessions"), payload)
        else request("POST", "$BASE/v1/sessions", payload)
        body.optString("session_id").removePrefix("devin-") to
            body.optString("devin_mode").ifEmpty { null }
    }

    suspend fun deleteSession(id: String) = withContext(Dispatchers.IO) {
        if (isV3) request("DELETE", scoped("/sessions/$id")) else request("DELETE", "$BASE/v1/sessions/$id")
        Unit
    }

    suspend fun setArchived(id: String, archived: Boolean) = withContext(Dispatchers.IO) {
        // 归档端点只有 v3 提供；归档同时会让运行中的会话睡下。
        check(isV3) { "v1 API 不支持归档" }
        request("POST", scoped("/sessions/$id/${if (archived) "archive" else "unarchive"}"))
        Unit
    }

    /** 附件上传（multipart）→ 返回附件 url，拼进消息文本即可随 steer 发送。
     *  API key 上传失败（任意错误：HTTP 错或超时等）且 PAT 是 cog_ 时自动换 PAT 走 v3 端点重试。 */
    suspend fun uploadAttachment(fileName: String, mime: String, bytes: ByteArray): String =
        withContext(Dispatchers.IO) {
            try {
                uploadOnce(key, if (isV3) scoped("/attachments") else "$BASE/v1/attachments",
                    fileName, mime, bytes)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                val pat = (prefs as? Prefs)?.pat.orEmpty()
                if (!pat.startsWith("cog_")) throw e
                val patApi = DevinApi(MemoryCredentials(pat, prefs.orgId))
                patApi.uploadAttachment(fileName, mime, bytes)
            }
        }

    private fun uploadOnce(key: String, url: String, fileName: String, mime: String, bytes: ByteArray): String {
            val boundary = "----devinmobile" + System.nanoTime().toString(16)
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Authorization", "Bearer $key")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                doOutput = true
                connectTimeout = 15_000
                readTimeout = 120_000
            }
            try {
                conn.outputStream.use { out ->
                    out.write(
                        ("--$boundary\r\n" +
                            "Content-Disposition: form-data; name=\"file\"; filename=\"$fileName\"\r\n" +
                            "Content-Type: $mime\r\n\r\n").toByteArray()
                    )
                    out.write(bytes)
                    out.write("\r\n--$boundary--\r\n".toByteArray())
                }
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
                if (code !in 200..299) throw ApiException(code, errorMessage(code, text))
                val body = JSONObject(text)
                return body.optString("url").ifEmpty { body.optString("attachment_url") }
                    .ifEmpty { throw ApiException(code, "上传成功但未返回附件地址") }
            } finally {
                conn.disconnect()
            }
    }

    /** 用量统计：会话/搜索/PR 计数。 */
    suspend fun usageMetrics(): JSONObject = withContext(Dispatchers.IO) {
        check(isV3) { "v1 API 不支持用量统计" }
        request("GET", scoped("/metrics/usage"))
    }

    /** 每日 ACU 消耗（默认近 30 天）。 */
    suspend fun consumptionDaily(days: Int = 30): JSONObject = withContext(Dispatchers.IO) {
        check(isV3) { "v1 API 不支持用量统计" }
        val after = System.currentTimeMillis() / 1000 - days * 86400L
        request("GET", scoped("/consumption/daily?time_after=$after"))
    }

    /** 定时任务列表（Automations——schedules 已被其取代）。 */
    suspend fun automations(): JSONArray = withContext(Dispatchers.IO) {
        check(isV3) { "v1 API 不支持定时任务" }
        request("GET", scoped("/automations")).optJSONArray("items") ?: JSONArray()
    }

    suspend fun deleteAutomation(id: String) = withContext(Dispatchers.IO) {
        check(isV3) { "v1 API 不支持定时任务" }
        request("DELETE", scoped("/automations/$id"))
        Unit
    }

    suspend fun setAutomationEnabled(id: String, enabled: Boolean) = withContext(Dispatchers.IO) {
        check(isV3) { "v1 API 不支持定时任务" }
        request("PATCH", scoped("/automations/$id"), JSONObject().put("enabled", enabled))
        Unit
    }

    /** 新建定时任务：schedule:recurring 触发器（RRULE，UTC 计时）。
     *  targetSessionId 非空→每次触发往该会话发消息（复用同一会话），否则 start_session 开新会话。 */
    suspend fun createAutomation(name: String, rrule: String, prompt: String,
                                 targetSessionId: String? = null) =
        withContext(Dispatchers.IO) {
            check(isV3) { "v1 API 不支持定时任务" }
            val action = JSONObject()
            if (targetSessionId != null) {
                action.put("type", "message_session")
                    .put("prompt", prompt)
                    .put("target_devin_id", "devin-$targetSessionId")
            } else {
                action.put("type", "start_session").put("prompt", prompt)
            }
            request("POST", scoped("/automations"), JSONObject()
                .put("name", name)
                .put("run_as", JSONObject().put("type", "creator"))
                .put("triggers", JSONArray().put(JSONObject()
                    .put("event_type", "schedule:recurring")
                    .put("conditions", JSONObject().put("any", JSONArray().put(JSONObject()
                        .put("all", JSONArray().put(JSONObject()
                            .put("field", "rrule").put("operator", "recurrence")
                            .put("value", rrule))))))))
                .put("actions", JSONArray().put(action)))
            Unit
        }

    /** 设置页用：key 是否真的能通。 */
    suspend fun probe(): Boolean = withContext(Dispatchers.IO) {
        try {
            request("GET", if (isV3) "$BASE/v3/self" else "$BASE/v1/sessions?limit=1")
            true
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            false
        }
    }

    /** ACP 连 WebSocket 也要 org_id：探测并缓存。 */
    suspend fun resolveOrg(): String = withContext(Dispatchers.IO) {
        prefs.orgId.ifEmpty {
            request("GET", "$BASE/v3/self").optString("org_id").also { prefs.orgId = it }
        }
    }

    /** v3 接口前缀，首次调用时探测 org_id。 */
    private fun scoped(path: String): String {
        var org = prefs.orgId
        if (org.isEmpty()) {
            org = request("GET", "$BASE/v3/self").optString("org_id")
            if (org.isEmpty()) throw ApiException(400, "无法探测 org_id，请在设置里手动填写")
            prefs.orgId = org
        }
        return "$BASE/v3/organizations/$org$path"
    }

    private fun request(method: String, url: String, body: JSONObject? = null): JSONObject {
        if (key.isEmpty()) throw ApiException(401, "未配置 API key")
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Authorization", "Bearer $key")
            setRequestProperty("Accept", "application/json")
            connectTimeout = 15_000
            readTimeout = 60_000
        }
        try {
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            if (code !in 200..299) throw ApiException(code, errorMessage(code, text))
            if (text.isBlank()) return JSONObject()
            return if (text.trimStart().startsWith("[")) JSONObject().put("items", JSONArray(text))
            else JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    private fun errorMessage(code: Int, text: String): String {
        val detail = runCatching {
            val o = JSONObject(text)
            o.optString("detail").ifEmpty { o.optString("error") }
        }.getOrNull()
        return if (detail.isNullOrEmpty()) "HTTP $code" else "HTTP $code: $detail"
    }

    private fun parseV1Session(o: JSONObject) = Session(
        id = o.optString("session_id").removePrefix("devin-"),
        title = o.optString("title").ifEmpty { "(无标题)" },
        statusEnum = o.optString("status_enum").ifEmpty { o.optString("status") },
        updatedAt = epochMillis(o.opt("updated_at")),
        prUrl = o.optJSONObject("pull_request")?.prUrl(),
        prState = o.optJSONObject("pull_request")?.optString("pr_state"),
        statusDetail = o.optString("status_detail"),
        isArchived = o.optBoolean("is_archived"),
    )

    private fun parseV3Session(o: JSONObject) = Session(
        id = o.optString("session_id").removePrefix("devin-"),
        title = o.optString("title").ifEmpty { "(无标题)" },
        statusEnum = v3StatusEnum(o),
        updatedAt = epochMillis(o.opt("updated_at")),
        prUrl = o.optJSONArray("pull_requests")?.optJSONObject(0)?.prUrl(),
        prState = o.optJSONArray("pull_requests")?.optJSONObject(0)?.optString("pr_state"),
        statusDetail = o.optString("status_detail"),
        isArchived = o.optBoolean("is_archived"),
    )

    private fun v3StatusEnum(o: JSONObject): String = when (o.optString("status")) {
        "running" -> when (o.optString("status_detail")) {
            "finished" -> "finished"
            "waiting_for_user", "waiting_for_approval" -> "blocked"
            else -> "working"
        }
        "exit" -> "exited"
        "error" -> "expired"
        "suspended" -> "suspended"
        else -> "working"
    }

    companion object {
        private const val BASE = "https://api.devin.ai"

        /** 需要一个 v3 客户端时用——apiKey 是 cog_ 用它，否则 PAT 是 cog_ 就用 PAT
         *  （比如用量统计/automations 只有 v3 端点，v1 key 降级到 PAT）。 */
        fun v3(prefs: Prefs): DevinApi {
            val a = DevinApi(prefs)
            return if (a.isV3) a
            else DevinApi(MemoryCredentials(prefs.pat, prefs.orgId))
        }

        /** v1 返回 ISO 串，v3 返回 epoch 秒。 */
        fun epochMillis(value: Any?): Long = when (value) {
            is Number -> (value.toDouble() * 1000).toLong()
            is String -> parseIso(value)
            else -> 0L
        }

        private fun parseIso(text: String): Long {
            if (text.isEmpty()) return 0L
            text.toDoubleOrNull()?.let { return (it * 1000).toLong() }
            val cleaned = text.replace("Z", "+0000").replace(Regex("(\\.\\d+)"), "")
            for (pattern in arrayOf("yyyy-MM-dd'T'HH:mm:ssZ", "yyyy-MM-dd'T'HH:mm:ss")) {
                runCatching {
                    val fmt = SimpleDateFormat(pattern, Locale.US)
                    if (pattern.endsWith("ss")) fmt.timeZone = TimeZone.getTimeZone("UTC")
                    return fmt.parse(cleaned)!!.time
                }
            }
            return 0L
        }
    }
}

/** PR 对象在 v1 里字段名是 url，v3 里是 pr_url。 */
private fun JSONObject.prUrl(): String? =
    optString("pr_url").ifEmpty { optString("url") }.ifEmpty { null }

private fun JSONArray?.orEmpty(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}
