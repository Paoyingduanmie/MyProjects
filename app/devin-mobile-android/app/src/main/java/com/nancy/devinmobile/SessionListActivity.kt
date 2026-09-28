package com.nancy.devinmobile

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.text.Spannable
import android.text.SpannableString
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.floatingactionbutton.FloatingActionButton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject

class SessionListActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var api: DevinApi
    private var acp: AcpClient? = null
    private var acpMode = false
    private var acpHealthy = false   // 本轮 ACP 是否拉成功（失败也要每轮重试，不永久退回）
    private var lastPatFailToast = 0L
    private val folderMap = mutableMapOf<String, String>()  // sid -> 文件夹名
    private val latestMsgMap = mutableMapOf<String, String>()  // sid -> 最新一条副标题
    private val folderNames = mutableListOf<String>()
    private var tagFilter = ""
    private var allSessions: List<Session> = emptyList()
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var empty: TextView
    private val adapter = SessionAdapter(
        onClick = { openSession(it) },
        onLongClick = { showActions(it) },
        // 左滑按钮条的四个钮走这个回调——之前没接线全是空操作
        onAction = { s, a ->
            when (a) {
                "tags" -> showTagsEditor(s)
                "rename" -> showRename(s)
                "archive" -> runSessionAction {
                    if (acpMode) acp?.bulkArchive(listOf(AcpClient.addDevin(s.id)), !s.isArchived)
                    else api.setArchived(s.id, !s.isArchived)
                }
                "delete" -> confirmDelete(s)
            }
        },
    )
    private var poller: Job? = null
    private var prefetched = false   // 启动后只预热一次
    private var splashAt = 0L
    private var splashDone = false

    /** 串行化刷新，避免轮询与下拉刷新重叠时旧响应覆盖列表。 */
    private val refreshLock = Mutex()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        prefs = Prefs(this)
        api = DevinApi(prefs)
        acpMode = prefs.pat.isNotEmpty()
        if (acpMode) {
            runCatching { JSONObject(prefs.folderMapJson) }.getOrNull()?.let { m ->
                m.keys().forEach { k ->
                    folderMap[k] = m.optString(k).takeUnless { it == "null" } ?: ""
                }
                folderMap.entries.removeIf { it.value.isEmpty() }
            }
            runCatching { JSONObject(prefs.latestMsgJson) }.getOrNull()?.let { m ->
                m.keys().forEach { k -> latestMsgMap[k] = m.optString(k) }
            }
        }
        setContentView(R.layout.activity_list)
        playSplash()

        findViewById<RecyclerView>(R.id.list).also { rv ->
            rv.layoutManager = LinearLayoutManager(this)
            rv.adapter = adapter
            // 左滑 → 呼出会话操作菜单（与长按一致）
            ItemTouchHelper(object : ItemTouchHelper.SimpleCallback(0, ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT) {
                override fun onMove(
                    recyclerView: RecyclerView,
                    viewHolder: RecyclerView.ViewHolder,
                    target: RecyclerView.ViewHolder,
                ) = false

                override fun getSwipeDirs(
                    recyclerView: RecyclerView,
                    viewHolder: RecyclerView.ViewHolder,
                ): Int {
                    // 分区头不可滑；已展开的行允许右滑合上，其他行只允许左滑展开
                    val v = viewHolder.itemView
                    if (v.findViewById<View>(R.id.fg) == null) return 0
                    return if (viewHolder.bindingAdapterPosition == adapter.openPos)
                        ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT
                    else ItemTouchHelper.LEFT
                }

                override fun getSwipeThreshold(viewHolder: RecyclerView.ViewHolder) = 0.2f

                override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {
                    if (direction == ItemTouchHelper.RIGHT) adapter.closeOpen()
                    else adapter.openAt(viewHolder.bindingAdapterPosition)
                }

                override fun onChildDraw(
                    c: android.graphics.Canvas, rv: RecyclerView,
                    vh: RecyclerView.ViewHolder, dX: Float, dY: Float,
                    actionState: Int, isActive: Boolean,
                ) {
                    // 只平移前景层，露出底部操作条（对齐 web 左滑按钮条）
                    val fg = vh.itemView.findViewById<View>(R.id.fg) ?: return
                    val w = vh.itemView.findViewById<View>(R.id.actions)?.width?.toFloat() ?: 0f
                    if (w > 0) adapter.actionWidth = w
                    // 已展开的行右滑时从 -w 回退到 0；未展开的行左滑从 0 到 -w
                    fg.translationX = if (vh.bindingAdapterPosition == adapter.openPos)
                        (-w + dX).coerceIn(-w, 0f) else dX.coerceIn(-w, 0f)
                }
            }).attachToRecyclerView(rv)
        }
        empty = findViewById(R.id.empty)
        findViewById<View>(R.id.refresh).setOnClickListener { launchRefresh() }
        findViewById<View>(R.id.filter_bar).setOnClickListener {
            tagFilter = ""; updateFilterBar(); applyList()
        }
        swipe = findViewById(R.id.swipe)
        swipe.setOnRefreshListener { launchRefresh() }
        findViewById<FloatingActionButton>(R.id.fab).setOnClickListener {
            startActivity(Intent(this, NewSessionActivity::class.java))
        }
        findViewById<View>(R.id.settings).setOnClickListener {
            startActivity(
                Intent(this, SettingsActivity::class.java)
                    .putExtra(SettingsActivity.EXTRA_STAY, true)
            )
        }

        // 离线兜底：先展示上次缓存的列表，刷新成功后覆盖
        LocalCache.loadSessions(this)?.let { cached ->
            if (adapter.itemCount == 0 && cached.isNotEmpty())
                adapter.submit(cached.filter { !it.isArchived })
        }
        lifecycleScope.launch { Updater.check(this@SessionListActivity) }
    }

    private var inFg = true
    private val BG_MS = 60_000L

    override fun onResume() {
        super.onResume()
        inFg = true
        if (!prefs.configured) {
            startActivity(Intent(this, SettingsActivity::class.java))
            return
        }
        Updater.retryPendingInstall(this)
        // 悬浮窗权限引导（只问一次）：后台时任务完成弹窗靠它
        if (!android.provider.Settings.canDrawOverlays(this) && !prefs.overlayAsked) {
            prefs.overlayAsked = true
            Sheet.confirm(this, "后台弹窗提醒",
                "想在别的应用上方弹任务完成卡片吗？需要到系统设置开「显示在其他应用上层」权限。",
                okLabel = "去开启") {
                startActivity(Intent(
                    android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:$packageName")))
            }
        }
        // ACP 模式下 30s 低频兜底（web 同），REST 15s
        val interval = if (acpMode) ACP_POLL_MS else POLL_MS
        poller?.cancel()   // resume 重启拉一次即刷新；后台期间的低频轮询在跑就换掉
        poller = lifecycleScope.launch {
            var first = true
            while (isActive) {
                refresh(showSpinner = first)
                first = false
                delay(if (inFg) interval else BG_MS)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        inFg = false   // 不取消：后台降到 60s 拉一次，回来即有新数据
    }

    private fun launchRefresh() {
        lifecycleScope.launch { refresh() }
    }

    private suspend fun refresh(showSpinner: Boolean = true) = refreshLock.withLock {
        if (showSpinner) swipe.isRefreshing = true
        try {
            val sessions = if (acpMode) {
                try {
                    fetchAcpSessions().also { acpHealthy = true; prefs.patConn = true }
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    // PAT 断连 → 本轮退回 REST（PAT 本身是 cog_ 就走 v3，能过滤归档），
                    // acpMode 保留 → 下轮刷新自动重试重连，不用重启 app
                    acpHealthy = false
                    prefs.patConn = false
                    acp = null
                    if (System.currentTimeMillis() - lastPatFailToast > 60_000) {
                        lastPatFailToast = System.currentTimeMillis()
                        Toast.makeText(this@SessionListActivity,
                            "PAT 连接失败，暂用轮询模式，会自动重连", Toast.LENGTH_LONG).show()
                    }
                    restApi().listSessions()
                }
            } else api.listSessions().also { prefs.keyConn = true }
            findViewById<TextView>(R.id.live).visibility =
                if (acpMode && acpHealthy) View.VISIBLE else View.GONE
            allSessions = sessions
            applyList()
            LocalCache.saveSessions(this@SessionListActivity, sessions)
            // 任务状态迁移检测挪公共层（StatusWatch）：本页轮询是快路径，
            // 直进会话/列表页没起时 App 级 60s 兜底轮询也能收到
            StatusWatch.feed(this, sessions)
            empty.visibility = if (sessions.isEmpty()) View.VISIBLE else View.GONE
            empty.setText(R.string.no_sessions)
        } catch (e: Exception) {
            if (e is CancellationException) throw e   // 协程取消（页面退出/主题重建）不弹错误
            if (!acpMode) prefs.keyConn = false
            if (adapter.itemCount == 0) {
                empty.visibility = View.VISIBLE
                empty.text = getString(R.string.load_failed, e.message ?: "")
            } else {
                Toast.makeText(this@SessionListActivity, e.message, Toast.LENGTH_SHORT).show()
            }
        } finally {
            if (showSpinner) swipe.isRefreshing = false
            dismissSplash()
        }
    }

    /** 开屏：图标弹入 + DEVIN 字标上浮渐显 + 进度点，首轮刷新完成后整体淡出。 */
    private fun playSplash() {
        splashAt = System.currentTimeMillis()
        val icon = findViewById<View>(R.id.splash_icon)
        val name = findViewById<View>(R.id.splash_name)
        val dots = findViewById<LinearLayout>(R.id.splash_dots)
        icon.alpha = 0f; icon.scaleX = .55f; icon.scaleY = .55f
        icon.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(520)
            .setInterpolator(OvershootInterpolator(1.3f)).start()
        name.alpha = 0f; name.translationY = 26f
        name.animate().alpha(1f).translationY(0f).setDuration(480).setStartDelay(260)
            .setInterpolator(DecelerateInterpolator(1.6f)).start()
        dots.alpha = 0f
        dots.animate().alpha(1f).setDuration(280).setStartDelay(540)
            .withEndAction {
                for (i in 0 until dots.childCount) {
                    ObjectAnimator.ofFloat(dots.getChildAt(i), "alpha",
                        .2f, 1f, .2f).apply {
                        duration = 950
                        startDelay = (i * 170).toLong()
                        repeatCount = ValueAnimator.INFINITE
                        start()
                    }
                }
            }.start()
    }

    private fun dismissSplash() {
        if (splashDone) return
        splashDone = true
        val splash = findViewById<View>(R.id.splash) ?: return
        val minShow = 820L - (System.currentTimeMillis() - splashAt)
        splash.animate().alpha(0f).setDuration(340)
            .setStartDelay(minShow.coerceAtLeast(0))
            .withEndAction { splash.visibility = View.GONE }.start()
    }

    private fun updateFilterBar() {
        findViewById<TextView>(R.id.filter_bar).apply {
            if (tagFilter.isEmpty()) visibility = View.GONE
            else { visibility = View.VISIBLE; text = "筛选 #$tagFilter  ✕" }
        }
    }

    private fun applyList() {
        val filtered = if (tagFilter.isEmpty()) allSessions
            else allSessions.filter { tagFilter in it.tags }
        adapter.submit(filtered.filter { !it.isArchived })
    }

    /** ACP：session/list 拿富元数据（未读/星标/标签/模型），再懒拉 iapi 详情补 folder。 */
    private suspend fun fetchAcpSessions(): List<Session> {
        val a = acp ?: AcpClient(prefs.pat,
            AcpClient.probeOrg(prefs.pat).also { prefs.orgId = it }).also { acp = it }
        val raw = a.listSessions().map { AcpClient.normAcpSession(it) }
        val sessions = raw.map { n ->
            val tagsArr = n.optJSONArray("tags")
            Session(
                id = n.optString("session_id"),
                title = n.optString("title").ifEmpty { "(无标题)" },
                statusEnum = n.optString("status_enum"),
                updatedAt = DevinApi.epochMillis(n.opt("updated_at")),
                prUrl = n.optString("url").ifEmpty { null }?.let {
                    if (it.contains("/pull/") || it.contains("merge_requests")) it else null
                },
                isArchived = n.optBoolean("archived"),
                unread = n.optBoolean("unread"),
                starred = n.optBoolean("starred"),
                tags = (0 until (tagsArr?.length() ?: 0)).map { tagsArr!!.optString(it) },
                folder = folderMap[n.optString("session_id")]
                    ?.takeUnless { it == "null" } ?: "",
                model = n.optString("model").removePrefix("devin-"),
                excerpt = latestMsgMap[n.optString("session_id")]?.take(160)
                    ?: n.optString("excerpt").take(160),
            )
        }.sortedWith(compareByDescending<Session> { it.starred }.thenByDescending { it.updatedAt })
        // 懒拉文件夹归属（前 40 个）——原来逐个串行 iapiGet，40 个 RTT 叠加要好几秒，
        // 改并行 async 一次性发完
        lifecycleScope.launch {
            val targets = sessions.take(40)
            val missing = targets.filter { it.id !in folderMap }
            val newLatest = mutableMapOf<String, String>()
            coroutineScope {
                targets.map { s ->
                    async {
                        runCatching {
                            val d = a.iapiGet("/sessions/${AcpClient.addDevin(s.id)}")
                            s.id to Pair(
                                d.optString("folder").takeUnless { it == "null" } ?: "",
                                d.optJSONObject("latest_message_contents")
                                    ?.optString("message") ?: "")
                        }.getOrNull()
                    }
                }.forEach { d -> d.await()?.let { (id, p) ->
                    folderMap[id] = p.first
                    if (p.second.isNotEmpty()) newLatest[id] = p.second
                } }
            }
            if (missing.isNotEmpty())
                prefs.folderMapJson = JSONObject(folderMap as Map<String, String>).toString()
            // 副标题用最新一条消息（列表接口的 excerpt 是创建时首条）：
            // 任务进行中最新一条通常是她的要求，答完最新一条是 Devin 的回复；
            // 落盘缓存——下次进列表直接显上次的最新值，不再先闪首条
            if (newLatest.isNotEmpty()) {
                latestMsgMap.putAll(newLatest)
                prefs.latestMsgJson = JSONObject(latestMsgMap as Map<String, String>).toString()
                runOnUiThread {
                    allSessions = allSessions.map { s ->
                        newLatest[s.id]?.let { s.copy(excerpt = it.take(160)) } ?: s }
                    applyList()
                }
            }
        }
        runCatching {
            val fl = a.folderList().optJSONObject("sidebarFoldersByOrg")
            fl?.let { m ->
                m.keys().forEach { k ->
                    m.optJSONArray(k)?.let { arr ->
                        (0 until arr.length()).map { arr.optString(it) }
                            .forEach { f -> if (f.isNotEmpty() && f !in folderNames) folderNames.add(f) }
                    }
                }
            }
        }
        // 后台预热前 3 个会话的最近消息写进本地缓存——没进过会话也能秒显
        if (!prefetched && sessions.isNotEmpty()) {
            prefetched = true
            lifecycleScope.launch(Dispatchers.IO) {
                sessions.take(3).forEach { s ->
                    runCatching {
                        val hd = a.iapiGet(
                            "/events/${AcpClient.addDevin(s.id)}?limit=80&order=desc")
                        val arr = hd.optJSONArray("result") ?: return@runCatching
                        val msgs = mutableListOf<Message>()
                        for (i in arr.length() - 1 downTo 0) {
                            val e = arr.getJSONObject(i)
                            val text = e.optString("message").ifEmpty {
                                e.optJSONObject("data")?.optString("message") ?: "" }
                            if (text.isEmpty()) continue
                            when (e.optString("type")) {
                                "user_message", "initial_user_message" ->
                                    msgs.add(Message(true, text, 0))
                                "devin_message" -> msgs.add(Message(false, text, 0))
                            }
                        }
                        if (msgs.isNotEmpty())
                            LocalCache.saveMessages(this@SessionListActivity, s.id, msgs)
                    }
                }
            }
        }
        return sessions
    }

    /** REST 兜底用的客户端：PAT 是 cog_ 时优先用它走 v3（v1 接口不带归档字段过滤不掉）。 */
    private fun restApi(): DevinApi =
        if (prefs.pat.startsWith("cog_")) DevinApi(MemoryCredentials(prefs.pat, prefs.orgId))
        else api

    private fun openSession(session: Session) {
        startActivity(
            Intent(this, SessionActivity::class.java)
                .putExtra(SessionActivity.EXTRA_ID, session.id)
                .putExtra(SessionActivity.EXTRA_TITLE, session.title)
        )
    }

    private fun confirmDelete(session: Session) {
        Sheet.confirm(this, session.title, getString(R.string.delete_confirm),
            okLabel = getString(R.string.delete), destructive = true) {
            runSessionAction {
                // Devin 无真删除：REST DELETE 只停止运行不移除，官方客户端的"删除"就是归档。
                // ACP 走 bulkArchive，REST 兜底走 v3 archive；成功后立即本地移除。
                if (acpMode) acp?.bulkArchive(listOf(AcpClient.addDevin(session.id)), true)
                else restApi().setArchived(session.id, true)
                allSessions = allSessions.filter { it.id != session.id }
                LocalCache.saveSessions(this@SessionListActivity, allSessions)
                runOnUiThread { applyList() }
            }
        }
    }

    /** 长按/左滑弹出会话操作菜单；ACP 下与 web 一致：文件夹/标签/重命名/归档/删除。 */
    private fun showActions(session: Session) {
        val archiveLabel = if (session.isArchived) getString(R.string.unarchive) else getString(R.string.archive)
        val actions = mutableListOf<String>()
        if (acpMode) {
            actions += listOf(getString(R.string.move_folder), getString(R.string.edit_tags),
                getString(R.string.rename), archiveLabel, getString(R.string.delete))
        } else if (api.isV3) {
            actions += listOf(archiveLabel, getString(R.string.delete))
        } else {
            actions += getString(R.string.delete)
        }
        Sheet.list(this, session.title, actions.map { Sheet.Row(it) }) { which ->
            when (actions[which]) {
                getString(R.string.delete) -> confirmDelete(session)
                archiveLabel -> runSessionAction {
                    if (acpMode) acp?.bulkArchive(listOf(AcpClient.addDevin(session.id)), !session.isArchived)
                    else api.setArchived(session.id, !session.isArchived)
                }
                getString(R.string.move_folder) -> showFolderPicker(session)
                getString(R.string.edit_tags) -> showTagsEditor(session)
                getString(R.string.rename) -> showRename(session)
            }
        }
    }

    private fun showFolderPicker(session: Session) {
        val names = folderNames.toMutableList()
        val labels = names.map { "📁 $it" } + listOf(getString(R.string.new_folder)) +
            (if (session.folder.isNotEmpty()) listOf(getString(R.string.remove_from_folder)) else emptyList())
        Sheet.list(this, getString(R.string.move_folder), labels.map { Sheet.Row(it) }) { i ->
            if (i < names.size) {
                val f = names[i]
                runSessionAction {
                    acp?.moveToFolder(AcpClient.addDevin(session.id), f)
                    folderMap[session.id] = f
                    prefs.folderMapJson = JSONObject(folderMap as Map<String, String>).toString()
                }
            } else if (labels[i] == getString(R.string.new_folder)) {
                Sheet.input(this, getString(R.string.new_folder), hint = "新文件夹名") { f ->
                    if (f.isNotEmpty()) runSessionAction {
                        acp?.folderCreate(f)
                        acp?.moveToFolder(AcpClient.addDevin(session.id), f)
                        folderNames.add(f)
                        folderMap[session.id] = f
                        prefs.folderMapJson = JSONObject(folderMap as Map<String, String>).toString()
                    }
                }
            } else {
                runSessionAction {
                    acp?.moveToFolder(AcpClient.addDevin(session.id), null)
                    folderMap.remove(session.id)
                    prefs.folderMapJson = JSONObject(folderMap as Map<String, String>).toString()
                }
            }
        }
    }

    private fun showTagsEditor(session: Session) {
        Sheet.input(this, getString(R.string.edit_tags),
            hint = "标签（逗号分隔，留空清除全部）",
            initial = session.tags.joinToString(", ")) { v ->
            val tags = v.split(Regex("[,，]")).map { it.trim() }.filter { it.isNotEmpty() }
            runSessionAction { acp?.setTags(AcpClient.addDevin(session.id), tags) }
        }
    }

    private fun showRename(session: Session) {
        Sheet.input(this, getString(R.string.rename), initial = session.title) { t ->
            if (t.isNotEmpty() && t != session.title)
                runSessionAction { acp?.rename(AcpClient.addDevin(session.id), t) }
        }
    }

    private fun runSessionAction(block: suspend () -> Unit) {
        lifecycleScope.launch {
            try {
                block()
                refresh()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Toast.makeText(this@SessionListActivity, e.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    private companion object {
        const val POLL_MS = 10_000L
        const val ACP_POLL_MS = 10_000L
    }
}

class SessionAdapter(
    private val onClick: (Session) -> Unit,
    private val onLongClick: (Session) -> Unit,
    private val onTag: (String) -> Unit = {},
    private val onPr: (String) -> Unit = {},
    private val onAction: (Session, String) -> Unit = { _, _ -> },
) : RecyclerView.Adapter<SessionAdapter.Holder>() {

    /** rows：String = 文件夹分区头，Session = 会话项。 */
    private val rows = mutableListOf<Any>()
    var actionWidth = 0f
    var openPos = -1
        private set

    fun openAt(pos: Int) {
        val prev = openPos
        openPos = pos
        if (prev >= 0 && prev != pos) notifyItemChanged(prev)
        notifyItemChanged(pos)
    }

    fun closeOpen() {
        val prev = openPos
        openPos = -1
        if (prev >= 0) notifyItemChanged(prev)
    }

    fun getItem(position: Int): Session? = rows.getOrNull(position) as? Session

    fun submit(sessions: List<Session>) {
        val grouped = sessions.groupBy { it.folder }
        val next = mutableListOf<Any>()
        grouped.keys.filter { it.isNotEmpty() }.sorted().forEach { f ->
            next.add("📁 $f")
            next.addAll(grouped[f]!!)
        }
        next.addAll(grouped[""].orEmpty())
        // 10s 轮询大多零变化：内容签名相同就跳过全量重绑（防闪烁/白算）
        fun sig(r: Any) = if (r is String) r else (r as Session).run {
            "$id|$updatedAt|$statusEnum|$unread|$starred|$title|${tags.joinToString(",")}|$folder|$statusDetail|$excerpt"
        }
        if (rows.size == next.size &&
            rows.zip(next).all { (a, b) -> sig(a) == sig(b) }) return
        rows.clear(); rows.addAll(next)
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int) = if (rows[position] is String) 1 else 0

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val inf = LayoutInflater.from(parent.context)
        return Holder(inf.inflate(
            if (viewType == 1) R.layout.item_header else R.layout.item_session, parent, false))
    }

    override fun getItemCount() = rows.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val r = rows[position]
        if (r is String) holder.bindHeader(r) else holder.bind(r as Session)
    }

    inner class Holder(view: View) : RecyclerView.ViewHolder(view) {
        private val title: TextView? = view.findViewById(R.id.title)
        private val subtitle: TextView? = view.findViewById(R.id.subtitle)
        private val status: TextView? = view.findViewById(R.id.status)
        private val pr: TextView? = view.findViewById(R.id.pr)
        private val excerpt: TextView? = view.findViewById(R.id.excerpt)
        private val tags: TextView? = view.findViewById(R.id.tags)

        fun bindHeader(text: String) {
            (itemView as? TextView)?.text = text
        }

        fun bind(session: Session) {
            val pos = bindingAdapterPosition
            val fg = itemView.findViewById<View>(R.id.fg)
            fg?.translationX = if (pos == openPos) -actionWidth else 0f
            val act = mapOf(
                R.id.act_tags to "tags", R.id.act_rename to "rename",
                R.id.act_archive to "archive", R.id.act_delete to "delete")
            act.forEach { (id, a) -> itemView.findViewById<View>(id)?.setOnClickListener {
                closeOpen(); onAction(session, a) } }
            title?.text = session.title
            status?.text = Format.statusLabel(session.statusEnum)
            status?.setTextColor(Format.statusColor(session.statusEnum))
            if (session.prUrl != null) {
                pr?.visibility = View.VISIBLE
                pr?.text = Format.prLabel(session.prState)
                pr?.setTextColor(Format.prColor(session.prState))
                pr?.setOnClickListener { onPr(session.prUrl) }
            } else {
                pr?.visibility = View.GONE
            }
            // web meta 行：[状态] [ago] [模型] [PR] + 未读点；摘要与 tag 单独成行（tag 可点筛选）
            title?.text = (if (session.unread) "● " else "") +
                (if (session.starred) "★ " else "") +
                session.title
            if (session.excerpt.isNotEmpty()) {
                excerpt?.visibility = View.VISIBLE
                excerpt?.text = session.excerpt.take(120)
            } else excerpt?.visibility = View.GONE
            if (session.tags.isNotEmpty()) {
                tags?.visibility = View.VISIBLE
                val joined = session.tags.joinToString("  ") { "#$it" }
                val sp = SpannableString(joined)
                var off = 0
                session.tags.forEach { t ->
                    val label = "#$t"
                    val start = joined.indexOf(label, off)
                    if (start >= 0) {
                        sp.setSpan(object : ClickableSpan() {
                            override fun onClick(v: View) = onTag(t)
                            override fun updateDrawState(ds: android.text.TextPaint) {
                                ds.isUnderlineText = false
                                ds.color = 0xFF6D5AE0.toInt()
                            }
                        }, start, start + label.length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                        off = start + label.length
                    }
                }
                tags?.text = sp
                tags?.movementMethod = LinkMovementMethod.getInstance()
            } else tags?.visibility = View.GONE
            val meta = buildString {
                if (session.isArchived) append("已归档 · ")
                append(Format.ago(session.updatedAt))
                if (session.model.isNotEmpty()) append(" · ").append(session.model)
            }
            subtitle?.text = meta
            // 点击绑在 fg 前景层：整行可点 + 按压波纹反馈（对齐 web 行点击）
            val target = fg ?: itemView
            target.setOnClickListener {
                if (openPos == bindingAdapterPosition && openPos >= 0) closeOpen()
                else onClick(session)
            }
            target.setOnLongClickListener { onLongClick(session); true }
        }
    }
}
