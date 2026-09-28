package com.nancy.devinmobile

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** 新建定时任务：名称 + 任务内容 + 频率（每天/每周/每月/仅一次）+ 时间。
 *  RRULE 按 UTC 计时——本地时间先换算成 UTC 再写 BYHOUR/BYDAY/BYMONTHDAY，
 *  跨日界时星期/日期一并跟着移。 */
class NewAutomationActivity : AppCompatActivity() {

    private val freqNames = listOf("每天", "每周", "每月", "仅一次")
    private val weekNames = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")
    private var freq = 0
    private var weekday = 0          // 0=周一
    private var monthday = 1         // 1~28，29 表示月末
    private var hour = 9
    private var minute = 0
    private var onceDate: LocalDate = LocalDate.now().plusDays(1)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        setContentView(R.layout.activity_new_automation)
        findViewById<ImageButton>(R.id.back).setOnClickListener { finish() }

        val form = findViewById<LinearLayout>(R.id.form)
        val name = edit("名称（如：每天早上巡检）")
        val prompt = edit("任务内容（每次触发发给 Devin 的指令）", 4)
        form.addView(name)
        form.addView(prompt)

        // 目标：新会话/指定会话——指定时每次触发往同一会话发消息
        var targetId: String? = null
        var targetTitle = ""
        val targetRow = row("目标", "新会话")
        val sessionRow = row("会话", "点这里选择")
        sessionRow.visibility = View.GONE
        form.addView(targetRow)
        form.addView(sessionRow)
        targetRow.setOnClickListener {
            Sheet.list(this, "目标", listOf("新会话", "指定会话").map { Sheet.Row(it) }) { i ->
                (targetRow.getChildAt(1) as TextView).text = if (i == 0) "新会话" else "指定会话"
                sessionRow.visibility = if (i == 0) View.GONE else View.VISIBLE
                if (i == 0) targetId = null
            }
        }
        sessionRow.setOnClickListener {
            val api = DevinApi.v3(Prefs(this@NewAutomationActivity))
            lifecycleScope.launch {
                try {
                    val ss = api.listSessions(50)
                    if (ss.isEmpty()) {
                        Toast.makeText(this@NewAutomationActivity, "没有会话可选",
                            Toast.LENGTH_SHORT).show()
                        return@launch
                    }
                    Sheet.list(this@NewAutomationActivity, "选会话",
                        ss.map { Sheet.Row(it.title) }) { i ->
                        targetId = ss[i].id
                        targetTitle = ss[i].title
                        (sessionRow.getChildAt(1) as TextView).text = targetTitle
                    }
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    Toast.makeText(this@NewAutomationActivity, e.message,
                        Toast.LENGTH_SHORT).show()
                }
            }
        }

        val freqRow = row("频率", "每天")
        form.addView(freqRow)
        val weekRow = row("周几", "周一")
        val monthRow = row("几号", "1 号")
        val dateRow = row("日期", onceDate.toString())
        val timeRow = row("时间", "%02d:%02d".format(hour, minute))

        freqRow.setOnClickListener {
            Sheet.list(this, "频率", freqNames.map { Sheet.Row(it) }) { i ->
                freq = i
                (freqRow.getChildAt(1) as TextView).text = freqNames[i]
                weekRow.visibility = if (freq == 1) View.VISIBLE else View.GONE
                monthRow.visibility = if (freq == 2) View.VISIBLE else View.GONE
                dateRow.visibility = if (freq == 3) View.VISIBLE else View.GONE
            }
        }
        weekRow.setOnClickListener {
            Sheet.list(this, "周几", weekNames.map { Sheet.Row(it) }) { i ->
                weekday = i
                (weekRow.getChildAt(1) as TextView).text = weekNames[i]
            }
        }
        monthRow.setOnClickListener {
            val days = (1..28).map { "$it 号" } + "月末"
            Sheet.list(this, "每月几号", days.map { Sheet.Row(it) }) { i ->
                monthday = i + 1
                (monthRow.getChildAt(1) as TextView).text = days[i]
            }
        }
        dateRow.setOnClickListener {
            DatePickerDialog(this, { _, y, m, d ->
                onceDate = LocalDate.of(y, m + 1, d)
                (dateRow.getChildAt(1) as TextView).text = onceDate.toString()
            }, onceDate.year, onceDate.monthValue - 1, onceDate.dayOfMonth).show()
        }
        timeRow.setOnClickListener {
            TimePickerDialog(this, { _, h, m ->
                hour = h; minute = m
                (timeRow.getChildAt(1) as TextView).text = "%02d:%02d".format(hour, minute)
            }, hour, minute, true).show()
        }
        form.addView(weekRow)
        form.addView(monthRow)
        form.addView(dateRow)
        form.addView(timeRow)
        weekRow.visibility = View.GONE
        monthRow.visibility = View.GONE
        dateRow.visibility = View.GONE

        val hint = TextView(this)
        hint.text = "到点自动执行上面的任务：选「新会话」每次开一个会话，选「指定会话」则往同一会话发消息。"
        hint.textSize = 13f
        hint.setTextColor(resolveAttr(android.R.attr.textColorSecondary))
        hint.setPadding(0, 8, 0, 8)
        form.addView(hint)

        val submit = Button(this)
        submit.text = "创建"
        form.addView(submit)
        submit.setOnClickListener {
            val n = name.text.toString().trim()
            val p = prompt.text.toString().trim()
            if (n.isEmpty() || p.isEmpty()) {
                Toast.makeText(this, "名称和任务内容都要填", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (sessionRow.visibility == View.VISIBLE && targetId == null) {
                Toast.makeText(this, "先选一个会话", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            submit.isEnabled = false
            lifecycleScope.launch {
                try {
                    DevinApi.v3(Prefs(this@NewAutomationActivity))
                        .createAutomation(n, buildRrule(), p, targetId)
                    Toast.makeText(this@NewAutomationActivity, "已创建", Toast.LENGTH_SHORT).show()
                    finish()
                } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    submit.isEnabled = true
                    Toast.makeText(this@NewAutomationActivity, e.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun edit(hint: String, lines: Int = 1): EditText {
        val e = EditText(this)
        e.hint = hint
        e.minLines = lines
        e.gravity = if (lines > 1) Gravity.TOP else Gravity.CENTER_VERTICAL
        e.setBackgroundResource(R.drawable.bg_field)
        e.setPadding(24, 16, 24, 16)
        val lp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.topMargin = 8; lp.bottomMargin = 8
        e.layoutParams = lp
        return e
    }

    /** 一行「左标签 + 右当前值」，点按弹选择器，回调里改 getChildAt(1)。 */
    private fun row(labelText: String, value: String): LinearLayout {
        val box = LinearLayout(this)
        box.orientation = LinearLayout.HORIZONTAL
        box.gravity = Gravity.CENTER_VERTICAL
        box.setPadding(0, 14, 0, 14)
        box.setBackgroundResource(resolveAttrResource(android.R.attr.selectableItemBackground))
        val label = TextView(this)
        label.text = labelText
        label.textSize = 15f
        label.setTextColor(resolveAttr(android.R.attr.textColorPrimary))
        label.layoutParams = LinearLayout.LayoutParams(0,
            LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        box.addView(label)
        val v = TextView(this)
        v.text = value
        v.textSize = 15f
        v.setTextColor(resolveAttr(android.R.attr.colorAccent))
        box.addView(v)
        return box
    }

    private fun buildRrule(): String {
        val zone = ZoneId.systemDefault()
        val fmt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
        return when (freq) {
            1 -> { // 每周——本地某周几某时刻换算到 UTC，跨日界则 BYDAY 跟着前移
                var d = LocalDate.now(zone)
                while (d.dayOfWeek != DayOfWeek.of(weekday + 1)) d = d.plusDays(1)
                val utc = LocalDateTime.of(d, LocalTime.of(hour, minute))
                    .atZone(zone).withZoneSameInstant(ZoneOffset.UTC)
                "FREQ=WEEKLY;BYDAY=${utc.dayOfWeek.name.take(2)};" +
                    "BYHOUR=${utc.hour};BYMINUTE=${utc.minute}"
            }
            2 -> { // 每月——月底日界可能推到上月末，直接取 UTC 后的日号
                val d = LocalDate.now(zone).withDayOfMonth(
                    minOf(monthday, LocalDate.now(zone).lengthOfMonth()))
                val utc = LocalDateTime.of(d, LocalTime.of(hour, minute))
                    .atZone(zone).withZoneSameInstant(ZoneOffset.UTC)
                val dom = if (monthday == 29) -1 else utc.dayOfMonth
                "FREQ=MONTHLY;BYMONTHDAY=$dom;BYHOUR=${utc.hour};BYMINUTE=${utc.minute}"
            }
            3 -> { // 仅一次：DTSTART + COUNT=1，触发一次后自动停用
                val utc = LocalDateTime.of(onceDate, LocalTime.of(hour, minute))
                    .atZone(zone).withZoneSameInstant(ZoneOffset.UTC)
                "DTSTART:" + utc.format(fmt) + "\nRRULE:FREQ=DAILY;COUNT=1"
            }
            else -> { // 每天
                val utc = LocalDateTime.of(LocalDate.now(zone), LocalTime.of(hour, minute))
                    .atZone(zone).withZoneSameInstant(ZoneOffset.UTC)
                "FREQ=DAILY;BYHOUR=${utc.hour};BYMINUTE=${utc.minute}"
            }
        }
    }

    private fun resolveAttr(attr: Int): Int {
        val ta = obtainStyledAttributes(intArrayOf(attr))
        val c = ta.getColor(0, 0)
        ta.recycle()
        return c
    }

    private fun resolveAttrResource(attr: Int): Int {
        val ta = obtainStyledAttributes(intArrayOf(attr))
        val r = ta.getResourceId(0, 0)
        ta.recycle()
        return r
    }
}
