package com.nancy.devinmobile

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * 更新记录页：本地打包的版本历史（不动态加载）。
 * 进页面时静默检测更新——有新版本则顶部横幅提示，点击走 Updater 流程。
 */
class ChangelogActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        setContentView(R.layout.activity_changelog)
        findViewById<ImageButton>(R.id.back).setOnClickListener { finish() }

        val list = findViewById<LinearLayout>(R.id.list)
        val cur = "v${BuildConfig.VERSION_NAME}"
        val prefs = Prefs(this)
        fun addRow(version: String, notes: String, index: Int = -1) {
            val v = TextView(this)
            v.text = version + if (version == cur) " · 当前版本" else ""
            v.textSize = 15f
            v.setTextColor(resolveAttr(android.R.attr.textColorPrimary))
            v.setTypeface(null, android.graphics.Typeface.BOLD)
            if (index >= 0) list.addView(v, index) else list.addView(v)

            val n = TextView(this)
            n.text = notes
            n.textSize = 14f
            n.setTextColor(resolveAttr(android.R.attr.textColorSecondary))
            n.setPadding(0, 4, 0, 20)
            if (index >= 0) list.addView(n, index + 1) else list.addView(n)
        }

        /** 已渲染列表顶部的 versionCode——远端只补比这新的条目，不整页重建。 */
        var renderedTopVc = -1
        // 优先渲染上次拉到的远端 history 缓存（秒显）；无缓存退回本地静态清单
        runCatching {
            org.json.JSONArray(prefs.changelogJson).let { arr ->
                (0 until arr.length()).map { arr.getJSONObject(it) }
                    .sortedByDescending { it.optInt("versionCode") }
                    .map { "v" + it.optString("versionName") to it.optString("notes") }
            }
        }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { cached ->
            cached.forEach { addRow(it.first, it.second) }
            renderedTopVc = org.json.JSONArray(prefs.changelogJson)
                .let { arr -> (0 until arr.length()).maxOf { arr.getJSONObject(it).optInt("versionCode") } }
        }
        if (renderedTopVc < 0) Changelog.entries.forEach { addRow(it.version, it.notes) }

        val banner = findViewById<TextView>(R.id.update_banner)
        banner.setOnClickListener {
            lifecycleScope.launch { Updater.check(this@ChangelogActivity, manual = true) }
        }
        // 状态行：检测中→有新版本横幅（橙底可点）/已是最新（灰字）
        val muted = resolveAttr(android.R.attr.textColorSecondary)
        val accent = resolveAttr(android.R.attr.colorPrimary)
        banner.text = getString(R.string.checking_update)
        banner.setBackgroundResource(0)
        banner.setTextColor(muted)
        banner.visibility = View.VISIBLE
        lifecycleScope.launch {
            val rel = Updater.peek()
            if (rel != null && rel.history.isNotEmpty()) {
                if (rel.historyJson.isNotEmpty()) prefs.changelogJson = rel.historyJson
                val remoteTop = rel.history.first().versionCode
                if (renderedTopVc < 0) {
                    // 首拉：清掉本地静态清单换全量
                    list.removeAllViews()
                    rel.history.forEach { addRow(it.label, it.notes) }
                    renderedTopVc = remoteTop
                } else if (remoteTop > renderedTopVc) {
                    // 增量：只把新出的版本插到顶部
                    rel.history.takeWhile { it.versionCode > renderedTopVc }
                        .reversed().forEach { addRow(it.label, it.notes, index = 0) }
                    renderedTopVc = remoteTop
                }
            }
            if (rel != null && rel.versionCode > BuildConfig.VERSION_CODE) {
                banner.text = getString(R.string.update_banner_fmt, rel.versionName)
                banner.setBackgroundResource(R.drawable.bg_bigbtn)
                banner.setTextColor(accent)
            } else {
                banner.text = getString(R.string.already_latest_fmt, BuildConfig.VERSION_NAME)
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
