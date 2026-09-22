/* Devin Mobile - PWA 客户端
   两种数据源：
   - REST 轮询（/api 代理 -> api.devin.ai，v1/v3 自动适配）——基础功能
   - ACP WebSocket 实时模式（浏览器直连 wss://app.devin.ai/api/acp/live，PAT 认证）——
     富会话列表(含模型)、session/resume 实时事件流、session/prompt 发送
*/
(() => {
  const app = document.getElementById('app');
  const DEMO = new URLSearchParams(location.search).has('demo');
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
    if (r.status === 401 && data.error === 'no_api_key') { noKey = true; throw new Error('no_api_key'); }
    if (!r.ok) throw new Error(data.detail || data.title || data.error || ('HTTP ' + r.status));
    return data;
  }
  const apiGet = (p) => api(p);
  const apiPost = (p, body) => api(p, { method: 'POST', body });

  /* ================= ACP WebSocket 层 ================= */
  const CAPS = {
    fs: { readTextFile: false, writeTextFile: false }, terminal: false,
    elicitation: { form: {} },
    _meta: {
      'cognition.ai/messageGrouping': true, 'cognition.ai/toolCallQuestions': true,
      'cognition.ai/sidechains': true, 'cognition.ai/replayBatch': true,
      'cognition.ai/wholeUserMessages': true,
    },
  };

  const acp = {
    ws: null, rpcId: 0, pending: new Map(), ready: null,
    updateHandlers: new Set(), requestHandlers: new Set(),

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
        ws.onclose = () => { this.ws = null; this.ready = null; this._rejectAll(new Error('ws closed')); };
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

    onUpdate(h) { this.updateHandlers.add(h); return () => this.updateHandlers.delete(h); },
    onRequest(h) { this.requestHandlers.add(h); return () => this.requestHandlers.delete(h); },
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
      unread: g('isUnread'), starred: g('isStarred'), archived: g('isArchived'),
      acu_limit: g('maxAcuLimit'),
      url: g('url'),
    };
  }

  async function fetchSessions() {
    if (acpEnabled()) {
      try {
        const list = await acp.listSessions();
        return list.map(normAcpSession);
      } catch (e) { /* fallthrough 到 REST */ }
    }
    const d = MODE === 'v3'
      ? await apiGet('/sessions?qs=' + encodeURIComponent(JSON.stringify({ first: 50 })))
      : await apiGet('/sessions?limit=50');
    const raw = MODE === 'v3' ? (d.items || []) : (d.sessions || []);
    return raw.map(normSession);
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
  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
  const isUserMsg = (m) => /user/i.test(m.type || '') || m.origin === 'user';
  const isDevinMsg = (m) => /devin|assistant|agent/i.test(m.type || '');

  /* ================= 路由 ================= */
  let currentUnsub = null;
  function route() {
    stopPoll();
    if (currentUnsub) { currentUnsub(); currentUnsub = null; }
    const h = location.hash || '#/';
    if (h.startsWith('#/s/')) renderChat(h.slice(4));
    else if (h === '#/new') renderNew();
    else renderList();
  }
  window.addEventListener('hashchange', route);

  /* ================= 会话列表 ================= */
  const sessHtml = (s) => `
    <div class="sess" data-id="${esc(s.session_id)}">
      <div class="body">
        <div class="title">${s.unread ? '<span class="unread-dot"></span>' : ''}${esc(s.title || s.session_id)}</div>
        ${s.excerpt ? `<div class="excerpt">${esc(s.excerpt).slice(0, 80)}</div>` : ''}
        <div class="meta">${pill(s.status_enum)}<span>${ago(s.updated_at)}</span>
          ${s.model ? `<span class="modeltag">${esc(s.model.replace(/^devin-/, ''))}</span>` : ''}
          ${s.pull_request?.url ? '<span class="pr">PR</span>' : ''}</div>
      </div>
    </div>`;
  const bindSess = () => document.querySelectorAll('.sess').forEach(el =>
    el.onclick = () => location.hash = '#/s/' + el.dataset.id);

  async function renderList() {
    app.innerHTML = `
      <div class="topbar"><h1>Devin Sessions${acpEnabled() ? ' <span class="livetag">LIVE</span>' : ''}</h1>
        <button class="iconbtn" id="refresh" title="刷新">⟳</button></div>
      ${noKey ? `<div class="banner">未配置 API key，可加 ?demo=1 看演示界面</div>` : ''}
      <div class="list" id="list"><div class="empty">加载中…</div></div>
      <button class="fab" id="fab" title="新会话">＋</button>`;
    document.getElementById('fab').onclick = () => location.hash = '#/new';
    document.getElementById('refresh').onclick = () => renderList();
    const paint = async () => {
      const list = (await fetchSessions()).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      const el = document.getElementById('list');
      if (!el) return;
      el.innerHTML = list.length ? list.map(sessHtml).join('')
        : '<div class="empty">没有可见会话。<br>＋ 新建一个，或注意：service user 只能看到自己创建的会话</div>';
      bindSess();
    };
    try {
      await paint();
      if (!acpEnabled()) pollTimer = setInterval(() => paint().catch(() => { }), 15000);
      else pollTimer = setInterval(() => paint().catch(() => { }), 30000); // ACP 下列表低频刷新兜底
    } catch (e) {
      document.getElementById('list').innerHTML =
        `<div class="err">${esc(e.message === 'no_api_key' ? '未配置 API key：请设置 DEVIN_API_KEY 或 config.json' : e.message)}</div>`;
    }
  }

  /* ================= 聊天视图（实时模式） ================= */
  // 把 ACP session/update 聚合成可渲染条目
  function makeEventStore() {
    const items = [];           // [{key,kind,title,text,status}]
    const byKey = new Map();
    const push = (e) => { items.push(e); byKey.set(e.key, e); return e; };
    const find = (k) => byKey.get(k);
    return { items, push, find };
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
    const eid = u.eventId || u.event_id || meta['cognition.ai/eventId'] || meta['cognition.ai/event_id'];
    const text = extractText(u);

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
    return store.items.map(it => {
      if (it.kind === 'user')
        return `<div class="msg user">${linkify(it.text)}</div>`;
      if (it.kind === 'devin')
        return `<div class="msg devin">${linkify(it.text)}</div>`;
      if (it.kind === 'thought')
        return `<div class="ev thought"><div class="head"><span class="chev">◆</span><span class="mono">thinking</span></div><div class="body mono">${esc(it.text).slice(0, 600)}</div></div>`;
      if (it.kind === 'tool') {
        const st = /complete|done|success/i.test(it.status || '') ? 'done' : /fail|error/i.test(it.status || '') ? 'err' : 'running';
        return `<div class="ev"><div class="head"><span class="chev">▸</span>
          <span class="mono">${esc(it.title)}</span>
          <span class="st ${st}">${st === 'done' ? 'Done' : st === 'err' ? 'Failed' : 'Running'}</span></div>
          ${it.text ? `<div class="body mono">${esc(it.text).slice(0, 500)}</div>` : ''}</div>`;
      }
      if (it.kind === 'plan')
        return `<div class="ev"><div class="head"><span class="chev">≡</span><span class="mono">plan</span></div><div class="body mono">${esc(it.text)}</div></div>`;
      return `<div class="ev"><div class="head"><span class="chev">▸</span><span class="mono">${esc(it.title)}</span></div><div class="body">${linkify(it.text)}</div></div>`;
    }).join('');
  }

  // REST 密集事件（GET /iapi/events/{sid}）映射进 store
  function applyDenseEvent(store, e) {
    const t = e.type || 'unknown';
    const eid = e.id || e.event_id;
    const msg = e.message ?? e.data?.message ?? '';
    if (eid && store.find(eid)) return;      // 与实时流/已加载历史去重
    if (t === 'user_message' || t === 'initial_user_message')
      store.push({ key: eid || 'h' + store.items.length, kind: 'user', text: msg });
    else if (t === 'devin_message')
      store.push({ key: eid || 'h' + store.items.length, kind: 'devin', text: msg });
    else if (t === 'thought_summary' || t === 'devin_thought' || t === 'agent_thought')
      store.push({ key: eid || 'h' + store.items.length, kind: 'thought', text: msg || e.data?.thought || '' });
    else if (t === 'status_update')
      store.statusText = msg || e.data?.status || '';
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
  function updateModelChip(store) {
    const btn = document.getElementById('modelchip');
    const bar = document.getElementById('chipsbar');
    const cfg = store.configs?.devin_version;
    if (!btn || !bar) return;
    if (!cfg) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    btn.innerHTML = esc(modelName(cfg)) + ' <span class="chev">▾</span>';
  }
  function showModelSheet(store, devinId) {
    const cfg = store.configs?.devin_version;
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
      updateModelChip(store);
      try { await acp.setConfig(devinId, 'devin_version', v); }
      catch (e) { alert('切换模型失败: ' + e.message); }
    });
    document.body.appendChild(mask);
  }

  /* ================= 聊天视图 ================= */
  function msgHtml(m) {
    if (isUserMsg(m))
      return `<div class="msg user">${linkify(m.message)}<div class="t">${fmtTime(m.timestamp)}</div></div>`;
    if (isDevinMsg(m))
      return `<div class="msg devin">${linkify(m.message)}<div class="t">${fmtTime(m.timestamp)}</div></div>`;
    const running = /running|start/i.test(m.type || '');
    return `<div class="ev"><div class="head"><span class="chev">▸</span>
      <span class="mono">${esc(m.type || 'event')}</span>
      <span class="st ${running ? 'running' : 'done'}">${running ? 'Running' : 'Done'}</span></div>
      <div class="body">${linkify(m.message)}</div></div>`;
  }

  async function renderChat(id) {
    app.innerHTML = `
      <div class="topbar">
        <button class="iconbtn" id="back">‹</button>
        <h1 id="title">…</h1><span id="pill"></span></div>
      <div class="chat" id="chat"></div>
      <div class="chipsbar" id="chipsbar" style="display:none">
        <button class="chip" id="modelchip"></button>
      </div>
      <div class="composer">
        <textarea id="inp" rows="1" placeholder="Steer while it works…"></textarea>
        <button class="sendbtn" id="send">↑</button>
      </div>`;
    document.getElementById('back').onclick = () => location.hash = '#/';
    const inp = document.getElementById('inp');
    let sendFn = async () => {};
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px'; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFn(); } });
    document.getElementById('send').onclick = () => sendFn();

    const chat = document.getElementById('chat');
    const scrollBottom = () => { chat.scrollTop = chat.scrollHeight; };

    if (acpEnabled()) {
      /* ---- 实时模式：ACP WebSocket ---- */
      const devinId = addDevin(id);
      const store = makeEventStore();
      let dirty = false;
      const repaint = () => {
        if (!dirty) return;
        dirty = false;
        const atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 80;
        chat.innerHTML = storeHtml(store) +
          (active(store.state) ? '<div class="statusline">Devin is working…</div>'
           : store.statusText ? `<div class="statusline">${esc(store.statusText)}</div>` : '');
        if (atBottom) scrollBottom();
        document.getElementById('pill').innerHTML =
          (store.mode ? `<span class="modeltag">${esc(String(store.mode).replace(/^devin-/, ''))}</span>` : '') +
          pill(store.state || 'working');
      };
      const unU = acp.onUpdate((params) => {
        if (stripDevin(params?.sessionId) !== id) return;
        applyUpdate(store, params);
        updateModelChip(store);
        dirty = true;
      });
      const raf = setInterval(repaint, 250);
      currentUnsub = () => { unU(); clearInterval(raf); };

      // 标题/状态从 REST 元数据拿；事件流走 WS
      fetchSessionRest(id).then(d => {
        document.getElementById('title').textContent = d.title || id;
        document.getElementById('pill').innerHTML = pill(d.status_enum);
      }).catch(() => {});

      // 历史：REST 密集事件（经本机 /iapi 代理注入 PAT，绕浏览器 CORS）
      chat.innerHTML = '<div class="statusline">加载历史…</div>';
      try {
        const hd = await fetch(`/iapi/events/${devinId}?limit=200&order=desc`).then(r => r.json());
        (hd.result || []).reverse().forEach(e => applyDenseEvent(store, e));
        dirty = true; repaint();
        scrollBottom();
      } catch (e) {
        console.warn('history load failed', e);
      }

      try {
        const r = await acp.resume(devinId);
        store.configs = {};
        (r?.configOptions || []).forEach(c => store.configs[c.configId] = c);
        updateModelChip(store);
        document.getElementById('modelchip').onclick = () => showModelSheet(store, devinId);
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
          await acp.prompt(devinId, text);
        } catch (e) {
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
          await load();
        } catch (e) {
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
  function renderNew() {
    app.innerHTML = `
      <div class="topbar"><button class="iconbtn" id="back">‹</button><h1>New Session</h1></div>
      <div class="newpane">
        <textarea id="prompt" placeholder="描述要让 Devin 做的任务…"></textarea>
        ${MODE === 'v3' ? `
        <label class="tip" for="mode">Agent 模式</label>
        <select id="mode" class="sel">
          <option value="">默认（org 配置）</option>
          <option value="normal">normal — 默认档</option>
          <option value="fast">fast — 快 ~2x，贵 ~4x</option>
          <option value="lite">lite — 轻量省钱</option>
          <option value="ultra">ultra — 最强</option>
          <option value="fusion">fusion — 多模型路由</option>
        </select>
        <label class="tip" for="platform">运行平台（留空=org 默认云 VM）</label>
        <input id="platform" class="sel" list="platforms" placeholder="windows / macos / outpost 池名…">
        <datalist id="platforms">
          <option value="linux"></option>
          <option value="windows"></option>
          <option value="macos"></option>
        </datalist>` : ''}
        <div class="tip">创建后将自动跳转到会话页，可继续发消息 steer。</div>
        <button class="bigbtn" id="create">创建会话</button>
      </div>`;
    document.getElementById('back').onclick = () => location.hash = '#/';
    document.getElementById('create').onclick = async () => {
      const p = document.getElementById('prompt').value.trim();
      if (!p) return;
      const body = { prompt: p };
      const modeEl = document.getElementById('mode');
      const platEl = document.getElementById('platform');
      if (modeEl?.value) body.devin_mode = modeEl.value;
      if (platEl?.value.trim()) body.platform = platEl.value.trim();
      const btn = document.getElementById('create');
      btn.disabled = true; btn.textContent = '创建中…';
      try {
        const d = await apiPost('/sessions', body);
        location.hash = '#/s/' + stripDevin(d.session_id || '');
      } catch (e) {
        btn.disabled = false; btn.textContent = '创建会话';
        alert('创建失败: ' + e.message);
      }
    };
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
