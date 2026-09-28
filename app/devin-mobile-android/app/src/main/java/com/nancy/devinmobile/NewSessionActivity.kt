package com.nancy.devinmobile

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject

class NewSessionActivity : AppCompatActivity() {

    // 对齐 web 新建页：平台/会话代理原地展开下拉（dsel 同款），不是底部弹层
    private var platform = ""
    private var agentMode = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        setContentView(R.layout.activity_new)
        val prefs = Prefs(this)
        // PAT 是 cog_ 时优先走 v3——api key 常是 v1 的 apk_
        val api = if (prefs.pat.startsWith("cog_"))
            DevinApi(MemoryCredentials(prefs.pat, prefs.orgId)) else DevinApi(prefs)

        val prompt = findViewById<EditText>(R.id.prompt)
        val playbook = findViewById<EditText>(R.id.playbook)
        val platSel = findViewById<TextView>(R.id.platform)
        val agentSel = findViewById<TextView>(R.id.agent)
        val platList = findViewById<LinearLayout>(R.id.platformList)
        val agentList = findViewById<LinearLayout>(R.id.agentList)
        val create = findViewById<Button>(R.id.create)

        fun bindSel(
            faceRow: View, list: LinearLayout, face: TextView,
            opts: List<Pair<String, String>>, onPick: (String) -> Unit,
        ) {
            list.removeAllViews()
            fun buildOpts() {
                list.removeAllViews()
                opts.forEach { (v, n) ->
                    val tv = TextView(this).apply {
                        text = n
                        textSize = 14f
                        val cur = face.text == n
                        setTextColor(if (cur) resolvePrimary() else currentColor())
                        setPadding(28, 20, 28, 20)
                        setOnClickListener {
                            if (v == "__custom") {
                                Sheet.input(this@NewSessionActivity, "平台 / outpost 池名") { c ->
                                    if (c.isNotEmpty()) { onPick(c); face.text = c }
                                }
                            } else {
                                onPick(v); face.text = n
                            }
                            list.visibility = View.GONE
                        }
                    }
                    list.addView(tv)
                }
            }
            faceRow.setOnClickListener {
                if (list.visibility == View.GONE) { buildOpts(); list.visibility = View.VISIBLE }
                else list.visibility = View.GONE
            }
        }

        bindSel(
            findViewById(R.id.platformRow), platList, platSel,
            listOf(
                "" to "默认（Linux VM-Ubuntu）",
                "linux" to "Linux VM-Ubuntu",
                "windows" to "windows",
                "macos" to "macos",
                "__custom" to "自定义 outpost 池名…",
            ),
        ) { platform = it }

        val agentShort = { v: String ->
            v.split("-").joinToString("-") { it.replaceFirstChar(Char::uppercase) }
        }
        val orgDef = prefs.orgDefaultMode
        // 行面板与下拉里「默认（…）」一致——缓存过解析默认值后就显示解析结果
        if (orgDef.isNotEmpty()) agentSel.text = "默认（${agentShort(orgDef)}）"
        bindSel(
            findViewById(R.id.agentRow), agentList, agentSel,
            listOf(
                "" to if (orgDef.isEmpty()) "默认（org 设置）" else "默认（${agentShort(orgDef)}）",
                "lite" to "Lite — 小任务，最便宜",
                "normal" to "Normal",
                "fast" to "Fast",
                "fusion" to "Fusion",
                "ultra" to "Ultra",
                "swe-2-medium" to "SWE-2 Medium",
                "swe-2-high" to "SWE-2 High",
                "swe-2-max" to "SWE-2 Max",
            ),
        ) { agentMode = it }

        findViewById<View>(R.id.back).setOnClickListener { finish() }
        create.setOnClickListener {
            val text = prompt.text.toString().trim()
            if (text.isEmpty()) {
                Toast.makeText(this, R.string.prompt_required, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            create.isEnabled = false
            create.setText(R.string.creating)
            lifecycleScope.launch {
                try {
                    val (id, resolvedMode) = api.createSession(
                        text,
                        playbook.text.toString().trim(),
                        platform,
                        agentMode,
                    )
                    if (agentMode.isEmpty() && !resolvedMode.isNullOrEmpty())
                        prefs.orgDefaultMode = resolvedMode
                    // web：新建默认 ACU 上限 2，后台异步不阻塞跳转
                    if (prefs.pat.isNotEmpty() && id.isNotEmpty())
                        runCatching {
                            val acp = AcpClient(prefs.pat,
                                prefs.orgId.ifEmpty { AcpClient.probeOrg(prefs.pat) })
                            acp.rpc("_cognition.ai/session-spending-limit/set", JSONObject()
                                .put("session_id", AcpClient.addDevin(id))
                                .put("max_credits", 2))
                        }
                    startActivity(
                        Intent(this@NewSessionActivity, SessionActivity::class.java)
                            .putExtra(SessionActivity.EXTRA_ID, id)
                            .putExtra(SessionActivity.EXTRA_TITLE, text.take(40))
                    )
                    finish()
                } catch (e: Exception) {
                    Toast.makeText(this@NewSessionActivity, e.message, Toast.LENGTH_LONG).show()
                    create.isEnabled = true
                    create.setText(R.string.create_session)
                }
            }
        }
    }

    private fun resolvePrimary(): Int {
        val ta = obtainStyledAttributes(intArrayOf(android.R.attr.colorPrimary))
        val c = ta.getColor(0, 0xFF000000.toInt())
        ta.recycle()
        return c
    }

    private fun currentColor(): Int {
        val ta = obtainStyledAttributes(intArrayOf(android.R.attr.textColorPrimary))
        val c = ta.getColor(0, 0xFF000000.toInt())
        ta.recycle()
        return c
    }
}
