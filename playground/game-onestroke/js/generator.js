// 关卡生成器 —— 反向生成法
// 核心思想:先在"可走格子集合"上构造一条合法的哈密顿路径(保证该关一定有解),
// 再把路径藏起来,只留下可走格子(亮点)让玩家去解。
// 「障碍格」「不规则棋盘」「固定起点」共用同一套"可走格子集合"机制:
//   - 障碍格   = 中间某些格子被移除(不可走)
//   - 不规则棋盘 = 边缘某些格子被移除(棋盘缺角/异形)
//   两者在数据上完全等价,只是一个挖在中间、一个挖在边缘。
(function () {
  'use strict';
  var OS = (window.OS = window.OS || {});

  function key(r, c) { return r + '_' + c; }

  // 可种子的伪随机数生成器(mulberry32);不传 seed 则随机取种
  function makeRng(seed) {
    var s = (seed == null ? Math.floor(Math.random() * 1e9) : seed) >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // 完整 N×N 网格
  function fullGrid(n) {
    var cells = [];
    for (var r = 0; r < n; r++)
      for (var c = 0; c < n; c++) cells.push({ r: r, c: c });
    return cells;
  }

  // 返回 (r,c) 在 set 中存在的正交邻居
  function neighbors(r, c, set) {
    var out = [];
    var cand = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (var i = 0; i < cand.length; i++) {
      var nr = cand[i][0], nc = cand[i][1];
      if (set.has(key(nr, nc))) out.push({ r: nr, c: nc });
    }
    return out;
  }

  // 判断格子集合是否连通(BFS)
  function isConnected(cells) {
    if (cells.length === 0) return false;
    var set = new Set();
    for (var i = 0; i < cells.length; i++) set.add(key(cells[i].r, cells[i].c));
    var visited = new Set();
    var stack = [cells[0]];
    visited.add(key(cells[0].r, cells[0].c));
    while (stack.length) {
      var cur = stack.pop();
      var nbs = neighbors(cur.r, cur.c, set);
      for (var j = 0; j < nbs.length; j++) {
        var k = key(nbs[j].r, nbs[j].c);
        if (!visited.has(k)) { visited.add(k); stack.push(nbs[j]); }
      }
    }
    return visited.size === cells.length;
  }

  // 从 N×N 网格随机移除若干格子,保持剩余连通。
  // edgeOnly=true 只挖边缘(造不规则棋盘);false 允许挖中间(造障碍洞)。
  function carveRegion(n, count, edgeOnly, rng) {
    var cells = fullGrid(n);
    var isEdge = function (r, c) {
      return r === 0 || c === 0 || r === n - 1 || c === n - 1;
    };
    var candidates = cells.filter(function (cell) {
      return edgeOnly ? isEdge(cell.r, cell.c) : true;
    });
    var order = shuffle(candidates, rng);
    var cur = new Set();
    for (var i = 0; i < cells.length; i++) cur.add(key(cells[i].r, cells[i].c));
    var removed = 0;
    for (var k = 0; k < order.length && removed < count; k++) {
      var cell = order[k];
      var ck = key(cell.r, cell.c);
      cur.delete(ck);
      var remaining = cells.filter(function (c) { return cur.has(key(c.r, c.c)); });
      if (isConnected(remaining)) {
        removed++;
      } else {
        cur.add(ck); // 移除后不连通,放回去
      }
    }
    return cells.filter(function (c) { return cur.has(key(c.r, c.c)); });
  }

  // 在 cells 集合上求一条哈密顿路径(经过所有格子,正交相邻,不重复)。
  // Warnsdorff 贪心(优先走"出路少"的格子)+ 多次随机重试,近乎瞬间完成。
  function findHamiltonianPath(cells, rng, retries) {
    var set = new Set();
    for (var i = 0; i < cells.length; i++) set.add(key(cells[i].r, cells[i].c));
    var total = cells.length;
    var maxRetry = retries || 60;

    for (var s = 0; s < maxRetry; s++) {
      var start = cells[Math.floor(rng() * cells.length)];
      var visited = new Set();
      visited.add(key(start.r, start.c));
      var path = [start];
      if (greedy(path, visited)) return path;
    }
    return null;

    function greedy(path, visited) {
      while (path.length < total) {
        var cur = path[path.length - 1];
        var nbs = neighbors(cur.r, cur.c, set);
        var cands = [];
        for (var i = 0; i < nbs.length; i++) {
          var n = nbs[i];
          if (visited.has(key(n.r, n.c))) continue;
          var deg = 0;
          var nn = neighbors(n.r, n.c, set);
          for (var j = 0; j < nn.length; j++) {
            if (!visited.has(key(nn[j].r, nn[j].c))) deg++;
          }
          cands.push({ n: n, d: deg });
        }
        if (cands.length === 0) return false; // 走死,本次贪心失败,外层换起点重试
        cands.sort(function (a, b) { return a.d - b.d; });
        var minD = cands[0].d;
        var ties = [];
        for (var t = 0; t < cands.length && cands[t].d === minD; t++) ties.push(cands[t]);
        var pick = ties[Math.floor(rng() * ties.length)].n;
        visited.add(key(pick.r, pick.c));
        path.push(pick);
      }
      return true;
    }
  }

  function copyCell(c) { return { r: c.r, c: c.c }; }

  // 从解反推方向约束:挑若干"直行经过"的中间格子,赋予其经过方向(H/V)。
  // 只选直行格(前后两段同向),保证解自身满足约束 → 关卡一定有解。
  function buildConstraints(solution, count, rng) {
    if (!count || count <= 0 || solution.length < 3) return null;
    var straight = [];
    for (var i = 1; i < solution.length - 1; i++) {
      var g = solution[i], pre = solution[i - 1], nxt = solution[i + 1];
      var din = (pre.r === g.r) ? 'H' : 'V';
      var dout = (g.r === nxt.r) ? 'H' : 'V';
      if (din === dout) straight.push({ idx: i, dir: din });
    }
    if (straight.length === 0) return null;
    var picked = shuffle(straight, rng).slice(0, Math.min(count, straight.length));
    var cons = {};
    for (var k = 0; k < picked.length; k++) {
      var gg = solution[picked[k].idx];
      cons[gg.r + '_' + gg.c] = picked[k].dir;
    }
    return cons;
  }

  // 主入口:生成一关
  // config: { size, removeCount, edgeOnly, fixedStart, constraintCount, seed? }
  // 失败时逐步降低移除数重试,最后退到"当前尺寸完整网格",避免难度断崖降到 3×3。
  OS.generateLevel = function (config) {
    var cfg = Object.assign({
      size: 4, removeCount: 0, edgeOnly: false, fixedStart: false, constraintCount: 0, seed: null
    }, config || {});
    var rng = makeRng(cfg.seed);
    var n = cfg.size;

    // 移除数降级阶梯:原始 → 60% → 30% → 0(去重保序)
    var removeSteps = [];
    [cfg.removeCount, Math.floor(cfg.removeCount * 0.6), Math.floor(cfg.removeCount * 0.3), 0].forEach(function (v) {
      if (removeSteps.indexOf(v) === -1) removeSteps.push(v);
    });

    for (var si = 0; si < removeSteps.length; si++) {
      var rc = removeSteps[si];
      for (var attempt = 0; attempt < 40; attempt++) {
        var cells = rc > 0 ? carveRegion(n, rc, cfg.edgeOnly, rng) : fullGrid(n);
        if (!isConnected(cells)) continue;
        var solution = findHamiltonianPath(cells, rng);
        if (!solution) continue;
        var start = cfg.fixedStart ? solution[0] : null;
        return {
          size: n,
          cells: cells.map(copyCell),
          start: start ? copyCell(start) : null,
          solution: solution.map(copyCell),
          constraints: buildConstraints(solution, cfg.constraintCount, rng),
          seed: cfg.seed
        };
      }
    }
    // 最终兜底:当前尺寸的完整网格(矩形哈密顿路径几乎必有解),不再降到 3×3
    var cells = fullGrid(n);
    var sol = findHamiltonianPath(cells, rng) || cells;
    var start = cfg.fixedStart && sol ? sol[0] : null;
    return {
      size: n,
      cells: cells.map(copyCell),
      start: start ? copyCell(start) : null,
      solution: sol.map(copyCell),
      constraints: null,
      seed: cfg.seed
    };
  };
})();
