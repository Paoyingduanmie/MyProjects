package com.nancy.devinmobile

import android.graphics.drawable.GradientDrawable
import android.text.method.LinkMovementMethod
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * ACP 模式的消息流 adapter：user/devin 用气泡，thought/tool/ev/plan 用灰条事件，
 * perm/secretreq/planreq 是带按钮的交互卡片（对齐 web renderItem）。
 */
class EventAdapter(
    private val onAction: (ChatItem, String, String?) -> Unit,  // (item, optionId/op, input?)
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private val RE_DONE = Regex("(?i)complete|done|success")
        private val RE_FAIL = Regex("(?i)fail|error")
        private val RE_FILE = Regex("(?i)edit|write|file|patch|notebook")
        private val RE_CMD = Regex("(?i)command|run|shell|terminal|exec|bash|cmd")
        private val RE_READ = Regex("(?i)read|view|open|cat|list|get")
        private val RE_SEARCH = Regex("(?i)search|grep|find|look")
        private val RE_WS = Regex("\\s+")
    }

    private val items = mutableListOf<ChatItem>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    @Volatile var hasOlder = false   // 「加载更早」做成消息流首条（对齐 web：按钮嵌在内容顶部）

    // store 原地改 ChatItem 字段（done/status/流式 text），新旧列表是同一批实例，
    // DiffUtil 逐字段比较永远相等、原地更新不重绑——按 key 留上次的渲染签名来判变。
    private val sigs = HashMap<String, String>()

    /** 签名用 text.hashCode（String 内部缓存，未变文本 O(1)）——长会话逐条拼全文太贵。 */
    private fun sigOf(it: ChatItem): String =
        "${it.kind}|${it.title}|${it.text.hashCode()}:${it.text.length}|" +
            "${it.status}|${it.done}|${it.open}|" +
            it.children.joinToString(",") { c ->
                "${c.title}${c.status}${c.text.hashCode()}:${c.text.length}${c.done}" }

    @Volatile private var submitDirty = false
    @Volatile private var pendingSrc: List<ChatItem> = emptyList()
    private var submitJob: kotlinx.coroutines.Job? = null

    fun submit(list: List<ChatItem>) {
        pendingSrc = list
        submitDirty = true
        if (submitJob?.isActive == true) return
        // 分组+签名+DiffUtil 都挪后台线程，主线程只剩 dispatch——
        // 流式期间 ~8 次/秒 submit，长会话全量签名+Myers diff 在主线程会掉帧
        submitJob = scope.launch(Dispatchers.Default) {
            while (true) {
                submitDirty = false
                val next = buildNext(pendingSrc)
                val newSigs = HashMap<String, String>(next.size)
                next.forEach { newSigs[it.key] = sigOf(it) }
                val old = items.toList()
                val oldSigs = HashMap(sigs)
                val diff = androidx.recyclerview.widget.DiffUtil.calculateDiff(
                    object : androidx.recyclerview.widget.DiffUtil.Callback() {
                        override fun getOldListSize() = old.size
                        override fun getNewListSize() = next.size
                        override fun areItemsTheSame(o: Int, n: Int) =
                            old[o].key == next[n].key
                        override fun areContentsTheSame(o: Int, n: Int) =
                            oldSigs[next[n].key] == newSigs[next[n].key]
                    })
                kotlinx.coroutines.withContext(Dispatchers.Main.immediate) {
                    items.clear(); items.addAll(next)
                    sigs.clear(); sigs.putAll(newSigs)
                    diff.dispatchUpdatesTo(this@EventAdapter)
                }
                if (!submitDirty) break
            }
        }
    }

    private fun buildNext(list: List<ChatItem>): List<ChatItem> {
        // 对齐官方：叙述消息后的连续 tool/thought 段聚成一张折叠卡，挂在该节点下
        val next = mutableListOf<ChatItem>()
        if (hasOlder) next.add(ChatItem("older-hdr", ChatKind.OLDER))
        var i = 0
        while (i < list.size) {
            val it = list[i]
            if (it.kind == ChatKind.TOOL || it.kind == ChatKind.THOUGHT) {
                val run = mutableListOf<ChatItem>()
                while (i < list.size &&
                    (list[i].kind == ChatKind.TOOL || list[i].kind == ChatKind.THOUGHT)
                ) { run += list[i]; i++ }
                if (run.any { c -> c.kind == ChatKind.TOOL })
                    next.add(ChatItem("grp-" + run[0].key, ChatKind.TOOL_GROUP,
                        children = run.toList()))
                else
                    next.addAll(run)   // 纯 thinking 段不聚合，保留原折叠行
            } else {
                next.add(it); i++
            }
        }
        return next
    }

    fun item(position: Int) = items.getOrNull(position)

    override fun getItemCount() = items.size

    override fun getItemViewType(position: Int) = when (items[position].kind) {
        ChatKind.USER -> 1
        ChatKind.DEVIN -> 0
        ChatKind.PERM, ChatKind.SECRETREQ, ChatKind.PLANREQ, ChatKind.QUESTION -> 3
        else -> 2
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inf = LayoutInflater.from(parent.context)
        return when (viewType) {
            1 -> MsgHolder(inf.inflate(R.layout.item_message_user, parent, false))
            0 -> MsgHolder(inf.inflate(R.layout.item_message_devin, parent, false))
            3 -> ActionHolder(inf.inflate(R.layout.item_action, parent, false))
            else -> EvHolder(inf.inflate(R.layout.item_event, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val it = items[position]
        when (holder) {
            is MsgHolder -> {
                val shown = Attachments.strip(it.text)   // 已渲染媒体的链接不再显示文本
                holder.text.text = if (it.kind == ChatKind.DEVIN) Format.mdCached(shown) else shown
                holder.text.visibility = if (shown.isEmpty()) View.GONE else View.VISIBLE
                holder.time.text = Format.clock(it.ts)
                holder.text.setOnLongClickListener {
                    val cm = holder.itemView.context.getSystemService(
                        android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("msg", shown))
                    android.widget.Toast.makeText(holder.itemView.context, "已复制", android.widget.Toast.LENGTH_SHORT).show()
                    true
                }
                Attachments.bind(holder.media, Prefs(holder.itemView.context), it.text, scope)
            }
            is EvHolder -> {
                holder.itemView.setOnClickListener(null)
                holder.title.gravity = android.view.Gravity.START
                when (it.kind) {
                    ChatKind.OLDER -> {
                        holder.title.text = "加载更早的消息"
                        holder.title.gravity = android.view.Gravity.CENTER_HORIZONTAL
                        holder.status.text = ""
                        holder.body.visibility = View.GONE
                        holder.itemView.setOnClickListener {
                            val pos = holder.bindingAdapterPosition
                            if (pos != RecyclerView.NO_POSITION)
                                onAction(items[pos], "older", null) }
                    }
                    ChatKind.TOOL_GROUP -> bindToolGroup(holder, it)
                    ChatKind.THOUGHT -> bindCollapsible(
                        holder, it, "thinking", it.text.take(600))
                    else -> {
                        holder.title.text = when (it.kind) {
                            ChatKind.TOOL -> "▸ ${it.title}"
                            ChatKind.PLAN -> "≡ plan"
                            else -> "▸ ${it.title.ifEmpty { "event" }}"
                        }
                        holder.status.text = statusText(it.status)
                        holder.body.text = it.text.take(500)
                        holder.body.visibility =
                            if (it.text.isEmpty()) View.GONE else View.VISIBLE
                    }
                }
            }
            is ActionHolder -> {
                holder.title.text = when (it.kind) {
                    ChatKind.PERM -> "⚠ 权限请求"
                    ChatKind.SECRETREQ -> "◈ secret"
                    ChatKind.PLANREQ -> "≡ plan 审批"
                    ChatKind.QUESTION -> "❓ 选项问题"
                    else -> ""
                }
                holder.body.text = when {
                    it.done.isNotEmpty() ->
                        if (it.kind == ChatKind.QUESTION) "已选择：${it.done}"
                        else "已处理：${it.done}"
                    it.kind == ChatKind.SECRETREQ -> "Devin 请求机密 ${it.secretName}（${it.title}）"
                    else -> it.text.ifEmpty { it.title }
                }
                // 待处理的交互卡加暖黄底+琥珀描边，和普通事件行拉开（已处理保持低调）
                val dm = holder.itemView.resources.displayMetrics
                val pending = it.done.isEmpty()
                holder.itemView.background = if (pending) GradientDrawable().apply {
                    cornerRadius = 10f * dm.density
                    setColor(0xFFFBE7BB.toInt())
                    setStroke((1.2f * dm.density).toInt().coerceAtLeast(1), 0x99C07D0A.toInt())
                } else null
                (holder.itemView.layoutParams as? RecyclerView.LayoutParams)?.let { lp ->
                    lp.marginStart = if (pending) (8 * dm.density).toInt() else 0
                    lp.marginEnd = lp.marginStart
                    lp.topMargin = (3 * dm.density).toInt()
                    lp.bottomMargin = lp.topMargin
                    holder.itemView.layoutParams = lp
                }
                // pending 卡整体收紧一档
                holder.buttons.setPadding(0, if (pending) (3 * dm.density).toInt() else (6 * dm.density).toInt(), 0, 0)
                holder.buttons.removeAllViews()
                holder.buttons.orientation = LinearLayout.HORIZONTAL
                if (it.done.isEmpty()) {
                    when (it.kind) {
                        ChatKind.PERM -> {
                            it.options.forEachIndexed { i, (oid, name) ->
                                val b = permButton(holder.buttons.context, name,
                                    primary = oid == "approve") { onAction(it, oid, name) }
                                if (i > 0) b.layoutParams = LinearLayout.LayoutParams(
                                    LinearLayout.LayoutParams.WRAP_CONTENT,
                                    LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                                        marginStart = (6 * dm.density).toInt() }
                                holder.buttons.addView(b)
                            }
                        }
                        // 选项竖排铺满——长文本一行一个选项，横排会挤出屏外/压成窄条
                        ChatKind.QUESTION -> {
                            holder.buttons.orientation = LinearLayout.VERTICAL
                            it.options.forEachIndexed { i, (oid, name) ->
                                val b = if (it.multi) {
                                    val sel = oid in it.picked
                                    permButton(holder.buttons.context,
                                        (if (sel) "✓ " else "") + name,
                                        primary = sel, leftAlign = true) {
                                        if (!it.picked.remove(oid)) it.picked.add(oid)
                                        val pos = holder.bindingAdapterPosition
                                        if (pos != RecyclerView.NO_POSITION)
                                            notifyItemChanged(pos)
                                    }
                                } else {
                                    permButton(holder.buttons.context, name,
                                        primary = false, leftAlign = true) { onAction(it, oid, name) }
                                }
                                b.layoutParams = LinearLayout.LayoutParams(
                                    LinearLayout.LayoutParams.MATCH_PARENT,
                                    LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                                        if (i > 0) topMargin = (6 * dm.density).toInt() }
                                holder.buttons.addView(b)
                            }
                            if (it.multi) {
                                val sb = permButton(holder.buttons.context,
                                    "提交（${it.picked.size}）",
                                    primary = true, leftAlign = true) {
                                    if (it.picked.isNotEmpty()) {
                                        val names = it.options
                                            .filter { o -> o.first in it.picked }
                                            .joinToString("、") { o -> o.second }
                                        onAction(it, it.picked.joinToString(", "), names)
                                    }
                                }
                                if (it.picked.isEmpty()) { sb.isEnabled = false; sb.alpha = 0.5f }
                                sb.layoutParams = LinearLayout.LayoutParams(
                                    LinearLayout.LayoutParams.MATCH_PARENT,
                                    LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                                        topMargin = (8 * dm.density).toInt() }
                                holder.buttons.addView(sb)
                            }
                        }
                        ChatKind.PLANREQ -> {
                            holder.buttons.addView(smallButton(holder.buttons.context, "接受计划") {
                                onAction(it, "accept", null)
                            })
                            holder.buttons.addView(smallButton(holder.buttons.context, "编辑后提交") {
                                onAction(it, "edit", null)
                            })
                        }
                        ChatKind.SECRETREQ -> {
                            val input = EditText(holder.buttons.context).apply {
                                hint = "输入机密值"
                                inputType = android.text.InputType.TYPE_CLASS_TEXT or
                                    android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
                                layoutParams = LinearLayout.LayoutParams(
                                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                            }
                            holder.buttons.addView(input)
                            holder.buttons.addView(smallButton(holder.buttons.context, "提供") {
                                onAction(it, "provide", input.text.toString())
                            })
                        }
                        else -> {}
                    }
                } else if (it.kind == ChatKind.QUESTION || it.kind == ChatKind.PERM) {
                    // 已答卡保留选项：选中的实心高亮加 ✓，其余变淡不可点
                    holder.buttons.orientation = if (it.kind == ChatKind.QUESTION)
                        LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
                    val picked = it.done.split(",").map { s -> s.trim() }.toSet()
                    it.options.forEachIndexed { i, (oid, name) ->
                        val sel = oid in picked || name in picked || it.done.contains(name)
                        val b = permButton(holder.buttons.context,
                            (if (sel) "✓ " else "") + name,
                            primary = sel, leftAlign = it.kind == ChatKind.QUESTION) {}
                        if (!sel) { b.isEnabled = false; b.alpha = 0.55f }
                        b.layoutParams = LinearLayout.LayoutParams(
                            if (it.kind == ChatKind.QUESTION)
                                LinearLayout.LayoutParams.MATCH_PARENT
                            else LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                                if (i > 0) {
                                    if (it.kind == ChatKind.QUESTION)
                                        topMargin = (6 * dm.density).toInt()
                                    else marginStart = (6 * dm.density).toInt()
                                } }
                        holder.buttons.addView(b)
                    }
                }
            }
        }
    }

    private fun statusText(s: String): String = when {
        s.matches(RE_DONE) -> "Done"
        s.matches(RE_FAIL) -> "Failed"
        s.isNotEmpty() -> "Running"
        else -> ""
    }

    /** 折叠卡：标题行 + ▸/▾，点击展开/收起内容。open 记到首个子条目上跨 submit 保持。 */
    private fun bindCollapsible(holder: EvHolder, it: ChatItem, title: String, body: String) {
        holder.title.text = (if (it.open) "▾ " else "▸ ") + title
        holder.status.text = statusText(it.status)
        holder.body.text = body
        holder.body.visibility = if (it.open && body.isNotEmpty()) View.VISIBLE else View.GONE
        holder.itemView.setOnClickListener { v ->
            it.open = !it.open
            notifyItemChanged(holder.bindingAdapterPosition)
        }
    }

    /** TOOL_GROUP：web 的 renderToolRun——头部汇总「Ran N commands · edited M files」，展开逐条 tick+title+tail。 */
    private fun bindToolGroup(holder: EvHolder, g: ChatItem) {
        val run = g.children
        val head = run[0]
        g.open = head.open   // 展开态记在首个子条目
        var cmd = 0; var file = 0; var tool = 0; var running = 0; var failed = 0
        val rows = StringBuilder()
        var thought = 0
        for (t in run) {
            val ti = t.title.ifEmpty { if (t.kind == ChatKind.THOUGHT) "thinking" else "tool" }
            if (t.kind == ChatKind.THOUGHT) thought++
            else if (RE_FILE.containsMatchIn(ti)) file++
            else if (RE_CMD.containsMatchIn(ti)) cmd++
            else tool++
            val s = t.status
            val ok = s.matches(RE_DONE)
            val bad = s.matches(RE_FAIL)
            if (bad) failed++ else if (!ok && t.kind != ChatKind.THOUGHT) running++
            val tick = if (ok) "☑" else if (bad) "☒" else "◌"
            val tail = t.text.replace(RE_WS, " ").trim().take(120)
            rows.append("$tick ${iconFor(t)} $ti")
                .append(if (tail.isNotEmpty()) " $tail" else "").append("\n")
        }
        val bits = mutableListOf<String>()
        if (cmd > 0) bits += "Ran $cmd command" + if (cmd > 1) "s" else ""
        if (file > 0) bits += "edited $file file" + if (file > 1) "s" else ""
        if (tool > 0) bits += "called $tool tool" + if (tool > 1) "s" else ""
        if (thought > 0) bits += "$thought thought" + if (thought > 1) "s" else ""
        bindCollapsible(
            holder, g.copy().also { it.open = g.open },
            bits.joinToString(" · ").ifEmpty { "${run.size} tool calls" },
            rows.toString().trimEnd())
        holder.status.text = when {
            running > 0 -> "Running"
            failed > 0 -> "Failed"
            else -> "Done"
        }
        holder.itemView.setOnClickListener {
            head.open = !head.open
            notifyItemChanged(holder.bindingAdapterPosition)
        }
    }

    /** 子条目代表性图标：命令 ▶ / 文件 ✎ / 读 ☰ / 搜 🔍 / 思考 💭 / 其他 ✱ */
    private fun iconFor(t: ChatItem): String = when {
        t.kind == ChatKind.THOUGHT -> "💭"
        RE_FILE.containsMatchIn(t.title) -> "✎"
        RE_READ.containsMatchIn(t.title) -> "☰"
        RE_SEARCH.containsMatchIn(t.title) -> "🔍"
        RE_CMD.containsMatchIn(t.title) -> ">_"
        else -> "✱"
    }

    private fun smallButton(ctx: android.content.Context, label: String, onClick: () -> Unit): Button =
        Button(ctx, null, android.R.attr.borderlessButtonStyle).apply {
            text = label
            textSize = 13f
            setOnClickListener { onClick() }
        }

    /** 权限卡按钮：批准=实心琥珀、拒绝=琥珀描边，和卡面一套色系。 */
    private fun permButton(ctx: android.content.Context, label: String,
                           primary: Boolean, leftAlign: Boolean = false,
                           onClick: () -> Unit): Button =
        Button(ctx, null, android.R.attr.borderlessButtonStyle).apply {
            text = label
            textSize = 12f
            isAllCaps = false
            if (leftAlign) gravity = android.view.Gravity.START or
                android.view.Gravity.CENTER_VERTICAL
            val dm = resources.displayMetrics
            background = GradientDrawable().apply {
                cornerRadius = 14f * dm.density
                if (primary) setColor(0xFFC07D0A.toInt())
                else {
                    setColor(0x33C07D0A)
                    setStroke((1.1f * dm.density).toInt().coerceAtLeast(1), 0xFFC07D0A.toInt())
                }
            }
            setTextColor(if (primary) 0xFFFFFFFF.toInt() else 0xFF8A5A00.toInt())
            setPadding((12 * dm.density).toInt(), 0, (12 * dm.density).toInt(), 0)
            minHeight = (30 * dm.density).toInt()
            minimumHeight = 0
            setOnClickListener { onClick() }
        }

    class MsgHolder(view: View) : RecyclerView.ViewHolder(view) {
        val text: TextView = view.findViewById(R.id.text)
        val time: TextView = view.findViewById(R.id.time)
        val media: LinearLayout = view.findViewById(R.id.media)
        init { text.movementMethod = LinkMovementMethod.getInstance() }
    }

    class EvHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.ev_title)
        val status: TextView = view.findViewById(R.id.ev_status)
        val body: TextView = view.findViewById(R.id.ev_body)
    }

    class ActionHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.act_title)
        val body: TextView = view.findViewById(R.id.act_body)
        val buttons: LinearLayout = view.findViewById(R.id.act_buttons)
    }
}
