package com.nancy.devinmobile

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** @ 弹层数据源：skills（本地可维护列表）+ playbooks（v3 接口）+ sessions（本地会话列表）。 */
object Mentions {

    class Item(val kind: String, val label: String, val insert: String)

    /** 服务端没有可枚举 skills 的接口——用种子列表，用户可在设置里覆盖（逗号分隔）。 */
    const val SKILL_SEED =
        "android-emulator-e2e,analyzing-sessions,creating-code-scans," +
        "managing-automations,managing-playbooks,managing-child-sessions," +
        "dynamic-workflows,data-analysis,interactive-artifacts," +
        "狗头军师,glill me"

    fun skillItems(csv: String): List<Item> =
        csv.ifBlank { SKILL_SEED }
            .split(Regex("[,，\n]")).map { it.trim() }.filter { it.isNotEmpty() }
            .map { Item("skill", it, "@skills:$it") }

    suspend fun playbookItems(prefs: Prefs): List<Item> = withContext(Dispatchers.IO) {
        try {
            if (prefs.pat.isEmpty() || prefs.orgId.isEmpty()) return@withContext emptyList()
            val conn = URL(
                "https://api.devin.ai/v3/organizations/${prefs.orgId}/playbooks?limit=100"
            ).openConnection() as HttpURLConnection
            conn.setRequestProperty("Authorization", "Bearer ${prefs.pat}")
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            if (conn.responseCode !in 200..299) {
                conn.disconnect()
                return@withContext emptyList()
            }
            val body = conn.inputStream.bufferedReader().readText()
            conn.disconnect()
            val arr = JSONObject(body).optJSONArray("items")
            (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                val o = arr!!.optJSONObject(i) ?: return@mapNotNull null
                val id = o.optString("id").ifEmpty { o.optString("playbook_id") }
                val t = o.optString("title").ifEmpty { o.optString("name") }
                if (id.isEmpty() || t.isEmpty()) null else Item("playbook", t, "@playbook:$id")
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun sessionItems(acp: AcpClient?, excludeId: String): List<Item> {
        if (acp == null) return emptyList()
        return try {
            acp.listSessions().mapNotNull {
                val n = AcpClient.normAcpSession(it)
                val sid = n.optString("session_id")
                if (sid.isEmpty() || sid == excludeId || n.optBoolean("archived")) null
                else Item("session", n.optString("title").ifEmpty { "(无标题)" }, "@devin-$sid")
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}
