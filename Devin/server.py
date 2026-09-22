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
    return cfg


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
            req.add_header("Content-Type", "application/json")

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
        if self.path.startswith("/api/health"):
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
            super().do_GET()

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

    def do_POST(self):
        if self.path.startswith("/iapi/"):
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
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
