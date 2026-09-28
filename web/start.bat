@echo off
rem devin-mobile 一键启动：本地服务 + ngrok 固定域名隧道
rem 用法：双击运行；可放入 shell:startup 开机自启
cd /d "%~dp0"

start "devin-mobile server" /min python server.py
start "devin-mobile ngrok" /min "%~dp0..\tools\ngrok.exe" http --url=detached-citadel-gyration.ngrok-free.dev 8321

echo.
echo  本地:   http://127.0.0.1:8321
echo  公网:   https://detached-citadel-gyration.ngrok-free.dev
echo.
echo  手机首次访问: https://detached-citadel-gyration.ngrok-free.dev/?token=^<口令^>
echo  （口令在 config.json 的 access_token 字段）
echo.
echo  关闭对应窗口即可停止服务。
pause
