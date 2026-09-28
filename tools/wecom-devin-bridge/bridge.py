#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WeCom(企业微信智能机器人) <-> Devin 桥接

长连接收企业微信消息，转发给 Devin 会话（v3 API，cog_ key），
Devin 的新回复/状态变化轮询后主动推回企业微信。

环境变量（必填）:
  WECOM_BOT_ID / WECOM_BOT_SECRET   智能机器人凭证
  DEVIN_API_KEY                    cog_ 开头的 service user key
  DEVIN_ORG_ID                     可选，缺省经 /v3/self 探测

用法: python3 bridge.py
依赖: pip install wecom-aibot-python-sdk
"""
import asyncio
import base64
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

from aibot import WSClient, WSClientOptions, generate_req_id

try:
    import websockets
except ImportError:
    websockets = None


BASE = Path(__file__).resolve().parent
STATE_FILE = BASE / "bindings.json"
UPSTREAM = "https://api.devin.ai"
POLL_INTERVAL = 8          # 秒，Devin 会话轮询间隔
MAX_PUSH_CHARS = 3500      # 企业微信单条 markdown 上限保守值

HELP = """```
可用命令

 1. /new <任务> — 新建 Devin 会话并绑定本会话
 2. /bind <id前缀|关键词|字母> — 绑定会话（字母来自 /list 结果）
 3. /list — 列出最近会话
 4. /unbind — 解绑
 5. /status — 查看当前会话状态
 6. /rename <新标题> — 重命名绑定会话
 7. /stop — 打断当前轮次（会话保持活动）
 8. /archive — 归档当前会话并解绑
 9. /keepalive [on|off] — 保活开关：开则绑定会话不休眠
10. /skill <名字> <任务> — 调用指定 skill 处理任务（如 /skill goutoujunshi …）
11. /help — 本帮助

直接发文字 = steer 已绑定会话（未绑定时自动 /new）。
发图片 = 图片作为附件 steer 进绑定会话。
Devin 的回复和状态变化每 ~8 秒自动推送回来。
```"""


# ---------------- Devin v3 客户端 ----------------
class Devin:
    def __init__(self, api_key: str, org_id: str = ""):
        self.key = api_key
        self._org = org_id

    def _req(self, method: str, path: str, body: dict | None = None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(UPSTREAM + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")

    def org(self) -> str:
        if not self._org:
            self._org = self._req("GET", "/v3/self").get("org_id", "")
        return self._org

    def create_session(self, prompt: str, devin_mode: str = "", platform: str = "") -> dict:
        body = {"prompt": prompt}
        if devin_mode:
            body["devin_mode"] = devin_mode
        if platform:
            body["platform"] = platform
        return self._req("POST", f"/v3/organizations/{self.org()}/sessions", body)

    def send_message(self, session_id: str, text: str):
        sid = session_id if session_id.startswith("devin-") else "devin-" + session_id
        return self._req("POST", f"/v3/organizations/{self.org()}/sessions/{sid}/messages",
                         {"message": text})

    def session(self, session_id: str) -> dict:
        sid = session_id if session_id.startswith("devin-") else "devin-" + session_id
        return self._req("GET", f"/v3/organizations/{self.org()}/sessions/{sid}")

    def list_sessions(self, limit: int = 15) -> list:
        d = self._req("GET", f"/v3/organizations/{self.org()}/sessions?limit={limit}")
        items = d.get("items") or d.get("sessions") or []
        return [s for s in items if not s.get("is_archived")]

    def session_iapi(self, session_id: str) -> dict:
        """内部接口详情：current_activity / user_action_required / keep_alive 等"""
        sid = session_id.replace("devin-", "")
        req = urllib.request.Request(f"https://app.devin.ai/api/sessions/{sid}")
        req.add_header("Authorization", f"Bearer {self.key}")
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")

    def messages(self, session_id: str, limit: int = 50, after: str = "") -> dict:
        sid = session_id if session_id.startswith("devin-") else "devin-" + session_id
        q = f"limit={limit}" + (f"&after={after}" if after else "")
        return self._req("GET", f"/v3/organizations/{self.org()}/sessions/{sid}/messages?{q}")

    def attachment_url(self, url: str) -> str:
        """app.devin.ai/attachments/<uuid>/<name> -> S3 预签名 URL（~14min 有效，公开可访问）
        需要 apk_ 老版 key（DEVIN_API_KEY_LEGACY），否则 403"""
        m = re.search(r"/attachments/([0-9a-f-]+)/([^?#\s]+)", url)
        if not m:
            raise ValueError("无法解析附件 URL")
        key = os.environ.get("DEVIN_API_KEY_LEGACY", "").strip() or self.key
        req = urllib.request.Request(
            f"https://api.devin.ai/v1/attachments/{m.group(1)}/{urllib.parse.unquote(m.group(2))}")
        req.add_header("Authorization", f"Bearer {key}")
        # 307 跳转到 S3 预签名 URL；不能把 Authorization 带过去（S3 会拒绝双认证）
        no_redirect = urllib.request.build_opener(_NoRedirect)
        try:
            no_redirect.open(req, timeout=30)
            raise ValueError("附件下载未返回重定向")
        except urllib.error.HTTPError as e:
            if e.code not in (301, 302, 303, 307, 308):
                raise
            return e.headers["Location"]

    def download_attachment(self, url: str) -> bytes:
        with urllib.request.urlopen(self.attachment_url(url), timeout=60) as r:
            return r.read()

    def upload_attachment(self, filename: str, data: bytes, mime: str = "application/octet-stream") -> str:
        """multipart 上传到 /v3/organizations/{org}/attachments，返回附件 URL"""
        boundary = "----wecombridge" + hashlib.md5(os.urandom(8)).hexdigest()
        head = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
                f'filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n').encode()
        body = head + data + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            f"{UPSTREAM}/v3/organizations/{self.org()}/attachments",
            data=body, method="POST")
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.loads(r.read() or b"{}")
        url = d.get("url") or ""
        if not url:
            raise RuntimeError(f"上传附件响应无 url: {d}")
        return url


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **kw):
        return None


IMG_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")
VID_EXTS = (".mp4", ".mov", ".webm", ".mkv", ".avi")
MEDIA_EXTS = IMG_EXTS + VID_EXTS
ATTACH_RE = re.compile(r"https://app\.devin\.ai/attachments/[0-9a-f-]+/[^\s\"')\]]+")
# message_user 附件标记的两种形态：ATTACHMENT:"<url>" 和 ATTACHMENT:[{...json...}]
ATTACH_MARK_RE = re.compile(r'ATTACHMENT:(?:"\s*https?://[^\s"]*"\s*|\{[^}]*\}|\[[^\]]*\])')
# 会话回复里作者自写的概括行，如「[更新] 修复了图片裂图」——抓它推送，正文不推
UPDATE_LINE_RE = re.compile(r"^\s*\**\[更新\]\**\s*[:：]?\s*(.+?)\s*\**\s*$", re.M)
ACTION_KW = ("新增", "添加", "修复", "改为", "改成", "支持", "完成", "实现", "去掉", "移除", "优化", "调整", "已")


def summarize(text: str, limit: int = 120) -> str:
    """取作者写的 [更新] 行；没有则从要点行/动作句拼一条概括。"""
    m = UPDATE_LINE_RE.search(text)
    if m:
        return m.group(1)[:limit]
    lines = []
    for ln in text.splitlines():
        ln = re.sub(r"^[\s>*#\-–—·•\d.、]+", "", ln).strip()
        ln = re.sub(r"\*\*(.+?)\*\*", r"\1", ln)
        if ln and any(k in ln for k in ACTION_KW):
            lines.append(ln)
    if not lines:
        flat = re.sub(r"\s+", " ", re.sub(r"\*\*(.+?)\*\*", r"\1", text)).strip()
        return flat[:limit]
    out, cur = "", ""
    for ln in lines:
        cand = (cur + "；" + ln) if cur else ln
        if len(cand) > limit:
            break
        cur = cand
    return cur[:limit]


# ---------------- ACP 实时通道（rename 等 REST 没有的操作） ----------------
class ACP:
    """极简 ACP JSON-RPC 客户端：每次调用短连接一次，用完即关"""
    def __init__(self, pat: str, org_id: str):
        self.url = (f"wss://app.devin.ai/api/acp/live"
                    f"?token={urllib.parse.quote(pat)}&org_id={urllib.parse.quote(org_id)}")

    async def call(self, method: str, params: dict, timeout: int = 20, retries: int = 2):
        if websockets is None:
            raise RuntimeError("需要 websockets 库")
        last = None
        for attempt in range(retries + 1):
            try:
                return await self._call_once(method, params, timeout)
            except Exception as e:
                last = e
                if attempt < retries:
                    await asyncio.sleep(2)
        raise last

    async def _call_once(self, method: str, params: dict, timeout: int):
        async with websockets.connect(self.url, max_size=8 * 1024 * 1024,
                                      open_timeout=30) as ws:
            rpc_id = 0

            async def rpc(m, p):
                nonlocal rpc_id
                rpc_id += 1
                await ws.send(json.dumps({"jsonrpc": "2.0", "id": rpc_id,
                                          "method": m, "params": p}))
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
                    if msg.get("id") == rpc_id:
                        if "error" in msg:
                            raise RuntimeError(f"ACP {m}: {msg['error']}")
                        return msg.get("result")

            await rpc("initialize", {"protocolVersion": 1,
                                     "clientCapabilities": {"fs": {"readTextFile": False,
                                                                   "writeTextFile": False}},
                                     "clientInfo": {"name": "wecom-bridge", "version": "1.0"}})
            return await rpc(method, params)


# ---------------- 状态（chatid -> 绑定） ----------------
def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(st: dict):
    STATE_FILE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


def chat_of(frame: dict) -> str:
    body = frame.get("body") or {}
    return body.get("chatid") or body.get("chat_id") or (body.get("from") or {}).get("userid") or "unknown"


def session_url(sid: str) -> str:
    sid = sid if sid.startswith("devin-") else "devin-" + sid
    return f"https://app.devin.ai/sessions/{sid.replace('devin-', '', 1)}"


# ---------------- 主逻辑 ----------------
def _single_instance_lock():
    import fcntl
    fd = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bridge.lock"), "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit("已有 bridge 实例在运行，退出。")
    return fd


def main():
    _lock_fd = _single_instance_lock()  # noqa: F841 保活到进程结束
    bot_id = os.environ.get("WECOM_BOT_ID", "").strip()
    secret = os.environ.get("WECOM_BOT_SECRET", "").strip()
    api_key = os.environ.get("DEVIN_API_KEY", "").strip()
    if not (bot_id and secret and api_key):
        sys.exit("需要环境变量 WECOM_BOT_ID / WECOM_BOT_SECRET / DEVIN_API_KEY")

    devin = Devin(api_key, os.environ.get("DEVIN_ORG_ID", "").strip())
    acp = ACP(api_key, os.environ.get("DEVIN_ORG_ID", "").strip() or devin.org())
    ws = WSClient(WSClientOptions(bot_id=bot_id, secret=secret))
    try:
        ws._ws_manager._reply_ack_timeout = 30.0  # 图片等大 body 的 ack 放宽
    except Exception:
        pass
    state = load_state()

    async def md(chatid: str, text: str):
        """主动推送 markdown 消息到会话"""
        await ws.send_message(chatid, {"msgtype": "markdown",
                                       "markdown": {"content": text[:MAX_PUSH_CHARS]}})

    async def upload_media(data: bytes, mtype: str, filename: str) -> str:
        """三步分片上传临时素材（init → chunk×N → finish），返回 media_id（3 天有效）"""
        mgr = ws._ws_manager
        CHUNK = 512 * 1024
        total = math.ceil(len(data) / CHUNK) or 1
        if total > 100:
            raise ValueError("附件超过 50MB 上限")

        async def rpc(cmd: str, body: dict):
            req_id = generate_req_id(cmd)
            resp = await mgr.send_reply(req_id, body, cmd)
            return (resp or {}).get("body") or {}

        init = await rpc("aibot_upload_media_init",
                         {"type": mtype, "filename": filename, "total_size": len(data),
                          "total_chunks": total, "md5": hashlib.md5(data).hexdigest()})
        uid = init.get("upload_id")
        if not uid:
            raise RuntimeError(f"upload init 无 upload_id: {init}")
        for i in range(total):
            chunk = base64.b64encode(data[i * CHUNK:(i + 1) * CHUNK]).decode()
            await rpc("aibot_upload_media_chunk",
                      {"upload_id": uid, "chunk_index": i, "base64_data": chunk})
        fin = await rpc("aibot_upload_media_finish", {"upload_id": uid})
        mid = fin.get("media_id")
        if not mid:
            raise RuntimeError(f"upload finish 无 media_id: {fin}")
        return mid

    async def push_media(chatid: str, text: str):
        """消息文本里的附件图片/视频 → 下载 → 上传为 WeCom 素材 → 媒体消息直发"""
        loop = asyncio.get_running_loop()
        for url in ATTACH_RE.findall(text):
            path = urllib.parse.urlsplit(url).path.lower()
            mtype = "image" if path.endswith(IMG_EXTS) else (
                "video" if path.endswith(VID_EXTS) else "file")
            try:
                data = await loop.run_in_executor(None, devin.download_attachment, url)
                fname = urllib.parse.unquote(path.rsplit("/", 1)[-1]) or f"file.{mtype}"
                mid = await upload_media(data, mtype, fname)
                body = {"msgtype": mtype, mtype: {"media_id": mid}}
                if mtype in ("video", "file"):
                    body[mtype]["title"] = fname
                await ws.send_message(chatid, body)
            except Exception as e:
                print(f"[push media] {url[:60]} {e}", flush=True)

    def make_card(title: str, desc: str, url: str) -> dict:
        """模板卡片（text_notice），整卡可点"""
        return {
            "card_type": "text_notice",
            "source": {"desc": "Devin 桥接"},
            "main_title": {"title": title, "desc": desc},
            "card_action": {"type": 1, "url": url},
        }

    async def card(chatid: str, title: str, desc: str, url: str):
        """主动推送模板卡片"""
        await ws.send_message(chatid, {"msgtype": "template_card",
                                       "template_card": make_card(title, desc, url)})

    async def poll_session(chatid: str):
        """轮询绑定会话，把新的 devin_message 和状态变化推回企业微信"""
        b = state.get(chatid) or {}
        sid = b.get("session_id")
        if not sid:
            return
        try:
            loop = asyncio.get_running_loop()
            cursor = b.get("msg_cursor") or ""
            new_msgs, pages = [], 0
            while pages < 20:  # 每次最多翻 20 页
                d = await loop.run_in_executor(None, devin.messages, sid, 50, cursor)
                items = d.get("items") or []
                new_msgs += [m for m in items
                             if m.get("source") == "devin" and m.get("message")]
                if d.get("end_cursor"):
                    cursor = d["end_cursor"]
                if not d.get("has_next_page"):
                    break
                pages += 1
            sd = await loop.run_in_executor(None, devin.session, sid)
        except Exception as e:
            print(f"[poll] {chatid} {sid} error: {e}", flush=True)
            return
        b["msg_cursor"] = cursor
        seen = set(b.get("seen_ids") or [])
        pending = b.get("pending") or []
        if b.get("msg_cursor_init") is None:
            b["msg_cursor_init"] = True  # 首次只定位游标，不补推历史
            seen.update(m.get("event_id") for m in new_msgs if m.get("event_id"))
        else:
            for m in new_msgs:
                eid = m.get("event_id")
                if not eid or eid in seen:
                    continue
                pending.append(m["message"].strip())
                seen.add(eid)
        b["seen_ids"] = list(seen)[-300:]
        d = sd
        # iapi 详情：blocked/user_action_required → 推"等你操作"卡片；附 current_activity
        iapi = {}
        try:
            iapi = await loop.run_in_executor(None, devin.session_iapi, sid)
        except Exception as e:
            print(f"[poll iapi] {e}", flush=True)
        # 只推最终结果：等会话停下（非 working/resuming）才冲掉缓冲，且只发最后一条
        enum = ((iapi.get("latest_status_contents") or {}).get("enum")
                or (iapi.get("status") or "")).lower()
        working = enum in {"working", "resuming", "resume_requested",
                           "resume_requested_frontend", "running"}
        if pending and (not working or len(pending) > 5):
            try:
                # 附件链接/标记从正文剥掉（媒体单独以原生消息推送），再清掉残留的引用尾注
                clean = ATTACH_MARK_RE.sub("", ATTACH_RE.sub("", pending[-1]))
                clean = re.sub(r"[：:]\s*[—–\-]{1,2}\s*[^：:\n]*$", "：", clean.strip(), flags=re.M)
                # 只推一条概括（[更新] 前缀），不全文转发；媒体仍单独以原生消息推送
                brief = summarize(clean).replace("**", "").strip()
                if brief:
                    await md(chatid, "**[更新]** " + brief)
                await push_media(chatid, pending[-1])
            except Exception as e:
                print(f"[push] {e}", flush=True)
            pending = []
        b["pending"] = pending
        if iapi:
            lsc = iapi.get("latest_status_contents") or {}
            lse = iapi.get("latest_status_event_id") or ""
            uar = lsc.get("user_action_required")
            if uar and lse != b.get("blocked_event"):
                b["blocked_event"] = lse
                try:
                    await card(chatid, "⏸ 等你操作",
                               (uar.get("text") if isinstance(uar, dict) else str(uar))[:80] or
                               (lsc.get("message") or "")[:80],
                               session_url(sid))
                except Exception as e:
                    print(f"[push] {e}", flush=True)
            act = iapi.get("current_activity") or ""
            if act != b.get("activity"):
                b["activity"] = act  # 只记录不推送，用于状态卡片描述
        status = d.get("status_enum") or d.get("status") or ""
        if status and status != b.get("status"):
            b["status"] = status
            try:
                await card(chatid, f"会话状态 → {status}", d.get("title") or "", session_url(sid))
            except Exception as e:
                print(f"[push] {e}", flush=True)
        state[chatid] = b
        save_state(state)

    async def poll_loop():
        while True:
            await asyncio.sleep(POLL_INTERVAL)
            for cid in list(state.keys()):
                if state[cid].get("session_id"):
                    try:
                        await poll_session(cid)
                    except Exception as e:
                        print(f"[poll_loop] {cid}: {e}", flush=True)

    # ---- keep-alive：每分钟给绑定会话发 heartbeat，保持不休眠 ----
    ka_tasks: dict = {}

    async def _ka_loop(chatid: str):
        while state.get(chatid, {}).get("keep_alive"):
            sid = state.get(chatid, {}).get("session_id")
            if not sid:
                break
            try:
                await acp.call("_cognition.ai/session/heartbeat",
                               {"sessionId": sid if sid.startswith("devin-") else "devin-" + sid},
                               timeout=15, retries=0)
            except Exception as e:
                print(f"[keepalive] {chatid} {sid}: {e}", flush=True)
            await asyncio.sleep(60)

    def set_keepalive(chatid: str, on: bool):
        b = state.get(chatid) or {}
        b["keep_alive"] = bool(on)
        state[chatid] = b
        save_state(state)
        if on and b.get("session_id"):
            t = ka_tasks.get(chatid)
            if not t or t.done():
                ka_tasks[chatid] = asyncio.ensure_future(_ka_loop(chatid))
        elif not on:
            t = ka_tasks.pop(chatid, None)
            if t:
                t.cancel()

    def parse_new_args(text: str):
        """解析 /new 的 -m/-p 标志，返回 (mode, platform, prompt)"""
        mode = platform = ""
        parts = text.split()
        rest = []
        i = 0
        while i < len(parts):
            if parts[i] in ("-m", "--mode") and i + 1 < len(parts):
                mode = parts[i + 1]; i += 2
            elif parts[i] in ("-p", "--platform") and i + 1 < len(parts):
                platform = parts[i + 1]; i += 2
            else:
                rest.append(parts[i]); i += 1
        return mode, platform, " ".join(rest)

    def do_new(chatid: str, prompt: str, mode: str = "", platform: str = "") -> str:
        if not prompt:
            return "用法：/new [-m 模式] [-p 平台] <任务描述>"
        d = devin.create_session(prompt, mode, platform)
        sid = d.get("session_id") or d.get("devin_id") or ""
        if sid:
            state[chatid] = {"session_id": sid, "seen_msgs": 0,
                             "created_at": time.time()}
            save_state(state)
            opt = f"（模式 `{mode}`）" if mode else ""
            opt += f"（平台 `{platform}`）" if platform else ""
            return f"**已创建并绑定会话** {opt}\n\n{session_url(sid)}\n\n后续直接发消息即可 steer。"
        return f"创建会话返回异常：{json.dumps(d, ensure_ascii=False)[:300]}"

    def do_text(chatid: str, text: str) -> str:
        b = state.get(chatid) or {}
        sid = b.get("session_id")
        if not sid:
            return do_new(chatid, text)  # 未绑定：直接当新任务
        devin.send_message(sid, text)
        title = ""
        try:
            title = (devin.session(sid).get("title") or "").strip()
        except Exception:
            pass
        return f"**已发送给会话**：[{title or sid[:12]}]({session_url(sid)})"

    async def handle(chatid: str, text: str) -> str:
        t = text.strip()
        # 群聊里 @机器人 时 content 自带 "@bot名 " 前缀，剥掉再匹配命令
        while t.startswith("@"):
            t = t.split(None, 1)[1].strip() if " " in t else ""
        try:
            if t.startswith("/new"):
                mode, platform, prompt = parse_new_args(t[4:].strip())
                result = await asyncio.get_running_loop().run_in_executor(
                    None, do_new, chatid, prompt, mode, platform)
                sid = (state.get(chatid) or {}).get("session_id")
                if sid:
                    opt = f"{mode or '默认'} / {platform or '默认'}"
                    return result, make_card("已创建并绑定会话",
                                             (prompt or "")[:80] or opt, session_url(sid))
                return result, None
            if t.startswith("/bind "):
                kw = t[6:].strip()
                items = await asyncio.get_running_loop().run_in_executor(None, devin.list_sessions)
                kw_raw = kw.replace("devin-", "")
                # /list 给的字母快捷方式
                letters = (state.get(chatid) or {}).get("letters") or {}
                if len(kw_raw) == 1 and kw_raw.lower() in letters:
                    sid = letters[kw_raw.lower()]
                    state[chatid] = {"session_id": sid, "seen_msgs": 0}
                    save_state(state)
                    title = next((s.get("title") for s in items
                                  if (s.get("session_id") or "").endswith(sid)), "")
                    return f"**已绑定会话**\n\n{session_url(sid)}", make_card("已绑定会话", title or sid[:12], session_url(sid))
                if kw_raw.isalnum() and len(kw_raw) >= 20:
                    sid = kw_raw
                    state[chatid] = {"session_id": sid, "seen_msgs": 0}
                    save_state(state)
                    title = next((s.get("title") for s in items
                                  if (s.get("session_id") or "").endswith(sid)), "")
                    return f"**已绑定会话**\n\n{session_url(sid)}", make_card("已绑定会话", title or sid[:12], session_url(sid))
                # 先按 id 前缀匹配，再按标题关键词匹配
                kw_l = kw_raw.lower()
                cand = [s for s in items if (s.get("session_id") or "").replace("devin-", "").lower().startswith(kw_l)]
                if not cand:
                    cand = [s for s in items if kw.lower() in (s.get("title") or "").lower()]
                if not cand:
                    return f"没找到标题含「{kw}」的会话。/list 看最近会话。", None
                s = cand[0]
                sid = (s.get("session_id") or "").replace("devin-", "")
                state[chatid] = {"session_id": sid, "seen_msgs": 0}
                save_state(state)
                extra = f"（另有 {len(cand)-1} 个匹配，/list 查看）" if len(cand) > 1 else ""
                return (f"**已绑定会话**：{s.get('title','')}\n{extra}\n\n{session_url(sid)}",
                        make_card("已绑定会话", s.get("title") or sid[:12], session_url(sid)))
            if t == "/list":
                items = await asyncio.get_running_loop().run_in_executor(None, devin.list_sessions)
                if not items:
                    return "没有会话。", None
                lines = []
                letters = {}
                for i, s in enumerate(items[:10]):
                    sid = (s.get("session_id") or "").replace("devin-", "")
                    letter = chr(ord('a') + i)
                    letters[letter] = sid
                    lines.append(f"- `{letter}` `{sid[:8]}` {s.get('title','(无标题)')} `{(s.get('status_enum') or s.get('status') or '')}`")
                b = state.get(chatid) or {}
                b["letters"] = letters
                state[chatid] = b
                save_state(state)
                return "**最近会话**（`/bind 字母` 即可绑定）\n\n" + "\n".join(lines), None
            if t == "/unbind":
                set_keepalive(chatid, False)
                state.pop(chatid, None)
                save_state(state)
                return "已解绑。", None
            if t == "/keepalive" or t.startswith("/keepalive "):
                b = state.get(chatid) or {}
                if not b.get("session_id"):
                    return "当前未绑定会话。", None
                arg = t[11:].strip().lower()
                on = (not b.get("keep_alive")) if not arg else arg in ("on", "开", "1", "true")
                set_keepalive(chatid, on)
                return (f"**保活已{'开启' if on else '关闭'}**：绑定会话{'将保持不休眠' if on else '恢复自动休眠'}。", None)
            if t.startswith("/rename "):
                sid = (state.get(chatid) or {}).get("session_id")
                if not sid:
                    return "当前未绑定会话。", None
                new_title = t[8:].strip()
                if not new_title:
                    return "用法：/rename <新标题>", None
                await acp.call("_cognition.ai/session/rename",
                               {"sessionId": sid if sid.startswith("devin-") else "devin-"+sid,
                                "title": new_title})
                return f"**已重命名**：{new_title}", None
            if t == "/stop":
                sid = (state.get(chatid) or {}).get("session_id")
                if not sid:
                    return "当前未绑定会话。", None
                await acp.call("session/cancel",
                               {"sessionId": sid if sid.startswith("devin-") else "devin-"+sid})
                return "**已发送停止指令**（只打断当前轮次，会话仍可继续发消息）", None
            if t == "/archive":
                sid = (state.get(chatid) or {}).get("session_id")
                if not sid:
                    return "当前未绑定会话。", None
                await acp.call("_cognition.ai/sessions/bulkArchive",
                               {"sessionIds": [sid if sid.startswith("devin-") else "devin-"+sid],
                                "archive": True})
                if chatid in state:
                    set_keepalive(chatid, False)
                    state[chatid] = {}
                    save_state(state)
                return "**已归档并解绑**", None
            if t == "/status":
                sid = (state.get(chatid) or {}).get("session_id")
                if not sid:
                    return "当前未绑定会话。/new <任务> 新建，/bind <id> 绑定。", None
                d = await asyncio.get_running_loop().run_in_executor(None, devin.session, sid)
                return (f"**状态**：`{d.get('status_enum') or d.get('status')}`\n\n"
                        f"**标题**：{d.get('title', '')}\n\n{session_url(sid)}"), None
            if t == "/help":
                return HELP, None
            if t.startswith("/skill "):
                rest = t[7:].strip()
                name, _, task = rest.partition(" ")
                if not name:
                    return "用法：/skill <skill名> <任务>，如 /skill goutoujunshi 帮我分析这段关系", None
                prompt = f"使用 ${name} skill 处理以下任务：\n\n{task.strip() or '请先按流程向我收集背景信息'}"
                return (await asyncio.get_running_loop().run_in_executor(None, do_text, chatid, prompt)), None
            if not t:
                return "（空消息）", None
            return (await asyncio.get_running_loop().run_in_executor(None, do_text, chatid, t)), None
        except urllib.error.HTTPError as e:
            return f"Devin API 错误 {e.code}: {e.read()[:200].decode('utf-8', 'ignore')}", None
        except Exception as e:
            return f"处理失败：{e}", None

    @ws.on('authenticated')
    def on_auth():
        print("[wecom] authenticated", flush=True)
        asyncio.ensure_future(poll_loop())
        # 重启后恢复各 chat 的保活任务
        # 丢弃遗留 pending 缓冲，避免重启后把旧消息再推一遍
        dirty = False
        for cid in list(state.keys()):
            if state[cid].get("pending"):
                state[cid]["pending"] = []
                dirty = True
        if dirty:
            save_state(state)
        for cid in list(state.keys()):
            if state[cid].get("keep_alive") and state[cid].get("session_id"):
                ka_tasks[cid] = asyncio.ensure_future(_ka_loop(cid))

    @ws.on('message.text')
    async def on_text(frame):
        body = frame.get("body") or {}
        text = (body.get("text") or {}).get("content", "")
        chatid = chat_of(frame)
        print(f"[msg] {chatid}: {text[:80]}", flush=True)
        # 引用图片的文本消息（如「看下这张图」+引用图）：非命令时连图一起 steer
        qimg = ((body.get("quote") or {}).get("image") or {})
        stripped = text.strip()
        while stripped.startswith("@"):
            stripped = stripped.split(None, 1)[1].strip() if " " in stripped else ""
        if qimg.get("url") and not stripped.startswith("/"):
            stream_id = generate_req_id("stream")
            await ws.reply_stream(frame, stream_id, "收到图片，转发中…", False)
            try:
                result = await steer_image(chatid, qimg, stripped)
            except Exception as e:
                result = f"图片转发失败：{e}"
            await ws.reply_stream(frame, stream_id, result, True)
            return
        stream_id = generate_req_id("stream")
        await ws.reply_stream(frame, stream_id, "处理中…", False)
        result, card_data = await handle(chatid, text)
        if card_data:
            await ws.reply_stream_with_card(frame, stream_id, result, True, template_card=card_data)
        else:
            await ws.reply_stream(frame, stream_id, result, True)

    async def steer_image(chatid: str, img: dict, caption: str = "") -> str:
        """下载图片 -> 传 Devin 附件 -> steer 绑定会话，返回回执文本"""
        sid = (state.get(chatid) or {}).get("session_id")
        if not sid:
            return "未绑定会话，先 /new 或 /bind。"
        data, fname = await ws.download_file(img.get("url"), img.get("aeskey"))
        ext, mime = sniff_image(data)
        if not fname or "." not in fname:
            fname = (fname or "wecom_image") + ext
        loop = asyncio.get_running_loop()
        att_url = await loop.run_in_executor(
            None, devin.upload_attachment, fname, data, mime)
        prompt = f'{caption or "用户从企业微信发来的图片。"}\n\nATTACHMENT:"{att_url}"'
        title = ""
        try:
            title = (await loop.run_in_executor(None, devin.session, sid)).get("title") or ""
        except Exception:
            pass
        await loop.run_in_executor(None, devin.send_message, sid, prompt)
        return f"**图片已发送给会话**：[{title or sid[:12]}]({session_url(sid)})"

    def sniff_image(data: bytes) -> tuple[str, str]:
        if data.startswith(b"\x89PNG"):
            return ".png", "image/png"
        if data.startswith(b"\xff\xd8"):
            return ".jpg", "image/jpeg"
        if data[:6] in (b"GIF87a", b"GIF89a"):
            return ".gif", "image/gif"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return ".webp", "image/webp"
        return ".jpg", "image/jpeg"

    @ws.on('message.image')
    async def on_image(frame):
        """企业微信图片 → 解密下载 → 上传为 Devin 附件 → steer 进绑定会话"""
        body = frame.get("body") or {}
        img = body.get("image") or {}
        chatid = chat_of(frame)
        print(f"[img] {chatid}: {img.get('url', '')[:60]}", flush=True)
        stream_id = generate_req_id("stream")
        await ws.reply_stream(frame, stream_id, "收到图片，转发中…", False)
        try:
            result = await steer_image(chatid, img)
        except Exception as e:
            print(f"[img] {chatid}: {e}", flush=True)
            result = f"图片转发失败：{e}"
        await ws.reply_stream(frame, stream_id, result, True)

    @ws.on('event.enter_chat')
    async def on_enter(frame):
        await ws.reply_welcome(frame, {
            "msgtype": "text",
            "text": {"content": "你好，我是 Devin 桥接助手 🤖\n\n" + HELP},
        })

    ws.run()


if __name__ == "__main__":
    main()
