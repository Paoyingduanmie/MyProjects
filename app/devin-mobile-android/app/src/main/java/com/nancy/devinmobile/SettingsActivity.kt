package com.nancy.devinmobile

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class SettingsActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var overlayRow: TextView

    override fun onResume() {
        super.onResume()
        // 从系统设置返回时刷新权限状态文案
        if (::overlayRow.isInitialized) overlayRow.text = "后台弹窗权限：" +
            if (android.provider.Settings.canDrawOverlays(this)) "已开启" else "未开启（点我去开启）"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        App.applyActivityTheme(this)
        setContentView(R.layout.activity_settings)
        prefs = Prefs(this)
        findViewById<View>(R.id.scrim).setOnClickListener { finish() }
        findViewById<TextView>(R.id.version).apply {
            text = "v${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})  ›"
            setOnClickListener {
                startActivity(Intent(this@SettingsActivity, ChangelogActivity::class.java))
            }
        }
        keyProbe = if (prefs.keyConn) true else null
        patProbe = if (prefs.patConn) true else null
        refreshCredSummary()
        probeStatus()

        findViewById<TextView>(R.id.credentials_row).setOnClickListener {
            Sheet.list(this, getString(R.string.credentials_label), listOf(
                Sheet.Row(getString(R.string.edit_api_key_row)),
                Sheet.Row(getString(R.string.edit_pat_row)),
            )) { i -> if (i == 0) showKeyDialog() else showPatDialog() }
        }
        // 未配置时直接弹输入框（从列表页跳转过来的首次设置场景）
        if (!prefs.configured) showKeyDialog()

        findViewById<TextView>(R.id.theme_row).setOnClickListener {
            val names = arrayOf("system", "light", "dark", "warm")
            val labels = arrayOf(
                getString(R.string.theme_system),
                getString(R.string.theme_light),
                getString(R.string.theme_dark),
                getString(R.string.theme_warm),
            )
            val checked = names.indexOf(prefs.theme).coerceAtLeast(0)
            Sheet.list(this, getString(R.string.theme_row),
                labels.mapIndexed { i, l -> Sheet.Row(l + if (i == checked) " ✓" else "") }) { i ->
                prefs.theme = names[i]
                App.applyTheme(this)
                recreate()   // 暖色是 setTheme 级别，需重建当前页生效
            }
        }

        val bgConn = findViewById<TextView>(R.id.bg_conn_row)
        fun showBgConn() {
            bgConn.text = getString(R.string.bg_conn_row) + " · " +
                getString(if (prefs.fgService) R.string.on else R.string.off)
        }
        showBgConn()
        bgConn.setOnClickListener {
            prefs.fgService = !prefs.fgService
            if (prefs.fgService && android.os.Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
                    android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
            }
            ConnService.sync(this)
            showBgConn()
        }

        // 后台弹窗权限：被拒一次系统不再弹窗，这里可重新跳去开（onResume 里刷新状态文案）
        overlayRow = findViewById(R.id.overlay_perm_row)
        overlayRow.setOnClickListener {
            startActivity(Intent(
                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:$packageName")))
        }

        findViewById<TextView>(R.id.clear_cache_row).setOnClickListener {
            LocalCache.clear(this)
            // deleteRecursively：音视频缓存等子目录也能清掉（非空目录 delete() 是失败的）
            cacheDir.listFiles()?.forEach { it.deleteRecursively() }
            Toast.makeText(this, R.string.cache_cleared, Toast.LENGTH_SHORT).show()
        }

        findViewById<TextView>(R.id.check_update_row).setOnClickListener {
            lifecycleScope.launch { Updater.check(this@SettingsActivity, manual = true) }
        }

        findViewById<TextView>(R.id.usage_row).setOnClickListener {
            startActivity(Intent(this, UsageActivity::class.java))
        }
    }

    /** null=未探测，true=已连接，false=连接失败。
     *  从 prefs 恢复上次结果——不闪「已配置」，探测完再更新持久值。 */
    private var keyProbe: Boolean? = null
    private var patProbe: Boolean? = null

    private fun credStatus(configured: Boolean, probe: Boolean?): String = when {
        !configured -> getString(R.string.key_not_configured)
        probe == true -> getString(R.string.conn_ok)
        probe == false -> getString(R.string.conn_failed)
        else -> getString(R.string.key_configured)
    }

    /** 一行合并展示两项凭证状态：API key：已连接 · PAT：未配置。 */
    private fun refreshCredSummary() {
        findViewById<TextView>(R.id.cred_summary).text = getString(
            R.string.cred_format,
            credStatus(prefs.apiKey.isNotEmpty(), keyProbe),
            credStatus(prefs.pat.isNotEmpty(), patProbe),
        )
    }

    /** 已配置的两项做一次轻量连通性检查。 */
    private fun probeStatus() {
        if (prefs.apiKey.isNotEmpty()) {
            lifecycleScope.launch {
                keyProbe = try { DevinApi(prefs).probe() } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    false
                }
                prefs.keyConn = keyProbe == true
                refreshCredSummary()
            }
        }
        if (prefs.pat.isNotEmpty()) {
            lifecycleScope.launch {
                patProbe = try { AcpClient.probeOrg(prefs.pat); true } catch (e: Exception) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    false
                }
                prefs.patConn = patProbe == true
                refreshCredSummary()
            }
        }
    }

    private fun showPatDialog() {
        Sheet.input(this, getString(R.string.edit_pat_title),
            hint = getString(R.string.pat_hint), initial = prefs.pat,
            password = true) { v ->
            prefs.pat = v
            patProbe = null
            prefs.patConn = false
            refreshCredSummary()
            probeStatus()
        }
    }

    private fun showKeyDialog() {
        Sheet.input(this, getString(R.string.edit_key_title),
            initial = prefs.apiKey, password = true,
            okLabel = getString(R.string.save_and_verify)) { key ->
            if (key.isEmpty()) {
                Toast.makeText(this, R.string.key_required, Toast.LENGTH_SHORT).show()
                return@input
            }
            verifyAndSave(key)
        }
    }

    /** 先用候选凭据验证，成功后才覆盖已有配置；org_id 始终自动探测。 */
    private fun verifyAndSave(key: String) {
        val candidate = MemoryCredentials(key, "")
        val summary = findViewById<TextView>(R.id.cred_summary)
        summary.setText(R.string.verifying)
        lifecycleScope.launch {
            try {
                val sessions = DevinApi(candidate).listSessions(limit = 1)
                prefs.apiKey = candidate.apiKey
                prefs.orgId = candidate.orgId
                keyProbe = true
                prefs.keyConn = true
                refreshCredSummary()
                Toast.makeText(
                    this@SettingsActivity,
                    getString(R.string.verify_ok, sessions.size),
                    Toast.LENGTH_SHORT,
                ).show()
                if (!intent.hasExtra(EXTRA_STAY)) {
                    startActivity(
                        Intent(this@SettingsActivity, SessionListActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    )
                    finish()
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                summary.text = getString(R.string.verify_failed, e.message ?: "")
            }
        }
    }

    companion object {
        /** 设置页被列表页齿轮点开时带上，验证成功后留在设置页而不是跳回列表。 */
        const val EXTRA_STAY = "stay_in_settings"
    }
}
