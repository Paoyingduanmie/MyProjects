# Devin Mobile（PWA）

仿 Devin 官方移动端的网页版客户端：会话列表、聊天式 steer、状态实时刷新。安卓手机浏览器打开后「添加到主屏幕」即接近原生 app 体验。

## 架构

```
手机/电脑浏览器 ──► 本机 server.py (:8321)
                    ├─ /static/*   PWA 页面（无构建，纯 vanilla JS）
                    └─ /api/*  ──► https://api.devin.ai/v1/*  （自动注入 Bearer key）
```

浏览器不直连 Devin API（CORS + key 不出本机）。

## 使用

### 1. 配置 API key（二选一）

- 环境变量：`set DEVIN_API_KEY=...`（cmd）/ `$env:DEVIN_API_KEY="..."`（PowerShell）
- 或在 `server.py` 同目录建 `config.json`：`{"api_key": "...", "org_id": "org-..."}`

支持两种 key，服务端按前缀自动选版本：

| key 前缀 | 类型 | API | org_id |
|---|---|---|---|
| `apk_user_*` / `apk_*` | Personal / Service API Key | v1 | 不需要 |
| `cog_*` | Service User（Settings → Devin API 创建） | v3 | 自动经 `/v3/self` 探测，也可在 config.json 指定 |

**注意（v3 / cog_ key）**：Member 角色的 service user 只能看到**自己创建**的会话；要看 org 内所有人的会话需要 `ViewOrgSessions` 权限（Admin 角色）。用本 app 创建的会话不受影响。

### 2. 启动

```bash
python server.py          # 默认端口 8321，监听 0.0.0.0
python server.py 9000     # 换端口
```

### 3. 访问

- 本机：http://127.0.0.1:8321
- 手机（同一局域网）：http://<电脑IP>:8321 ，Chrome 菜单 → 添加到主屏幕

> PWA「安装」严格意义上要求 HTTPS 或 localhost；局域网 IP 下 Chrome 的「添加到主屏幕」仍可用（快捷方式形态），功能不受影响。需要完整 standalone 体验可加自签证书或内网穿透。

### 4. 无 key 预览

http://127.0.0.1:8321/?demo=1 —— 内置演示数据，可看界面效果。

## 功能对照

| 截图功能 | 本实现 |
|---|---|
| 会话列表 + Working/Done 状态点 | ✅ 15s 静默轮询；v3 的 running+suspended 等状态已映射 |
| 聊天流 + 工具调用卡片 | ✅ user 右泡 / devin 左泡 / 其他类型为事件卡片，4s 轮询 |
| Steer while it works 输入框 | ✅ POST .../messages |
| 新建会话 | ✅ 右下角 ＋；v3 可选 devin_mode（normal/fast/lite/ultra/fusion）和 platform（windows/macos/outpost 池名） |
| PR 链接标记 | ✅ 列表项显示 PR 徽标 |
| 模型选择器 / 分支名 | ❌ API 不返回，未做 |

## 已知限制

- API 无流式推送，只能轮询（聊天 4s / 列表 15s），"实时性"比官方 app 差几秒
- v3 消息流只区分 `user`/`devin` 两类，**没有逐条工具调用事件**，事件卡片形态主要在 v1 上体现
- 会话状态详情（status_detail）能看到 waiting_for_user / finished 等，已映射到状态徽标
- key 对应 org 的会话数据都经本机代理，别把端口暴露到不信任的网络

## 实时模式（内部 ACP 接口，实验性）

逆向官方 webapp 得到的结论：官方界面用的不是公开 REST API，而是 Auth0 用户态认证的
WebSocket 通道 `wss://app.devin.ai/api/acp/live`（ACP/JSON-RPC 协议），能拿到模型版本、
分支、逐条 tool call 实时事件等完整数据。

本 app 的接入方式：

- `config.json` 增加 `"pat": "<PAT>"`（Devin 网页版 Settings → Devin API → PATs 创建）
- 前端 `boot()` 从 `/api/config` 拿 PAT + org_id，浏览器**直连** `wss://app.devin.ai/api/acp/live`
  （该端点不校验 Origin，不需要经过本机代理）
- 协议握手：`initialize` → `session/list`（富元数据：模型 devinVersionOverride、
  statusEnum、消息摘要）→ `session/resume`（注意 sessionId 必须带 `devin-` 前缀，
  否则返回 Access denied）→ 持续收 `session/update` / `session_update_batch` 通知
- 发消息走 `session/prompt`；服务端发的 `session/request_permission` 默认回 cancelled

注意事项：

- PAT 会下发到浏览器——只在本机/可信局域网跑，别把端口暴露到公网
- 内部接口无文档无兼容承诺，Devin 随时可能改；异常时 app 自动回退 REST 轮询
- `cog_` service user key 在内部 WS 上被拒（403/500），必须用 PAT 或 Auth0 JWT
- session/list 只返回 PAT 用户本人的会话（service user 建的 api 会话看不到）；
  REST 列表能看到 org 内更多会话，两种数据源各有视野差异
