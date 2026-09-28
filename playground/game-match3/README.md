# 消消乐

三消小游戏，五种模式：禅境（无尽）、闯关（300 关）、每日挑战、闪电（60 秒）、解谜（15 题）。

- 移植自 [lucasdaddiego/jeweled](https://github.com/lucasdaddiego/jeweled)（MIT，见 LICENSE）
- 纯 Canvas + WebAudio，零依赖、全离线；道具：洗牌/同色消除/投弹/换色/撤销
- 已汉化（i18n.js 中文字典）、跳过开局起名、去掉 service worker / 排行榜联网请求（离线自动隐藏）
- 本地预览：`python3 -m http.server` 后打开 `index.html`（需 http 协议，ES module 不支持 file://）
