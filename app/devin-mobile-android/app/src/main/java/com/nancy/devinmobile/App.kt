package com.nancy.devinmobile

import android.app.Activity
import android.app.Application
import android.os.Bundle
import androidx.appcompat.app.AppCompatDelegate

class App : Application() {

    override fun onCreate() {
        super.onCreate()
        applyTheme(this)
        ConnService.sync(this)
        StatusWatch.start(this)   // 迁移检测兜底：直进会话/列表页没起也收完成提醒
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) { top = activity }
            override fun onActivityPaused(activity: Activity) {
                if (top === activity) top = null
            }
            override fun onActivityCreated(a: Activity, b: Bundle?) {}
            override fun onActivityStarted(a: Activity) {}
            override fun onActivityStopped(a: Activity) {}
            override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
            override fun onActivityDestroyed(a: Activity) {}
        })
    }

    companion object {
        /** 前台顶层 Activity：任务完成等应用内弹窗挂这里。 */
        var top: Activity? = null

        /** 按保存的偏好应用主题；"system" / "light" / "dark" / "warm"。 */
        fun applyTheme(context: android.content.Context) {
            AppCompatDelegate.setDefaultNightMode(
                when (Prefs(context).theme) {
                    "dark" -> AppCompatDelegate.MODE_NIGHT_YES
                    "light", "warm" -> AppCompatDelegate.MODE_NIGHT_NO
                    else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
                }
            )
        }

        /** Activity.onCreate 里 setContentView 前调用；暖色是自定义主题需 setTheme。 */
        fun applyActivityTheme(activity: android.app.Activity) {
            applyTheme(activity)
            if (Prefs(activity).theme == "warm") activity.setTheme(
                if (activity is SettingsActivity) R.style.Theme_DevinMobile_Warm_Sheet
                else R.style.Theme_DevinMobile_Warm)
        }
    }
}
