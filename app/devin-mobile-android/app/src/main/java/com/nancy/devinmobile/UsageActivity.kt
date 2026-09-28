package com.nancy.devinmobile

import android.os.Bundle
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 用量统计页：org 级 metrics/usage 计数 + consumption/daily 每日 ACU。 */
class UsageActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        setContentView(R.layout.activity_usage)
        findViewById<ImageButton>(R.id.back).setOnClickListener { finish() }

        val list = findViewById<LinearLayout>(R.id.list)
        fun head(t: String) {
            val v = TextView(this)
            v.text = t
            v.textSize = 15f
            v.setTextColor(resolveAttr(android.R.attr.textColorPrimary))
            v.setTypeface(null, android.graphics.Typeface.BOLD)
            v.setPadding(0, 8, 0, 4)
            list.addView(v)
        }
        fun row(t: String) {
            val v = TextView(this)
            v.text = t
            v.textSize = 14f
            v.setTextColor(resolveAttr(android.R.attr.textColorSecondary))
            v.setPadding(0, 2, 0, 4)
            list.addView(v)
        }
        head(getString(R.string.loading))

        lifecycleScope.launch {
            try {
                val api = DevinApi.v3(Prefs(this@UsageActivity))
                val usage = api.usageMetrics()
                val daily = api.consumptionDaily(30)
                list.removeAllViews()

                head(getString(R.string.usage_totals))
                row("会话 ${usage.optInt("sessions_count")} · " +
                    "PR 创建 ${usage.optInt("prs_created_count")} · " +
                    "PR 合并 ${usage.optInt("prs_merged_count")} · " +
                    "搜索 ${usage.optInt("searches_count")}")

                val fmt = SimpleDateFormat("MM-dd", Locale.getDefault())
                var total = daily.optDouble("total_acus")
                val items = daily.optJSONArray("consumption_by_date")
                if (total == 0.0 && items != null) {
                    // 有的账户 total_acus 恒 0——按明细求和兜底
                    for (i in 0 until items.length())
                        total += items.optJSONObject(i)?.optDouble("acus") ?: 0.0
                }
                head(String.format("%.2f", total) + " ACU · 近 30 天")
                if (items != null && items.length() > 0) {
                    for (i in 0 until items.length()) {
                        val d = items.getJSONObject(i)
                        val acus = d.optDouble("acus")
                        if (acus <= 0.0) continue
                        row(fmt.format(Date(d.optLong("date") * 1000)) +
                            "  " + String.format("%.2f", acus) + " ACU")
                    }
                } else row(getString(R.string.usage_empty))
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                list.removeAllViews()
                head(getString(R.string.usage_failed) + "：" + e.message)
            }
        }
    }

    private fun resolveAttr(attr: Int): Int {
        val ta = obtainStyledAttributes(intArrayOf(attr))
        val c = ta.getColor(0, 0)
        ta.recycle()
        return c
    }
}
