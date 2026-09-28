package com.nancy.devinmobile

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet

/**
 * ACP 实时通道：wss://app.devin.ai/api/acp/live 上的 JSON-RPC。
 * 覆盖 web/app.js 的 acp 层：initialize/resume/prompt/set_config_option/
 * rename/markRead/pin/setTags/bulkArchive/cancelTurn/stop/reboot/heartbeat/
 * secret·plan·queuedMessages·spending-limit·folder。
 */
class AcpClient(private val pat: String, private val org: String) {

    // pingInterval：WS 心跳，防止 NAT/代理在空闲时掐线（默认 0 不发心跳→经常断连）
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val http = OkHttpClient.Builder()
        .pingInterval(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()
    private var ws: WebSocket? = null
    private var rpcId = 0
    private val pending = ConcurrentHashMap<Int, CompletableDeferred<JSONObject>>()
    private val connectLock = Mutex()
    private var connecting: CompletableDeferred<Unit>? = null
    @Volatile private var connected = false

    private val updateHandlers = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    private val requestHandlers = CopyOnWriteArraySet<(JSONObject) -> Boolean>()
    private val closeHandlers = CopyOnWriteArraySet<() -> Unit>()

    // 返回解绑函数：切会话时旧页面把自己从共享连接上摘下来，闭包不泄漏
    fun onUpdate(h: (JSONObject) -> Unit): () -> Unit {
        updateHandlers.add(h); return { updateHandlers.remove(h) }
    }
    fun onRequest(h: (JSONObject) -> Boolean): () -> Unit {
        requestHandlers.add(h); return { requestHandlers.remove(h) }
    }
    fun onClose(h: () -> Unit): () -> Unit {
        closeHandlers.add(h); return { closeHandlers.remove(h) }
    }

    /** 确保 WS 已连并完成 initialize；并发调用共享同一次连接尝试。
     *  锁内只登记 connecting/deferred，await 在锁外——initialize 自身也要过 connect()，
     *  锁内 await 会和它互等（死锁）。 */
    suspend fun connect() {
        val deferred = connectLock.withLock {
            if (connected) return
            connecting ?: try {
                CompletableDeferred<Unit>().also { connecting = it; openSocket(it) }
            } catch (e: Throwable) {
                connecting = null
                throw e
            }
        }
        try {
            withTimeout(45_000) { deferred.await() }
            connectLock.withLock {
                if (connecting === deferred) connecting = null
                connected = true
            }
        } catch (e: Throwable) {
            connectLock.withLock { if (connecting === deferred) connecting = null }
            ws?.cancel()
            throw e
        }
    }

    private fun openSocket(deferred: CompletableDeferred<Unit>) {
        val url = "wss://app.devin.ai/api/acp/live?token=${URLEncoder.encode(pat, "UTF-8")}" +
            "&org_id=${URLEncoder.encode(org, "UTF-8")}"
        val req = Request.Builder().url(url).build()
        val socket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                scope.launch {
                    try {
                        rawRpc("initialize", JSONObject()
                            .put("protocolVersion", 2)
                            .put("clientCapabilities", CAPS)
                            .put("capabilities", CAPS)
                            .put("clientInfo", JSONObject().put("name", "devin-mobile-android").put("version", "0"))
                            .put("info", JSONObject().put("name", "devin-mobile-android").put("version", "0")))
                        deferred.complete(Unit)
                    } catch (e: Throwable) {
                        deferred.completeExceptionally(e)
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) = onWsMessage(text)

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (!deferred.isCompleted) deferred.completeExceptionally(t)
                handleClose()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = handleClose()
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }
        })
        this.ws = socket
    }

    private fun handleClose() {
        ws = null
        connected = false
        val err = ApiException(0, "连接断开")
        connecting?.let { if (!it.isCompleted) it.completeExceptionally(err) }
        connecting = null
        pending.values.forEach { it.completeExceptionally(err) }
        pending.clear()
        closeHandlers.forEach { it() }
    }

    private fun onWsMessage(text: String) {
        val o = try { JSONObject(text) } catch (e: Exception) { return }
        if (o.has("id") && (o.has("result") || o.has("error"))) {
            val p = pending.remove(o.getInt("id")) ?: return
            if (o.has("error")) {
                val msg = o.optJSONObject("error")?.optString("message") ?: o.optString("error")
                p.completeExceptionally(ApiException(0, msg.ifEmpty { "rpc error" }))
            } else {
                p.complete(o.optJSONObject("result") ?: JSONObject())
            }
            return
        }
        when (o.optString("method")) {
            "session/update" -> {
                val params = o.optJSONObject("params") ?: return
                updateHandlers.forEach { it(params) }
            }
            "ext/notification" -> {
                val inner = o.optJSONObject("params") ?: return
                when (inner.optString("method")) {
                    "_cognition.ai/session_update_batch" -> {
                        val ip = inner.optJSONObject("params") ?: return
                        val sid = ip.optString("sessionId")
                        val updates = ip.optJSONArray("updates") ?: return
                        for (i in 0 until updates.length()) {
                            val params = JSONObject()
                                .put("sessionId", sid)
                                .put("update", updates.get(i))
                            updateHandlers.forEach { it(params) }
                        }
                    }
                    "\$/cancel_request" -> {
                        val ip = inner.optJSONObject("params") ?: return
                        pending.remove(ip.optInt("requestId", -1))
                            ?.completeExceptionally(ApiException(0, "cancelled"))
                    }
                }
            }
            else -> {
                // 服务端请求（权限询问等）：交给已注册处理器，没人接就按 web 逻辑默认拒绝
                if (o.optString("method").isNotEmpty() && o.has("id")) {
                    var answered = false
                    requestHandlers.forEach { if (it(o)) answered = true }
                    if (!answered) {
                        if (o.optString("method") == "session/request_permission") {
                            sendRaw(JSONObject().put("jsonrpc", "2.0").put("id", o.getInt("id"))
                                .put("result", JSONObject().put("outcome",
                                    JSONObject().put("outcome", "cancelled"))))
                        } else {
                            sendRaw(JSONObject().put("jsonrpc", "2.0").put("id", o.getInt("id"))
                                .put("error", JSONObject().put("code", -32601)
                                    .put("message", "method not supported by client")))
                        }
                    }
                }
            }
        }
    }

    fun sendRaw(o: JSONObject) = ws?.send(o.toString())

    fun respond(id: Int, result: JSONObject) =
        sendRaw(JSONObject().put("jsonrpc", "2.0").put("id", id).put("result", result))

    suspend fun rpc(method: String, params: JSONObject): JSONObject {
        connect()
        return rawRpc(method, params)
    }

    /** 发 rpc 不触发 connect——onOpen 的 initialize 专用（否则和 connect() 互等死锁）。 */
    private suspend fun rawRpc(method: String, params: JSONObject): JSONObject {
        val id = ++rpcId
        val deferred = CompletableDeferred<JSONObject>()
        pending[id] = deferred
        // 后台回来常遇死连接：send 返回 false/null 立即判定断开，
        // 否则这条 rpc 要干等 30s 超时才走重连
        if (sendRaw(JSONObject().put("jsonrpc", "2.0").put("id", id)
            .put("method", method).put("params", params)) != true) {
            pending.remove(id)
            handleClose()
            throw ApiException(0, "连接断开")
        }
        return try {
            withTimeout(30_000) { deferred.await() }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            pending.remove(id)
            throw ApiException(0, "rpc timeout")
        }
    }

    /* ---- 会话级调用（与 web acp 方法一一对应） ---- */

    suspend fun listSessions(): List<JSONObject> {
        val r = rpc("session/list", JSONObject())
        val arr = r.optJSONArray("sessions") ?: return emptyList()
        return (0 until arr.length()).map { arr.getJSONObject(it) }
    }

    suspend fun resume(sessionId: String): JSONObject = rpc("session/resume", JSONObject()
        .put("sessionId", sessionId).put("cwd", "/").put("protocolVersion", 2)
        .put("plainReconnect", false).put("useTailReplay", true))

    suspend fun prompt(sessionId: String, text: String): JSONObject = rpc("session/prompt",
        JSONObject().put("sessionId", sessionId)
            .put("prompt", JSONArray().put(JSONObject().put("type", "text").put("text", text))))

    suspend fun setConfig(sessionId: String, configId: String, value: String): JSONObject =
        rpc("session/set_config_option",
            JSONObject().put("sessionId", sessionId).put("configId", configId).put("value", value))

    suspend fun rename(sessionId: String, title: String): JSONObject =
        rpc("_cognition.ai/session/rename",
            JSONObject().put("sessionId", sessionId).put("title", title))

    suspend fun markRead(sessionId: String) {
        runCatching { rpc("_cognition.ai/session/markRead",
            JSONObject().put("sessionId", sessionId)) }
    }

    /** 打断当前轮次（web 输入框右下角 ■「Stop Devin」）：会话继续活着，可接着发消息。 */
    suspend fun cancelTurn(sessionId: String): JSONObject =
        rpc("session/cancel", JSONObject().put("sessionId", sessionId))

    /** 停止整个会话（web 菜单「Stop session」）：关 VM、标记 done。 */
    suspend fun stop(sessionId: String): JSONObject =
        rpc("_cognition.ai/session/stop", JSONObject().put("sessionId", sessionId))

    suspend fun reboot(sessionId: String): JSONObject =
        rpc("_cognition.ai/session/reboot", JSONObject().put("sessionId", sessionId))

    suspend fun heartbeat(sessionId: String) {
        runCatching { rpc("_cognition.ai/session/heartbeat",
            JSONObject().put("sessionId", sessionId)) }
    }

    suspend fun pin(sessionId: String, pinned: Boolean): JSONObject =
        rpc("_cognition.ai/session/pin",
            JSONObject().put("sessionId", sessionId).put("pinned", pinned))

    suspend fun setTags(sessionId: String, tags: List<String>): JSONObject =
        rpc("_cognition.ai/session/setTags", JSONObject().put("sessionId", sessionId)
            .put("tags", JSONArray(tags)))

    suspend fun bulkArchive(ids: List<String>, archive: Boolean): JSONObject =
        rpc("_cognition.ai/sessions/bulkArchive", JSONObject()
            .put("sessionIds", JSONArray(ids)).put("archive", archive))

    suspend fun moveToFolder(sessionId: String, folder: String?): JSONObject =
        rpc("_cognition.ai/session/moveToFolder", JSONObject()
            .put("sessionId", sessionId)
            .put("folder", folder ?: JSONObject.NULL))

    suspend fun folderCreate(folder: String): JSONObject =
        rpc("_cognition.ai/folder/create", JSONObject().put("orgId", org).put("folder", folder))

    suspend fun folderList(): JSONObject = rpc("_cognition.ai/folder/list", JSONObject())

    suspend fun provideSecret(sessionId: String, requestId: String, name: String, value: String): JSONObject =
        rpc("_cognition.ai/secret/provide", JSONObject()
            .put("session_id", sessionId).put("request_id", requestId)
            .put("secret_name", name).put("secret_value", value))

    /** 云端审批卡回执：session/update 的 permission_request 事件由此批准/拒绝。 */
    suspend fun permissionRespond(sessionId: String, permissionRequestId: String, approved: Boolean): JSONObject =
        rpc("_cognition.ai/permission/respond", JSONObject()
            .put("sessionId", sessionId)
            .put("permissionRequestId", permissionRequestId)
            .put("approved", approved))

    suspend fun planAccept(sessionId: String, planId: String, eventId: String): JSONObject =
        rpc("_cognition.ai/plan/accept", JSONObject()
            .put("sessionId", sessionId).put("planId", planId)
            .put("acceptedEventId", eventId))

    suspend fun planEdit(sessionId: String, planId: String, body: String): JSONObject =
        rpc("_cognition.ai/plan/edit", JSONObject()
            .put("sessionId", sessionId).put("planId", planId).put("body", body))

    suspend fun queuedUpdate(sessionId: String, id: String, op: String, message: String? = null): JSONObject {
        val p = JSONObject().put("sessionId", sessionId).put("id", id).put("op", op)
        // 服务端 QueuedMessageInput 是 dict：{"message": "..."}，不是裸字符串
        if (message != null) p.put("message", JSONObject().put("message", message))
        return rpc("_cognition.ai/queuedMessages/update", p)
    }

    suspend fun setSpendingLimit(sessionId: String, maxCredits: Double?): JSONObject =
        rpc("_cognition.ai/session-spending-limit/set", JSONObject()
            .put("session_id", sessionId)
            .put("max_credits", maxCredits ?: JSONObject.NULL))

    fun close() { ws?.close(1000, null) }

    // iapi REST：app.devin.ai/api/<path>，Bearer PAT

    suspend fun iapiGet(path: String): JSONObject = withContext(Dispatchers.IO) {
        val conn = URL("https://app.devin.ai/api$path").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "GET"
            conn.setRequestProperty("Authorization", "Bearer $pat")
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.readText() ?: ""
            if (code !in 200..299) throw ApiException(code, text.ifEmpty { "HTTP $code" })
            JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        /** 与 web CAPS 一致。 */
        val CAPS: JSONObject = JSONObject()
            .put("fs", JSONObject().put("readTextFile", false).put("writeTextFile", false))
            .put("terminal", false)
            .put("_meta", JSONObject()
                .put("cognition.ai/messageGrouping", true)
                .put("cognition.ai/toolCallQuestions", true)
                .put("cognition.ai/sidechains", true)
                .put("cognition.ai/replayBatch", true)
                .put("cognition.ai/wholeUserMessages", true))

        /** 用 PAT 自己探测 org（不依赖 Devin API key 的类型）。 */
        suspend fun probeOrg(pat: String): String = withContext(Dispatchers.IO) {
            val conn = URL("https://api.devin.ai/v3/self").openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "GET"
                conn.setRequestProperty("Authorization", "Bearer $pat")
                conn.connectTimeout = 15_000
                conn.readTimeout = 15_000
                val code = conn.responseCode
                val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.readText() ?: ""
                if (code !in 200..299) throw ApiException(code, text.ifEmpty { "HTTP $code" })
                JSONObject(text).optString("org_id")
            } finally {
                conn.disconnect()
            }
        }

        fun stripDevin(id: String) = id.removePrefix("devin-")
        fun addDevin(id: String) = if (id.startsWith("devin-")) id else "devin-$id"

        fun g(meta: JSONObject, k: String): String =
            if (meta.has("cognition.ai/$k")) meta.opt("cognition.ai/$k")?.toString() ?: "" else ""

        /** normAcpSession：ACP session/list 项 → 统一字段。 */
        fun normAcpSession(s: JSONObject): JSONObject {
            val m = s.optJSONObject("_meta") ?: JSONObject()
            val tags = m.optJSONArray("cognition.ai/sessionTags") ?: s.optJSONArray("tags")
            return JSONObject()
                .put("session_id", stripDevin(s.optString("sessionId")))
                .put("title", s.optString("title"))
                .put("status_enum",
                    g(m, "statusEnum").ifEmpty { g(m, "sessionStatus") }.ifEmpty { "working" })
                .put("updated_at", s.opt("updatedAt") ?: g(m, "sortUpdatedAt"))
                .put("created_at", g(m, "createdAt"))
                .put("model", g(m, "devinVersionOverride"))
                .put("excerpt", g(m, "messageExcerpts"))
                .put("unread", m.optBoolean("cognition.ai/isUnread"))
                .put("starred",
                    m.optBoolean("cognition.ai/isStarred") || m.optBoolean("cognition.ai/isPinned"))
                .put("archived", m.optBoolean("cognition.ai/isArchived"))
                .put("tags", tags ?: JSONArray())
                .put("acu_limit", g(m, "maxAcuLimit"))
                .put("url", g(m, "url"))
        }
    }
}
