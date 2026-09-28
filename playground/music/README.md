# 云端曲库（playground/music）

小游戏合集 app 的云端音乐库：把音频文件（.mp3 / .m4a / .ogg / .wav / .flac）放进本目录并推送到 main，app 里 🎵 →「云端曲库」即可列出并下载到手机。

## 上传方式

- **GitLab 网页**：打开仓库 → `playground/music/` → 右上角「+」→ Upload file → 选文件提交。手机浏览器同样可行。
- **git**：`cp 歌曲.mp3 playground/music/ && git add playground/music && git commit -m "add music" && git push`

文件推上 main 后 app 无需发版即可看到（app 每次打开「云端曲库」实时通过 GitLab API 列目录）。
