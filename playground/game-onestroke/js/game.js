// 游戏核心:渲染 + 触摸/鼠标交互 + 胜负判定 + 进度记录 + 通关反馈
(function () {
  'use strict';
  var OS = (window.OS = window.OS || {});
  var STORAGE_KEY = 'one_stroke_progress';

  var state = {
    levelIndex: 0,
    level: null,      // { size, cells, start, solution }
    cellSet: null,    // Set<"r_c"> 可走格子
    path: [],         // 玩家当前路径 [{r,c}]
    visited: null,    // Set<"r_c"> 已访问
    drawing: false,
    won: false,
    mode: 'normal',   // 'normal' 闯关 | 'timed' 计时挑战
    round: 0,         // 计时挑战回合数
    timeLeft: 0
  };
  var startOpen = true, failOpen = false;

  var canvas, ctx, cssSize = 0, cellPx = 0;

  function loadProgress() {
    try {
      var v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      return isNaN(v) ? 0 : Math.max(0, v);
    } catch (e) { return 0; }
  }
  function saveProgress(index) {
    try { localStorage.setItem(STORAGE_KEY, String(index)); } catch (e) {}
  }

  function startLevel(index) {
    state.levelIndex = index;
    state.level = OS.generateLevel(index < 0 ? roundConfig(state.round) : OS.configForLevel(index));
    if (index < 0) { state.timeLeft = roundTime(state.round); paintTimer(); }
    state.cellSet = new Set(state.level.cells.map(function (c) { return c.r + '_' + c.c; }));
    state.path = [];
    state.visited = new Set();
    state.won = false;
    hideOverlay();
    resize();
    render();
    updateHud();
  }

  function updateHud() {
    if (state.levelIndex < 0) {
      document.getElementById('level-label').textContent = '第 ' + (state.round + 1) + ' 回合';
      document.getElementById('timer-chip').style.display = '';
      paintTimer();
      return;
    }
    document.getElementById('level-input').value = state.levelIndex + 1;
    document.getElementById('level-label').textContent = OS.configForLevel(state.levelIndex).label || '';
  }

  function resize() {
    var wrap = canvas.parentElement;
    var w = wrap.clientWidth;
    cssSize = Math.max(220, Math.min(w, window.innerHeight - 200));
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssSize + 'px';
    canvas.style.height = cssSize + 'px';
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cellPx = cssSize / state.level.size;
  }

  // 圆角矩形路径(用于格子底色,营造凹槽质感)
  function roundRect(x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // 手绘风圆点:边缘带抖动的蜡笔圆斑 + 铅笔描边(seed 让每格抖动固定,不闪)
  function drawDot(x, y, radius, color, glow, seed) {
    seed = seed || 0;
    ctx.save();
    if (glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = radius * (0.5 + glow);
    }
    ctx.beginPath();
    for (var a = 0; a <= Math.PI * 2 + 0.001; a += Math.PI / 8) {
      var rr = Math.max(1, radius * (1 + 0.1 * Math.sin(a * 3 + seed)));
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,66,56,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    var size = state.level.size;
    var now = performance.now();

    // 1) 背景:奶白纵向渐变
    var bg = ctx.createLinearGradient(0, 0, 0, cssSize);
    bg.addColorStop(0, '#fffcf4');
    bg.addColorStop(1, '#f1e8d3');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssSize, cssSize);

    // 2) 格子底色:可走格(凹槽渐变,走过染淡绿)vs 不可走格(更暗凹陷)
    var crad = Math.max(5, cellPx * 0.2);
    var pad = Math.max(3, cellPx * 0.08);
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var x = c * cellPx, y = r * cellPx;
        if (state.cellSet.has(r + '_' + c)) {
          ctx.fillStyle = state.visited.has(r + '_' + c) ? '#dcf0de' : '#fffdf7';
        } else {
          ctx.fillStyle = '#ece2cc';
        }
        roundRect(x + pad, y + pad, cellPx - pad * 2, cellPx - pad * 2, crad);
        ctx.fill();
        // 铅笔稿双线描边:同一格抖两次线,抖动由行列决定所以稳定
        for (var si = 0; si < 2; si++) {
          var j1 = Math.sin(r * 31 + c * 17 + si * 7) * 1.4;
          var j2 = Math.sin(r * 13 + c * 29 + si * 5) * 1.4;
          roundRect(x + pad + j1, y + pad + j2, cellPx - pad * 2 - j1, cellPx - pad * 2 - j2, crad + j1);
          ctx.strokeStyle = 'rgba(90,80,64,' + (si ? 0.12 : 0.25) + ')';
          ctx.lineWidth = si ? 0.8 : 1.2;
          ctx.stroke();
        }
      }
    }

    // 3) 玩家路径连线:蜡笔笔触(深色毛边底 + 主色 + 断续白芯)
    if (state.path.length > 1) {
      var lw = Math.max(4, cellPx * 0.16);
      var drawPath = function () {
        ctx.beginPath();
        for (var i = 0; i < state.path.length; i++) {
          var p = state.path[i];
          var cx = (p.c + 0.5) * cellPx, cy = (p.r + 0.5) * cellPx;
          if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      };
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(46,139,84,0.3)';
      ctx.lineWidth = lw + 5;
      drawPath();
      ctx.strokeStyle = '#3fae6a';
      ctx.lineWidth = lw;
      drawPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = Math.max(1.5, lw * 0.32);
      if (ctx.setLineDash) ctx.setLineDash([lw * 1.3, lw * 0.9]);
      drawPath();
      ctx.restore();
    }

    // 4) 亮点:已访问(绿,强发光)/ 未访问(白,弱发光 + 呼吸脉冲)
    var cells = state.level.cells;
    var pulse = 1 + 0.12 * Math.sin(now / 480); // 0.88~1.12
    for (var k = 0; k < cells.length; k++) {
      var cc = cells[k];
      var dx = (cc.c + 0.5) * cellPx, dy = (cc.r + 0.5) * cellPx;
      var base = cellPx * 0.15;
      if (state.visited.has(cc.r + '_' + cc.c)) {
        drawDot(dx, dy, base, '#3fae6a', 0.5, cc.r * 13 + cc.c * 7);
      } else {
        drawDot(dx, dy, base * 0.85 * pulse, '#d9cbaa', 0, cc.r * 13 + cc.c * 7);
      }
    }

    // 5) 方向限制格:紫色发光横线/竖线
    var cons = state.level.constraints;
    if (cons) {
      ctx.save();
      ctx.lineCap = 'round';
      var ckeys = Object.keys(cons);
      for (var ci = 0; ci < ckeys.length; ci++) {
        var parts = ckeys[ci].split('_');
        var cr = +parts[0], col = +parts[1];
        var px = (col + 0.5) * cellPx, py = (cr + 0.5) * cellPx;
        var arm = cellPx * 0.28;
        for (var cj = 0; cj < 2; cj++) {
          var cjx = Math.sin(ci * 7 + cj * 3) * 1.4, cjy = Math.cos(ci * 5 + cj * 4) * 1.4;
          ctx.strokeStyle = 'rgba(139,111,216,' + (cj ? 0.3 : 0.65) + ')';
          ctx.lineWidth = Math.max(2.5, cellPx * 0.1) + cj * 0.8;
          ctx.beginPath();
          if (cons[ckeys[ci]] === 'H') { ctx.moveTo(px - arm + cjx, py + cjy); ctx.lineTo(px + arm + cjx, py + cjy); }
          else { ctx.moveTo(px + cjx, py - arm + cjy); ctx.lineTo(px + cjx, py + arm + cjy); }
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 6) 提示高亮:黄色脉冲圈
    if (hintCells.length) {
      var hp = 1 + 0.1 * Math.sin(now / 200);
      ctx.save();
      ctx.lineWidth = Math.max(2, cellPx * 0.06);
      for (var hi = 0; hi < hintCells.length; hi++) {
        var hc = hintCells[hi];
        for (var hj = 0; hj < 2; hj++) {
          var hjx = Math.sin(now / 200 + hi * 3 + hj * 2) * 1.3, hjy = Math.cos(now / 200 + hi * 2 + hj) * 1.3;
          ctx.strokeStyle = 'rgba(233,161,59,' + (hj ? 0.3 : 0.8) + ')';
          ctx.beginPath();
          ctx.arc((hc.c + 0.5) * cellPx + hjx, (hc.r + 0.5) * cellPx + hjy, cellPx * (0.36 + hj * 0.04) * hp, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 7) 起点标记:橙色脉冲发光圈
    var st = state.level.start;
    if (st) {
      var sp = 1 + 0.08 * Math.sin(now / 350);
      ctx.save();
      ctx.lineWidth = 2;
      for (var sj = 0; sj < 2; sj++) {
        var sjx = Math.sin(now / 350 + sj * 2.1) * 1.4, sjy = Math.cos(now / 350 + sj * 1.7) * 1.4;
        ctx.strokeStyle = 'rgba(232,130,30,' + (sj ? 0.35 : 0.8) + ')';
        ctx.beginPath();
        ctx.arc((st.c + 0.5) * cellPx + sjx, (st.r + 0.5) * cellPx + sjy, cellPx * (0.3 + sj * 0.05) * sp, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 8) 通关闪光:金色脉冲覆盖
    if (state.won) {
      var flash = 0.18 + 0.12 * Math.sin(now / 200);
      ctx.fillStyle = 'rgba(233,161,59,' + flash.toFixed(3) + ')';
      ctx.fillRect(0, 0, cssSize, cssSize);
    }
  }

  // 常驻动画循环:驱动脉冲与闪光(页面不可见时浏览器自动暂停)
  var rafId = null;
  var lastTick = 0;
  function loop(now) {
    if (now && lastTick) tickTimer((now - lastTick) / 1000);
    lastTick = now || 0;
    render();
    rafId = requestAnimationFrame(loop);
  }

  // 计时挑战:每回合限时,随回合数递减
  function roundTime(r) { return Math.max(20, 45 - r * 2); }
  function roundConfig(r) {
    var size = Math.min(7, 4 + Math.floor(r / 3));
    var cfg = {
      size: size,
      removeCount: Math.min(Math.floor(size * size * 0.18), 1 + Math.floor(r / 2)),
      edgeOnly: r % 3 === 2,
      fixedStart: r >= 3,
      label: '回合 ' + (r + 1)
    };
    if (r >= 6) cfg.constraintCount = Math.min(8, r - 5);
    return cfg;
  }
  function paintTimer() {
    var chip = document.getElementById('timer-chip');
    if (!chip) return;
    var t = Math.max(0, Math.ceil(state.timeLeft));
    chip.textContent = '⏱ ' + t;
    chip.className = 'label' + (t <= 10 ? ' low' : '');
  }
  function tickTimer(dt) {
    if (state.mode !== 'timed' || state.won || startOpen || failOpen || state.timeLeft <= 0) return;
    state.timeLeft -= dt;
    paintTimer();
    if (state.timeLeft <= 0) onTimeout();
  }
  function onTimeout() {
    OS.SFX.error();
    var best = loadBest();
    if (state.round > best) { best = state.round; saveBest(best); }
    var fs = document.getElementById('fail-sub');
    if (fs) fs.textContent = '回合 ' + (state.round + 1) + ' 连了 ' + state.path.length + '/' + state.level.cells.length + ' 个点 · 最佳 ' + best + ' 回合';
    failOpen = true;
    document.getElementById('fail-ov').classList.add('show');
  }
  function loadBest() {
    try { var v = parseInt(localStorage.getItem('ones-timed-best'), 10); return isNaN(v) ? 0 : v; } catch (e) { return 0; }
  }
  function saveBest(n) { try { localStorage.setItem('ones-timed-best', String(n)); } catch (e) {} }
  function startTimed() {
    state.mode = 'timed';
    state.round = 0;
    document.body.classList.add('timed');
    startLevel(-1);
  }
  function exitTimed() {
    state.mode = 'normal';
    failOpen = false;
    document.getElementById('fail-ov').classList.remove('show');
    document.body.classList.remove('timed');
    document.getElementById('timer-chip').style.display = 'none';
    startLevel(loadProgress());
    startOpen = true;
    document.getElementById('start-ov').classList.add('show');
  }

  function pointerToCell(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var c = Math.floor(x / cellPx);
    var r = Math.floor(y / cellPx);
    if (r < 0 || c < 0 || r >= state.level.size || c >= state.level.size) return null;
    return { r: r, c: c };
  }

  function isOrthoNeighbor(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  // 返回 cell 在当前路径中的下标,不在则返回 -1
  function indexOfPath(cell) {
    for (var i = 0; i < state.path.length; i++) {
      if (state.path[i].r === cell.r && state.path[i].c === cell.c) return i;
    }
    return -1;
  }

  // 两正交相邻格之间的连线方向:H 水平(同行)/ V 垂直(同列)
  function dirBetween(a, b) {
    return (a.r === b.r) ? 'H' : 'V';
  }

  // 假设把 newCell 接到路径末尾,是否会让某方向限制格违规
  // (原末尾将变中间格 → 查它的约束;新格的进入方向 → 查它的约束)
  function wouldViolate(newCell) {
    var cons = state.level.constraints;
    if (!cons) return false;
    var path = state.path;
    var last = path[path.length - 1];
    if (path.length >= 2) {
      var prev = path[path.length - 2];
      var lc = cons[last.r + '_' + last.c];
      if (lc && (dirBetween(prev, last) !== lc || dirBetween(last, newCell) !== lc)) return true;
    }
    var nc = cons[newCell.r + '_' + newCell.c];
    if (nc && dirBetween(last, newCell) !== nc) return true;
    return false;
  }

  // 校验当前路径满足所有方向约束(通关判定兜底)
  function constraintsSatisfied() {
    var cons = state.level.constraints;
    if (!cons) return true;
    var pos = {};
    for (var i = 0; i < state.path.length; i++) pos[state.path[i].r + '_' + state.path[i].c] = i;
    var keys = Object.keys(cons);
    for (var k = 0; k < keys.length; k++) {
      var idx = pos[keys[k]];
      if (idx == null) return false;
      var p = state.path[idx];
      if (idx > 0 && dirBetween(state.path[idx - 1], p) !== cons[keys[k]]) return false;
      if (idx < state.path.length - 1 && dirBetween(p, state.path[idx + 1]) !== cons[keys[k]]) return false;
    }
    return true;
  }

  function onDown(e) {
    if (state.won) return;
    e.preventDefault();
    OS.SFX.resume();
    var cell = pointerToCell(e);
    if (!cell || !state.cellSet.has(cell.r + '_' + cell.c)) return;

    // 点的是路径中某个已走过的点 → 截断到那里
    // (松开后也能回退,且可从该点直接继续拖动延伸,不必一直按住)
    var idx = indexOfPath(cell);
    if (idx >= 0) {
      if (idx < state.path.length - 1) OS.SFX.undo();
      while (state.path.length > idx + 1) {
        var removed = state.path.pop();
        state.visited.delete(removed.r + '_' + removed.c);
      }
      state.drawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      render();
      return;
    }

    // 否则开始/重置:固定起点关卡必须从起点起手
    if (state.level.start && (cell.r !== state.level.start.r || cell.c !== state.level.start.c)) return;
    state.drawing = true;
    state.path = [cell];
    state.visited = new Set([cell.r + '_' + cell.c]);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    render();
  }

  function onMove(e) {
    if (!state.drawing || state.won) return;
    e.preventDefault();
    var cell = pointerToCell(e);
    if (!cell || !state.cellSet.has(cell.r + '_' + cell.c)) return;
    var last = state.path[state.path.length - 1];
    if (cell.r === last.r && cell.c === last.c) return;
    // 回退:拖回了路径中任意一个已访问的点 → 截断到那里(支持快速原路返回,不跳格)
    var idx = indexOfPath(cell);
    if (idx >= 0) {
      if (idx < state.path.length - 1) OS.SFX.undo();
      while (state.path.length > idx + 1) {
        var removed = state.path.pop();
        state.visited.delete(removed.r + '_' + removed.c);
      }
      render();
      return;
    }
    // 前进:正交邻居、未访问、且不违背方向限制格
    var k = cell.r + '_' + cell.c;
    if (isOrthoNeighbor(last, cell) && !state.visited.has(k)) {
      if (wouldViolate(cell)) { OS.SFX.error(); return; }
      state.path.push(cell);
      state.visited.add(k);
      OS.SFX.place();
      render();
      checkWin();
    }
  }

  function onUp(e) {
    if (!state.drawing) return;
    state.drawing = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    checkWin();
  }

  function checkWin() {
    if (state.won) return;
    if (state.path.length === state.level.cells.length && constraintsSatisfied()) {
      state.won = true;
      OS.SFX.win();
      if (state.levelIndex < 0) {
        var best = loadBest();
        if (state.round + 1 > best) saveBest(state.round + 1);
      } else {
        saveProgress(Math.max(loadProgress(), state.levelIndex + 1));
      }
      showOverlay();
    }
  }

  function showOverlay() {
    var ws = document.getElementById('win-sub');
    if (ws) ws.textContent = state.levelIndex < 0
      ? '回合 ' + (state.round + 1) + ' 完成 · 还剩 ' + Math.ceil(state.timeLeft) + ' 秒'
      : '第 ' + (state.levelIndex + 1) + ' 关 · 一步连完 ' + state.path.length + ' 个点';
    document.getElementById('overlay').classList.add('show');
  }
  function hideOverlay() { document.getElementById('overlay').classList.remove('show'); }

  function nextLevel() { startLevel(state.levelIndex + 1); }
  function prevLevel() { if (state.levelIndex > 0) startLevel(state.levelIndex - 1); }
  function gotoLevel(n) {
    if (!isNaN(n) && n >= 1) startLevel(n - 1);
    else updateHud(); // 非法输入,恢复显示
  }

  var hintCells = [];
  var hintTimer = null;
  var soundOn = true;

  function updateSoundIcon() {
    var b = document.getElementById('sound-btn');
    if (b) b.textContent = soundOn ? '🔊' : '🔇';
  }
  function initSound() {
    try {
      var v = localStorage.getItem('os_sound');
      soundOn = (v === null) ? true : (v === '1');
    } catch (e) { soundOn = true; }
    OS.SFX.setEnabled(soundOn);
    updateSoundIcon();
  }
  function toggleSound() {
    soundOn = !soundOn;
    OS.SFX.setEnabled(soundOn);
    try { localStorage.setItem('os_sound', soundOn ? '1' : '0'); } catch (e) {}
    updateSoundIcon();
    if (soundOn) OS.SFX.resume();
  }
  function showHint() {
    if (state.won || state.path.length === 0) return;
    var last = state.path[state.path.length - 1];
    var cand = [[last.r - 1, last.c], [last.r + 1, last.c], [last.r, last.c - 1], [last.r, last.c + 1]];
    hintCells = [];
    for (var i = 0; i < cand.length; i++) {
      var nr = cand[i][0], nc = cand[i][1];
      var kk = nr + '_' + nc;
      if (state.cellSet.has(kk) && !state.visited.has(kk) && !wouldViolate({ r: nr, c: nc })) {
        hintCells.push({ r: nr, c: nc });
      }
    }
    render();
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintCells = []; render(); }, 1200);
  }
  function resetLevel() {
    state.path = [];
    state.visited = new Set();
    state.won = false;
    if (state.levelIndex < 0) { state.timeLeft = roundTime(state.round); paintTimer(); }
    hideOverlay();
    render();
  }

  OS.Game = {
    init: function () {
      canvas = document.getElementById('board');
      ctx = canvas.getContext('2d');
      canvas.style.touchAction = 'none';
      initSound();
      state.levelIndex = loadProgress();
      startLevel(state.levelIndex);

      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('resize', function () { resize(); render(); });

      document.getElementById('reset-btn').addEventListener('click', resetLevel);
      document.getElementById('prev-btn').addEventListener('click', prevLevel);
      document.getElementById('next-btn').addEventListener('click', nextLevel);
      document.getElementById('overlay-next').addEventListener('click', function () {
        if (state.levelIndex < 0) { state.round++; startLevel(-1); } else nextLevel();
      });
      document.getElementById('overlay-replay').addEventListener('click', resetLevel);
      document.getElementById('hint-btn').addEventListener('click', showHint);
      document.getElementById('sound-btn').addEventListener('click', function () { toggleSound(); paintStartSound(); });

      // 开始页
      var startOv = document.getElementById('start-ov');
      var startSound = document.getElementById('start-sound');
      function paintStartSound() { if (startSound) startSound.textContent = soundOn ? '🔊 音效 · 开' : '🔇 音效 · 关'; }
      paintStartSound();
      var startBtn = document.getElementById('start-btn');
      if (state.levelIndex > 0) startBtn.textContent = '▶ 继续 · 第 ' + (state.levelIndex + 1) + ' 关';
      startBtn.addEventListener('click', function () {
        OS.SFX.resume();
        OS.SFX.place();
        startOpen = false;
        startOv.classList.remove('show');
      });
      // 难度自选:从对应档位开局
      var diffs = document.querySelectorAll('.diff');
      for (var di = 0; di < diffs.length; di++) {
        (function (b) {
          b.addEventListener('click', function () {
            OS.SFX.resume(); OS.SFX.place();
            state.mode = 'normal';
            startLevel(parseInt(b.getAttribute('data-idx'), 10));
            startOpen = false;
            startOv.classList.remove('show');
          });
        })(diffs[di]);
      }
      document.getElementById('start-timed').addEventListener('click', function () {
        OS.SFX.resume(); OS.SFX.place();
        startTimed();
        startOpen = false;
        startOv.classList.remove('show');
      });
      document.getElementById('fail-retry').addEventListener('click', function () {
        OS.SFX.place();
        failOpen = false;
        document.getElementById('fail-ov').classList.remove('show');
        startLevel(-1);
      });
      document.getElementById('fail-home').addEventListener('click', function () { OS.SFX.place(); exitTimed(); });
      startSound.addEventListener('click', function () { toggleSound(); paintStartSound(); });

      // 封面切换（与合集首页卡片联动）
      var COVERS = ['cat', 'grid1', 'grid2', 'paper'];
      var COVER_NAMES = { cat: '蜡笔猫', grid1: '彩点连线', grid2: '彩点连线·二', paper: '纸上小屋' };
      var COVER_FILES = {
        cat: '../../icons/onestroke.png',
        grid1: '../../icons/onestroke-grid1.png',
        grid2: '../../icons/onestroke-grid2.png',
        paper: '../../icons/onestroke-paper.png'
      };
      var coverKey = 'cat';
      try { coverKey = localStorage.getItem('ones-cover') || 'cat'; } catch (e) {}
      if (COVERS.indexOf(coverKey) < 0) coverKey = 'cat';
      function paintCoverBtn() {
        var img = document.getElementById('start-cover-img');
        var txt = document.getElementById('start-cover-txt');
        if (img) img.src = COVER_FILES[coverKey];
        if (txt) txt.textContent = '封面 · ' + COVER_NAMES[coverKey];
      }
      paintCoverBtn();
      document.getElementById('start-cover').addEventListener('click', function () {
        coverKey = COVERS[(COVERS.indexOf(coverKey) + 1) % COVERS.length];
        try { localStorage.setItem('ones-cover', coverKey); } catch (e) {}
        paintCoverBtn();
        OS.SFX.place();
      });
      var levelInput = document.getElementById('level-input');
      levelInput.addEventListener('change', function () {
        gotoLevel(parseInt(levelInput.value, 10));
      });

      rafId = requestAnimationFrame(loop); // 启动常驻渲染循环
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', OS.Game.init);
  } else {
    OS.Game.init();
  }
})();
