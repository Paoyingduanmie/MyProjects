# playground-android（小游戏合集）

`playground/` 下所有小游戏的安卓合集壳：全屏 WebView + 合集首页（launcher）。
往 `playground/` 丢一个含 `index.html` 的目录，构建后自动出现在首页列表里。

## 功能

- **合集首页**：`assets/index.html`，卡片列表由构建生成的 `games.js` 驱动（标题取各游戏 README 首个 `# ` 标题）
- **设置中心**（左下角 ⚙，底部弹层，同 devin app 样式）：外观（浅色/深色/暖黄/跟随系统）、检查更新、更新日志（`assets/changelog.md`）、版本号
- **沉浸全屏**：隐藏状态栏/导航栏，上滑呼出
- **返回键**：游戏内 → 回首页；首页 → 双击退出
- **在线更新**：与 `app/devin-mobile-android` 同套机制，读 `playground/dist/version.json`，比对 `versionCode` → 下载 → 拉起系统安装器；启动时自动检查，设置里可手动触发
- **JS 桥 `window.Android`**：游戏页面可软调用（`window.Android?.vibrate?.(ms)`），缺桥自动降级：

| 方法 | 说明 |
|---|---|
| `vibrate(ms)` | 震动反馈（合并方块等） |
| `shareScore(text)` | WebView 截图 + 系统分享战绩 |
| `bgmSet(file)` / `bgmStop()` / `bgmState()` | ExoPlayer 循环播放（assets/music/ 或 filesDir/bgm/），自带音频焦点与拔耳机暂停，切歌淡入淡出 |
| `bgmImport()` / `bgmList()` / `bgmDelete(name)` | 导入 / 列出 / 删除 `filesDir/bgm/` 曲目（回传 `window.__bgmDeleted`） |
| `checkUpdate()` / `appVersion()` / `changelog()` | 手动检查更新 / 版本号 / 更新日志文本 |
| `peekUpdate()` | 静默探测新版本，回传 `window.__updatePeek(rel)`（更新日志页顶部横幅用，同 devin app） |
| `audioFxConfig()` / `audioSetPreset(i)` / `audioSetBass(0-1000)` / `audioSetVirtualizer(b)` / `audioSetLoudness(b)` | 音效：均衡器预设/低音增强/环绕声/响度增强，设置存 SharedPreferences |

## BGM 曲库

- **内置曲库**：mp3/ogg/m4a/wav 放 `app/src/main/assets/music/`，构建生成 `music.js`
- **用户导入**：首页 📂 按钮拉起系统文件选择器，文件拷进 `filesDir/bgm/` 持久保存，单独列在「我的音乐」分组；播放时用户文件优先于同名内置文件
- `localStorage` 记住上次选择；原生播放，切页面不断

## 构建

```bash
cd playground/android
ANDROID_HOME=~/toolchains/android-sdk ./gradlew assembleDebug
# 产物 app/build/outputs/apk/debug/app-debug.apk
```

签名复用 `~/.devin-mobile-signing.keystore`（与 devin-mobile 同一套固定签名，keystore 由
blueprint 从 org secret 重建；不存在时回退默认 debug 签名）。

## 发布新版本（在线更新）

```bash
# 1. app/build.gradle.kts: versionCode +1、versionName 更新
# 2. 构建
./gradlew assembleDebug
# 3. 覆盖 dist
cp app/build/outputs/apk/debug/app-debug.apk ../dist/games-debug.apk
# 4. 更新 ../dist/version.json（versionCode / apkUrl / notes）并随代码合并进 main
```

> dist 的 APK 必须用同一 keystore 签名，否则用户覆盖安装会被系统拒绝。
