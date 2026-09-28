package com.nancy.devinmobile

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * 任务状态迁移检测（公共层）：prev 表共享，谁拉到会话列表都喂进来——
 * 列表页 10s 轮询是快路径，App 级 30s 兜底保证直进会话（通知/悬浮窗点开）
 * 也能收到完成/被阻提醒。同一迁移只弹一次（updatedAt 去重）。
 */
object StatusWatch {
    private val prevStatus = mutableMapOf<String, String>()
    private val prevTs = mutableMapOf<String, Long>()
    private val ACTIVE_STATES = setOf("working", "running")
    private val DONE_NOTIFY_STATES =
        setOf("finished", "stopped", "expired", "failed", "error", "suspended")
    // 进程退出：只在「干活中→退出」才算任务完成；已 finished/blocked 的会话
    // 闲置一段时间后被服务端退出时不能当第二次完成再弹。v1 原始枚举可能直接给 "exit"。
    private val EXITED_STATES = setOf("exited", "exit")
    private var started = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /** 每批拉到会话列表就喂（列表页刷新、兜底轮询共用）。
     *  判定不看「采到 working」而是「updatedAt 前进了且现在是终结态」——
     *  working→完成整段落在两次轮询之间的秒回短任务也不会漏。
     *  例外：退出（exited）只在上一态是干活中才报——finished/blocked 的会话
     *  闲置后被退出也会前进 updatedAt，不能重复弹。 */
    fun feed(ctx: Context, sessions: List<Session>) {
        val events = mutableListOf<Triple<String, String, String>>()
        sessions.forEach { s ->
            val ts = prevTs[s.id]
            if (ts != null && s.updatedAt > ts) when {
                s.statusEnum in DONE_NOTIFY_STATES ->
                    events += Triple(s.id, s.title, "任务已完成")
                s.statusEnum in EXITED_STATES && prevStatus[s.id] in ACTIVE_STATES ->
                    events += Triple(s.id, s.title, "任务已完成")
                // blocked 只在「非 blocked→blocked」弹，被阻期间反复更新不轰炸
                s.statusEnum == "blocked" && prevStatus[s.id] != "blocked" ->
                    events += Triple(s.id, s.title, "等待你处理")
            }
            prevTs[s.id] = maxOf(s.updatedAt, ts ?: 0)
            prevStatus[s.id] = s.statusEnum
        }
        if (events.isNotEmpty()) Notifier.statusAll(ctx, events)
    }

    /** 会话页实时态单独喂一条（ACP 推送/20s 轮询比兜底快）。
     *  没有服务端 updatedAt 可用——只认「工作态→终结态」的真迁移，不靠时间戳，
     *  否则终结态下每次 repaint 都会误报。报完把 prevTs 垫到当前时刻，
     *  避免下轮 feed 的 updatedAt 规则对同一次完成再报一遍。 */
    fun feedOne(ctx: Context, sid: String, title: String, status: String) {
        val p = prevStatus[sid]
        var fired = false
        if (p in ACTIVE_STATES && p != status) when (status) {
            in DONE_NOTIFY_STATES -> fired = true
            in EXITED_STATES -> fired = true
            "blocked" -> fired = true
        }
        prevStatus[sid] = status
        if (fired) {
            prevTs[sid] = maxOf(System.currentTimeMillis(), prevTs[sid] ?: 0)
            Notifier.statusAll(ctx, listOf(Triple(sid, title,
                if (status == "blocked") "等待你处理" else "任务已完成")))
        }
    }

    /** App 启动即跑：每 30s 兜底拉一次列表做迁移检测（独立于列表页是否活着）。
     *  间隔太长会漏掉「秒完成的短任务」——working→done 整段落在两次拉取之间。 */
    fun start(ctx: Context) {
        if (started) return
        started = true
        scope.launch {
            while (isActive) {
                try {
                    val prefs = Prefs(ctx)
                    if (prefs.configured) {
                        val api = if (prefs.pat.startsWith("cog_"))
                            DevinApi(MemoryCredentials(prefs.pat, prefs.orgId))
                        else DevinApi(prefs)
                        feed(ctx, api.listSessions())
                    }
                } catch (e: Exception) { }
                delay(30_000)
            }
        }
    }
}
