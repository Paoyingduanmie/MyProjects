# Devin Mobile（PWA）

仿 Devin 官方移动端的网页版客户端：会话列表、聊天式 steer、状态实时刷新。安卓手机浏览器打开后「添加到主屏幕」即接近原生 app 体验。

## 架构

```
手机/电脑浏览器 ──► 本机 server.py (:8321)
                    ├─ /static/*   PWA 页面（无构建，纯 vanilla JS）
                    ├─ /api/*  ──► https://api.devin.ai/v1|v3/*  （自动注入 Bearer key）
                    └─ /iapi/* ──► https://app.devin.ai/api/*    （内部接口，注入 PAT）
```

浏览器不直连 Devin REST API（CORS + key 不出本机）；实时通道例外——ACP WebSocket
由浏览器直连 app.devin.ai（该端点不校验 Origin）。

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
- 手机（任意网络，推荐）：Cloudflare Tunnel，见下文

### 4. 无 key 预览

http://127.0.0.1:8321/?demo=1 —— 内置演示数据，可看界面效果。

## 公网访问（ngrok 固定域名 + 访问口令）

```bash
tools/ngrok.exe http --url=detached-citadel-gyration.ngrok-free.dev 8321
```

或直接双击 `start.bat`（同时起 server + tunnel）。

固定域名 `detached-citadel-gyration.ngrok-free.dev` 为 ngrok 免费版赠送，绑定账号——
多台电脑共用同一 authtoken，**哪台开机哪台响应**，手机始终访问同一地址
（注意两台同时跑会互抢，只用一台开 tunnel）。

备选：`tools/cloudflared.exe tunnel --url http://127.0.0.1:8321` 出临时域名（每次随机）。

### 第二台电脑部署（家里/公司同步）

```bash
git clone git@gitlab.com:moonnancy881-dotcom/myprojects.git
cd myprojects
```

然后补齐三样不进 git 的本机文件：

| 文件 | 来源 |
|---|---|
| `web/config.json` | 从已部署机器拷（含 api_key / pat / access_token） |
| `tools/ngrok.exe` | 拷贝，或 https://ngrok.com/download 下载 |
| ngrok authtoken | `tools/ngrok.exe config add-authtoken <token>`（同一账号 token 通用，token 存在 ngrok.yml 里也可直接拷） |

启动：双击 `web/start.bat`（server + tunnel 一起起）。
同一域名绑定在 ngrok 账号上——**哪台开机哪台响应**，手机不用换地址；
注意两台别同时跑 tunnel（免费版单域名会互抢）。

**公网暴露必须在 `config.json` 配置 `access_token`**——否则任何人拿到 URL 都能取走 PAT。
配置后所有请求需带口令 cookie：

- 手机首次访问打开 `https://xxx.trycloudflare.com/?token=<口令>` 一键种 cookie；
- 或访问 `/login` 输口令。

未配置 `access_token` 时不启用口令门（局域网直连模式行为不变）。
quick tunnel 的 URL 每次启动随机变化；要固定域名需 Cloudflare 账号建 named tunnel。

## 功能对照

| 官方 app 功能 | 本实现 |
|---|---|
| 会话列表 + Working/Done 状态点 | ✅ ACP 实时或 REST 轮询（15s） |
| 聊天流 + 工具调用卡片 | ✅ ACP 逐条 tool call 事件；REST 模式为事件卡片（4s 轮询） |
| 历史消息 | ✅ 进会话自动经 `/iapi/events/{id}` 拉最近 200 条，与实时流按 event_id 去重 |
| Steer while it works 输入框 | ✅ `session/prompt`（实时）或 POST .../messages（REST） |
| 模型选择器（SWE-2 Max 等） | ✅ resume 返回 `configOptions.devin_version`，输入框上方 chip 弹出面板切换（`session/set_config_option`） |
| 新建会话 | ✅ 右下角 ＋；v3 可选 platform（模型在会话内切换） |
| PR 链接标记 | ✅ 列表项显示 PR 徽标 |
| Markdown 渲染 | ✅ Devin 消息渲染代码块/加粗/链接/列表（内置迷你渲染器）；附件 URL 渲染成 📎 卡片 |
| 会话操作 | ✅ 左滑/⋯：重命名（`session/rename`）、归档（`session/archive`）、删除（REST DELETE，二次确认） |
| 权限请求 | ✅ `session/request_permission` 渲染为可点卡片，点选后回执；不再默认拒绝 |
| 断线重连 | ✅ WS 断开自动重连并 re-resume 当前会话，状态行提示 |
| 已读回执 | ✅ 进会话调 `session/markRead` 消除未读点 |
| 新消息提示 | ✅ 翻看历史时来新消息浮「↓ 新消息」按钮 |
| 主题 | ✅ 列表页左下角 ⚙ 切换 浅色/深色/跟随系统（localStorage 记忆） |

## 实时模式（内部 ACP 接口，实验性）

逆向官方 webapp 得到的结论：官方界面用的不是公开 REST API，而是 Auth0/PAT 用户态认证的
WebSocket 通道 `wss://app.devin.ai/api/acp/live`（ACP/JSON-RPC 协议），能拿到模型版本、
分支、逐条 tool call 实时事件等完整数据。

接入方式：

- `config.json` 增加 `"pat": "<PAT>"`（Devin 网页版 Settings → Devin API → PATs 创建）
- 前端 `boot()` 从 `/api/config` 拿 PAT + org_id，浏览器**直连** `wss://app.devin.ai/api/acp/live`
- 协议：`initialize` → `session/list`（富元数据）→ `session/resume`（sessionId 必须带
  `devin-` 前缀）→ 持续收 `session/update` / `session_update_batch`
- 发消息走 `session/prompt`；`session/request_permission` 渲染为卡片由用户点选回执

注意事项：

- PAT 经 `/api/config` 下发到浏览器——只在本机/可信网络跑；公网必须配 `access_token`
- 内部接口无文档无兼容承诺，Devin 随时可能改；异常时 app 自动回退 REST 轮询
- `cog_` service user key 在内部 WS 上被拒（403/500），必须用 PAT 或 Auth0 JWT
- session/list 只返回 PAT 用户本人的会话；REST 列表能看到 org 内更多会话

## 已知限制

- REST 模式无流式推送，只能轮询；实时模式（需 PAT）才是真·实时
- v3 消息流只区分 `user`/`devin` 两类，逐条工具调用只有实时模式才有
- 会话状态详情（status_detail）已映射到状态徽标
