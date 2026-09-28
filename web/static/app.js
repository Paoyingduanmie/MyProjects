/* Devin Mobile - PWA 客户端
   两种数据源：
   - REST 轮询（/api 代理 -> api.devin.ai，v1/v3 自动适配）——基础功能
   - ACP WebSocket 实时模式（浏览器直连 wss://app.devin.ai/api/acp/live，PAT 认证）——
     富会话列表(含模型)、session/resume 实时事件流、session/prompt 发送
*/
(() => {
  const app = document.getElementById('app');
  const DEMO = new URLSearchParams(location.search).has('demo');

  // 主题：light / dark / auto（跟随系统）
  const applyTheme = (t) => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('theme', t);
    const dark = t === 'dark' ||
      (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = dark ? '#0f0f10' : '#ffffff';
  };
  applyTheme(localStorage.getItem('theme') || 'light');
  let pollTimer = null;
  let noKey = false;
  let MODE = 'v1';
  let PAT = null, ORG = null;   // 实时模式凭据

  /* ================= REST API（经本机代理） ================= */
  async function api(path, opts) {
    if (DEMO) return demoApi(path, opts);
    const r = await fetch('/api' + path, {
      method: opts?.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && data.error === 'auth_required') { location.href = '/login'; throw new Error('auth_required'); }
    if (r.status === 401 && data.error === 'no_api_key') { noKey = true; throw new Error('no_api_key'); }
    if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail
      : (data.detail ? JSON.stringify(data.detail) : (data.title || data.error || ('HTTP ' + r.status))));
    return data;
  }
  const apiGet = (p) => api(p);
  const apiPost = (p, body) => api(p, { method: 'POST', body });

  /* ================= ACP WebSocket 层 ================= */
  const CAPS = {
    fs: { readTextFile: false, writeTextFile: false }, terminal: false,
    _meta: {
      'cognition.ai/messageGrouping': true, 'cognition.ai/toolCallQuestions': true,
      'cognition.ai/sidechains': true, 'cognition.ai/replayBatch': true,
      'cognition.ai/wholeUserMessages': true,
    },
  };

  const acp = {
    ws: null, rpcId: 0, pending: new Map(), ready: null,
    updateHandlers: new Set(), requestHandlers: new Set(), closeHandlers: new Set(),

    connect() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this);
      if (this.ready) return this.ready;
      this.ready = new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `wss://app.devin.ai/api/acp/live?token=${encodeURIComponent(PAT)}&org_id=${encodeURIComponent(ORG)}`);
        this.ws = ws;
        ws.onopen = () => {
          this.rpc('initialize', {
            protocolVersion: 2, clientCapabilities: CAPS, capabilities: CAPS,
            clientInfo: { name: 'devin-webapp', version: '0' },
            info: { name: 'devin-webapp', version: '0' },
          }).then(() => resolve(this)).catch(reject);
        };
        ws.onmessage = (ev) => this._onMessage(ev);
        ws.onclose = () => {
          this.ws = null; this.ready = null;
          this._rejectAll(new Error('ws closed'));
          this.closeHandlers.forEach(h => h());
        };
        ws.onerror = () => {};
        setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) { reject(new Error('ws connect timeout')); } }, 15000);
      });
      return this.ready;
    },

    _rejectAll(e) { for (const p of this.pending.values()) p.rej(e); this.pending.clear(); },

    _onMessage(ev) {
      let o;
      try { o = JSON.parse(ev.data); } catch { return; }
      // JSON-RPC 回执
      if (o.id !== undefined && (o.result !== undefined || o.error !== undefined)) {
        const p = this.pending.get(o.id);
        if (p) { this.pending.delete(o.id); o.error ? p.rej(new Error(o.error.message || JSON.stringify(o.error))) : p.res(o.result); }
        return;
      }
      // 服务端通知
      if (o.method === 'session/update') {
        this.updateHandlers.forEach(h => h(o.params));
      } else if (o.method === 'ext/notification') {
        const inner = o.params || {};
        if (inner.method === '_cognition.ai/session_update_batch' && Array.isArray(inner.params?.updates)) {
          inner.params.updates.forEach(u =>
            this.updateHandlers.forEach(h => h({ sessionId: inner.params.sessionId, update: u })));
        } else if (inner.method === '$/cancel_request') {
          this.pending.delete(inner.params?.requestId);
        }
      } else if (o.method && o.id !== undefined) {
        // 服务端请求（权限询问等）
        let answered = false;
        this.requestHandlers.forEach(h => { if (h(o)) answered = true; });
        if (!answered) {
          // 默认拒绝权限请求，避免挂起
          if (o.method === 'session/request_permission')
            this._send({ jsonrpc: '2.0', id: o.id, result: { outcome: { outcome: 'cancelled' } } });
          else
            this._send({ jsonrpc: '2.0', id: o.id, error: { code: -32601, message: 'method not supported by client' } });
        }
      }
    },

    _send(o) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); },
    respond(id, result) { this._send({ jsonrpc: '2.0', id, result }); },

    rpc(method, params) {
      return new Promise((res, rej) => {
        const id = ++this.rpcId;
        this.pending.set(id, { res, rej });
        this._send({ jsonrpc: '2.0', id, method, params });
        setTimeout(() => { if (this.pending.delete(id)) rej(new Error('rpc timeout')); }, 30000);
      });
    },

    async listSessions() {
      await this.connect();
      const r = await this.rpc('session/list', {});
      return r.sessions || [];
    },

    async resume(sessionId) {
      await this.connect();
      return this.rpc('session/resume', {
        sessionId, cwd: '/', protocolVersion: 2,
        plainReconnect: false, useTailReplay: true,
      });
    },

    async prompt(sessionId, text) {
      await this.connect();
      return this.rpc('session/prompt', {
        sessionId, prompt: [{ type: 'text', text }],
      });
    },

    async setConfig(sessionId, configId, value) {
      await this.connect();
      return this.rpc('session/set_config_option', { sessionId, configId, value });
    },

    async rename(sessionId, title) {
      await this.connect();
      return this.rpc('_cognition.ai/session/rename', { sessionId, title });
    },

    async markRead(sessionId) {
      await this.connect();
      return this.rpc('_cognition.ai/session/markRead', { sessionId });
    },

    // 依次尝试多个候选方法名
    async tryRpc(methods, params) {
      let lastErr = null;
      for (const m of methods) {
        try { return await this.rpc(m, params); }
        catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('all methods failed');
    },

    onUpdate(h) { this.updateHandlers.add(h); return () => this.updateHandlers.delete(h); },
    onRequest(h) { this.requestHandlers.add(h); return () => this.requestHandlers.delete(h); },
    onClose(h) { this.closeHandlers.add(h); return () => this.closeHandlers.delete(h); },
  };

  const acpEnabled = () => !DEMO && !!PAT && !!ORG;

  /* ================= 数据归一化 ================= */
  const epochIso = (t) => new Date(typeof t === 'number' ? t * 1000 : t).toISOString();
  const stripDevin = (id) => (id || '').replace(/^devin-/, '');
  const addDevin = (id) => id?.startsWith('devin-') ? id : 'devin-' + id;

  function v3StatusEnum(s) {
    if (s.status === 'running') {
      if (s.status_detail === 'finished') return 'finished';
      if (s.status_detail === 'waiting_for_user' || s.status_detail === 'waiting_for_approval') return 'blocked';
      return 'working';
    }
    if (s.status === 'exit') return 'finished';
    if (s.status === 'error') return 'expired';
    if (s.status === 'suspended') return 'suspended';
    return 'working';
  }
  function normSession(s) {
    if (MODE === 'v3') return {
      session_id: s.session_id, title: s.title,
      status_enum: v3StatusEnum(s),
      updated_at: epochIso(s.updated_at), created_at: epochIso(s.created_at),
      pull_request: (s.pull_requests || [])[0] || null,
      url: s.url, devin_mode: s.devin_mode,
    };
    return s;
  }

  // ACP session/list 项 -> 统一格式（带模型等富信息）
  function normAcpSession(s) {
    const m = s._meta || {};
    const g = (k) => m['cognition.ai/' + k];
    return {
      session_id: stripDevin(s.sessionId),
      title: s.title,
      status_enum: g('statusEnum') || g('sessionStatus') || 'working',
      updated_at: s.updatedAt || g('sortUpdatedAt'),
      created_at: g('createdAt'),
      model: g('devinVersionOverride'),           // 如 devin-swe-2-low
      excerpt: g('messageExcerpts'),
      unread: g('isUnread'), starred: g('isStarred') || g('isPinned'), archived: g('isArchived'),
      tags: g('sessionTags') || s.tags || [],
      acu_limit: g('maxAcuLimit'),
      url: g('url'),
    };
  }

  const titleCache = {};   // session_id -> 标题（ACP 列表可见但 REST 可能 403）
  let tagFilter = null;    // 点 #tag 筛选会话列表
  let folderNames = [];    // _cognition.ai/folder/list → sidebarFoldersByOrg
  let folderMap = {};      // sid -> folder 名（iapi detail 懒拉，localStorage 缓存）
  try { folderMap = JSON.parse(localStorage.getItem('foldermap') || '{}'); } catch { }

  // 会话页抽屉：侧滑会话列表（按文件夹分组），点会话切换、点 📁 移文件夹
  async function openDrawer(curId) {
    const mask = document.createElement('div');
    mask.className = 'drawer-mask';
    mask.innerHTML = `<div class="drawer"><div class="drawer-title">会话</div>
      <div class="drawer-list"><div class="empty">加载中…</div></div></div>`;
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('open'));
    const dl = mask.querySelector('.drawer-list');
    const fill = async () => {
      try {
        if (acpEnabled() && !folderNames.length) {
          acp.rpc('_cognition.ai/folder/list', {}).then(r => {
            folderNames = [...new Set(Object.values(r?.sidebarFoldersByOrg || {}).flat())];
          }).catch(() => { });
        }
        const list = (await fetchSessions()).sort((a, b) =>
          (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || new Date(b.updated_at) - new Date(a.updated_at));
        const item = (s) => `
          <div class="ditem ${s.session_id === curId ? 'cur' : ''}" data-id="${esc(s.session_id)}">
            ${s.unread ? '<span class="unread-dot"></span>' : ''}
            <span class="dtitle">${esc(s.title || s.session_id)}</span>
            <span class="dago">${ago(s.updated_at)}</span>
            <button class="dfold" data-id="${esc(s.session_id)}" title="移到文件夹">📁</button>
          </div>`;
        const byFold = {};
        list.forEach(s => { const f = folderMap[s.session_id]; if (f) (byFold[f] ||= []).push(s); });
        const ungrouped = list.filter(s => !folderMap[s.session_id]);
        const foldOrder = [...folderNames.filter(f => byFold[f]),
          ...Object.keys(byFold).filter(f => !folderNames.includes(f)).sort()];
        dl.innerHTML =
          foldOrder.map(f => `<div class="foldhead">📁 ${esc(f)}</div>` + byFold[f].map(item).join('')).join('') +
          (ungrouped.map(item).join('') || (!foldOrder.length ? '<div class="empty">没有会话</div>' : ''));
        dl.querySelectorAll('.ditem').forEach(el => el.onclick = () => {
          mask.remove();
          if (el.dataset.id !== curId) location.hash = '#/s/' + el.dataset.id;
        });
        dl.querySelectorAll('.dfold').forEach(el => el.onclick = (e) => {
          e.stopPropagation();
          if (!acpEnabled()) { alert('文件夹需要实时模式（PAT）'); return; }
          showFolderSheet(el.dataset.id, folderMap[el.dataset.id] || '', fill);
        });
      } catch (e) {
        dl.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
    };
    await fill();
  }

  function showFolderSheet(sid, cur, paint) {
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `<div class="sheet"><div class="sheet-title">移动到文件夹</div>` +
      folderNames.map(f =>
        `<div class="theme-opt ${f === cur ? 'cur' : ''}" data-f="${esc(f)}">📁 ${esc(f)}${f === cur ? ' <span class="check">✓</span>' : ''}</div>`).join('') +
      `<div class="theme-opt" data-f="__new">＋ 新建文件夹…</div>` +
      (cur ? `<div class="theme-opt" data-f="">✕ 移出文件夹</div>` : '') + `</div>`;
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelectorAll('.theme-opt').forEach(el => el.onclick = async () => {
      let f = el.dataset.f;
      mask.remove();
      try {
        if (f === '__new') {
          f = prompt('新文件夹名');
          if (!f) return;
          await acp.rpc('_cognition.ai/folder/create', { orgId: ORG, folder: f });
          folderNames.push(f);
        }
        await acp.rpc('_cognition.ai/session/moveToFolder', { sessionId: addDevin(sid), folder: f || null });
        folderMap[sid] = f || '';
        localStorage.setItem('foldermap', JSON.stringify(folderMap));
        paint?.();
      } catch (e2) { alert('移动失败：' + e2.message); }
    });
    document.body.appendChild(mask);
  }

  async function fetchSessions() {
    if (acpEnabled()) {
      try {
        const list = (await acp.listSessions()).map(normAcpSession);
        list.forEach(s => { if (s.title) titleCache[s.session_id] = s.title; });
        return list;
      } catch (e) { /* fallthrough 到 REST */ }
    }
    const d = MODE === 'v3'
      ? await apiGet('/sessions?qs=' + encodeURIComponent(JSON.stringify({ first: 50 })))
      : await apiGet('/sessions?limit=50');
    const raw = MODE === 'v3' ? (d.items || []) : (d.sessions || []);
    const list = raw.map(normSession);
    list.forEach(s => { if (s.title) titleCache[s.session_id] = s.title; });
    return list;
  }

  async function fetchSessionRest(id) {
    const d = await apiGet('/sessions/' + encodeURIComponent(id));
    if (MODE === 'v3') {
      const msgs = await apiGet('/sessions/' + encodeURIComponent(id) + '/messages?first=200');
      const n = normSession(d);
      n.messages = (msgs.items || []).map(m => ({
        type: m.source === 'user' ? 'user_message' : 'devin_message',
        message: m.message, timestamp: epochIso(m.created_at), origin: m.origin,
      }));
      return n;
    }
    return d;
  }

  /* ================= 演示数据 ================= */
  function demoApi(path, opts) {
    const demoMsgs = [
      { type: 'user_message', event_id: 'e1', timestamp: '2026-09-22T01:20:00Z', message: 'Build brief: Cosmos CLI app - rewrite win.rs with correct module paths and signatures.' },
      { type: 'devin_message', event_id: 'e2', timestamp: '2026-09-22T01:20:05Z', message: "Now I'll rewrite `win.rs` with the correct module paths and signatures." },
      { type: 'tool_call', event_id: 'e3', timestamp: '2026-09-22T01:20:20Z', message: 'Edited 1 file' },
      { type: 'tool_call', event_id: 'e4', timestamp: '2026-09-22T01:20:35Z', message: 'Ran 1 command · edited 1 file' },
      { type: 'devin_message', event_id: 'e5', timestamp: '2026-09-22T01:21:00Z', message: "I'm finding some inconsistencies with constants and thei…" },
      { type: 'tool_call', event_id: 'e6', timestamp: '2026-09-22T01:21:10Z', message: 'Ran 2 commands · edited 2 files · called 1 tool' },
    ];
    if (path.startsWith('/sessions?') || path === '/sessions') return Promise.resolve({
      sessions: [
        { session_id: 'demo-1', title: 'Polish Mobile Sessions and E2E', status: 'working', status_enum: 'working', created_at: '2026-09-22T01:10:00Z', updated_at: '2026-09-22T01:22:00Z' },
        { session_id: 'demo-2', title: 'Fix auth token refresh race', status: 'finished', status_enum: 'finished', created_at: '2026-09-21T08:00:00Z', updated_at: '2026-09-21T09:30:00Z', pull_request: { url: 'https://github.com/example/repo/pull/42' } },
        { session_id: 'demo-3', title: 'Index DeepWiki for nancy_tmp repos', status: 'blocked', status_enum: 'blocked', created_at: '2026-09-20T06:00:00Z', updated_at: '2026-09-20T07:12:00Z' },
      ]
    });
    const m = path.match(/^\/sessions\/([\w-]+)$/);
    if (m && !opts) return Promise.resolve({
      session_id: m[1], title: 'Polish Mobile Sessions and E2E', status: 'working', status_enum: 'working',
      created_at: '2026-09-22T01:10:00Z', updated_at: '2026-09-22T01:22:00Z', messages: demoMsgs,
    });
    if (opts?.method === 'POST') return Promise.resolve({ session_id: 'demo-new', ok: true });
    return Promise.resolve({});
  }

  /* ================= 工具 ================= */
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  };
  const fmtTime = (iso) => {
    const d = new Date(iso);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const pill = (se) => {
    const map = {
      working: ['working', 'Working'], finished: ['finished', 'Done'],
      blocked: ['blocked', 'Blocked'], expired: ['expired', 'Error'],
      suspended: ['suspended', 'Suspended'], running: ['working', 'Running'],
    };
    const [cls, txt] = map[se] || ['suspended', se || 'Idle'];
    return `<span class="pill ${cls}"><span class="dot"></span>${txt}</span>`;
  };
  const active = (se) => ['working', 'running', 'resume_requested', 'resumed'].includes(se);
  const linkify = (s) => esc(s)
    .replace(/(https?:\/\/app\.devin\.ai\/attachments\/[^\s<]+)/g,
      m => `<a class="attach" href="${m}" target="_blank" rel="noopener">📎 ${m.split('/').pop().split('?')[0]}</a>`)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // 迷你 markdown：先整体 HTML 转义再变换，安全且零依赖
  const md = (s) => {
    const blocks = [];
    let t = esc(s);
    t = t.replace(/```[^\n`]*\n?([\s\S]*?)```/g, (m, code) => {
      blocks.push('<pre class="mdpre"><code>' + code.replace(/^\n+|\n+$/g, '') + '</code></pre>');
      return '\x00B' + (blocks.length - 1) + '\x00';
    });
    t = t.replace(/`([^`\n]+)`/g, '<code class="mdcode">$1</code>');
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/(https?:\/\/app\.devin\.ai\/attachments\/[^\s<]+)/g,
      m => `<a class="attach" href="${m}" target="_blank" rel="noopener">📎 ${m.split('/').pop().split('?')[0]}</a>`);
    t = t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/^#{1,4} +(.+)$/gm, '<strong class="mdh">$1</strong>');
    t = t.replace(/(^|\n)[ \t]*[-*•] +/g, '$1• ');
    t = t.replace(/\n/g, '<br>');
    return t.replace(/\x00B(\d+)\x00/g, (m, i) => blocks[+i]);
  };
  const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
  const isUserMsg = (m) => /user/i.test(m.type || '') || m.origin === 'user';
  const isDevinMsg = (m) => /devin|assistant|agent/i.test(m.type || '');

  /* ================= 路由 ================= */
  let currentUnsub = null;
  const wideMQ = matchMedia('(min-width:900px)');
  const ensureSplit = () => {
    if (!document.getElementById('split'))
      app.innerHTML = `<div class="split" id="split"><div class="side" id="side"></div><div class="main" id="main"></div></div>`;
  };
  function route() {
    stopPoll();
    if (currentUnsub) { currentUnsub(); currentUnsub = null; }
    const h = location.hash || '#/';
    if (wideMQ.matches) {
      // 宽屏：左侧栏常驻列表，右侧会话区；点会话不重建侧栏保住滚动位置
      ensureSplit();
      const side = document.getElementById('side'), main = document.getElementById('main');
      if (!side.querySelector('#list')) renderList(side);
      if (h.startsWith('#/s/')) renderChat(h.slice(4), main);
      else if (h === '#/new') renderNew(main);
      else main.innerHTML = '<div class="empty main-empty">← 从左侧选择会话</div>';
      side.querySelectorAll('.sesswrap').forEach(w =>
        w.classList.toggle('cur', h === '#/s/' + w.dataset.id));
      return;
    }
    if (h.startsWith('#/s/')) renderChat(h.slice(4));
    else if (h === '#/new') renderNew();
    else renderList();
  }
  window.addEventListener('hashchange', route);
  wideMQ.addEventListener('change', route);   // 窗口跨阈值缩放时重排
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) document.title = document.title.replace(/^● /, '');
  });

  /* ================= 会话列表 ================= */
  const sessHtml = (s) => `
    <div class="sesswrap" data-id="${esc(s.session_id)}" data-title="${esc(s.title || s.session_id)}" data-tags="${esc((s.tags || []).join(','))}">
      <div class="sess-acts">
        <button class="act-tag">标签</button><button class="act-rename">重命名</button><button class="act-arch">归档</button><button class="act-del">删除</button>
      </div>
      <div class="sess">
        <div class="body">
          <div class="title">${s.unread ? '<span class="unread-dot"></span>' : ''}${esc(s.title || s.session_id)}</div>
          ${s.excerpt ? `<div class="excerpt">${esc(s.excerpt).slice(0, 80)}</div>` : ''}
          <div class="meta">${pill(s.status_enum)}<span>${ago(s.updated_at)}</span>
            ${s.model ? `<span class="modeltag">${esc(s.model.replace(/^devin-/, ''))}</span>` : ''}
            ${(s.tags || []).map(t => `<span class="tagchip" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}
            ${s.pull_request?.url ? `<a class="prchip ${esc(s.pull_request.pr_state || '')}" href="${esc(s.pull_request.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">PR·${esc(s.pull_request.pr_state || '')}</a>` : ''}</div>
        </div>
        <button class="morebtn" title="更多">⋯</button>
      </div>
    </div>`;

  const ACT_W = 280;
  function bindSess(paint) {
    document.querySelectorAll('.sesswrap').forEach(w => {
      const row = w.querySelector('.sess');
      const id = w.dataset.id, title = w.dataset.title;
      w.classList.toggle('cur', location.hash === '#/s/' + id);   // 宽屏侧栏当前会话高亮
      let sx = 0, sy = 0, dx = 0, drag = false, open = false;
      const setX = x => row.style.transform = `translateX(${x}px)`;
      const close = () => { open = false; row.style.transition = 'transform .2s'; setX(0); };
      const closeOthers = () => document.querySelectorAll('.sesswrap .sess').forEach(r => {
        if (r !== row) { r.style.transition = 'transform .2s'; r.style.transform = ''; r._open = false; }
      });

      row.addEventListener('touchstart', e => {
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; drag = true;
        row.style.transition = 'none';
      }, { passive: true });
      row.addEventListener('touchmove', e => {
        if (!drag) return;
        const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
        if (Math.abs(my) > Math.abs(mx)) return;
        dx = Math.max(-ACT_W - 20, Math.min(0, (open ? -ACT_W : 0) + mx));
        setX(dx);
        if (Math.abs(mx) > 10) e.preventDefault();
      }, { passive: false });
      row.addEventListener('touchend', () => {
        if (!drag) return; drag = false;
        row.style.transition = 'transform .2s';
        // 相对位移阈值：关着时左滑 >60px 开，开着时右滑 >40px 合（轻点不滑保持开）
        const mx = dx - (open ? -ACT_W : 0);
        open = open ? mx < 40 : mx < -60;
        setX(open ? -ACT_W : 0);
        if (open) closeOthers();
      });

      row.onclick = (e) => {
        const tag = e.target.closest('.tagchip');
        if (tag) { tagFilter = tagFilter === tag.dataset.tag ? null : tag.dataset.tag; paint?.(); return; }
        if (open) { close(); return; }
        closeOthers();
        location.hash = '#/s/' + id;
      };
      // 桌面端：悬停出现的 ⋯ 按钮同样打开操作条
      w.querySelector('.morebtn').onclick = (e) => {
        e.stopPropagation();
        closeOthers();
        open = !open;
        row.style.transition = 'transform .2s';
        setX(open ? -ACT_W : 0);
      };

      w.querySelector('.act-tag').onclick = async (e) => {
        e.stopPropagation(); close();
        const cur = w.dataset.tags ? w.dataset.tags.split(',').filter(Boolean) : [];
        const t = prompt('标签（逗号分隔，留空清除全部）', cur.join(', '));
        if (t === null) return;
        if (!acpEnabled()) { alert('标签需要实时模式（PAT）'); return; }
        const tags = t.split(/[,，]/).map(x => x.trim()).filter(Boolean);
        try { await acp.rpc('_cognition.ai/session/setTags', { sessionId: addDevin(id), tags }); paint?.(); }
        catch (err) { alert('设置标签失败：' + err.message); }
      };
      w.querySelector('.act-rename').onclick = async (e) => {
        e.stopPropagation(); close();
        const t = prompt('会话标题', title);
        if (!t || t === title) return;
        if (!acpEnabled()) { alert('重命名需要实时模式（PAT）'); return; }
        try { await acp.rename(addDevin(id), t); paint?.(); }
        catch (err) { alert('重命名失败：' + err.message); }
      };
      w.querySelector('.act-arch').onclick = async (e) => {
        e.stopPropagation(); close();
        if (!confirm(`归档会话「${title}」？`)) return;
        if (!acpEnabled()) { alert('归档需要实时模式（PAT）'); return; }
        try { await acp.rpc('_cognition.ai/sessions/bulkArchive', { sessionIds: [addDevin(id)], archive: true }); paint?.(); }
        catch (err) { alert('归档失败：' + err.message); }
      };
      w.querySelector('.act-del').onclick = async (e) => {
        e.stopPropagation(); close();
        if (!confirm(`删除会话「${title}」？\n此操作不可恢复。`)) return;
        if (!confirm('再确认一次：真的要删除吗？')) return;
        try { await api('/sessions/' + id, { method: 'DELETE' }); paint?.(); }
        catch (err) { alert('删除失败：' + err.message); }
      };
    });
  }

  function showThemeSheet() {
    const cur = localStorage.getItem('theme') || 'light';
    const names = { light: '浅色', dark: '深色', warm: '暖黄', auto: '跟随系统' };
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `<div class="sheet"><div class="sheet-title">外观</div>` +
      Object.entries(names).map(([v, n]) =>
        `<div class="theme-opt ${v === cur ? 'cur' : ''}" data-v="${v}">${n}${v === cur ? ' <span class="check">✓</span>' : ''}</div>`
      ).join('') + `</div>`;
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelectorAll('.theme-opt').forEach(el => el.onclick = () => {
      applyTheme(el.dataset.v); mask.remove();
    });
    document.body.appendChild(mask);
  }

  function showSettingsSheet() {
    const cur = localStorage.getItem('theme') || 'light';
    const names = { light: '浅色', dark: '深色', warm: '暖黄', auto: '跟随系统' };
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `<div class="sheet"><div class="sheet-title">设置</div>
      <div class="theme-opt" id="opt-theme">外观<span class="opt-sub">${names[cur]}</span></div>
      <div class="theme-opt" id="opt-clear">清除本地缓存<span class="opt-sub">历史/草稿/离线缓存</span></div>
      </div>`;
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelector('#opt-theme').onclick = () => { mask.remove(); showThemeSheet(); };
    mask.querySelector('#opt-clear').onclick = async () => {
      if (!confirm('清除本地缓存？（历史快照、草稿、文件夹映射、离线缓存，不影响 Devin 云端数据）\n清除后页面自动刷新。')) return;
      Object.keys(localStorage).filter(k => /^(hist|draft):|^hist:index$|^foldermap$/.test(k))
        .forEach(k => localStorage.removeItem(k));
      mask.remove();
      try {
        if ('caches' in window) {
          const ks = await caches.keys();
          await Promise.all(ks.map(k => caches.delete(k)));
        }
        const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
        await Promise.all(regs.map(r => r.unregister()));
      } catch { }
      location.reload();
    };
    document.body.appendChild(mask);
  }

  async function renderList(host = app) {
    host.innerHTML = `
      <div class="topbar"><h1>Devin Sessions${acpEnabled() ? ' <span class="livetag">LIVE</span>' : ''}</h1>
        <button class="iconbtn" id="refresh" title="刷新">⟳</button></div>
      ${noKey ? `<div class="banner">未配置 API key，可加 ?demo=1 看演示界面</div>` : ''}
      <div class="list" id="list"><div class="empty">加载中…</div></div>
      <button class="fab settings" id="settings" title="设置">⚙</button>
      <button class="fab" id="fab" title="新会话">＋</button>`;
    document.getElementById('fab').onclick = () => location.hash = '#/new';
    document.getElementById('refresh').onclick = () => renderList(host);
    document.getElementById('settings').onclick = () => showSettingsSheet();


    const paint = async () => {
      let list = (await fetchSessions()).sort((a, b) =>
        (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || new Date(b.updated_at) - new Date(a.updated_at));
      if (tagFilter) list = list.filter(s => (s.tags || []).includes(tagFilter));
      const el = document.getElementById('list');
      if (!el) return;
      // 文件夹分组：folderMap 有的会话收进 📁 分区，其余保持原列表
      const byFold = {};
      list.forEach(s => { const f = folderMap[s.session_id]; if (f) (byFold[f] ||= []).push(s); });
      const ungrouped = list.filter(s => !folderMap[s.session_id]);
      const foldOrder = [...folderNames.filter(f => byFold[f]),
        ...Object.keys(byFold).filter(f => !folderNames.includes(f)).sort()];
      el.innerHTML =
        (tagFilter ? `<div class="filterbar" id="clearfilter">筛选 #${esc(tagFilter)} ✕</div>` : '') +
        foldOrder.map(f =>
          `<div class="foldhead">📁 ${esc(f)}</div>` + byFold[f].map(sessHtml).join('')).join('') +
        (ungrouped.length ? ungrouped.map(sessHtml).join('')
          : (!foldOrder.length ? '<div class="empty">没有可见会话。<br>＋ 新建一个，或注意：service user 只能看到自己创建的会话</div>' : ''));
      const fb = document.getElementById('clearfilter');
      if (fb) fb.onclick = () => { tagFilter = null; paint(); };
      bindSess(paint);
      return list;
    };
    // 后台懒拉每个会话的 folder 字段（iapi detail），凑齐后重绘分组
    const loadFolders = async (list) => {
      const ids = list.map(s => s.session_id).filter(i => !(i in folderMap));
      let changed = false;
      for (const sid of ids.slice(0, 40)) {
        try {
          const d = await fetch(`/iapi/sessions/${addDevin(sid)}`).then(r => r.ok ? r.json() : null);
          folderMap[sid] = d?.folder || '';
          changed = true;
        } catch { }
      }
      if (changed) {
        localStorage.setItem('foldermap', JSON.stringify(folderMap));
        paint?.();
      }
    };
    try {
      const list0 = await paint();
      if (acpEnabled()) {
        acp.rpc('_cognition.ai/folder/list', {}).then(r => {
          const m = r?.sidebarFoldersByOrg || {};
          folderNames = [...new Set(Object.values(m).flat())];
        }).catch(() => { });
        if (list0) loadFolders(list0);
      }
      if (!acpEnabled()) pollTimer = setInterval(() => paint().catch(() => { }), 15000);
      else pollTimer = setInterval(() => paint().catch(() => { }), 30000); // ACP 下列表低频刷新兜底
    } catch (e) {
      document.getElementById('list').innerHTML =
        `<div class="err">${esc(e.message === 'no_api_key' ? '未配置 API key：请设置 DEVIN_API_KEY 或 config.json' : e.message)}</div>`;
    }
  }

  /* ================= 聊天视图（实时模式） ================= */
  // 会话历史本地缓存：LRU 保留最近 5 个，进会话先秒显缓存再后台拉新
  const HIST_MAX = 5;
  function histCacheGet(id) {
    try { return JSON.parse(localStorage.getItem('hist:' + id)) || null; }
    catch { return null; }
  }
  function histCacheSet(id, store) {
    try {
      const idx = JSON.parse(localStorage.getItem('hist:index') || '[]').filter(x => x !== id);
      idx.unshift(id);
      while (idx.length > HIST_MAX) localStorage.removeItem('hist:' + idx.pop());
      localStorage.setItem('hist:index', JSON.stringify(idx));
      localStorage.setItem('hist:' + id, JSON.stringify({
        items: store.items.filter(it => it.kind !== 'perm' || it.done).slice(-150),
        statusText: store.statusText, mode: store.mode, t: Date.now(),
        title: titleCache[id],
      }));
    } catch { }
  }

  // 把 ACP session/update 聚合成可渲染条目
  function makeEventStore() {
    const items = [];           // [{key,kind,title,text,status}]
    const byKey = new Map();
    const push = (e) => { items.push(e); byKey.set(e.key, e); return e; };
    const unshift = (e) => { items.unshift(e); byKey.set(e.key, e); return e; };
    const find = (k) => byKey.get(k);
    return { items, push, unshift, find };
  }

  function extractText(u) {
    if (!u) return '';
    if (typeof u.message === 'string') return u.message;
    if (typeof u.text === 'string') return u.text;
    const c = u.content;
    if (typeof c === 'string') return c;
    if (c?.text) return c.text;
    if (Array.isArray(c)) return c.map(x => x.text || '').join('');
    if (u.delta?.text) return u.delta.text;
    return '';
  }

  function applyUpdate(store, params) {
    const u = params?.update || {};
    const kind = u.sessionUpdate || u.type || 'unknown';
    const meta = u._meta || {};
    // 排队消息快照（官方 session 状态里的 queuedMessages，形状未实测——多字段嗅探）
    const q = u.queuedMessages || u.queued_messages || params?.queuedMessages;
    if (Array.isArray(q)) store.queued = q;
    const eid = u.eventId || u.event_id || meta['cognition.ai/eventId'] || meta['cognition.ai/event_id'];
    const text = extractText(u);

    // secret 请求事件（request_secret）：未完成时渲染输入卡片
    const et = meta['cognition.ai/eventType'] || '';
    if (et === 'request_secret') {
      const rid = meta['cognition.ai/requestId'] || eid;
      const k = 'sec-' + rid;
      if (meta['cognition.ai/completedTimestamp']) {
        const cur = store.find(k); if (cur) cur.done = true;
      } else if (!store.find(k)) {
        store.push({ key: k, kind: 'secretreq',
          secretName: meta['cognition.ai/secretName'] || 'secret', requestId: rid,
          title: u.title || 'Devin 请求机密' });
      }
      return et;
    }
    if (et === 'send_secrets') {
      const cur = store.find('sec-' + (meta['cognition.ai/requestId'] || eid));
      if (cur) cur.done = true;
      return et;
    }
    // 云端审批卡：不走 session/request_permission，以事件形式出现在 update 流
    if (et === 'permission_request') {
      const rid = meta['cognition.ai/requestId'] || eid;
      const k = 'perm-' + rid;
      const cmd = meta['cognition.ai/command'] || '';
      const tool = meta['cognition.ai/toolName'] || '';
      if (rid && !store.find(k)) {
        store.push({ key: k, kind: 'perm', requestId: rid,
          title: (tool && cmd) ? tool + ' · ' + cmd : (cmd || u.title || 'Devin 请求权限'),
          options: [{ optionId: 'approve', name: '批准' }, { optionId: 'deny', name: '拒绝' }] });
      }
      return et;
    }
    if (et === 'permission_resolved') {
      const cur = store.find('perm-' + (meta['cognition.ai/requestId'] || eid));
      if (cur) cur.done = meta['cognition.ai/approved'] === true ? '已批准' : '已拒绝';
      return et;
    }
    // 计划审批事件：带 planId 的 update → 渲染 接受/编辑 卡片
    const planId = u.planId || meta['cognition.ai/planId'];
    if (planId && !store.find('planreq-' + planId)) {
      store.push({ key: 'planreq-' + planId, kind: 'planreq', planId,
        eventId: meta['cognition.ai/planEventId'] || u.planEventId || eid,
        text: text || 'Devin 提交了实施计划' });
      return 'planreq';
    }

    // 服务端推送的 config 变更（模型切换确认等）
    if (u.configId && u.currentValue !== undefined && store.configs?.[u.configId]) {
      store.configs[u.configId].currentValue = u.currentValue;
      return 'config_update';
    }
    // 与历史去重：非 chunk 的完整事件若已存在则跳过
    if (eid && !/_chunk$/.test(kind) && kind !== 'tool_call_update' && store.find(eid))
      return 'dup';

    switch (kind) {
      case 'user_message': case 'initial_user_message':
        store.push({ key: eid || 'u' + store.items.length, kind: 'user', text });
        break;
      case 'agent_message': case 'devin_message':
        store.push({ key: eid || 'a' + store.items.length, kind: 'devin', text });
        break;
      case 'user_message_chunk': case 'agent_message_chunk': case 'devin_message_chunk': {
        const k = eid || kind + '-cur';
        const cur = store.find(k);
        if (cur) cur.text += text;
        else store.push({ key: k, kind: kind.startsWith('user') ? 'user' : 'devin', text });
        break;
      }
      case 'agent_thought': case 'agent_thought_chunk': {
        const k = eid || 'thought-cur';
        const cur = store.find(k);
        if (cur) cur.text += text;
        else store.push({ key: k, kind: 'thought', text });
        break;
      }
      case 'tool_call': {
        const k = u.toolCallId || u.tool_call_id || eid || 'tc' + store.items.length;
        store.push({ key: k, kind: 'tool', title: u.title || u.kind || 'tool_call', text, status: u.status || 'running' });
        break;
      }
      case 'tool_call_update': {
        const k = u.toolCallId || u.tool_call_id;
        const cur = k && store.find(k);
        if (cur) {
          if (u.status) cur.status = u.status;
          const t2 = extractText(u);
          if (t2) cur.text = cur.text ? cur.text + '\n' + t2 : t2;
          if (u.title) cur.title = u.title;
        }
        break;
      }
      case 'plan': {
        const entries = (u.entries || []).map(e => `${e.status === 'completed' ? '☑' : e.status === 'in_progress' ? '▶' : '☐'} ${e.content || e.title || ''}`).join('\n');
        store.push({ key: 'plan', kind: 'plan', text: entries || text });
        break;
      }
      case 'status_update': {
        // "Waiting for your response" / "Devin is thinking..." —— 记录为状态行文本
        store.statusText = text || u.status;
        break;
      }
      case 'state_update':
        store.state = u.state;
        break;
      case 'available_commands_update': case 'current_mode_update': case 'usage_update':
        if (kind === 'current_mode_update' && u.currentModeId) store.mode = u.currentModeId;
        break; // 元信息，不渲染
      default:
        if (text) store.push({ key: eid || kind + store.items.length, kind: 'ev', title: kind, text });
    }
    return kind;
  }

  function storeHtml(store) {
    const parts = [];
    const items = store.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      // 连续 tool 条目聚合成官方风卡片：Ran N commands · edited N files · called N tools
      if (it.kind === 'tool') {
        const run = [it];
        while (i + 1 < items.length && items[i + 1].kind === 'tool') run.push(items[++i]);
        const rsig = run.map(t => t._sig || (t.title || '') + '|' + (t.status || '') + '|' + (t.text || '').length).join('§') + '|' + (run[0]._open ? 1 : 0);
        if (run[0]._aggsig !== rsig) {
          run[0]._aggsig = rsig;
          run[0]._agghtml = renderToolRun(run);
        }
        parts.push(run[0]._agghtml);
        continue;
      }
      // 条目 HTML 记忆化：签名不变则复用，避免每次 repaint 全量重渲染
      const sig = it.kind + '|' + (it.status || '') + '|' + (it.done || '') + '|' +
        (it._open ? 1 : 0) + '|' +
        (it.title || '') + '|' + (it.text?.length || 0) + '|' + (it.text || '').slice(-24);
      if (it._sig !== sig || !it._html) {
        it._sig = sig;
        it._html = renderItem(it);
      }
      parts.push(it._html);
    }
    return parts.join('');
  }

  function renderToolRun(run) {
    let cmd = 0, file = 0, tool = 0, running = 0, failed = 0;
    const rows = run.map(t => {
      const ti = t.title || '';
      if (/edit|write|file|patch|notebook/i.test(ti)) file++;
      else if (/command|run|shell|terminal|exec|bash|cmd/i.test(ti)) cmd++;
      else tool++;
      const s = t.status || '';
      const ok = /complete|done|success/i.test(s), bad = /fail|error/i.test(s);
      if (bad) failed++; else if (!ok) running++;
      const tick = ok ? '☑' : bad ? '☒' : '◌';
      const tail = (t.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      return `<div class="trow"><span class="tick">${tick}</span><span class="mono">${esc(ti)}${tail ? `<span class="ttail"> ${esc(tail)}</span>` : ''}</span></div>`;
    }).join('');
    const st = running ? 'running' : failed ? 'err' : 'done';
    const bits = [];
    if (cmd) bits.push(`Ran ${cmd} command${cmd > 1 ? 's' : ''}`);
    if (file) bits.push(`edited ${file} file${file > 1 ? 's' : ''}`);
    if (tool) bits.push(`called ${tool} tool${tool > 1 ? 's' : ''}`);
    return `<div class="ev aggr ${run[0]._open ? 'open' : ''}" data-aggkey="${esc(run[0].key || '')}"><div class="head agghead"><span class="chev">▸</span>
      <span class="mono">${esc(bits.join(' · ') || `${run.length} tool calls`)}</span>
      <span class="st ${st}">${st === 'done' ? 'Done' : st === 'err' ? 'Failed' : 'Running'}</span></div>
      <div class="body aggbody">${rows}</div></div>`;
  }

  function renderItem(it) {
      if (it.kind === 'user')
        return `<div class="msg user">${linkify(it.text)}</div>`;
      if (it.kind === 'devin')
        return `<div class="msg devin">${md(it.text)}</div>`;
      if (it.kind === 'thought')
        return `<div class="ev aggr thought ${it._open ? 'open' : ''}" data-aggkey="${esc(it.key)}"><div class="head agghead"><span class="chev">▸</span><span class="mono">thinking</span></div><div class="body mono aggbody">${esc(it.text).slice(0, 600)}</div></div>`;
      if (it.kind === 'tool') {
        const st = /complete|done|success/i.test(it.status || '') ? 'done' : /fail|error/i.test(it.status || '') ? 'err' : 'running';
        return `<div class="ev"><div class="head"><span class="chev">▸</span>
          <span class="mono">${esc(it.title)}</span>
          <span class="st ${st}">${st === 'done' ? 'Done' : st === 'err' ? 'Failed' : 'Running'}</span></div>
          ${it.text ? `<div class="body mono">${esc(it.text).slice(0, 500)}</div>` : ''}</div>`;
      }
      if (it.kind === 'perm') {
        const btns = it.done
          ? `<div class="body">已选择：${esc(it.done)}</div>`
          : `<div class="permopts">` + it.options.map(o =>
              `<button class="permopt" data-k="${esc(it.key)}" data-o="${esc(o.optionId)}" data-n="${esc(o.name)}">${esc(o.name)}</button>`
            ).join('') + `</div>`;
        return `<div class="ev perm${it.done ? '' : ' pending'}"><div class="head"><span class="chev">⚠</span><span class="mono">权限请求</span></div>
          <div class="body">${esc(it.title)}</div>${btns}</div>`;
      }
      // 选项卡：只在密集事件里出现；点选项把选项文本作为普通消息发出（等同回答）
      if (it.kind === 'quest') {
        const btns = it.done
          ? `<div class="body">已选择：${esc(it.done)}</div>`
          : `<div class="permopts">` + it.options.map(o => {
              const sel = it.multi && (it.picked || []).includes(o.optionId);
              return `<button class="permopt${sel ? ' sel' : ''}" data-k="${esc(it.key)}" data-o="${esc(o.optionId)}" data-n="${esc(o.name)}">${sel ? '✓ ' : ''}${esc(o.name)}</button>`;
            }).join('') +
            (it.multi ? `<button class="permopt multisub" data-k="${esc(it.key)}"${(it.picked || []).length ? '' : ' disabled'}>提交（${(it.picked || []).length}）</button>` : '')
            + `</div>`;
        return `<div class="ev perm${it.done ? '' : ' pending'}"><div class="head"><span class="chev">❓</span><span class="mono">选项问题</span></div>
          <div class="body">${esc(it.text)}</div>${btns}</div>`;
      }
      if (it.kind === 'plan')
        return `<div class="ev"><div class="head"><span class="chev">≡</span><span class="mono">plan</span></div><div class="body mono">${esc(it.text)}</div></div>`;
      if (it.kind === 'secretreq') {
        const body = it.done
          ? `<div class="body">已提供 ${esc(it.secretName)}</div>`
          : `<div class="body">Devin 请求机密 <b>${esc(it.secretName)}</b>${it.title ? ' · ' + esc(it.title) : ''}</div>
             <div class="secrow"><input class="secinp" type="password" autocomplete="off" placeholder="输入机密值" data-k="${esc(it.key)}">
             <button class="secbtn" data-k="${esc(it.key)}">提供</button></div>`;
        return `<div class="ev perm${it.done ? '' : ' pending'}"><div class="head"><span class="chev">◈</span><span class="mono">secret</span></div>${body}</div>`;
      }
      if (it.kind === 'planreq') {
        const body = it.done
          ? `<div class="body">已处理：${esc(it.done)}</div>`
          : `<div class="body mono">${esc(it.text)}</div>
             <div class="permopts"><button class="permopt planbtn" data-k="${esc(it.key)}" data-o="accept" data-n="接受">接受计划</button>
             <button class="permopt planbtn" data-k="${esc(it.key)}" data-o="edit" data-n="编辑">编辑后提交</button></div>`;
        return `<div class="ev perm${it.done ? '' : ' pending'}"><div class="head"><span class="chev">≡</span><span class="mono">plan 审批</span></div>${body}</div>`;
      }
      return `<div class="ev"><div class="head"><span class="chev">▸</span><span class="mono">${esc(it.title)}</span></div><div class="body">${linkify(it.text)}</div></div>`;
  }

  // REST 密集事件（GET /iapi/events/{sid}）映射进 store
  function applyDenseEvent(store, e) {
    const t = e.type || 'unknown';
    const eid = e.id || e.event_id;
    const msg = e.message ?? e.data?.message ?? '';
    if (eid && store.find(eid)) return;      // 与实时流/已加载历史去重
    if (t === 'user_message' || t === 'initial_user_message')
      store.push({ key: eid || 'h' + store.items.length, kind: 'user', text: msg });
    else if (t === 'devin_message'
             && (e.content_type || e.data?.content_type) === 'user_question') {
      // 选项卡：不进 ACP 实时通道，只在密集事件里出现；optionId 里存要发送的文本
      const qs = e.questions || e.data?.questions || [];
      if (qs.length && !store.find('q-' + eid)) {
        const opts = [];
        qs.forEach((q) => (q.options || []).forEach(n =>
          opts.push({ optionId: qs.length > 1 ? (q.question || '') + '：' + n : n, name: n })));
        store.push({ key: 'q-' + eid, kind: 'quest',
          text: qs.map(q => q.question || '').join('\n'), options: opts,
          multi: qs.some(q => q.allow_multiple === true), picked: [] });
      }
    }
    else if (t === 'user_question_answered') {
      const cur = store.find('q-' + (e.original_event_id || e.data?.original_event_id));
      const a = (e.answers || e.data?.answers || [])[0] || {};
      const picked = (a.selected_options || []).join(',')
        || a.other_text || e.skip_reason || '已回答';
      if (cur) cur.done = picked;
    }
    else if (t === 'devin_message')
      store.push({ key: eid || 'h' + store.items.length, kind: 'devin', text: msg });
    else if (t === 'thought_summary' || t === 'devin_thought' || t === 'agent_thought')
      store.push({ key: eid || 'h' + store.items.length, kind: 'thought', text: msg || e.data?.thought || '' });
    else if (t === 'status_update')
      store.statusText = msg || e.data?.status || '';
    else if (t === 'request_secret' || e.data?.eventType === 'request_secret') {
      const d2 = e.data || {};
      const rid = d2.request_id || d2.requestId || eid;
      if (!(d2.completed_timestamp || d2.completedTimestamp) && !store.find('sec-' + rid))
        store.push({ key: 'sec-' + rid, kind: 'secretreq',
          secretName: d2.secret_name || d2.secretName || 'secret', requestId: rid,
          title: d2.title || 'Devin 请求机密' });
    } else if (t === 'permission_request' || e.data?.eventType === 'permission_request') {
      // 密集事件里字段在顶层（request_id/command/tool_name），data 内兜底
      const d2 = e.data || {};
      const rid = e.request_id || d2.request_id || d2.requestId || eid;
      const cmd = e.command || d2.command || '';
      const tool = e.tool_name || d2.tool_name || d2.toolName || '';
      if (rid && !store.find('perm-' + rid))
        store.push({ key: 'perm-' + rid, kind: 'perm', requestId: rid,
          title: (tool && cmd) ? tool + ' · ' + cmd : (cmd || d2.title || 'Devin 请求权限'),
          options: [{ optionId: 'approve', name: '批准' }, { optionId: 'deny', name: '拒绝' }] });
    } else if (t === 'permission_resolved' || t === 'permission_request_response'
               || e.data?.eventType === 'permission_resolved') {
      const d2 = e.data || {};
      const cur = store.find('perm-' + (e.request_id || d2.request_id || d2.requestId || eid));
      const appr = e.approved ?? d2.approved;
      if (cur) cur.done = (appr === true || appr === 'true') ? '已批准' : '已拒绝';
    } else if (e.data?.plan_id || e.data?.planId) {
      const pid = e.data.plan_id || e.data.planId;
      if (!store.find('planreq-' + pid))
        store.push({ key: 'planreq-' + pid, kind: 'planreq', planId: pid,
          eventId: e.data.plan_event_id || e.data.planEventId || eid,
          text: msg || 'Devin 提交了实施计划' });
    }
    else if (t === 'set_devin_version')
      store.push({ key: eid || 'h' + store.items.length, kind: 'ev', title: 'model',
                   text: '模型 → ' + (e.data?.version || e.version || msg) });
    else if (t === 'simple_activity_update' || t === 'context_growth_update' || t.startsWith('acu_'))
      ; // 元信息跳过
    else if (/tool|command|shell|edit|read|search|browser|file|exec|write/i.test(t))
      store.push({ key: eid || 'h' + store.items.length, kind: 'tool', title: t,
                   text: msg || (e.data ? JSON.stringify(e.data).slice(0, 300) : ''), status: 'done' });
    else if (msg)
      store.push({ key: eid || 'h' + store.items.length, kind: 'ev', title: t, text: msg });
  }

  /* ================= 模型选择（devin_version configOption） ================= */
  function modelName(cfg) {
    const cur = cfg?.options?.find(o => o.value === cfg.currentValue);
    return cur?.name || cfg?.currentValue || 'Model';
  }
  function updateChips(store) {
    const bar = document.getElementById('chipsbar');
    if (!bar) return;
    // 隐藏无意义的 chip：organization（只有一个组织）与单选项
    const cfgs = Object.values(store.configs || {}).filter(c =>
      c?.options?.length > 1 && !/org|platform/i.test(c.configId || ''));
    const ka = `<button class="chip keepchip ${store.keepAlive ? 'on' : ''}" data-cfg="__ka">${store.keepAlive ? '保活中' : '保活'}</button>`;
    bar.style.display = '';
    bar.innerHTML = cfgs.slice(0, 4).map(c =>
      `<button class="chip" data-cfg="${esc(c.configId)}">${esc(modelName(c))} <span class="chev">▾</span></button>`).join('') + ka;
  }
  function showConfigSheet(store, devinId, cfg) {
    if (!cfg) return;
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    let lastSection = null;
    const rows = cfg.options.map(o => {
      const m = o._meta || {};
      const sec = m['cognition.ai/sectionName'] || null;
      let header = '';
      if (sec && sec !== lastSection) { lastSection = sec; header = `<div class="sheet-sec">${esc(sec)}</div>`; }
      return header + `<div class="sheet-opt ${o.value === cfg.currentValue ? 'cur' : ''}" data-v="${esc(o.value)}">
        <div class="opt-name">${esc(o.name)}${o.value === cfg.currentValue ? ' <span class="check">✓</span>' : ''}</div>
        ${o.description ? `<div class="opt-desc">${esc(o.description)}</div>` : ''}
      </div>`;
    }).join('');
    mask.innerHTML = `<div class="sheet"><div class="sheet-title">${esc(cfg.name || 'Model')}</div>${rows}</div>`;
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelectorAll('.sheet-opt').forEach(el => el.onclick = async () => {
      const v = el.dataset.v;
      mask.remove();
      cfg.currentValue = v;                       // 乐观更新
      updateChips(store);
      try { await acp.setConfig(devinId, cfg.configId, v); }
      catch (e) { alert('切换失败: ' + e.message); }
    });
    document.body.appendChild(mask);
  }

  /* ================= 聊天视图 ================= */
  function msgHtml(m) {
    if (isUserMsg(m))
      return `<div class="msg user">${linkify(m.message)}<div class="t">${fmtTime(m.timestamp)}</div></div>`;
    if (isDevinMsg(m))
      return `<div class="msg devin">${md(m.message)}<div class="t">${fmtTime(m.timestamp)}</div></div>`;
    const running = /running|start/i.test(m.type || '');
    return `<div class="ev"><div class="head"><span class="chev">▸</span>
      <span class="mono">${esc(m.type || 'event')}</span>
      <span class="st ${running ? 'running' : 'done'}">${running ? 'Running' : 'Done'}</span></div>
      <div class="body">${linkify(m.message)}</div></div>`;
  }

  async function renderChat(id, host = app) {
    host.innerHTML = `
      <div class="topbar">
        <button class="iconbtn" id="menubtn" title="会话列表">☰</button>
        <button class="iconbtn" id="back">‹</button>
        <h1 id="title">${esc(titleCache[id] || '…')}</h1><span id="pill"></span>
        <button class="iconbtn" id="starbtn" title="收藏">☆</button></div>
      <div class="chat" id="chat"></div>
      <button class="newmsg" id="newmsg" style="display:none">↓ 新消息</button>
      <div class="chipsbar" id="chipsbar" style="display:none"></div>
      <div class="queuebox" id="queuebox" style="display:none"></div>
      <div class="composer">
        <button class="iconbtn" id="attach" title="上传附件">📎</button>
        <input type="file" id="file" multiple style="display:none">
        <textarea id="inp" rows="1" placeholder="Steer while it works…"></textarea>
        <button class="stopbtn" id="stop" title="停止 Devin" style="display:none">■</button>
        <button class="sendbtn" id="send">↑</button>
      </div>`;
    document.getElementById('back').onclick = () => location.hash = '#/';
    document.getElementById('menubtn').onclick = () => openDrawer(id);
    const inp = document.getElementById('inp');

    // 附件上传：POST /api/attachments -> 返回 url，追加进输入框随消息一起发
    const attachBtn = document.getElementById('attach');
    const fileInp = document.getElementById('file');
    attachBtn.onclick = () => fileInp.click();
    fileInp.onchange = async () => {
      const files = [...fileInp.files];
      fileInp.value = '';
      if (!files.length) return;
      attachBtn.disabled = true;
      attachBtn.textContent = '…';
      for (const f of files) {
        try {
          const fd = new FormData();
          fd.append('file', f, f.name);
          const r = await fetch('/api/attachments', { method: 'POST', body: fd });
          const d = await r.json().catch(() => ({}));
          if (r.status === 401 && d.error === 'auth_required') { location.href = '/login'; return; }
          if (!r.ok) throw new Error(d.detail || d.error || ('HTTP ' + r.status));
          inp.value += (inp.value.trim() ? '\n' : '') + d.url;
          inp.dispatchEvent(new Event('input'));
        } catch (e) {
          chat.insertAdjacentHTML('beforeend',
            `<div class="err">附件 ${esc(f.name)} 上传失败: ${esc(e.message)}</div>`);
        }
      }
      attachBtn.disabled = false;
      attachBtn.textContent = '📎';
    };
    let sendFn = async () => {};
    inp.value = localStorage.getItem('draft:' + id) || '';
    inp.addEventListener('input', () => {
      inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
      inp.value ? localStorage.setItem('draft:' + id, inp.value)
                : localStorage.removeItem('draft:' + id);
      renderM();
    });
    if (inp.value) inp.dispatchEvent(new Event('input'));

    // ---- @ 弹层：skills(本地可维护) + playbooks(v3 代理) + sessions ----
    const MENTION_ICONS = { skill: '🧩', playbook: '📕', session: '💬' };
    const mItems = (localStorage.getItem('skills_csv') ||
      'android-emulator-e2e,analyzing-sessions,creating-code-scans,' +
      'managing-automations,managing-playbooks,managing-child-sessions,' +
      'dynamic-workflows,data-analysis,interactive-artifacts,' +
      '狗头军师,glill me')
      .split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
      .map(n => ({ kind: 'skill', label: n, insert: '@skills:' + n }));
    let mFiltered = [], mIndex = -1, mLoading = false;
    const mbox = document.createElement('div');
    mbox.className = 'mbox'; mbox.style.display = 'none';
    inp.closest('.composer').appendChild(mbox);
    const stripDev = (s) => (s || '').replace(/^devin-/, '');
    const ensureMentions = () => {
      if (mLoading) return; mLoading = true;
      apiGet('/playbooks').then(d => ((d && d.items) || []).forEach(p => {
        const t = p.title || p.name, pid = p.id || p.playbook_id;
        if (t && pid) mItems.push({ kind: 'playbook', label: t, insert: '@playbook:' + pid });
      })).catch(() => {});
      apiGet('/sessions?limit=50').then(d => {
        const arr = (d && (d.sessions || d.items)) || [];
        arr.forEach(s => {
          const sid = stripDev(s.devin_id || s.session_id || s.id);
          if (sid && sid !== stripDev(id) && !s.is_archived)
            mItems.push({ kind: 'session', label: s.title || '(无标题)', insert: '@devin-' + sid });
        });
        renderM();
      }).catch(() => {});
    };
    const mToken = () => {
      const pos = inp.selectionStart;
      const t = inp.value;
      const at = t.lastIndexOf('@', pos - 1);
      if (at < 0 || (at > 0 && !/\s/.test(t[at - 1]))) return null;
      const q = t.slice(at + 1, pos);
      return (/\s/.test(q) || q.length > 40) ? null : { at, q };
    };
    const closeM = () => { mbox.style.display = 'none'; mIndex = -1; };
    const applyM = (n) => {
      const item = mFiltered[n], tok = mToken();
      if (!item || !tok) return;
      inp.value = inp.value.slice(0, tok.at) + item.insert + ' ' + inp.value.slice(inp.selectionStart);
      inp.dispatchEvent(new Event('input'));
      inp.focus();
    };
    function renderM() {
      const tok = mToken();
      if (!tok) return closeM();
      ensureMentions();
      const q = tok.q.toLowerCase();
      mFiltered = mItems.filter(i =>
        i.label.toLowerCase().includes(q) || i.insert.toLowerCase().includes(q));
      if (!mFiltered.length) return closeM();
      if (mIndex >= mFiltered.length) mIndex = -1;
      mbox.innerHTML = mFiltered.slice(0, 20).map((i, n) =>
        `<div class="mit${n === mIndex ? ' sel' : ''}" data-n="${n}">${MENTION_ICONS[i.kind] || '@'} ${esc(i.label)}</div>`).join('');
      mbox.querySelectorAll('.mit').forEach(el => {
        el.onmousedown = e => { e.preventDefault(); applyM(+el.dataset.n); };
      });
      mbox.style.display = 'block';
    }
    inp.addEventListener('keydown', e => {
      if (mbox.style.display === 'block') {
        if (e.key === 'Escape') { closeM(); e.preventDefault(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          mIndex = (mIndex + (e.key === 'ArrowDown' ? 1 : -1) + mFiltered.length) % mFiltered.length;
          renderM(); e.preventDefault(); return;
        }
        if (e.key === 'Enter' && mIndex >= 0) { applyM(mIndex); e.preventDefault(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFn(); }
    });
    document.getElementById('send').onclick = () => sendFn();
    // 停止按钮：对齐官方 web 输入框右下角 ■（Stop Devin）= session/cancel，只打断当前轮次；
    // _cognition.ai/session/stop 是「Stop session」（关 VM、标 done），不能混用。仅 working 时显示
    const stopBtn = document.getElementById('stop');
    stopBtn.onclick = async () => {
      if (!confirm('停止 Devin 当前任务？\n会话保持活动，可接着发消息')) return;
      if (!acpEnabled()) { alert('停止需要实时模式（PAT）'); return; }
      stopBtn.disabled = true;
      try { await acp.rpc('session/cancel', { sessionId: addDevin(id) }); }
      catch (e) { alert('停止失败：' + e.message); }
      stopBtn.disabled = false;
    };

    const chat = document.getElementById('chat');
    const scrollBottom = () => { chat.scrollTop = chat.scrollHeight; };

    if (acpEnabled()) {
      /* ---- 实时模式：ACP WebSocket ---- */
      const devinId = addDevin(id);
      const store = makeEventStore();
      let dirty = false, saveT = null, lastSeen = 0, olderCursor = null, loadingOlder = false;
      const loadOlder = async () => {
        if (!olderCursor || loadingOlder) return;
        loadingOlder = true;
        const btn = document.getElementById('older');
        if (btn) btn.textContent = '加载中…';
        try {
          const hd = await fetch(`/iapi/events/${devinId}?limit=200&order=desc&cursor=${olderCursor}`).then(r => r.json());
          const st = store.statusText;
          const n0 = store.items.length;
          (hd.result || []).reverse().forEach(e => applyDenseEvent(store, e));
          store.items.splice(n0).forEach(it => store.unshift(it));
          store.statusText = st;
          olderCursor = hd.next_cursor || null;
          const oldH = chat.scrollHeight;
          dirty = true; repaint();
          chat.scrollTop += chat.scrollHeight - oldH;
        } catch (e) { console.warn('load older failed', e); }
        loadingOlder = false;
      };
      const newmsg = document.getElementById('newmsg');
      newmsg.onclick = () => { newmsg.style.display = 'none'; scrollBottom(); };
      const repaint = () => {
        if (!dirty) return;
        if (document.hidden) return;   // 后台不碰 DOM，dirty 保留到回前台
        dirty = false;
        // innerHTML 重建前保住 secret 输入框的焦点与已输入值
        const focusEl = document.activeElement?.classList?.contains('secinp')
          ? { k: document.activeElement.dataset.k, v: document.activeElement.value } : null;
        const atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 80;
        chat.innerHTML =
          (olderCursor ? '<button class="olderbtn" id="older">加载更早的消息</button>' : '') +
          storeHtml(store) +
          (['suspended', 'expired', 'finished'].includes(store.state)
            ? '<button class="rebootbtn" id="reboot">⟳ 重启会话</button>'
            : active(store.state)
            ? '<div class="statusline">Devin is working…' +
              (store.activity ? ' · ' + esc(String(store.activity).replace(/_/g, ' ')) : '') + '</div>'
            : store.userAction
              ? `<div class="statusline">⚠ 需要你操作：${esc(String(store.userAction).replace(/_/g, ' '))}</div>`
              : store.statusText ? `<div class="statusline">${esc(store.statusText)}</div>` : '');
        if (focusEl) {
          const el = chat.querySelector(`.secinp[data-k="${focusEl.k}"]`);
          if (el) { el.value = focusEl.v; el.focus(); }
        }
        if (atBottom) { scrollBottom(); newmsg.style.display = 'none'; }
        else if (store.items.length > lastSeen) newmsg.style.display = '';
        lastSeen = store.items.length;
        stopBtn.style.display = active(store.state) ? '' : 'none';
        document.getElementById('send').title = active(store.state) ? '加入队列' : '发送';
        document.getElementById('pill').innerHTML =
          (store.mode ? `<span class="modeltag">${esc(String(store.mode).replace(/^devin-/, ''))}</span>` : '') +
          pill(store.state || 'working') +
          (store.prs || []).map(p =>
            `<a class="prchip ${esc(p.pr_state || '')}" href="${esc(p.pr_url)}" target="_blank" rel="noopener">PR·${esc(p.pr_state || '')}</a>`).join('') +
          `<span class="infotag acuchip" id="acuchip" title="点击设置 ACU 上限">${store.acuLimit ? '≤' + store.acuLimit + ' ACU' : 'ACU 不限'}</span>`;
        const qb = document.getElementById('queuebox');
        qb.innerHTML = (store.queued || []).map((m, i) => `
          <div class="qmsg"><span class="qtext">${esc(m.message || m.text || m.body || '')}</span>
            <button class="qbtn" data-q="sendNow" data-i="${i}">发</button>
            <button class="qbtn" data-q="edit" data-i="${i}">改</button>
            <button class="qbtn" data-q="remove" data-i="${i}">删</button></div>`).join('');
        qb.style.display = (store.queued || []).length ? '' : 'none';
        clearTimeout(saveT);
        saveT = setTimeout(() => histCacheSet(id, store), 1500);
      };

      // 先秒显本地缓存的历史（限最近 5 个会话），后台再拉新数据去重
      const cached = histCacheGet(id);
      if (cached) {
        cached.items.forEach(it => store.push(it));
        store.statusText = cached.statusText;
        store.mode = cached.mode;
        if (cached.title) document.getElementById('title').textContent = cached.title;
        dirty = true; repaint(); scrollBottom();
      }
      // 权限请求渲染成可点卡片，点了再回执；不自动拒绝
      const unR = acp.onRequest((o) => {
        if (o.method !== 'session/request_permission') return false;
        const p = o.params || {};
        if (p.sessionId && stripDevin(p.sessionId) !== id) return false;
        const tc = p.toolCall || {};
        store.push({
          key: 'perm-' + o.id, kind: 'perm', reqId: o.id,
          title: tc.title || tc.kind || 'Devin 请求权限',
          options: (p.options && p.options.length ? p.options
            : [{ optionId: 'allow', name: '允许' }, { optionId: 'reject', name: '拒绝' }]),
        });
        dirty = true;
        return true;
      });
      chat.addEventListener('click', async (e) => {
        const agg = e.target.closest('.agghead');
        if (agg) {
          const ev = agg.closest('.ev');
          const it = ev?.dataset.aggkey && store.find(ev.dataset.aggkey);
          if (it) { it._open = !it._open; ev.classList.toggle('open'); }
          return;
        }
        if (e.target.id === 'older') { loadOlder(); return; }
        if (e.target.id === 'reboot') {
          e.target.disabled = true; e.target.textContent = '重启中…';
          try { await acp.rpc('_cognition.ai/session/reboot', { sessionId: devinId }); }
          catch (e2) { alert('重启失败：' + e2.message); }
          return;
        }
        if (e.target.classList.contains('secbtn')) {
          const it = store.find(e.target.dataset.k);
          const inpEl = chat.querySelector(`.secinp[data-k="${e.target.dataset.k}"]`);
          const v = inpEl?.value?.trim();
          if (!it || !v) return;
          e.target.disabled = true;
          try {
            await acp.rpc('_cognition.ai/secret/provide', {
              session_id: devinId, request_id: it.requestId,
              secret_name: it.secretName, secret_value: v });
            it.done = true;
          } catch (e2) { alert('提交失败：' + e2.message); e.target.disabled = false; return; }
          dirty = true; repaint();
          return;
        }
        const b = e.target.closest('.permopt');
        if (!b) return;
        const it = store.find(b.dataset.k);
        if (!it || it.done) return;
        if (it.kind === 'quest') {
          // 多选卡：点选项只切换勾选，点「提交」才把所选一起发出
          if (it.multi && !b.classList.contains('multisub')) {
            it.picked ||= [];
            const pi = it.picked.indexOf(b.dataset.o);
            if (pi >= 0) it.picked.splice(pi, 1); else it.picked.push(b.dataset.o);
            dirty = true; repaint();
            return;
          }
          // 选项卡：无专用回执接口——把选项文本当普通消息发出即等同回答
          try {
            const text = it.multi ? (it.picked || []).join(', ') : b.dataset.o;
            const names = it.multi
              ? it.options.filter(o => it.picked.includes(o.optionId)).map(o => o.name).join('、')
              : b.dataset.n;
            if (active(store.state)) {
              const mid = crypto.randomUUID?.() || 'q' + Date.now();
              await acp.rpc('_cognition.ai/queuedMessages/update',
                { sessionId: devinId, id: mid, op: 'add', message: text });
              (store.queued ||= []).push({ id: mid, message: text });
            } else {
              await acp.prompt(devinId, text);
            }
            it.done = names;
          } catch (e2) { alert('发送失败：' + e2.message); return; }
          dirty = true; repaint();
          return;
        }
        if (it.kind === 'planreq') {
          try {
            if (b.dataset.o === 'accept') {
              await acp.rpc('_cognition.ai/plan/accept',
                { sessionId: devinId, planId: it.planId, acceptedEventId: it.eventId });
            } else {
              const body = prompt('修改计划内容（留空取消）', it.text);
              if (!body) return;
              await acp.rpc('_cognition.ai/plan/edit',
                { sessionId: devinId, planId: it.planId, body });
            }
            it.done = b.dataset.n;
          } catch (e2) { alert('计划操作失败：' + e2.message); return; }
          dirty = true; repaint();
          return;
        }
        if (it.requestId) {
          // 事件流审批卡（permission_request）：ACP permission/respond 回执
          try {
            await acp.rpc('_cognition.ai/permission/respond',
              { sessionId: devinId, permissionRequestId: it.requestId, approved: b.dataset.o === 'approve' });
            it.done = b.dataset.n;
          } catch (e2) { alert('回执失败：' + e2.message); return; }
          dirty = true; repaint();
          return;
        }
        it.done = b.dataset.n;
        acp.respond(it.reqId, { outcome: { outcome: 'selected', optionId: b.dataset.o } });
        dirty = true; repaint();
      });

      const unU = acp.onUpdate((params) => {
        if (stripDevin(params?.sessionId) !== id) return;
        applyUpdate(store, params);
        updateChips(store);
        dirty = true;
        if (document.hidden && !document.title.startsWith('●'))
          document.title = '● ' + document.title;
      });

      // WS 断开自动重连 + re-resume
      let gone = false;
      const unC = acp.onClose(() => {
        if (gone) return;
        store.statusText = '连接断开，正在重连…';
        dirty = true;
        const retry = async () => {
          if (gone) return;
          try {
            const r = await acp.resume(devinId);
            store.configs = {};
            (r?.configOptions || []).forEach(c => store.configs[c.configId] = c);
            updateChips(store);
            store.statusText = '';
            dirty = true;
          } catch { if (!gone) setTimeout(retry, 4000); }
        };
        setTimeout(retry, 1500);
      });

      // 保活：session/heartbeat 心跳（官方 keepAlive 通道）
      let kaT = null;
      const setKeepAlive = (on) => {
        store.keepAlive = on;
        clearInterval(kaT); kaT = null;
        if (on) {
          acp.rpc('_cognition.ai/session/heartbeat', { sessionId: devinId }).catch(() => {});
          kaT = setInterval(() =>
            acp.rpc('_cognition.ai/session/heartbeat', { sessionId: devinId }).catch(() => {}), 60000);
        }
        updateChips(store);
      };
      if (store.keepAlive) setKeepAlive(true);

      const raf = setInterval(repaint, 250);
      currentUnsub = () => {
        gone = true; unU(); unR(); unC();
        clearInterval(raf); clearInterval(detT); clearInterval(kaT);
        acp.markRead(devinId).catch(() => {});   // 看会话期间又来新消息时兜底清未读
      };

      // 标题/状态/PR 从 REST 元数据拿；事件流走 WS
      fetchSessionRest(id).then(d => {
        document.getElementById('title').textContent = d.title || id;
        store.prs = d.pull_requests || [];
        dirty = true;
      }).catch(() => {});

      // ACU 上限：点击徽标设置（默认建议 2，留空清除）
      document.getElementById('pill').onclick = async (e) => {
        if (e.target.id !== 'acuchip') return;
        const v = prompt('本会话 ACU 上限（留空 = 不限）', store.acuLimit ?? 2);
        if (v === null) return;
        const n = v.trim() === '' ? null : parseFloat(v);
        if (v.trim() !== '' && !(n > 0)) { alert('请输入正数'); return; }
        try {
          await acp.rpc('_cognition.ai/session-spending-limit/set', { session_id: devinId, max_credits: n });
          store.acuLimit = n; dirty = true;
        } catch (e2) { alert('设置失败：' + e2.message); }
      };
      // 排队消息操作：立即发送 / 编辑 / 删除（_cognition.ai/queuedMessages/update）
      document.getElementById('queuebox').onclick = async (e) => {
        const b = e.target.closest('.qbtn'); if (!b) return;
        const m = store.queued?.[+b.dataset.i]; if (!m) return;
        const mid = m.id || m.messageId || m.eventId;
        try {
          if (b.dataset.q === 'edit') {
            const t = prompt('修改排队消息', m.message || m.text || '');
            if (t === null) return;
            await acp.rpc('_cognition.ai/queuedMessages/update',
              { sessionId: devinId, id: mid, op: 'edit', message: t });
            m.message = t;
          } else {
            await acp.rpc('_cognition.ai/queuedMessages/update',
              { sessionId: devinId, id: mid, op: b.dataset.q });
            store.queued.splice(+b.dataset.i, 1);
          }
          dirty = true;
        } catch (e2) { alert('操作失败：' + e2.message); }
      };

      // iapi 会话详情轮询：current_activity / user_action_required / ACU 上限 / 星标
      const starBtn = document.getElementById('starbtn');
      starBtn.onclick = async () => {
        const want = !store.starred;
        store.starred = want;
        starBtn.textContent = want ? '★' : '☆';
        try {
          await acp.rpc('_cognition.ai/session/pin', { sessionId: devinId, pinned: want });
        } catch (e2) {
          store.starred = !want;
          starBtn.textContent = want ? '☆' : '★';
          alert('收藏失败：' + e2.message);
        }
      };
      const pollDetail = async () => {
        if (document.hidden) return;   // 后台不轮询，省电省流量
        try {
          const d = await fetch(`/iapi/sessions/${devinId}`).then(r => r.ok ? r.json() : null);
          if (!d) return;
          store.activity = d.current_activity;
          store.acuLimit = d.max_acu_limit;
          store.userAction = d.latest_status_contents?.user_action_required;
          store.starred = d.is_starred;
          starBtn.textContent = d.is_starred ? '★' : '☆';
          if (d.session_keep_alive && !store.keepAlive) setKeepAlive(true);
          dirty = true;
        } catch { }
      };
      pollDetail();
      const detT = setInterval(pollDetail, 20000);

      // 历史：REST 密集事件（经本机 /iapi 代理注入 PAT，绕浏览器 CORS）
      if (!cached) chat.innerHTML = '<div class="statusline">加载历史…</div>';
      try {
        const hd = await fetch(`/iapi/events/${devinId}?limit=200&order=desc`).then(r => {
          if (r.status === 401) { location.href = '/login'; throw new Error('auth_required'); }
          return r.json();
        });
        (hd.result || []).reverse().forEach(e => applyDenseEvent(store, e));
        olderCursor = hd.next_cursor || null;
        dirty = true; repaint();
        scrollBottom();
      } catch (e) {
        console.warn('history load failed', e);
      }

      try {
        const r = await acp.resume(devinId);
        store.configs = {};
        (r?.configOptions || []).forEach(c => store.configs[c.configId] = c);
        updateChips(store);
        document.getElementById('chipsbar').onclick = (e) => {
          const b = e.target.closest('.chip');
          if (!b) return;
          if (b.dataset.cfg === '__ka') { setKeepAlive(!store.keepAlive); return; }
          showConfigSheet(store, devinId, store.configs?.[b.dataset.cfg]);
        };
        acp.markRead(devinId).catch(() => {});
        dirty = true; repaint();
      } catch (e) {
        chat.innerHTML = `<div class="err">实时连接失败：${esc(e.message)}<br><br>该会话可能不在当前 PAT 用户名下，或内部接口已变更。</div>`;
      }

      sendFn = async () => {
        const text = inp.value.trim();
        if (!text) return;
        inp.value = ''; inp.style.height = 'auto';
        document.getElementById('send').disabled = true;
        try {
          if (active(store.state)) {
            // 运行中：加入队列，不打断当前执行（_cognition.ai/queuedMessages/update add）
            const mid = crypto.randomUUID?.() || 'q' + Date.now() + Math.random().toString(36).slice(2);
            await acp.rpc('_cognition.ai/queuedMessages/update',
              { sessionId: devinId, id: mid, op: 'add', message: text });
            (store.queued ||= []).push({ id: mid, message: text });
            dirty = true;
          } else {
            await acp.prompt(devinId, text);
          }
          localStorage.removeItem('draft:' + id);
        } catch (e) {
          inp.value = text; inp.dispatchEvent(new Event('input'));
          chat.insertAdjacentHTML('beforeend', `<div class="err">发送失败: ${esc(e.message)}</div>`);
        } finally {
          document.getElementById('send').disabled = false;
          inp.focus();
        }
      };
    } else {
      /* ---- 轮询模式：REST ---- */
      let lastCount = -1;
      async function load() {
        try {
          const d = await fetchSessionRest(id);
          document.getElementById('title').textContent = d.title || id;
          document.getElementById('pill').innerHTML = pill(d.status_enum);
          const msgs = d.messages || [];
          if (msgs.length !== lastCount) {
            const atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 60;
            chat.innerHTML = msgs.map(msgHtml).join('') +
              (active(d.status_enum) ? '<div class="statusline">Devin is working…</div>' : '');
            if (atBottom || lastCount === -1) scrollBottom();
            lastCount = msgs.length;
          }
          if (!active(d.status_enum) && pollTimer) stopPoll();
        } catch (e) {
          chat.innerHTML = `<div class="err">${esc(e.message)}</div>`;
          stopPoll();
        }
      }
      sendFn = async () => {
        const text = inp.value.trim();
        if (!text) return;
        inp.value = ''; inp.style.height = 'auto';
        document.getElementById('send').disabled = true;
        try {
          await apiPost('/sessions/' + encodeURIComponent(id) + '/message', { message: text });
          localStorage.removeItem('draft:' + id);
          await load();
        } catch (e) {
          inp.value = text; inp.dispatchEvent(new Event('input'));
          chat.insertAdjacentHTML('beforeend', `<div class="err">${esc(e.message)}</div>`);
        } finally {
          document.getElementById('send').disabled = false;
          inp.focus();
        }
      };
      await load();
      pollTimer = setInterval(load, 4000);
    }
  }

  /* ================= 新建会话 ================= */
  // 会话代理枚举：已知名映射 + 探测创建接口动态刷新（官方调整自动跟进）
  const AGENT_LABELS = {
    lite: 'Lite — 小任务，最便宜', normal: 'Normal', fast: 'Fast', fusion: 'Fusion',
    ultra: 'Ultra', 'swe-2-medium': 'SWE-2 Medium', 'swe-2-high': 'SWE-2 High', 'swe-2-max': 'SWE-2 Max',
  };
  const agentShort = (v) => (AGENT_LABELS[v] || v).split(' — ')[0];
  // org 默认模型 PAT 读不到；用默认建过会话后响应里的 devin_mode 就是解析结果，缓存显示
  const orgDefLabel = () => {
    const m = localStorage.getItem('org_default_mode');
    return m ? `默认（${agentShort(m)}）` : '默认（org 设置）';
  };
  // 缺 prompt 必然 422 不会真建会话；detail 里 devin_mode 的 Literal 校验信息带全量合法值
  async function probeAgentModes() {
    let errs;
    try { await apiPost('/sessions', { devin_mode: '__probe_invalid__' }); return null; }
    catch (e) { try { errs = JSON.parse(e.message); } catch { return null; } }
    const d = Array.isArray(errs) && errs.find(x => (x.loc || []).includes('devin_mode'));
    if (!d?.msg) return null;
    const modes = [...d.msg.matchAll(/'([^']+)'/g)].map(m => m[1]);
    return modes.length ? modes : null;
  }

  function renderNew(host = app) {
    host.innerHTML = `
      <div class="topbar"><button class="iconbtn" id="back">‹</button><h1>New Session</h1></div>
      <div class="newpane">
        <textarea id="prompt" placeholder="描述要让 Devin 做的任务…"></textarea>
        ${MODE === 'v3' ? `
        <label class="tip">运行平台</label>
        <div class="dsel" id="platform" data-v="">
          <div class="dsel-face"><span class="dsel-txt">默认（Linux VM-Ubuntu）</span><span class="dsel-arrow">▾</span></div>
          <div class="dsel-list">
            <div class="dsel-opt cur" data-v="" data-n="默认（Linux VM-Ubuntu）">默认（Linux VM-Ubuntu）</div>
            <div class="dsel-opt" data-v="linux" data-n="Linux VM-Ubuntu">Linux VM-Ubuntu</div>
            <div class="dsel-opt" data-v="windows" data-n="windows">windows</div>
            <div class="dsel-opt" data-v="macos" data-n="macos">macos</div>
            <div class="dsel-opt" data-v="__custom" data-n="">自定义 outpost 池名…</div>
          </div>
        </div>
        <label class="tip">会话代理</label>
        <div class="dsel" id="agent" data-v="">
          <div class="dsel-face"><span class="dsel-txt">${orgDefLabel()}</span><span class="dsel-arrow">▾</span></div>
          <div class="dsel-list">
            <div class="dsel-opt cur" data-v="" data-n="${orgDefLabel()}">${orgDefLabel()}</div>
            <div class="dsel-opt" data-v="lite" data-n="Lite">Lite — 小任务，最便宜</div>
            <div class="dsel-opt" data-v="normal" data-n="Normal">Normal</div>
            <div class="dsel-opt" data-v="fast" data-n="Fast">Fast</div>
            <div class="dsel-opt" data-v="fusion" data-n="Fusion">Fusion</div>
            <div class="dsel-opt" data-v="ultra" data-n="Ultra">Ultra</div>
            <div class="dsel-opt" data-v="swe-2-medium" data-n="SWE-2 Medium">SWE-2 Medium</div>
            <div class="dsel-opt" data-v="swe-2-high" data-n="SWE-2 High">SWE-2 High</div>
            <div class="dsel-opt" data-v="swe-2-max" data-n="SWE-2 Max">SWE-2 Max</div>
          </div>
        </div>` : ''}
        <div class="tip">创建后将自动跳转到会话页，可继续发消息 steer；模型/模式在会话页模型按钮里随时切换。</div>
        <button class="bigbtn" id="create">创建会话</button>
      </div>`;
    document.getElementById('back').onclick = () => location.hash = '#/';
    document.getElementById('create').onclick = async () => {
      const p = document.getElementById('prompt').value.trim();
      if (!p) return;
      const body = { prompt: p };
      const platEl = document.getElementById('platform');
      if (platEl?.dataset.v?.trim()) body.platform = platEl.dataset.v.trim();
      const agentEl = document.getElementById('agent');
      if (agentEl?.dataset.v?.trim()) body.devin_mode = agentEl.dataset.v.trim();
      const btn = document.getElementById('create');
      btn.disabled = true; btn.textContent = '创建中…';
      try {
        const d = await apiPost('/sessions', body);
        // 走 org 默认创建时，响应里的 devin_mode 是解析结果——缓存供下拉显示
        if (!body.devin_mode && d?.devin_mode)
          localStorage.setItem('org_default_mode', d.devin_mode);
        // 新会话默认 ACU 上限 2（org 默认 5 偏高），后台异步设置不阻塞跳转
        if (acpEnabled() && d.session_id)
          acp.rpc('_cognition.ai/session-spending-limit/set',
            { session_id: addDevin(d.session_id), max_credits: 2 }).catch(() => { });
        location.hash = '#/s/' + stripDevin(d.session_id || '');
      } catch (e) {
        btn.disabled = false; btn.textContent = '创建会话';
        alert('创建失败: ' + e.message);
      }
    };
    // 自定义下拉：点面展开/收起，点项回填值；__custom 项弹输入框
    const bindDsel = (dsel) => {
      if (!dsel) return;
      dsel.querySelector('.dsel-face').onclick = (e) => {
        e.stopPropagation(); dsel.classList.toggle('open');
      };
      dsel.querySelectorAll('.dsel-opt').forEach(o => o.onclick = (e) => {
        e.stopPropagation();
        let v = o.dataset.v, n = o.dataset.n;
        if (v === '__custom') {
          v = prompt('平台 / outpost 池名')?.trim() || '';
          if (!v) { dsel.classList.remove('open'); return; }
          n = v;
        }
        dsel.dataset.v = v;
        dsel.querySelector('.dsel-txt').textContent = n;
        dsel.querySelectorAll('.dsel-opt').forEach(x => x.classList.toggle('cur', x === o));
        dsel.classList.remove('open');
      });
      document.addEventListener('click', (e) => {
        if (dsel.isConnected && dsel.classList.contains('open') && !dsel.contains(e.target))
          dsel.classList.remove('open');
      });
    };
    bindDsel(document.getElementById('platform'));
    const agentDsel = document.getElementById('agent');
    bindDsel(agentDsel);
    // 模型枚举动态刷新：先按 localStorage 缓存渲染，24h 探测一次跟进官方调整
    if (agentDsel) {
      let cache = null;
      try { cache = JSON.parse(localStorage.getItem('agent_modes') || 'null'); } catch {}
      const renderModes = (modes) => {
        const list = agentDsel.querySelector('.dsel-list');
        list.innerHTML = `<div class="dsel-opt cur" data-v="" data-n="${orgDefLabel()}">${orgDefLabel()}</div>` +
          modes.map(v => `<div class="dsel-opt" data-v="${esc(v)}" data-n="${esc(agentShort(v))}">${esc(AGENT_LABELS[v] || v)}</div>`).join('');
        bindDsel(agentDsel);
      };
      if (cache?.modes?.length) renderModes(cache.modes);
      if (!cache || Date.now() - cache.t > 86400000) {
        probeAgentModes().then(modes => {
          if (modes?.length && agentDsel.isConnected) {
            localStorage.setItem('agent_modes', JSON.stringify({ t: Date.now(), modes }));
            if (!cache?.modes || cache.modes.join() !== modes.join()) renderModes(modes);
          }
        }).catch(() => {});
      }
    }
    document.getElementById('prompt').focus();
  }

  /* ================= 启动 ================= */
  async function boot() {
    if (!DEMO) {
      try {
        const h = await fetch('/api/health').then(r => r.json());
        if (h.api_version) MODE = h.api_version;
        if (!h.api_key_configured) noKey = true;
        if (h.pat_configured) {
          const c = await fetch('/api/config').then(r => r.json());
          PAT = c.pat; ORG = c.org_id || h.org_id;
        }
      } catch (e) { /* 无配置 */ }
    }
    route();
  }
  boot();
})();
