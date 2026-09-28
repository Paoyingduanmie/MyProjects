package com.nancy.devinmobile

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

/**
 * 会话详情。两种模式与 web/app.js 对齐：
 * - REST 轮询：没配 PAT 时用，4 秒拉一次 /messages；
 * - ACP 实时：配了 PAT 时连 wss://app.devin.ai/api/acp/live，
 *   事件流 + 模型 chips + 排队消息 + 停止/星标/权限卡片/计划审批/机密卡片/保活。
 */
class SessionActivity : AppCompatActivity() {

    private lateinit var api: DevinApi
    private lateinit var prefs: Prefs
    private lateinit var sessionId: String
    /** 当前打开的会话 id——提醒层用它过滤"正在看的会话不弹跳自己" */
    internal val currentSid get() = if (::sessionId.isInitialized) sessionId else ""
    private lateinit var list: RecyclerView
    private lateinit var status: TextView
    private lateinit var input: EditText
    private val adapter = MessageAdapter()
    private var poller: Job? = null
    private var pinnedToBottom = true
    private var userScrolling = false   // DRAGGING/SETTLING：滚动由用户手势驱动
    private var atTop = false
    private var reachedTop = false   // 必须真的滚到顶过才显示「加载更早」（对齐官方：滑到极限才出现）

    // ACP
    private var acp: AcpClient? = null
    private var store = EventStore()
    private lateinit var eventAdapter: EventAdapter
    private var acpMode = false
    private var gone = false
    private var inFg = true
    private val BG_MS = 60_000L   // 后台降频：60s 拉一次，回来基本是新鲜的
    private var olderCursor: String? = null
    private var loadingOlder = false
    private var lastSeen = 0
    private var lastCacheWrite = 0L
    private var cacheDirty = false
    private var kaJob: Job? = null
    private var detJob: Job? = null
    private var retryJob: Job? = null
    /** 密集事件增量游标：row_id 单调增，轮询只拉这之后的新事件。 */
    private var lastRowId = 0L
    private var handlersBound = false
    private val unbinds = mutableListOf<() -> Unit>()
    private val refreshLock = Mutex()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        prefs = Prefs(this)
        api = DevinApi(prefs)
        sessionId = intent.getStringExtra(EXTRA_ID).orEmpty()
        // 10 分钟内切回同一会话：暂存的连接+消息流直接复用，秒开不重载
        LinkHolder.take(sessionId)?.let {
            acp = it.acp; acpPat = prefs.pat; store = it.store
            acpMode = prefs.pat.isNotEmpty()
        }
        setContentView(R.layout.activity_session)

        findViewById<TextView>(R.id.title).text =
            intent.getStringExtra(EXTRA_TITLE).takeUnless { it.isNullOrEmpty() || it == "null" } ?: sessionId
        findViewById<View>(R.id.back).setOnClickListener { finish() }
        status = findViewById(R.id.status)
        input = findViewById(R.id.input)

        val savedDraft = prefs.draft(sessionId)
        if (savedDraft.isNotEmpty()) input.setText(savedDraft)
        input.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable) {
                prefs.setDraft(sessionId, s.toString())
                maybeShowMentions()
            }
        })

        list = findViewById(R.id.messages)
        list.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        list.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrollStateChanged(rv: RecyclerView, s: Int) {
                userScrolling = s == RecyclerView.SCROLL_STATE_DRAGGING ||
                    s == RecyclerView.SCROLL_STATE_SETTLING
            }
            override fun onScrolled(recycler: RecyclerView, dx: Int, dy: Int) {
                // 贴底判定只认用户驱动滚动：程序化 scrollToPosition/prepend 的事件
                // 落在未布局完的过渡帧上（末条还没画上），会把 pin 误判成 false，
                // 之后自适应锚定不再切回贴底，进场被留在顶部。
                // 上滚立即解除贴底——只判"末条可见"的话，上翻过程中末条仍可见的窗口里
                // 任何 repaint 都会把人拽回底（流式期必中），这里要看过才能再钉回去
                val lm = recycler.layoutManager as LinearLayoutManager
                if (userScrolling)
                    pinnedToBottom = if (dy < 0) false
                        else lm.findLastVisibleItemPosition() >= adapterCount() - 1
                if (pinnedToBottom) findViewById<View>(R.id.new_msgs).visibility = View.GONE
                // 「加载更早」只在滑到已载历史顶端时才出现（对齐 web：按钮在消息流最顶部）
                atTop = !recycler.canScrollVertically(-1)
                // 真的上滚到顶（dy<0）才标记 reachedTop；内容不足一屏时不算
                if (atTop && dy < 0) reachedTop = true
                // ACP：上滚接近顶端自动加载更早（无限滚动，对齐官方）
                if (acpMode && dy < 0 && olderCursor != null && !loadingOlder &&
                    lm.findFirstVisibleItemPosition() <= 2) loadOlder()
                // ACP 模式的「加载更早」是消息流首条（EventAdapter.hasOlder），悬浮钮只给 REST 模式用
                findViewById<View>(R.id.older).visibility =
                    if (!acpMode && olderCursor != null && atTop && reachedTop) View.VISIBLE else View.GONE
            }
        })
        findViewById<View>(R.id.new_msgs).setOnClickListener {
            it.visibility = View.GONE
            pinnedToBottom = true
            list.scrollToPosition(maxOf(adapterCount() - 1, 0))
        }
        // 自适应锚定：内容不足一屏时 stackFromEnd 会把所有行锚在底部、顶部整片留白
        // （一次折叠把几十行压成一行时正好踩中）——放得下就改顶部锚定把空白挪到底部；
        // 超过一屏回贴底锚，但只在贴底状态下切回，避免把正在上翻的人拽走
        list.viewTreeObserver.addOnGlobalLayoutListener {
            val lm = list.layoutManager as? LinearLayoutManager ?: return@addOnGlobalLayoutListener
            val scrollable = list.canScrollVertically(-1) || list.canScrollVertically(1)
            val want = scrollable && (lm.stackFromEnd || pinnedToBottom)
            if (lm.stackFromEnd != want) lm.stackFromEnd = want
            // 已到顶且还有更早历史就自动向上补载：不等手势，填满屏幕为止
            if (acpMode && olderCursor != null && !loadingOlder &&
                !list.canScrollVertically(-1)) loadOlder()
        }
        findViewById<View>(R.id.drawer_handle).setOnClickListener { showSessionSwitch() }

        findViewById<Button>(R.id.send).setOnClickListener { send() }
        attachBtn = findViewById(R.id.attach)
        attachBtn.setOnClickListener { pickFile.launch("*/*") }
        findViewById<Button>(R.id.stop).setOnClickListener { stopDevin() }
        findViewById<Button>(R.id.reboot).setOnClickListener { reboot() }
        findViewById<Button>(R.id.older).setOnClickListener { loadOlder() }
        findViewById<Button>(R.id.star).setOnClickListener { toggleStar() }

        findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.drawer_list).apply {
            layoutManager = androidx.recyclerview.widget.LinearLayoutManager(this@SessionActivity)
            adapter = drawerAdapter
        }
        // 边缘滑动开抽屉也要触发加载（原来只挂在把手点击上，划开永远空白）
        findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.drawer)
            .addDrawerListener(object : androidx.drawerlayout.widget.DrawerLayout.SimpleDrawerListener() {
                override fun onDrawerOpened(drawerView: View) = loadDrawerSessions()
            })
        findViewById<TextView>(R.id.drawer_automations).setOnClickListener {
            findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.drawer)
                .closeDrawer(androidx.core.view.GravityCompat.START)
            startActivity(Intent(this, AutomationsActivity::class.java))
        }

        acpMode = prefs.pat.isNotEmpty()
        if (acpMode) {
            eventAdapter = EventAdapter(::onItemAction)
            list.adapter = eventAdapter
            // 暂存复用的 store 已有内容：不等 resume 先画一遍（chips/消息秒显）
            if (store.items.isNotEmpty()) repaint()
            // acp 等 resolveOrg 后延迟创建（org_id 可能还没探测过）
            // 先秒显上次缓存（对齐 web localStorage），ACP 数据到达后覆盖
            LocalCache.loadMessages(this, sessionId)?.let { cached ->
                if (cached.isNotEmpty() && eventAdapter.itemCount == 0) {
                    eventAdapter.submit(cached.mapIndexed { i, m ->
                        ChatItem("cache-$i",
                            if (m.fromUser) ChatKind.USER else ChatKind.DEVIN,
                            text = m.text)
                    })
                    list.scrollToPosition(eventAdapter.itemCount - 1)
                }
            }
        } else {
            list.adapter = adapter
            // 离线兜底：先展示上次缓存的消息流
            LocalCache.loadMessages(this, sessionId)?.let { cached ->
                if (adapter.itemCount == 0 && adapter.submit(cached)) {
                    list.scrollToPosition(adapter.itemCount - 1)
                }
            }
        }
    }

    private fun flushMessageCache() {
        if (!cacheDirty) return
        cacheDirty = false
        lastCacheWrite = System.currentTimeMillis()
        val snapshot = store.items
            .filter { it.kind == ChatKind.USER || it.kind == ChatKind.DEVIN }
            .map { Message(it.kind == ChatKind.USER, it.text, 0) }
        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            LocalCache.saveMessages(applicationContext, sessionId, snapshot)
        }
    }

    private fun openWeb(url: String) {
        startActivity(Intent(this, WebActivity::class.java).putExtra("url", url))
    }

    private fun adapterCount() = if (acpMode) eventAdapter.itemCount else adapter.itemCount

    override fun onResume() {
        super.onResume()
        inFg = true
        // PAT 在设置页改过时换客户端——否则 mode 一直停在旧凭据直到重启
        if (prefs.pat != acpPat) {
            acp?.close(); acp = null; acpPat = prefs.pat
            acpMode = prefs.pat.isNotEmpty()
        }
        if (acpMode) startAcp() else {
            poller?.cancel()
            poller = lifecycleScope.launch {
                while (isActive) {
                    refresh()
                    delay(if (inFg) POLL_MS else BG_MS)
                }
            }
        }
    }

    override fun onPause() {
        super.onPause()
        if (acpMode) flushMessageCache()
        inFg = false
        // 轮询/详情不取消只降频：后台 60s 拉一次，回前台不用等数据
        // kaJob/retryJob 同样存活：保活心跳+断线重连在后台继续跑
        if (acpMode) {
            gone = true
            acp?.let { lifecycleScope.launch { it.markRead(AcpClient.addDevin(sessionId)) } }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        mentionPopup?.dismiss()
        // 暂存 10 分钟再释放：切会话/返回列表都先留着，切回同会话秒开
        if (acpMode && acp != null) {
            unbinds.forEach { it() }
            unbinds.clear()
            // 暂存期间挂无界面接收器：update 持续写进 store，回切时最新事件已就位
            val sid = sessionId
            val st = store
            val stTitle = findViewById<TextView>(R.id.title)?.text?.toString() ?: sid
            var lastNotify = 0L
            val unbind = acp!!.onUpdate { params ->
                if (AcpClient.stripDevin(params.optString("sessionId")) == sid) {
                    val before = st.items.size
                    st.applyUpdate(params)
                    // 来了新的 Devin 消息→瞬时通知（30s 防抖，群聊洪水不炸）
                    val now = System.currentTimeMillis()
                    if (st.items.size > before &&
                        st.items.lastOrNull()?.kind == ChatKind.DEVIN &&
                        now - lastNotify > 30_000) {
                        lastNotify = now
                        Notifier.msg(this@SessionActivity, sid, stTitle)
                    }
                }
            }
            LinkHolder.put(sessionId, acp!!, store, unbind)
        } else acp?.close()
    }

    /* ================= ACP 实时模式 ================= */

    private fun startAcp() {
        gone = false
        val a = acp
        if (a == null) {
            // 先探 org 再建连
            lifecycleScope.launch {
                try {
                    val org = AcpClient.probeOrg(prefs.pat)
                    if (gone) return@launch
                    if (org.isEmpty()) {
                        fallbackToRest("org 探测为空")
                        return@launch
                    }
                    prefs.orgId = org
                    acp = AcpClient(prefs.pat, org); acpPat = prefs.pat
                    startAcp()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    fallbackToRest("org 探测失败：${e.message}")
                }
            }
            return
        }
        val devinId = AcpClient.addDevin(sessionId)

        // 处理器一个客户端只绑一次：onResume→startAcp 会在同一 a 上反复 add，
        // CopyOnWriteArraySet 不去重，进出几回事件就被处理几遍
        if (!handlersBound) {
            handlersBound = true
        unbinds += a.onUpdate { params ->
            if (AcpClient.stripDevin(params.optString("sessionId")) != sessionId) return@onUpdate
            // applyUpdate 必须和 repaint 同在 UI 线程——WS 回调线程改列表时主线程
            // 正在遍历会 ConcurrentModification
            runOnUiThread {
                store.applyUpdate(params)
                repaint()
            }
        }
        unbinds += a.onRequest { o ->
            if (o.optString("method") != "session/request_permission") return@onRequest false
            val p = o.optJSONObject("params") ?: return@onRequest false
            val sid = AcpClient.stripDevin(p.optString("sessionId")
                .ifEmpty { p.optString("session_id") })
            if (sid.isNotEmpty() && sid != sessionId) return@onRequest false
            val tc = p.optJSONObject("toolCall") ?: JSONObject()
            val opts = p.optJSONArray("options")
            val list = if (opts != null && opts.length() > 0)
                (0 until opts.length()).map {
                    opts.getJSONObject(it).optString("optionId") to opts.getJSONObject(it).optString("name")
                }
            else listOf("allow" to "允许", "reject" to "拒绝")
            runOnUiThread {
                store.push(ChatItem("perm-${o.optInt("id")}", ChatKind.PERM,
                    reqId = o.optInt("id"),
                    title = tc.optString("title").ifEmpty { tc.optString("kind", "Devin 请求权限") },
                    options = list))
                repaint()
            }
            true
        }
        unbinds += a.onClose {
            if (gone) return@onClose
            store.statusText = "连接断开，正在重连…"
            runOnUiThread { repaint() }
            lifecycleScope.launch {
                delay(1500)
                var fails = 0
                while (!gone && acpMode) {
                    try {
                        val r = a.resume(devinId)
                        // 只在拿到非空配置时替换——空响应不清空，避免 chips 闪烁消失
                        r.optJSONArray("configOptions").orEmpty().takeIf { it.length() > 0 }?.let { opts ->
                            store.configs.clear()
                            opts.forEachCfg { store.configs[it.configId] = it }
                        }
                        store.statusText = ""
                        runOnUiThread { repaint() }
                        break
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        if (++fails >= 5) { fallbackToRest(e.message); break }
                        delay(4000)
                    }
                }
            }
        }
        }  // handlersBound

        lifecycleScope.launch {
            try {
                // 历史：iapi 密集事件
                try {
                    val hd = a.iapiGet("/events/$devinId?limit=80&order=desc")
                    hd.optJSONArray("result").orEmpty().let { arr ->
                        (arr.length() - 1 downTo 0).forEach { store.applyDenseEvent(arr.getJSONObject(it)) }
                        for (i in 0 until arr.length())
                            lastRowId = maxOf(lastRowId, arr.getJSONObject(i).optLong("row_id"))
                    }
                    olderCursor = hd.optString("next_cursor")
                        .takeIf { it.isNotEmpty() && it != "null" }
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                }
                // REST 元数据：标题/PR
                try {
                    val d = restApi().session(sessionId)
                    runOnUiThread { findViewById<TextView>(R.id.title).text = d.title }
                    d.prUrl?.let {
                        store.prs = org.json.JSONArray().put(
                            JSONObject().put("pr_url", it).put("pr_state", d.prState ?: ""))
                    }
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                }
                runOnUiThread {
                    repaint()
                    if (pinnedToBottom) list.scrollToPosition(maxOf(adapterCount() - 1, 0))
                }
                // resume → configOptions → chips；看会话期间清未读
                for (attempt in 1..2) {
                    val r = a.resume(devinId)
                    val opts = r.optJSONArray("configOptions").orEmpty()
                    // 只在拿到非空配置时替换——resume 偶发不带 configOptions，
                    // 先清再填的空窗里 chips 会消失再出现
                    if (opts.length() > 0) {
                        store.configs.clear()
                        opts.forEachCfg { store.configs[it.configId] = it }
                        break
                    }
                    if (attempt == 2) break
                    delay(3000)
                }
                a.markRead(devinId)
                runOnUiThread { repaint() }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                // 后台回来的死连接：首个 rpc 刚判开、新 socket 在重连中——
                // 缓一下重试再降级，避免误报「连接失败」掉到轮询模式
                try {
                    delay(2500)
                    a.resume(devinId)
                    runOnUiThread { repaint() }
                } catch (e2: Exception) {
                    if (e2 is CancellationException) throw e2
                    fallbackToRest(e.message)
                }
            }
        }

        // iapi 详情轮询：current_activity / user_action_required / ACU 上限 / 星标
        detJob?.cancel()   // startAcp 每 resume 都跑到这——先取消旧的防双跑
        detJob = lifecycleScope.launch {
            while (isActive) {
                try {
                    // 详情 + 密集事件并行拉（原来串行，RTT 叠加）
                    val dDef = async { a.iapiGet("/sessions/$devinId") }
                    // 终结态不再拉事件——会话不会再产生新事件；否则增量拉 lastRowId 之后的新事件
                    val evDef = async {
                        if (store.state in DONE_STATES) null
                        else runCatching {
                            a.iapiGet(if (lastRowId > 0)
                                "/events/$devinId?order=asc&cursor=$lastRowId&limit=500"
                            else "/events/$devinId?limit=80&order=desc")
                        }.getOrNull()
                    }
                    val d = dDef.await()
                    // iapi status 是进程态（running≠在干活），只在非工作态时兜底填，
                    // 工作态以 state_update 事件为准（对齐 web）
                    val st = d.optString("status")
                    if (store.state.isEmpty() && st.isNotEmpty() &&
                        st != "running" && st != "working") store.state = st
                    store.activity = d.optString("current_activity")
                    store.acuLimit = if (d.has("max_acu_limit")) d.optDouble("max_acu_limit") else null
                    store.devinVersion = d.optString("current_devin_version")
                    store.userAction = d.optJSONObject("latest_status_contents")
                        ?.optString("user_action_required")
                        ?.takeIf { it.isNotEmpty() && it != "null" } ?: ""
                    store.starred = d.optBoolean("is_starred")
                    if (d.optBoolean("session_keep_alive") && !store.keepAlive) setKeepAlive(true)
                    // 实况流只推 tool_call_update 不推 tool_call 创建——工具卡靠
                    // iapi 密集事件增量补齐（eid 去重，已在列表的不会重复）
                    evDef.await()?.optJSONArray("result").orEmpty().let { arr ->
                        // asc 游标拉到的是旧→新顺序直接应用；全量兜底（desc）要倒序应用
                        if (lastRowId > 0) {
                            for (i in 0 until arr.length())
                                store.applyDenseEvent(arr.getJSONObject(i))
                        } else {
                            (arr.length() - 1 downTo 0).forEach {
                                store.applyDenseEvent(arr.getJSONObject(it)) }
                        }
                        for (i in 0 until arr.length())
                            lastRowId = maxOf(lastRowId, arr.getJSONObject(i).optLong("row_id"))
                    }
                    runOnUiThread { repaint() }
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                }
                // 终结态降到 60s——只刷新详情元数据，不再拉事件
                delay(if (store.state in DONE_STATES) BG_MS else if (inFg) 20_000L else BG_MS)
            }
        }
    }

    /** PAT/ACP 连不上时退回 REST 轮询模式，不白屏；同时每 30s 后台重试 ACP，
     *  连上自动切回实时模式，不用重启 app。 */
    private fun fallbackToRest(msg: String?) {
        if (!acpMode) return
        acpMode = false
        detJob?.cancel(); detJob = null
        runOnUiThread {
            list.adapter = adapter
            Toast.makeText(this, "PAT 连接失败（${msg ?: ""}），暂用轮询模式，会自动重连",
                Toast.LENGTH_LONG).show()
            poller = lifecycleScope.launch {
                while (isActive) { refresh(); delay(if (inFg) POLL_MS else BG_MS) }
            }
        }
        if (retryJob?.isActive == true) return
        retryJob = lifecycleScope.launch {
            delay(30_000)
            while (isActive && !acpMode) {
                try {
                    val org = prefs.orgId.ifEmpty {
                        AcpClient.probeOrg(prefs.pat).also { prefs.orgId = it }
                    }
                    val a = AcpClient(prefs.pat, org)
                    // resume 能通 = 连接和会话都活了，切回实时
                    a.resume(AcpClient.addDevin(sessionId))
                    acp?.close()          // 旧客户端不再有人关，主动释放 WS
                    acp = a; acpPat = prefs.pat
                    acpMode = true
                    runOnUiThread {
                        eventAdapter = EventAdapter(::onItemAction)
                        list.adapter = eventAdapter
                        Toast.makeText(this@SessionActivity, "已恢复实时模式", Toast.LENGTH_SHORT).show()
                    }
                    startAcp()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    acp = null
                    delay(30_000)
                }
            }
        }
    }

    private fun org.json.JSONArray?.orEmpty() = this ?: org.json.JSONArray()

    private inline fun org.json.JSONArray.forEachCfg(f: (ConfigEntry) -> Unit) {
        for (i in 0 until length()) {
            val c = optJSONObject(i) ?: continue
            val opts = c.optJSONArray("options").orEmpty()
            val list = (0 until opts.length()).mapNotNull { j ->
                val o = opts.optJSONObject(j) ?: return@mapNotNull null
                ConfigOption(o.optString("value"), o.optString("name"),
                    o.optString("description"),
                    o.optJSONObject("_meta")?.optString("cognition.ai/sectionName") ?: "")
            }
            f(ConfigEntry(c.optString("configId"), c.optString("name"),
                c.optString("currentValue"), list))
        }
    }

    private var repaintPending = false
    private var acpPat = ""   // 当前 acp 客户端用的 PAT；设置页改了凭据才换 client

    /** 事件爆发期合并重绘：WS 流式一秒多个事件时，攒 ~120ms 只跑一次分组+DiffUtil。 */
    private fun repaint() {
        if (isFinishing || isDestroyed) return
        if (repaintPending) return
        repaintPending = true
        findViewById<View>(android.R.id.content).postDelayed({
            repaintPending = false
            if (!isFinishing && !isDestroyed) doRepaint()
        }, 120)
    }

    private fun doRepaint() {
        if (isFinishing || isDestroyed) return
        val prev = lastSeen
        eventAdapter.submit(store.items)
        // 消息落盘供下次秒显（对齐 web localStorage），IO 线程避免每次事件刷磁盘卡 UI
        // 消息落盘限频：流式期间一秒多次 repaint，全量写盘太费——
        // 最多 5s 写一次，退出页面时补写（对齐 web localStorage 秒显用途即可）
        cacheDirty = true
        if (System.currentTimeMillis() - lastCacheWrite > 5_000) flushMessageCache()
        val atBottom = pinnedToBottom
        if (atBottom) list.scrollToPosition(maxOf(adapterCount() - 1, 0))
        else if (store.items.size > prev) findViewById<View>(R.id.new_msgs).visibility = View.VISIBLE
        lastSeen = store.items.size

        // 底部状态区：reboot / working / userAction / statusText
        val state = store.state
        // 实时态喂迁移检测——本页 ACP/轮询比公共兜底快得多，短任务不漏通知
        if (state.isNotEmpty()) StatusWatch.feedOne(this, sessionId,
            findViewById<TextView>(R.id.title)?.text?.toString() ?: sessionId, state)
        val working = state in listOf("working", "running", "resume_requested", "resumed")
        findViewById<Button>(R.id.reboot).visibility =
            if (state in listOf("suspended", "expired", "finished")) View.VISIBLE else View.GONE
        val stText = when {
            working -> "Devin is working…" +
                store.activity.takeIf { it.isNotEmpty() }?.let { " · ${it.replace('_', ' ')}" }.orEmpty()
            else -> store.statusText
        }
        findViewById<TextView>(R.id.statusline).text = stText
        eventAdapter.hasOlder = acpMode && olderCursor != null
        findViewById<View>(R.id.older).visibility =
            if (!acpMode && olderCursor != null && atTop && reachedTop) View.VISIBLE else View.GONE
        findViewById<Button>(R.id.stop).visibility = if (working) View.VISIBLE else View.GONE
        // 发送钮文案随状态：任务在跑时显示「排队」（点了进排队消息不打断执行）
        findViewById<Button>(R.id.send).text = if (working) "排队" else "发送"
        findViewById<Button>(R.id.star).apply {
            visibility = View.VISIBLE
            text = if (store.starred) "★" else "☆"
        }
        // web pill 区：模型名 · 状态 · PR 徽标
        val modelTag = store.devinVersion.removePrefix("devin-")
        status.text = (if (modelTag.isNotEmpty()) "$modelTag · " else "") +
            Format.statusLabel(state.ifEmpty { "working" })
        status.setTextColor(Format.statusColor(state.ifEmpty { "working" }))
        findViewById<TextView>(R.id.pr_chip).apply {
            val pr = store.prs.optJSONObject(0)
            if (pr != null) {
                visibility = View.VISIBLE
                val st = pr.optString("pr_state").ifEmpty { pr.optString("state") }
                text = "PR·$st"
                setTextColor(Format.prColor(st))
                setOnClickListener {
                    openWeb(pr.optString("pr_url").ifEmpty { pr.optString("url") })
                }
            } else visibility = View.GONE
        }
        updateChips()
        updateQueueBox()
    }

    /* ---- chips（模型等 config + 保活 + ACU） ---- */

    private var chipsSig = ""

    private fun updateChips() {
        val wrap = findViewById<View>(R.id.chips_wrap)
        val bar = findViewById<LinearLayout>(R.id.chips)
        val cfgs = store.configs.values.filter {
            it.options.size > 1 &&
                !it.configId.contains(Regex("org|platform|agent", RegexOption.IGNORE_CASE))
        }
        val sig = cfgs.joinToString("|") { "${it.configId}=${it.currentValue}" } +
            "|acu=${store.acuLimit}|ka=${store.keepAlive}"
        if (cfgs.isEmpty() && store.acuLimit == null && !store.keepAlive) {
            wrap.visibility = View.GONE
            chipsSig = ""
            return
        }
        if (sig == chipsSig) return   // 签名没变就不重建——repaint 秒级多次
        chipsSig = sig
        wrap.visibility = View.VISIBLE
        bar.removeAllViews()
        cfgs.take(4).forEach { c ->
            val cur = c.options.firstOrNull { it.value == c.currentValue }
            bar.addView(chip(cur?.name ?: c.currentValue.ifEmpty { c.name }) { showConfigSheet(c) })
        }
        bar.addView(chip(if (store.keepAlive) "保活中" else "保活") { setKeepAlive(!store.keepAlive) })
        bar.addView(chip(store.acuLimit?.let { "≤${it.toInt()} ACU" } ?: "ACU 不限") { setAcuLimit() })
    }

    private fun chip(label: String, onClick: () -> Unit): Button =
        Button(this, null, android.R.attr.borderlessButtonStyle).apply {
            text = "$label ▾"
            textSize = 12f
            setOnClickListener { onClick() }
        }

    private fun showConfigSheet(c: ConfigEntry) {
        val names = c.options.map { "${it.name}${if (it.value == c.currentValue) " ✓" else ""}" +
            (it.description.takeIf { d -> d.isNotEmpty() }?.let { d -> "\n$d" } ?: "") }.toTypedArray()
        Sheet.list(this, c.name.ifEmpty { "Model" },
            names.map { Sheet.Row(it) }) { i ->
            val v = c.options[i].value
            c.currentValue = v
            updateChips()
            lifecycleScope.launch {
                try { acp?.setConfig(AcpClient.addDevin(sessionId), c.configId, v) }
                catch (e: Exception) {
                    if (e is CancellationException) throw e
                    toast("切换失败：${e.message}")
                }
            }
        }
    }

    private fun setAcuLimit() {
        Sheet.input(this, "ACU 上限", hint = "本会话 ACU 上限（留空 = 不限）",
            initial = store.acuLimit?.toString() ?: "2") { s ->
            val n = if (s.isEmpty()) null else s.toDoubleOrNull()
            if (s.isNotEmpty() && !(n != null && n > 0)) { toast("请输入正数"); return@input }
            lifecycleScope.launch {
                try {
                    acp?.setSpendingLimit(AcpClient.addDevin(sessionId), n)
                    store.acuLimit = n
                    repaint()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    toast("设置失败：${e.message}")
                }
            }
        }
    }

    private fun setKeepAlive(on: Boolean) {
        store.keepAlive = on
        kaJob?.cancel(); kaJob = null
        if (on) {
            val devinId = AcpClient.addDevin(sessionId)
            kaJob = lifecycleScope.launch {
                while (isActive) {
                    acp?.heartbeat(devinId)
                    delay(60_000)
                }
            }
        }
        updateChips()
    }

    /* ---- 排队消息 ---- */

    private fun updateQueueBox() {
        val qb = findViewById<LinearLayout>(R.id.queuebox)
        qb.removeAllViews()
        val q = store.queued
        if (q.length() == 0) { qb.visibility = View.GONE; return }
        qb.visibility = View.VISIBLE
        for (i in 0 until q.length()) {
            val m = q.optJSONObject(i) ?: continue
            val text = store.queuedText(m)
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(TextView(this).apply {
                this.text = text
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            for ((label, op) in listOf("发" to "send_now", "改" to "edit", "删" to "remove")) {
                row.addView(Button(this, null, android.R.attr.borderlessButtonStyle).apply {
                    this.text = label
                    textSize = 12f
                    setOnClickListener { queuedOp(i, m, op) }
                })
            }
            qb.addView(row)
        }
    }

    private fun queuedOp(index: Int, m: JSONObject, op: String) {
        val devinId = AcpClient.addDevin(sessionId)
        val mid = m.optString("id").ifEmpty {
            m.optString("messageId").ifEmpty { m.optString("eventId") } }
        lifecycleScope.launch {
            try {
                if (op == "edit") {
                    val cur = m.optString("message").ifEmpty { m.optString("text") }
                    runOnUiThread {
                        Sheet.input(this@SessionActivity, "修改排队消息", initial = cur) { v ->
                            lifecycleScope.launch {
                                acp?.queuedUpdate(devinId, mid, op, v)
                                m.put("message", v)
                                runOnUiThread { repaint() }
                            }
                        }
                    }
                    return@launch
                }
                acp?.queuedUpdate(devinId, mid, op)
                if (op == "send_now" || op == "remove") {
                    val keep = org.json.JSONArray()
                    for (j in 0 until store.queued.length()) {
                        if (j != index) keep.put(store.queued.opt(j))
                    }
                    store.queued = keep
                    runOnUiThread { repaint() }
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                toast("操作失败：${e.message}")
            }
        }
    }

    /* ---- 交互卡片回调 ---- */

    private fun onItemAction(item: ChatItem, op: String, inputValue: String?) {
        val devinId = AcpClient.addDevin(sessionId)
        when (item.kind) {
            ChatKind.PERM -> {
                if (item.requestId.isNotEmpty()) {
                    // 事件流审批卡（permission_request）：ACP permission/respond 回执
                    lifecycleScope.launch {
                        try {
                            acp?.permissionRespond(devinId, item.requestId, op == "approve")
                            item.done = inputValue ?: op
                        } catch (e: Exception) {
                            if (e is CancellationException) throw e
                            toast("回执失败：${e.message}")
                        }
                        runOnUiThread { repaint() }
                    }
                } else {
                    item.done = inputValue ?: op  // adapter 传 name 进 inputValue
                    acp?.respond(item.reqId, JSONObject().put("outcome",
                        JSONObject().put("outcome", "selected").put("optionId", op)))
                    repaint()
                }
            }
            ChatKind.PLANREQ -> {
                lifecycleScope.launch {
                    try {
                        if (op == "accept") {
                            acp?.planAccept(devinId, item.planId, item.eventId)
                            item.done = "接受"
                        } else {
                            runOnUiThread {
                                Sheet.input(this@SessionActivity, "修改计划内容",
                                    initial = item.text, okLabel = "提交") { v ->
                                    lifecycleScope.launch {
                                        acp?.planEdit(devinId, item.planId, v)
                                        item.done = "编辑"
                                        repaint()
                                    }
                                }
                            }
                            return@launch
                        }
                        repaint()
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        toast("计划操作失败：${e.message}")
                    }
                }
            }
            ChatKind.QUESTION -> {
                // 选项卡：无专用回执接口——把选项文本当普通消息发出即等同回答
                val v = op.trim()
                if (v.isEmpty()) return
                lifecycleScope.launch {
                    try {
                        sendText(v)
                        item.done = inputValue ?: v
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        toast("发送失败：${e.message}")
                    }
                    runOnUiThread { repaint() }
                }
            }
            ChatKind.OLDER -> loadOlder()
            ChatKind.SECRETREQ -> {
                val v = inputValue?.trim().orEmpty()
                if (v.isEmpty()) return
                lifecycleScope.launch {
                    try {
                        acp?.provideSecret(devinId, item.requestId, item.secretName, v)
                        item.done = "done"
                        repaint()
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        toast("提交失败：${e.message}")
                    }
                }
            }
            else -> {}
        }
    }

    /* ---- 停止 / 重启 / 星标 / 加载更早 ---- */

    /** 对齐 web 输入框右下角 ■：只打断当前轮次，会话不关；尚未回答的权限卡一并按 cancelled 回掉。 */
    private fun stopDevin() {
        Sheet.confirm(this, "停止 Devin 当前任务？", "会话保持活动，可接着发消息", okLabel = "停止", destructive = true) {
            lifecycleScope.launch {
                try {
                    acp?.cancelTurn(AcpClient.addDevin(sessionId))
                    store.items.filter {
                        (it.kind == ChatKind.PERM || it.kind == ChatKind.QUESTION) && it.done.isEmpty()
                    }.forEach {
                        it.done = "已取消"
                        if (it.kind != ChatKind.PERM) return@forEach
                        if (it.requestId.isNotEmpty())
                            runCatching { acp?.permissionRespond(AcpClient.addDevin(sessionId), it.requestId, false) }
                        else
                            acp?.respond(it.reqId, JSONObject().put("outcome",
                                JSONObject().put("outcome", "cancelled")))
                    }
                    repaint()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    toast("停止失败：${e.message}")
                }
            }
        }
    }

    private fun reboot() {
        val btn = findViewById<Button>(R.id.reboot)
        btn.isEnabled = false; btn.text = "重启中…"
        lifecycleScope.launch {
            try { acp?.reboot(AcpClient.addDevin(sessionId)) }
            catch (e: Exception) {
                if (e is CancellationException) throw e
                toast("重启失败：${e.message}")
            } finally {
                btn.isEnabled = true; btn.setText(R.string.reboot)
            }
        }
    }

    private fun toggleStar() {
        val want = !store.starred
        store.starred = want
        repaint()
        lifecycleScope.launch {
            try { acp?.pin(AcpClient.addDevin(sessionId), want) }
            catch (e: Exception) {
                if (e is CancellationException) throw e
                store.starred = !want; repaint()
                toast("收藏失败：${e.message}")
            }
        }
    }

    private fun loadOlder() {
        val cursor = olderCursor ?: return
        if (loadingOlder) return
        val client = acp ?: return   // 重连空窗别动 cursor，拉空会把它清掉
        loadingOlder = true
        val btn = findViewById<Button>(R.id.older)
        btn.text = "加载中…"
        lifecycleScope.launch {
            try {
                val devinId = AcpClient.addDevin(sessionId)
                val hd = client.iapiGet("/events/$devinId?limit=200&order=desc&cursor=$cursor")
                val st = store.statusText
                val arr = hd?.optJSONArray("result") ?: org.json.JSONArray()
                val fresh = mutableListOf<ChatItem>()
                store.collecting(fresh) {
                    (arr.length() - 1 downTo 0).forEach { store.applyDenseEvent(arr.getJSONObject(it)) }
                }
                // 新条目插到最前（从它们落点的任何位置摘出）
                store.items.removeAll(fresh)
                store.items.addAll(0, fresh)
                store.statusText = st
                olderCursor = hd?.optString("next_cursor")
                    ?.takeIf { it.isNotEmpty() && it != "null" }
                repaint()
                // 保持视口：滚回之前正在看的那条（web 用 scrollHeight 差值补偿）
                if (fresh.isNotEmpty()) list.scrollToPosition(fresh.size)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
            }
            loadingOlder = false
            btn.setText(R.string.load_older)
        }
    }

    /* ================= REST 轮询模式 ================= */

    /** REST 兜底客户端：PAT 是 cog_ 时用它走 v3（v1 接口不带归档字段，
     *  退回轮询后归档/已删会话会漏出来）。 */
    private fun restApi(): DevinApi =
        if (prefs.pat.startsWith("cog_")) DevinApi(MemoryCredentials(prefs.pat, prefs.orgId))
        else api

    private suspend fun refresh() = refreshLock.withLock {
        try {
            val session = restApi().session(sessionId)
            findViewById<TextView>(R.id.title).text = session.title
            status.text = Format.statusDetailLabel(session)
            status.setTextColor(Format.statusColor(session.statusEnum))
            val prBtn = findViewById<TextView>(R.id.pr_chip)
            if (session.prUrl != null) {
                prBtn.visibility = View.VISIBLE
                prBtn.text = "PR·${session.prState ?: ""}"
                prBtn.setTextColor(Format.prColor(session.prState))
                prBtn.setOnClickListener {
                    openWeb(session.prUrl!!)
                }
            } else {
                prBtn.visibility = View.GONE
            }
            val messages = restApi().messages(sessionId)
            val prevCount = adapter.itemCount
            val changed = adapter.submit(messages)
            if (changed) {
                LocalCache.saveMessages(this@SessionActivity, sessionId, messages)
                if (pinnedToBottom) list.scrollToPosition(adapter.itemCount - 1)
                else if (adapter.itemCount > prevCount)
                    findViewById<View>(R.id.new_msgs).visibility = View.VISIBLE
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            status.text = getString(R.string.load_failed, e.message ?: "")
        }
    }

    /** 附件：选文件 → 上传 → 把附件 url 拼进输入框随 steer 一起发。 */
    private lateinit var attachBtn: Button
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@registerForActivityResult
        attachBtn.isEnabled = false
        lifecycleScope.launch {
            try {
                val (name, mime) = queryName(uri)
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw ApiException(400, "读取文件失败")
                val url = api.uploadAttachment(name, mime, bytes)
                input.append(if (input.text.isEmpty()) url else " $url")
                Toast.makeText(this@SessionActivity, "附件已添加", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Toast.makeText(this@SessionActivity, "上传失败：${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                attachBtn.isEnabled = true
            }
        }
    }

    private fun queryName(uri: android.net.Uri): Pair<String, String> {
        var name = uri.lastPathSegment ?: "file"
        contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) name = c.getString(idx) ?: name
        }
        val mime = contentResolver.getType(uri) ?: "application/octet-stream"
        return name to mime
    }

    /** 发一条用户消息到会话——acpMode 下运行中进排队消息否则 prompt，REST 下走 v3 message。 */
    private suspend fun sendText(text: String) {
        if (acpMode && acp != null) {
            val devinId = AcpClient.addDevin(sessionId)
            val working = store.state in listOf("working", "running", "resume_requested", "resumed")
            if (working) {
                // 运行中发送 → 进排队消息（对齐 web），不打断当前执行
                val mid = "q${System.currentTimeMillis()}"
                acp?.queuedUpdate(devinId, mid, "add", text)
                store.queued.put(JSONObject().put("id", mid).put("message", text))
            } else acp?.prompt(devinId, text)
        } else restApi().sendMessage(sessionId, text)
    }

    private fun send() {
        val text = input.text.toString().trim()
        if (text.isEmpty()) return
        val send = findViewById<Button>(R.id.send)
        send.isEnabled = false
        input.setText("")
        lifecycleScope.launch {
            try {
                sendText(text)
                prefs.setDraft(sessionId, "")
                pinnedToBottom = true
                if (!acpMode) refresh() else repaint()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                input.setText(text)
                Toast.makeText(this@SessionActivity, e.message, Toast.LENGTH_LONG).show()
            } finally {
                send.isEnabled = true
            }
        }
    }

    // ---- @ 弹层 ----
    private var mentionPopup: android.widget.ListPopupWindow? = null
    private val mentionItems = mutableListOf<Mentions.Item>()
    private var filteredItems = listOf<Mentions.Item>()
    private var mentionsLoading = false

    /** 光标前的 @token：返回 (at 位置, 查询串)，不在 @ 语境返回 null。 */
    private fun mentionToken(): Pair<Int, String>? {
        val pos = input.selectionStart
        if (pos < 0 || pos > input.text.length) return null
        val t = input.text.toString()
        val at = t.lastIndexOf('@', pos - 1)
        if (at < 0) return null
        if (at > 0 && !t[at - 1].isWhitespace()) return null
        val q = t.substring(at + 1, pos)
        if (q.contains('\n') || q.contains(' ') || q.length > 40) return null
        return at to q
    }

    private fun maybeShowMentions() {
        val tok = mentionToken()
        if (tok == null) {
            mentionPopup?.dismiss()
            return
        }
        if (mentionItems.isEmpty() && !mentionsLoading) {
            mentionsLoading = true
            mentionItems.addAll(Mentions.skillItems(prefs.skillsCsv))
            lifecycleScope.launch {
                try {
                    mentionItems.addAll(Mentions.playbookItems(prefs))
                    mentionItems.addAll(Mentions.sessionItems(acp, sessionId))
                    if (!isFinishing) maybeShowMentions()
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                }
            }
        }
        val q = tok.second.lowercase()
        filteredItems = mentionItems.filter {
            it.label.lowercase().contains(q) || it.insert.lowercase().contains(q)
        }
        if (filteredItems.isEmpty()) {
            mentionPopup?.dismiss()
            return
        }
        val popup = mentionPopup ?: android.widget.ListPopupWindow(this).also {
            it.anchorView = input
            it.width = (resources.displayMetrics.widthPixels * 0.85).toInt()
            it.height = android.widget.ListPopupWindow.WRAP_CONTENT
            it.isModal = false
            it.setOnItemClickListener { _, _, pos, _ ->
                filteredItems.getOrNull(pos)?.let { item -> applyMention(item) }
                it.dismiss()
            }
            mentionPopup = it
        }
        val kindLabel = mapOf("skill" to "🧩", "playbook" to "📕", "session" to "💬")
        popup.setAdapter(android.widget.ArrayAdapter(
            this, android.R.layout.simple_list_item_1,
            filteredItems.map { "${kindLabel[it.kind] ?: "@"} ${it.label}" }))
        if (!popup.isShowing) popup.show()
    }

    private fun applyMention(item: Mentions.Item) {
        val tok = mentionToken() ?: return
        input.text.replace(tok.first, input.selectionStart, item.insert + " ")
    }

    /** ☰：侧滑会话抽屉（对齐 web drawer），不返回列表页直接切。 */
    private fun showSessionSwitch() {
        val drawer = findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.drawer)
        drawer.openDrawer(androidx.core.view.GravityCompat.START)
    }

    private var drawerLoading = false

    private fun loadDrawerSessions() {
        if (drawerLoading) return
        drawerLoading = true
        val btn = findViewById<View>(R.id.drawer_handle)
        btn.isEnabled = false
        val emptyView = findViewById<TextView>(R.id.drawer_empty)
        emptyView.text = "加载中…"
        emptyView.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                // 先显本地缓存（打开即出，不等网络），网络拉到后升级
                LocalCache.loadSessions(this@SessionActivity)?.let { cached ->
                    if (cached.isNotEmpty()) {
                        drawerAdapter.submit(cached.filter { !it.isArchived }
                            .sortedByDescending { it.updatedAt })
                        emptyView.visibility = View.GONE
                    }
                }
                // REST 与 ACP 并发拉取，谁先到且非空就用谁——api.devin.ai 不可达
                // 时 REST 会干等超时，ACP 兜底能即时顶上（反之亦然）
                val errors = mutableListOf<String>()
                val restJob = async {
                    try {
                        restApi().listSessions()
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        errors.add("REST: ${e.message}")
                        emptyList()
                    }
                }
                val acpJob = if (acpMode && acp != null) async {
                    try {
                        val list = try {
                            kotlinx.coroutines.withTimeout(5_000) { acp!!.listSessions() }
                        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                            errors.add("ACP: timeout"); emptyList()
                        }
                        list
                            .map { AcpClient.normAcpSession(it) }
                            .map { n ->
                                Session(
                                    id = n.optString("session_id"),
                                    title = n.optString("title").ifEmpty { "(无标题)" },
                                    statusEnum = n.optString("status_enum"),
                                    updatedAt = DevinApi.epochMillis(n.opt("updated_at")),
                                    prUrl = n.optString("url").ifEmpty { null }
                                        ?.takeIf { "/pull/" in it || "merge_requests" in it },
                                    prState = n.optString("pr_state").ifEmpty { null },
                                    unread = n.optBoolean("unread"),
                                    isArchived = n.optBoolean("archived"),
                                )
                            }
                    } catch (e: Exception) {
                        if (e is CancellationException) throw e
                        errors.add("ACP: ${e.message}")
                        emptyList()
                    }
                } else null
                // ACP 先到就先渲染（REST 慢时不干等）；ACP 列表与网页端一致
                // （剔除已删除会话），非空优先；REST 会带回已删除的幽灵会话，仅兜底
                fun render(list: List<Session>) = drawerAdapter.submit(
                    list.filter { !it.isArchived }.sortedByDescending { it.updatedAt })
                val acpSessions = acpJob?.await() ?: emptyList()
                if (acpSessions.isNotEmpty()) render(acpSessions)
                val restSessions = restJob.await()
                // 记下 ACP 真列表（与网页端一致，剔除已删除会话）；REST 兜底时
                // 剔除"同步前就存在但不在真列表里"的幽灵会话（REST 会返回已删除的）
                if (acpSessions.isNotEmpty()) {
                    prefs.lastAcpIds = acpSessions.joinToString(",") { it.id }
                    prefs.lastAcpSyncAt = System.currentTimeMillis()
                }
                val acpIds = prefs.lastAcpIds.split(",").filter { it.isNotEmpty() }.toSet()
                val acpSyncAt = prefs.lastAcpSyncAt
                val restFiltered = if (acpIds.isEmpty() || acpSyncAt <= 0) restSessions
                    else restSessions.filter { s -> s.id in acpIds || s.updatedAt >= acpSyncAt }
                var sessions = if (acpSessions.isNotEmpty()) acpSessions else restFiltered
                if (sessions.isNotEmpty())
                    LocalCache.saveSessions(this@SessionActivity, sessions)
                if (sessions.isEmpty())
                    sessions = LocalCache.loadSessions(this@SessionActivity) ?: emptyList()
                if (isFinishing || isDestroyed) return@launch
                val shown = sessions.filter { !it.isArchived }
                    .sortedByDescending { it.updatedAt }
                drawerAdapter.submit(shown)
                if (shown.isEmpty()) {
                    // 状态写在抽屉里，空列表和加载失败肉眼可分辨
                    emptyView.text = if (errors.isEmpty()) "没有会话"
                        else "加载会话失败\n" + errors.joinToString("\n")
                    emptyView.visibility = View.VISIBLE
                } else {
                    emptyView.visibility = View.GONE
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Toast.makeText(this@SessionActivity, e.message, Toast.LENGTH_LONG).show()
            } finally {
                btn.isEnabled = true
                drawerLoading = false
            }
        }
    }

    private val drawerAdapter by lazy {
        SessionAdapter(
            onClick = { s ->
                findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.drawer)
                    .closeDrawer(androidx.core.view.GravityCompat.START)
                if (s.id != sessionId) {
                    startActivity(
                        Intent(this@SessionActivity, SessionActivity::class.java)
                            .putExtra(EXTRA_ID, s.id)
                            .putExtra(EXTRA_TITLE, s.title)
                    )
                    finish()
                }
            },
            onLongClick = {},
        )
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    companion object {
        const val EXTRA_ID = "session_id"
        const val EXTRA_TITLE = "session_title"
        private const val POLL_MS = 4_000L
        /** 这些状态下会话不会再产生新事件——轮询只刷详情元数据，不拉事件。 */
        private val DONE_STATES = setOf("finished", "expired", "suspended", "stopped", "error", "failed")
    }
}

/** 离开会话页时暂存的 ACP 连接：30 分钟内回到同一会话直接复用（WS 不断、
 *  消息流秒显），期间挂无界面接收器持续收事件；最多存最近 5 个会话，
 *  超时或溢出自动关闭释放。 */
private object LinkHolder {
    class Link(val sid: String, val acp: AcpClient, val store: EventStore,
               val at: Long, val unbind: () -> Unit)
    private val links = LinkedHashMap<String, Link>()
    private var timer: Job? = null
    private const val TTL = 30 * 60_000L
    private const val MAX = 5
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private fun evict() {
        val now = System.currentTimeMillis()
        val it = links.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (now - e.value.at >= TTL) { it.remove(); e.value.acp.close() }
        }
        // 超上限关最老的（LinkedHashMap 迭代即插入序）
        while (links.size > MAX) {
            val e = links.entries.first()
            links.remove(e.key); e.value.acp.close()
        }
    }

    private fun rearm() {
        timer?.cancel(); timer = null
        if (links.isEmpty()) return
        val wait = TTL - links.values.minOf { System.currentTimeMillis() - it.at }
        timer = scope.launch { delay(wait.coerceAtLeast(1)); synchronized(this) { evict(); rearm() } }
    }

    @Synchronized fun put(sid: String, acp: AcpClient, store: EventStore, unbind: () -> Unit) {
        links.remove(sid)?.acp?.close()   // 同会话二次暂存：只留新的
        links[sid] = Link(sid, acp, store, System.currentTimeMillis(), unbind)
        evict(); rearm()
    }

    @Synchronized fun take(sid: String): Link? {
        evict(); rearm()
        val l = links.remove(sid) ?: return null
        l.unbind(); return l
    }
}

class MessageAdapter : RecyclerView.Adapter<MessageAdapter.Holder>() {

    private val items = mutableListOf<Message>()

    /** @return true 当消息数量或末条内容变化（用于决定是否自动滚到底）。 */
    fun submit(messages: List<Message>): Boolean {
        if (messages == items) return false
        // DiffUtil 局部刷新代替 notifyDataSetChanged，避免轮询重绑整屏闪烁
        val diff = androidx.recyclerview.widget.DiffUtil.calculateDiff(
            object : androidx.recyclerview.widget.DiffUtil.Callback() {
                override fun getOldListSize() = items.size
                override fun getNewListSize() = messages.size
                override fun areItemsTheSame(o: Int, n: Int) =
                    items[o].timestamp == messages[n].timestamp && items[o].fromUser == messages[n].fromUser
                override fun areContentsTheSame(o: Int, n: Int) = items[o] == messages[n]
            })
        items.clear()
        items.addAll(messages)
        diff.dispatchUpdatesTo(this)
        return true
    }

    override fun getItemViewType(position: Int) = if (items[position].fromUser) 1 else 0

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = Holder(
        LayoutInflater.from(parent.context).inflate(
            if (viewType == 1) R.layout.item_message_user else R.layout.item_message_devin,
            parent,
            false,
        )
    )

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position])

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        private val text: TextView = view.findViewById(R.id.text)
        private val time: TextView = view.findViewById(R.id.time)
        private val media: LinearLayout = view.findViewById(R.id.media)
        private val scope = kotlinx.coroutines.CoroutineScope(
            kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main.immediate)

        fun bind(message: Message) {
            val shown = Attachments.strip(message.text)   // 已渲染媒体的链接不再显示文本
            text.text = if (message.fromUser) shown else Format.mdCached(shown)
            text.visibility = if (shown.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE
            time.text = Format.clock(message.timestamp)
            Attachments.bind(media, Prefs(text.context), message.text, scope)
        }
    }
}
