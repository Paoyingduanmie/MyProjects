# wecom-devin-bridge

企业微信智能机器人 ⇄ Devin 桥接。长连接收企业微信消息 → 创建/steer Devin 会话 → 轮询 Devin 回复推回企业微信。

## 运行

```bash
pip install wecom-aibot-python-sdk
export WECOM_BOT_ID=... WECOM_BOT_SECRET=... DEVIN_API_KEY=cog_...
python3 bridge.py
# DEVIN_ORG_ID 可选，缺省自动经 /v3/self 探测
```

## 聊天命令

- `/new <任务>` 新建会话并绑定；`/bind <session_id>` 绑定已有；`/unbind` 解绑
- `/status` 看状态；`/help` 帮助
- 直接发文字：已绑定时 steer 会话，未绑定时自动 /new
- Devin 的新回复和状态变化每 ~8s 轮询后主动推送回来

绑定关系存 `bindings.json`（已 gitignore）。

## 依赖

`wecom-aibot-python-sdk`（websockets/aiohttp/pyee/cryptography）。无公网入口要求——长连接模式由 bot 主动连出。
