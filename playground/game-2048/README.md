# 2048

经典 2048 数字合成小游戏，单文件实现（`index.html`），无依赖、无构建。

## 玩法

- 合并相同数字的方块，凑出 **2048** 即获胜（可继续玩）。
- 桌面：方向键 / WASD；移动端：滑动屏幕。
- 自动记录历史最高分（localStorage）。
- 音效开关、浅色/深色主题切换（右上角图标）。

## 运行

直接用浏览器打开 `index.html` 即可，无需服务器：

```bash
google-chrome playground/game-2048/index.html   # 或双击文件
```

已部署：<https://game-2048-oucgjkwd.devinapps.com>（devinapps.com 静态托管，源文件即 `index.html`）。

## 环境要求

任意现代浏览器（Chrome / Safari / Edge / 手机浏览器）。

## 安卓

由 `../android/`（小游戏合集 app）打包：构建时 `syncGameAssets` 把本目录的 `index.html`
拷进 `assets/games/game-2048/` 上 launcher，改游戏只动 `index.html` 即可。

页面里对 `window.Android` 桥做了软调用（缺桥自动降级，不影响浏览器玩）：

| 调用 | 时机 | 作用 |
|---|---|---|
| `Android.vibrate(ms)` | 合并方块 / 获胜 | 手机震动反馈 |
| `Android.shareScore(text)` | 胜利/失败遮罩的「分享战绩」 | WebView 截图 + 系统分享 |
