#!/usr/bin/env bash
# 幂等启动 bridge：进程内 flock 保证单实例，重复执行安全。
cd "$(dirname "$0")"
exec 9>.bridge.start.lock
flock -n 9 || exit 0
pgrep -f "bridge\.py" >/dev/null && exit 0
nohup python3 bridge.py >> bridge.log 2>&1 &
disown
