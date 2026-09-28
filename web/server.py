#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Devin Mobile PWA - 极简本地代理 + 静态文件服务器
- 静态托管 ./static 下的 PWA 页面
- /api/* 代理到 Devin API，自动注入 Authorization: Bearer <key>
- 按 key 前缀自动选 API 版本:
    apk_*    -> v1  (/v1/*)
    cog_*    -> v3  (/v3/organizations/{org_id}/*)，org_id 自动经 /v3/self 获取
- 配置来源(优先级): 环境变量 > config.json
    DEVIN_API_KEY / "api_key"   必填
    DEVIN_ORG_ID  / "org_id"    可选(v3 可自动探测)
用法: python server.py [端口]   默认 8321，监听 0.0.0.0(手机可经局域网访问)
"""
import hashlib
import hmac
import json
import os
import sys
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

BASE = Path(__file__).resolve().parent
STATIC_DIR = BASE / "static"
UPSTREAM = "https://api.devin.ai"
_org_cache = None


def load_config() -> dict:
    cfg = {}
    cfg_path = BASE / "config.json"
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    if os.environ.get("DEVIN_API_KEY"):
        cfg["api_key"] = os.environ["DEVIN_API_KEY"].strip()
    if os.environ.get("DEVIN_ORG_ID"):
        cfg["org_id"] = os.environ["DEVIN_ORG_ID"].strip()
    if os.environ.get("DEVIN_ACCESS_TOKEN"):
        cfg["access_token"] = os.environ["DEVIN_ACCESS_TOKEN"].strip()
    return cfg


LOGIN_PAGE = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Devin Mobile - 登录</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f4f5f8;color:#17181c;font-family:system-ui,-apple-system,sans-serif}
form{background:#fff;padding:28px 24px;border-radius:14px;width:min(320px,86vw);
box-shadow:0 4px 24px rgba(0,0,0,.08)}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:9px;border:1px solid #d8dbe2;
background:#f6f7f9;color:#17181c;font-size:16px;margin-bottom:14px}
button{width:100%;padding:12px;border:0;border-radius:9px;background:#6d5ae0;color:#fff;
font-size:16px;font-weight:600}
.err{color:#d44540;font-size:13px;margin:-6px 0 12px}
</style></head><body><form method="post" action="/login">
<h3 style="margin:0 0 18px">Devin Mobile</h3>
__ERR__<input name="token" type="password" placeholder="访问口令" autocomplete="off" autofocus>
<button type="submit">进入</button></form></body></html>"""


def api_version(key: str) -> str:
    return "v3" if key.startswith("cog_") else "v1"


def upstream_get(path: str, key: str):
    req = urllib.request.Request(UPSTREAM + path)
    req.add_header("Authorization", f"Bearer {key}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def resolve_org(cfg: dict) -> str:
    global _org_cache
    if cfg.get("org_id"):
        return cfg["org_id"]
    if _org_cache:
        return _org_cache
    data = upstream_get("/v3/self", cfg["api_key"])
    _org_cache = data.get("org_id") or ""
    return _org_cache


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC_DIR), **kw)

    def _json(self, code: int, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("[devin-mobile] " + fmt % args + "\n")

    # ---- 访问口令门：config.json "access_token" 或 DEVIN_ACCESS_TOKEN ----
    def _access_token(self) -> str:
        return (load_config().get("access_token") or "").strip()

    def _authed(self) -> bool:
        tok = self._access_token()
        if not tok:
            return True
        cookie = self.headers.get("Cookie") or ""
        for part in cookie.split(";"):
            part = part.strip()
            if part.startswith("devin_auth="):
                return hmac.compare_digest(part[len("devin_auth="):], tok)
        return False

    def _gate(self) -> bool:
        """未认证时拦截请求并返回 True（调用方直接 return）。"""
        if self._authed():
            return False
        if self.path.startswith(("/api/", "/iapi/")):
            self._json(401, {"error": "auth_required"})
        else:
            self.send_response(302)
            self.send_header("Location", "/login")
            self.send_header("Content-Length", "0")
            self.end_headers()
        return True

    def _serve_login(self, bad=False):
        body = LOGIN_PAGE.replace(
            '__ERR__', '<div class="err">口令错误</div>' if bad else ''
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _try_token_login(self) -> bool:
        """?token=xxx 快捷登录：命中则种 cookie 并重定向去掉参数。"""
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(self.path).query)
        t = (q.get("token") or [""])[0]
        tok = self._access_token()
        if not t or not tok or not hmac.compare_digest(t, tok):
            return False
        dest = urlparse(self.path).path or "/"
        self.send_response(302)
        self.send_header("Location", dest)
        self.send_header("Set-Cookie",
                         "devin_auth=" + t + "; Path=/; HttpOnly; SameSite=Lax")
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    def _proxy(self, method: str):
        cfg = load_config()
        key = cfg.get("api_key", "")
        if not key:
            self._json(401, {"error": "no_api_key",
                             "detail": "未配置 DEVIN_API_KEY（环境变量或 config.json）"})
            return

        path = self.path[len("/api"):]  # 保留开头的 '/' 和 query string
        ver = api_version(key)

        if ver == "v3":
            try:
                org = resolve_org(cfg)
            except Exception as e:
                self._json(502, {"error": "org_resolve_failed", "detail": str(e)})
                return
            if not org:
                self._json(400, {"error": "no_org_id",
                                 "detail": "企业级 key 需在 config.json 配 org_id"})
                return
            # v3 发消息端点是 /messages(复数)，前端统一用 /message 由这里改写
            if path.rstrip("/").endswith("/message"):
                path = path.rstrip("/")[:-len("/message")] + "/messages"
            url = f"{UPSTREAM}/v3/organizations/{org}{path}"
        else:
            url = UPSTREAM + "/v1" + path

        body = None
        if method in ("POST", "PUT", "PATCH", "DELETE"):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else b"{}"

        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Authorization", f"Bearer {key}")
        if body is not None:
            # multipart（附件上传）要透传原始 Content-Type（含 boundary），否则上游解不出来
            req.add_header("Content-Type",
                           self.headers.get("Content-Type") or "application/json")

        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type",
                                 resp.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read() or b""
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self._json(502, {"error": "upstream_error", "detail": str(e)})

    def do_GET(self):
        if self.path.startswith("/login"):
            self._serve_login()
        elif self._try_token_login():
            pass
        elif self._gate():
            pass
        elif self.path.startswith("/api/health"):
            cfg = load_config()
            key = cfg.get("api_key", "")
            info = {"ok": True, "api_key_configured": bool(key),
                    "pat_configured": bool(cfg.get("pat"))}
            if key:
                info["api_version"] = api_version(key)
                if api_version(key) == "v3":
                    try:
                        info["org_id"] = resolve_org(cfg)
                    except Exception as e:
                        info["org_id"] = ""
                        info["org_error"] = str(e)
            self._json(200, info)
        elif self.path.startswith("/api/config"):
            # 下发前端实时模式所需配置（PAT 用于浏览器直连 wss://app.devin.ai/api/acp/live）
            # 注意：只在本机/可信局域网使用，PAT 会暴露给能访问此端口的人
            cfg = load_config()
            self._json(200, {"pat": cfg.get("pat") or None,
                             "org_id": cfg.get("org_id") or _org_cache})
        elif self.path.startswith("/iapi/"):
            self._proxy_internal("GET")
        elif self.path.startswith("/api/"):
            self._proxy("GET")
        else:
            self._static_resp = True   # 静态文件：下发 no-cache 防浏览器启发式缓存旧版 JS/CSS
            super().do_GET()

    def end_headers(self):
        if getattr(self, "_static_resp", False):
            self.send_header("Cache-Control", "no-cache")
            self._static_resp = False
        super().end_headers()

    def _proxy_internal(self, method: str):
        """/iapi/* -> https://app.devin.ai/api/*（内部 webapp 接口，Bearer PAT 认证）
        用途：GET /iapi/events/{devin-sid}?limit=N&order=desc 拉历史事件等。"""
        cfg = load_config()
        pat = cfg.get("pat", "")
        if not pat:
            self._json(401, {"error": "no_pat",
                             "detail": "config.json 未配置 pat（Devin 网页版 Settings→PATs 创建）"})
            return
        path = self.path[len("/iapi"):]
        url = "https://app.devin.ai/api" + path
        body = None
        if method in ("POST", "PUT", "PATCH", "DELETE"):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else b"{}"
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Authorization", f"Bearer {pat}")
        req.add_header("Accept", "application/json")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type",
                                 resp.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read() or b""
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self._json(502, {"error": "upstream_error", "detail": str(e)})

    def do_DELETE(self):
        if self._gate():
            pass
        elif self.path.startswith("/api/"):
            self._proxy("DELETE")
        else:
            self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path.startswith("/login"):
            n = int(self.headers.get("Content-Length") or 0)
            form = self.rfile.read(n).decode("utf-8", "replace")
            from urllib.parse import parse_qs
            t = (parse_qs(form).get("token") or [""])[0]
            tok = self._access_token()
            if tok and hmac.compare_digest(t, tok):
                self.send_response(302)
                self.send_header("Location", "/")
                self.send_header("Set-Cookie",
                                 "devin_auth=" + t + "; Path=/; HttpOnly; SameSite=Lax")
                self.send_header("Content-Length", "0")
                self.end_headers()
            elif not tok:
                self.send_response(302)
                self.send_header("Location", "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self._serve_login(bad=True)
        elif self._gate():
            pass
        elif self.path.startswith("/iapi/"):
            self._proxy_internal("POST")
        elif self.path.startswith("/api/"):
            self._proxy("POST")
        else:
            self._json(404, {"error": "not_found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8321
    cfg = load_config()
    key = cfg.get("api_key", "")
    ver = api_version(key) if key else "-"
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Devin Mobile 服务已启动: http://0.0.0.0:{port}  API={ver}")
    if not key:
        print("API key 未配置：设置 DEVIN_API_KEY 或写 config.json")
    if cfg.get("access_token"):
        print("访问口令已启用（公网暴露时必须开启）")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
