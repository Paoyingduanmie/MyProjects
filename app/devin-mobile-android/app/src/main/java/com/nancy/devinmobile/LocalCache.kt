package com.nancy.devinmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * 本地磁盘缓存：最后一次拉到的会话列表与每个会话的消息流，
 * 供离线或请求失败时兜底展示。「清除缓存」清这里 + 更新下载包。
 */
object LocalCache {

    private fun dir(ctx: Context) = File(ctx.filesDir, "localcache").apply { mkdirs() }

    fun saveSessions(ctx: Context, sessions: List<Session>) {
        val arr = JSONArray()
        sessions.forEach { s ->
            arr.put(JSONObject().apply {
                put("id", s.id)
                put("title", s.title)
                put("statusEnum", s.statusEnum)
                put("updatedAt", s.updatedAt)
                put("prUrl", s.prUrl)
                put("prState", s.prState)
                put("statusDetail", s.statusDetail)
                put("isArchived", s.isArchived)
            })
        }
        File(dir(ctx), "sessions.json").writeText(arr.toString())
    }

    fun loadSessions(ctx: Context): List<Session>? =
        File(dir(ctx), "sessions.json").takeIf { it.isFile }?.readText()?.let { raw ->
            runCatching {
                JSONArray(raw).let { arr ->
                    (0 until arr.length()).map { i ->
                        arr.getJSONObject(i).run {
                            Session(
                                id = getString("id"),
                                title = getString("title"),
                                statusEnum = optString("statusEnum"),
                                updatedAt = optLong("updatedAt"),
                                prUrl = optString("prUrl").ifEmpty { null },
                                prState = optString("prState").ifEmpty { null },
                                statusDetail = optString("statusDetail"),
                                isArchived = optBoolean("isArchived"),
                            )
                        }
                    }
                }
            }.getOrNull()
        }

    fun saveMessages(ctx: Context, sessionId: String, messages: List<Message>) {
        val arr = JSONArray()
        messages.forEach { m ->
            arr.put(JSONObject().apply {
                put("fromUser", m.fromUser)
                put("text", m.text)
                put("timestamp", m.timestamp)
            })
        }
        File(dir(ctx), "messages-$sessionId.json").writeText(arr.toString())
    }

    fun loadMessages(ctx: Context, sessionId: String): List<Message>? =
        File(dir(ctx), "messages-$sessionId.json").takeIf { it.isFile }?.readText()?.let { raw ->
            runCatching {
                JSONArray(raw).let { arr ->
                    (0 until arr.length()).map { i ->
                        arr.getJSONObject(i).run {
                            Message(
                                fromUser = optBoolean("fromUser"),
                                text = optString("text"),
                                timestamp = optLong("timestamp"),
                            )
                        }
                    }
                }
            }.getOrNull()
        }

    fun clear(ctx: Context) {
        dir(ctx).deleteRecursively()
    }
}
