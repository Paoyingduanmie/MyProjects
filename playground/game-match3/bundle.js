(() => {
  var __defProp = Object.defineProperty;
  var __export = (target2, all) => {
    for (var name in all)
      __defProp(target2, name, { get: all[name], enumerable: true });
  };

  // src/render.js
  var render_exports = {};
  __export(render_exports, {
    GEM_COLORS: () => GEM_COLORS,
    GEM_PARTICLE_PALETTES: () => GEM_PARTICLE_PALETTES,
    MENU_COLUMN_MAX_W: () => MENU_COLUMN_MAX_W,
    boardCenterX: () => boardCenterX,
    boardRight: () => boardRight,
    buildAtlas: () => buildAtlas,
    clearFrame: () => clearFrame,
    contentRight: () => contentRight,
    ctxRef: () => ctxRef,
    drawBoard: () => drawBoard,
    drawBoardBg: () => drawBoardBg,
    drawButton: () => drawButton,
    drawHitButton: () => drawHitButton,
    drawPowerupSlot: () => drawPowerupSlot,
    drawText: () => drawText,
    ellipsize: () => ellipsize,
    fillTextEllipsized: () => fillTextEllipsized,
    getCellSize: () => getCellSize,
    getViewport: () => getViewport,
    layout: () => layout,
    menuColumn: () => menuColumn,
    resize: () => resize,
    responsiveFont: () => responsiveFont,
    roundRect: () => roundRect,
    screenToCell: () => screenToCell,
    setGemStyle: () => setGemStyle,
    setPanelWidth: () => setPanelWidth,
    setupCanvas: () => setupCanvas
  });

  // src/config.js
  var GRID = 8;
  var TYPES = 7;
  var DEFAULT_EMOJI = ["\u{1F7E5}", "\u{1F7E6}", "\u{1F7E9}", "\u{1F7E8}", "\u{1F7EA}", "\u2B1C", "\u2B1B"];
  var SHAPES_EMOJI = ["\u{1F534}", "\u{1F537}", "\u{1F340}", "\u2B50", "\u{1F49C}", "\u2B1C", "\u{1F319}"];
  var SPECIAL = {
    NONE: null,
    LINE_H: "LINE_H",
    LINE_V: "LINE_V",
    COLOR_BOMB: "COLOR_BOMB",
    AREA_BOMB: "AREA_BOMB",
    GRAVITY: "GRAVITY",
    TIME_BOMB: "TIME_BOMB",
    // Round 2: emoji-themed specials
    WILDCARD: "WILDCARD",
    // 🃏 — matches as any color
    COIN: "COIN",
    // 🪙 — 5× score on clear
    FIRE: "FIRE",
    // 🔥 — clears 4 neighbors on match (chain)
    LIGHTNING: "LIGHTNING",
    // ⚡ — clears 3 random same-color gems on match
    STAR: "STAR",
    // ⭐ — clusterbuster (top 2 colors); spawned from a 5-chain
    TIME_PLUS: "TIME_PLUS"
    // ⏱ — Blitz only: +2s on clear (passive; scene handles it)
  };
  var SPAWN_RATES = {
    GRAVITY: 200,
    TIME_BOMB: 300,
    WILDCARD: 220,
    COIN: 400,
    FIRE: 280,
    LIGHTNING: 350,
    AREA_BOMB: 500,
    // rare random top-spawn so casual players see one occasionally
    COLOR_BOMB: 600,
    STAR: 700
  };
  var BIG_WAVE_AREA_BOMB = 6;
  var BIG_WAVE_COLOR_BOMB = 7;
  var COIN_MULTIPLIER = 5;
  var STAR_CASCADE_TRIGGER = 3;
  var LIGHTNING_TARGETS = 3;
  var POWERUP_MILESTONE = 1500;
  var POWERUP_MAX_CHARGES = 3;
  var POWERUP_SLOTS = ["shuffle", "colorBlast", "bombDrop", "recolor", "undo"];
  var POWERUP_META = {
    shuffle: { emoji: "\u{1F500}", ring: "#7c3aed" },
    colorBlast: { emoji: "\u{1F4A5}", ring: "#ff5722" },
    bombDrop: { emoji: "\u{1F9E8}", ring: "#ff8a3d" },
    recolor: { emoji: "\u{1F3AF}", ring: "#26c6da" },
    undo: { emoji: "\u21A9\uFE0F", ring: "#8bc34a" }
    // rewinds to the board before your last move
  };
  var TIME_BOMB_START = 7;
  var TIMING = {
    SWAP: 180,
    REVERT: 180,
    CLEAR: 220,
    FALL: 280,
    SPAWN_POP: 240,
    FLIP: 200,
    // gravity-flip board rotate
    SLOWMO_MS: 300,
    // duration of slowmo at cascadeDepth >= 5
    HINT_AFTER: 3e4
    // ms idle before hint pulse — player has plenty of think time
  };
  var SLOWMO_FACTOR = 0.4;
  var SCORE = {
    PER_GEM_CLEARED: 10,
    CASCADE_MULTIPLIER: (depth) => 1 + (depth - 1) * 0.5,
    // 1x, 1.5x, 2x, 2.5x, ...
    BOMB_DEFUSE_BONUS: 500,
    SPECIAL_SPAWN_BONUS: 50
  };
  var PARTICLE_POOL = 512;
  var FLOATER_POOL = 32;
  var STORAGE_KEY = "gem-match:v1";
  var STORAGE_VERSION = 1;
  var NAME_MAX_LEN = 16;
  var SHAKE_MIN_DEPTH = 3;
  var SLOWMO_MIN_DEPTH = 5;
  var DAILY_MOVES = 30;
  var BLITZ_DURATION_MS = 6e4;
  var BLITZ_TIME_PLUS_RATE = 80;
  var BLITZ_TIME_PLUS_BONUS_MS = 2e3;
  var BLITZ_STREAK_WINDOW_MS = 3e3;
  var BLITZ_STREAK_MAX = 5;
  var BLITZ_STREAK_BONUS = 25;

  // src/particles.js
  var particles_exports = {};
  __export(particles_exports, {
    clear: () => clear,
    draw: () => draw,
    spawnBurst: () => spawnBurst,
    update: () => update
  });
  var GRAV = 8e-4;
  var DRAG = 0.998;
  var Particle = class {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.life = 0;
      this.maxLife = 1;
      this.color = "#fff";
      this.size = 4;
      this.alive = false;
    }
  };
  var pool = [];
  for (let i = 0; i < PARTICLE_POOL; i++) pool.push(new Particle());
  var nextDeadCursor = 0;
  var aliveCount = 0;
  function spawnBurst(x, y, color, count = 12, opts = {}) {
    var _a, _b, _c;
    const speed = (_a = opts.speed) != null ? _a : 0.35;
    const life = (_b = opts.life) != null ? _b : 700;
    const size = (_c = opts.size) != null ? _c : 5;
    const isArr = Array.isArray(color);
    for (let i = 0; i < count; i++) {
      const p = findDead();
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.6 + Math.random() * 0.8);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - 0.15;
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.color = isArr ? color[Math.random() * color.length | 0] : color;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.alive = true;
      aliveCount++;
    }
  }
  function findDead() {
    const start = nextDeadCursor;
    for (let n = 0; n < pool.length; n++) {
      const i = (start + n) % pool.length;
      if (!pool[i].alive) {
        nextDeadCursor = (i + 1) % pool.length;
        return pool[i];
      }
    }
    return null;
  }
  function update(dt) {
    if (aliveCount === 0) return;
    const dragFactor = Math.pow(DRAG, dt / 16);
    const gravStep = GRAV * dt;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        aliveCount--;
        continue;
      }
      p.vy += gravStep;
      p.vx *= dragFactor;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  function draw(ctx4) {
    if (aliveCount === 0) return;
    ctx4.save();
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.alive) continue;
      const alpha = Math.min(1, p.life / p.maxLife);
      if (alpha < 0.02) continue;
      ctx4.globalAlpha = alpha;
      ctx4.fillStyle = p.color;
      ctx4.beginPath();
      ctx4.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx4.fill();
    }
    ctx4.restore();
  }
  function clear() {
    for (let i = 0; i < pool.length; i++) pool[i].alive = false;
    nextDeadCursor = 0;
    aliveCount = 0;
  }

  // src/storage.js
  var storage_exports = {};
  __export(storage_exports, {
    exportString: () => exportString,
    flush: () => flush,
    getProfile: () => getProfile,
    getSettings: () => getSettings,
    importString: () => importString,
    load: () => load,
    recordPlayDay: () => recordPlayDay,
    reset: () => reset,
    saveAll: () => saveAll,
    saveKey: () => saveKey
  });

  // src/rng.js
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t2 = Math.imul(a ^ a >>> 15, 1 | a);
      t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2;
      return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
    };
  }
  function strHash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function dateHash(date = /* @__PURE__ */ new Date()) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const d = date.getDate().toString().padStart(2, "0");
    return strHash(`${y}-${m}-${d}`);
  }
  function todayISO(date = /* @__PURE__ */ new Date()) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, "0");
    const d = date.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // src/storage.js
  function defaultState() {
    return {
      version: STORAGE_VERSION,
      profile: {
        playerName: "\u73A9\u5BB6",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastPlayedMode: null
      },
      zen: {
        bestScore: 0,
        totalRunsPlayed: 0,
        lastPlayedAt: null,
        saveState: null,
        gallery: []
        // painting-mode keepsakes: [{ dataUrl, at }], newest first, capped
      },
      classic: {
        highestUnlocked: 1,
        levels: {},
        saveState: null
      },
      daily: {
        bestEver: 0,
        totalDaysPlayed: 0,
        history: {},
        todaySubmittedDate: null
      },
      blitz: {
        bestScore: 0,
        totalRunsPlayed: 0,
        lastPlayedAt: null
      },
      puzzle: {
        completed: {}
        // sparse: { "1": {bestScore, completedAt}, ... }
      },
      settings: {
        particleDensity: "high",
        haptic: true,
        eyes: true,
        paintingMode: false,
        sound: true,
        // procedural SFX + zen pad — see src/sound.js
        gemStyle: "color",
        // 'color' (colored squares) | 'shapes' (colorblind-friendly distinct silhouettes)
        language: "auto"
        // 'auto' | 'en' | 'es' — see src/i18n.js
      },
      playHistory: {},
      powerups: {
        charges: { shuffle: 0, colorBlast: 0, bombDrop: 0, recolor: 0, undo: 0 }
      },
      // Owned by src/achievements.js; listed here so deepMerge's type guards
      // cover it like every other subtree. Without a default, an import code or
      // hand-edited blob with achievements: {} (or unlocked: "x") passed straight
      // through and the next unlock()/bumpCounter() threw a TypeError.
      achievements: {
        unlocked: {},
        // { [id]: { at, shownAt } }
        counters: { totalMatches: 0 }
      }
    };
  }
  var MIGRATIONS = {
    // 1: (v1) => ({ ...v1, /* v2 shape */ }),
  };
  function migrate(blob, fromVersion) {
    let v = fromVersion;
    let out = blob;
    while (v < STORAGE_VERSION) {
      const step = MIGRATIONS[v];
      if (!step) throw new Error(`no migration from v${v} to v${v + 1}`);
      out = step(out);
      v++;
      out.version = v;
    }
    return out;
  }
  var cache = null;
  var _readOnly = false;
  function load() {
    if (cache) return cache;
    if (typeof localStorage === "undefined") {
      cache = defaultState();
      return cache;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        cache = defaultState();
        return cache;
      }
      const parsed = JSON.parse(raw);
      const rawVersion = Number(parsed.version);
      const versioned = Number.isInteger(rawVersion) && rawVersion > 0;
      const fromVersion = versioned ? rawVersion : STORAGE_VERSION;
      if (versioned && fromVersion > STORAGE_VERSION) {
        cache = defaultState();
        _readOnly = true;
        return cache;
      }
      let blob = parsed;
      if (fromVersion < STORAGE_VERSION) {
        try {
          localStorage.setItem(`${STORAGE_KEY}:v${fromVersion}:archive`, raw);
        } catch {
        }
        try {
          blob = migrate(parsed, fromVersion);
        } catch (err) {
          console.warn("storage.migrate incomplete, preserving data via deepMerge:", err);
          blob = parsed;
        }
      }
      cache = deepMerge(defaultState(), blob);
      cache.version = STORAGE_VERSION;
      if (!versioned || fromVersion < STORAGE_VERSION) saveAll();
      return cache;
    } catch (err) {
      console.warn("storage.load failed, resetting:", err);
      cache = defaultState();
      return cache;
    }
  }
  function deepMerge(base, overlay) {
    if (overlay == null) return base;
    if (base === null) return overlay;
    const baseIsPlainObj = typeof base === "object" && !Array.isArray(base);
    const overlayIsPlainObj = typeof overlay === "object" && !Array.isArray(overlay);
    if (baseIsPlainObj !== overlayIsPlainObj) return base;
    if (!baseIsPlainObj) return overlay;
    const out = { ...base };
    for (const k of Object.keys(overlay)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      if (k in base) out[k] = deepMerge(base[k], overlay[k]);
      else out[k] = overlay[k];
    }
    return out;
  }
  var _saveTimer = null;
  var _saveDirty = false;
  function saveAll() {
    if (!cache) cache = defaultState();
    if (typeof localStorage === "undefined") return;
    if (_readOnly) {
      _saveDirty = false;
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
      }
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (err) {
      console.warn("storage.saveAll failed (quota?):", err);
    }
    _saveDirty = false;
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
  }
  function scheduleSave() {
    _saveDirty = true;
    if (_saveTimer) return;
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      saveAll();
    }, 250);
  }
  function flush() {
    if (_saveDirty) saveAll();
  }
  function saveKey(topKey, patch) {
    const state = load();
    state[topKey] = { ...state[topKey], ...patch };
    scheduleSave();
  }
  function reset() {
    cache = defaultState();
    _readOnly = false;
    _saveDirty = false;
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("storage.reset failed:", err);
    }
  }
  var EXPORT_PREFIX = "JWLD1.";
  function exportString() {
    const bytes = new TextEncoder().encode(JSON.stringify(load()));
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return EXPORT_PREFIX + btoa(bin);
  }
  function importString(code) {
    try {
      const trimmed = String(code || "").trim();
      if (!trimmed.startsWith(EXPORT_PREFIX)) return { ok: false, reason: "format" };
      const bin = atob(trimmed.slice(EXPORT_PREFIX.length));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || typeof parsed !== "object" || !parsed.profile || !parsed.settings) {
        return { ok: false, reason: "shape" };
      }
      cache = deepMerge(defaultState(), parsed);
      cache.version = STORAGE_VERSION;
      _readOnly = false;
      saveAll();
      return { ok: true };
    } catch {
      return { ok: false, reason: "parse" };
    }
  }
  function getSettings() {
    return load().settings;
  }
  function getProfile() {
    return load().profile;
  }
  function recordPlayDay(scoreDelta = 0) {
    const today = todayISO();
    const state = load();
    const cur = state.playHistory[today] || { runs: 0, totalScore: 0 };
    state.playHistory[today] = {
      runs: cur.runs + 1,
      totalScore: cur.totalScore + (scoreDelta || 0)
    };
    scheduleSave();
  }

  // src/i18n.js
  var en = {
    // Common, reused everywhere
    "common.back": "\u8FD4\u56DE",
    "common.backShort": "\u2190",
    "common.close": "\u5173\u95ED",
    "common.ok": "\u597D",
    "common.cancel": "\u53D6\u6D88",
    "common.start": "\u5F00\u59CB",
    "common.retry": "\u21BB \u91CD\u8BD5",
    "common.again": "\u21BB \u518D\u6765",
    "common.title": "\u{1F3E0} \u4E3B\u9875",
    "common.share": "\u{1F4E4} \u5206\u4EAB",
    "common.next": "\u25B6 \u4E0B\u4E00\u6B65",
    "common.nextLevel": "\u25B6 \u4E0B\u4E00\u5173",
    "common.nextPuzzle": "\u25B6 \u4E0B\u4E00\u9898",
    "common.allPuzzles": "\u{1F4CB} \u5168\u90E8\u8C1C\u9898",
    "common.reshuffling": "\u6D17\u724C\u4E2D\u2026",
    "common.copiedToClipboard": "\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01",
    // Title scene
    "title.brand": "\u6D88\u6D88\u4E50",
    "title.welcomeBack": "{name}\uFF0C\u6B22\u8FCE\u56DE\u6765",
    "title.continueZen": "\u25B6 \u7EE7\u7EED\u7985\u5883",
    "title.continueClassic": "\u25B6 \u7EE7\u7EED\u95EF\u5173",
    "title.continueSubtitleClassic": "\u7B2C{level}\u5173 \xB7 {score}",
    "title.continueSubtitleZen": "{score} \u5206",
    "title.streak": "\u8FDE\u7EED\u6253\u5361",
    "title.viewSource": "\u67E5\u770B\u6E90\u7801",
    "title.zen": "\u{1F9D8}  \u7985\u5883",
    "title.classic": "\u{1F3AF}  \u95EF\u5173",
    "title.daily": "\u{1F4C5}  \u6BCF\u65E5",
    "title.blitz": "\u26A1  \u95EA\u7535",
    "title.puzzles": "\u{1F9E9}  \u89E3\u8C1C",
    "title.zenBest": "\u6700\u9AD8\uFF1A{score}",
    "title.zenEndless": "\u65E0\u5C3D\u6A21\u5F0F \xB7 \u603B\u6709\u89E3",
    "title.classicSubtitle": "\u7B2C {current} / {total} \u5173  \xB7  \u2605 {stars}",
    "title.dailySubtitle": "{date}",
    "title.dailySubtitleDone": "{date} \u2713",
    "title.blitzSubtitleBest": "60 \u79D2\u9650\u65F6  \xB7  \u6700\u9AD8\uFF1A{score}",
    "title.blitzSubtitle": "60 \u79D2\u9650\u65F6",
    "title.puzzlesSubtitle": "\u5DF2\u89E3 {done} / {total}",
    "title.stats": "\u{1F4CA}  \u7EDF\u8BA1",
    "title.settings": "\u2699  \u8BBE\u7F6E",
    // Settings overlay
    "settings.title": "\u8BBE\u7F6E",
    "settings.haptic": "\u9707\u52A8\u53CD\u9988",
    "settings.paintingMode": "\u6D82\u8272\u7985\u5883\u6A21\u5F0F",
    "settings.language": "\u8BED\u8A00",
    "settings.languageAuto": "\u81EA\u52A8",
    "settings.languageEn": "English",
    "settings.languageEs": "Espa\xF1ol",
    "settings.resetProgress": "\u{1F5D1} \u91CD\u7F6E\u8FDB\u5EA6",
    "settings.resetConfirm": "\u6E05\u9664\u5168\u90E8\u8FDB\u5EA6\u548C\u73A9\u5BB6\u540D\uFF1F",
    "settings.close": "\u5173\u95ED",
    // Name-entry modal (DOM)
    "name_entry.label": "\u7ED9\u81EA\u5DF1\u8D77\u4E2A\u540D\u5B57",
    "name_entry.start": "\u5F00\u59CB",
    // Zen HUD
    "zen.title": "\u{1F9D8} \u7985\u5883",
    "zen.end": "\u7ED3\u675F",
    "zen.endShort": "\u7ED3\u675F",
    "zen.savePaintingConfirm": "\u8981\u628A\u8FD9\u5C40\u7985\u5883\u7684\u753B\u9762\u5B58\u6210\u753B\u4F5C\u5417\uFF1F",
    // Classic HUD
    "classic.level": "\u7B2C {n} \u5173",
    "classic.moves": "\u6B65\u6570\uFF1A{n}",
    // Daily HUD
    "daily.title": "\u{1F4C5} \u6BCF\u65E5\u6311\u6218",
    "daily.movesLeft": "\u5269\u4F59\u6B65\u6570\uFF1A{n}",
    "daily.replayDoesNotCount": "\u91CD\u73A9\uFF08\u4E0D\u8BA1\u6210\u7EE9\uFF09",
    "daily.todayLabel": "{date}",
    // Combo floaters (cascade depth)
    "combo.2": "\u6F02\u4EAE\uFF01",
    "combo.3": "\u592A\u68D2\u4E86\uFF01",
    "combo.4": "\u8D85\u795E\uFF01",
    "combo.mega": "\u8D85\u7EA7 x{n}!",
    // Blitz HUD
    "blitz.title": "\u26A1 \u95EA\u7535",
    "blitz.seconds": "{n}\u79D2",
    // Result scene
    "result.classicWin": "\u8FC7\u5173\uFF01",
    "result.classicLose": "\u6B65\u6570\u7528\u5B8C",
    "result.classicSubtitleWin": "{score} \u5206\uFF08\u76EE\u6807 {target}\uFF09",
    "result.classicSubtitleLose": "{score} / {target}",
    "result.dailyHeader": "\u6BCF\u65E5\u6311\u6218 \u2014 {date}",
    "result.newBest": "\u{1F3C6} \u65B0\u7EAA\u5F55\uFF01",
    "result.bestEver": "\u5386\u53F2\u6700\u9AD8\uFF1A{score}",
    "result.blitzDone": "\u26A1 \u95EA\u7535\u7ED3\u675F",
    "result.best": "\u6700\u9AD8\uFF1A{score}",
    "result.puzzleWin": "\u{1F9E9} \u89E3\u5F00\u4E86\uFF01",
    "result.puzzleLose": "\u89E3\u8C1C\u5931\u8D25",
    "result.goalNotReached": "\u672A\u8FBE\u6210\u76EE\u6807",
    "result.runEnded": "\u672C\u5C40\u7ED3\u675F",
    "result.scorePts": "{score} \u5206",
    "result.shareDailyText": "\u6D88\u6D88\u4E50\u6BCF\u65E5 {date}\uFF1A{score} \u5206",
    // Level select
    "levelSelect.title": "\u95EF\u5173 \u2014 \u9009\u62E9\u5173\u5361",
    "levelSelect.page": "\u7B2C {page} / {total} \u9875",
    // Puzzle select
    "puzzleSelect.title": "\u{1F9E9} \u89E3\u8C1C",
    "puzzleSelect.solvedCount": "\u5DF2\u89E3 {done} / {total}",
    "puzzleSelect.tileMoves": { one: "{n} \u6B65", other: "{n} \u6B65" },
    "puzzleSelect.tileLabel": "#{id}  {name}",
    // Puzzle HUD
    "puzzle.title": "\u{1F9E9} {name}",
    "puzzle.moves": "\u6B65\u6570\uFF1A{n}",
    // Puzzle goals / progress
    "puzzle.goal.totalScore": "\u5F97\u5206 {amount}",
    "puzzle.goal.clearGemsOfColor": "\u6D88\u9664 {count} \u9897{color}\u5B9D\u77F3",
    "puzzle.goal.createSpecial": "\u5408\u6210 {count} \u4E2A{special}",
    "puzzle.goal.cascadeDepth": "\u89E6\u53D1 {depth} \u8FDE\u9501",
    "puzzle.progress.totalScore": "{score} / {amount}",
    "puzzle.progress.clearGemsOfColor": "{cleared} / {count}",
    "puzzle.progress.createSpecial": "{cleared} / {count}",
    "puzzle.progress.cascadeDepth": "\u6700\u9AD8\u8FDE\u9501\uFF1A{best} / {depth}",
    // Puzzle names + hints (per ID)
    "puzzle.1.name": "\u7B2C\u4E00\u6B65",
    "puzzle.1.hint": "\u4E09\u6D88\u5C31\u884C\uFF0C\u4F60\u53EF\u4EE5\u7684\u3002",
    "puzzle.2.name": "\u730E\u7EA2",
    "puzzle.2.hint": "\u6D88\u9664 10 \u9897\u7EA2\u8272\u5B9D\u77F3\u3002",
    "puzzle.3.name": "\u626B\u84DD",
    "puzzle.3.hint": "\u6D88\u9664 12 \u9897\u84DD\u8272\u5B9D\u77F3\u3002",
    "puzzle.4.name": "\u6392\u6210\u7EBF",
    "puzzle.4.hint": "\u8FDE\u7EED\u4E24\u6B21 4 \u8FDE\u6D88\u3002",
    "puzzle.5.name": "\u8FDE\u9501\u53CD\u5E94",
    "puzzle.5.hint": "\u89E6\u53D1\u4E00\u6B21 2 \u8FDE\u9501\u3002",
    "puzzle.6.name": "\u51B2\u523A\u5F97\u5206",
    "puzzle.6.hint": "10 \u6B65\u5185\u62FF\u5230 1,500 \u5206\u3002",
    "puzzle.7.name": "\u7830\uFF01",
    "puzzle.7.hint": "\u6446\u51FA T \u5F62\u6216 L \u5F62\u3002",
    "puzzle.8.name": "\u5F69\u8679\u51B2\u523A",
    "puzzle.8.hint": "\u6D88\u9664 15 \u9897\u7D2B\u8272\u5B9D\u77F3\u3002",
    "puzzle.9.name": "\u5F69\u8272\u70B8\u5F39",
    "puzzle.9.hint": "\u4E00\u6B21 5 \u8FDE\u6D88\u3002",
    "puzzle.10.name": "\u6DF1\u5C42\u8FDE\u9501",
    "puzzle.10.hint": "\u89E6\u53D1\u4E00\u6B21 3 \u8FDE\u9501\u3002",
    "puzzle.11.name": "\u9A6C\u62C9\u677E",
    "puzzle.11.hint": "\u7A33\u4F4F\u8282\u594F\u3002",
    "puzzle.12.name": "\u9020\u661F\u8005",
    "puzzle.12.hint": "3 \u8FDE\u9501\u4F1A\u751F\u6210\u661F\u661F\uFF0C\u518D\u6DF1\u4E00\u5C42\u3002",
    // Colors + specials (used by puzzle goal/progress strings)
    "color.0": "\u7EA2\u8272",
    "color.1": "\u84DD\u8272",
    "color.2": "\u7EFF\u8272",
    "color.3": "\u9EC4\u8272",
    "color.4": "\u7D2B\u8272",
    "color.5": "\u767D\u8272",
    "color.6": "\u9ED1\u8272",
    "special.lineGem": "\u76F4\u7EBF\u5B9D\u77F3",
    "special.colorBomb": "\u5F69\u8272\u70B8\u5F39",
    "special.areaBomb": "\u8303\u56F4\u70B8\u5F39",
    "special.star": "\u661F\u661F",
    "special.generic": "\u7279\u6B8A\u5B9D\u77F3",
    // Stats scene
    "stats.title": "\u7EDF\u8BA1\u4E0E\u6210\u5C31",
    "stats.unlockedSummary": "\u5DF2\u89E3\u9501 {unlocked} / {total}",
    "stats.totalGemsCleared": "\u7D2F\u8BA1\u6D88\u9664\u5B9D\u77F3",
    "stats.zenBestScore": "\u7985\u5883\u6700\u9AD8\u5206",
    "stats.zenRunsPlayed": "\u7985\u5883\u5C40\u6570",
    "stats.classicLevelsBeaten": "\u95EF\u5173\u5361\u6570",
    "stats.classicLevelsBeatenValue": "{n} / {total}",
    "stats.dailyChallengesCompleted": "\u5B8C\u6210\u6BCF\u65E5\u6311\u6218",
    "stats.blitzBestScore": "\u95EA\u7535\u6700\u9AD8\u5206",
    // Powerup overlay
    "powerup.shuffle.label": "\u6D17\u724C",
    "powerup.colorBlast.label": "\u540C\u8272\u6D88\u9664",
    "powerup.bombDrop.label": "\u6295\u5F39",
    "powerup.recolor.label": "\u6362\u8272",
    "powerup.targetHint": "{emoji}  {label} \u2014 \u70B9\u4E00\u9897\u5B9D\u77F3",
    "powerup.tapOutsideCancel": "\uFF08\u70B9\u76D8\u9762\u5916\u53D6\u6D88\uFF09",
    "powerup.pickColor": "\u9009\u4E00\u4E2A\u989C\u8272",
    "powerup.chargeEarned": "+1 \u6B21\u5145\u80FD\uFF01",
    "powerup.pickFill": "\u9009\u62E9\u8981\u5145\u80FD\u7684\u9053\u5177",
    "powerup.saveForLater": "\u6216\u7559\u7740\uFF08\u70B9\u5916\u90E8\u5173\u95ED\uFF09",
    // Screen-reader scene announcements (aria-live region — see main.js announce())
    "sr.scene.title": "\u4E3B\u83DC\u5355",
    "sr.scene.levelSelect": "\u9009\u5173",
    "sr.scene.puzzleSelect": "\u9009\u8C1C\u9898",
    "sr.scene.stats": "\u7EDF\u8BA1\u4E0E\u6210\u5C31",
    "sr.scene.result": "\u7ED3\u7B97\u9875",
    "sr.scene.gameZen": "\u7985\u5883\u5F00\u59CB",
    "sr.scene.gameClassic": "\u95EF\u5173\u5F00\u59CB",
    "sr.scene.gameDaily": "\u6BCF\u65E5\u6311\u6218\u5F00\u59CB",
    "sr.scene.gameBlitz": "\u95EA\u7535\u5F00\u59CB",
    "sr.scene.gamePuzzle": "\u89E3\u8C1C\u5F00\u59CB",
    // Achievement toast
    "achievement.unlocked": "\u89E3\u9501\u6210\u5C31",
    // Achievements (per ID — see src/achievements.js)
    "achievement.first_match.name": "\u521D\u6B21\u6D88\u9664",
    "achievement.first_match.desc": "\u5B8C\u6210\u7B2C\u4E00\u6B21\u6D88\u9664\u3002",
    "achievement.matches_100.name": "\u8FDE\u6D88\u597D\u624B",
    "achievement.matches_100.desc": "\u7D2F\u8BA1\u6D88\u9664 100 \u9897\u5B9D\u77F3\u3002",
    "achievement.matches_1000.name": "\u6D88\u9664\u5927\u5E08",
    "achievement.matches_1000.desc": "\u7D2F\u8BA1\u6D88\u9664 1,000 \u9897\u5B9D\u77F3\u3002",
    "achievement.matches_10000.name": "\u8FDE\u9501\u4E4B\u738B",
    "achievement.matches_10000.desc": "\u7D2F\u8BA1\u6D88\u9664 10,000 \u9897\u5B9D\u77F3\u3002",
    "achievement.cascade_3.name": "\u706B\u529B\u5168\u5F00",
    "achievement.cascade_3.desc": "\u89E6\u53D1\u4E00\u6B21 3 \u8FDE\u9501\u3002",
    "achievement.cascade_5.name": "\u661F\u661F\u8BDE\u751F",
    "achievement.cascade_5.desc": "\u89E6\u53D1\u4E00\u6B21 5 \u8FDE\u9501\u3002",
    "achievement.cascade_8.name": "\u52BF\u4E0D\u53EF\u6321",
    "achievement.cascade_8.desc": "\u89E6\u53D1\u4E00\u6B21 8 \u8FDE\u9501\u3002",
    "achievement.special_color.name": "\u5F69\u8272\u70B8\u5F39",
    "achievement.special_color.desc": "\u9996\u6B21\u5408\u6210\u5F69\u8272\u70B8\u5F39\u3002",
    "achievement.special_area.name": "\u5927\u7206\u70B8",
    "achievement.special_area.desc": "\u9996\u6B21\u5408\u6210\u8303\u56F4\u70B8\u5F39\u3002",
    "achievement.special_star.name": "\u661F\u5EA7",
    "achievement.special_star.desc": "\u9996\u6B21\u5408\u6210\u661F\u661F\u3002",
    "achievement.classic_l10.name": "\u5B66\u5F92",
    "achievement.classic_l10.desc": "\u901A\u8FC7\u7B2C 10 \u5173\u3002",
    "achievement.classic_l50.name": "\u9AD8\u624B",
    "achievement.classic_l50.desc": "\u901A\u8FC7\u7B2C 50 \u5173\u3002",
    "achievement.classic_l100.name": "\u5927\u5E08",
    "achievement.classic_l100.desc": "\u901A\u8FC7\u7B2C 100 \u5173\u3002",
    "achievement.classic_l200.name": "\u5B97\u5E08",
    "achievement.classic_l200.desc": "\u901A\u8FC7\u7B2C 200 \u5173\u3002",
    "achievement.first_zen.name": "\u5FC3\u5E73\u6C14\u548C",
    "achievement.first_zen.desc": "\u5B8C\u6210\u7B2C\u4E00\u5C40\u7985\u5883\u3002",
    "achievement.first_daily.name": "\u6BCF\u65E5\u4E60\u60EF",
    "achievement.first_daily.desc": "\u5B8C\u6210\u7B2C\u4E00\u6B21\u6BCF\u65E5\u6311\u6218\u3002",
    "achievement.first_blitz.name": "\u901F\u5EA6\u6076\u9B54",
    "achievement.first_blitz.desc": "\u5B8C\u6210\u7B2C\u4E00\u5C40\u95EA\u7535\u3002",
    "achievement.first_puzzle.name": "\u89E3\u8C1C\u4EBA",
    "achievement.first_puzzle.desc": "\u89E3\u5F00\u7B2C\u4E00\u9053\u8C1C\u9898\u3002",
    "achievement.score_zen_10k.name": "\u7985\u5883\u4E07\u5206",
    "achievement.score_zen_10k.desc": "\u5355\u5C40\u7985\u5883\u8FBE\u5230 10,000 \u5206\u3002",
    "achievement.score_zen_100k.name": "\u7985\u5883\u5341\u4E07",
    "achievement.score_zen_100k.desc": "\u5355\u5C40\u7985\u5883\u8FBE\u5230 100,000 \u5206\u3002",
    // === 2026-07 feature drop ===
    // New settings
    "settings.sound": "\u97F3\u6548",
    "settings.gemStyle": "\u5B9D\u77F3\u6837\u5F0F",
    "settings.gemStyleColor": "\u5F69\u8272",
    "settings.gemStyleShapes": "\u5F62\u72B6",
    "settings.gempedia": "\u{1F4D6} \u5B9D\u77F3\u56FE\u9274",
    "settings.exportSave": "\u{1F4E4} \u5BFC\u51FA\u5B58\u6863",
    "settings.importSave": "\u{1F4E5} \u5BFC\u5165\u5B58\u6863",
    "settings.exportCopied": "\u5B58\u6863\u7801\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01",
    "settings.exportManual": "\u4F60\u7684\u5B58\u6863\u7801\uFF08\u590D\u5236\u5B83\uFF09\uFF1A",
    "settings.importLabel": "\u7C98\u8D34\u5B58\u6863\u7801",
    "settings.importApply": "\u5BFC\u5165",
    "settings.importDone": "\u5B58\u6863\u5DF2\u5BFC\u5165\uFF01",
    "settings.importBad": "\u5B58\u6863\u7801\u65E0\u6548\u3002",
    // Undo power-up
    "powerup.undo.label": "\u64A4\u9500",
    // Daily meta
    "daily.streak": "\u{1F525} \u8FDE\u7EED {n} \u5929",
    "title.dailyNext": "{h}\u5C0F\u65F6{m}\u5206\u540E\u66F4\u65B0",
    "result.viewHistory": "\u{1F4C6} \u5386\u53F2",
    "dailyHistory.title": "\u{1F4C5} \u6BCF\u65E5\u5386\u53F2",
    "dailyHistory.empty": "\u8FD8\u6CA1\u73A9\u8FC7\u6BCF\u65E5\u6311\u6218",
    "dailyHistory.totalPlayed": "\u5DF2\u73A9 {n} \u6B21",
    // Daily leaderboard (optional backend — hidden when unavailable)
    "leaderboard.title": "\u{1F3C6} \u4ECA\u65E5\u6392\u884C",
    "leaderboard.rank": "\u4F60\u7684\u540D\u6B21\uFF1A#{rank}",
    "leaderboard.empty": "\u6765\u505A\u4ECA\u5929\u7684\u7B2C\u4E00\u540D\uFF01",
    // Blitz time bonus + speed streak
    "blitz.timeBonus": "+{n}\u79D2",
    "blitz.streak": "\u901F\u5EA6 x{n}",
    // Classic ice + boss levels
    "classic.ice": "\u{1F9CA} {n}",
    "classic.boss": "\u{1F451} BOSS",
    // Zen painting gallery
    "zen.gallery": "\u{1F5BC} \u753B\u5ECA",
    "gallery.title": "\u{1F5BC} \u7985\u5883\u753B\u4F5C",
    "gallery.empty": "\u7528\u6D82\u8272\u6A21\u5F0F\u73A9\u4E00\u5C40\u7985\u5883\u5C31\u80FD\u586B\u5145\u753B\u5ECA\u3002",
    // Stats additions
    "stats.biggestCascade": "\u6700\u5927\u8FDE\u9501",
    "stats.specialsCreated": "\u5408\u6210\u7279\u6B8A\u5B9D\u77F3",
    "stats.bombsDefused": "\u62C6\u9664\u70B8\u5F39",
    "stats.timePlayed": "\u6E38\u620F\u65F6\u957F",
    "stats.timeValue": "{h}\u5C0F\u65F6{m}\u5206",
    // New achievements
    "achievement.streak_3.name": "\u5E38\u5BA2",
    "achievement.streak_3.desc": "\u8FDE\u7EED 3 \u5929\u73A9\u6BCF\u65E5\u6311\u6218\u3002",
    "achievement.streak_7.name": "\u94C1\u6746",
    "achievement.streak_7.desc": "\u8FDE\u7EED 7 \u5929\u73A9\u6BCF\u65E5\u6311\u6218\u3002",
    "achievement.defuse_10.name": "\u62C6\u5F39\u5C0F\u961F",
    "achievement.defuse_10.desc": "\u62C6\u9664 10 \u9897\u5B9A\u65F6\u70B8\u5F39\u3002",
    "achievement.powerup_10.name": "\u5168\u526F\u6B66\u88C5",
    "achievement.powerup_10.desc": "\u4F7F\u7528 10 \u6B21\u9053\u5177\u5145\u80FD\u3002",
    // Hand-laid puzzles (13-15)
    "puzzle.13.name": "\u5341\u5B57",
    "puzzle.13.hint": "\u4E2D\u95F4\u60F3\u6210\u4E00\u4E2A T\u3002",
    "puzzle.14.name": "\u53CC\u5CF0",
    "puzzle.14.hint": "\u4E24\u7EC4 4 \u8FDE\u53EA\u5DEE\u4E00\u6B65\u3002",
    "puzzle.15.name": "\u5C06\u519B",
    "puzzle.15.hint": "\u53EA\u6709\u4E00\u6B65\u80FD\u8D62\uFF0C\u627E\u5230\u5B83\u3002",
    // Screen-reader extras
    "sr.scene.gempedia": "\u5B9D\u77F3\u56FE\u9274",
    "sr.scene.dailyHistory": "\u6BCF\u65E5\u5386\u53F2",
    "sr.scene.gallery": "\u7985\u5883\u753B\u4F5C",
    // Gempedia
    "gempedia.title": "\u5B9D\u77F3\u56FE\u9274",
    "gempedia.subtitle": "\u6240\u6709\u7279\u6B8A\u5B9D\u77F3\u4E0E\u9053\u5177",
    "gempedia.line.name": "\u76F4\u7EBF\u5B9D\u77F3",
    "gempedia.line.desc": "\u6D88\u9664\u65F6\u6E05\u7A7A\u6574\u884C\u6216\u6574\u5217\u3002",
    "gempedia.line.how": "4 \u8FDE\u6D88\u83B7\u5F97\u3002",
    "gempedia.colorBomb.name": "\u5F69\u8272\u70B8\u5F39",
    "gempedia.colorBomb.desc": "\u4E0E\u4EFB\u610F\u5B9D\u77F3\u4EA4\u6362\u53EF\u6E05\u7A7A\u8BE5\u989C\u8272\u7684\u6240\u6709\u5B9D\u77F3\uFF1B\u4E24\u9897\u4EA4\u6362\u53EF\u6E05\u7A7A\u5168\u76D8\u3002",
    "gempedia.colorBomb.how": "5 \u8FDE\u6D88\uFF0C\u6216\u4E00\u6CE2\u6D88\u9664 7+ \u9897\u83B7\u5F97\u3002",
    "gempedia.areaBomb.name": "\u8303\u56F4\u70B8\u5F39",
    "gempedia.areaBomb.desc": "\u6D88\u9664\u65F6\u70B8\u5F00\u5468\u56F4 3\xD73 \u533A\u57DF\u3002",
    "gempedia.areaBomb.how": "\u6446\u51FA T \u5F62\u6216 L \u5F62\u6D88\u9664\uFF0C\u6216\u4E00\u6CE2\u6D88\u9664 6+ \u9897\u83B7\u5F97\u3002",
    "gempedia.star.name": "\u661F\u661F",
    "gempedia.star.desc": "\u6E05\u9664\u76D8\u9762\u4E0A\u6570\u91CF\u6700\u591A\u7684\u4E24\u79CD\u989C\u8272\u7684\u5B9D\u77F3\u3002",
    "gempedia.star.how": "\u89E6\u53D1 3 \u8FDE\u9501\u83B7\u5F97\uFF1B\u4E5F\u4F1A\u968F\u673A\u6389\u843D\u3002",
    "gempedia.fire.name": "\u706B\u7130",
    "gempedia.fire.desc": "\u6D88\u9664\u65F6\u70E7\u6389\u4E0A\u4E0B\u5DE6\u53F3 4 \u9897\u5B9D\u77F3\u3002",
    "gempedia.fire.how": "\u9876\u90E8\u968F\u673A\u6389\u843D\u3002",
    "gempedia.lightning.name": "\u95EA\u7535",
    "gempedia.lightning.desc": "\u6D88\u9664\u65F6\u7535\u51FB\u540C\u8272\u968F\u673A 3 \u9897\u5B9D\u77F3\u3002",
    "gempedia.lightning.how": "\u9876\u90E8\u968F\u673A\u6389\u843D\u3002",
    "gempedia.wildcard.name": "\u4E07\u80FD\u5B9D\u77F3",
    "gempedia.wildcard.desc": "\u53EF\u5F53\u4F5C\u4EFB\u610F\u989C\u8272\u53C2\u4E0E\u6D88\u9664\u3002",
    "gempedia.wildcard.how": "\u9876\u90E8\u968F\u673A\u6389\u843D\u3002",
    "gempedia.coin.name": "\u91D1\u5E01",
    "gempedia.coin.desc": "\u6D88\u9664\u5B83\u7684\u90A3\u4E00\u6CE2\u5F97\u5206 \xD75\u3002",
    "gempedia.coin.how": "\u9876\u90E8\u968F\u673A\u6389\u843D\u3002",
    "gempedia.gravity.name": "\u91CD\u529B\u5B9D\u77F3",
    "gempedia.gravity.desc": "\u7FFB\u8F6C\u4E0B\u4E00\u6B21\u4E0B\u843D\u65B9\u5411\u2014\u2014\u5B9D\u77F3\u5411\u4E0A\u98DE\u3002",
    "gempedia.gravity.how": "\u9876\u90E8\u968F\u673A\u6389\u843D\u3002",
    "gempedia.timeBomb.name": "\u5B9A\u65F6\u70B8\u5F39",
    "gempedia.timeBomb.desc": "\u6BCF\u8D70\u4E00\u6B65\u5012\u8BA1\u65F6\u4E00\u6B21\uFF0C\u6D88\u9664\u5B83 +500 \u5206\uFF1B\u5F52\u96F6\u7206\u70B8\u2014\u2014\u95EF\u5173\u6A21\u5F0F\u6263 5 \u6B65\u3002",
    "gempedia.timeBomb.how": "\u9876\u90E8\u968F\u673A\u6389\u843D\uFF0C\u521D\u59CB\u4E3A 7\u3002",
    "gempedia.timePlus.name": "\u65F6\u95F4\u5B9D\u77F3",
    "gempedia.timePlus.desc": "\u95EA\u7535\u6A21\u5F0F\u6D88\u9664\u65F6 +2 \u79D2\u3002",
    "gempedia.timePlus.how": "\u4EC5\u95EA\u7535\u6A21\u5F0F\u6389\u843D\u3002",
    "gempedia.shuffle.name": "\u6D17\u724C",
    "gempedia.shuffle.desc": "\u91CD\u6392\u5168\u76D8\u5B9D\u77F3\u3002",
    "gempedia.shuffle.how": "\u6BCF 1500 \u5206\u83B7\u5F97 1 \u6B21\u5145\u80FD\uFF08\u6700\u591A 3 \u6B21\uFF09\u3002",
    "gempedia.colorBlast.name": "\u540C\u8272\u6D88\u9664",
    "gempedia.colorBlast.desc": "\u70B9\u4E00\u9897\u5B9D\u77F3\uFF0C\u6E05\u7A7A\u540C\u8272\u5168\u90E8\u5B9D\u77F3\u3002",
    "gempedia.colorBlast.how": "\u6BCF 1500 \u5206\u83B7\u5F97 1 \u6B21\u5145\u80FD\uFF08\u6700\u591A 3 \u6B21\uFF09\u3002",
    "gempedia.bombDrop.name": "\u6295\u5F39",
    "gempedia.bombDrop.desc": "\u70B9\u4E00\u9897\u5B9D\u77F3\u628A\u5B83\u53D8\u6210\u8303\u56F4\u70B8\u5F39\u3002",
    "gempedia.bombDrop.how": "\u6BCF 1500 \u5206\u83B7\u5F97 1 \u6B21\u5145\u80FD\uFF08\u6700\u591A 3 \u6B21\uFF09\u3002",
    "gempedia.recolor.name": "\u6362\u8272",
    "gempedia.recolor.desc": "\u70B9\u4E00\u9897\u5B9D\u77F3\u5E76\u7ED9\u5B83\u9009\u4E2A\u65B0\u989C\u8272\u3002",
    "gempedia.recolor.how": "\u6BCF 1500 \u5206\u83B7\u5F97 1 \u6B21\u5145\u80FD\uFF08\u6700\u591A 3 \u6B21\uFF09\u3002",
    "gempedia.undo.name": "\u64A4\u9500",
    "gempedia.undo.desc": "\u56DE\u9000\u5230\u4E0A\u4E00\u6B65\u4E4B\u524D\u7684\u76D8\u9762\u3002",
    "gempedia.undo.how": "\u6BCF 1500 \u5206\u83B7\u5F97 1 \u6B21\u5145\u80FD\uFF08\u6700\u591A 3 \u6B21\uFF09\u3002"
  };
  var DICTIONARIES = { en, zh: en };
  var _setting = "auto";
  var _locale = "en";
  var _nfCache = null;
  var _dfCache = null;
  var _dfOptsCache = /* @__PURE__ */ new Map();
  function init() {
    _setting = getSettings().language || "auto";
    _locale = resolveLocale(_setting);
    _nfCache = new Intl.NumberFormat(_locale);
    _dfCache = new Intl.DateTimeFormat(_locale, { year: "numeric", month: "short", day: "numeric" });
    _dfOptsCache.clear();
    syncDocumentLang();
  }
  function setLanguage(value) {
    if (value !== "auto" && value !== "en" && value !== "es") return;
    _setting = value;
    saveKey("settings", { language: value });
    const newLocale = resolveLocale(_setting);
    if (newLocale === _locale) return;
    _locale = newLocale;
    _nfCache = new Intl.NumberFormat(_locale);
    _dfCache = new Intl.DateTimeFormat(_locale, { year: "numeric", month: "short", day: "numeric" });
    _interpolateCache.clear();
    _dfOptsCache.clear();
    syncDocumentLang();
  }
  function syncDocumentLang() {
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.lang = _locale;
    }
  }
  function getLocale() {
    return _locale;
  }
  function t(key, vars) {
    var _a;
    if (key == null) {
      warnDev("i18n.t() called with empty key");
      return "";
    }
    const v = (_a = lookup(key, _locale)) != null ? _a : lookup(key, "en");
    if (v == null) return key;
    return vars ? interpolate(v, vars) : v;
  }
  function tn(key, count, vars) {
    var _a;
    if (key == null) {
      warnDev("i18n.tn() called with empty key");
      return "";
    }
    const entry2 = (_a = lookupRaw(key, _locale)) != null ? _a : lookupRaw(key, "en");
    if (entry2 == null || typeof entry2 !== "object") return t(key, { ...vars || {}, n: count });
    const tmpl = (count === 1 ? entry2.one : entry2.other) || entry2.other || entry2.one || key;
    return interpolate(tmpl, { ...vars || {}, n: count });
  }
  function formatNumber(n) {
    return _nfCache ? _nfCache.format(n) : String(n);
  }
  function formatDate(date, opts) {
    const normalized = normalizeDateInput(date);
    if (!(normalized instanceof Date) || Number.isNaN(normalized.getTime())) return String(date != null ? date : "");
    if (!_dfCache) return String(date);
    if (opts) {
      const key = JSON.stringify(opts);
      let fmt = _dfOptsCache.get(key);
      if (!fmt) {
        fmt = new Intl.DateTimeFormat(_locale, opts);
        _dfOptsCache.set(key, fmt);
      }
      return fmt.format(normalized);
    }
    return _dfCache.format(normalized);
  }
  function resolveLocale(setting) {
    return "zh";
  }
  function lookupRaw(key, locale) {
    const dict = DICTIONARIES[locale];
    return dict ? dict[key] : void 0;
  }
  function lookup(key, locale) {
    var _a;
    const raw = lookupRaw(key, locale);
    if (raw == null) return void 0;
    if (typeof raw === "object") return (_a = raw.other) != null ? _a : raw.one;
    return raw;
  }
  var _interpolateCache = /* @__PURE__ */ new Map();
  function interpolate(template, vars) {
    let key = template;
    for (const k in vars) key += "|" + k + "=" + vars[k];
    const cached = _interpolateCache.get(key);
    if (cached !== void 0) return cached;
    if (_interpolateCache.size > 256) _interpolateCache.clear();
    const out = template.replace(/\{(\w+)\}/g, (m, k) => vars[k] !== void 0 ? String(vars[k]) : m);
    _interpolateCache.set(key, out);
    return out;
  }
  function normalizeDateInput(date) {
    if (date instanceof Date) return date;
    if (typeof date === "string") {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    return new Date(date);
  }
  function warnDev(message) {
    if (typeof location !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      console.warn(message);
    }
  }

  // src/sound.js
  var MASTER_LEVEL = 0.85;
  var PAD_LEVEL = 0.05;
  var ctx = null;
  var master = null;
  var enabled = true;
  var noiseBuf = null;
  var pad = null;
  function unlock() {
    if (typeof AudioContext === "undefined" && typeof webkitAudioContext === "undefined") return;
    try {
      if (!ctx) {
        const AC = typeof AudioContext !== "undefined" ? AudioContext : webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = MASTER_LEVEL * (function(){var v=parseFloat(localStorage.getItem("pg_volume"));return isNaN(v)?1:v/100;})();
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") Promise.resolve(ctx.resume()).catch(() => {
      });
    } catch {
      ctx = null;
      master = null;
    }
  }
  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) stopZenPad();
  }
  function guarded(fn) {
    return (...args2) => {
      if (!enabled || !ctx) return;
      try {
        fn(...args2);
      } catch {
      }
    };
  }
  function tone(o) {
    const t0 = ctx.currentTime + (o.when || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.peak, t0 + (o.attack || 4e-3));
    g.gain.exponentialRampToValueAtTime(1e-3, t0 + o.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }
  function getNoiseBuffer() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function noise(o) {
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(o.from, t0);
    f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.peak, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(1e-3, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }
  var matchPop = guarded((depth = 1) => {
    const d = Math.min(Math.max(depth, 1), 8);
    const freq = 330 * Math.pow(2, (d - 1) / 6);
    tone({ type: "triangle", freq, dur: 0.14, peak: 0.28 });
    tone({ type: "sine", freq: freq * 2, dur: 0.09, peak: 0.08 });
  });
  var swapClick = guarded(() => {
    tone({ type: "sine", freq: 1900, dur: 0.035, peak: 0.12 });
  });
  var invalidBuzz = guarded(() => {
    tone({ type: "square", freq: 95, dur: 0.18, peak: 0.11 });
  });
  var WHOOSH = {
    line: { filter: "bandpass", from: 300, to: 2800, q: 1.2, dur: 0.3, peak: 0.5 },
    area: { filter: "lowpass", from: 2200, to: 150, q: 0.8, dur: 0.4, peak: 0.6 },
    color: { filter: "bandpass", from: 150, to: 3800, q: 1, dur: 0.6, peak: 0.65 },
    fire: { filter: "bandpass", from: 500, to: 1400, q: 2.5, dur: 0.45, peak: 0.5 },
    lightning: { filter: "highpass", from: 2500, to: 9e3, q: 1, dur: 0.16, peak: 0.55 },
    star: { filter: "bandpass", from: 400, to: 2400, q: 1.5, dur: 0.5, peak: 0.5, ping: 1568 }
  };
  var specialWhoosh = guarded((kind) => {
    const p = WHOOSH[kind] || WHOOSH.line;
    noise(p);
    if (p.ping) tone({ type: "sine", freq: p.ping, dur: 0.4, peak: 0.12 });
  });
  var bombTick = guarded(() => {
    tone({ type: "sine", freq: 1050, endFreq: 700, dur: 0.055, peak: 0.3, attack: 1e-3 });
  });
  var bombBoom = guarded(() => {
    tone({ type: "sine", freq: 130, endFreq: 45, dur: 0.5, peak: 0.85, attack: 2e-3 });
    noise({ filter: "lowpass", from: 900, to: 80, q: 0.7, dur: 0.45, peak: 0.7, attack: 2e-3 });
  });
  var powerupZap = guarded(() => {
    tone({ type: "sawtooth", freq: 220, endFreq: 950, dur: 0.14, peak: 0.18 });
  });
  var milestoneDing = guarded(() => {
    tone({ type: "triangle", freq: 1046.5, dur: 0.35, peak: 0.22 });
    tone({ type: "sine", freq: 2093, dur: 0.25, peak: 0.07 });
  });
  var achievementChime = guarded(() => {
    tone({ type: "triangle", freq: 659.3, dur: 0.18, peak: 0.2 });
    tone({ type: "triangle", freq: 987.8, dur: 0.32, peak: 0.2, when: 0.1 });
  });
  var uiTap = guarded(() => {
    tone({ type: "sine", freq: 1300, dur: 0.025, peak: 0.05 });
  });
  var winFanfare = guarded(() => {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      tone({ type: "triangle", freq, dur: i === 2 ? 0.5 : 0.16, peak: 0.24, when: i * 0.13 });
    });
  });
  var loseThud = guarded(() => {
    tone({ type: "sine", freq: 220, endFreq: 55, dur: 0.6, peak: 0.5, attack: 0.01 });
  });
  var timeUpHorn = guarded(() => {
    tone({ type: "sawtooth", freq: 349, endFreq: 311, dur: 0.7, peak: 0.16, attack: 0.03, detune: -8 });
    tone({ type: "sawtooth", freq: 349, endFreq: 311, dur: 0.7, peak: 0.16, attack: 0.03, detune: 8 });
  });
  var blitzTick = guarded(() => {
    tone({ type: "square", freq: 1150, dur: 0.045, peak: 0.14, attack: 1e-3 });
  });
  var startZenPad = guarded(() => {
    if (pad) return;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(PAD_LEVEL, t0 + 2.5);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 320;
    f.Q.value = 0.9;
    const a = ctx.createOscillator();
    a.type = "sine";
    a.frequency.value = 110;
    a.detune.value = -6;
    const b = ctx.createOscillator();
    b.type = "triangle";
    b.frequency.value = 110;
    b.detune.value = 7;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoAmp = ctx.createGain();
    lfoAmp.gain.value = 130;
    lfo.connect(lfoAmp);
    lfoAmp.connect(f.frequency);
    a.connect(f);
    b.connect(f);
    f.connect(g);
    g.connect(master);
    a.start(t0);
    b.start(t0);
    lfo.start(t0);
    pad = { oscs: [a, b, lfo], filter: f, lfoAmp, gain: g };
  });
  function stopZenPad() {
    if (!pad) return;
    const p = pad;
    pad = null;
    try {
      const t0 = ctx.currentTime;
      p.gain.gain.cancelScheduledValues(t0);
      p.gain.gain.setValueAtTime(p.gain.gain.value, t0);
      p.gain.gain.linearRampToValueAtTime(0, t0 + 0.6);
      for (const o of p.oscs) o.stop(t0 + 0.7);
      p.oscs[0].onended = () => {
        try {
          for (const o of p.oscs) o.disconnect();
          p.lfoAmp.disconnect();
          p.filter.disconnect();
          p.gain.disconnect();
        } catch {
        }
      };
    } catch {
    }
  }

  // src/floaters.js
  var Floater = class {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.x0 = 0;
      this.y0 = 0;
      this.targetX = null;
      this.targetY = null;
      this.text = "";
      this.life = 0;
      this.maxLife = 600;
      this.fontSize = 24;
      this.color = "#fff";
      this.alive = false;
      this.kind = "combo";
    }
  };
  var pool2 = [];
  for (let i = 0; i < FLOATER_POOL; i++) pool2.push(new Floater());
  var aliveCount2 = 0;
  function spawnForCascade(depth, x, y) {
    let text;
    let fontSize;
    if (depth <= 4) {
      text = t(`combo.${depth}`);
      fontSize = 28;
    } else {
      text = t("combo.mega", { n: depth });
      fontSize = 32 + Math.min(depth - 5, 8) * 2;
    }
    const f = findDead2();
    if (!f) return;
    if (!f.alive) aliveCount2++;
    f.x = x;
    f.y = y;
    f.x0 = x;
    f.y0 = y;
    f.targetX = null;
    f.targetY = null;
    f.text = text;
    f.life = f.maxLife = 700;
    f.fontSize = fontSize;
    f.color = depth >= 5 ? "#ffd700" : depth >= 4 ? "#ff88dd" : depth >= 3 ? "#88ddff" : "#ffffff";
    f.kind = "combo";
    f.alive = true;
  }
  function handleMatchCleared(cells, depth, deps) {
    const { render, particles, palettes, painting, haptic } = deps;
    const cs = render.getCellSize();
    let sumX = 0, sumY = 0;
    for (const { r, c, type } of cells) {
      const x = render.layout.boardX + c * cs + cs / 2;
      const y = render.layout.boardY + r * cs + cs / 2;
      particles.spawnBurst(x, y, palettes[type], 12);
      if (painting && painting.isEnabled()) {
        painting.brushAt(c * cs + cs / 2, r * cs + cs / 2, render.layout.boardSize, palettes[type][0]);
      }
      sumX += x;
      sumY += y;
    }
    const centerX = sumX / cells.length;
    const centerY = sumY / cells.length;
    const radius = Math.max(60, cs * Math.sqrt(cells.length) * 0.75);
    deps.waves.spawn(centerX, centerY, "rgba(255,255,255,0.55)", radius, 450);
    if (depth >= 2) spawnForCascade(depth, centerX, centerY - 40);
    if (haptic && navigator.vibrate) navigator.vibrate(15);
    matchPop(depth);
    return { x: centerX, y: centerY };
  }
  var WHOOSH_KIND = {
    [SPECIAL.LINE_H]: "line",
    [SPECIAL.LINE_V]: "line",
    [SPECIAL.AREA_BOMB]: "area",
    [SPECIAL.COLOR_BOMB]: "color",
    [SPECIAL.FIRE]: "fire",
    [SPECIAL.LIGHTNING]: "lightning",
    [SPECIAL.STAR]: "star"
  };
  function handleSpecialActivated(act, deps) {
    const { render, waves, bolts, particles, palettes, SPECIAL: SPECIAL2, haptic } = deps;
    const cs = render.getCellSize();
    const fromX = render.layout.boardX + act.c * cs + cs / 2;
    const fromY = render.layout.boardY + act.r * cs + cs / 2;
    const targets = act.targets || [];
    const toScreen = (t2) => ({
      x: render.layout.boardX + t2.c * cs + cs / 2,
      y: render.layout.boardY + t2.r * cs + cs / 2
    });
    switch (act.special) {
      case SPECIAL2.COLOR_BOMB: {
        waves.spawn(fromX, fromY, "rgba(255,255,255,0.9)", cs * 5, 600);
        waves.spawn(fromX, fromY, "rgba(180,210,255,0.7)", cs * 3.5, 500);
        break;
      }
      case SPECIAL2.LIGHTNING: {
        for (const t2 of targets) {
          const p = toScreen(t2);
          bolts.spawnLightning(fromX, fromY, p.x, p.y);
        }
        break;
      }
      case SPECIAL2.FIRE: {
        waves.spawn(fromX, fromY, "rgba(255,140,40,0.7)", cs * 1.8, 360);
        for (const t2 of targets) {
          const p = toScreen(t2);
          if (palettes) particles.spawnBurst(
            (fromX + p.x) / 2,
            (fromY + p.y) / 2,
            ["#ff5722", "#ff8a3d", "#ffd166"],
            8
          );
        }
        break;
      }
      case SPECIAL2.STAR: {
        for (const t2 of targets) {
          const p = toScreen(t2);
          bolts.spawnStarTrail(fromX, fromY, p.x, p.y);
        }
        break;
      }
      case SPECIAL2.AREA_BOMB: {
        waves.spawn(fromX, fromY, "rgba(255,138,61,0.85)", cs * 2.6, 420);
        break;
      }
      case SPECIAL2.LINE_H:
      case SPECIAL2.LINE_V: {
        waves.spawn(fromX, fromY, "rgba(200,220,255,0.6)", cs * 2, 320);
        break;
      }
    }
    if (haptic && navigator.vibrate) navigator.vibrate([0, 30, 20, 30]);
    specialWhoosh(WHOOSH_KIND[act.special] || "line");
  }
  function spawnText(x, y, text, color = "#ffffff", fontSize = 20) {
    const f = findDead2();
    if (!f) return;
    if (!f.alive) aliveCount2++;
    f.x0 = f.x = x;
    f.y0 = f.y = y;
    f.targetX = null;
    f.targetY = null;
    f.text = text;
    f.life = f.maxLife = 750;
    f.fontSize = fontSize;
    f.color = color;
    f.kind = "combo";
    f.alive = true;
  }
  function spawnScore(x, y, amount, targetX = null, targetY = null) {
    if (amount <= 0) return;
    const f = findDead2();
    if (!f) return;
    if (!f.alive) aliveCount2++;
    f.x0 = f.x = x;
    f.y0 = f.y = y;
    f.targetX = targetX;
    f.targetY = targetY;
    f.text = `+${formatNumber(amount)}`;
    f.life = f.maxLife = 850;
    f.fontSize = amount >= 500 ? 24 : amount >= 100 ? 20 : 17;
    f.color = amount >= 500 ? "#ffd166" : amount >= 100 ? "#a4ffa4" : "#ffffff";
    f.kind = "score";
    f.alive = true;
  }
  function findDead2() {
    for (let i = 0; i < pool2.length; i++) if (!pool2[i].alive) return pool2[i];
    let oldest = pool2[0];
    let oldestRatio = oldest.life / oldest.maxLife;
    for (let i = 1; i < pool2.length; i++) {
      const f = pool2[i];
      const r = f.life / f.maxLife;
      if (r < oldestRatio) {
        oldest = f;
        oldestRatio = r;
      }
    }
    oldest.alive = false;
    aliveCount2--;
    return oldest;
  }
  function update2(dt) {
    if (aliveCount2 === 0) return;
    for (let i = 0; i < pool2.length; i++) {
      const f = pool2[i];
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.alive = false;
        aliveCount2--;
        continue;
      }
      if (f.kind === "score" && f.targetX != null) {
        const k = 1 - f.life / f.maxLife;
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        f.x = f.x0 + (f.targetX - f.x0) * ease;
        f.y = f.y0 + (f.targetY - f.y0) * ease;
      } else {
        const rise = f.kind === "score" ? 56 : 40;
        f.y -= rise / f.maxLife * dt;
      }
    }
  }
  function draw2(ctx4) {
    if (aliveCount2 === 0) return;
    ctx4.save();
    ctx4.textAlign = "center";
    ctx4.textBaseline = "middle";
    for (let i = 0; i < pool2.length; i++) {
      const f = pool2[i];
      if (!f.alive) continue;
      const k = f.life / f.maxLife;
      const popK = 1 - f.life / f.maxLife;
      const scale = f.kind === "score" ? popK < 0.15 ? 0.6 + popK * 2.6 : 1 : popK < 0.2 ? 0.4 + popK * 3 : 1;
      ctx4.globalAlpha = Math.min(1, k * 1.5);
      ctx4.font = `bold ${Math.round(f.fontSize * scale)}px -apple-system, system-ui, sans-serif`;
      ctx4.fillStyle = "rgba(0,0,0,0.85)";
      ctx4.fillText(f.text, f.x + 2, f.y + 2);
      ctx4.fillStyle = f.color;
      ctx4.fillText(f.text, f.x, f.y);
    }
    ctx4.restore();
  }
  function clear2() {
    for (let i = 0; i < pool2.length; i++) pool2[i].alive = false;
    aliveCount2 = 0;
  }

  // src/waves.js
  var waves_exports = {};
  __export(waves_exports, {
    clear: () => clear3,
    draw: () => draw3,
    spawn: () => spawn,
    update: () => update3
  });
  var POOL_SIZE = 24;
  var Wave = class {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.t = 0;
      this.maxT = 420;
      this.startR = 8;
      this.endR = 80;
      this.color = "#fff";
      this.alive = false;
    }
  };
  var pool3 = [];
  for (let i = 0; i < POOL_SIZE; i++) pool3.push(new Wave());
  var aliveCount3 = 0;
  function spawn(x, y, color = "rgba(255,255,255,0.6)", endR = 80, duration = 420) {
    for (let i = 0; i < pool3.length; i++) {
      const w = pool3[i];
      if (!w.alive) {
        w.x = x;
        w.y = y;
        w.t = 0;
        w.maxT = duration;
        w.startR = 8;
        w.endR = endR;
        w.color = color;
        w.alive = true;
        aliveCount3++;
        return;
      }
    }
  }
  function update3(dt) {
    if (aliveCount3 === 0) return;
    for (let i = 0; i < pool3.length; i++) {
      const w = pool3[i];
      if (!w.alive) continue;
      w.t += dt;
      if (w.t >= w.maxT) {
        w.alive = false;
        aliveCount3--;
      }
    }
  }
  function draw3(ctx4) {
    if (aliveCount3 === 0) return;
    ctx4.save();
    for (let i = 0; i < pool3.length; i++) {
      const w = pool3[i];
      if (!w.alive) continue;
      const k = w.t / w.maxT;
      const r = w.startR + (w.endR - w.startR) * easeOutQuart(k);
      const alpha = (1 - k) * 0.55;
      if (alpha < 0.02) continue;
      ctx4.strokeStyle = w.color;
      ctx4.globalAlpha = alpha;
      ctx4.lineWidth = 2 + (1 - k) * 2;
      ctx4.beginPath();
      ctx4.arc(w.x, w.y, r, 0, Math.PI * 2);
      ctx4.stroke();
    }
    ctx4.restore();
  }
  function easeOutQuart(k) {
    return 1 - Math.pow(1 - k, 4);
  }
  function clear3() {
    for (let i = 0; i < pool3.length; i++) pool3[i].alive = false;
    aliveCount3 = 0;
  }

  // src/painting.js
  var painting_exports = {};
  __export(painting_exports, {
    brushAt: () => brushAt,
    clear: () => clear4,
    drawInto: () => drawInto,
    init: () => init2,
    isEnabled: () => isEnabled,
    setEnabled: () => setEnabled2,
    thumbnailDataURL: () => thumbnailDataURL,
    toBlob: () => toBlob
  });
  var canvas = null;
  var ctx2 = null;
  var enabled2 = false;
  function init2(width = 1080, height = 1080) {
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = new OffscreenCanvas(width, height);
      ctx2 = canvas.getContext("2d");
    }
    clear4();
  }
  function setEnabled2(v) {
    enabled2 = v;
  }
  function isEnabled() {
    return enabled2;
  }
  function clear4() {
    if (!ctx2) return;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
  }
  function brushAt(gridX, gridY, boardSize, color) {
    if (!enabled2 || !ctx2) return;
    const sx = gridX / boardSize * canvas.width;
    const sy = gridY / boardSize * canvas.height;
    const radius = (40 + Math.random() * 60) * (canvas.width / 1080);
    const jitter = (Math.random() - 0.5) * 30;
    const g = ctx2.createRadialGradient(sx + jitter, sy + jitter, 0, sx + jitter, sy + jitter, radius);
    g.addColorStop(0, hexToRgba(color, 0.55));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx2.fillStyle = g;
    ctx2.beginPath();
    ctx2.arc(sx + jitter, sy + jitter, radius, 0, Math.PI * 2);
    ctx2.fill();
  }
  function drawInto(targetCtx, x, y, w, h, alpha = 0.55) {
    if (!ctx2) return;
    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.drawImage(canvas, x, y, w, h);
    targetCtx.restore();
  }
  async function toBlob() {
    if (!canvas) return null;
    return await canvas.convertToBlob({ type: "image/png" });
  }
  async function thumbnailDataURL(size = 256) {
    if (!canvas) return null;
    try {
      const thumb = new OffscreenCanvas(size, size);
      const tctx = thumb.getContext("2d");
      tctx.fillStyle = "#0e0a1f";
      tctx.fillRect(0, 0, size, size);
      tctx.drawImage(canvas, 0, 0, size, size);
      const blob = await thumb.convertToBlob({ type: "image/jpeg", quality: 0.7 });
      return await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }
  function hexToRgba(hex, a) {
    if (hex.startsWith("#")) hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // src/bolts.js
  var bolts_exports = {};
  __export(bolts_exports, {
    clear: () => clear5,
    draw: () => draw4,
    spawnLightning: () => spawnLightning,
    spawnStarTrail: () => spawnStarTrail,
    update: () => update4
  });
  var POOL_SIZE2 = 32;
  var Bolt = class {
    constructor() {
      this.x1 = 0;
      this.y1 = 0;
      this.x2 = 0;
      this.y2 = 0;
      this.points = null;
      this.t = 0;
      this.maxT = 320;
      this.color = "#fff";
      this.width = 3;
      this.glowColor = "rgba(255,255,255,0.5)";
      this.alive = false;
    }
  };
  var pool4 = [];
  for (let i = 0; i < POOL_SIZE2; i++) pool4.push(new Bolt());
  var aliveCount4 = 0;
  function findDead3() {
    for (let i = 0; i < pool4.length; i++) if (!pool4[i].alive) return pool4[i];
    return pool4[0];
  }
  function buildPath(x1, y1, x2, y2, jitter) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const segs = Math.max(4, Math.floor(dist / 28));
    const pts = [x1, y1];
    const px = -dy / (dist || 1);
    const py = dx / (dist || 1);
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      const j = (Math.random() - 0.5) * jitter;
      pts.push(x1 + dx * k + px * j, y1 + dy * k + py * j);
    }
    pts.push(x2, y2);
    return pts;
  }
  function spawnLightning(x1, y1, x2, y2) {
    const b = findDead3();
    if (!b.alive) aliveCount4++;
    b.x1 = x1;
    b.y1 = y1;
    b.x2 = x2;
    b.y2 = y2;
    b.points = buildPath(x1, y1, x2, y2, 16);
    b.t = 0;
    b.maxT = 340;
    b.color = "#ffffff";
    b.glowColor = "rgba(255, 235, 100, 0.65)";
    b.width = 3;
    b.alive = true;
  }
  function spawnStarTrail(x1, y1, x2, y2) {
    const b = findDead3();
    if (!b.alive) aliveCount4++;
    b.x1 = x1;
    b.y1 = y1;
    b.x2 = x2;
    b.y2 = y2;
    b.points = buildPath(x1, y1, x2, y2, 6);
    b.t = 0;
    b.maxT = 460;
    b.color = "#ffe48a";
    b.glowColor = "rgba(255, 215, 0, 0.55)";
    b.width = 4;
    b.alive = true;
  }
  function update4(dt) {
    if (aliveCount4 === 0) return;
    for (let i = 0; i < pool4.length; i++) {
      const b = pool4[i];
      if (!b.alive) continue;
      b.t += dt;
      if (b.t >= b.maxT) {
        b.alive = false;
        aliveCount4--;
      }
    }
  }
  function draw4(ctx4) {
    if (aliveCount4 === 0) return;
    ctx4.save();
    for (let i = 0; i < pool4.length; i++) {
      const b = pool4[i];
      if (!b.alive || !b.points) continue;
      const k = b.t / b.maxT;
      const alpha = 1 - k;
      if (alpha < 0.02) continue;
      ctx4.globalAlpha = alpha * 0.6;
      ctx4.strokeStyle = b.glowColor;
      ctx4.lineWidth = b.width * 3;
      ctx4.lineCap = "round";
      ctx4.beginPath();
      ctx4.moveTo(b.points[0], b.points[1]);
      for (let p = 2; p < b.points.length; p += 2) ctx4.lineTo(b.points[p], b.points[p + 1]);
      ctx4.stroke();
      ctx4.globalAlpha = alpha;
      ctx4.strokeStyle = b.color;
      ctx4.lineWidth = b.width;
      ctx4.beginPath();
      ctx4.moveTo(b.points[0], b.points[1]);
      for (let p = 2; p < b.points.length; p += 2) ctx4.lineTo(b.points[p], b.points[p + 1]);
      ctx4.stroke();
    }
    ctx4.restore();
  }
  function clear5() {
    for (let i = 0; i < pool4.length; i++) pool4[i].alive = false;
    aliveCount4 = 0;
  }

  // src/input.js
  var canvas2 = null;
  var listeners = { onTapCell: null, onMove: null, onUp: null, onWheel: null, onCancel: null };
  var lastPointerX = 0;
  var lastPointerY = 0;
  var activePointerId = null;
  var pointerIsDown = false;
  function setup() {
    canvas2 = document.getElementById("game");
    canvas2.addEventListener("pointerdown", onPointerDown);
    canvas2.addEventListener("pointermove", onPointerMove);
    canvas2.addEventListener("pointerup", onPointerUp);
    canvas2.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", () => onPointerCancel());
    canvas2.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas2.addEventListener("wheel", onWheel, { passive: false });
  }
  function onWheel(e) {
    if (listeners.onWheel) {
      e.preventDefault();
      listeners.onWheel(e.deltaY, e.clientX, e.clientY);
    }
  }
  function on(events) {
    Object.assign(listeners, events);
  }
  function onPointerDown(e) {
    if (activePointerId !== null) return;
    const x = e.clientX, y = e.clientY;
    lastPointerX = x;
    lastPointerY = y;
    activePointerId = e.pointerId;
    pointerIsDown = true;
    try {
      canvas2.setPointerCapture(e.pointerId);
    } catch {
    }
    const cell = screenToCell(x, y);
    if (listeners.onTapCell) listeners.onTapCell(cell, x, y);
  }
  function onPointerMove(e) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    if (listeners.onMove) listeners.onMove(e.clientX, e.clientY);
  }
  function onPointerUp(e) {
    if (activePointerId !== e.pointerId) return;
    try {
      canvas2.releasePointerCapture(e.pointerId);
    } catch {
    }
    activePointerId = null;
    pointerIsDown = false;
    if (listeners.onUp) listeners.onUp(e.clientX, e.clientY);
  }
  function onPointerCancel(e) {
    if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
    if (e && activePointerId === e.pointerId) {
      try {
        canvas2.releasePointerCapture(e.pointerId);
      } catch {
      }
    }
    activePointerId = null;
    pointerIsDown = false;
    if (listeners.onCancel) listeners.onCancel(lastPointerX, lastPointerY);
  }
  function isPointerDown() {
    return pointerIsDown;
  }
  function hitTest(b, x, y) {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }
  function createPressTracker() {
    let pending = null;
    return {
      // 'down' over an activateOnUp button: remember it, fire nothing yet.
      arm(button) {
        pending = button;
      },
      // 'up': fire only if the release lands on the button the press started on.
      // A press released elsewhere, or one that started elsewhere, is dropped.
      release(x, y) {
        const b = pending;
        pending = null;
        if (b && hitTest(b, x, y)) b.onClick();
      },
      // pointercancel (OS gesture, blur) or a scene change: drop the press.
      cancel() {
        pending = null;
      }
    };
  }

  // src/debugHud.js
  var counters = {
    findMatches: 0,
    drawBoard: 0
  };
  var enabled3 = false;
  function setEnabled3(v) {
    enabled3 = v;
  }
  var _activeCascade = null;
  function setActiveCascade(c) {
    _activeCascade = c;
  }
  function activeCascade() {
    return _activeCascade;
  }
  function resetFrameCounters() {
    counters.findMatches = 0;
    counters.drawBoard = 0;
  }
  var WINDOW = 120;
  var buf = new Float64Array(WINDOW);
  var bufN = 0;
  var bufHead = 0;
  function recordFrame(dtMs) {
    buf[bufHead] = dtMs;
    bufHead = (bufHead + 1) % WINDOW;
    if (bufN < WINDOW) bufN++;
  }
  var scratch = new Float64Array(WINDOW);
  function frameStats() {
    if (bufN === 0) return { fps: 0, p95: 0, avg: 0 };
    let sum = 0;
    for (let i = 0; i < bufN; i++) {
      const v = buf[i];
      scratch[i] = v;
      sum += v;
    }
    const slice = scratch.subarray(0, bufN);
    slice.sort();
    const p95idx = Math.min(bufN - 1, Math.floor(bufN * 0.95));
    const p95 = slice[p95idx];
    const avg = sum / bufN;
    const fps = avg > 0 ? 1e3 / avg : 0;
    return { fps, p95, avg };
  }

  // src/render.js
  var reducedMotion = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  if (typeof window !== "undefined" && window.matchMedia) {
    const _rmQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const _onReducedMotion = (e) => {
      reducedMotion = e.matches;
    };
    if (_rmQuery.addEventListener) _rmQuery.addEventListener("change", _onReducedMotion);
    else if (_rmQuery.addListener) _rmQuery.addListener(_onReducedMotion);
  }
  var canvas3 = null;
  var ctx3 = null;
  var DPR = 1;
  var viewportW = 0;
  var viewportH = 0;
  var atlas = null;
  var atlasCellPx = 0;
  var bgLayer = null;
  var bgLayerKey = "";
  var vignetteLayer = null;
  var vignetteKey = "";
  var resizeRaf = 0;
  var badgeCache = /* @__PURE__ */ new Map();
  var colorBombCache = /* @__PURE__ */ new Map();
  var timeBombCache = /* @__PURE__ */ new Map();
  var lineHCache = /* @__PURE__ */ new Map();
  var lineVCache = /* @__PURE__ */ new Map();
  var gravityCache = /* @__PURE__ */ new Map();
  var ellipsizeCache = /* @__PURE__ */ new Map();
  var _fontCache = /* @__PURE__ */ new Map();
  function fontString(sizePx, family = "-apple-system, system-ui, sans-serif", weight = "") {
    const key = weight + "|" + sizePx + "|" + family;
    let s = _fontCache.get(key);
    if (s) return s;
    s = (weight ? weight + " " : "") + sizePx + "px " + family;
    _fontCache.set(key, s);
    return s;
  }
  var layout = {
    cellSize: 64,
    boardSize: 64 * 8,
    boardX: 0,
    boardY: 0,
    hudH: 80,
    // height of the reserved HUD strip above the board
    hudY: 16,
    // y of the HUD content start
    hudRowH: 28,
    // vertical spacing of HUD rows
    safeTop: 0,
    // env(safe-area-inset-top) — non-zero on PWA / standalone
    isNarrow: false,
    // viewport < 480px width
    panelSize: 0,
    // requested power-up panel thickness; 0 = no panel
    panelSide: "right",
    // 'right' on wide viewports, 'bottom' when narrow
    panelW: 0,
    // reserved column on right (set when panelSide === 'right')
    panelH: 0,
    // reserved strip at bottom (set when panelSide === 'bottom')
    panelX: 0,
    // left edge of right-side panel
    panelY: 0
    // top edge of bottom panel
  };
  var GEM_COLORS = ["#e94560", "#5468ff", "#5fd068", "#ffd166", "#b14aed", "#dddddd", "#444444"];
  var GEM_PARTICLE_PALETTES = GEM_COLORS.map((hex) => [
    hex,
    shadeHex(hex, 0.3),
    shadeHex(hex, -0.3)
  ]);
  function shadeHex(hex, amount) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = clamp255(parseInt(h.slice(0, 2), 16) + amount * 255);
    const g = clamp255(parseInt(h.slice(2, 4), 16) + amount * 255);
    const b = clamp255(parseInt(h.slice(4, 6), 16) + amount * 255);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function clamp255(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }
  function setupCanvas() {
    canvas3 = document.getElementById("game");
    ctx3 = canvas3.getContext("2d");
    resize();
    window.addEventListener("resize", scheduleResize);
    window.addEventListener("orientationchange", scheduleResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleResize);
  }
  function scheduleResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      resize();
      buildAtlas();
    });
  }
  function resize() {
    if (!canvas3) return;
    DPR = Math.max(1, window.devicePixelRatio || 1);
    viewportW = Math.max(1, window.innerWidth);
    viewportH = Math.max(1, window.innerHeight);
    canvas3.width = Math.ceil(viewportW * DPR);
    canvas3.height = Math.ceil(viewportH * DPR);
    canvas3.style.width = viewportW + "px";
    canvas3.style.height = viewportH + "px";
    ctx3.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout.isNarrow = viewportW < 480;
    const safeTop = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sat")
    ) || 0;
    layout.safeTop = safeTop;
    const safeBottom = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sab")
    ) || 0;
    layout.safeBottom = safeBottom;
    layout.hudY = 22 + safeTop;
    layout.hudH = (layout.isNarrow ? 80 : 96) + safeTop;
    layout.hudRowH = 28;
    if (layout.panelSize > 0) {
      if (layout.isNarrow) {
        layout.panelSide = "bottom";
        layout.panelW = 0;
        layout.panelH = layout.panelSize;
      } else {
        layout.panelSide = "right";
        layout.panelW = layout.panelSize;
        layout.panelH = 0;
      }
    } else {
      layout.panelSide = "right";
      layout.panelW = 0;
      layout.panelH = 0;
    }
    const panelGap = layout.panelSide === "right" && layout.panelW > 0 ? 10 : 0;
    const availW = Math.max(1, viewportW - layout.panelW - panelGap);
    const availH = Math.max(1, viewportH - layout.hudH - 20 - layout.panelH - safeBottom);
    const minDim = Math.max(1, Math.min(availW - 16, availH));
    layout.cellSize = Math.max(1, Math.floor(minDim * 0.98 / GRID));
    layout.boardSize = layout.cellSize * GRID;
    const unitW = layout.boardSize + panelGap + layout.panelW;
    layout.boardX = Math.floor((viewportW - unitW) / 2);
    layout.boardY = layout.hudH + Math.floor((availH - layout.boardSize) / 2);
    layout.panelX = layout.boardX + layout.boardSize + panelGap;
    layout.panelY = layout.boardY + layout.boardSize + 10;
    bgLayer = null;
    bgLayerKey = "";
    vignetteLayer = null;
    vignetteKey = "";
    badgeCache.clear();
    colorBombCache.clear();
    timeBombCache.clear();
    lineHCache.clear();
    lineVCache.clear();
    gravityCache.clear();
    ellipsizeCache.clear();
  }
  function setPanelWidth(px) {
    if (layout.panelSize === px) return;
    layout.panelSize = px;
    resize();
    buildAtlas();
  }
  var fluentCache = /* @__PURE__ */ new Map();
  var fluentInflight = /* @__PURE__ */ new Map();
  var fluentFailed = /* @__PURE__ */ new Set();
  var FLUENT_NAME = {
    "\u{1F7E5}": "Red square",
    "\u{1F7E6}": "Blue square",
    "\u{1F7E9}": "Green square",
    "\u{1F7E8}": "Yellow square",
    "\u{1F7EA}": "Purple square",
    "\u2B1C": "White large square",
    "\u2B1B": "Black large square",
    // Special overlays (used by drawSpecialOverlay → drawEmojiBadge)
    "\u{1F4A5}": "Collision",
    "\u{1F525}": "Fire",
    "\u26A1": "High voltage",
    "\u2B50": "Star",
    "\u{1F0CF}": "Joker"
  };
  function fluentUrl(name) {
    const file = name.toLowerCase().replace(/ /g, "_") + "_color.svg";
    return `icons/emoji/${file}`;
  }
  function loadFluent(emoji) {
    if (fluentCache.has(emoji)) return Promise.resolve(fluentCache.get(emoji));
    if (fluentInflight.has(emoji)) return fluentInflight.get(emoji);
    if (fluentFailed.has(emoji)) return Promise.resolve(null);
    const name = FLUENT_NAME[emoji];
    if (!name) return Promise.resolve(null);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        fluentCache.set(emoji, img);
        fluentInflight.delete(emoji);
        resolve(img);
      };
      img.onerror = (e) => {
        fluentInflight.delete(emoji);
        fluentFailed.add(emoji);
        reject(e);
      };
      img.src = fluentUrl(name);
    });
    fluentInflight.set(emoji, p);
    return p;
  }
  var CUSTOM_GLYPHS = /* @__PURE__ */ new Map([
    ["\u{1F319}", drawMoonToken]
  ]);
  function drawMoonToken(actx, slotPx, slotIndex) {
    const cx = slotIndex * slotPx + slotPx / 2;
    const cy = slotPx / 2;
    const backing = "rgba(232, 232, 242, 0.95)";
    actx.save();
    actx.fillStyle = backing;
    actx.beginPath();
    actx.arc(cx, cy, slotPx * 0.44, 0, Math.PI * 2);
    actx.fill();
    actx.fillStyle = "#3d3d46";
    actx.beginPath();
    actx.arc(cx, cy, slotPx * 0.28, 0, Math.PI * 2);
    actx.fill();
    actx.fillStyle = backing;
    actx.beginPath();
    actx.arc(cx + slotPx * 0.14, cy - slotPx * 0.1, slotPx * 0.24, 0, Math.PI * 2);
    actx.fill();
    actx.restore();
  }
  function drawEmojiFallback(actx, slotPx, slotIndex, emoji) {
    actx.save();
    actx.font = `${Math.floor(slotPx * 0.78)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    actx.fillText(emoji, slotIndex * slotPx + slotPx / 2, slotPx / 2 + slotPx * 0.04);
    actx.restore();
  }
  var gemEmojiSet = DEFAULT_EMOJI;
  function setGemStyle(style) {
    const next = style === "shapes" ? SHAPES_EMOJI : DEFAULT_EMOJI;
    if (next === gemEmojiSet) return;
    gemEmojiSet = next;
    buildAtlas();
  }
  function buildAtlas() {
    if (layout.cellSize <= 0 || !DPR || DPR <= 0) return;
    const slotPx = Math.max(1, Math.ceil(layout.cellSize * DPR));
    atlasCellPx = slotPx;
    const w = slotPx * gemEmojiSet.length;
    const h = slotPx;
    atlas = new OffscreenCanvas(w, h);
    const actx = atlas.getContext("2d");
    actx.clearRect(0, 0, w, h);
    const atlasAtBuild = atlas;
    for (let i = 0; i < gemEmojiSet.length; i++) {
      const emoji = gemEmojiSet[i];
      const painter = CUSTOM_GLYPHS.get(emoji);
      if (painter) {
        painter(actx, slotPx, i);
        continue;
      }
      const cached = fluentCache.get(emoji);
      if (cached) {
        drawFluentIntoSlot(actx, slotPx, i, cached);
      } else {
        drawEmojiFallback(actx, slotPx, i, emoji);
        loadFluent(emoji).then((img) => {
          if (!img) return;
          if (atlas !== atlasAtBuild) return;
          actx.clearRect(i * slotPx, 0, slotPx, slotPx);
          drawFluentIntoSlot(actx, slotPx, i, img);
        }).catch((err) => {
          console.warn(`Fluent load failed for "${emoji}":`, (err == null ? void 0 : err.message) || err);
        });
      }
    }
    for (const emoji of ["\u{1F4A5}", "\u{1F525}", "\u26A1", "\u2B50", "\u{1F0CF}"]) {
      if (!fluentCache.has(emoji) && !fluentInflight.has(emoji) && !fluentFailed.has(emoji)) {
        loadFluent(emoji).catch((err) => {
          console.warn(`Fluent load failed for "${emoji}":`, (err == null ? void 0 : err.message) || err);
        });
      }
    }
  }
  function drawFluentIntoSlot(actx, slotPx, slotIndex, img) {
    const drawSize = slotPx * 0.95;
    const offset = (slotPx - drawSize) / 2;
    actx.drawImage(img, slotIndex * slotPx + offset, offset, drawSize, drawSize);
  }
  function getCellSize() {
    return layout.cellSize;
  }
  function clearFrame() {
    ctx3.clearRect(0, 0, viewportW, viewportH);
  }
  function ctxRef() {
    return ctx3;
  }
  function screenToCell(x, y) {
    const cs = layout.cellSize;
    const c = Math.floor((x - layout.boardX) / cs);
    const r = Math.floor((y - layout.boardY) / cs);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null;
    return { r, c };
  }
  function ensureBgLayer() {
    const key = `${layout.boardX}:${layout.boardY}:${layout.cellSize}:${DPR}`;
    if (bgLayer && bgLayerKey === key) return;
    const pad2 = 8;
    const w = (layout.boardSize + pad2 * 2) * DPR;
    const h = (layout.boardSize + pad2 * 2) * DPR;
    bgLayer = new OffscreenCanvas(w, h);
    const bctx = bgLayer.getContext("2d");
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.fillStyle = "rgba(255,255,255,0.04)";
    bctx.fillRect(0, 0, layout.boardSize + pad2 * 2, layout.boardSize + pad2 * 2);
    bctx.strokeStyle = "rgba(255,255,255,0.06)";
    bctx.lineWidth = 1;
    bctx.beginPath();
    for (let i = 0; i <= GRID; i++) {
      bctx.moveTo(pad2 + i * layout.cellSize, pad2);
      bctx.lineTo(pad2 + i * layout.cellSize, pad2 + layout.boardSize);
      bctx.moveTo(pad2, pad2 + i * layout.cellSize);
      bctx.lineTo(pad2 + layout.boardSize, pad2 + i * layout.cellSize);
    }
    bctx.stroke();
    bgLayerKey = key;
  }
  function drawBoardBg() {
    ensureBgLayer();
    const pad2 = 8;
    ctx3.drawImage(
      bgLayer,
      0,
      0,
      bgLayer.width,
      bgLayer.height,
      layout.boardX - pad2,
      layout.boardY - pad2,
      layout.boardSize + pad2 * 2,
      layout.boardSize + pad2 * 2
    );
  }
  function drawBoard(grid8, opts = {}) {
    if (enabled3) counters.drawBoard++;
    const shakeAmp = reducedMotion ? 0 : opts.shakeAmp || 0;
    const settings = opts.settings || {};
    const hint6 = opts.hint || null;
    const iceMap2 = opts.iceMap || null;
    const idleMs = reducedMotion ? 0 : opts.idleMs || 0;
    const wobbleK = idleMs > 5e3 ? Math.min(1, (idleMs - 5e3) / 1500) : 0;
    const wobbleAngle = wobbleK * 0.02 * Math.sin(clockMs() / 1200);
    ctx3.save();
    if (shakeAmp > 0.1) {
      ctx3.translate((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp);
    }
    if (wobbleAngle !== 0) {
      const cx = layout.boardX + layout.boardSize / 2;
      const cy = layout.boardY + layout.boardSize / 2;
      ctx3.translate(cx, cy);
      ctx3.rotate(wobbleAngle);
      ctx3.translate(-cx, -cy);
    }
    drawBoardBg();
    if (isEnabled()) {
      drawInto(ctx3, layout.boardX, layout.boardY, layout.boardSize, layout.boardSize, 0.5);
    }
    const cs = layout.cellSize;
    const clipPad = 8;
    ctx3.save();
    ctx3.beginPath();
    ctx3.rect(
      layout.boardX - clipPad,
      layout.boardY - clipPad,
      layout.boardSize + clipPad * 2,
      layout.boardSize + clipPad * 2
    );
    ctx3.clip();
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid8[r][c];
        if (!cell) continue;
        const rr = cell.renderRow != null ? cell.renderRow : r;
        const cc = cell.renderCol != null ? cell.renderCol : c;
        const x = layout.boardX + cc * cs;
        const y = layout.boardY + rr * cs;
        const alpha = cell.clearAlpha != null ? cell.clearAlpha : 1;
        if (alpha < 0.02) continue;
        if (hint6 && (hint6.a.r === r && hint6.a.c === c || hint6.b.r === r && hint6.b.c === c)) {
          const pulse = 0.5 + 0.5 * Math.sin(clockMs() / 500);
          ctx3.fillStyle = `rgba(255,255,255,${0.06 + pulse * 0.08})`;
          ctx3.fillRect(x, y, cs, cs);
          ctx3.save();
          ctx3.strokeStyle = `rgba(255, 235, 150, ${0.2 + pulse * 0.35})`;
          ctx3.lineWidth = Math.max(1.5, cs * 0.04);
          const grow = cs * 0.06 * pulse;
          ctx3.strokeRect(x - grow, y - grow, cs + grow * 2, cs + grow * 2);
          ctx3.restore();
        }
        ctx3.globalAlpha = alpha;
        drawGemWithEffects(ctx3, cell, x, y, cs);
        ctx3.globalAlpha = 1;
      }
    }
    if (iceMap2) {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (iceMap2[r][c] > 0) {
            const x = layout.boardX + c * cs;
            const y = layout.boardY + r * cs;
            ctx3.save();
            roundRect(ctx3, x + 1, y + 1, cs - 2, cs - 2, cs * 0.14);
            ctx3.fillStyle = "rgba(160, 210, 255, 0.32)";
            ctx3.fill();
            ctx3.strokeStyle = "rgba(200, 235, 255, 0.75)";
            ctx3.lineWidth = 2;
            ctx3.stroke();
            ctx3.strokeStyle = "rgba(255,255,255,0.55)";
            ctx3.lineWidth = 1;
            ctx3.beginPath();
            ctx3.moveTo(x + cs * 0.3, y + cs * 0.25);
            ctx3.lineTo(x + cs * 0.5, y + cs * 0.5);
            ctx3.lineTo(x + cs * 0.4, y + cs * 0.75);
            ctx3.stroke();
            ctx3.restore();
          }
        }
      }
    }
    ctx3.restore();
    draw3(ctx3);
    draw4(ctx3);
    draw(ctx3);
    draw2(ctx3);
    ctx3.restore();
    drawVignette();
  }
  function drawVignette() {
    if (!ctx3) return;
    const w = viewportW, h = viewportH;
    const vignetteDpr = Math.min(DPR, 2);
    const key = `${w}x${h}x${vignetteDpr}`;
    if (!vignetteLayer || vignetteKey !== key) {
      vignetteLayer = new OffscreenCanvas(Math.max(1, Math.ceil(w * vignetteDpr)), Math.max(1, Math.ceil(h * vignetteDpr)));
      const vctx = vignetteLayer.getContext("2d");
      vctx.setTransform(vignetteDpr, 0, 0, vignetteDpr, 0, 0);
      const g = vctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.35,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.45)");
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, w, h);
      vignetteKey = key;
    }
    ctx3.drawImage(vignetteLayer, 0, 0, vignetteLayer.width, vignetteLayer.height, 0, 0, w, h);
  }
  function drawGemAt(ctx4, type, x, y, size) {
    if (!atlas) return;
    ctx4.drawImage(
      atlas,
      type * atlasCellPx,
      0,
      atlasCellPx,
      atlasCellPx,
      x,
      y,
      size,
      size
    );
  }
  function drawGemWithEffects(ctx4, cell, x, y, size) {
    const sx = cell.scaleX != null ? cell.scaleX : 1;
    const sy = cell.scaleY != null ? cell.scaleY : 1;
    const flash = cell.flashAlpha;
    if (sx !== 1 || sy !== 1) {
      const cx = x + size * 0.5, cy = y + size * 0.55;
      ctx4.save();
      ctx4.translate(cx, cy);
      ctx4.scale(sx, sy);
      ctx4.translate(-cx, -cy);
      drawGemAt(ctx4, cell.type, x, y, size);
      drawSpecialOverlay(ctx4, cell, x, y, size);
      if (flash != null && flash > 0) drawFlash(ctx4, x, y, size, flash);
      ctx4.restore();
    } else {
      drawGemAt(ctx4, cell.type, x, y, size);
      drawSpecialOverlay(ctx4, cell, x, y, size);
      if (flash != null && flash > 0) drawFlash(ctx4, x, y, size, flash);
    }
  }
  function drawFlash(ctx4, x, y, size, alpha) {
    ctx4.fillStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
    ctx4.fillRect(x, y, size, size);
  }
  function drawSpecialOverlay(ctx4, cell, x, y, size) {
    if (!cell.special) return;
    ctx4.save();
    switch (cell.special) {
      case SPECIAL.LINE_H: {
        ctx4.drawImage(ensureLineHLayer(size), x, y, size, size);
        break;
      }
      case SPECIAL.LINE_V: {
        ctx4.drawImage(ensureLineVLayer(size), x, y, size, size);
        break;
      }
      case SPECIAL.COLOR_BOMB: {
        ctx4.drawImage(ensureColorBombLayer(size), x, y, size, size);
        break;
      }
      case SPECIAL.AREA_BOMB: {
        drawEmojiBadge(ctx4, x, y, size, "\u{1F4A5}", "#ff8a3d");
        break;
      }
      case SPECIAL.GRAVITY: {
        ctx4.drawImage(ensureGravityLayer(size), x, y, size, size);
        break;
      }
      case SPECIAL.TIME_BOMB: {
        if (cell.bombCountdown != null) {
          const color = cell.bombCountdown <= 3 ? "#ff4444" : "#ffaa33";
          const side = size * 0.36;
          const bx = x + size * 0.8;
          const by = y + size * 0.2;
          ctx4.drawImage(ensureTimeBombBadge(color, size), bx - side / 2, by - side / 2, side, side);
          ctx4.fillStyle = "#fff";
          ctx4.font = fontString(Math.floor(side * 0.65), "sans-serif", "bold");
          ctx4.textAlign = "center";
          ctx4.textBaseline = "middle";
          ctx4.fillText(String(cell.bombCountdown), bx, by + 1);
        }
        break;
      }
      case SPECIAL.WILDCARD:
        drawEmojiBadge(ctx4, x, y, size, "\u{1F0CF}", "#7c3aed");
        break;
      case SPECIAL.TIME_PLUS:
        drawEmojiBadge(ctx4, x, y, size, "\u23F1", "#4dd0e1");
        break;
      case SPECIAL.COIN:
        drawEmojiBadge(ctx4, x, y, size, "\u{1FA99}", "#ffd166");
        break;
      case SPECIAL.FIRE:
        drawEmojiBadge(ctx4, x, y, size, "\u{1F525}", "#ff5722");
        break;
      case SPECIAL.LIGHTNING:
        drawEmojiBadge(ctx4, x, y, size, "\u26A1", "#ffeb3b");
        break;
      case SPECIAL.STAR:
        drawEmojiBadge(ctx4, x, y, size, "\u2B50", "#ffd700");
        break;
    }
    ctx4.restore();
  }
  function drawEmojiBadge(ctx4, x, y, size, emoji, ringColor) {
    if (!fluentCache.has(emoji) && FLUENT_NAME[emoji] && !fluentInflight.has(emoji) && !fluentFailed.has(emoji)) {
      loadFluent(emoji).catch((err) => {
        console.warn(`Fluent load failed for "${emoji}":`, (err == null ? void 0 : err.message) || err);
      });
    }
    const side = size * 0.44;
    const bx = x + size * 0.78 - side / 2;
    const by = y + size * 0.22 - side / 2;
    ctx4.drawImage(ensureBadgeLayer(emoji, ringColor, size), bx, by, side, side);
  }
  function ensureBadgeLayer(emoji, ringColor, cellSize) {
    const hasFluent = fluentCache.has(emoji) ? 1 : 0;
    const key = `${emoji}|${ringColor}|${cellSize}|${DPR}|${hasFluent}`;
    let canvas4 = badgeCache.get(key);
    if (canvas4) return canvas4;
    const side = cellSize * 0.44;
    const px = Math.max(8, Math.ceil(side * DPR));
    canvas4 = new OffscreenCanvas(px, px);
    const c = canvas4.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = ringColor;
    c.globalAlpha = 0.85;
    const r = side * 0.25;
    roundRect(c, 0, 0, side, side, r);
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(0,0,0,0.6)";
    c.lineWidth = 1.5;
    c.stroke();
    const img = fluentCache.get(emoji);
    if (img) {
      const drawSize = side * 0.78;
      c.drawImage(img, side / 2 - drawSize / 2, side / 2 - drawSize / 2, drawSize, drawSize);
    } else {
      c.font = `${Math.floor(side * 0.75)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(emoji, side / 2, side / 2 + 1);
    }
    badgeCache.set(key, canvas4);
    return canvas4;
  }
  function ensureColorBombLayer(cellSize) {
    const key = `${cellSize}|${DPR}`;
    let canvas4 = colorBombCache.get(key);
    if (canvas4) return canvas4;
    const px = Math.max(8, Math.ceil(cellSize * DPR));
    canvas4 = new OffscreenCanvas(px, px);
    const c = canvas4.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = cellSize * 0.05;
    const inset = cellSize * 0.08;
    c.strokeRect(inset, inset, cellSize - inset * 2, cellSize - inset * 2);
    const g = c.createRadialGradient(
      cellSize * 0.5,
      cellSize * 0.5,
      0,
      cellSize * 0.5,
      cellSize * 0.5,
      cellSize * 0.5
    );
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, cellSize, cellSize);
    colorBombCache.set(key, canvas4);
    return canvas4;
  }
  function ensureLineHLayer(cellSize) {
    const key = `${cellSize}|${DPR}`;
    let canvas4 = lineHCache.get(key);
    if (canvas4) return canvas4;
    const px = Math.max(8, Math.ceil(cellSize * DPR));
    canvas4 = new OffscreenCanvas(px, px);
    const c = canvas4.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = cellSize * 0.06;
    c.beginPath();
    c.moveTo(cellSize * 0.15, cellSize * 0.5);
    c.lineTo(cellSize * 0.85, cellSize * 0.5);
    c.stroke();
    drawArrowHead(c, cellSize * 0.85, cellSize * 0.5, cellSize, 0);
    drawArrowHead(c, cellSize * 0.15, cellSize * 0.5, cellSize, Math.PI);
    lineHCache.set(key, canvas4);
    return canvas4;
  }
  function ensureLineVLayer(cellSize) {
    const key = `${cellSize}|${DPR}`;
    let canvas4 = lineVCache.get(key);
    if (canvas4) return canvas4;
    const px = Math.max(8, Math.ceil(cellSize * DPR));
    canvas4 = new OffscreenCanvas(px, px);
    const c = canvas4.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = cellSize * 0.06;
    c.beginPath();
    c.moveTo(cellSize * 0.5, cellSize * 0.15);
    c.lineTo(cellSize * 0.5, cellSize * 0.85);
    c.stroke();
    drawArrowHead(c, cellSize * 0.5, cellSize * 0.85, cellSize, Math.PI / 2);
    drawArrowHead(c, cellSize * 0.5, cellSize * 0.15, cellSize, -Math.PI / 2);
    lineVCache.set(key, canvas4);
    return canvas4;
  }
  function ensureGravityLayer(cellSize) {
    const key = `${cellSize}|${DPR}`;
    let canvas4 = gravityCache.get(key);
    if (canvas4) return canvas4;
    const px = Math.max(8, Math.ceil(cellSize * DPR));
    canvas4 = new OffscreenCanvas(px, px);
    const c = canvas4.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.strokeStyle = "rgba(0,0,0,0.8)";
    c.lineWidth = 2;
    c.font = `${Math.floor(cellSize * 0.35)}px sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.strokeText("\u21C5", cellSize * 0.5, cellSize * 0.86);
    c.fillText("\u21C5", cellSize * 0.5, cellSize * 0.86);
    gravityCache.set(key, canvas4);
    return canvas4;
  }
  function ensureTimeBombBadge(color, cellSize) {
    const key = `${color}|${cellSize}|${DPR}`;
    let canvas4 = timeBombCache.get(key);
    if (canvas4) return canvas4;
    const side = cellSize * 0.36;
    const px = Math.max(8, Math.ceil(side * DPR));
    canvas4 = new OffscreenCanvas(px, px);
    const c = canvas4.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = color;
    c.strokeStyle = "rgba(0,0,0,0.9)";
    c.lineWidth = Math.max(1, cellSize * 0.02);
    const r = side * 0.25;
    roundRect(c, 0, 0, side, side, r);
    c.fill();
    c.stroke();
    timeBombCache.set(key, canvas4);
    return canvas4;
  }
  function drawArrowHead(ctx4, x, y, size, angle) {
    ctx4.save();
    ctx4.translate(x, y);
    ctx4.rotate(angle);
    ctx4.beginPath();
    ctx4.moveTo(0, 0);
    ctx4.lineTo(-size * 0.12, -size * 0.08);
    ctx4.lineTo(-size * 0.12, size * 0.08);
    ctx4.closePath();
    ctx4.fillStyle = "rgba(255,255,255,0.85)";
    ctx4.fill();
    ctx4.restore();
  }
  function drawText(text, x, y, opts = {}) {
    ctx3.save();
    ctx3.font = opts.font || "20px -apple-system, system-ui, sans-serif";
    ctx3.fillStyle = opts.color || "#f3f0ff";
    ctx3.textAlign = opts.align || "left";
    ctx3.textBaseline = opts.baseline || "top";
    if (opts.shadow) {
      ctx3.shadowColor = "rgba(0,0,0,0.7)";
      ctx3.shadowBlur = 4;
      ctx3.shadowOffsetY = 2;
    }
    ctx3.fillText(text, x, y);
    ctx3.restore();
  }
  function drawHitButton(x, y, w, h, label, onClick, buttons15, cursorX15, cursorY15, opts = {}) {
    const hover = cursorX15 >= x && cursorX15 <= x + w && cursorY15 >= y && cursorY15 <= y + h;
    const pressed = hover && isPointerDown();
    drawButton(x, y, w, h, label, { hover, pressed, ...opts });
    const withTapSound = () => {
      if (!opts.disabled) uiTap();
      return onClick();
    };
    const btn = { x, y, w, h, onClick: withTapSound, kind: opts.kind, modal: opts.modal };
    if (opts.activateOnUp) btn.activateOnUp = true;
    buttons15.push(btn);
  }
  function drawButton(x, y, w, h, label, opts = {}) {
    const hover = opts.hover || false;
    const pressed = opts.pressed || false;
    const disabled = opts.disabled || false;
    ctx3.save();
    if (pressed && !disabled) {
      const cx = x + w / 2, cy = y + h / 2;
      ctx3.translate(cx, cy);
      ctx3.scale(0.97, 0.97);
      ctx3.translate(-cx, -cy);
    }
    ctx3.fillStyle = disabled ? "rgba(80,80,100,0.4)" : pressed ? "rgba(100, 48, 200, 0.95)" : hover ? "rgba(124, 58, 237, 0.85)" : "rgba(60, 50, 100, 0.85)";
    roundRect(ctx3, x, y, w, h, 12);
    ctx3.fill();
    ctx3.strokeStyle = "rgba(255,255,255,0.15)";
    ctx3.lineWidth = 1.5;
    ctx3.stroke();
    ctx3.fillStyle = disabled ? "#888" : "#fff";
    ctx3.textAlign = "center";
    ctx3.textBaseline = "middle";
    const labelPad = Math.min(24, Math.floor(w * 0.3));
    if (opts.subtitle) {
      ctx3.font = opts.font || fontString(Math.floor(h * 0.36));
      fillTextEllipsized(ctx3, label, x + w / 2, y + h * 0.36, w - labelPad);
      ctx3.font = fontString(Math.floor(h * 0.2));
      ctx3.fillStyle = "rgba(255,255,255,0.7)";
      fillTextEllipsized(ctx3, opts.subtitle, x + w / 2, y + h * 0.72, w - labelPad);
    } else {
      ctx3.font = opts.font || fontString(Math.floor(h * 0.4));
      fillTextEllipsized(ctx3, label, x + w / 2, y + h / 2, w - labelPad);
    }
    ctx3.restore();
  }
  function ellipsize(ctx4, text, maxW) {
    const value = String(text != null ? text : "");
    const key = ctx4.font + "|" + maxW + "|" + value;
    const cached = ellipsizeCache.get(key);
    if (cached !== void 0) return cached;
    let out;
    if (ctx4.measureText(value).width <= maxW) {
      out = value;
    } else {
      const suffix = "\u2026";
      let lo = 0, hi = value.length;
      while (lo < hi) {
        const mid = lo + hi + 1 >> 1;
        if (ctx4.measureText(value.slice(0, mid) + suffix).width <= maxW) lo = mid;
        else hi = mid - 1;
      }
      out = value.slice(0, lo) + suffix;
    }
    if (ellipsizeCache.size > 256) ellipsizeCache.clear();
    ellipsizeCache.set(key, out);
    return out;
  }
  function fillTextEllipsized(ctx4, text, x, y, maxW) {
    ctx4.fillText(ellipsize(ctx4, text, maxW), x, y);
  }
  function roundRect(ctx4, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx4.beginPath();
    ctx4.moveTo(x + r, y);
    ctx4.lineTo(x + w - r, y);
    ctx4.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx4.lineTo(x + w, y + h - r);
    ctx4.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx4.lineTo(x + r, y + h);
    ctx4.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx4.lineTo(x, y + r);
    ctx4.quadraticCurveTo(x, y, x + r, y);
    ctx4.closePath();
  }
  function getViewport() {
    return { w: viewportW, h: viewportH };
  }
  function boardRight() {
    return layout.boardX + layout.boardSize;
  }
  function contentRight() {
    return layout.panelSide === "right" && layout.panelW > 0 ? layout.panelX + layout.panelW : layout.boardX + layout.boardSize;
  }
  function boardCenterX() {
    return layout.boardX + layout.boardSize / 2;
  }
  function responsiveFont(desktopPx, minPx = 14) {
    if (layout.isNarrow) return Math.max(minPx, Math.floor(desktopPx * 0.78));
    return desktopPx;
  }
  var MENU_COLUMN_MAX_W = 720;
  function menuColumn() {
    const w = Math.min(MENU_COLUMN_MAX_W, viewportW - 32);
    const x = Math.floor((viewportW - w) / 2);
    return { x, w, right: x + w };
  }
  function drawPowerupSlot(x, y, w, h, emoji, ring, charges, progressToNext, hover, activeMode) {
    ctx3.save();
    roundRect(ctx3, x, y, w, h, 10);
    ctx3.fillStyle = activeMode ? "rgba(124, 58, 237, 0.95)" : hover ? "rgba(80, 60, 130, 0.9)" : charges > 0 ? "rgba(50, 40, 80, 0.85)" : "rgba(30, 25, 50, 0.5)";
    ctx3.fill();
    ctx3.strokeStyle = activeMode ? "#fff" : "rgba(255,255,255,0.12)";
    ctx3.lineWidth = activeMode ? 2 : 1;
    ctx3.stroke();
    const cx = x + w / 2;
    const cy = y + h * 0.4;
    const rr = Math.min(w, h) * 0.3;
    if (progressToNext > 0 && progressToNext < 1) {
      ctx3.beginPath();
      ctx3.arc(cx, cy, rr + 4, -Math.PI / 2, -Math.PI / 2 + progressToNext * Math.PI * 2);
      ctx3.strokeStyle = ring;
      ctx3.lineWidth = 2;
      ctx3.stroke();
    }
    ctx3.font = `${Math.floor(rr * 1.6)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx3.textAlign = "center";
    ctx3.textBaseline = "middle";
    ctx3.globalAlpha = charges > 0 ? 1 : 0.4;
    ctx3.fillText(emoji, cx, cy);
    ctx3.globalAlpha = 1;
    const dotR = 3;
    const dotsY = y + h * 0.78;
    const totalDotsW = 3 * (dotR * 2) + 2 * 4;
    const dotsStartX = cx - totalDotsW / 2 + dotR;
    for (let i = 0; i < 3; i++) {
      ctx3.beginPath();
      ctx3.arc(dotsStartX + i * (dotR * 2 + 4), dotsY, dotR, 0, Math.PI * 2);
      ctx3.fillStyle = i < charges ? ring : "rgba(255,255,255,0.15)";
      ctx3.fill();
    }
    ctx3.restore();
    return { x, y, w, h };
  }

  // src/achievements.js
  var ACHIEVEMENTS = [
    // === Engagement ===
    { id: "first_match", nameKey: "achievement.first_match.name", descKey: "achievement.first_match.desc", icon: "\u{1F3AF}" },
    { id: "matches_100", nameKey: "achievement.matches_100.name", descKey: "achievement.matches_100.desc", icon: "\u{1F4AF}" },
    { id: "matches_1000", nameKey: "achievement.matches_1000.name", descKey: "achievement.matches_1000.desc", icon: "\u{1F396}\uFE0F" },
    { id: "matches_10000", nameKey: "achievement.matches_10000.name", descKey: "achievement.matches_10000.desc", icon: "\u{1F451}" },
    // === Cascade depth ===
    { id: "cascade_3", nameKey: "achievement.cascade_3.name", descKey: "achievement.cascade_3.desc", icon: "\u{1F525}" },
    { id: "cascade_5", nameKey: "achievement.cascade_5.name", descKey: "achievement.cascade_5.desc", icon: "\u2B50" },
    { id: "cascade_8", nameKey: "achievement.cascade_8.name", descKey: "achievement.cascade_8.desc", icon: "\u{1F32A}\uFE0F" },
    // === Specials ===
    { id: "special_color", nameKey: "achievement.special_color.name", descKey: "achievement.special_color.desc", icon: "\u{1FAA9}" },
    { id: "special_area", nameKey: "achievement.special_area.name", descKey: "achievement.special_area.desc", icon: "\u{1F4A5}" },
    { id: "special_star", nameKey: "achievement.special_star.name", descKey: "achievement.special_star.desc", icon: "\u{1F31F}" },
    // === Classic progress ===
    { id: "classic_l10", nameKey: "achievement.classic_l10.name", descKey: "achievement.classic_l10.desc", icon: "\u{1F949}" },
    { id: "classic_l50", nameKey: "achievement.classic_l50.name", descKey: "achievement.classic_l50.desc", icon: "\u{1F948}" },
    { id: "classic_l100", nameKey: "achievement.classic_l100.name", descKey: "achievement.classic_l100.desc", icon: "\u{1F947}" },
    { id: "classic_l200", nameKey: "achievement.classic_l200.name", descKey: "achievement.classic_l200.desc", icon: "\u{1F3C6}" },
    // === Mode breadth ===
    { id: "first_zen", nameKey: "achievement.first_zen.name", descKey: "achievement.first_zen.desc", icon: "\u{1F9D8}" },
    { id: "first_daily", nameKey: "achievement.first_daily.name", descKey: "achievement.first_daily.desc", icon: "\u{1F4C5}" },
    { id: "first_blitz", nameKey: "achievement.first_blitz.name", descKey: "achievement.first_blitz.desc", icon: "\u26A1" },
    { id: "first_puzzle", nameKey: "achievement.first_puzzle.name", descKey: "achievement.first_puzzle.desc", icon: "\u{1F9E9}" },
    // === Big scores ===
    { id: "score_zen_10k", nameKey: "achievement.score_zen_10k.name", descKey: "achievement.score_zen_10k.desc", icon: "\u{1F944}" },
    { id: "score_zen_100k", nameKey: "achievement.score_zen_100k.name", descKey: "achievement.score_zen_100k.desc", icon: "\u{1F48E}" },
    // === Habits & mastery ===
    { id: "streak_3", nameKey: "achievement.streak_3.name", descKey: "achievement.streak_3.desc", icon: "\u{1F525}" },
    { id: "streak_7", nameKey: "achievement.streak_7.name", descKey: "achievement.streak_7.desc", icon: "\u{1F4C6}" },
    { id: "defuse_10", nameKey: "achievement.defuse_10.name", descKey: "achievement.defuse_10.desc", icon: "\u2702\uFE0F" },
    { id: "powerup_10", nameKey: "achievement.powerup_10.name", descKey: "achievement.powerup_10.desc", icon: "\u{1F392}" }
  ];
  var toastQueue = [];
  var _hydrated = false;
  function consumeToast() {
    getState();
    const t2 = toastQueue.shift() || null;
    if (t2) {
      const state = getState();
      const rec = state.unlocked[t2.id];
      if (rec) {
        rec.shownAt = (/* @__PURE__ */ new Date()).toISOString();
        saveKey("achievements", state);
      }
    }
    return t2;
  }
  function getState() {
    const s = load();
    if (!s.achievements) {
      s.achievements = { unlocked: {}, counters: { totalMatches: 0 } };
      saveKey("achievements", s.achievements);
    }
    if (!_hydrated) {
      _hydrated = true;
      hydrateUnshownToasts(s.achievements);
    }
    return s.achievements;
  }
  function hydrateUnshownToasts(state) {
    for (const id of Object.keys(state.unlocked)) {
      const rec = state.unlocked[id];
      if (!rec || !("shownAt" in rec) || rec.shownAt !== null) continue;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (!def) continue;
      if (toastQueue.some((t2) => t2.id === id)) continue;
      toastQueue.push({ id, nameKey: def.nameKey, icon: def.icon });
    }
  }
  function isUnlocked(id) {
    return !!getState().unlocked[id];
  }
  function unlock2(id) {
    if (isUnlocked(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    const state = getState();
    state.unlocked[id] = { at: (/* @__PURE__ */ new Date()).toISOString(), shownAt: null };
    saveKey("achievements", state);
    toastQueue.push({ id, nameKey: def.nameKey, icon: def.icon });
  }
  function bumpCounter(key, delta) {
    const state = getState();
    state.counters[key] = (state.counters[key] || 0) + delta;
    saveKey("achievements", state);
    return state.counters[key];
  }
  function notifyMatchCleared(cellCount, depth) {
    const total = bumpCounter("totalMatches", cellCount);
    const state = getState();
    if (depth > (state.counters.biggestCascade || 0)) {
      state.counters.biggestCascade = depth;
      saveKey("achievements", state);
    }
    unlock2("first_match");
    if (total >= 100) unlock2("matches_100");
    if (total >= 1e3) unlock2("matches_1000");
    if (total >= 1e4) unlock2("matches_10000");
    if (depth >= 3) unlock2("cascade_3");
    if (depth >= 5) unlock2("cascade_5");
    if (depth >= 8) unlock2("cascade_8");
  }
  function notifySpecialSpawned(special) {
    bumpCounter("specialsCreated", 1);
    if (special === SPECIAL.COLOR_BOMB) unlock2("special_color");
    if (special === SPECIAL.AREA_BOMB) unlock2("special_area");
    if (special === SPECIAL.STAR) unlock2("special_star");
  }
  function notifyDailyStreak(days) {
    if (days >= 3) unlock2("streak_3");
    if (days >= 7) unlock2("streak_7");
  }
  function notifyBombsDefused(count) {
    if (count <= 0) return;
    const total = bumpCounter("bombsDefused", count);
    if (total >= 10) unlock2("defuse_10");
  }
  function notifyPowerupUsed() {
    const total = bumpCounter("powerupsUsed", 1);
    if (total >= 10) unlock2("powerup_10");
  }
  var _pendingPlayMs = 0;
  var PLAYTIME_FLUSH_MS = 15e3;
  function addPlayTimeMs(ms) {
    _pendingPlayMs += ms;
    if (_pendingPlayMs >= PLAYTIME_FLUSH_MS) {
      flushPlayTime();
    }
  }
  function flushPlayTime() {
    if (_pendingPlayMs <= 0) return;
    const chunk = _pendingPlayMs;
    _pendingPlayMs = 0;
    bumpCounter("timePlayedMs", chunk);
  }
  function notifyLevelWin(level) {
    if (level >= 10) unlock2("classic_l10");
    if (level >= 50) unlock2("classic_l50");
    if (level >= 100) unlock2("classic_l100");
    if (level >= 200) unlock2("classic_l200");
  }
  function notifyMode(mode) {
    if (mode === "zen") unlock2("first_zen");
    if (mode === "daily") unlock2("first_daily");
    if (mode === "blitz") unlock2("first_blitz");
    if (mode === "puzzle") unlock2("first_puzzle");
  }
  function notifyZenScore(score) {
    if (score >= 1e4) unlock2("score_zen_10k");
    if (score >= 1e5) unlock2("score_zen_100k");
  }
  function summary() {
    const state = getState();
    const unlocked = Object.keys(state.unlocked).length;
    return {
      unlocked,
      total: ACHIEVEMENTS.length,
      counters: state.counters,
      unlockedSet: state.unlocked
    };
  }

  // src/toasts.js
  var SLOTS = 4;
  var LIFE_MS = 3800;
  var active = [];
  function pump() {
    while (active.length < SLOTS) {
      const t2 = consumeToast();
      if (!t2) break;
      active.push({ ...t2, age: 0 });
      achievementChime();
    }
  }
  function update5(dt) {
    pump();
    for (let i = active.length - 1; i >= 0; i--) {
      active[i].age += dt;
      if (active[i].age >= LIFE_MS) active.splice(i, 1);
    }
  }
  function draw5() {
    if (active.length === 0) return;
    const ctx4 = ctxRef();
    const { w } = getViewport();
    const cardW = 280, cardH = 60;
    ctx4.save();
    for (let i = 0; i < active.length; i++) {
      const t2 = active[i];
      const k = t2.age / LIFE_MS;
      let alpha = 1, offsetX = 0;
      if (t2.age < 280) {
        const p = t2.age / 280;
        alpha = p;
        offsetX = (1 - p) * cardW * 1.2;
      } else if (k > 0.85) {
        const p = (k - 0.85) / 0.15;
        alpha = 1 - p;
        offsetX = p * cardW * 1.2;
      }
      const x = w - cardW - 16 + offsetX;
      const y = 16 + layout.safeTop + i * (cardH + 10);
      ctx4.save();
      ctx4.globalAlpha = alpha;
      roundRect(ctx4, x, y, cardW, cardH, 12);
      ctx4.fillStyle = "#2a1a55";
      ctx4.fill();
      ctx4.strokeStyle = "rgba(255,215,0,0.55)";
      ctx4.lineWidth = 2;
      ctx4.stroke();
      ctx4.font = `${Math.floor(cardH * 0.55)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx4.textAlign = "center";
      ctx4.textBaseline = "middle";
      ctx4.fillText(t2.icon, x + 30, y + cardH / 2);
      ctx4.textAlign = "left";
      ctx4.fillStyle = "rgba(255,255,255,0.7)";
      ctx4.font = `11px sans-serif`;
      ctx4.fillText(t("achievement.unlocked"), x + 60, y + 14);
      ctx4.fillStyle = "#fff";
      ctx4.font = `bold 16px sans-serif`;
      ctx4.fillText(t(t2.nameKey), x + 60, y + 36);
      ctx4.restore();
    }
    ctx4.restore();
  }

  // src/matcher.js
  var _runs = [];
  var _runCount = 0;
  function recordRun(start, end, type) {
    let r = _runs[_runCount];
    if (!r) {
      r = { start: 0, end: 0, type: 0 };
      _runs[_runCount] = r;
    }
    r.start = start;
    r.end = end;
    r.type = type;
    _runCount++;
  }
  function scanLine(grid8, fixed, isRow) {
    _runCount = 0;
    let runStart = 0;
    let runType = null;
    for (let i = 0; i <= GRID; i++) {
      const cur = i < GRID ? isRow ? grid8[fixed][i] : grid8[i][fixed] : null;
      const isWild = !!cur && cur.special === SPECIAL.WILDCARD;
      let extendsRun = false;
      if (cur) {
        if (runType === null) {
          extendsRun = true;
          if (!isWild) runType = cur.type;
        } else if (isWild || cur.type === runType) {
          extendsRun = true;
        }
      }
      if (extendsRun) continue;
      const len = i - runStart;
      const matched = len >= 3 && runType !== null;
      if (matched) recordRun(runStart, i - 1, runType);
      let nextStart = i;
      if (!matched && cur) {
        while (nextStart - 1 >= runStart) {
          const prev = isRow ? grid8[fixed][nextStart - 1] : grid8[nextStart - 1][fixed];
          if (prev && prev.special === SPECIAL.WILDCARD) nextStart--;
          else break;
        }
      }
      runStart = nextStart;
      runType = cur && !isWild ? cur.type : null;
    }
    return _runCount;
  }
  function runAt(i) {
    return _runs[i];
  }
  function findMatches(grid8, swapOrigin = null) {
    if (enabled3) counters.findMatches++;
    const cleared = /* @__PURE__ */ new Set();
    const toSpawn = [];
    const hRuns = [];
    for (let r = 0; r < GRID; r++) {
      const n = scanLine(grid8, r, true);
      for (let i = 0; i < n; i++) {
        const run = runAt(i);
        hRuns.push({ axis: "h", r, c0: run.start, c1: run.end, len: run.end - run.start + 1, type: run.type, consumed: false });
      }
    }
    const vRuns = [];
    for (let c = 0; c < GRID; c++) {
      const n = scanLine(grid8, c, false);
      for (let i = 0; i < n; i++) {
        const run = runAt(i);
        vRuns.push({ axis: "v", c, r0: run.start, r1: run.end, len: run.end - run.start + 1, type: run.type, consumed: false });
      }
    }
    if (hRuns.length === 0 && vRuns.length === 0) {
      return { cleared, toSpawn };
    }
    for (const h of hRuns) {
      if (h.consumed) continue;
      for (const v of vRuns) {
        if (v.consumed) continue;
        if (h.type !== v.type) continue;
        if (h.r >= v.r0 && h.r <= v.r1 && v.c >= h.c0 && v.c <= h.c1) {
          for (let c = h.c0; c <= h.c1; c++) cleared.add(`${h.r},${c}`);
          for (let r = v.r0; r <= v.r1; r++) cleared.add(`${r},${v.c}`);
          const spawnCell = preferSwapOrigin(swapOrigin, [{ r: h.r, c: v.c }]);
          toSpawn.push({ r: spawnCell.r, c: spawnCell.c, special: SPECIAL.AREA_BOMB, type: h.type });
          h.consumed = true;
          v.consumed = true;
          break;
        }
      }
    }
    for (const run of [...hRuns, ...vRuns]) {
      if (run.consumed || run.len < 5) continue;
      const cells = expandRun(run);
      for (const { r, c } of cells) cleared.add(`${r},${c}`);
      const spawnCell = preferSwapOrigin(swapOrigin, cells);
      toSpawn.push({ r: spawnCell.r, c: spawnCell.c, special: SPECIAL.COLOR_BOMB, type: run.type });
      run.consumed = true;
    }
    for (const run of [...hRuns, ...vRuns]) {
      if (run.consumed || run.len !== 4) continue;
      const cells = expandRun(run);
      for (const { r, c } of cells) cleared.add(`${r},${c}`);
      const spawnCell = preferSwapOrigin(swapOrigin, cells);
      toSpawn.push({
        r: spawnCell.r,
        c: spawnCell.c,
        special: run.axis === "h" ? SPECIAL.LINE_H : SPECIAL.LINE_V,
        type: run.type
      });
      run.consumed = true;
    }
    for (const run of [...hRuns, ...vRuns]) {
      if (run.consumed) continue;
      for (const { r, c } of expandRun(run)) cleared.add(`${r},${c}`);
      run.consumed = true;
    }
    return { cleared, toSpawn };
  }
  function expandRun(run) {
    const cells = [];
    if (run.axis === "h") {
      for (let c = run.c0; c <= run.c1; c++) cells.push({ r: run.r, c });
    } else {
      for (let r = run.r0; r <= run.r1; r++) cells.push({ r, c: run.c });
    }
    return cells;
  }
  function preferSwapOrigin(swapOrigin, cells) {
    if (swapOrigin) {
      for (const c of cells) {
        if (c.r === swapOrigin.r && c.c === swapOrigin.c) return c;
      }
    }
    return cells[Math.floor(cells.length / 2)];
  }
  function wouldSwapMatch(grid8, a, b) {
    const tmp = grid8[a.r][a.c];
    grid8[a.r][a.c] = grid8[b.r][b.c];
    grid8[b.r][b.c] = tmp;
    try {
      let hit = scanLine(grid8, a.r, true) > 0;
      if (!hit && b.r !== a.r) hit = scanLine(grid8, b.r, true) > 0;
      if (!hit) hit = scanLine(grid8, a.c, false) > 0;
      if (!hit && b.c !== a.c) hit = scanLine(grid8, b.c, false) > 0;
      return hit;
    } finally {
      const tmp2 = grid8[a.r][a.c];
      grid8[a.r][a.c] = grid8[b.r][b.c];
      grid8[b.r][b.c] = tmp2;
    }
  }
  function analyzeSwapShape(grid8, a, b) {
    const tmp = grid8[a.r][a.c];
    grid8[a.r][a.c] = grid8[b.r][b.c];
    grid8[b.r][b.c] = tmp;
    try {
      const rowA = summarizeLine(grid8, a.r, true, a.c, b.c);
      const rowB = b.r === a.r ? rowA : summarizeLine(grid8, b.r, true, a.c, b.c);
      const colA = summarizeLine(grid8, a.c, false, a.r, b.r);
      const colB = b.c === a.c ? colA : summarizeLine(grid8, b.c, false, a.r, b.r);
      const maxRun = Math.max(rowA.maxLen, rowB.maxLen, colA.maxLen, colB.maxLen);
      const tAtA = rowA.coversA && colA.coversA;
      const tAtB = rowB.coversB && colB.coversB;
      return { matched: maxRun >= 3, maxRun, tShape: tAtA || tAtB };
    } finally {
      const tmp2 = grid8[a.r][a.c];
      grid8[a.r][a.c] = grid8[b.r][b.c];
      grid8[b.r][b.c] = tmp2;
    }
  }
  function summarizeLine(grid8, fixed, isRow, targetA, targetB) {
    const n = scanLine(grid8, fixed, isRow);
    let maxLen = 0;
    let coversA = false, coversB = false;
    for (let i = 0; i < n; i++) {
      const run = runAt(i);
      const len = run.end - run.start + 1;
      if (len > maxLen) maxLen = len;
      if (targetA >= run.start && targetA <= run.end) coversA = true;
      if (targetB >= run.start && targetB <= run.end) coversB = true;
    }
    return { maxLen, coversA, coversB };
  }

  // src/grid.js
  var PLAYABLE_FALLBACK_TYPES = [
    [2, 5, 6, 1, 1, 3, 4, 2],
    [4, 2, 1, 2, 5, 5, 6, 6],
    [5, 1, 0, 6, 2, 5, 3, 6],
    [1, 6, 3, 2, 2, 3, 2, 3],
    [1, 5, 1, 0, 3, 1, 0, 4],
    [0, 2, 0, 2, 1, 2, 6, 2],
    [4, 4, 3, 3, 1, 4, 0, 0],
    [1, 4, 0, 4, 2, 3, 1, 1]
  ];
  var nextId = 1;
  function newCell(type, special = SPECIAL.NONE, bombCountdown = null) {
    return { type, special, bombCountdown, id: nextId++ };
  }
  function makeEmptyGrid() {
    const g = new Array(GRID);
    for (let r = 0; r < GRID; r++) {
      g[r] = new Array(GRID).fill(null);
    }
    return g;
  }
  function createBoard(rng = Math.random) {
    let attempts = 0;
    while (attempts++ < 100) {
      const g2 = makeEmptyGrid();
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          g2[r][c] = newCell(pickTypeNoMatch(g2, r, c, rng));
        }
      }
      if (findMatches(g2, null).cleared.size === 0 && hasAnyValidMove(g2)) return g2;
    }
    const g = makeEmptyGrid();
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        g[r][c] = newCell(rng() * TYPES | 0);
      }
    }
    reshuffle(g, rng);
    return g;
  }
  function pickTypeNoMatch(g, r, c, rng) {
    const banned = /* @__PURE__ */ new Set();
    if (r >= 2 && g[r - 1][c] && g[r - 2][c] && g[r - 1][c].type === g[r - 2][c].type) banned.add(g[r - 1][c].type);
    if (c >= 2 && g[r][c - 1] && g[r][c - 2] && g[r][c - 1].type === g[r][c - 2].type) banned.add(g[r][c - 1].type);
    let t2;
    do {
      t2 = rng() * TYPES | 0;
    } while (banned.has(t2));
    return t2;
  }
  function swap(g, a, b) {
    const tmp = g[a.r][a.c];
    g[a.r][a.c] = g[b.r][b.c];
    g[b.r][b.c] = tmp;
  }
  function areAdjacent(a, b) {
    const dr = Math.abs(a.r - b.r), dc = Math.abs(a.c - b.c);
    return dr + dc === 1;
  }
  function applyGravity(g, direction = "down") {
    const moves2 = [];
    for (let c = 0; c < GRID; c++) {
      if (direction === "down") {
        let writeRow = GRID - 1;
        for (let r = GRID - 1; r >= 0; r--) {
          if (g[r][c] !== null) {
            if (r !== writeRow) {
              moves2.push({ from: { r, c }, to: { r: writeRow, c }, cell: g[r][c] });
              g[writeRow][c] = g[r][c];
              g[r][c] = null;
            }
            writeRow--;
          }
        }
      } else {
        let writeRow = 0;
        for (let r = 0; r < GRID; r++) {
          if (g[r][c] !== null) {
            if (r !== writeRow) {
              moves2.push({ from: { r, c }, to: { r: writeRow, c }, cell: g[r][c] });
              g[writeRow][c] = g[r][c];
              g[r][c] = null;
            }
            writeRow++;
          }
        }
      }
    }
    return moves2;
  }
  function spawnNew(g, rng = Math.random, direction = "down", opts = null) {
    const spawns = [];
    for (let c = 0; c < GRID; c++) {
      let empties = 0;
      for (let r = 0; r < GRID; r++) if (g[r][c] === null) empties++;
      if (empties === 0) continue;
      if (direction === "down") {
        for (let r = 0; r < GRID; r++) {
          if (g[r][c] === null) {
            const cell = pickSpawn(rng, opts);
            g[r][c] = cell;
            spawns.push({ r, c, cell, fromY: r - empties });
          }
        }
      } else {
        for (let r = GRID - 1; r >= 0; r--) {
          if (g[r][c] === null) {
            const cell = pickSpawn(rng, opts);
            g[r][c] = cell;
            spawns.push({ r, c, cell, fromY: r + empties });
          }
        }
      }
    }
    biasSpawnsToSolvable(g, spawns);
    return spawns;
  }
  function biasSpawnsToSolvable(g, spawns) {
    if (spawns.length === 0) return;
    if (hasAnyValidMove(g)) return;
    for (const s of spawns) {
      const cell = g[s.r][s.c];
      if (!cell || cell.special) continue;
      const orig = cell.type;
      for (let t2 = 0; t2 < TYPES; t2++) {
        if (t2 === orig) continue;
        cell.type = t2;
        if (hasAnyValidMove(g)) {
          return;
        }
      }
      cell.type = orig;
    }
  }
  function pickSpawn(rng, opts = null) {
    const type = rng() * TYPES | 0;
    const roll = rng();
    const p = SPAWN_RATES;
    let cutoff = 0;
    if (opts && opts.timePlusRate) {
      cutoff += 1 / opts.timePlusRate;
      if (roll < cutoff) return newCell(type, SPECIAL.TIME_PLUS);
    }
    cutoff += 1 / p.GRAVITY;
    if (roll < cutoff) return newCell(type, SPECIAL.GRAVITY);
    cutoff += 1 / p.TIME_BOMB;
    if (roll < cutoff) return newCell(type, SPECIAL.TIME_BOMB, TIME_BOMB_START);
    cutoff += 1 / p.WILDCARD;
    if (roll < cutoff) return newCell(type, SPECIAL.WILDCARD);
    cutoff += 1 / p.COIN;
    if (roll < cutoff) return newCell(type, SPECIAL.COIN);
    cutoff += 1 / p.FIRE;
    if (roll < cutoff) return newCell(type, SPECIAL.FIRE);
    cutoff += 1 / p.LIGHTNING;
    if (roll < cutoff) return newCell(type, SPECIAL.LIGHTNING);
    cutoff += 1 / p.AREA_BOMB;
    if (roll < cutoff) return newCell(type, SPECIAL.AREA_BOMB);
    cutoff += 1 / p.COLOR_BOMB;
    if (roll < cutoff) return newCell(type, SPECIAL.COLOR_BOMB);
    cutoff += 1 / p.STAR;
    if (roll < cutoff) return newCell(type, SPECIAL.STAR);
    return newCell(type);
  }
  function hasAnyValidMove(g) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (c + 1 < GRID && isValidSwapCandidate(g, { r, c }, { r, c: c + 1 })) return true;
        if (r + 1 < GRID && isValidSwapCandidate(g, { r, c }, { r: r + 1, c })) return true;
      }
    }
    return false;
  }
  function findModestHint(g) {
    const candidates = [];
    let colorBombFallback = null;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const tries = [];
        if (c + 1 < GRID) tries.push({ a: { r, c }, b: { r, c: c + 1 } });
        if (r + 1 < GRID) tries.push({ a: { r, c }, b: { r: r + 1, c } });
        for (const t2 of tries) {
          if (isColorBombSwap(g, t2.a, t2.b)) {
            if (!colorBombFallback) colorBombFallback = t2;
            continue;
          }
          const shape = analyzeSwapShape(g, t2.a, t2.b);
          if (!shape.matched) continue;
          let penalty = Math.max(0, shape.maxRun - 3);
          if (shape.tShape) penalty += 15;
          else if (shape.maxRun >= 5) penalty += 20;
          else if (shape.maxRun === 4) penalty += 10;
          candidates.push({ swap: t2, penalty });
        }
      }
    }
    if (candidates.length === 0) return colorBombFallback;
    candidates.sort((x, y) => x.penalty - y.penalty);
    return candidates[0].swap;
  }
  function isValidSwapCandidate(g, a, b) {
    return isColorBombSwap(g, a, b) || wouldSwapMatch(g, a, b);
  }
  function isColorBombSwap(g, a, b) {
    var _a, _b, _c, _d;
    return ((_b = (_a = g[a.r]) == null ? void 0 : _a[a.c]) == null ? void 0 : _b.special) === SPECIAL.COLOR_BOMB || ((_d = (_c = g[b.r]) == null ? void 0 : _c[b.c]) == null ? void 0 : _d.special) === SPECIAL.COLOR_BOMB;
  }
  function reshuffle(g, rng = Math.random) {
    const flat = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) flat.push(g[r][c]);
    for (let attempt = 0; attempt < 50; attempt++) {
      for (let i2 = flat.length - 1; i2 > 0; i2--) {
        const j = rng() * (i2 + 1) | 0;
        [flat[i2], flat[j]] = [flat[j], flat[i2]];
      }
      let i = 0;
      for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) g[r][c] = flat[i++];
      if (findMatches(g, null).cleared.size === 0 && hasAnyValidMove(g)) return true;
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const cell = g[r][c];
          cell.type = pickTypeNoMatch(g, r, c, rng);
        }
      }
      if (findMatches(g, null).cleared.size === 0 && hasAnyValidMove(g)) return true;
    }
    applyPlayableFallback(g, false);
    if (findMatches(g, null).cleared.size === 0 && hasAnyValidMove(g)) return true;
    applyPlayableFallback(g, true);
    return findMatches(g, null).cleared.size === 0 && hasAnyValidMove(g);
  }
  function applyPlayableFallback(g, clearSpecials) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        let cell = g[r][c];
        if (!cell) {
          cell = newCell(PLAYABLE_FALLBACK_TYPES[r][c]);
          g[r][c] = cell;
        } else {
          cell.type = PLAYABLE_FALLBACK_TYPES[r][c];
        }
        if (clearSpecials) {
          cell.special = SPECIAL.NONE;
          cell.bombCountdown = null;
        }
      }
    }
  }
  function reseedNextId(maxId) {
    if (maxId >= nextId) nextId = maxId + 1;
  }
  function serializeGrid(g) {
    return g.map((row) => row.map((cell) => cell ? {
      type: cell.type,
      special: cell.special,
      bombCountdown: cell.bombCountdown,
      id: cell.id
    } : null));
  }
  function deserializeGrid(serialized) {
    let maxId = 0;
    const g = serialized.map((row) => row.map((c) => {
      if (!c) return null;
      if (c.id > maxId) maxId = c.id;
      return { type: c.type, special: c.special, bombCountdown: c.bombCountdown, id: c.id };
    }));
    reseedNextId(maxId);
    return g;
  }

  // src/specials.js
  var CHAINABLE = /* @__PURE__ */ new Set([
    SPECIAL.LINE_H,
    SPECIAL.LINE_V,
    SPECIAL.AREA_BOMB,
    SPECIAL.COLOR_BOMB,
    SPECIAL.FIRE,
    SPECIAL.LIGHTNING,
    SPECIAL.STAR
  ]);
  function maybeChain(chained, cell, r, c) {
    if (cell && CHAINABLE.has(cell.special) && !chainedHas(chained, r, c)) {
      chained.push({ r, c, special: cell.special, type: cell.type });
    }
  }
  function activate(grid8, r, c, special, partnerType = null, rng = Math.random, partnerSpecial = null, selfType = null) {
    var _a, _b, _c, _d, _e;
    const myType = (_c = selfType != null ? selfType : (_b = (_a = grid8[r]) == null ? void 0 : _a[c]) == null ? void 0 : _b.type) != null ? _c : null;
    const cleared = /* @__PURE__ */ new Set();
    const chained = [];
    switch (special) {
      case SPECIAL.LINE_H: {
        for (let cc = 0; cc < GRID; cc++) {
          const cell = grid8[r][cc];
          if (cell) cleared.add(`${r},${cc}`);
          if (cc !== c) maybeChain(chained, cell, r, cc);
        }
        cleared.add(`${r},${c}`);
        break;
      }
      case SPECIAL.LINE_V: {
        for (let rr = 0; rr < GRID; rr++) {
          const cell = grid8[rr][c];
          if (cell) cleared.add(`${rr},${c}`);
          if (rr !== r) maybeChain(chained, cell, rr, c);
        }
        cleared.add(`${r},${c}`);
        break;
      }
      case SPECIAL.AREA_BOMB: {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
            const cell = grid8[nr][nc];
            if (cell) cleared.add(`${nr},${nc}`);
            if (nr !== r || nc !== c) maybeChain(chained, cell, nr, nc);
          }
        }
        cleared.add(`${r},${c}`);
        break;
      }
      case SPECIAL.COLOR_BOMB: {
        if (partnerSpecial === SPECIAL.COLOR_BOMB) {
          for (let rr = 0; rr < GRID; rr++) {
            for (let cc = 0; cc < GRID; cc++) {
              if (grid8[rr][cc]) cleared.add(`${rr},${cc}`);
            }
          }
          cleared.add(`${r},${c}`);
          break;
        }
        const target2 = partnerType != null ? partnerType : myType;
        if (target2 == null) break;
        for (let rr = 0; rr < GRID; rr++) {
          for (let cc = 0; cc < GRID; cc++) {
            const cell = grid8[rr][cc];
            if (cell && cell.type === target2) {
              cleared.add(`${rr},${cc}`);
              if (rr !== r || cc !== c) maybeChain(chained, cell, rr, cc);
            }
          }
        }
        cleared.add(`${r},${c}`);
        break;
      }
      case SPECIAL.GRAVITY:
      case SPECIAL.TIME_BOMB:
      case SPECIAL.WILDCARD:
      case SPECIAL.COIN: {
        cleared.add(`${r},${c}`);
        break;
      }
      case SPECIAL.FIRE: {
        const N = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        cleared.add(`${r},${c}`);
        for (const [dr, dc] of N) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
          const nb = grid8[nr][nc];
          if (!nb) continue;
          cleared.add(`${nr},${nc}`);
          maybeChain(chained, nb, nr, nc);
        }
        break;
      }
      case SPECIAL.LIGHTNING: {
        cleared.add(`${r},${c}`);
        if (myType == null) break;
        const targets = [];
        for (let rr = 0; rr < GRID; rr++) {
          for (let cc = 0; cc < GRID; cc++) {
            if (rr === r && cc === c) continue;
            const cell = grid8[rr][cc];
            if (cell && cell.type === myType) targets.push({ r: rr, c: cc });
          }
        }
        for (let i = targets.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [targets[i], targets[j]] = [targets[j], targets[i]];
        }
        for (let i = 0; i < Math.min(LIGHTNING_TARGETS, targets.length); i++) {
          const t2 = targets[i];
          cleared.add(`${t2.r},${t2.c}`);
          maybeChain(chained, grid8[t2.r][t2.c], t2.r, t2.c);
        }
        break;
      }
      case SPECIAL.STAR: {
        const counts = new Array(TYPES).fill(0);
        for (let rr = 0; rr < GRID; rr++) {
          for (let cc = 0; cc < GRID; cc++) {
            const cell = grid8[rr][cc];
            if (cell && cell.special !== SPECIAL.WILDCARD) counts[cell.type]++;
          }
        }
        const ranked = counts.map((n, type) => ({ type, n })).sort((a, b) => b.n - a.n);
        const top = new Set([(_d = ranked[0]) == null ? void 0 : _d.type, (_e = ranked[1]) == null ? void 0 : _e.type].filter((t2) => t2 !== void 0));
        for (let rr = 0; rr < GRID; rr++) {
          for (let cc = 0; cc < GRID; cc++) {
            const cell = grid8[rr][cc];
            if (!cell) continue;
            const isWildcard = cell.special === SPECIAL.WILDCARD;
            if (top.has(cell.type) || isWildcard) {
              cleared.add(`${rr},${cc}`);
              if (rr !== r || cc !== c) maybeChain(chained, cell, rr, cc);
            }
          }
        }
        cleared.add(`${r},${c}`);
        break;
      }
      default:
        break;
    }
    return { cleared, chained };
  }
  function chainedHas(arr, r, c) {
    for (let i = 0; i < arr.length; i++) if (arr[i].r === r && arr[i].c === c) return true;
    return false;
  }
  function tickBombs(grid8, skip = null, onTick = null) {
    const exploded = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid8[r][c];
        if (!cell || cell.special !== SPECIAL.TIME_BOMB || cell.bombCountdown === null) continue;
        if (skip && skip.has(`${r},${c}`)) continue;
        cell.bombCountdown--;
        onTick == null ? void 0 : onTick({ r, c, cell });
        if (cell.bombCountdown <= 0) {
          exploded.push({ r, c, cell });
        }
      }
    }
    return exploded;
  }
  function scoreForClear(count, depth) {
    return Math.round(count * SCORE.PER_GEM_CLEARED * SCORE.CASCADE_MULTIPLIER(depth));
  }

  // src/animations.js
  var easings = {
    linear: (k) => k,
    easeOutCubic: (k) => 1 - Math.pow(1 - k, 3),
    easeInQuad: (k) => k * k,
    // Smooth settle without overshoot — good for everyday swaps.
    easeOutSpring: (k) => {
      if (k <= 0) return 0;
      if (k >= 1) return 1;
      return 1 - Math.cos(k * Math.PI * 0.5) * Math.exp(-k * 2.2);
    },
    // Visible overshoot, useful for spawn pops and squash recoveries.
    easeOutBack: (k) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    },
    // Rubbery elastic — used for the bounce-back on an invalid drop.
    easeOutElastic: (k) => {
      if (k <= 0) return 0;
      if (k >= 1) return 1;
      const p = 0.4;
      return Math.pow(2, -8 * k) * Math.sin((k - p / 4) * (2 * Math.PI) / p) + 1;
    }
  };
  var Tween = class {
    constructor({ from, to, duration, delay = 0, ease = easings.easeOutCubic, onDone = null, onUpdate = null, onStart = null }) {
      this.from = from;
      this.to = to;
      this.duration = Math.max(1, duration);
      this.delay = Math.max(0, delay);
      this.ease = ease;
      this.onDone = onDone;
      this.onUpdate = onUpdate;
      this.onStart = onStart;
      this.t = 0;
      this.value = from;
      this.done = false;
      this.started = false;
    }
    update(dt) {
      if (this.done) return;
      if (this.delay > 0) {
        this.delay -= dt;
        if (this.delay > 0) return;
        dt = -this.delay;
        this.delay = 0;
      }
      if (!this.started) {
        this.started = true;
        if (this.onStart) this.onStart();
      }
      this.t += dt;
      const k = Math.min(this.t / this.duration, 1);
      this.value = this.from + (this.to - this.from) * this.ease(k);
      if (this.onUpdate) this.onUpdate(this.value);
      if (k >= 1) {
        this.done = true;
        if (this.onDone) this.onDone();
      }
    }
  };

  // src/cascade.js
  var STATE = {
    IDLE: "IDLE",
    SWAPPING: "SWAPPING",
    RESOLVING: "RESOLVING",
    ACTIVATING_SPECIALS: "ACTIVATING_SPECIALS",
    FALLING: "FALLING",
    SPAWNING: "SPAWNING",
    REVERTING: "REVERTING",
    BOUNCING: "BOUNCING"
  };
  var Cascade = class {
    constructor(grid8, opts = {}) {
      this.grid = grid8;
      this.mode = opts.mode || "zen";
      this.rng = opts.rng || Math.random;
      this.spawnOpts = opts.spawnOpts || null;
      this.state = STATE.IDLE;
      this.score = 0;
      this.scoreShown = 0;
      this.cascadeDepth = 0;
      this.gravityDir = "down";
      this.gravityFlipNext = false;
      this.slowmoMsRemaining = 0;
      this.anims = /* @__PURE__ */ new Map();
      this.clearingCells = /* @__PURE__ */ new Set();
      this.activationQueue = [];
      this.activationQueueIndex = 0;
      this._bombTickPending = false;
      this.lastSwapTo = null;
      this._pendingSwap = null;
      this._revertSwap = null;
      this.shakeAmp = 0;
      this.onMatchCleared = null;
      this.onSpecialSpawned = null;
      this.onSpecialActivated = null;
      this.onBombExploded = null;
      this.onBombTick = null;
      this.onBombsDefused = null;
      this.onMoveCommitted = null;
      this.onIdleReached = null;
      this.onScoreChanged = null;
      this.onReshuffle = null;
      this.idleSinceMs = 0;
    }
    // Called by scene when player taps two adjacent cells. Returns true if accepted.
    // Peeks for validity first; if the swap wouldn't match (and isn't a color-bomb
    // activation), bounces only the source gem back instead of animating both.
    tryStartSwap(a, b) {
      if (this.state !== STATE.IDLE) return false;
      if (!areAdjacent(a, b)) return false;
      const cellA = this.grid[a.r][a.c];
      const cellB = this.grid[b.r][b.c];
      if (!cellA || !cellB) return false;
      const isColorBombSwap2 = cellA.special === SPECIAL.COLOR_BOMB || cellB.special === SPECIAL.COLOR_BOMB;
      if (!isColorBombSwap2) {
        if (!wouldSwapMatch(this.grid, a, b)) {
          this.bounceBack(a);
          return false;
        }
      }
      if (cellA) {
        cellA.renderRow = null;
        cellA.renderCol = null;
      }
      if (cellB) {
        cellB.renderRow = null;
        cellB.renderCol = null;
      }
      this._pendingSwap = { a, b };
      this.state = STATE.SWAPPING;
      this.cascadeDepth = 0;
      this.idleSinceMs = 0;
      this._startSwapAnim(a, b);
      return true;
    }
    // Externally-triggered clear (power-up activation). Treats the given cells
    // as if they were matched, runs the normal resolve → fall → spawn → cascade.
    // Returns true if accepted.
    applyExternalClears(cleared) {
      if (this.state !== STATE.IDLE) return false;
      if (!cleared || cleared.size === 0) return false;
      this.cascadeDepth = 1;
      this._beginResolve(cleared, []);
      return true;
    }
    resolveCurrentMatches(origin = null) {
      var _a;
      if (this.state !== STATE.IDLE) return false;
      const { cleared, toSpawn } = findMatches(this.grid, origin);
      if (cleared.size === 0) {
        (_a = this.onIdleReached) == null ? void 0 : _a.call(this);
        return false;
      }
      this.cascadeDepth = 1;
      this._beginResolve(cleared, toSpawn);
      return true;
    }
    // Animate the cell at `sourcePos` from its current render position back to
    // its grid position. Used when a drag is released over an invalid target
    // or below the commit threshold.
    bounceBack(sourcePos) {
      var _a;
      const cell = (_a = this.grid[sourcePos.r]) == null ? void 0 : _a[sourcePos.c];
      if (!cell) return;
      if (cell.renderRow == null && cell.renderCol == null) {
        return;
      }
      this.state = STATE.BOUNCING;
      this._tweenCellTo(cell, sourcePos, sourcePos, TIMING.REVERT, () => {
        var _a2;
        this.state = STATE.IDLE;
        (_a2 = this.onIdleReached) == null ? void 0 : _a2.call(this);
      }, easings.easeOutElastic);
    }
    _startSwapAnim(a, b) {
      const cellA = this.grid[a.r][a.c];
      const cellB = this.grid[b.r][b.c];
      if (!cellA || !cellB) return;
      this._tweenCellTo(cellA, a, b, TIMING.SWAP, null, easings.easeOutSpring);
      this._tweenCellTo(cellB, b, a, TIMING.SWAP, null, easings.easeOutSpring);
    }
    _tweenCellTo(cell, from, to, duration, onDone, ease = easings.easeOutCubic) {
      const startRow = cell.renderRow != null ? cell.renderRow : from.r;
      const startCol = cell.renderCol != null ? cell.renderCol : from.c;
      cell.renderRow = startRow;
      cell.renderCol = startCol;
      const tween = new Tween({
        from: 0,
        to: 1,
        duration,
        ease,
        onUpdate: (k) => {
          cell.renderRow = startRow + (to.r - startRow) * k;
          cell.renderCol = startCol + (to.c - startCol) * k;
        },
        onDone: () => {
          cell.renderRow = null;
          cell.renderCol = null;
          this.anims.delete(cell.id);
          if (onDone) onDone();
        }
      });
      this.anims.set(cell.id, { tween, kind: "move" });
    }
    _tweenCellFallTo(cell, from, to, duration, onDone) {
      cell.renderRow = from.r;
      cell.renderCol = from.c;
      const tween = new Tween({
        from: 0,
        to: 1,
        duration,
        ease: easings.easeInQuad,
        onUpdate: (k) => {
          cell.renderRow = from.r + (to.r - from.r) * k;
          cell.renderCol = from.c + (to.c - from.c) * k;
        },
        onDone: () => {
          cell.renderRow = null;
          cell.renderCol = null;
          this.anims.delete(cell.id);
          this._startSquash(cell, Math.abs(to.r - from.r));
          if (onDone) onDone();
        }
      });
      this.anims.set(cell.id, { tween, kind: "fall" });
    }
    _startSquash(cell, fallHeight = 1) {
      if (fallHeight < 1) return;
      cell.squashAmp = Math.min(0.22, 0.1 + fallHeight * 0.025);
      cell.squashT = 0;
      cell.squashDuration = 260;
      if (!this._squashed) this._squashed = /* @__PURE__ */ new Set();
      this._squashed.add(cell);
    }
    _tickSquashes(dt) {
      if (!this._squashed || this._squashed.size === 0) return;
      for (const cell of this._squashed) {
        cell.squashT += dt;
        const k = Math.min(cell.squashT / cell.squashDuration, 1);
        if (k >= 1) {
          cell.scaleX = 1;
          cell.scaleY = 1;
          cell.squashAmp = null;
          cell.squashT = null;
          cell.squashDuration = null;
          this._squashed.delete(cell);
        } else {
          const s = Math.sin(k * Math.PI) * cell.squashAmp;
          cell.scaleX = 1 + s;
          cell.scaleY = 1 - s;
        }
      }
    }
    _tweenClear(cellKey, duration, onDone, delayMs = 0) {
      const [r, c] = cellKey.split(",").map(Number);
      const cell = this.grid[r][c];
      if (cell) {
        cell.clearAlpha = 1;
        cell.flashAlpha = 1;
      }
      const FLASH_MS = 90;
      const flashTween = new Tween({
        from: 1,
        to: 0,
        duration: FLASH_MS,
        delay: delayMs,
        ease: easings.easeInQuad,
        onUpdate: (v) => {
          if (cell) cell.flashAlpha = v;
        },
        onDone: () => {
          if (cell) cell.flashAlpha = null;
        }
      });
      this.anims.set("flash:" + cellKey, { tween: flashTween, kind: "flash" });
      const tween = new Tween({
        from: 1,
        to: 0,
        duration,
        ease: easings.linear,
        delay: delayMs + FLASH_MS,
        onUpdate: (v) => {
          if (cell) cell.clearAlpha = v;
        },
        onDone: () => {
          onDone == null ? void 0 : onDone();
        }
      });
      const id = "clear:" + cellKey;
      this.anims.set(id, { tween, kind: "clear" });
    }
    update(dt) {
      var _a;
      let effDt = dt;
      if (this.slowmoMsRemaining > 0) {
        effDt = dt * SLOWMO_FACTOR;
        this.slowmoMsRemaining -= dt;
        if (this.slowmoMsRemaining < 0) this.slowmoMsRemaining = 0;
      }
      let stillAnimating = false;
      for (const [id, entry2] of this.anims) {
        entry2.tween.update(effDt);
        if (entry2.tween.done) this.anims.delete(id);
        else stillAnimating = true;
      }
      this._tickSquashes(effDt);
      if (this.shakeAmp > 0) {
        this.shakeAmp *= Math.pow(0.85, dt / 16);
        if (this.shakeAmp < 0.5) this.shakeAmp = 0;
      }
      if (this.scoreShown !== this.score) {
        const diff = this.score - this.scoreShown;
        const step = Math.max(1, Math.abs(diff) * dt / 500);
        if (Math.abs(diff) <= step) this.scoreShown = this.score;
        else this.scoreShown += Math.sign(diff) * step;
      }
      if (this.state === STATE.IDLE) {
        this.idleSinceMs += dt;
        return;
      }
      this.idleSinceMs = 0;
      if (stillAnimating) return;
      switch (this.state) {
        case STATE.SWAPPING:
          this._afterSwap();
          break;
        case STATE.REVERTING:
          this._afterRevert();
          break;
        case STATE.RESOLVING:
          this._afterResolve();
          break;
        case STATE.ACTIVATING_SPECIALS:
          this._afterActivations();
          break;
        case STATE.FALLING:
          this._afterFall();
          break;
        case STATE.SPAWNING:
          this._afterSpawn();
          break;
        case STATE.BOUNCING:
          this.state = STATE.IDLE;
          (_a = this.onIdleReached) == null ? void 0 : _a.call(this);
          break;
      }
    }
    _afterSwap() {
      var _a, _b, _c;
      const { a, b } = this._pendingSwap;
      swap(this.grid, a, b);
      this.lastSwapTo = b;
      const cellA = this.grid[a.r][a.c];
      const cellB = this.grid[b.r][b.c];
      let colorBombResult = null;
      if (cellA && cellA.special === SPECIAL.COLOR_BOMB) {
        colorBombResult = {
          bombCell: a,
          partnerCell: b,
          partnerType: cellB == null ? void 0 : cellB.type,
          partnerSpecial: (cellB == null ? void 0 : cellB.special) || null
        };
      } else if (cellB && cellB.special === SPECIAL.COLOR_BOMB) {
        colorBombResult = {
          bombCell: b,
          partnerCell: a,
          partnerType: cellA == null ? void 0 : cellA.type,
          partnerSpecial: (cellA == null ? void 0 : cellA.special) || null
        };
      }
      const { cleared, toSpawn } = findMatches(this.grid, b);
      if (!colorBombResult && cleared.size === 0) {
        this._revertSwap = { a, b };
        this._pendingSwap = null;
        this.state = STATE.REVERTING;
        this._startSwapAnim(b, a);
        return;
      }
      this._pendingSwap = null;
      (_a = this.onMoveCommitted) == null ? void 0 : _a.call(this);
      this._bombTickPending = true;
      if (colorBombResult) {
        this.cascadeDepth = 1;
        const bombCell = this.grid[colorBombResult.bombCell.r][colorBombResult.bombCell.c];
        this._queueActivation({
          r: colorBombResult.bombCell.r,
          c: colorBombResult.bombCell.c,
          special: SPECIAL.COLOR_BOMB,
          type: (_b = bombCell == null ? void 0 : bombCell.type) != null ? _b : 0,
          partnerType: colorBombResult.partnerType,
          partnerSpecial: colorBombResult.partnerSpecial
        });
        const ps = colorBombResult.partnerSpecial;
        if (ps === SPECIAL.LINE_H || ps === SPECIAL.LINE_V || ps === SPECIAL.AREA_BOMB || ps === SPECIAL.FIRE || ps === SPECIAL.LIGHTNING || ps === SPECIAL.STAR) {
          this._queueActivation({
            r: colorBombResult.partnerCell.r,
            c: colorBombResult.partnerCell.c,
            special: ps,
            type: colorBombResult.partnerType
          });
        }
        if (cleared.size > 0) {
          this._beginResolve(cleared, toSpawn);
        } else {
          this.activationQueueIndex = 0;
          this.clearingCells = /* @__PURE__ */ new Set();
          this.state = STATE.ACTIVATING_SPECIALS;
          this._afterActivations();
        }
        return;
      }
      if (cleared.size === 0) {
        this.state = STATE.IDLE;
        (_c = this.onIdleReached) == null ? void 0 : _c.call(this);
        return;
      }
      this.cascadeDepth = 1;
      this._beginResolve(cleared, toSpawn);
    }
    _afterRevert() {
      var _a;
      const { a, b } = this._revertSwap;
      swap(this.grid, a, b);
      this._revertSwap = null;
      this.state = STATE.IDLE;
      (_a = this.onIdleReached) == null ? void 0 : _a.call(this);
    }
    _beginResolve(cleared, toSpawn) {
      var _a, _b, _c, _d;
      this.clearingCells = new Set(cleared);
      if (this.activationQueueIndex >= this.activationQueue.length) {
        this.activationQueue = [];
        this.activationQueueIndex = 0;
      }
      const { defuseBonus, coinMultiplier } = this._scanPassiveEffects(cleared);
      if (defuseBonus > 0) (_a = this.onBombsDefused) == null ? void 0 : _a.call(this, defuseBonus / SCORE.BOMB_DEFUSE_BONUS);
      for (const key of cleared) {
        const [r, c] = key.split(",").map(Number);
        const cell = this.grid[r][c];
        if (!cell) continue;
        if (cell.special === SPECIAL.FIRE || cell.special === SPECIAL.LIGHTNING || cell.special === SPECIAL.STAR || cell.special === SPECIAL.LINE_H || cell.special === SPECIAL.LINE_V || cell.special === SPECIAL.AREA_BOMB || cell.special === SPECIAL.COLOR_BOMB) {
          this._queueActivation({ r, c, special: cell.special, type: cell.type });
        }
      }
      if (this.cascadeDepth === STAR_CASCADE_TRIGGER) {
        const occupied = new Set(toSpawn.map((s) => `${s.r},${s.c}`));
        for (const key of cleared) {
          if (occupied.has(key)) continue;
          const [sr, sc] = key.split(",").map(Number);
          if (this._hasQueuedActivationAt(sr, sc)) continue;
          const cell = this.grid[sr][sc];
          toSpawn.push({ r: sr, c: sc, special: SPECIAL.STAR, type: (_b = cell == null ? void 0 : cell.type) != null ? _b : 0 });
          break;
        }
      }
      if (cleared.size >= BIG_WAVE_AREA_BOMB) {
        const promoteTo = cleared.size >= BIG_WAVE_COLOR_BOMB ? SPECIAL.COLOR_BOMB : SPECIAL.AREA_BOMB;
        const occupied = new Set(toSpawn.map((s) => `${s.r},${s.c}`));
        for (const key of cleared) {
          if (occupied.has(key)) continue;
          const [br, bc] = key.split(",").map(Number);
          if (this._hasQueuedActivationAt(br, bc)) continue;
          const cell = this.grid[br][bc];
          toSpawn.push({ r: br, c: bc, special: promoteTo, type: (_c = cell == null ? void 0 : cell.type) != null ? _c : 0 });
          break;
        }
      }
      const gemsScore = scoreForClear(cleared.size, this.cascadeDepth) * coinMultiplier;
      const total = gemsScore + defuseBonus;
      this.score += total;
      const STAGGER_MS = 28;
      const sortedKeys = [...cleared].sort((a, b) => {
        const [ar, ac] = a.split(",").map(Number);
        const [br, bc] = b.split(",").map(Number);
        return ar - br || ac - bc;
      });
      for (let i = 0; i < sortedKeys.length; i++) {
        this._tweenClear(sortedKeys[i], TIMING.CLEAR, null, i * STAGGER_MS);
      }
      if (this.onMatchCleared) {
        const cells = [];
        for (const key of cleared) {
          const [r, c] = key.split(",").map(Number);
          const cell = this.grid[r][c];
          if (cell) cells.push({ r, c, type: cell.type, special: cell.special });
        }
        this.onMatchCleared(cells, this.cascadeDepth);
      }
      (_d = this.onScoreChanged) == null ? void 0 : _d.call(this, this.score, total);
      if (this.cascadeDepth >= SHAKE_MIN_DEPTH) {
        this.shakeAmp = Math.min(this.cascadeDepth * 2, 14);
      }
      if (this.cascadeDepth >= SLOWMO_MIN_DEPTH) {
        this.slowmoMsRemaining = TIMING.SLOWMO_MS;
      }
      this._pendingSpawns = toSpawn;
      this.state = STATE.RESOLVING;
    }
    _afterResolve() {
      var _a;
      const protectedKeys = /* @__PURE__ */ new Set();
      if (this._pendingSpawns) {
        for (const s of this._pendingSpawns) protectedKeys.add(`${s.r},${s.c}`);
      }
      for (const key of this.clearingCells) {
        const [r, c] = key.split(",").map(Number);
        if (protectedKeys.has(key)) continue;
        this.grid[r][c] = null;
      }
      if (this._pendingSpawns) {
        const byCell = /* @__PURE__ */ new Map();
        for (const s of this._pendingSpawns) byCell.set(`${s.r},${s.c}`, s);
        for (const s of byCell.values()) {
          if (this.onSpecialSpawned) this.onSpecialSpawned(s.special);
          const cur = this.grid[s.r][s.c];
          if (cur) {
            cur.type = s.type;
            cur.special = s.special;
            cur.bombCountdown = null;
            cur.clearAlpha = void 0;
          } else {
            this.grid[s.r][s.c] = newCell(s.type, s.special);
          }
          this.score += SCORE.SPECIAL_SPAWN_BONUS;
          (_a = this.onScoreChanged) == null ? void 0 : _a.call(this, this.score, SCORE.SPECIAL_SPAWN_BONUS);
        }
      }
      this.clearingCells.clear();
      this._pendingSpawns = null;
      if (this.activationQueue.length > 0) {
        this.state = STATE.ACTIVATING_SPECIALS;
        this._afterActivations();
      } else {
        this._beginFall();
      }
    }
    _afterActivations() {
      var _a, _b, _c, _d;
      while (this.activationQueueIndex < this.activationQueue.length) {
        const a = this.activationQueue[this.activationQueueIndex++];
        const { cleared, chained } = activate(
          this.grid,
          a.r,
          a.c,
          a.special,
          a.partnerType,
          this.rng,
          a.partnerSpecial,
          a.type
        );
        const liveCells = [];
        for (const key of cleared) {
          const [lr, lc] = key.split(",").map(Number);
          const cell = this.grid[lr][lc];
          if (cell) liveCells.push({ r: lr, c: lc, type: cell.type, special: cell.special });
        }
        if (liveCells.length === 0) continue;
        const targets = [];
        for (const key of cleared) {
          const [tr, tc] = key.split(",").map(Number);
          if (tr === a.r && tc === a.c) continue;
          targets.push({ r: tr, c: tc });
        }
        (_a = this.onSpecialActivated) == null ? void 0 : _a.call(this, { r: a.r, c: a.c, special: a.special, targets });
        for (const ch of chained) this._queueActivation(ch);
        const { defuseBonus, coinMultiplier } = this._scanPassiveEffects(cleared);
        if (defuseBonus > 0) (_b = this.onBombsDefused) == null ? void 0 : _b.call(this, defuseBonus / SCORE.BOMB_DEFUSE_BONUS);
        this.cascadeDepth = Math.max(this.cascadeDepth, 1);
        const gainedScore = scoreForClear(cleared.size, this.cascadeDepth) * coinMultiplier + defuseBonus;
        this.score += gainedScore;
        this.clearingCells = new Set(cleared);
        (_c = this.onMatchCleared) == null ? void 0 : _c.call(this, liveCells, this.cascadeDepth);
        (_d = this.onScoreChanged) == null ? void 0 : _d.call(this, this.score, gainedScore);
        const ACTIVATION_STAGGER_MS = 28;
        const sortedKeys = [...cleared].sort((a2, b) => {
          const [ar, ac] = a2.split(",").map(Number);
          const [br, bc] = b.split(",").map(Number);
          return ar - br || ac - bc;
        });
        for (let i = 0; i < sortedKeys.length; i++) {
          this._tweenClear(sortedKeys[i], TIMING.CLEAR, null, i * ACTIVATION_STAGGER_MS);
        }
        this.state = STATE.RESOLVING;
        return;
      }
      this.activationQueue = [];
      this.activationQueueIndex = 0;
      this._beginFall();
    }
    _beginFall() {
      var _a, _b;
      if (this._bombTickPending) {
        this._bombTickPending = false;
        let bombTicked = false;
        const exploded = tickBombs(this.grid, null, () => {
          bombTicked = true;
        });
        if (bombTicked) (_a = this.onBombTick) == null ? void 0 : _a.call(this);
        for (const e of exploded) {
          (_b = this.onBombExploded) == null ? void 0 : _b.call(this, e);
          this.grid[e.r][e.c] = null;
        }
      }
      this.gravityDir = this.gravityFlipNext ? "up" : "down";
      this.gravityFlipNext = false;
      const moves2 = applyGravity(this.grid, this.gravityDir);
      if (moves2.length === 0) {
        this._beginSpawn();
        return;
      }
      for (const m of moves2) {
        this._tweenCellFallTo(m.cell, m.from, m.to, TIMING.FALL);
      }
      this.state = STATE.FALLING;
    }
    _afterFall() {
      this._beginSpawn();
    }
    _beginSpawn() {
      const spawns = spawnNew(this.grid, this.rng, this.gravityDir, this.spawnOpts);
      if (spawns.length === 0) {
        this._afterSpawn();
        return;
      }
      for (const s of spawns) {
        this._tweenCellFallTo(s.cell, { r: s.fromY, c: s.c }, { r: s.r, c: s.c }, TIMING.FALL);
      }
      this.state = STATE.SPAWNING;
    }
    _afterSpawn() {
      var _a, _b;
      const { cleared, toSpawn } = findMatches(this.grid, null);
      if (cleared.size > 0) {
        this.cascadeDepth++;
        this._beginResolve(cleared, toSpawn);
        return;
      }
      if (!hasAnyValidMove(this.grid)) {
        reshuffle(this.grid, this.rng);
        (_a = this.onReshuffle) == null ? void 0 : _a.call(this);
      }
      this.state = STATE.IDLE;
      (_b = this.onIdleReached) == null ? void 0 : _b.call(this);
    }
    // Passive-special scan over a cleared set, shared by _beginResolve and
    // _afterActivations: TIME_BOMB → defuse credit, GRAVITY → flip the next
    // fall, COIN → score multiplier for the wave. Only LIVE cells count (an
    // already-nulled cell has no special left to honor).
    _scanPassiveEffects(cleared) {
      var _a;
      let defuseBonus = 0;
      let coinMultiplier = 1;
      for (const key of cleared) {
        const [r, c] = key.split(",").map(Number);
        const cell = (_a = this.grid[r]) == null ? void 0 : _a[c];
        if (!cell) continue;
        if (cell.special === SPECIAL.TIME_BOMB) defuseBonus += SCORE.BOMB_DEFUSE_BONUS;
        if (cell.special === SPECIAL.GRAVITY) this.gravityFlipNext = true;
        if (cell.special === SPECIAL.COIN) coinMultiplier *= COIN_MULTIPLIER;
      }
      return { defuseBonus, coinMultiplier };
    }
    // Queue a special activation unless an unprocessed entry already targets
    // the same cell. Without the dedupe, a color bomb (or swap partner) that
    // is queued explicitly by _afterSwap AND found again by _beginResolve's
    // cleared-set scan fires twice — the duplicate CB entry has no partnerType
    // and falls back to clearing its own color across the whole board.
    _queueActivation(entry2) {
      if (this._hasQueuedActivationAt(entry2.r, entry2.c)) return false;
      this.activationQueue.push(entry2);
      return true;
    }
    _hasQueuedActivationAt(r, c) {
      for (let i = this.activationQueueIndex; i < this.activationQueue.length; i++) {
        const q = this.activationQueue[i];
        if (q.r === r && q.c === c) return true;
      }
      return false;
    }
    // Scene-entrance animation: every cell drops in from above into its final
    // row, with a small per-column stagger so the board reads as a wave rather
    // than a single thud. Blocks input until the last gem lands.
    playEntryAnimation() {
      var _a;
      const rows = this.grid.length;
      const cols = ((_a = this.grid[0]) == null ? void 0 : _a.length) || 0;
      this.state = STATE.FALLING;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = this.grid[r][c];
          if (!cell) continue;
          const fromRow = r - rows - 1;
          const colStagger = c * 18;
          const rowStagger = r * 12;
          cell.renderRow = fromRow;
          cell.renderCol = c;
          const tween = new Tween({
            from: 0,
            to: 1,
            duration: TIMING.FALL * 1.4,
            delay: colStagger + rowStagger,
            ease: easings.easeInQuad,
            onUpdate: (k) => {
              cell.renderRow = fromRow + (r - fromRow) * k;
            },
            onDone: () => {
              cell.renderRow = null;
              cell.renderCol = null;
              this.anims.delete(cell.id);
              this._startSquash(cell, 1.2);
            }
          });
          this.anims.set(cell.id, { tween, kind: "entry" });
        }
      }
    }
  };

  // src/dragInput.js
  var COMMIT_THRESHOLD = 0.35;
  var grid = null;
  var cascade = null;
  var active2 = null;
  function bind(g, c) {
    grid = g;
    cascade = c;
    active2 = null;
  }
  function unbind() {
    if (active2) clearRender(active2.cellRef);
    grid = null;
    cascade = null;
    active2 = null;
  }
  function handle(type, x, y) {
    if (type === "down") down(x, y);
    else if (type === "up") up(x, y);
    else if (type === "cancel") cancel();
  }
  function down(x, y) {
    if (!grid || !cascade || cascade.state !== STATE.IDLE) return;
    const cell = screenToCell(x, y);
    if (!cell) return;
    const cellRef = grid[cell.r][cell.c];
    if (!cellRef) return;
    active2 = {
      source: cell,
      startX: x,
      startY: y,
      cellRef
    };
    cellRef.scaleX = 1.08;
    cellRef.scaleY = 1.08;
  }
  function move(x, y) {
    if (!active2) return;
    const cs = getCellSize();
    const dx = (x - active2.startX) / cs;
    const dy = (y - active2.startY) / cs;
    let mx = 0, my = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
      mx = clamp(dx, -1, 1);
    } else {
      my = clamp(dy, -1, 1);
    }
    if (mx > 0 && active2.source.c === GRID - 1) mx = 0;
    if (mx < 0 && active2.source.c === 0) mx = 0;
    if (my > 0 && active2.source.r === GRID - 1) my = 0;
    if (my < 0 && active2.source.r === 0) my = 0;
    active2.cellRef.renderRow = active2.source.r + my;
    active2.cellRef.renderCol = active2.source.c + mx;
  }
  function up(x, y) {
    if (!active2) return;
    if (!cascade || cascade.state !== STATE.IDLE) {
      active2.cellRef.renderRow = null;
      active2.cellRef.renderCol = null;
      active2.cellRef.scaleX = 1;
      active2.cellRef.scaleY = 1;
      active2 = null;
      return;
    }
    const cs = getCellSize();
    const dx = (x - active2.startX) / cs;
    const dy = (y - active2.startY) / cs;
    let target2 = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > COMMIT_THRESHOLD) target2 = { r: active2.source.r, c: active2.source.c + 1 };
      else if (dx < -COMMIT_THRESHOLD) target2 = { r: active2.source.r, c: active2.source.c - 1 };
    } else {
      if (dy > COMMIT_THRESHOLD) target2 = { r: active2.source.r + 1, c: active2.source.c };
      else if (dy < -COMMIT_THRESHOLD) target2 = { r: active2.source.r - 1, c: active2.source.c };
    }
    const inBounds = target2 && target2.r >= 0 && target2.r < GRID && target2.c >= 0 && target2.c < GRID;
    if (active2.cellRef) {
      active2.cellRef.scaleX = 1;
      active2.cellRef.scaleY = 1;
    }
    if (inBounds) {
      if (cascade.tryStartSwap(active2.source, target2)) swapClick();
      else invalidBuzz();
    } else {
      if (cascade && cascade.bounceBack) {
        cascade.bounceBack(active2.source);
      } else {
        active2.cellRef.renderRow = null;
        active2.cellRef.renderCol = null;
      }
    }
    active2 = null;
  }
  function clearRender(a) {
    a.renderRow = null;
    a.renderCol = null;
    a.scaleX = 1;
    a.scaleY = 1;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function cancel() {
    if (active2) clearRender(active2.cellRef);
    active2 = null;
  }

  // src/dialogs.js
  var active3 = null;
  var buttons = [];
  var cursorX = 0;
  var cursorY = 0;
  function isOpen() {
    return !!active3;
  }
  function consumeBack() {
    if (!active3) return false;
    settle(false);
    return true;
  }
  function confirm(message, opts = {}) {
    return open({
      kind: "confirm",
      message,
      confirmLabel: opts.confirmLabel || t("common.ok"),
      cancelLabel: opts.cancelLabel || t("common.cancel")
    });
  }
  function alert(message, opts = {}) {
    return open({
      kind: "alert",
      message,
      confirmLabel: opts.okLabel || t("common.close")
    });
  }
  function open(config) {
    if (active3) settle(false);
    cancel();
    if (typeof window !== "undefined") window.addEventListener("keydown", onKeydown);
    return new Promise((resolve) => {
      active3 = { ...config, resolve };
      buttons = [];
    });
  }
  function settle(value) {
    if (!active3) return;
    const resolve = active3.resolve;
    active3 = null;
    buttons = [];
    if (typeof window !== "undefined") window.removeEventListener("keydown", onKeydown);
    resolve(value);
  }
  function draw6() {
    if (!active3) return;
    const { w, h } = getViewport();
    const ctx4 = ctxRef();
    buttons = [];
    ctx4.save();
    ctx4.fillStyle = "rgba(0,0,0,0.68)";
    ctx4.fillRect(0, 0, w, h);
    const panelW = Math.min(420, w - 32);
    const panelX = (w - panelW) / 2;
    const lines = wrapText(ctx4, active3.message || "", panelW - 48, "17px -apple-system, system-ui, sans-serif");
    const panelH = Math.max(170, 84 + lines.length * 24 + 54);
    const panelY = Math.max(18, (h - panelH) / 2);
    roundRect(ctx4, panelX, panelY, panelW, panelH, 14);
    ctx4.fillStyle = "#1a1530";
    ctx4.fill();
    ctx4.strokeStyle = "rgba(255,255,255,0.12)";
    ctx4.lineWidth = 1.5;
    ctx4.stroke();
    ctx4.fillStyle = "#f3f0ff";
    ctx4.font = "17px -apple-system, system-ui, sans-serif";
    ctx4.textAlign = "center";
    ctx4.textBaseline = "top";
    let y = panelY + 28;
    for (const line of lines) {
      ctx4.fillText(line, panelX + panelW / 2, y);
      y += 24;
    }
    ctx4.restore();
    const btnH = 42;
    const gap = 12;
    if (active3.kind === "confirm") {
      const btnW = Math.min(150, (panelW - 64 - gap) / 2);
      const bx = panelX + panelW / 2 - btnW - gap / 2;
      const by = panelY + panelH - btnH - 24;
      drawHitButton(
        bx,
        by,
        btnW,
        btnH,
        active3.cancelLabel,
        () => settle(false),
        buttons,
        cursorX,
        cursorY
      );
      drawHitButton(
        bx + btnW + gap,
        by,
        btnW,
        btnH,
        active3.confirmLabel,
        () => settle(true),
        buttons,
        cursorX,
        cursorY
      );
    } else {
      const btnW = Math.min(180, panelW - 64);
      drawHitButton(
        panelX + panelW / 2 - btnW / 2,
        panelY + panelH - btnH - 24,
        btnW,
        btnH,
        active3.confirmLabel,
        () => settle(true),
        buttons,
        cursorX,
        cursorY
      );
    }
  }
  function handlePointer(evt) {
    if (!active3) return false;
    if (evt.type !== "down") return true;
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
        b.onClick();
        return true;
      }
    }
    return true;
  }
  function onMove(x, y) {
    cursorX = x;
    cursorY = y;
  }
  function onKeydown(e) {
    if (!active3) return;
    if (e.key === "Escape") {
      e.preventDefault();
      settle(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      settle(true);
    }
  }
  function wrapText(ctx4, text, maxW, font) {
    ctx4.save();
    ctx4.font = font;
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx4.measureText(candidate).width <= maxW || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    ctx4.restore();
    return lines.length ? lines : [""];
  }

  // src/scenes/title.js
  var title_exports = {};
  __export(title_exports, {
    draw: () => draw7,
    enter: () => enter,
    exit: () => exit,
    onMove: () => onMove2,
    onPointer: () => onPointer,
    update: () => update6
  });

  // src/dailyMeta.js
  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function dailyStreak(history2, todayIso) {
    if (!history2) return 0;
    const cursor = parseISO(todayIso);
    if (!history2[todayIso]) cursor.setDate(cursor.getDate() - 1);
    let streak2 = 0;
    while (history2[todayISO(cursor)]) {
      streak2++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak2;
  }
  function msUntilNextDaily(now = /* @__PURE__ */ new Date()) {
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return nextMidnight - now;
  }
  function countdownParts(ms) {
    const totalMinutes = Math.max(0, Math.ceil(ms / 6e4));
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60
    };
  }
  function lastNDays(history2, n, todayIso) {
    var _a;
    const cursor = parseISO(todayIso);
    cursor.setDate(cursor.getDate() - (n - 1));
    const out = [];
    for (let i = 0; i < n; i++) {
      const iso = todayISO(cursor);
      out.push({ iso, entry: (_a = history2 == null ? void 0 : history2[iso]) != null ? _a : null });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }
  function buildShareText({ dateLabel, score, movesUsed, streak: streak2, url }) {
    const lines = [`\u{1F48E} Jeweled Daily \u2014 ${dateLabel}`];
    lines.push(movesUsed != null ? `\u{1F3C6} ${score} pts in ${movesUsed} moves` : `\u{1F3C6} ${score} pts`);
    if (streak2 >= 2) lines.push(`\u{1F525} ${streak2}-day streak`);
    if (url) lines.push(url);
    return lines.join("\n");
  }

  // src/levels.js
  var ICE_LAYOUTS = {
    // Four corners — gentle introduction.
    corners: [[0, 0], [0, 7], [7, 0], [7, 7]],
    // Center 2x2 block.
    core: [[3, 3], [3, 4], [4, 3], [4, 4]],
    // Full bottom row — gravity works against you.
    floor: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7]],
    // Diagonal band.
    diagonal: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]],
    // Ring around the center.
    ring: [[2, 2], [2, 3], [2, 4], [2, 5], [3, 2], [3, 5], [4, 2], [4, 5], [5, 2], [5, 3], [5, 4], [5, 5]]
  };
  var ICE_BY_LEVEL = {
    5: "corners",
    12: "core",
    18: "diagonal",
    25: "floor",
    33: "ring",
    42: "diagonal",
    47: "ring"
  };
  var HAND_TUNED = [
    // Tutorial / warm-up
    { moves: 30, targetScore: 500 },
    // 1
    { moves: 30, targetScore: 900 },
    // 2
    { moves: 30, targetScore: 1400 },
    // 3
    { moves: 28, targetScore: 2e3 },
    // 4
    { moves: 28, targetScore: 2700 },
    // 5
    { moves: 28, targetScore: 3500 },
    // 6
    { moves: 28, targetScore: 4400 },
    // 7
    { moves: 27, targetScore: 5400 },
    // 8
    { moves: 27, targetScore: 6500 },
    // 9
    { moves: 27, targetScore: 7700 },
    // 10
    // Mid-game
    { moves: 26, targetScore: 9e3 },
    // 11
    { moves: 26, targetScore: 10400 },
    // 12
    { moves: 26, targetScore: 11900 },
    // 13
    { moves: 26, targetScore: 13500 },
    // 14
    { moves: 25, targetScore: 15200 },
    // 15
    { moves: 25, targetScore: 17e3 },
    // 16
    { moves: 25, targetScore: 19e3 },
    // 17
    { moves: 25, targetScore: 21500 },
    // 18
    { moves: 25, targetScore: 24500 },
    // 19
    { moves: 25, targetScore: 28e3 },
    // 20
    // Advanced
    { moves: 25, targetScore: 32e3 },
    // 21
    { moves: 25, targetScore: 36500 },
    // 22
    { moves: 24, targetScore: 41500 },
    // 23
    { moves: 24, targetScore: 47e3 },
    // 24
    { moves: 24, targetScore: 53e3 },
    // 25
    { moves: 24, targetScore: 59500 },
    // 26
    { moves: 24, targetScore: 66500 },
    // 27
    { moves: 23, targetScore: 74e3 },
    // 28
    { moves: 23, targetScore: 82e3 },
    // 29
    { moves: 23, targetScore: 90500 },
    // 30
    { moves: 23, targetScore: 99500 },
    // 31
    { moves: 22, targetScore: 109e3 },
    // 32
    { moves: 22, targetScore: 119e3 },
    // 33
    { moves: 22, targetScore: 129500 },
    // 34
    { moves: 22, targetScore: 140500 },
    // 35
    // Expert
    { moves: 22, targetScore: 152e3 },
    // 36
    { moves: 21, targetScore: 164e3 },
    // 37
    { moves: 21, targetScore: 176500 },
    // 38
    { moves: 21, targetScore: 189500 },
    // 39
    { moves: 21, targetScore: 203e3 },
    // 40
    { moves: 21, targetScore: 217e3 },
    // 41
    { moves: 20, targetScore: 231500 },
    // 42
    { moves: 20, targetScore: 246500 },
    // 43
    { moves: 20, targetScore: 262e3 },
    // 44
    { moves: 20, targetScore: 278e3 },
    // 45
    // Master
    { moves: 20, targetScore: 294500 },
    // 46
    { moves: 20, targetScore: 311500 },
    // 47
    { moves: 20, targetScore: 329e3 },
    // 48
    { moves: 20, targetScore: 347e3 },
    // 49
    { moves: 20, targetScore: 365500 }
    // 50
  ];
  function genEndgame() {
    const out = [];
    let target2 = HAND_TUNED[HAND_TUNED.length - 1].targetScore;
    const layoutKeys = Object.keys(ICE_LAYOUTS);
    for (let i = 51; i <= 300; i++) {
      const rate = i <= 100 ? 1.045 : i <= 200 ? 1.02 : 1.01;
      target2 = Math.round(target2 * rate / 500) * 500;
      const def = { moves: 20, targetScore: target2 };
      if (i % 7 === 0) def.ice = ICE_LAYOUTS[layoutKeys[i / 7 % layoutKeys.length | 0]];
      out.push(def);
    }
    return out;
  }
  var LEVELS = [...HAND_TUNED, ...genEndgame()];
  for (const [lvl, key] of Object.entries(ICE_BY_LEVEL)) {
    LEVELS[Number(lvl) - 1] = { ...LEVELS[Number(lvl) - 1], ice: ICE_LAYOUTS[key] };
  }
  for (let i = 10; i <= LEVELS.length; i += 10) {
    LEVELS[i - 1] = { ...LEVELS[i - 1], boss: true };
  }
  var LEVELS_PER_PAGE = 20;
  function pageCount() {
    return Math.ceil(LEVELS.length / LEVELS_PER_PAGE);
  }
  function pageOfLevel(levelNum2) {
    return Math.ceil(levelNum2 / LEVELS_PER_PAGE);
  }
  function getLevel(n) {
    const i = Math.max(1, Math.min(LEVELS.length, n | 0));
    return LEVELS[i - 1];
  }
  function levelCount() {
    return LEVELS.length;
  }
  function starsFor(score, target2) {
    if (score < target2) return 0;
    if (score >= target2 * 2) return 3;
    if (score >= target2 * 1.5) return 2;
    return 1;
  }

  // src/puzzles.js
  var PUZZLES = [
    { id: 1, nameKey: "puzzle.1.name", hintKey: "puzzle.1.hint", moves: 10, goal: { type: "totalScore", amount: 200 } },
    { id: 2, nameKey: "puzzle.2.name", hintKey: "puzzle.2.hint", moves: 8, goal: { type: "clearGemsOfColor", color: 0, count: 10 } },
    { id: 3, nameKey: "puzzle.3.name", hintKey: "puzzle.3.hint", moves: 8, goal: { type: "clearGemsOfColor", color: 1, count: 12 } },
    { id: 4, nameKey: "puzzle.4.name", hintKey: "puzzle.4.hint", moves: 12, goal: { type: "createSpecial", special: SPECIAL.LINE_H, count: 2 } },
    { id: 5, nameKey: "puzzle.5.name", hintKey: "puzzle.5.hint", moves: 8, goal: { type: "cascadeDepth", depth: 2 } },
    { id: 6, nameKey: "puzzle.6.name", hintKey: "puzzle.6.hint", moves: 10, goal: { type: "totalScore", amount: 1500 } },
    { id: 7, nameKey: "puzzle.7.name", hintKey: "puzzle.7.hint", moves: 15, goal: { type: "createSpecial", special: SPECIAL.AREA_BOMB, count: 1 } },
    { id: 8, nameKey: "puzzle.8.name", hintKey: "puzzle.8.hint", moves: 12, goal: { type: "clearGemsOfColor", color: 4, count: 15 } },
    { id: 9, nameKey: "puzzle.9.name", hintKey: "puzzle.9.hint", moves: 18, goal: { type: "createSpecial", special: SPECIAL.COLOR_BOMB, count: 1 } },
    { id: 10, nameKey: "puzzle.10.name", hintKey: "puzzle.10.hint", moves: 8, goal: { type: "cascadeDepth", depth: 3 } },
    { id: 11, nameKey: "puzzle.11.name", hintKey: "puzzle.11.hint", moves: 20, goal: { type: "totalScore", amount: 5e3 } },
    { id: 12, nameKey: "puzzle.12.name", hintKey: "puzzle.12.hint", moves: 10, goal: { type: "cascadeDepth", depth: 4 } },
    // Hand-laid boards (verified by tests: no pre-match, ≥1 valid move, and the
    // designed solution achieves the goal).
    {
      id: 13,
      nameKey: "puzzle.13.name",
      hintKey: "puzzle.13.hint",
      moves: 6,
      goal: { type: "createSpecial", special: SPECIAL.AREA_BOMB, count: 1 },
      board: ["01230123", "23052301", "01250123", "23515301", "01250123", "23012301", "01230123", "23012301"]
    },
    {
      id: 14,
      nameKey: "puzzle.14.name",
      hintKey: "puzzle.14.hint",
      moves: 8,
      goal: { type: "createSpecial", special: SPECIAL.LINE_H, count: 2 },
      board: ["01230123", "23012301", "06636123", "23062301", "01234123", "23442401", "01230123", "23012301"]
    },
    {
      id: 15,
      nameKey: "puzzle.15.name",
      hintKey: "puzzle.15.hint",
      moves: 1,
      goal: { type: "cascadeDepth", depth: 2 },
      board: ["01230123", "23012301", "01230123", "23612301", "01530123", "23512301", "06460123", "23512301"]
    }
  ];
  function getPuzzle(id) {
    return PUZZLES.find((p) => p.id === id);
  }
  function isGoalMet(goal, progress2) {
    switch (goal.type) {
      case "totalScore":
        return progress2.score >= goal.amount;
      case "clearGemsOfColor":
        return (progress2.clearedByColor[goal.color] || 0) >= goal.count;
      case "createSpecial":
        return countSpecial(progress2, goal.special) >= goal.count;
      case "cascadeDepth":
        return progress2.maxCascadeDepth >= goal.depth;
      default:
        return false;
    }
  }
  function countSpecial(progress2, special) {
    if (special === SPECIAL.LINE_H || special === SPECIAL.LINE_V) {
      return (progress2.specialsCreated[SPECIAL.LINE_H] || 0) + (progress2.specialsCreated[SPECIAL.LINE_V] || 0);
    }
    return progress2.specialsCreated[special] || 0;
  }
  var SPECIAL_KEYS = {
    [SPECIAL.LINE_H]: "special.lineGem",
    [SPECIAL.LINE_V]: "special.lineGem",
    [SPECIAL.COLOR_BOMB]: "special.colorBomb",
    [SPECIAL.AREA_BOMB]: "special.areaBomb",
    [SPECIAL.STAR]: "special.star"
  };
  function goalText(goal) {
    switch (goal.type) {
      case "totalScore":
        return t("puzzle.goal.totalScore", { amount: formatNumber(goal.amount) });
      case "clearGemsOfColor":
        return t("puzzle.goal.clearGemsOfColor", { count: goal.count, color: t(`color.${goal.color}`) });
      case "createSpecial":
        return t("puzzle.goal.createSpecial", {
          count: goal.count,
          special: t(SPECIAL_KEYS[goal.special] || "special.generic")
        });
      case "cascadeDepth":
        return t("puzzle.goal.cascadeDepth", { depth: goal.depth });
      default:
        return "???";
    }
  }
  function progressText(goal, progress2) {
    switch (goal.type) {
      case "totalScore":
        return t("puzzle.progress.totalScore", {
          score: formatNumber(progress2.score),
          amount: formatNumber(goal.amount)
        });
      case "clearGemsOfColor":
        return t("puzzle.progress.clearGemsOfColor", {
          cleared: progress2.clearedByColor[goal.color] || 0,
          count: goal.count
        });
      case "createSpecial":
        return t("puzzle.progress.createSpecial", {
          cleared: countSpecial(progress2, goal.special),
          count: goal.count
        });
      case "cascadeDepth":
        return t("puzzle.progress.cascadeDepth", {
          best: progress2.maxCascadeDepth || 0,
          depth: goal.depth
        });
      default:
        return "";
    }
  }

  // src/build.js
  var BUILD = "dev";

  // src/scenes/title.js
  var buttons2 = [];
  var nameInputWrap = null;
  var settingsOpen = false;
  var cursorX2 = 0;
  var cursorY2 = 0;
  var needsNameEntry = false;
  var press = createPressTracker();
  function enter() {
    document.body.className = "";
    buttons2 = [];
    press.cancel();
    settingsOpen = false;
    const profile = getProfile();
    needsNameEntry = !profile.playerName;
    if (needsNameEntry) showNameEntry();
  }
  function exit() {
    hideNameEntry();
    hideImportEntry();
    settingsOpen = false;
  }
  function update6(dt) {
  }
  function draw7() {
    var _a, _b, _c;
    const { w, h } = getViewport();
    clearFrame();
    buttons2 = [];
    const state = load();
    const profile = state.profile;
    const btnW = Math.min(360, w - 40);
    let continueMode = null;
    let continueState = null;
    for (const mode of ["zen", "classic"]) {
      const ss = (_a = state[mode]) == null ? void 0 : _a.saveState;
      if (!ss) continue;
      if (!continueState || String(ss.savedAt || "") > String(continueState.savedAt || "")) {
        continueMode = mode;
        continueState = ss;
      }
    }
    const buttonCount = (continueState ? 1 : 0) + 5 + 1;
    const isShort = h < 760;
    const btnH = isShort ? 52 : layout.isNarrow ? 56 : 62;
    const btnGap = isShort ? 8 : 10;
    const subBtnH = Math.max(40, btnH - 12);
    const hmCell = isShort ? 11 : 14;
    const hmGap = isShort ? 2 : 3;
    const hmWeeks = 12, hmDays = 7;
    const hmW = hmWeeks * (hmCell + hmGap) - hmGap;
    const hmH = hmDays * (hmCell + hmGap) - hmGap;
    const labelH = isShort ? 20 : 24;
    const titleFontPx = layout.isNarrow ? 40 : 56;
    const titleH = titleFontPx + 14;
    const welcomeH = 28;
    const titleBlockH = titleH + (needsNameEntry ? 0 : welcomeH);
    const buttonsH = (buttonCount - 1) * btnH + subBtnH + (buttonCount - 1) * btnGap;
    const heatmapBlockH = hmH + labelH;
    const preButtonsGap = isShort ? 16 : 24;
    const preHeatmapGap = isShort ? 14 : 20;
    const totalH = titleBlockH + preButtonsGap + buttonsH + preHeatmapGap + heatmapBlockH;
    const minTop = (isShort ? 20 : 40) + layout.safeTop;
    let y = Math.max(minTop, Math.floor((h - totalH) / 2));
    drawBrandTitle(t("title.brand"), w / 2, y, titleFontPx);
    y += titleH;
    if (!needsNameEntry) {
      drawText(t("title.welcomeBack", { name: profile.playerName }), w / 2, y, {
        font: `${responsiveFont(18)}px -apple-system, system-ui, sans-serif`,
        align: "center",
        color: "rgba(255,255,255,0.7)"
      });
      y += welcomeH;
    }
    y += preButtonsGap;
    const CONTINUE_SCENES = { zen: "gameZen", classic: "gameClassic" };
    if (continueState && CONTINUE_SCENES[continueMode]) {
      const label = continueMode === "classic" ? t("title.continueClassic") : t("title.continueZen");
      const subtitle = continueMode === "classic" ? t("title.continueSubtitleClassic", { level: continueState.level, score: formatNumber(continueState.score) }) : t("title.continueSubtitleZen", { score: formatNumber(continueState.score) });
      const x = (w - btnW) / 2;
      drawHitButton2(x, y, btnW, btnH, label, () => {
        setScene(CONTINUE_SCENES[continueMode], { restoreFrom: continueState });
      }, { subtitle });
      y += btnH + btnGap;
    }
    {
      const x = (w - btnW) / 2;
      const subtitle = state.zen.bestScore > 0 ? t("title.zenBest", { score: formatNumber(state.zen.bestScore) }) : t("title.zenEndless");
      drawHitButton2(x, y, btnW, btnH, t("title.zen"), () => setScene("gameZen"), { subtitle });
      y += btnH + btnGap;
    }
    {
      const x = (w - btnW) / 2;
      const totalStars = Object.values(state.classic.levels).reduce((s, l) => s + (l.starsEarned || 0), 0);
      const subtitle = t("title.classicSubtitle", {
        current: state.classic.highestUnlocked,
        total: levelCount(),
        stars: totalStars
      });
      drawHitButton2(x, y, btnW, btnH, t("title.classic"), () => setScene("levelSelect"), { subtitle });
      y += btnH + btnGap;
    }
    {
      const x = (w - btnW) / 2;
      const today = todayISO();
      const formattedToday = formatDate(today, layout.isNarrow ? { year: "numeric", month: "numeric", day: "numeric" } : void 0);
      const submitted = state.daily.todaySubmittedDate === today;
      let subtitle;
      if (submitted) {
        const parts = countdownParts(msUntilNextDaily());
        subtitle = `${t("title.dailySubtitleDone", { date: formattedToday })}  \xB7  ${t("title.dailyNext", { h: parts.hours, m: parts.minutes })}`;
      } else {
        subtitle = t("title.dailySubtitle", { date: formattedToday });
        const streak2 = dailyStreak(state.daily.history || {}, today);
        if (streak2 >= 2) subtitle += `  \xB7  ${t("daily.streak", { n: streak2 })}`;
      }
      drawHitButton2(x, y, btnW, btnH, t("title.daily"), () => setScene("gameDaily"), { subtitle });
      y += btnH + btnGap;
    }
    {
      const x = (w - btnW) / 2;
      const subtitle = ((_b = state.blitz) == null ? void 0 : _b.bestScore) > 0 ? t("title.blitzSubtitleBest", { score: formatNumber(state.blitz.bestScore) }) : t("title.blitzSubtitle");
      drawHitButton2(x, y, btnW, btnH, t("title.blitz"), () => setScene("gameBlitz"), { subtitle });
      y += btnH + btnGap;
    }
    {
      const x = (w - btnW) / 2;
      const done = Object.keys(((_c = state.puzzle) == null ? void 0 : _c.completed) || {}).length;
      const subtitle = t("title.puzzlesSubtitle", { done, total: PUZZLES.length });
      drawHitButton2(x, y, btnW, btnH, t("title.puzzles"), () => setScene("puzzleSelect"), { subtitle });
      y += btnH + btnGap;
    }
    {
      const x = (w - btnW) / 2;
      const subW = Math.floor((btnW - btnGap) / 2);
      drawHitButton2(
        x,
        y,
        subW,
        subBtnH,
        t("title.stats"),
        () => setScene("stats"),
        { kind: "secondary" }
      );
      drawHitButton2(
        x + subW + btnGap,
        y,
        subW,
        subBtnH,
        t("title.settings"),
        () => {
          settingsOpen = !settingsOpen;
        },
        { kind: "secondary" }
      );
      y += subBtnH + btnGap;
    }
    y += preHeatmapGap - btnGap;
    drawHeatmap(state.playHistory, Math.floor((w - hmW) / 2), y, hmWeeks, hmDays, hmCell, hmGap);
    const sab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sab")) || 0;
    drawText(BUILD, w - 10, h - 6 - sab, {
      font: "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      color: "rgba(255,255,255,0.25)",
      align: "right",
      baseline: "bottom"
    });
    if (settingsOpen) drawSettingsOverlay();
  }
  function drawBrandTitle(text, cx, y, fontPx) {
    const ctx4 = ctxRef();
    const t2 = clockMs() / 1e3;
    ctx4.save();
    ctx4.font = `900 ${fontPx}px -apple-system, system-ui, sans-serif`;
    ctx4.textAlign = "center";
    ctx4.textBaseline = "top";
    const textW = ctx4.measureText(text).width;
    const pulse = 0.5 + 0.5 * Math.sin(t2 * 1.4);
    ctx4.shadowColor = `rgba(180, 110, 255, ${0.55 + pulse * 0.3})`;
    ctx4.shadowBlur = 22 + pulse * 12;
    ctx4.shadowOffsetY = 2;
    const pan = Math.sin(t2 * 0.5) * (textW * 0.4);
    const grad = ctx4.createLinearGradient(cx - textW + pan, 0, cx + textW + pan, 0);
    grad.addColorStop(0, "#ff9ec0");
    grad.addColorStop(0.25, "#d59bff");
    grad.addColorStop(0.5, "#8fd1ff");
    grad.addColorStop(0.75, "#d59bff");
    grad.addColorStop(1, "#ff9ec0");
    ctx4.fillStyle = grad;
    ctx4.fillText(text, cx, y);
    ctx4.shadowBlur = 0;
    ctx4.shadowOffsetY = 0;
    ctx4.fillText(text, cx, y);
    ctx4.strokeStyle = "rgba(255,255,255,0.35)";
    ctx4.lineWidth = 1;
    ctx4.strokeText(text, cx, y);
    ctx4.restore();
  }
  function drawHitButton2(x, y, w, h, label, onClick, opts = {}) {
    drawHitButton(x, y, w, h, label, onClick, buttons2, cursorX2, cursorY2, opts);
  }
  function drawHeatmap(history2, x, y, weeks, days, cell = 14, gap = 3) {
    const ctx4 = ctxRef();
    const now = /* @__PURE__ */ new Date();
    const totalDays = weeks * days;
    ctx4.save();
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (totalDays - 1 - i));
      const iso = todayISO(d);
      const col = Math.floor(i / days);
      const row = i % days;
      const entry2 = history2[iso];
      const runs = (entry2 == null ? void 0 : entry2.runs) || 0;
      let color;
      if (runs === 0) color = "rgba(255,255,255,0.08)";
      else if (runs === 1) color = "rgba(124, 58, 237, 0.4)";
      else if (runs <= 3) color = "rgba(124, 58, 237, 0.7)";
      else color = "rgba(124, 58, 237, 1)";
      ctx4.fillStyle = color;
      ctx4.fillRect(x + col * (cell + gap), y + row * (cell + gap), cell, cell);
    }
    ctx4.restore();
    const w = weeks * (cell + gap) - gap;
    drawText(t("title.streak"), x + w / 2, y + days * (cell + gap) + 4, {
      font: "11px -apple-system, system-ui, sans-serif",
      color: "rgba(255,255,255,0.5)",
      align: "center"
    });
  }
  function drawSettingsOverlay() {
    const { w, h } = getViewport();
    const ctx4 = ctxRef();
    ctx4.fillStyle = "rgba(0,0,0,0.65)";
    ctx4.fillRect(0, 0, w, h);
    const panelW = Math.min(380, w - 40);
    const panelH = Math.min(560, h - 24);
    const px = (w - panelW) / 2;
    const py = (h - panelH) / 2;
    roundRect(ctx4, px, py, panelW, panelH, 16);
    ctx4.fillStyle = "#1a1530";
    ctx4.fill();
    ctx4.strokeStyle = "rgba(255,255,255,0.1)";
    ctx4.stroke();
    drawText(t("settings.title"), px + panelW / 2, py + 18, {
      font: "bold 22px -apple-system, system-ui, sans-serif",
      align: "center"
    });
    const settings = getSettings();
    let ty = py + 54;
    const rowH = 40;
    drawToggle(px + 20, ty, panelW - 40, t("settings.haptic"), settings.haptic, () => {
      saveKey("settings", { haptic: !settings.haptic });
    });
    ty += rowH;
    drawToggle(px + 20, ty, panelW - 40, t("settings.sound"), settings.sound !== false, () => {
      const next = !(settings.sound !== false);
      saveKey("settings", { sound: next });
      setEnabled(next);
    });
    ty += rowH;
    drawToggle(px + 20, ty, panelW - 40, t("settings.paintingMode"), settings.paintingMode, () => {
      saveKey("settings", { paintingMode: !settings.paintingMode });
    });
    ty += rowH;
    drawGemStyleRow(px + 20, ty, panelW - 40, settings);
    ty += rowH + 8;
    {
      const half = (panelW - 40 - 10) / 2;
      drawHitButton2(px + 20, ty, half, 36, t("settings.gempedia"), () => {
        settingsOpen = false;
        setScene("gempedia");
      }, { kind: "settings" });
      drawHitButton2(px + 20 + half + 10, ty, half, 36, t("zen.gallery"), () => {
        settingsOpen = false;
        setScene("gallery");
      }, { kind: "settings" });
      ty += 46;
    }
    {
      const half = (panelW - 40 - 10) / 2;
      drawHitButton2(
        px + 20,
        ty,
        half,
        36,
        t("settings.exportSave"),
        exportSave,
        { kind: "settings", activateOnUp: true }
      );
      drawHitButton2(
        px + 20 + half + 10,
        ty,
        half,
        36,
        t("settings.importSave"),
        () => {
          showImportEntry();
        },
        { kind: "settings" }
      );
      ty += 46;
    }
    drawHitButton2(px + 20, ty, panelW - 40, 36, t("settings.resetProgress"), async () => {
      if (await confirm(t("settings.resetConfirm"))) {
        reset();
        init();
        setEnabled(getSettings().sound !== false);
        setGemStyle(getSettings().gemStyle);
        needsNameEntry = false;
        settingsOpen = false;
      }
    }, { kind: "settings" });
    drawHitButton2(px + panelW / 2 - 60, py + panelH - 46, 120, 34, t("settings.close"), () => {
      settingsOpen = false;
    }, { kind: "settings" });
  }
  async function exportSave() {
    var _a;
    const code = exportString();
    try {
      if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) {
        await navigator.clipboard.writeText(code);
        await alert(t("settings.exportCopied"));
        return;
      }
    } catch {
    }
    showImportEntry(code);
  }
  function drawGemStyleRow(x, y, w, settings) {
    drawText(t("settings.gemStyle"), x, y + 10, {
      font: "15px -apple-system, system-ui, sans-serif"
    });
    const labelW = 90;
    const pillsX = x + labelW;
    const pillsW = w - labelW;
    const ctx4 = ctxRef();
    const active4 = settings.gemStyle === "shapes" ? "shapes" : "color";
    const options = [
      { key: "color", label: t("settings.gemStyleColor") },
      { key: "shapes", label: t("settings.gemStyleShapes") }
    ];
    const pillW = (pillsW - 6) / options.length;
    const pillH = 30;
    const py = y + 6;
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const pillX = pillsX + i * (pillW + 6);
      ctx4.save();
      roundRect(ctx4, pillX, py, pillW, pillH, 8);
      ctx4.fillStyle = active4 === opt.key ? "#7c3aed" : "rgba(255,255,255,0.10)";
      ctx4.fill();
      ctx4.fillStyle = "#fff";
      ctx4.font = "13px -apple-system, system-ui, sans-serif";
      ctx4.textAlign = "center";
      ctx4.textBaseline = "middle";
      ctx4.fillText(opt.label, pillX + pillW / 2, py + pillH / 2);
      ctx4.restore();
      buttons2.push({
        x: pillX,
        y: py,
        w: pillW,
        h: pillH,
        kind: "settings",
        onClick: () => {
          saveKey("settings", { gemStyle: opt.key });
          setGemStyle(opt.key);
        }
      });
    }
  }
  function drawToggle(x, y, w, label, value, onClick) {
    const ctx4 = ctxRef();
    drawText(label, x, y + 10, { font: "15px -apple-system, system-ui, sans-serif" });
    const toggleW = 50, toggleH = 26;
    const tx = x + w - toggleW, ty = y + 8;
    ctx4.save();
    roundRect(ctx4, tx, ty, toggleW, toggleH, 13);
    ctx4.fillStyle = value ? "#7c3aed" : "rgba(255,255,255,0.15)";
    ctx4.fill();
    ctx4.fillStyle = "#fff";
    ctx4.beginPath();
    ctx4.arc(tx + (value ? toggleW - toggleH / 2 : toggleH / 2), ty + toggleH / 2, toggleH / 2 - 3, 0, Math.PI * 2);
    ctx4.fill();
    ctx4.restore();
    buttons2.push({ x: tx, y: ty, w: toggleW, h: toggleH, onClick, kind: "settings" });
  }
  function onPointer(evt) {
    if (nameInputWrap || importInputWrap) {
      press.cancel();
      return;
    }
    if (evt.type === "up") {
      press.release(evt.x, evt.y);
      return;
    }
    if (evt.type !== "down") {
      press.cancel();
      return;
    }
    const activate2 = (b) => b.activateOnUp ? press.arm(b) : b.onClick();
    if (settingsOpen) {
      for (let i = buttons2.length - 1; i >= 0; i--) {
        const b = buttons2[i];
        if (b.kind !== "settings") continue;
        if (hitTest(b, evt.x, evt.y)) {
          activate2(b);
          return;
        }
      }
      settingsOpen = false;
      return;
    }
    for (let i = buttons2.length - 1; i >= 0; i--) {
      const b = buttons2[i];
      if (hitTest(b, evt.x, evt.y)) {
        activate2(b);
        return;
      }
    }
  }
  function onMove2(x, y) {
    cursorX2 = x;
    cursorY2 = y;
  }
  function showNameEntry() {
    if (nameInputWrap) return;
    nameInputWrap = document.createElement("div");
    nameInputWrap.id = "name-input-wrap";
    const card = document.createElement("div");
    const label = document.createElement("label");
    label.setAttribute("for", "name-input");
    label.textContent = t("name_entry.label");
    const input = document.createElement("input");
    input.id = "name-input";
    input.type = "text";
    input.maxLength = NAME_MAX_LEN;
    input.autocomplete = "off";
    input.autofocus = true;
    const submit = document.createElement("button");
    submit.id = "name-submit";
    submit.textContent = t("name_entry.start");
    card.appendChild(label);
    card.appendChild(input);
    card.appendChild(submit);
    nameInputWrap.appendChild(card);
    document.body.appendChild(nameInputWrap);
    setTimeout(() => input.focus(), 50);
    const tryCommit = () => {
      const name = input.value.trim().slice(0, NAME_MAX_LEN);
      if (!name) {
        input.focus();
        return;
      }
      saveKey("profile", { playerName: name });
      needsNameEntry = false;
      hideNameEntry();
    };
    submit.addEventListener("click", tryCommit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryCommit();
    });
  }
  function hideNameEntry() {
    if (nameInputWrap && nameInputWrap.parentNode) nameInputWrap.parentNode.removeChild(nameInputWrap);
    nameInputWrap = null;
  }
  var importInputWrap = null;
  function showImportEntry(prefill = "") {
    if (importInputWrap) return;
    importInputWrap = document.createElement("div");
    importInputWrap.id = "import-input-wrap";
    const card = document.createElement("div");
    const label = document.createElement("label");
    label.setAttribute("for", "import-input");
    label.textContent = prefill ? t("settings.exportManual") : t("settings.importLabel");
    const input = document.createElement("input");
    input.id = "import-input";
    input.type = "text";
    input.autocomplete = "off";
    if (prefill) {
      input.value = prefill;
      input.readOnly = true;
    }
    const ok = document.createElement("button");
    ok.textContent = prefill ? t("common.close") : t("settings.importApply");
    const cancel2 = document.createElement("button");
    cancel2.textContent = t("common.cancel");
    card.appendChild(label);
    card.appendChild(input);
    card.appendChild(ok);
    if (!prefill) card.appendChild(cancel2);
    importInputWrap.appendChild(card);
    document.body.appendChild(importInputWrap);
    setTimeout(() => {
      input.focus();
      if (prefill) input.select();
    }, 50);
    cancel2.addEventListener("click", hideImportEntry);
    ok.addEventListener("click", async () => {
      if (prefill) {
        hideImportEntry();
        return;
      }
      const res = importString(input.value);
      hideImportEntry();
      if (res.ok) {
        init();
        setEnabled(getSettings().sound !== false);
        setGemStyle(getSettings().gemStyle);
        needsNameEntry = false;
        settingsOpen = false;
        await alert(t("settings.importDone"));
      } else {
        await alert(t("settings.importBad"));
      }
    });
  }
  function hideImportEntry() {
    if (importInputWrap && importInputWrap.parentNode) importInputWrap.parentNode.removeChild(importInputWrap);
    importInputWrap = null;
  }

  // src/scenes/levelSelect.js
  var levelSelect_exports = {};
  __export(levelSelect_exports, {
    draw: () => draw8,
    enter: () => enter2,
    exit: () => exit2,
    onMove: () => onMove3,
    onPointer: () => onPointer2,
    update: () => update7
  });
  var buttons3 = [];
  var cursorX3 = 0;
  var cursorY3 = 0;
  var currentPage = 1;
  function enter2() {
    document.body.className = "";
    buttons3 = [];
    const state = load();
    currentPage = pageOfLevel(state.classic.highestUnlocked);
  }
  function exit2() {
  }
  function update7(dt) {
  }
  function draw8() {
    const { w, h } = getViewport();
    clearFrame();
    buttons3 = [];
    const totalPages = pageCount();
    const titleY = h * 0.06 + layout.safeTop;
    drawText(t("levelSelect.title"), w / 2, titleY, {
      font: `bold ${responsiveFont(28)}px -apple-system, system-ui, sans-serif`,
      align: "center"
    });
    drawText(t("levelSelect.page", { page: currentPage, total: totalPages }), w / 2, titleY + 32, {
      font: `${responsiveFont(14)}px -apple-system, system-ui, sans-serif`,
      align: "center",
      color: "rgba(255,255,255,0.6)"
    });
    const state = load();
    const highest = state.classic.highestUnlocked;
    const col = menuColumn();
    const cols = 4, rows = 5;
    const gap = layout.isNarrow ? 10 : 14;
    const maxCellW = layout.isNarrow ? 84 : 110;
    const topMargin = titleY + 70;
    const bottomMargin = 100;
    const availH = Math.max(1, h - topMargin - bottomMargin);
    const cellByW = Math.floor((col.w - (cols - 1) * gap) / cols);
    const cellByH = Math.floor((availH - (rows - 1) * gap) / rows);
    const cellW = Math.max(40, Math.min(maxCellW, cellByW, cellByH));
    const cellH = cellW;
    const totalW = cols * cellW + (cols - 1) * gap;
    const totalH = rows * cellH + (rows - 1) * gap;
    const ox = col.x + Math.floor((col.w - totalW) / 2);
    const oy = topMargin + Math.max(0, Math.floor((availH - totalH) / 2));
    const startLevel = (currentPage - 1) * LEVELS_PER_PAGE + 1;
    const endLevel = Math.min(LEVELS.length, currentPage * LEVELS_PER_PAGE);
    for (let ln = startLevel; ln <= endLevel; ln++) {
      const idx = ln - startLevel;
      const col2 = idx % cols, row = Math.floor(idx / cols);
      const x = ox + col2 * (cellW + gap);
      const y = oy + row * (cellH + gap);
      const data = state.classic.levels[String(ln)] || { starsEarned: 0, bestScore: 0 };
      const locked = ln > highest;
      drawLevelTile(x, y, cellW, cellH, ln, data, locked);
    }
    const ctrlY = h - 60;
    const btnW = layout.isNarrow ? 52 : 70;
    const btnH = 40;
    const prevX = w / 2 - btnW - 100;
    const nextX = w / 2 + 100;
    drawPaginationButton(prevX, ctrlY, btnW, btnH, "\u2190", currentPage > 1, () => {
      if (currentPage > 1) currentPage--;
    });
    drawPaginationButton(nextX, ctrlY, btnW, btnH, "\u2192", currentPage < totalPages, () => {
      if (currentPage < totalPages) currentPage++;
    });
    const backW = layout.isNarrow ? 56 : 76;
    const backY = 24 + layout.safeTop;
    drawHitButton3(
      col.right - backW,
      backY,
      backW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title")
    );
  }
  function drawLevelTile(x, y, w, h, ln, data, locked) {
    const hover = !locked && cursorX3 >= x && cursorX3 <= x + w && cursorY3 >= y && cursorY3 <= y + h;
    const ctx4 = ctxRef();
    ctx4.save();
    roundRect(ctx4, x, y, w, h, 12);
    ctx4.fillStyle = locked ? "rgba(40,40,60,0.5)" : hover ? "rgba(124,58,237,0.8)" : "rgba(60,50,100,0.8)";
    ctx4.fill();
    ctx4.strokeStyle = "rgba(255,255,255,0.1)";
    ctx4.stroke();
    ctx4.fillStyle = locked ? "#666" : "#fff";
    ctx4.font = `bold ${Math.floor(w * 0.3)}px -apple-system, system-ui, sans-serif`;
    ctx4.textAlign = "center";
    ctx4.textBaseline = "middle";
    ctx4.fillText(locked ? "\u{1F512}" : String(ln), x + w / 2, y + h * 0.35);
    if (!locked) {
      ctx4.font = `${Math.floor(w * 0.14)}px -apple-system, system-ui, sans-serif`;
      const n = Math.max(0, Math.min(3, data.starsEarned | 0));
      const stars = "\u2605".repeat(n) + "\u2606".repeat(3 - n);
      ctx4.fillStyle = "#ffd166";
      ctx4.fillText(stars, x + w / 2, y + h * 0.62);
      if (data.bestScore > 0) {
        ctx4.font = `${Math.floor(w * 0.1)}px -apple-system, system-ui, sans-serif`;
        ctx4.fillStyle = "rgba(255,255,255,0.7)";
        ctx4.fillText(formatNumber(data.bestScore), x + w / 2, y + h * 0.82);
      }
    }
    ctx4.restore();
    if (!locked) buttons3.push({ x, y, w, h, onClick: () => setScene("gameClassic", { level: ln }) });
  }
  function drawPaginationButton(x, y, w, h, label, enabled4, onClick) {
    const ctx4 = ctxRef();
    const hover = enabled4 && cursorX3 >= x && cursorX3 <= x + w && cursorY3 >= y && cursorY3 <= y + h;
    ctx4.save();
    roundRect(ctx4, x, y, w, h, 10);
    ctx4.fillStyle = !enabled4 ? "rgba(40,40,60,0.4)" : hover ? "rgba(124,58,237,0.85)" : "rgba(60,50,100,0.8)";
    ctx4.fill();
    ctx4.strokeStyle = "rgba(255,255,255,0.1)";
    ctx4.stroke();
    ctx4.fillStyle = enabled4 ? "#fff" : "#666";
    ctx4.font = `bold ${Math.floor(h * 0.5)}px -apple-system, system-ui, sans-serif`;
    ctx4.textAlign = "center";
    ctx4.textBaseline = "middle";
    ctx4.fillText(label, x + w / 2, y + h / 2);
    ctx4.restore();
    if (enabled4) buttons3.push({ x, y, w, h, onClick });
  }
  function drawHitButton3(x, y, w, h, label, onClick) {
    drawHitButton(x, y, w, h, label, onClick, buttons3, cursorX3, cursorY3);
  }
  function onPointer2(evt) {
    if (evt.type !== "down") return;
    for (let i = buttons3.length - 1; i >= 0; i--) {
      const b = buttons3[i];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
        b.onClick();
        return;
      }
    }
  }
  function onMove3(x, y) {
    cursorX3 = x;
    cursorY3 = y;
  }

  // src/scenes/gameZen.js
  var gameZen_exports = {};
  __export(gameZen_exports, {
    draw: () => draw10,
    enter: () => enter3,
    exit: () => exit3,
    onMove: () => onMove4,
    onPointer: () => onPointer3,
    update: () => update8
  });

  // src/powerups.js
  function getCharges() {
    return load().powerups.charges;
  }
  function canSpend(slot) {
    return getCharges()[slot] > 0;
  }
  function isFull(slot) {
    var _a;
    return ((_a = getCharges()[slot]) != null ? _a : 0) >= POWERUP_MAX_CHARGES;
  }
  function hasAvailableSlot() {
    const charges = getCharges();
    return POWERUP_SLOTS.some((slot) => {
      var _a;
      return ((_a = charges[slot]) != null ? _a : 0) < POWERUP_MAX_CHARGES;
    });
  }
  function spendCharge(slot) {
    const state = load();
    if (state.powerups.charges[slot] > 0) {
      state.powerups.charges[slot]--;
      saveKey("powerups", state.powerups);
      notifyPowerupUsed();
      return true;
    }
    return false;
  }
  function addCharge(slot) {
    var _a;
    const state = load();
    const cur = (_a = state.powerups.charges[slot]) != null ? _a : 0;
    if (cur >= POWERUP_MAX_CHARGES) return false;
    state.powerups.charges[slot] = Math.min(POWERUP_MAX_CHARGES, cur + 1);
    saveKey("powerups", state.powerups);
    return true;
  }
  function milestoneFloorForScore(score) {
    return Math.max(0, Math.floor((score || 0) / POWERUP_MILESTONE) * POWERUP_MILESTONE);
  }
  function consumeRunMilestones(currentScore, lastFloor = 0) {
    const delta = Math.floor(((currentScore || 0) - lastFloor) / POWERUP_MILESTONE);
    if (delta <= 0) return { count: 0, floor: lastFloor };
    return { count: delta, floor: lastFloor + delta * POWERUP_MILESTONE };
  }
  function milestoneProgress(currentScore, lastFloor = 0) {
    return Math.min(1, Math.max(0, ((currentScore || 0) - lastFloor) / POWERUP_MILESTONE));
  }
  function activateShuffle(grid8, rng) {
    if (typeof rng !== "function") {
      throw new TypeError("activateShuffle: rng function is required");
    }
    reshuffle(grid8, rng);
    return { ok: true, message: "Shuffled" };
  }
  function activateColorBlast(grid8, targetType) {
    const cleared = /* @__PURE__ */ new Set();
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid8[r][c];
        if (cell && cell.type === targetType) cleared.add(`${r},${c}`);
      }
    }
    if (cleared.size === 0) return { ok: false, reason: "no gems of that color" };
    return { ok: true, clears: cleared };
  }
  function activateBombDrop(grid8, r, c) {
    const cell = grid8[r][c];
    if (!cell) return { ok: false, reason: "empty cell" };
    cell.special = SPECIAL.AREA_BOMB;
    return { ok: true, replaced: { r, c, special: SPECIAL.AREA_BOMB, type: cell.type } };
  }
  function activateRecolor(grid8, r, c, newType) {
    const cell = grid8[r][c];
    if (!cell) return { ok: false, reason: "empty cell" };
    if (cell.special) return { ok: false, reason: "cannot recolor a special gem" };
    if (newType < 0 || newType >= TYPES) return { ok: false, reason: "invalid color" };
    if (cell.type === newType) return { ok: false, reason: "same color" };
    cell.type = newType;
    return { ok: true };
  }
  function isValidTarget(grid8, r, c, mode) {
    var _a;
    const cell = (_a = grid8[r]) == null ? void 0 : _a[c];
    if (!cell) return false;
    if (mode === "recolor" && cell.special) return false;
    return true;
  }

  // src/wakeLock.js
  var lock = null;
  var wanted = false;
  async function tryRequest() {
    if (lock || typeof navigator === "undefined" || !navigator.wakeLock) return;
    try {
      const l = await navigator.wakeLock.request("screen");
      if (!wanted || typeof document !== "undefined" && document.visibilityState !== "visible") {
        try {
          l.release();
        } catch {
        }
        return;
      }
      lock = l;
      lock.addEventListener("release", () => {
        lock = null;
        if (wanted && typeof document !== "undefined" && document.visibilityState === "visible") {
          tryRequest();
        }
      }, { once: true });
    } catch {
    }
  }
  async function acquire() {
    wanted = true;
    await tryRequest();
  }
  function release() {
    wanted = false;
    if (lock) {
      try {
        lock.release();
      } catch {
      }
      lock = null;
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (wanted && document.visibilityState === "visible" && !lock) {
        tryRequest();
      }
    });
    if (typeof window !== "undefined") {
      window.addEventListener("focus", () => {
        if (wanted && document.visibilityState === "visible" && !lock) {
          tryRequest();
        }
      });
    }
  }

  // src/scenes/powerupOverlay.js
  var grid2 = null;
  var cascade2 = null;
  var pendingPowerup = null;
  var recolorPickerAt = null;
  var milestonePopup = false;
  var pendingMilestones = 0;
  var milestoneFloor = 0;
  var undoHandler = null;
  function bind2(g, c) {
    grid2 = g;
    cascade2 = c;
  }
  function unbind2() {
    autoAllocatePending();
    grid2 = null;
    cascade2 = null;
    reset2();
  }
  function reset2() {
    pendingPowerup = null;
    recolorPickerAt = null;
    milestonePopup = false;
    pendingMilestones = 0;
    milestoneFloor = 0;
    undoHandler = null;
  }
  function setUndoHandler(fn) {
    undoHandler = fn;
  }
  function autoAllocatePending() {
    while (pendingMilestones > 0) {
      let placed = false;
      for (const slot of POWERUP_SLOTS) {
        if (addCharge(slot)) {
          placed = true;
          break;
        }
      }
      if (!placed) break;
      pendingMilestones--;
    }
  }
  function setMilestoneFloor(floor) {
    milestoneFloor = floor || 0;
  }
  function getPendingMilestones() {
    return pendingMilestones;
  }
  function setPendingMilestones(n) {
    pendingMilestones = Math.max(0, n | 0);
    milestonePopup = pendingMilestones > 0 && hasAvailableSlot();
  }
  function isModalOpen() {
    return !!(recolorPickerAt || milestonePopup);
  }
  function notifyMilestoneEarned(count) {
    if (count <= 0) return;
    pendingMilestones += count;
    milestonePopup = true;
    milestoneDing();
  }
  function draw9(cursorX15, cursorY15, buttons15) {
    if (pendingPowerup) drawTargetModeOverlay(cursorX15, cursorY15);
    drawPowerupPanel(cursorX15, cursorY15, buttons15);
    if (recolorPickerAt) drawRecolorPicker(cursorX15, cursorY15, buttons15);
    if (milestonePopup) drawMilestonePopup(cursorX15, cursorY15, buttons15);
  }
  function drawPowerupPanel(cursorX15, cursorY15, buttons15) {
    const charges = getCharges();
    const progress2 = milestoneProgress(cascade2.score, milestoneFloor);
    if (layout.panelSide === "bottom") {
      drawHorizontalPanel(cursorX15, cursorY15, buttons15, charges, progress2);
    } else {
      drawVerticalPanel(cursorX15, cursorY15, buttons15, charges, progress2);
    }
  }
  function drawVerticalPanel(cursorX15, cursorY15, buttons15, charges, progress2) {
    const px = layout.panelX + 6;
    const pw = layout.panelW - 12;
    const slotH = pw + 12;
    const gap = 8;
    const stackH = POWERUP_SLOTS.length * slotH + (POWERUP_SLOTS.length - 1) * gap;
    let py = layout.boardY + Math.max(0, Math.floor((layout.boardSize - stackH) / 2));
    for (const slot of POWERUP_SLOTS) {
      const meta = POWERUP_META[slot];
      const hover = cursorX15 >= px && cursorX15 <= px + pw && cursorY15 >= py && cursorY15 <= py + slotH;
      const isActive = pendingPowerup === slot;
      drawPowerupSlot(px, py, pw, slotH, meta.emoji, meta.ring, charges[slot], progress2, hover, isActive);
      buttons15.push({ x: px, y: py, w: pw, h: slotH, onClick: () => onPowerupSlotClicked(slot), kind: "powerup" });
      py += slotH + gap;
    }
  }
  function drawHorizontalPanel(cursorX15, cursorY15, buttons15, charges, progress2) {
    const pad2 = 6;
    const slotH = Math.max(40, layout.panelH - pad2 * 2);
    const gap = 8;
    const slotW = slotH;
    const stackW = POWERUP_SLOTS.length * slotW + (POWERUP_SLOTS.length - 1) * gap;
    const py = layout.panelY + pad2;
    let px = layout.boardX + Math.max(0, Math.floor((layout.boardSize - stackW) / 2));
    for (const slot of POWERUP_SLOTS) {
      const meta = POWERUP_META[slot];
      const hover = cursorX15 >= px && cursorX15 <= px + slotW && cursorY15 >= py && cursorY15 <= py + slotH;
      const isActive = pendingPowerup === slot;
      drawPowerupSlot(px, py, slotW, slotH, meta.emoji, meta.ring, charges[slot], progress2, hover, isActive);
      buttons15.push({ x: px, y: py, w: slotW, h: slotH, onClick: () => onPowerupSlotClicked(slot), kind: "powerup" });
      px += slotW + gap;
    }
  }
  function drawTargetModeOverlay(cursorX15, cursorY15) {
    const ctx4 = ctxRef();
    const { w, h } = getViewport();
    const bx = layout.boardX, by = layout.boardY, bs = layout.boardSize;
    const pad2 = 8;
    const tx = Math.max(0, bx - pad2);
    const ty = Math.max(0, by - pad2);
    const trx = Math.min(w, bx + bs + pad2);
    const try_ = Math.min(h, by + bs + pad2);
    ctx4.fillStyle = "rgba(0, 0, 0, 0.35)";
    if (ty > 0) ctx4.fillRect(0, 0, w, ty);
    if (try_ < h) ctx4.fillRect(0, try_, w, h - try_);
    if (tx > 0) ctx4.fillRect(0, ty, tx, try_ - ty);
    if (trx < w) ctx4.fillRect(trx, ty, w - trx, try_ - ty);
    const meta = POWERUP_META[pendingPowerup];
    drawText(
      t("powerup.targetHint", { emoji: meta.emoji, label: t(`powerup.${pendingPowerup}.label`) }),
      boardCenterX(),
      layout.hudY + 6,
      {
        font: `bold ${responsiveFont(18)}px sans-serif`,
        align: "center",
        shadow: true
      }
    );
    const cancelY = layout.panelSide === "bottom" ? Math.max(2, layout.boardY - 16) : layout.boardY + layout.boardSize + 14;
    drawText(
      t("powerup.tapOutsideCancel"),
      boardCenterX(),
      cancelY,
      {
        font: "12px sans-serif",
        align: "center",
        color: "rgba(255,255,255,0.7)"
      }
    );
  }
  function drawRecolorPicker(cursorX15, cursorY15, buttons15) {
    const { w, h } = getViewport();
    const ctx4 = ctxRef();
    ctx4.fillStyle = "rgba(0,0,0,0.6)";
    ctx4.fillRect(0, 0, w, h);
    const pw = Math.min(360, w - 32), ph = 110;
    const px = (w - pw) / 2, py = (h - ph) / 2;
    roundRect(ctx4, px, py, pw, ph, 12);
    ctx4.fillStyle = "#1a1530";
    ctx4.fill();
    drawText(t("powerup.pickColor"), px + pw / 2, py + 22, { font: "bold 16px sans-serif", align: "center" });
    const sw = (pw - 32) / TYPES;
    for (let t2 = 0; t2 < TYPES; t2++) {
      const sx = px + 16 + t2 * sw;
      const sy = py + 50;
      const sd = sw * 0.85;
      ctx4.beginPath();
      ctx4.arc(sx + sw / 2, sy + sd / 2, sd / 2 - 4, 0, Math.PI * 2);
      ctx4.fillStyle = GEM_COLORS[t2];
      ctx4.fill();
      ctx4.strokeStyle = "rgba(255,255,255,0.3)";
      ctx4.stroke();
      buttons15.push({
        x: sx + 2,
        y: sy + 2,
        w: sw - 4,
        h: sd - 4,
        onClick: () => onRecolorColorPicked(t2),
        kind: "colorPick",
        modal: true
      });
    }
  }
  function drawMilestonePopup(cursorX15, cursorY15, buttons15) {
    const { w, h } = getViewport();
    const ctx4 = ctxRef();
    ctx4.fillStyle = "rgba(0,0,0,0.65)";
    ctx4.fillRect(0, 0, w, h);
    const pw = Math.min(440, w - 32), ph = 280;
    const px = (w - pw) / 2, py = (h - ph) / 2;
    roundRect(ctx4, px, py, pw, ph, 14);
    ctx4.fillStyle = "#1a1530";
    ctx4.fill();
    drawText(t("powerup.chargeEarned"), px + pw / 2, py + 28, {
      font: "bold 20px sans-serif",
      align: "center"
    });
    drawText(t("powerup.pickFill"), px + pw / 2, py + 56, {
      font: "14px sans-serif",
      align: "center",
      color: "rgba(255,255,255,0.7)"
    });
    const slotW = (pw - 40) / POWERUP_SLOTS.length;
    const slotH = 90;
    for (let i = 0; i < POWERUP_SLOTS.length; i++) {
      const slot = POWERUP_SLOTS[i];
      const meta = POWERUP_META[slot];
      const sx = px + 20 + i * slotW;
      const sy = py + 100;
      const charges = getCharges()[slot];
      const full = isFull(slot);
      const hover = !full && cursorX15 >= sx && cursorX15 <= sx + slotW - 8 && cursorY15 >= sy && cursorY15 <= sy + slotH;
      drawPowerupSlot(sx, sy, slotW - 8, slotH, meta.emoji, meta.ring, charges, 0, hover, false);
      if (full) {
        ctx4.save();
        ctx4.globalAlpha = 0.45;
        ctx4.fillStyle = "#000";
        roundRect(ctx4, sx, sy, slotW - 8, slotH, 10);
        ctx4.fill();
        ctx4.restore();
      } else {
        buttons15.push({
          x: sx,
          y: sy,
          w: slotW - 8,
          h: slotH,
          onClick: () => onMilestonePicked(slot),
          kind: "milestone",
          modal: true
        });
      }
    }
    drawText(t("powerup.saveForLater"), px + pw / 2, py + ph - 30, {
      font: "12px sans-serif",
      align: "center",
      color: "rgba(255,255,255,0.5)"
    });
  }
  function handlePointer2(evt) {
    if (evt.type !== "down") return false;
    if (milestonePopup) {
      milestonePopup = false;
      return true;
    }
    if (recolorPickerAt) {
      recolorPickerAt = null;
      pendingPowerup = null;
      return true;
    }
    if (pendingPowerup) {
      const cell = screenToCell(evt.x, evt.y);
      if (cell) {
        handleTargetTap(cell);
        return true;
      }
      pendingPowerup = null;
      return true;
    }
    return false;
  }
  function onPowerupSlotClicked(slot) {
    if (!canSpend(slot)) return;
    if (cascade2.state !== STATE.IDLE) return;
    if (slot === "shuffle") {
      spendCharge(slot);
      activateShuffle(grid2, cascade2.rng);
      powerupZap();
      doPostInstantPowerup();
      return;
    }
    if (slot === "undo") {
      if (undoHandler && undoHandler()) {
        spendCharge(slot);
        powerupZap();
        doPostInstantPowerup();
      }
      return;
    }
    pendingPowerup = pendingPowerup === slot ? null : slot;
  }
  function doPostInstantPowerup() {
    var _a;
    (_a = cascade2.onIdleReached) == null ? void 0 : _a.call(cascade2);
    maybeShowSavedMilestone();
  }
  function onMilestonePicked(slot) {
    if (!addCharge(slot)) return;
    pendingMilestones--;
    if (pendingMilestones <= 0) milestonePopup = false;
  }
  function onRecolorColorPicked(type) {
    var _a;
    if (!recolorPickerAt) {
      recolorPickerAt = null;
      return;
    }
    const res = activateRecolor(grid2, recolorPickerAt.r, recolorPickerAt.c, type);
    if (res.ok) {
      spendCharge("recolor");
      powerupZap();
      (_a = cascade2.resolveCurrentMatches) == null ? void 0 : _a.call(cascade2, recolorPickerAt);
      maybeShowSavedMilestone();
    }
    recolorPickerAt = null;
    pendingPowerup = null;
  }
  function handleTargetTap(cell) {
    var _a, _b;
    if (!cell) {
      pendingPowerup = null;
      return;
    }
    switch (pendingPowerup) {
      case "colorBlast": {
        const targetType = (_a = grid2[cell.r][cell.c]) == null ? void 0 : _a.type;
        if (targetType == null) return;
        const res = activateColorBlast(grid2, targetType);
        if (res.ok) {
          spendCharge("colorBlast");
          powerupZap();
          cascade2.applyExternalClears(res.clears);
          maybeShowSavedMilestone();
        }
        pendingPowerup = null;
        return;
      }
      case "bombDrop": {
        const res = activateBombDrop(grid2, cell.r, cell.c);
        if (res.ok) {
          spendCharge("bombDrop");
          powerupZap();
          (_b = cascade2.onIdleReached) == null ? void 0 : _b.call(cascade2);
          maybeShowSavedMilestone();
        }
        pendingPowerup = null;
        return;
      }
      case "recolor": {
        if (!isValidTarget(grid2, cell.r, cell.c, "recolor")) return;
        recolorPickerAt = { r: cell.r, c: cell.c };
        return;
      }
    }
  }
  function maybeShowSavedMilestone() {
    if (pendingMilestones > 0 && hasAvailableSlot()) {
      milestonePopup = true;
    }
  }

  // src/scenes/sceneCommon.js
  function tickEffects(dt) {
    update(dt);
    update2(dt);
    update3(dt);
    update4(dt);
    addPlayTimeMs(dt);
  }
  function clearEffects() {
    clear();
    clear2();
    clear3();
    clear5();
  }
  function wireCascadePresentation(cascade8, opts = {}) {
    let lastClearCenter = null;
    cascade8.onMatchCleared = (cells, depth) => {
      var _a;
      lastClearCenter = handleMatchCleared(cells, depth, {
        render: render_exports,
        particles: particles_exports,
        waves: waves_exports,
        painting: opts.painting || null,
        palettes: GEM_PARTICLE_PALETTES,
        haptic: getSettings().haptic !== false
      });
      notifyMatchCleared(cells.length, depth);
      (_a = opts.onMatchCleared) == null ? void 0 : _a.call(opts, cells, depth, lastClearCenter);
    };
    cascade8.onSpecialActivated = (act) => {
      var _a;
      handleSpecialActivated(act, {
        render: render_exports,
        waves: waves_exports,
        bolts: bolts_exports,
        particles: particles_exports,
        palettes: GEM_PARTICLE_PALETTES,
        SPECIAL,
        haptic: getSettings().haptic !== false
      });
      (_a = opts.onSpecialActivated) == null ? void 0 : _a.call(opts, act);
    };
    cascade8.onScoreChanged = (newScore, delta) => {
      var _a;
      if (delta > 0 && lastClearCenter) {
        spawnScore(
          lastClearCenter.x,
          lastClearCenter.y - 20,
          delta,
          boardCenterX(),
          layout.hudY + 16
        );
      }
      (_a = opts.onScoreChanged) == null ? void 0 : _a.call(opts, newScore, delta, lastClearCenter);
    };
    cascade8.onSpecialSpawned = (special) => {
      var _a;
      notifySpecialSpawned(special);
      (_a = opts.onSpecialSpawned) == null ? void 0 : _a.call(opts, special);
    };
    cascade8.onBombsDefused = (count) => {
      var _a;
      notifyBombsDefused(count);
      (_a = opts.onBombsDefused) == null ? void 0 : _a.call(opts, count);
    };
    cascade8.onBombTick = () => {
      var _a;
      bombTick();
      (_a = opts.onBombTick) == null ? void 0 : _a.call(opts);
    };
    cascade8.onBombExploded = (cell) => {
      var _a;
      bombBoom();
      (_a = opts.onBombExploded) == null ? void 0 : _a.call(opts, cell);
    };
    cascade8.onReshuffle = () => {
      var _a;
      spawnText(
        boardCenterX(),
        layout.boardY + 24,
        t("common.reshuffling"),
        "#ffd166",
        18
      );
      (_a = opts.onReshuffle) == null ? void 0 : _a.call(opts);
    };
    if (opts.onMoveCommitted) cascade8.onMoveCommitted = opts.onMoveCommitted;
    if (opts.onIdleReached) cascade8.onIdleReached = opts.onIdleReached;
  }
  var HINT_COOLDOWN_MS = 15e3;
  var HINT_BUTTON_W = 42;
  var _lastHintAt = -Infinity;
  function drawHintButton(x, y, cascade8, grid8, setHint, buttons15, cursorX15, cursorY15, h = 32) {
    const ready = clockMs() - _lastHintAt >= HINT_COOLDOWN_MS;
    drawHitButton(x, y, HINT_BUTTON_W, h, "\u{1F4A1}", () => {
      if (!ready || cascade8.state !== STATE.IDLE) return;
      _lastHintAt = clockMs();
      setHint(findModestHint(grid8));
    }, buttons15, cursorX15, cursorY15, { disabled: !ready });
  }
  function tickHint(cascade8, grid8, hint6) {
    if (cascade8.state === STATE.IDLE && cascade8.idleSinceMs > TIMING.HINT_AFTER) {
      return hint6 || findModestHint(grid8);
    }
    return cascade8.state !== STATE.IDLE ? null : hint6;
  }

  // src/scenes/gameZen.js
  var grid3 = null;
  var cascade3 = null;
  var hint = null;
  var buttons4 = [];
  var cursorX4 = 0;
  var cursorY4 = 0;
  var runEndedScore = null;
  var milestoneFloor2 = 0;
  var prevIdle = null;
  var curIdle = null;
  function captureIdle() {
    return {
      grid: serializeGrid(grid3),
      score: cascade3.score,
      milestoneFloor: milestoneFloor2,
      pendingMilestones: getPendingMilestones(),
      charges: { ...getCharges() }
    };
  }
  function applyUndo() {
    var _a, _b;
    if (!prevIdle || !cascade3 || cascade3.state !== STATE.IDLE) return false;
    if (((_b = (_a = prevIdle.charges) == null ? void 0 : _a.undo) != null ? _b : 0) <= 0) return false;
    const g2 = deserializeGrid(prevIdle.grid);
    for (let r = 0; r < g2.length; r++) {
      for (let c = 0; c < g2[r].length; c++) grid3[r][c] = g2[r][c];
    }
    cascade3.score = prevIdle.score;
    cascade3.scoreShown = prevIdle.score;
    milestoneFloor2 = prevIdle.milestoneFloor;
    saveKey("powerups", { charges: { ...prevIdle.charges } });
    setMilestoneFloor(milestoneFloor2);
    setPendingMilestones(prevIdle.pendingMilestones || 0);
    curIdle = prevIdle;
    prevIdle = null;
    snapshotSaveState();
    return true;
  }
  function enter3(args2 = {}) {
    var _a, _b;
    document.body.className = "";
    clearEffects();
    let entryAnim = false;
    if (args2.restoreFrom) {
      grid3 = deserializeGrid(args2.restoreFrom.grid);
      cascade3 = new Cascade(grid3, { mode: "zen" });
      cascade3.score = args2.restoreFrom.score || 0;
      cascade3.scoreShown = cascade3.score;
      milestoneFloor2 = (_a = args2.restoreFrom.milestoneFloor) != null ? _a : milestoneFloorForScore(cascade3.score);
    } else {
      grid3 = createBoard();
      cascade3 = new Cascade(grid3, { mode: "zen" });
      milestoneFloor2 = 0;
      entryAnim = true;
    }
    if (getSettings().paintingMode) {
      init2();
      setEnabled2(true);
      clear4();
    } else {
      setEnabled2(false);
    }
    hint = null;
    runEndedScore = null;
    saveKey("profile", { lastPlayedMode: "zen" });
    notifyMode("zen");
    bind(grid3, cascade3);
    bind2(grid3, cascade3);
    reset2();
    setMilestoneFloor(milestoneFloor2);
    setPendingMilestones(((_b = args2.restoreFrom) == null ? void 0 : _b.pendingMilestones) || 0);
    setActiveCascade(cascade3);
    setPanelWidth(layout.isNarrow ? 76 : 72);
    if (entryAnim) cascade3.playEntryAnimation();
    wireCascadePresentation(cascade3, {
      painting: painting_exports,
      onMatchCleared: () => notifyZenScore(cascade3.score),
      onScoreChanged: (newScore) => {
        const earned = consumeRunMilestones(newScore, milestoneFloor2);
        milestoneFloor2 = earned.floor;
        setMilestoneFloor(milestoneFloor2);
        notifyMilestoneEarned(earned.count);
      },
      onMoveCommitted: () => {
        prevIdle = curIdle;
      },
      onIdleReached: () => {
        curIdle = captureIdle();
        snapshotSaveState();
      }
    });
    prevIdle = null;
    curIdle = captureIdle();
    setUndoHandler(applyUndo);
    startZenPad();
    if (typeof window !== "undefined" && isDebugHost()) window.__zen = { grid: grid3, cascade: cascade3 };
    acquire();
  }
  function exit3() {
    if (runEndedScore == null) {
      snapshotSaveState();
    }
    stopZenPad();
    unbind();
    if (load().zen.saveState) setPendingMilestones(0);
    unbind2();
    setActiveCascade(null);
    release();
    setPanelWidth(0);
    setEnabled2(false);
    document.body.className = "";
    if (typeof window !== "undefined") delete window.__zen;
  }
  function finalizeRun(score) {
    runEndedScore = score;
    recordPlayDay(score);
    const s = load();
    if (score > s.zen.bestScore) saveKey("zen", { bestScore: score });
    saveKey("zen", {
      totalRunsPlayed: s.zen.totalRunsPlayed + 1,
      lastPlayedAt: (/* @__PURE__ */ new Date()).toISOString(),
      saveState: null
    });
  }
  function snapshotSaveState() {
    if (!cascade3 || cascade3.state !== STATE.IDLE) return;
    if (runEndedScore != null) return;
    saveKey("zen", {
      saveState: {
        grid: serializeGrid(grid3),
        score: cascade3.score,
        milestoneFloor: milestoneFloor2,
        pendingMilestones: getPendingMilestones(),
        savedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  function update8(dt) {
    cascade3.update(dt);
    tickEffects(dt);
    hint = tickHint(cascade3, grid3, hint);
  }
  function draw10() {
    clearFrame();
    buttons4 = [];
    const settings = getSettings();
    const hudY = layout.hudY;
    const boardX = layout.boardX;
    const contentR = contentRight();
    const titleFont = `bold ${responsiveFont(22)}px -apple-system, system-ui, sans-serif`;
    const scoreFont = `bold ${responsiveFont(24)}px -apple-system, system-ui, sans-serif`;
    drawText(t("zen.title"), boardX, hudY + 8, { font: titleFont, shadow: true });
    drawText(formatNumber(Math.floor(cascade3.scoreShown)), (boardX + contentR) / 2, hudY + 6, {
      font: scoreFont,
      align: "center",
      shadow: true
    });
    const btnW = layout.panelSide === "right" && layout.panelW > 0 ? layout.panelW : layout.isNarrow ? 56 : 76;
    drawHitButton(contentR - btnW, hudY + 2, btnW, 36, layout.isNarrow ? t("zen.endShort") : t("zen.end"), () => {
      if (runEndedScore != null) return;
      finalizeRun(cascade3.score);
      if (isEnabled()) offerSavePainting();
      else setScene("title");
    }, buttons4, cursorX4, cursorY4);
    drawHintButton(contentR - btnW - 48, hudY + 2, cascade3, grid3, (h) => {
      hint = h;
    }, buttons4, cursorX4, cursorY4, 36);
    drawBoard(grid3, { shakeAmp: cascade3.shakeAmp, settings, hint, idleMs: cascade3.idleSinceMs });
    draw9(cursorX4, cursorY4, buttons4);
  }
  function onPointer3(evt) {
    if (evt.type === "down") {
      hint = null;
      if (isModalOpen()) {
        if (handleOverlayModalButton(evt)) return;
        if (handlePointer2(evt)) return;
        return;
      }
      for (let i = buttons4.length - 1; i >= 0; i--) {
        const b = buttons4[i];
        if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
          b.onClick();
          return;
        }
      }
      if (handlePointer2(evt)) return;
    }
    handle(evt.type, evt.x, evt.y);
  }
  function onMove4(x, y) {
    cursorX4 = x;
    cursorY4 = y;
    move(x, y);
  }
  async function offerSavePainting() {
    thumbnailDataURL().then((thumb) => {
      if (!thumb) return;
      const s = load();
      const gallery = [
        { dataUrl: thumb, at: (/* @__PURE__ */ new Date()).toISOString() },
        ...s.zen.gallery || []
      ].slice(0, 12);
      saveKey("zen", { gallery });
    }).catch(() => {
    });
    if (await confirm(t("zen.savePaintingConfirm"))) {
      const blob = await toBlob();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `jeweled-painting-${todayISO()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      }
    }
    setScene("title");
  }
  function handleOverlayModalButton(evt) {
    for (let i = buttons4.length - 1; i >= 0; i--) {
      const b = buttons4[i];
      if (!b.modal) continue;
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
        b.onClick();
        return true;
      }
    }
    return false;
  }
  function isDebugHost() {
    if (typeof location === "undefined") return false;
    return location.hostname === "localhost" || location.hostname === "127.0.0.1" || new URLSearchParams(location.search).get("debug") === "1";
  }

  // src/scenes/gameClassic.js
  var gameClassic_exports = {};
  __export(gameClassic_exports, {
    draw: () => draw11,
    enter: () => enter4,
    exit: () => exit4,
    onMove: () => onMove5,
    onPointer: () => onPointer4,
    update: () => update9
  });
  var grid4 = null;
  var cascade4 = null;
  var hint2 = null;
  var buttons5 = [];
  var cursorX5 = 0;
  var cursorY5 = 0;
  var levelNum = 1;
  var moves = 30;
  var target = 500;
  var movesLeft = 30;
  var resultTriggered = false;
  var milestoneFloor3 = 0;
  var iceMap = null;
  var iceLeft = 0;
  var isBoss = false;
  function initIce(def, restored) {
    var _a;
    isBoss = !!def.boss;
    if (!def.ice) {
      iceMap = null;
      iceLeft = 0;
      return;
    }
    iceMap = Array.from({ length: 8 }, () => new Array(8).fill(0));
    iceLeft = 0;
    const cells = restored || def.ice;
    for (const [r, c] of cells) {
      if (((_a = iceMap[r]) == null ? void 0 : _a[c]) === 0) {
        iceMap[r][c] = 1;
        iceLeft++;
      }
    }
  }
  function meltIceAt(r, c) {
    var _a;
    if (iceMap && ((_a = iceMap[r]) == null ? void 0 : _a[c]) > 0) {
      iceMap[r][c] = 0;
      iceLeft--;
    }
  }
  function remainingIceCells() {
    if (!iceMap) return null;
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (iceMap[r][c] > 0) out.push([r, c]);
    return out;
  }
  var prevIdle2 = null;
  var curIdle2 = null;
  function captureIdle2() {
    return {
      grid: serializeGrid(grid4),
      score: cascade4.score,
      movesLeft,
      milestoneFloor: milestoneFloor3,
      ice: remainingIceCells(),
      pendingMilestones: getPendingMilestones(),
      charges: { ...getCharges() }
    };
  }
  function applyUndo2() {
    var _a, _b;
    if (!prevIdle2 || !cascade4 || cascade4.state !== STATE.IDLE || resultTriggered) return false;
    if (((_b = (_a = prevIdle2.charges) == null ? void 0 : _a.undo) != null ? _b : 0) <= 0) return false;
    const g2 = deserializeGrid(prevIdle2.grid);
    for (let r = 0; r < g2.length; r++) {
      for (let c = 0; c < g2[r].length; c++) grid4[r][c] = g2[r][c];
    }
    cascade4.score = prevIdle2.score;
    cascade4.scoreShown = prevIdle2.score;
    movesLeft = prevIdle2.movesLeft;
    milestoneFloor3 = prevIdle2.milestoneFloor;
    saveKey("powerups", { charges: { ...prevIdle2.charges } });
    if (prevIdle2.ice) initIce(getLevel(levelNum), prevIdle2.ice);
    setMilestoneFloor(milestoneFloor3);
    setPendingMilestones(prevIdle2.pendingMilestones || 0);
    curIdle2 = prevIdle2;
    prevIdle2 = null;
    snapshotSaveState2();
    return true;
  }
  function enter4(args2 = {}) {
    var _a, _b, _c;
    document.body.className = "";
    clearEffects();
    let entryAnim = false;
    if (args2.restoreFrom) {
      grid4 = deserializeGrid(args2.restoreFrom.grid);
      levelNum = args2.restoreFrom.level || 1;
      movesLeft = args2.restoreFrom.movesLeft;
      cascade4 = new Cascade(grid4, { mode: "classic" });
      cascade4.score = args2.restoreFrom.score || 0;
      cascade4.scoreShown = cascade4.score;
      milestoneFloor3 = (_a = args2.restoreFrom.milestoneFloor) != null ? _a : milestoneFloorForScore(cascade4.score);
    } else {
      levelNum = args2.level || 1;
      const def2 = getLevel(levelNum);
      moves = def2.moves;
      target = def2.targetScore;
      movesLeft = def2.moves;
      grid4 = createBoard();
      cascade4 = new Cascade(grid4, { mode: "classic" });
      milestoneFloor3 = 0;
      entryAnim = true;
    }
    const def = getLevel(levelNum);
    moves = def.moves;
    target = def.targetScore;
    if (args2.restoreFrom == null) movesLeft = moves;
    initIce(def, ((_b = args2.restoreFrom) == null ? void 0 : _b.ice) || null);
    if (isBoss && args2.restoreFrom == null) {
      for (const [br, bc] of [[2, 2], [5, 5]]) {
        const cell = grid4[br][bc];
        if (cell && !cell.special) {
          cell.special = SPECIAL.TIME_BOMB;
          cell.bombCountdown = 9;
        }
      }
    }
    resultTriggered = false;
    hint2 = null;
    saveKey("profile", { lastPlayedMode: "classic" });
    bind(grid4, cascade4);
    bind2(grid4, cascade4);
    reset2();
    setMilestoneFloor(milestoneFloor3);
    setPendingMilestones(((_c = args2.restoreFrom) == null ? void 0 : _c.pendingMilestones) || 0);
    setActiveCascade(cascade4);
    setPanelWidth(layout.isNarrow ? 76 : 72);
    if (entryAnim) cascade4.playEntryAnimation();
    wireCascadePresentation(cascade4, {
      onMatchCleared: (cells) => {
        for (const cell of cells) meltIceAt(cell.r, cell.c);
      },
      onSpecialActivated: (act) => {
        meltIceAt(act.r, act.c);
        for (const t2 of act.targets || []) meltIceAt(t2.r, t2.c);
      },
      onMoveCommitted: () => {
        prevIdle2 = curIdle2;
        movesLeft--;
      },
      onBombExploded: () => {
        movesLeft = Math.max(0, movesLeft - 5);
      },
      onIdleReached: () => {
        curIdle2 = captureIdle2();
        snapshotSaveState2();
        checkWinLose();
      },
      onScoreChanged: (newScore) => {
        const earned = consumeRunMilestones(newScore, milestoneFloor3);
        milestoneFloor3 = earned.floor;
        setMilestoneFloor(milestoneFloor3);
        notifyMilestoneEarned(earned.count);
      }
    });
    prevIdle2 = null;
    curIdle2 = captureIdle2();
    setUndoHandler(applyUndo2);
    acquire();
  }
  function exit4() {
    snapshotSaveState2();
    unbind();
    if (load().classic.saveState) setPendingMilestones(0);
    unbind2();
    setActiveCascade(null);
    release();
    setPanelWidth(0);
    document.body.className = "";
  }
  function snapshotSaveState2() {
    if (!cascade4 || cascade4.state !== STATE.IDLE) return;
    if (resultTriggered) return;
    saveKey("classic", {
      saveState: {
        grid: serializeGrid(grid4),
        score: cascade4.score,
        level: levelNum,
        movesLeft,
        milestoneFloor: milestoneFloor3,
        pendingMilestones: getPendingMilestones(),
        ice: remainingIceCells(),
        savedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  function checkWinLose() {
    if (resultTriggered) return;
    if (cascade4.score >= target && iceLeft === 0) {
      resultTriggered = true;
      finalizeWin();
    } else if (movesLeft <= 0) {
      resultTriggered = true;
      finalizeLose();
    }
  }
  function finalizeWin() {
    const s = load();
    const stars = starsFor(cascade4.score, target);
    const existing = s.classic.levels[String(levelNum)] || { bestScore: 0, starsEarned: 0 };
    const updatedLevels = { ...s.classic.levels };
    updatedLevels[String(levelNum)] = {
      bestScore: Math.max(existing.bestScore, cascade4.score),
      starsEarned: Math.max(existing.starsEarned, stars),
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const newHighest = Math.max(s.classic.highestUnlocked, Math.min(levelNum + 1, LEVELS.length));
    saveKey("classic", {
      levels: updatedLevels,
      highestUnlocked: newHighest,
      saveState: null
    });
    recordPlayDay(cascade4.score);
    notifyLevelWin(levelNum);
    setScene("result", { mode: "classic", outcome: "win", score: cascade4.score, level: levelNum, target, stars });
  }
  function finalizeLose() {
    saveKey("classic", { saveState: null });
    recordPlayDay(cascade4.score);
    setScene("result", { mode: "classic", outcome: "lose", score: cascade4.score, level: levelNum, target });
  }
  function update9(dt) {
    cascade4.update(dt);
    tickEffects(dt);
    hint2 = tickHint(cascade4, grid4, hint2);
  }
  function draw11() {
    clearFrame();
    buttons5 = [];
    const settings = getSettings();
    const hudY = layout.hudY;
    const boardX = layout.boardX;
    const boardR = boardRight();
    const contentR = contentRight();
    const boardW = layout.boardSize;
    const titleFont = `bold ${responsiveFont(20)}px -apple-system, system-ui, sans-serif`;
    const scoreFont = `bold ${responsiveFont(18)}px -apple-system, system-ui, sans-serif`;
    const subFont = `${responsiveFont(14)}px -apple-system, system-ui, sans-serif`;
    const levelLabel = isBoss ? `${t("classic.level", { n: levelNum })} ${t("classic.boss")}` : t("classic.level", { n: levelNum });
    drawText(levelLabel, boardX, hudY + 6, { font: titleFont, shadow: true });
    drawText(
      `${formatNumber(Math.floor(cascade4.scoreShown))} / ${formatNumber(target)}`,
      (boardX + contentR) / 2,
      hudY + 6,
      { font: scoreFont, align: "center", shadow: true }
    );
    const btnW = layout.panelSide === "right" && layout.panelW > 0 ? layout.panelW : layout.isNarrow ? 56 : 76;
    drawHitButton(
      contentR - btnW,
      hudY + 2,
      btnW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons5,
      cursorX5,
      cursorY5
    );
    const barY = hudY + 40;
    const barH = 8;
    const movesLabelW = 80;
    const barW = boardW - movesLabelW;
    const ctx4 = ctxRef();
    ctx4.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx4, boardX, barY, barW, barH, 4);
    ctx4.fill();
    const pct = Math.min(1, cascade4.score / target);
    ctx4.fillStyle = pct >= 1 ? "#5fd068" : "#7c3aed";
    roundRect(ctx4, boardX, barY, barW * pct, barH, 4);
    ctx4.fill();
    const moveColor = movesLeft <= 3 ? `rgba(255, ${100 + Math.floor(60 * (0.5 + 0.5 * Math.sin(clockMs() / 220)))}, 120, 1)` : "rgba(255,255,255,0.85)";
    drawText(t("classic.moves", { n: movesLeft }), boardR, barY - 2, {
      font: subFont,
      align: "right",
      color: moveColor,
      shadow: true
    });
    if (iceMap) {
      drawText(t("classic.ice", { n: iceLeft }), boardR - 90, barY - 2, {
        font: subFont,
        align: "right",
        color: iceLeft > 0 ? "#8fd1ff" : "#5fd068",
        shadow: true
      });
    }
    drawHintButton(contentR - btnW - 48, hudY + 2, cascade4, grid4, (h) => {
      hint2 = h;
    }, buttons5, cursorX5, cursorY5);
    drawBoard(grid4, { shakeAmp: cascade4.shakeAmp, settings, hint: hint2, idleMs: cascade4.idleSinceMs, iceMap });
    draw9(cursorX5, cursorY5, buttons5);
  }
  function onPointer4(evt) {
    if (evt.type === "down") {
      hint2 = null;
      if (isModalOpen()) {
        if (handleOverlayModalButton2(evt)) return;
        if (handlePointer2(evt)) return;
        return;
      }
      for (let i = buttons5.length - 1; i >= 0; i--) {
        const b = buttons5[i];
        if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
          b.onClick();
          return;
        }
      }
      if (handlePointer2(evt)) return;
    }
    handle(evt.type, evt.x, evt.y);
  }
  function onMove5(x, y) {
    cursorX5 = x;
    cursorY5 = y;
    move(x, y);
  }
  function handleOverlayModalButton2(evt) {
    for (let i = buttons5.length - 1; i >= 0; i--) {
      const b = buttons5[i];
      if (!b.modal) continue;
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
        b.onClick();
        return true;
      }
    }
    return false;
  }

  // src/scenes/gameDaily.js
  var gameDaily_exports = {};
  __export(gameDaily_exports, {
    draw: () => draw12,
    enter: () => enter5,
    exit: () => exit5,
    onMove: () => onMove6,
    onPointer: () => onPointer5,
    update: () => update10
  });
  var grid5 = null;
  var cascade5 = null;
  var hint3 = null;
  var buttons6 = [];
  var cursorX6 = 0;
  var cursorY6 = 0;
  var movesLeft2 = DAILY_MOVES;
  var resultTriggered2 = false;
  var isReplay = false;
  var prevBest = 0;
  var dailyDate = "";
  function enter5(args2 = {}) {
    document.body.className = "daily-bg";
    clearEffects();
    const today = todayISO();
    dailyDate = today;
    const s = load();
    isReplay = s.daily.todaySubmittedDate === today;
    prevBest = s.daily.bestEver;
    const seed = dateHash();
    const rng = mulberry32(seed);
    grid5 = createBoard(rng);
    cascade5 = new Cascade(grid5, { mode: "daily", rng });
    movesLeft2 = DAILY_MOVES;
    resultTriggered2 = false;
    hint3 = null;
    saveKey("profile", { lastPlayedMode: "daily" });
    bind(grid5, cascade5);
    setActiveCascade(cascade5);
    cascade5.playEntryAnimation();
    wireCascadePresentation(cascade5, {
      onMoveCommitted: () => {
        movesLeft2--;
      },
      onIdleReached: () => {
        if (movesLeft2 <= 0 && !resultTriggered2) {
          resultTriggered2 = true;
          finalize();
        }
      }
    });
    acquire();
  }
  function exit5() {
    unbind();
    setActiveCascade(null);
    release();
    document.body.className = "";
  }
  function finalize() {
    const s = load();
    const isNewBest = !isReplay && cascade5.score > s.daily.bestEver;
    if (!isReplay) {
      saveKey("daily", {
        bestEver: Math.max(s.daily.bestEver, cascade5.score),
        todaySubmittedDate: dailyDate,
        totalDaysPlayed: s.daily.totalDaysPlayed + 1,
        history: {
          ...s.daily.history,
          [dailyDate]: { score: cascade5.score, movesUsed: DAILY_MOVES - movesLeft2 }
        }
      });
      recordPlayDay(cascade5.score);
    }
    notifyMode("daily");
    const streak2 = dailyStreak(load().daily.history || {}, dailyDate);
    if (!isReplay) notifyDailyStreak(streak2);
    setScene("result", {
      mode: "daily",
      outcome: "done",
      score: cascade5.score,
      date: dailyDate,
      isReplay,
      isNewBest,
      prevBest,
      streak: streak2,
      movesUsed: DAILY_MOVES - movesLeft2
    });
  }
  function update10(dt) {
    cascade5.update(dt);
    tickEffects(dt);
    hint3 = tickHint(cascade5, grid5, hint3);
  }
  function draw12() {
    clearFrame();
    buttons6 = [];
    const hudY = layout.hudY;
    const boardX = layout.boardX;
    const boardR = boardRight();
    const titleFont = `bold ${responsiveFont(20)}px -apple-system, system-ui, sans-serif`;
    const scoreFont = `bold ${responsiveFont(20)}px -apple-system, system-ui, sans-serif`;
    const subFont = `${responsiveFont(14)}px -apple-system, system-ui, sans-serif`;
    drawText(t("daily.title"), boardX, hudY + 6, { font: titleFont, shadow: true });
    drawText(formatNumber(Math.floor(cascade5.scoreShown)), boardCenterX(), hudY + 6, {
      font: scoreFont,
      align: "center",
      shadow: true
    });
    const btnW = layout.isNarrow ? 56 : 76;
    drawHitButton(
      boardR - btnW,
      hudY + 2,
      btnW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons6,
      cursorX6,
      cursorY6
    );
    const movePulse = movesLeft2 <= 3 ? `rgba(255, ${100 + Math.floor(60 * (0.5 + 0.5 * Math.sin(clockMs() / 220)))}, 120, 1)` : movesLeft2 <= 5 ? "#ff8888" : "rgba(255,255,255,0.85)";
    drawText(t("daily.movesLeft", { n: movesLeft2 }), boardX, hudY + 40, {
      font: subFont,
      color: movePulse,
      shadow: true
    });
    if (isReplay) {
      drawText(t("daily.replayDoesNotCount"), boardR, hudY + 40, {
        font: subFont,
        align: "right",
        color: "rgba(255,255,255,0.6)"
      });
    } else {
      const streak2 = dailyStreak(load().daily.history || {}, dailyDate);
      const label = streak2 >= 2 ? `${t("daily.streak", { n: streak2 })}  \xB7  ${formatDate(dailyDate)}` : t("daily.todayLabel", { date: formatDate(dailyDate) });
      drawText(label, boardR, hudY + 40, {
        font: subFont,
        align: "right",
        color: "rgba(255,255,255,0.6)"
      });
    }
    drawHintButton(boardR - btnW - 48, hudY + 2, cascade5, grid5, (h) => {
      hint3 = h;
    }, buttons6, cursorX6, cursorY6);
    drawBoard(grid5, { shakeAmp: cascade5.shakeAmp, settings: getSettings(), hint: hint3, idleMs: cascade5.idleSinceMs });
  }
  function onPointer5(evt) {
    if (evt.type === "down") {
      hint3 = null;
      for (let i = buttons6.length - 1; i >= 0; i--) {
        const b = buttons6[i];
        if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
          b.onClick();
          return;
        }
      }
    }
    handle(evt.type, evt.x, evt.y);
  }
  function onMove6(x, y) {
    cursorX6 = x;
    cursorY6 = y;
    move(x, y);
  }

  // src/scenes/gameBlitz.js
  var gameBlitz_exports = {};
  __export(gameBlitz_exports, {
    draw: () => draw13,
    enter: () => enter6,
    exit: () => exit6,
    onMove: () => onMove7,
    onPointer: () => onPointer6,
    update: () => update11
  });
  var grid6 = null;
  var cascade6 = null;
  var hint4 = null;
  var buttons7 = [];
  var cursorX7 = 0;
  var cursorY7 = 0;
  var timeLeftMs = 0;
  var resultTriggered3 = false;
  var lastTickSecond = 0;
  var streak = 0;
  var lastMoveAt = -Infinity;
  function enter6() {
    document.body.className = "";
    clearEffects();
    grid6 = createBoard();
    cascade6 = new Cascade(grid6, {
      mode: "blitz",
      // Blitz-only TIME_PLUS clock gems drop in from the top.
      spawnOpts: { timePlusRate: BLITZ_TIME_PLUS_RATE }
    });
    timeLeftMs = BLITZ_DURATION_MS;
    resultTriggered3 = false;
    lastTickSecond = 0;
    streak = 0;
    lastMoveAt = -Infinity;
    hint4 = null;
    saveKey("profile", { lastPlayedMode: "blitz" });
    bind(grid6, cascade6);
    setActiveCascade(cascade6);
    setPanelWidth(0);
    cascade6.playEntryAnimation();
    wireCascadePresentation(cascade6, {
      onMatchCleared: (cells, _depth, center) => {
        const timeGems = cells.filter((c) => c.special === SPECIAL.TIME_PLUS).length;
        if (timeGems > 0 && !resultTriggered3) {
          timeLeftMs = Math.min(BLITZ_DURATION_MS, timeLeftMs + timeGems * BLITZ_TIME_PLUS_BONUS_MS);
          spawnText(
            center.x,
            center.y - 60,
            t("blitz.timeBonus", { n: timeGems * BLITZ_TIME_PLUS_BONUS_MS / 1e3 }),
            "#4dd0e1",
            22
          );
        }
      },
      onMoveCommitted: () => {
        const now = clockMs();
        streak = now - lastMoveAt <= BLITZ_STREAK_WINDOW_MS ? Math.min(BLITZ_STREAK_MAX, streak + 1) : 1;
        lastMoveAt = now;
        if (streak >= 2) {
          const bonus = (streak - 1) * BLITZ_STREAK_BONUS;
          cascade6.score += bonus;
          spawnText(
            boardCenterX(),
            layout.boardY + 24,
            t("blitz.streak", { n: streak }),
            "#ffd166",
            18
          );
        }
      }
    });
    acquire();
  }
  function exit6() {
    unbind();
    setActiveCascade(null);
    release();
    setPanelWidth(0);
    document.body.className = "";
  }
  function finalize2() {
    resultTriggered3 = true;
    const s = load();
    const prevBest2 = s.blitz.bestScore;
    const isNewBest = cascade6.score > prevBest2;
    if (isNewBest) saveKey("blitz", { bestScore: cascade6.score });
    saveKey("blitz", {
      totalRunsPlayed: s.blitz.totalRunsPlayed + 1,
      lastPlayedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    recordPlayDay(cascade6.score);
    notifyMode("blitz");
    setScene("result", { mode: "blitz", outcome: "done", score: cascade6.score, isNewBest, prevBest: prevBest2 });
  }
  function update11(dt) {
    cascade6.update(dt);
    tickEffects(dt);
    if (!resultTriggered3 && cascade6.state === STATE.IDLE) {
      timeLeftMs -= dt;
      const sec = Math.ceil(timeLeftMs / 1e3);
      if (timeLeftMs > 0 && timeLeftMs < 1e4 && sec !== lastTickSecond) {
        lastTickSecond = sec;
        blitzTick();
      }
      if (timeLeftMs <= 0) {
        timeLeftMs = 0;
        timeUpHorn();
        finalize2();
      }
    }
    hint4 = tickHint(cascade6, grid6, hint4);
  }
  function draw13() {
    clearFrame();
    buttons7 = [];
    const hudY = layout.hudY;
    const boardX = layout.boardX;
    const boardR = boardRight();
    const titleFont = `bold ${responsiveFont(22)}px -apple-system, system-ui, sans-serif`;
    const scoreFont = `bold ${responsiveFont(24)}px -apple-system, system-ui, sans-serif`;
    const subFont = `${responsiveFont(14)}px -apple-system, system-ui, sans-serif`;
    drawText(t("blitz.title"), boardX, hudY + 8, { font: titleFont, shadow: true });
    drawText(formatNumber(Math.floor(cascade6.scoreShown)), boardCenterX(), hudY + 6, {
      font: scoreFont,
      align: "center",
      shadow: true
    });
    const btnW = layout.isNarrow ? 56 : 76;
    drawHitButton(
      boardR - btnW,
      hudY + 2,
      btnW,
      36,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons7,
      cursorX7,
      cursorY7
    );
    const barY = hudY + 44;
    const barH = 8;
    const ctx4 = ctxRef();
    ctx4.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx4, boardX, barY, layout.boardSize, barH, 4);
    ctx4.fill();
    const pct = Math.max(0, Math.min(1, timeLeftMs / BLITZ_DURATION_MS));
    const barColor = timeLeftMs < 1e4 ? "#ff5555" : timeLeftMs < 2e4 ? "#ffaa33" : "#5fd068";
    ctx4.fillStyle = barColor;
    roundRect(ctx4, boardX, barY, layout.boardSize * pct, barH, 4);
    ctx4.fill();
    const seconds = Math.ceil(timeLeftMs / 1e3);
    drawText(t("blitz.seconds", { n: seconds }), boardR, barY - 4, {
      font: subFont,
      align: "right",
      color: timeLeftMs < 1e4 ? "#ff8888" : "rgba(255,255,255,0.85)",
      shadow: true
    });
    drawHintButton(boardR - btnW - 48, hudY + 2, cascade6, grid6, (h) => {
      hint4 = h;
    }, buttons7, cursorX7, cursorY7, 36);
    drawBoard(grid6, { shakeAmp: cascade6.shakeAmp, settings: getSettings(), hint: hint4, idleMs: cascade6.idleSinceMs });
  }
  function onPointer6(evt) {
    if (evt.type === "down") {
      hint4 = null;
      for (let i = buttons7.length - 1; i >= 0; i--) {
        const b = buttons7[i];
        if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
          b.onClick();
          return;
        }
      }
    }
    if (!resultTriggered3) handle(evt.type, evt.x, evt.y);
  }
  function onMove7(x, y) {
    cursorX7 = x;
    cursorY7 = y;
    move(x, y);
  }

  // src/scenes/gamePuzzle.js
  var gamePuzzle_exports = {};
  __export(gamePuzzle_exports, {
    draw: () => draw14,
    enter: () => enter7,
    exit: () => exit7,
    onMove: () => onMove8,
    onPointer: () => onPointer7,
    update: () => update12
  });
  var grid7 = null;
  var cascade7 = null;
  var hint5 = null;
  var buttons8 = [];
  var cursorX8 = 0;
  var cursorY8 = 0;
  var puzzleNum = 1;
  var puzzle = null;
  var movesLeft3 = 0;
  var resultTriggered4 = false;
  var progress = null;
  function freshProgress() {
    return { score: 0, clearedByColor: {}, specialsCreated: {}, maxCascadeDepth: 0 };
  }
  function enter7(args2 = {}) {
    var _a;
    puzzleNum = (_a = args2.puzzle) != null ? _a : null;
    puzzle = puzzleNum != null ? getPuzzle(puzzleNum) : null;
    if (!puzzle) {
      queueMicrotask(() => setScene("puzzleSelect", {}, { replace: true }));
      return;
    }
    document.body.className = "";
    clearEffects();
    const rng = mulberry32(strHash(`puzzle:${puzzleNum}:v1`));
    grid7 = puzzle.board ? puzzle.board.map((row) => [...row].map((ch) => newCell(Number(ch)))) : createBoard(rng);
    cascade7 = new Cascade(grid7, { mode: "puzzle", rng });
    movesLeft3 = puzzle.moves;
    resultTriggered4 = false;
    hint5 = null;
    progress = freshProgress();
    saveKey("profile", { lastPlayedMode: "puzzle" });
    bind(grid7, cascade7);
    setActiveCascade(cascade7);
    setPanelWidth(0);
    cascade7.playEntryAnimation();
    wireCascadePresentation(cascade7, {
      onMatchCleared: (cells, depth) => {
        for (const c of cells) {
          progress.clearedByColor[c.type] = (progress.clearedByColor[c.type] || 0) + 1;
        }
        if (depth > progress.maxCascadeDepth) progress.maxCascadeDepth = depth;
      },
      onSpecialSpawned: (special) => {
        progress.specialsCreated[special] = (progress.specialsCreated[special] || 0) + 1;
      },
      onMoveCommitted: () => {
        movesLeft3--;
      },
      onScoreChanged: (newScore) => {
        progress.score = newScore;
      },
      onIdleReached: () => checkComplete()
    });
    acquire();
  }
  function exit7() {
    unbind();
    setActiveCascade(null);
    release();
    setPanelWidth(0);
    document.body.className = "";
  }
  function checkComplete() {
    if (resultTriggered4) return;
    if (isGoalMet(puzzle.goal, progress)) {
      resultTriggered4 = true;
      finalizeWin2();
    } else if (movesLeft3 <= 0) {
      resultTriggered4 = true;
      finalizeLose2();
    }
  }
  function finalizeWin2() {
    const s = load();
    const existing = s.puzzle.completed[String(puzzleNum)] || { bestScore: 0 };
    const updated = { ...s.puzzle.completed };
    updated[String(puzzleNum)] = {
      bestScore: Math.max(existing.bestScore, cascade7.score),
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveKey("puzzle", { completed: updated });
    recordPlayDay(cascade7.score);
    notifyMode("puzzle");
    setScene("result", { mode: "puzzle", outcome: "win", score: cascade7.score, puzzleNum });
  }
  function finalizeLose2() {
    recordPlayDay(cascade7.score);
    setScene("result", { mode: "puzzle", outcome: "lose", score: cascade7.score, puzzleNum });
  }
  function update12(dt) {
    cascade7.update(dt);
    tickEffects(dt);
    hint5 = tickHint(cascade7, grid7, hint5);
  }
  function draw14() {
    clearFrame();
    buttons8 = [];
    const settings = getSettings();
    const hudY = layout.hudY;
    const boardX = layout.boardX;
    const boardR = boardRight();
    const boardW = layout.boardSize;
    const titleFont = `bold ${responsiveFont(18)}px sans-serif`;
    const goalFont = `${responsiveFont(13)}px sans-serif`;
    const progFont = `bold ${responsiveFont(14)}px sans-serif`;
    drawText(t("puzzle.title", { name: t(puzzle.nameKey) }), boardX, hudY + 4, { font: titleFont, shadow: true });
    drawText(goalText(puzzle.goal), boardX, hudY + 24, { font: goalFont, color: "rgba(255,255,255,0.75)" });
    drawText(progressText(puzzle.goal, progress), boardCenterX(), hudY + 6, {
      font: progFont,
      align: "center",
      shadow: true
    });
    const moveColor = movesLeft3 <= 2 ? `rgba(255, ${100 + Math.floor(60 * (0.5 + 0.5 * Math.sin(clockMs() / 220)))}, 120, 1)` : "rgba(255,255,255,0.75)";
    drawText(t("puzzle.moves", { n: movesLeft3 }), boardCenterX(), hudY + 28, {
      font: goalFont,
      align: "center",
      color: moveColor
    });
    const btnW = layout.isNarrow ? 56 : 76;
    drawHitButton(
      boardR - btnW,
      hudY + 2,
      btnW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("puzzleSelect"),
      buttons8,
      cursorX8,
      cursorY8
    );
    drawHintButton(boardR - btnW - 48, hudY + 2, cascade7, grid7, (h) => {
      hint5 = h;
    }, buttons8, cursorX8, cursorY8);
    drawBoard(grid7, { shakeAmp: cascade7.shakeAmp, settings, hint: hint5, idleMs: cascade7.idleSinceMs });
  }
  function onPointer7(evt) {
    if (evt.type === "down") {
      hint5 = null;
      for (let i = buttons8.length - 1; i >= 0; i--) {
        const b = buttons8[i];
        if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
          b.onClick();
          return;
        }
      }
    }
    handle(evt.type, evt.x, evt.y);
  }
  function onMove8(x, y) {
    cursorX8 = x;
    cursorY8 = y;
    move(x, y);
  }

  // src/scenes/puzzleSelect.js
  var puzzleSelect_exports = {};
  __export(puzzleSelect_exports, {
    draw: () => draw15,
    enter: () => enter8,
    exit: () => exit8,
    onMove: () => onMove9,
    onPointer: () => onPointer8,
    onWheel: () => onWheel2,
    update: () => update13
  });
  var buttons9 = [];
  var cursorX9 = 0;
  var cursorY9 = 0;
  var scrollY = 0;
  var maxScroll = 0;
  var isPointerDown2 = false;
  var dragStartY = 0;
  var dragStartScroll = 0;
  var didDragScroll = false;
  var SCROLL_THRESHOLD = 8;
  function enter8() {
    document.body.className = "";
    buttons9 = [];
    scrollY = 0;
    isPointerDown2 = false;
    didDragScroll = false;
  }
  function exit8() {
  }
  function update13(dt) {
  }
  function draw15() {
    var _a;
    const { w, h } = getViewport();
    clearFrame();
    buttons9 = [];
    const titleY = h * 0.06 + layout.safeTop;
    drawText(t("puzzleSelect.title"), w / 2, titleY, {
      font: `bold ${responsiveFont(28)}px -apple-system, system-ui, sans-serif`,
      align: "center"
    });
    const state = load();
    const completed = ((_a = state.puzzle) == null ? void 0 : _a.completed) || {};
    drawText(
      t("puzzleSelect.solvedCount", { done: Object.keys(completed).length, total: PUZZLES.length }),
      w / 2,
      titleY + 32,
      { font: "14px sans-serif", align: "center", color: "rgba(255,255,255,0.6)" }
    );
    const col = menuColumn();
    const cols = Math.min(3, Math.max(2, Math.floor(col.w / 230)));
    const gap = 14;
    const cellW = Math.floor((col.w - (cols - 1) * gap) / cols);
    const cellH = 110;
    const totalW = cols * cellW + (cols - 1) * gap;
    const ox = col.x + Math.floor((col.w - totalW) / 2);
    const listTop = h * 0.18;
    const listBottom = h - 20;
    const visibleH = Math.max(120, listBottom - listTop);
    const rows = Math.ceil(PUZZLES.length / cols);
    const totalH = rows * cellH + (rows - 1) * gap;
    maxScroll = Math.max(0, totalH - visibleH);
    scrollY = Math.max(0, Math.min(maxScroll, scrollY));
    const ctx4 = ctxRef();
    ctx4.save();
    ctx4.beginPath();
    ctx4.rect(0, listTop, w, visibleH);
    ctx4.clip();
    for (let i = 0; i < PUZZLES.length; i++) {
      const p = PUZZLES[i];
      const col2 = i % cols, row = Math.floor(i / cols);
      const x = ox + col2 * (cellW + gap);
      const y = listTop + row * (cellH + gap) - scrollY;
      if (y + cellH < listTop - 4 || y > listBottom + 4) continue;
      const isDone = !!completed[String(p.id)];
      drawPuzzleTile(x, y, cellW, cellH, p, isDone, listTop, listBottom);
    }
    ctx4.restore();
    if (maxScroll > 0) {
      const trackX = w - 8;
      ctx4.fillStyle = "rgba(255,255,255,0.05)";
      ctx4.fillRect(trackX, listTop, 3, visibleH);
      const thumbH = Math.max(20, visibleH / totalH * visibleH);
      const thumbY = listTop + scrollY / maxScroll * (visibleH - thumbH);
      ctx4.fillStyle = "rgba(255,255,255,0.3)";
      ctx4.fillRect(trackX, thumbY, 3, thumbH);
    }
    const backW = layout.isNarrow ? 56 : 76;
    const backY = 24 + layout.safeTop;
    drawHitButton(
      col.right - backW,
      backY,
      backW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons9,
      cursorX9,
      cursorY9
    );
  }
  function drawPuzzleTile(x, y, w, h, puzzle2, done, clipTop, clipBottom) {
    const hover = cursorX9 >= x && cursorX9 <= x + w && cursorY9 >= y && cursorY9 <= y + h;
    const ctx4 = ctxRef();
    ctx4.save();
    roundRect(ctx4, x, y, w, h, 12);
    ctx4.fillStyle = done ? "rgba(95,208,104,0.22)" : hover ? "rgba(124,58,237,0.8)" : "rgba(60,50,100,0.85)";
    ctx4.fill();
    ctx4.strokeStyle = done ? "rgba(95,208,104,0.5)" : "rgba(255,255,255,0.1)";
    ctx4.stroke();
    ctx4.fillStyle = "#fff";
    ctx4.font = "bold 16px -apple-system, system-ui, sans-serif";
    ctx4.textAlign = "left";
    ctx4.textBaseline = "top";
    fillTextEllipsized(
      ctx4,
      t("puzzleSelect.tileLabel", { id: puzzle2.id, name: t(puzzle2.nameKey) }),
      x + 14,
      y + 14,
      w - 48
    );
    ctx4.font = "12px sans-serif";
    ctx4.fillStyle = "rgba(255,255,255,0.7)";
    fillTextEllipsized(ctx4, t(puzzle2.hintKey), x + 14, y + 38, w - 28);
    ctx4.font = "11px sans-serif";
    ctx4.fillStyle = "rgba(255,255,255,0.5)";
    ctx4.fillText(tn("puzzleSelect.tileMoves", puzzle2.moves), x + 14, y + h - 22);
    if (done) {
      ctx4.font = "22px sans-serif";
      ctx4.textAlign = "right";
      ctx4.fillStyle = "#5fd068";
      ctx4.fillText("\u2713", x + w - 14, y + 12);
    }
    ctx4.restore();
    const ry = Math.max(y, clipTop);
    const rb = Math.min(y + h, clipBottom);
    if (rb > ry) buttons9.push({ x, y: ry, w, h: rb - ry, onClick: () => setScene("gamePuzzle", { puzzle: puzzle2.id }) });
  }
  function onPointer8(evt) {
    if (evt.type === "down") {
      isPointerDown2 = true;
      didDragScroll = false;
      dragStartY = evt.y;
      dragStartScroll = scrollY;
    } else if (evt.type === "up") {
      if (!didDragScroll) {
        for (let i = buttons9.length - 1; i >= 0; i--) {
          const b = buttons9[i];
          if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
            b.onClick();
            break;
          }
        }
      }
      isPointerDown2 = false;
    } else if (evt.type === "cancel") {
      isPointerDown2 = false;
    }
  }
  function onMove9(x, y) {
    cursorX9 = x;
    cursorY9 = y;
    if (!isPointerDown2) return;
    const dy = y - dragStartY;
    if (!didDragScroll && Math.abs(dy) > SCROLL_THRESHOLD) didDragScroll = true;
    if (didDragScroll) {
      scrollY = Math.max(0, Math.min(maxScroll, dragStartScroll - dy));
    }
  }
  function onWheel2(dy) {
    scrollY = Math.max(0, Math.min(maxScroll, scrollY + dy));
  }

  // src/scenes/stats.js
  var stats_exports = {};
  __export(stats_exports, {
    draw: () => draw16,
    enter: () => enter9,
    exit: () => exit9,
    onMove: () => onMove10,
    onPointer: () => onPointer9,
    onWheel: () => onWheel3,
    update: () => update14
  });
  var buttons10 = [];
  var cursorX10 = 0;
  var cursorY10 = 0;
  var scrollY2 = 0;
  var maxScroll2 = 0;
  var isPointerDown3 = false;
  var dragStartY2 = 0;
  var dragStartScroll2 = 0;
  var didDragScroll2 = false;
  var SCROLL_THRESHOLD2 = 8;
  function enter9() {
    document.body.className = "";
    buttons10 = [];
    scrollY2 = 0;
    isPointerDown3 = false;
    didDragScroll2 = false;
  }
  function exit9() {
  }
  function update14(dt) {
  }
  function draw16() {
    const { w, h } = getViewport();
    clearFrame();
    buttons10 = [];
    const titleY = h * 0.05 + layout.safeTop;
    drawText(t("stats.title"), w / 2, titleY, {
      font: `bold ${responsiveFont(26)}px -apple-system, system-ui, sans-serif`,
      align: "center"
    });
    const sub = summary();
    drawText(t("stats.unlockedSummary", { unlocked: sub.unlocked, total: sub.total }), w / 2, titleY + 32, {
      font: "14px sans-serif",
      align: "center",
      color: "rgba(255,255,255,0.6)"
    });
    const cardY = titleY + 64;
    const cardW = Math.min(560, w - 40);
    const cardX = (w - cardW) / 2;
    const cardH = 166;
    const ctx4 = ctxRef();
    roundRect(ctx4, cardX, cardY, cardW, cardH, 12);
    ctx4.fillStyle = "rgba(40,30,80,0.55)";
    ctx4.fill();
    ctx4.strokeStyle = "rgba(255,255,255,0.08)";
    ctx4.stroke();
    drawStats(cardX + 16, cardY + 14, cardW - 32);
    const gridTop = cardY + cardH + 20;
    const gridBottom = h - 16;
    const visibleH = gridBottom - gridTop;
    const cols = Math.max(2, Math.floor((w - 32) / 220));
    const cellW = Math.floor((w - 32 - (cols - 1) * 14) / cols);
    const cellH = 80;
    const rows = Math.ceil(ACHIEVEMENTS.length / cols);
    const totalH = rows * cellH + (rows - 1) * 14;
    maxScroll2 = Math.max(0, totalH - visibleH);
    ctx4.save();
    ctx4.beginPath();
    ctx4.rect(0, gridTop, w, visibleH);
    ctx4.clip();
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const a = ACHIEVEMENTS[i];
      const col2 = i % cols, row = Math.floor(i / cols);
      const x = 16 + col2 * (cellW + 14);
      const y = gridTop + row * (cellH + 14) - scrollY2;
      if (y + cellH < gridTop - 4 || y > gridBottom + 4) continue;
      drawAchievementTile(x, y, cellW, cellH, a, !!sub.unlockedSet[a.id]);
    }
    ctx4.restore();
    if (maxScroll2 > 0) {
      const trackX = w - 8;
      const trackH = visibleH;
      ctx4.fillStyle = "rgba(255,255,255,0.05)";
      ctx4.fillRect(trackX, gridTop, 3, trackH);
      const thumbH = Math.max(20, visibleH / totalH * trackH);
      const thumbY = gridTop + scrollY2 / maxScroll2 * (trackH - thumbH);
      ctx4.fillStyle = "rgba(255,255,255,0.3)";
      ctx4.fillRect(trackX, thumbY, 3, thumbH);
    }
    const backW = layout.isNarrow ? 56 : 76;
    const col = menuColumn();
    const backY = 24 + layout.safeTop;
    drawHitButton(
      col.right - backW,
      backY,
      backW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons10,
      cursorX10,
      cursorY10
    );
  }
  function drawStats(x, y, w) {
    var _a, _b, _c, _d, _e, _f;
    const state = load();
    const counters2 = ((_a = state.achievements) == null ? void 0 : _a.counters) || {};
    const playedMs = counters2.timePlayedMs || 0;
    const lines = [
      { label: t("stats.totalGemsCleared"), value: formatNumber(counters2.totalMatches || 0) },
      { label: t("stats.zenBestScore"), value: formatNumber(((_b = state.zen) == null ? void 0 : _b.bestScore) || 0) },
      { label: t("stats.zenRunsPlayed"), value: formatNumber(((_c = state.zen) == null ? void 0 : _c.totalRunsPlayed) || 0) },
      { label: t("stats.classicLevelsBeaten"), value: t("stats.classicLevelsBeatenValue", { n: Object.keys(((_d = state.classic) == null ? void 0 : _d.levels) || {}).length, total: levelCount() }) },
      { label: t("stats.dailyChallengesCompleted"), value: formatNumber(((_e = state.daily) == null ? void 0 : _e.totalDaysPlayed) || 0) },
      { label: t("stats.blitzBestScore"), value: formatNumber(((_f = state.blitz) == null ? void 0 : _f.bestScore) || 0) },
      { label: t("stats.biggestCascade"), value: `x${counters2.biggestCascade || 0}` },
      { label: t("stats.specialsCreated"), value: formatNumber(counters2.specialsCreated || 0) },
      { label: t("stats.bombsDefused"), value: formatNumber(counters2.bombsDefused || 0) },
      { label: t("stats.timePlayed"), value: t("stats.timeValue", { h: Math.floor(playedMs / 36e5), m: Math.floor(playedMs % 36e5 / 6e4) }) }
    ];
    const colW = w / 2;
    for (let i = 0; i < lines.length; i++) {
      const lx = x + i % 2 * colW;
      const ly = y + Math.floor(i / 2) * 28;
      drawText(lines[i].label, lx, ly, { font: "12px sans-serif", color: "rgba(255,255,255,0.55)" });
      drawText(lines[i].value, lx, ly + 12, { font: "bold 16px sans-serif", color: "#f3f0ff" });
    }
  }
  function drawAchievementTile(x, y, w, h, a, unlocked) {
    const ctx4 = ctxRef();
    ctx4.save();
    roundRect(ctx4, x, y, w, h, 10);
    ctx4.fillStyle = unlocked ? "rgba(60,50,110,0.85)" : "rgba(30,25,50,0.5)";
    ctx4.fill();
    ctx4.strokeStyle = unlocked ? "rgba(255,215,0,0.45)" : "rgba(255,255,255,0.06)";
    ctx4.stroke();
    ctx4.font = `${Math.floor(h * 0.45)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx4.textAlign = "center";
    ctx4.textBaseline = "middle";
    ctx4.globalAlpha = unlocked ? 1 : 0.35;
    ctx4.fillText(a.icon, x + 36, y + h / 2);
    ctx4.globalAlpha = 1;
    ctx4.fillStyle = unlocked ? "#fff" : "rgba(255,255,255,0.4)";
    ctx4.font = `bold ${Math.floor(h * 0.22)}px sans-serif`;
    ctx4.textAlign = "left";
    ctx4.fillText(t(a.nameKey), x + 72, y + h * 0.38);
    ctx4.fillStyle = unlocked ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)";
    ctx4.font = `${Math.floor(h * 0.16)}px sans-serif`;
    const maxDescW = w - (72 + 8);
    ctx4.fillText(ellipsize2(ctx4, t(a.descKey), maxDescW), x + 72, y + h * 0.66);
    ctx4.restore();
  }
  function ellipsize2(ctx4, text, maxW) {
    if (ctx4.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (ctx4.measureText(text.slice(0, mid) + "\u2026").width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo) + "\u2026";
  }
  function onPointer9(evt) {
    if (evt.type === "down") {
      for (let i = buttons10.length - 1; i >= 0; i--) {
        const b = buttons10[i];
        if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
          b.onClick();
          return;
        }
      }
      isPointerDown3 = true;
      didDragScroll2 = false;
      dragStartY2 = evt.y;
      dragStartScroll2 = scrollY2;
    } else if (evt.type === "up") {
      isPointerDown3 = false;
    } else if (evt.type === "cancel") {
      isPointerDown3 = false;
    }
  }
  function onMove10(x, y) {
    cursorX10 = x;
    cursorY10 = y;
    if (!isPointerDown3) return;
    const dy = y - dragStartY2;
    if (!didDragScroll2 && Math.abs(dy) > SCROLL_THRESHOLD2) didDragScroll2 = true;
    if (didDragScroll2) {
      scrollY2 = Math.max(0, Math.min(maxScroll2, dragStartScroll2 - dy));
    }
  }
  function onWheel3(dy) {
    scrollY2 = Math.max(0, Math.min(maxScroll2, scrollY2 + dy));
  }

  // src/scenes/result.js
  var result_exports = {};
  __export(result_exports, {
    computeResultLayout: () => computeResultLayout,
    draw: () => draw17,
    enter: () => enter10,
    exit: () => exit10,
    onMove: () => onMove11,
    onPointer: () => onPointer10,
    update: () => update15
  });

  // src/leaderboard.js
  var TIMEOUT_MS = 3e3;
  async function call(path, init4) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(path, { ...init4, signal: ctrl.signal });
      if (!res.ok) return { ok: false };
      const data = await res.json();
      if (!data || !Array.isArray(data.entries)) return { ok: false };
      const out = { ok: true, entries: data.entries };
      if (Number.isInteger(data.rank)) out.rank = data.rank;
      return out;
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }
  async function fetchDaily(dateISO) {
    return call(`/api/leaderboard/${encodeURIComponent(dateISO)}`);
  }
  async function submitDaily(dateISO, name, score) {
    return call(`/api/leaderboard/${encodeURIComponent(dateISO)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score })
    });
  }

  // src/shareImage.js
  var CARD_W = 640;
  var CARD_H = 400;
  var FONT = "-apple-system, system-ui, sans-serif";
  var BG = "#1a1530";
  var ACCENT_STOPS = [[0, "#ff9ec0"], [0.5, "#d59bff"], [1, "#8fd1ff"]];
  async function shareCard(card, shareText) {
    const { title = "", lines = [], footer = "" } = card || {};
    if (typeof OffscreenCanvas !== "undefined" && typeof File !== "undefined" && navigator.canShare && navigator.share) {
      let file = null;
      try {
        const blob = await renderCard(title, lines, footer).convertToBlob({ type: "image/png" });
        const f = new File([blob], "jeweled.png", { type: "image/png" });
        if (navigator.canShare({ files: [f] })) file = f;
      } catch {
      }
      if (file) {
        try {
          await navigator.share({ files: [file], text: shareText, title: "Jeweled" });
          return "shared-image";
        } catch (err) {
          if (isAbort(err)) return "canceled";
          return copyFallback(shareText);
        }
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "Jeweled", text: shareText });
        return "shared-text";
      } catch (err) {
        if (isAbort(err)) return "canceled";
      }
    }
    return copyFallback(shareText);
  }
  function isAbort(err) {
    return (err == null ? void 0 : err.name) === "AbortError";
  }
  async function copyFallback(shareText) {
    var _a;
    try {
      if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) {
        await navigator.clipboard.writeText(shareText);
        return "copied";
      }
    } catch {
    }
    return "unavailable";
  }
  function renderCard(title, lines, footer) {
    const canvas4 = new OffscreenCanvas(CARD_W, CARD_H);
    const ctx4 = canvas4.getContext("2d");
    roundRect2(ctx4, 0, 0, CARD_W, CARD_H, 28);
    ctx4.fillStyle = BG;
    ctx4.fill();
    roundRect2(ctx4, 1, 1, CARD_W - 2, CARD_H - 2, 27);
    ctx4.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx4.lineWidth = 2;
    ctx4.stroke();
    ctx4.textAlign = "center";
    ctx4.textBaseline = "middle";
    ctx4.save();
    ctx4.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx4.shadowBlur = 8;
    ctx4.shadowOffsetY = 2;
    ctx4.fillStyle = "#f3f0ff";
    ctx4.font = `bold 44px ${FONT}`;
    ctx4.fillText(String(title), CARD_W / 2, 88);
    ctx4.restore();
    const barW = 180, barH = 6;
    const bar = ctx4.createLinearGradient(CARD_W / 2 - barW / 2, 0, CARD_W / 2 + barW / 2, 0);
    for (const [offset, color] of ACCENT_STOPS) bar.addColorStop(offset, color);
    roundRect2(ctx4, CARD_W / 2 - barW / 2, 124, barW, barH, barH / 2);
    ctx4.fillStyle = bar;
    ctx4.fill();
    let y = 178;
    for (let i = 0; i < lines.length; i++) {
      const size = Math.max(16, 34 - i * 6);
      ctx4.font = (i === 0 ? "bold " : "") + size + "px " + FONT;
      ctx4.fillStyle = i === 0 ? "#ffffff" : "rgba(243, 240, 255, 0.78)";
      ctx4.fillText(String(lines[i]), CARD_W / 2, y);
      y += size + 16;
    }
    ctx4.font = `15px ${FONT}`;
    ctx4.fillStyle = "rgba(243, 240, 255, 0.45)";
    ctx4.fillText(String(footer), CARD_W / 2, CARD_H - 34);
    return canvas4;
  }
  function roundRect2(ctx4, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx4.beginPath();
    ctx4.moveTo(x + r, y);
    ctx4.lineTo(x + w - r, y);
    ctx4.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx4.lineTo(x + w, y + h - r);
    ctx4.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx4.lineTo(x + r, y + h);
    ctx4.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx4.lineTo(x, y + r);
    ctx4.quadraticCurveTo(x, y, x + r, y);
    ctx4.closePath();
  }

  // src/scenes/result.js
  var SITE_URL = "https://jeweled.daddiego.com.ar";
  var args = {};
  var buttons11 = [];
  var cursorX11 = 0;
  var cursorY11 = 0;
  var lb = null;
  var lbToken = 0;
  var submittedFor = null;
  var press2 = createPressTracker();
  function enter10(a = {}) {
    args = a || {};
    document.body.className = "";
    buttons11 = [];
    press2.cancel();
    lb = null;
    if (args.outcome === "lose") loseThud();
    else if (args.isNewBest || args.outcome === "win") winFanfare();
    else milestoneDing();
    if (args.mode === "daily" && args.date) {
      const token = ++lbToken;
      const name = getProfile().playerName || "Player";
      const alreadySubmitted = args.isReplay || submittedFor === args.date;
      if (!alreadySubmitted) submittedFor = args.date;
      const req = alreadySubmitted ? fetchDaily(args.date) : submitDaily(args.date, name, args.score | 0);
      req.then((res) => {
        if (token === lbToken) lb = res;
      });
    }
  }
  function exit10() {
  }
  function update15(dt) {
  }
  function draw17() {
    var _a, _b;
    const { w, h } = getViewport();
    clearFrame();
    buttons11 = [];
    let title = "";
    let subtitle = "";
    if (args.mode === "classic") {
      if (args.outcome === "win") {
        title = t("result.classicWin");
        const n = Math.max(0, Math.min(3, args.stars | 0));
        const stars = "\u2605".repeat(n) + "\u2606".repeat(3 - n);
        subtitle = `${stars}
${t("result.classicSubtitleWin", { score: formatNumber(args.score), target: formatNumber(args.target) })}`;
      } else {
        title = t("result.classicLose");
        subtitle = t("result.classicSubtitleLose", { score: formatNumber(args.score), target: formatNumber(args.target) });
      }
    } else if (args.mode === "daily") {
      title = t("result.dailyHeader", { date: formatDate(args.date) });
      const best = args.isNewBest ? args.score : (_a = args.prevBest) != null ? _a : load().daily.bestEver;
      const bestLine = args.isNewBest ? t("result.newBest") : t("result.bestEver", { score: formatNumber(best) });
      subtitle = `${t("result.scorePts", { score: formatNumber(args.score) })}
${bestLine}`;
      if ((args.streak || 0) >= 2) subtitle += `
${t("daily.streak", { n: args.streak })}`;
    } else if (args.mode === "blitz") {
      title = t("result.blitzDone");
      const best = args.isNewBest ? args.score : (_b = args.prevBest) != null ? _b : 0;
      const bestLine = args.isNewBest ? t("result.newBest") : t("result.best", { score: formatNumber(best) });
      subtitle = `${t("result.scorePts", { score: formatNumber(args.score) })}
${bestLine}`;
    } else if (args.mode === "puzzle") {
      const p = PUZZLES.find((p2) => p2.id === args.puzzleNum);
      const puzzleName = p ? t(p.nameKey) : "";
      if (args.outcome === "win") {
        title = t("result.puzzleWin");
        subtitle = `${puzzleName}
${t("result.scorePts", { score: formatNumber(args.score) })}`;
      } else {
        title = t("result.puzzleLose");
        subtitle = `${puzzleName}
${t("result.goalNotReached")}`;
      }
    } else {
      title = t("result.runEnded");
      subtitle = t("result.scorePts", { score: formatNumber(args.score) });
    }
    const lines = subtitle.split("\n");
    const actions = buildActions();
    const showLeaderboard = args.mode === "daily" && lb && lb.ok;
    const leaderboardRows = showLeaderboard ? Math.max(1, Math.min(5, (lb.entries || []).length)) : 0;
    const box = computeResultLayout({
      w,
      h,
      safeTop: layout.safeTop,
      subtitleLines: lines.length,
      actionCount: actions.length,
      leaderboardRows,
      hasRank: showLeaderboard && lb.rank != null
    });
    drawText(title, w / 2, box.titleY, {
      font: `bold ${box.titleFont}px -apple-system, system-ui, sans-serif`,
      align: "center",
      shadow: true
    });
    let y = box.subtitleY;
    for (const line of lines) {
      drawText(line, w / 2, y, {
        font: line.includes("\u2605") ? `bold ${box.starFont}px sans-serif` : `${box.subtitleFont}px sans-serif`,
        align: "center",
        shadow: true,
        color: line.includes("\u2605") ? "#ffd166" : "#f3f0ff"
      });
      y += box.subtitleStep;
    }
    let ay = box.buttonsY;
    for (const action of actions) {
      drawHitButton4(
        box.buttonX,
        ay,
        box.buttonW,
        box.buttonH,
        action.label,
        action.onClick,
        { activateOnUp: action.activateOnUp }
      );
      ay += box.buttonH + box.buttonGap;
    }
    if (showLeaderboard) drawLeaderboard(w, box.leaderboardY, box.leaderboardStep);
  }
  function buildActions() {
    const actions = [];
    const add = (label, onClick, opts) => actions.push({ label, onClick, ...opts });
    if (args.mode === "classic" && args.outcome === "win" && args.level < LEVELS.length) {
      add(t("common.nextLevel"), () => setScene("gameClassic", { level: args.level + 1 }));
    } else if (args.mode === "classic" && args.outcome === "lose") {
      add(t("common.retry"), () => setScene("gameClassic", { level: args.level }));
    } else if (args.mode === "blitz") {
      add(t("common.again"), () => setScene("gameBlitz"));
    } else if (args.mode === "puzzle") {
      if (args.outcome === "win") {
        const hasNext = args.puzzleNum < PUZZLES.length;
        if (hasNext) {
          add(t("common.nextPuzzle"), () => setScene("gamePuzzle", { puzzle: args.puzzleNum + 1 }));
        } else {
          add(t("common.allPuzzles"), () => setScene("puzzleSelect"));
        }
      } else {
        add(t("common.retry"), () => setScene("gamePuzzle", { puzzle: args.puzzleNum }));
      }
    } else if (args.mode === "daily") {
      add(t("common.share"), shareDaily, { activateOnUp: true });
      add(t("result.viewHistory"), () => setScene("dailyHistory"));
    }
    add(t("common.title"), () => setScene("title"));
    return actions;
  }
  function computeResultLayout({
    w,
    h,
    safeTop = 0,
    subtitleLines,
    actionCount,
    leaderboardRows = 0,
    hasRank = false
  }) {
    const compact = h < 680 || w < 480;
    const titleFont = compact ? 30 : 36;
    const titleHeight = titleFont + 8;
    const subtitleFont = compact ? 18 : 20;
    const starFont = compact ? 30 : 36;
    const subtitleStep = compact ? 30 : 40;
    const buttonH = compact ? 42 : 50;
    const buttonGap = compact ? 8 : 14;
    const leaderboardStep = compact ? 18 : 20;
    const buttonW = Math.min(200, Math.max(120, w - 32));
    const subtitleGap = 8;
    const actionGap = compact ? 14 : 24;
    const leaderboardGap = compact ? 12 : 18;
    const buttonBlock = actionCount * buttonH + Math.max(0, actionCount - 1) * buttonGap;
    const leaderboardBlock = leaderboardRows > 0 ? 26 + leaderboardRows * leaderboardStep + (hasRank ? 18 : 0) : 0;
    const contentHeight = titleHeight + subtitleGap + subtitleLines * subtitleStep + actionGap + buttonBlock + (leaderboardBlock ? leaderboardGap + leaderboardBlock : 0);
    const top = Math.max(safeTop + 12, (h - contentHeight) / 2);
    const subtitleY = top + titleHeight + subtitleGap;
    const buttonsY = subtitleY + subtitleLines * subtitleStep + actionGap;
    const leaderboardY = buttonsY + buttonBlock + leaderboardGap;
    return {
      titleY: top,
      subtitleY,
      buttonsY,
      leaderboardY,
      bottom: top + contentHeight,
      buttonX: w / 2 - buttonW / 2,
      buttonW,
      buttonH,
      buttonGap,
      titleFont,
      subtitleFont,
      starFont,
      subtitleStep,
      leaderboardStep
    };
  }
  function drawLeaderboard(w, y, rowStep) {
    const ctx4 = ctxRef();
    drawText(t("leaderboard.title"), w / 2, y, {
      font: "bold 16px sans-serif",
      align: "center",
      color: "#ffd166",
      shadow: true
    });
    y += 26;
    const entries = (lb.entries || []).slice(0, 5);
    if (entries.length === 0) {
      drawText(t("leaderboard.empty"), w / 2, y, {
        font: "14px sans-serif",
        align: "center",
        color: "rgba(255,255,255,0.7)"
      });
      y += 22;
    } else {
      ctx4.save();
      ctx4.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx4.textAlign = "center";
      ctx4.textBaseline = "top";
      for (let i = 0; i < entries.length; i++) {
        ctx4.fillStyle = i === 0 ? "#ffd166" : "rgba(255,255,255,0.85)";
        ctx4.fillText(`${i + 1}. ${entries[i].name} \u2014 ${formatNumber(entries[i].score)}`, w / 2, y);
        y += rowStep;
      }
      ctx4.restore();
    }
    if (lb.rank != null) {
      drawText(t("leaderboard.rank", { rank: lb.rank }), w / 2, y + 2, {
        font: "13px sans-serif",
        align: "center",
        color: "rgba(255,255,255,0.6)"
      });
    }
  }
  async function shareDaily() {
    var _a;
    const text = buildShareText({
      dateLabel: formatDate(args.date),
      score: formatNumber(args.score),
      movesUsed: (_a = args.movesUsed) != null ? _a : null,
      streak: args.streak || 0,
      url: SITE_URL
    });
    const lines = [
      formatDate(args.date),
      t("result.scorePts", { score: formatNumber(args.score) })
    ];
    if ((args.streak || 0) >= 2) lines.push(t("daily.streak", { n: args.streak }));
    const outcome = await shareCard(
      { title: "Jeweled Daily", lines, footer: SITE_URL },
      text
    );
    if (outcome === "copied") {
      await alert(t("common.copiedToClipboard"));
    }
  }
  function drawHitButton4(x, y, w, h, label, onClick, opts) {
    drawHitButton(x, y, w, h, label, onClick, buttons11, cursorX11, cursorY11, opts);
  }
  function onPointer10(evt) {
    if (evt.type === "up") {
      press2.release(evt.x, evt.y);
      return;
    }
    if (evt.type !== "down") {
      press2.cancel();
      return;
    }
    for (const b of buttons11) {
      if (hitTest(b, evt.x, evt.y)) {
        if (b.activateOnUp) press2.arm(b);
        else b.onClick();
        return;
      }
    }
  }
  function onMove11(x, y) {
    cursorX11 = x;
    cursorY11 = y;
  }

  // src/scenes/gempedia.js
  var gempedia_exports = {};
  __export(gempedia_exports, {
    ENTRIES: () => ENTRIES,
    draw: () => draw18,
    enter: () => enter11,
    exit: () => exit11,
    onMove: () => onMove12,
    onPointer: () => onPointer11,
    onWheel: () => onWheel4,
    update: () => update16
  });
  function entry(id, emoji, ring) {
    return {
      id,
      emoji,
      ring,
      nameKey: `gempedia.${id}.name`,
      descKey: `gempedia.${id}.desc`,
      howKey: `gempedia.${id}.how`
    };
  }
  var ENTRIES = [
    entry("line", "\u2194\uFE0F", "#8ab4ff"),
    entry("colorBomb", "\u{1F52E}", "#c084fc"),
    entry("areaBomb", "\u{1F4A5}", "#ff8a3d"),
    entry("star", "\u2B50", "#ffd700"),
    entry("fire", "\u{1F525}", "#ff5722"),
    entry("lightning", "\u26A1", "#ffeb3b"),
    entry("wildcard", "\u{1F0CF}", "#7c3aed"),
    entry("coin", "\u{1FA99}", "#ffd166"),
    entry("gravity", "\u{1F503}", "#6ee7b7"),
    entry("timeBomb", "\u{1F4A3}", "#ff4444"),
    ...POWERUP_SLOTS.map((slot) => entry(slot, POWERUP_META[slot].emoji, POWERUP_META[slot].ring))
  ];
  var CARD_H2 = 92;
  var CARD_GAP = 12;
  var SCROLL_THRESHOLD3 = 8;
  var buttons12 = [];
  var cursorX12 = 0;
  var cursorY12 = 0;
  var scrollY3 = 0;
  var maxScroll3 = 0;
  var isPointerDown4 = false;
  var dragStartY3 = 0;
  var dragStartScroll3 = 0;
  var didDragScroll3 = false;
  function enter11() {
    document.body.className = "";
    buttons12 = [];
    scrollY3 = 0;
    isPointerDown4 = false;
    didDragScroll3 = false;
  }
  function exit11() {
  }
  function update16(dt) {
  }
  function draw18() {
    const { w, h } = getViewport();
    clearFrame();
    buttons12 = [];
    const titleY = h * 0.05 + layout.safeTop;
    drawText(t("gempedia.title"), w / 2, titleY, {
      font: `bold ${responsiveFont(26)}px -apple-system, system-ui, sans-serif`,
      align: "center"
    });
    drawText(t("gempedia.subtitle"), w / 2, titleY + 32, {
      font: "14px sans-serif",
      align: "center",
      color: "rgba(255,255,255,0.6)"
    });
    const listTop = titleY + 64;
    const listBottom = h - 16;
    const visibleH = listBottom - listTop;
    const col = menuColumn();
    const totalH = ENTRIES.length * CARD_H2 + (ENTRIES.length - 1) * CARD_GAP;
    maxScroll3 = Math.max(0, totalH - visibleH);
    const ctx4 = ctxRef();
    ctx4.save();
    ctx4.beginPath();
    ctx4.rect(0, listTop, w, visibleH);
    ctx4.clip();
    for (let i = 0; i < ENTRIES.length; i++) {
      const y = listTop + i * (CARD_H2 + CARD_GAP) - scrollY3;
      if (y + CARD_H2 < listTop - 4 || y > listBottom + 4) continue;
      drawCard(col.x, y, col.w, CARD_H2, ENTRIES[i]);
    }
    ctx4.restore();
    if (maxScroll3 > 0) {
      const trackX = w - 8;
      const trackH = visibleH;
      ctx4.fillStyle = "rgba(255,255,255,0.05)";
      ctx4.fillRect(trackX, listTop, 3, trackH);
      const thumbH = Math.max(20, visibleH / totalH * trackH);
      const thumbY = listTop + scrollY3 / maxScroll3 * (trackH - thumbH);
      ctx4.fillStyle = "rgba(255,255,255,0.3)";
      ctx4.fillRect(trackX, thumbY, 3, thumbH);
    }
    const backW = layout.isNarrow ? 56 : 76;
    const backY = 24 + layout.safeTop;
    drawHitButton(
      col.right - backW,
      backY,
      backW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons12,
      cursorX12,
      cursorY12
    );
  }
  function drawCard(x, y, w, h, e) {
    const ctx4 = ctxRef();
    ctx4.save();
    roundRect(ctx4, x, y, w, h, 12);
    ctx4.fillStyle = "rgba(40,30,80,0.55)";
    ctx4.fill();
    ctx4.strokeStyle = "rgba(255,255,255,0.08)";
    ctx4.stroke();
    const side = 56;
    const bx = x + 14;
    const by = y + (h - side) / 2;
    roundRect(ctx4, bx, by, side, side, 12);
    ctx4.globalAlpha = 0.18;
    ctx4.fillStyle = e.ring;
    ctx4.fill();
    ctx4.globalAlpha = 0.55;
    ctx4.strokeStyle = e.ring;
    ctx4.stroke();
    ctx4.globalAlpha = 1;
    ctx4.font = `${Math.floor(side * 0.58)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx4.textAlign = "center";
    ctx4.textBaseline = "middle";
    ctx4.fillText(e.emoji, bx + side / 2, by + side / 2 + 1);
    const tx = bx + side + 14;
    const maxTextW = x + w - 14 - tx;
    ctx4.textAlign = "left";
    ctx4.fillStyle = "#fff";
    ctx4.font = "bold 16px sans-serif";
    fillTextEllipsized(ctx4, t(e.nameKey), tx, y + h * 0.26, maxTextW);
    ctx4.fillStyle = "rgba(255,255,255,0.75)";
    ctx4.font = "13px sans-serif";
    fillTextEllipsized(ctx4, t(e.descKey), tx, y + h * 0.52, maxTextW);
    ctx4.fillStyle = "rgba(255,255,255,0.45)";
    ctx4.font = "italic 12px sans-serif";
    fillTextEllipsized(ctx4, t(e.howKey), tx, y + h * 0.76, maxTextW);
    ctx4.restore();
  }
  function onPointer11(evt) {
    if (evt.type === "down") {
      for (let i = buttons12.length - 1; i >= 0; i--) {
        const b = buttons12[i];
        if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
          b.onClick();
          return;
        }
      }
      isPointerDown4 = true;
      didDragScroll3 = false;
      dragStartY3 = evt.y;
      dragStartScroll3 = scrollY3;
    } else if (evt.type === "up") {
      isPointerDown4 = false;
    } else if (evt.type === "cancel") {
      isPointerDown4 = false;
    }
  }
  function onMove12(x, y) {
    cursorX12 = x;
    cursorY12 = y;
    if (!isPointerDown4) return;
    const dy = y - dragStartY3;
    if (!didDragScroll3 && Math.abs(dy) > SCROLL_THRESHOLD3) didDragScroll3 = true;
    if (didDragScroll3) {
      scrollY3 = Math.max(0, Math.min(maxScroll3, dragStartScroll3 - dy));
    }
  }
  function onWheel4(dy) {
    scrollY3 = Math.max(0, Math.min(maxScroll3, scrollY3 + dy));
  }

  // src/scenes/dailyHistory.js
  var dailyHistory_exports = {};
  __export(dailyHistory_exports, {
    draw: () => draw19,
    enter: () => enter12,
    exit: () => exit12,
    onMove: () => onMove13,
    onPointer: () => onPointer12,
    update: () => update17
  });
  var WEEKS = 4;
  var DAYS = 7;
  var buttons13 = [];
  var cursorX13 = 0;
  var cursorY13 = 0;
  function enter12() {
    document.body.className = "daily-bg";
    buttons13 = [];
  }
  function exit12() {
    document.body.className = "";
  }
  function update17(dt) {
  }
  function draw19() {
    const { w, h } = getViewport();
    clearFrame();
    buttons13 = [];
    const s = load();
    const history2 = s.daily.history || {};
    const today = todayISO();
    const streak2 = dailyStreak(history2, today);
    const titleY = h * 0.07 + layout.safeTop;
    drawText(t("dailyHistory.title"), w / 2, titleY, {
      font: `bold ${responsiveFont(28)}px -apple-system, system-ui, sans-serif`,
      align: "center",
      shadow: true
    });
    const parts = [];
    if (streak2 >= 2) parts.push(t("daily.streak", { n: streak2 }));
    parts.push(t("dailyHistory.totalPlayed", { n: s.daily.totalDaysPlayed || 0 }));
    if (s.daily.bestEver > 0) parts.push(t("result.bestEver", { score: formatNumber(s.daily.bestEver) }));
    drawText(parts.join("   \xB7   "), w / 2, titleY + 34, {
      font: `${responsiveFont(14)}px sans-serif`,
      align: "center",
      color: "rgba(255,255,255,0.7)"
    });
    const days = lastNDays(history2, WEEKS * DAYS, today);
    const cell = layout.isNarrow ? 38 : 52;
    const gap = 8;
    const gridW = DAYS * (cell + gap) - gap;
    const gridH = WEEKS * (cell + gap) - gap;
    const ox = Math.floor((w - gridW) / 2);
    const oy = Math.max(titleY + 70, Math.floor((h - gridH) / 2));
    const ctx4 = ctxRef();
    if (days.every((d) => !d.entry)) {
      drawText(t("dailyHistory.empty"), w / 2, oy + gridH / 2, {
        font: "16px sans-serif",
        align: "center",
        color: "rgba(255,255,255,0.6)"
      });
    }
    for (let i = 0; i < days.length; i++) {
      const { iso, entry: entry2 } = days[i];
      const col = i % DAYS;
      const row = Math.floor(i / DAYS);
      const x = ox + col * (cell + gap);
      const y = oy + row * (cell + gap);
      const isToday = iso === today;
      ctx4.save();
      roundRect(ctx4, x, y, cell, cell, 8);
      ctx4.fillStyle = entry2 ? "rgba(124, 58, 237, 0.75)" : "rgba(255,255,255,0.06)";
      ctx4.fill();
      if (isToday) {
        ctx4.strokeStyle = "rgba(255,255,255,0.8)";
        ctx4.lineWidth = 2;
        ctx4.stroke();
      }
      ctx4.fillStyle = entry2 ? "#fff" : "rgba(255,255,255,0.4)";
      ctx4.textAlign = "center";
      ctx4.font = `bold ${Math.floor(cell * 0.3)}px sans-serif`;
      ctx4.textBaseline = "middle";
      ctx4.fillText(String(Number(iso.slice(8, 10))), x + cell / 2, y + cell * 0.35);
      if (entry2) {
        ctx4.font = `${Math.floor(cell * 0.22)}px sans-serif`;
        ctx4.fillStyle = "rgba(255,255,255,0.85)";
        ctx4.fillText(formatNumber(entry2.score), x + cell / 2, y + cell * 0.72);
      }
      ctx4.restore();
    }
    const colM = menuColumn();
    const backW = layout.isNarrow ? 56 : 76;
    drawHitButton(
      colM.right - backW,
      24 + layout.safeTop,
      backW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons13,
      cursorX13,
      cursorY13
    );
  }
  function onPointer12(evt) {
    if (evt.type !== "down") return;
    for (let i = buttons13.length - 1; i >= 0; i--) {
      const b = buttons13[i];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
        b.onClick();
        return;
      }
    }
  }
  function onMove13(x, y) {
    cursorX13 = x;
    cursorY13 = y;
  }

  // src/scenes/gallery.js
  var gallery_exports = {};
  __export(gallery_exports, {
    draw: () => draw20,
    enter: () => enter13,
    exit: () => exit13,
    onMove: () => onMove14,
    onPointer: () => onPointer13,
    update: () => update18
  });
  var buttons14 = [];
  var cursorX14 = 0;
  var cursorY14 = 0;
  var imgCache = /* @__PURE__ */ new Map();
  function imageFor(dataUrl) {
    let img = imgCache.get(dataUrl);
    if (!img) {
      img = new Image();
      img.src = dataUrl;
      imgCache.set(dataUrl, img);
    }
    return img;
  }
  function enter13() {
    document.body.className = "";
    buttons14 = [];
  }
  function exit13() {
  }
  function update18(dt) {
  }
  function draw20() {
    const { w, h } = getViewport();
    clearFrame();
    buttons14 = [];
    const titleY = h * 0.07 + layout.safeTop;
    drawText(t("gallery.title"), w / 2, titleY, {
      font: `bold ${responsiveFont(28)}px -apple-system, system-ui, sans-serif`,
      align: "center",
      shadow: true
    });
    const items = load().zen.gallery || [];
    const colM = menuColumn();
    if (items.length === 0) {
      drawText(t("gallery.empty"), w / 2, h * 0.45, {
        font: "16px sans-serif",
        align: "center",
        color: "rgba(255,255,255,0.6)"
      });
    } else {
      const cols = layout.isNarrow ? 2 : 3;
      const gap = 14;
      const tile = Math.floor((colM.w - (cols - 1) * gap) / cols);
      const ox = colM.x;
      const oy = titleY + 56;
      const ctx4 = ctxRef();
      for (let i = 0; i < items.length; i++) {
        const x = ox + i % cols * (tile + gap);
        const y = oy + Math.floor(i / cols) * (tile + 26 + gap);
        ctx4.save();
        roundRect(ctx4, x, y, tile, tile, 10);
        ctx4.fillStyle = "rgba(255,255,255,0.05)";
        ctx4.fill();
        ctx4.clip();
        const img = imageFor(items[i].dataUrl);
        if (img.complete && img.naturalWidth > 0) {
          ctx4.drawImage(img, x, y, tile, tile);
        }
        ctx4.restore();
        ctx4.save();
        ctx4.fillStyle = "rgba(255,255,255,0.55)";
        ctx4.font = "11px sans-serif";
        ctx4.textAlign = "center";
        ctx4.textBaseline = "top";
        ctx4.fillText(formatDate(items[i].at ? new Date(items[i].at) : /* @__PURE__ */ new Date()), x + tile / 2, y + tile + 6);
        ctx4.restore();
      }
    }
    const backW = layout.isNarrow ? 56 : 76;
    drawHitButton(
      colM.right - backW,
      24 + layout.safeTop,
      backW,
      32,
      layout.isNarrow ? t("common.backShort") : t("common.back"),
      () => setScene("title"),
      buttons14,
      cursorX14,
      cursorY14
    );
  }
  function onPointer13(evt) {
    if (evt.type !== "down") return;
    for (let i = buttons14.length - 1; i >= 0; i--) {
      const b = buttons14[i];
      if (evt.x >= b.x && evt.x <= b.x + b.w && evt.y >= b.y && evt.y <= b.y + b.h) {
        b.onClick();
        return;
      }
    }
  }
  function onMove14(x, y) {
    cursorX14 = x;
    cursorY14 = y;
  }

  // src/main.js
  var SCENES = {
    title: title_exports,
    levelSelect: levelSelect_exports,
    gameZen: gameZen_exports,
    gameClassic: gameClassic_exports,
    gameDaily: gameDaily_exports,
    gameBlitz: gameBlitz_exports,
    gamePuzzle: gamePuzzle_exports,
    puzzleSelect: puzzleSelect_exports,
    stats: stats_exports,
    result: result_exports,
    gempedia: gempedia_exports,
    dailyHistory: dailyHistory_exports,
    gallery: gallery_exports
  };
  var TRANSIENT_SOURCES = /* @__PURE__ */ new Set(["result"]);
  var current = null;
  var currentName = null;
  var currentArgs = {};
  var lastFrameTime = 0;
  var paused = false;
  var _handlingPopState = false;
  var _firstFrameDrawn = false;
  var _swRefreshing = false;
  var _swUpdateReady = false;
  var _swallowNextUp = false;
  var _dbg = false;
  var _hudCounters = { findMatches: 0, drawBoard: 0 };
  var _clockMs = 0;
  function clockMs() {
    return _clockMs;
  }
  var CROSSFADE_MS = 220;
  var sceneAlpha = 1;
  var crossfadeT = 0;
  function setScene(name, args2 = {}, opts = {}) {
    var _a;
    const replace = (_a = opts.replace) != null ? _a : args2 && args2.restoreFrom != null || currentName != null && TRANSIENT_SOURCES.has(currentName);
    _swapScene(name, args2);
    if (_handlingPopState) return;
    const state = { scene: name, args: serializeArgs(args2) };
    const url = `#${name}`;
    if (replace) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
  }
  function _swapScene(name, args2) {
    if (current && current.exit) current.exit();
    current = SCENES[name];
    currentName = name;
    if (!current) {
      console.warn("unknown scene:", name);
      current = SCENES.title;
      currentName = "title";
    }
    currentArgs = args2 || {};
    if (current.enter) current.enter(args2);
    announce(t(`sr.scene.${currentName}`));
    if (isPointerDown()) _swallowNextUp = true;
    sceneAlpha = 0;
    crossfadeT = 0;
    maybeReloadForServiceWorkerUpdate();
  }
  function announce(text) {
    const el = document.getElementById("sr-live");
    if (!el || !text) return;
    el.textContent = "";
    el.textContent = text;
  }
  function serializeArgs(args2) {
    if (!args2 || typeof args2 !== "object") return {};
    const out = {};
    for (const k of Object.keys(args2)) {
      if (k === "restoreFrom") continue;
      const v = args2[k];
      if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[k] = v;
      }
    }
    return out;
  }
  function frame(now) {
    if (paused) {
      lastFrameTime = now;
      requestAnimationFrame(frame);
      return;
    }
    let dt = now - lastFrameTime;
    if (dt > 50) dt = 50;
    if (dt < 0) dt = 0;
    lastFrameTime = now;
    _clockMs += dt;
    if (_dbg) {
      _hudCounters.findMatches = counters.findMatches;
      _hudCounters.drawBoard = counters.drawBoard;
      resetFrameCounters();
      recordFrame(dt);
    }
    if (current) {
      if (current.update) current.update(dt);
      if (current.draw) current.draw();
    }
    if (crossfadeT < CROSSFADE_MS) {
      crossfadeT = Math.min(CROSSFADE_MS, crossfadeT + dt);
      sceneAlpha = crossfadeT / CROSSFADE_MS;
      const ctx4 = ctxRef();
      const { w, h } = getViewport();
      if (ctx4) {
        ctx4.fillStyle = `rgba(0, 0, 0, ${1 - sceneAlpha})`;
        ctx4.fillRect(0, 0, w, h);
      }
    }
    update5(dt);
    draw5();
    draw6();
    if (_dbg) drawDebugHud();
    if (!_firstFrameDrawn) {
      _firstFrameDrawn = true;
      const splash = document.getElementById("boot-splash");
      if (splash) {
        splash.classList.add("fade-out");
        setTimeout(() => splash.remove(), 200);
      }
    }
    requestAnimationFrame(frame);
  }
  function drawDebugHud() {
    const ctx4 = ctxRef();
    if (!ctx4) return;
    const { fps, p95 } = frameStats();
    const ac = activeCascade();
    const animsSize = ac ? ac.anims.size : "\u2014";
    const lines = [
      `${fps.toFixed(1)} fps`,
      `${p95.toFixed(1)}ms p95`,
      `anims: ${animsSize}`,
      `findMatches/f: ${_hudCounters.findMatches}`,
      `drawBoard/f: ${_hudCounters.drawBoard}`
    ];
    ctx4.save();
    ctx4.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx4.textAlign = "left";
    ctx4.textBaseline = "top";
    const x = 8, y = 8, pad2 = 6, lh = 14;
    let w = 0;
    for (const s of lines) w = Math.max(w, ctx4.measureText(s).width);
    ctx4.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx4.fillRect(x, y, w + pad2 * 2, lines.length * lh + pad2 * 2);
    ctx4.fillStyle = "#9affc8";
    for (let i = 0; i < lines.length; i++) {
      ctx4.fillText(lines[i], x + pad2, y + pad2 + i * lh);
    }
    ctx4.restore();
  }
  function setupVisibility() {
    document.addEventListener("visibilitychange", () => {
      paused = document.hidden;
      if (!paused) {
        lastFrameTime = performance.now();
        return;
      }
      try {
        flushPlayTime();
        flush();
      } catch {
      }
    });
  }
  function setupHistoryNav() {
    window.addEventListener("popstate", (e) => {
      if (consumeBack()) {
        if (e.state && e.state.scene) {
          history.pushState(
            { scene: currentName, args: serializeArgs(currentArgs) },
            "",
            `#${currentName}`
          );
        }
        return;
      }
      const s = e.state;
      _handlingPopState = true;
      try {
        if (s && s.scene && SCENES[s.scene]) {
          _swapScene(s.scene, withParkedRun(s.scene, s.args || {}));
        } else {
          _swapScene("title", {});
          history.replaceState({ scene: "title", args: {} }, "", "#title");
        }
      } finally {
        _handlingPopState = false;
      }
    });
  }
  var PARKED_RUN_SCENES = { gameZen: "zen", gameClassic: "classic" };
  function withParkedRun(name, args2) {
    const mode = PARKED_RUN_SCENES[name];
    if (!mode) return args2;
    const saveState = load()[mode].saveState;
    return saveState ? { ...args2, restoreFrom: saveState } : args2;
  }
  function setupInput() {
    setup();
    on({
      onTapCell: (cell, x, y) => {
        unlock();
        if (handlePointer({ type: "down", cell, x, y })) return;
        if (current && current.onPointer) current.onPointer({ type: "down", cell, x, y });
      },
      onMove: (x, y) => {
        if (isOpen()) {
          onMove(x, y);
          return;
        }
        if (current && current.onMove) current.onMove(x, y);
      },
      onUp: (x, y) => {
        unlock();
        if (_swallowNextUp) {
          _swallowNextUp = false;
          return;
        }
        if (handlePointer({ type: "up", x, y })) return;
        if (current && current.onPointer) current.onPointer({ type: "up", x, y });
      },
      onCancel: (x, y) => {
        if (_swallowNextUp) _swallowNextUp = false;
        if (handlePointer({ type: "cancel", x, y })) return;
        if (current && current.onPointer) current.onPointer({ type: "cancel", x, y });
      },
      onWheel: (dy, x, y) => {
        if (isOpen()) return;
        if (current && current.onWheel) current.onWheel(dy, x, y);
      }
    });
  }
  function isSafeToReload() {
    return currentName === "title" || currentName === "levelSelect" || currentName === "puzzleSelect" || currentName === "stats";
  }
  function maybeReloadForServiceWorkerUpdate() {
    if (!_swUpdateReady || _swRefreshing || !isSafeToReload()) return;
    _swRefreshing = true;
    window.location.reload();
  }
  function init3() {
    setupCanvas();
    setGemStyle(getSettings().gemStyle);
    buildAtlas();
    setupInput();
    setupVisibility();
    setupHistoryNav();
    load();
    init();
    setEnabled(getSettings().sound !== false);
    const BOOT_SCENES = /* @__PURE__ */ new Set([
      "title",
      "levelSelect",
      "puzzleSelect",
      "stats",
      "gempedia",
      "dailyHistory",
      "gallery",
      "gameZen",
      "gameClassic",
      "gameDaily",
      "gameBlitz"
    ]);
    const bootHash = (location.hash || "").replace(/^#/, "");
    const bootScene = BOOT_SCENES.has(bootHash) ? bootHash : "title";
    setScene(bootScene, withParkedRun(bootScene, {}), { replace: true });
    window.addEventListener("pagehide", () => {
      try {
        flushPlayTime();
        flush();
      } catch {
      }
    });
    lastFrameTime = performance.now();
    requestAnimationFrame(frame);
    const dbg = location.hostname === "localhost" || location.hostname === "127.0.0.1" || new URLSearchParams(location.search).get("debug") === "1";
    _dbg = dbg;
    setEnabled3(dbg);
    if (dbg) window.__game = {
      storage: storage_exports,
      setScene,
      clockMs,
      setLanguage,
      getLocale,
      isSwUpdateReady: () => _swUpdateReady
    };
  }
  function boot() {
    try {
      init3();
    } catch (err) {
      console.error("boot failed:", err);
      const splash = document.getElementById("boot-splash");
      if (!splash) return;
      const dots = splash.querySelector(".boot-dots");
      if (dots) dots.remove();
      const msg = document.createElement("div");
      msg.className = "boot-error";
      msg.textContent = "This browser is too old to run Jeweled \u2014 please update it. / Este navegador es demasiado antiguo para Jeweled \u2014 actual\xEDzalo.";
      splash.appendChild(msg);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
