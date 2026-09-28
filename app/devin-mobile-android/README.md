# Devin Mobile Android（原生客户端）

Kotlin 原生安卓客户端，手机**直连** `https://api.devin.ai`，不依赖电脑上的 `web/server.py`
（原生应用无 CORS 限制，key 存在手机本地 SharedPreferences）。

## 功能

| 功能 | 说明 |
|---|---|
| API key 设置 | `apk_*` 走 v1，`cog_*` 走 v3；保存时立刻拉一次会话列表做验证 |
| org_id | v3 key 经 `/v3/self` 自动探测并缓存，也可在设置里手填 |
| 会话列表 | 状态徽标（Working/Done/Blocked/Error）、PR 状态标记（open 绿/merged 紫/closed 红）、已归档标记、相对时间；下拉刷新 + 15s 轮询 |
| 会话操作 | 长按会话 → 菜单：归档/取消归档（仅 v3）、删除（二次确认） |
| 会话详情 | 消息气泡流（user/devin）、状态 + 等待原因（等你回复/等你批准/额度不足）、PR 按钮跳 PR 页、4s 轮询、「网页」按钮跳 app.devin.ai |
| Steer | 输入框发消息（v1 `POST /sessions/{id}/message`，v3 `.../messages`） |
| 新建会话 | prompt + 可选 playbook_id |
| 在线更新 | 启动检查 dist/version.json，弹窗提示 → 下载 → 拉起系统安装 |

## 构建

```bash
cd app/devin-mobile-android
./gradlew assembleDebug        # 产物 app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

依赖 Android SDK（`ANDROID_HOME`，或在本目录建 `local.properties` 写 `sdk.dir=...`）、JDK 17。
云端环境由 `.devin/blueprint.yaml` 装好 SDK + Gradle。

### 固定签名（覆盖安装不丢数据）

debug 构建优先使用 `~/.devin-mobile-signing.keystore` + `~/.devin-mobile-signing.properties`
（storePassword/keyPassword/keyAlias）签名；文件不存在时回退默认 debug 签名。
不同机器用同一 keystore 出的 APK 可互相覆盖安装，app 内已存 API key 不会丢；
签名不同的 APK 覆盖安装会被系统拒绝（只能先卸载，数据随之清除）。
云端 keystore 由 blueprint 从 org secret（`DEVIN_MOBILE_KEYSTORE_B64` / `DEVIN_MOBILE_KEYSTORE_PASS`）重建。

仓库镜像默认走阿里云（`settings.gradle.kts`）——国内网络直连 Maven Central 经常被限流。

## 在线更新

启动时（会话列表页）自动检查 `app/dist/version.json`（gitlab raw，无需登录），远端
`versionCode` 大于本机则弹窗提示 → 下载 APK → 拉起系统安装器（用户点一次「安装」）。
Android 不允许静默安装；首次会引导授权「安装未知应用」。
非 dist 路径或网络失败时静默跳过，不影响使用。

### 发布新版本

```bash
# 1. build.gradle.kts: versionCode +1、versionName 更新
# 2. 构建
./gradlew assembleDebug
# 3. 覆盖 dist
cp app/build/outputs/apk/debug/app-debug.apk ../dist/app-debug.apk
# 4. 更新 ../dist/version.json（versionCode / apkUrl / notes）并随代码合并进 main
```

> dist 的 APK 必须用同一 keystore 签名（见上节），否则用户覆盖安装会被拒。

## 首次使用

1. 安装 APK 打开，填 Devin API key（Settings → Devin API 创建），点「保存并验证」。
2. 验证通过即进入会话列表。

## 与 `web/`（PWA）的区别

`web/` 是电脑跑 `server.py` + 手机浏览器访问的方案，优点是能用内部 ACP WebSocket 拿真·实时
逐条 tool call；缺点是必须有台电脑开着机 + 内网穿透。本原生 app 是纯 REST 轮询、随时可用，
两者共存互不影响。

## 未做（后续）

- 实时 ACP WebSocket（需 PAT，收 tool call 逐条事件）
- 附件上传、权限请求卡片、Markdown 渲染、模型切换
- 消息本地缓存与分页加载历史
