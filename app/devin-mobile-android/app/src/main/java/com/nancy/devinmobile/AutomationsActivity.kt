package com.nancy.devinmobile

import android.os.Bundle
import android.view.View
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 定时任务页：org Automations 列表（schedules 已被 automations 取代）。
 *  每行：名称 + 状态/触发器/上次触发；点按弹菜单（启用/停用/删除），右上角 + 新建。 */
class AutomationsActivity : AppCompatActivity() {

    private val list get() = findViewById<LinearLayout>(R.id.list)
    private var items = JSONArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        setContentView(R.layout.activity_automations)
        findViewById<ImageButton>(R.id.back).setOnClickListener { finish() }
        findViewById<ImageButton>(R.id.add).setOnClickListener {
            startActivity(android.content.Intent(this, NewAutomationActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        val head = TextView(this)
        head.text = getString(R.string.loading)
        head.textSize = 15f
        head.setTextColor(resolveAttr(android.R.attr.textColorSecondary))
        list.removeAllViews(); list.addView(head)

        lifecycleScope.launch {
            try {
                items = DevinApi.v3(Prefs(this@AutomationsActivity)).automations()
                render()
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                head.text = getString(R.string.load_failed, e.message)
            }
        }
    }

    private fun render() {
        list.removeAllViews()
        if (items.length() == 0) {
            val v = TextView(this)
            v.text = getString(R.string.automations_empty)
            v.textSize = 14f
            v.setTextColor(resolveAttr(android.R.attr.textColorSecondary))
            list.addView(v); return
        }
        val fmt = SimpleDateFormat("MM-dd HH:mm", Locale.getDefault())
        for (i in 0 until items.length()) {
            val a = items.getJSONObject(i)
            val box = LinearLayout(this)
            box.orientation = LinearLayout.VERTICAL
            box.setPadding(0, 10, 0, 10)

            val name = TextView(this)
            name.text = a.optString("name").ifEmpty { a.optString("automation_id") } +
                if (a.optBoolean("enabled")) "" else "（已停用）"
            name.textSize = 15f
            name.setTextColor(resolveAttr(android.R.attr.textColorPrimary))
            name.setTypeface(null, android.graphics.Typeface.BOLD)
            box.addView(name)

            val sub = TextView(this)
            sub.text = describe(a, fmt)
            sub.textSize = 13f
            sub.setTextColor(resolveAttr(android.R.attr.textColorSecondary))
            sub.setPadding(0, 2, 0, 0)
            box.addView(sub)

            box.setOnClickListener { actionSheet(a) }
            list.addView(box)
        }
    }

    private fun actionSheet(a: JSONObject) {
        val name = a.optString("name").ifEmpty { a.optString("automation_id") }
        val enabled = a.optBoolean("enabled")
        val toggle = if (enabled) "停用" else "启用"
        Sheet.list(this, name, listOf(
            Sheet.Row(toggle),
            Sheet.Row(getString(R.string.automations_del), 0xFFD44540.toInt()))) { i ->
            when (i) {
                0 -> lifecycleScope.launch {
                    try {
                        DevinApi.v3(Prefs(this@AutomationsActivity))
                            .setAutomationEnabled(a.optString("automation_id"), !enabled)
                        load()
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        Toast.makeText(this@AutomationsActivity, e.message,
                            Toast.LENGTH_SHORT).show()
                    }
                }
                1 -> confirmDelete(a)
            }
        }
    }

    private fun describe(a: JSONObject, fmt: SimpleDateFormat): String {
        val parts = mutableListOf<String>()
        a.optJSONArray("triggers")?.let { t ->
            if (t.length() > 0) {
                val ev = (0 until t.length())
                    .map { t.optJSONObject(it)?.optString("event_type") ?: "" }
                    .filter { it.isNotEmpty() }.distinct().joinToString(", ")
                if (ev.isNotEmpty()) parts += ev
            }
        }
        a.optJSONObject("last_invocation")?.let { li ->
            val at = li.optLong("fired_at")
            if (at > 0) parts += "上次 " + fmt.format(Date(at * 1000)) +
                " · " + li.optString("status")
        }
        return if (parts.isEmpty()) "—" else parts.joinToString("  ·  ")
    }

    private fun resolveAttr(attr: Int): Int {
        val ta = obtainStyledAttributes(intArrayOf(attr))
        val c = ta.getColor(0, 0)
        ta.recycle()
        return c
    }

    private fun confirmDelete(a: JSONObject) {
        val name = a.optString("name").ifEmpty { a.optString("automation_id") }
        Sheet.list(this, getString(R.string.automations_del_title),
            listOf(Sheet.Row(name), Sheet.Row(getString(R.string.automations_del), 0xFFD44540.toInt()))) { i ->
            if (i == 1) {
                val id = a.optString("automation_id")
                lifecycleScope.launch {
                    try {
                        DevinApi.v3(Prefs(this@AutomationsActivity)).deleteAutomation(id)
                        load()
                    } catch (e: Exception) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        Toast.makeText(this@AutomationsActivity, e.message,
                            Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }
}
