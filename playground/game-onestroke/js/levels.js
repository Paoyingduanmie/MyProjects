// 难度阶梯
// 关卡按序号递增难度:从小网格无移除,逐步加入"不规则棋盘/障碍格/固定起点",最后进入无尽模式。
// V1 用程序生成;V2 可在此插入少量手工/精选教学关(形如 { size, removeCount, ... } 的固定配置)。
(function () {
  'use strict';
  var OS = (window.OS = window.OS || {});

  // 阶梯每一档的生成参数
  OS.DIFFICULTY_LADDER = [
    { size: 3, removeCount: 0, edgeOnly: false, fixedStart: false, label: '热身' },
    { size: 4, removeCount: 0, edgeOnly: false, fixedStart: false, label: '入门' },
    { size: 4, removeCount: 2, edgeOnly: true,  fixedStart: false, label: '不规则' },
    { size: 5, removeCount: 0, edgeOnly: false, fixedStart: true,  label: '定点起手' },
    { size: 5, removeCount: 3, edgeOnly: false, fixedStart: false, label: '障碍' },
    { size: 5, removeCount: 4, edgeOnly: true,  fixedStart: true,  label: '挑战' },
    { size: 6, removeCount: 4, edgeOnly: true,  fixedStart: true,  label: '进阶' },
    { size: 6, removeCount: 6, edgeOnly: false, fixedStart: true,  label: '高手' }
  ];

  // 根据关卡序号(0-based)返回该关的生成配置
  OS.configForLevel = function (index) {
    if (index < OS.DIFFICULTY_LADDER.length) return OS.DIFFICULTY_LADDER[index];
    // 超出阶梯:在大网格上持续加难(无尽模式)
    var extra = index - OS.DIFFICULTY_LADDER.length;
    var size = Math.min(7, 6 + Math.floor(extra / 3));
    var removeCount = Math.min(Math.floor(size * size * 0.2), 4 + Math.floor(extra * 0.7));
    // 第 18 关起(extra>=9)逐步引入方向限制格,突破 7×7 的难度上限
    var constraintCount = (extra >= 9) ? Math.min(10, extra - 8) : 0;
    return {
      size: size,
      removeCount: removeCount,
      edgeOnly: extra % 2 === 0,
      fixedStart: true,
      constraintCount: constraintCount,
      label: '无尽 ' + (index + 1)
    };
  };
})();
