#!/usr/bin/env bash
# lock.sh —— 服务器写锁：谁在动，先写在文件里
#
# 为什么要有锁：
#   两个 Agent 同时改同一台服务器，最容易出现的不是报错，是「谁都不知道对方改了什么」。
#   锁不是权限，是礼貌：它只回答一个问题 —— 现在有没有人在动。
#
# 用法：
#   bash scripts/lock.sh status
#   bash scripts/lock.sh acquire "发布登录页" 30
#   bash scripts/lock.sh release "退出码 0，页面已可访问"

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
[ -f config.sh ] && . ./config.sh
PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python
OWNER="${OWNER:-$(whoami 2>/dev/null || echo agent)}"

CMD="${1:-status}"
case "$CMD" in
  status)
    "$PY" scripts/taskboard.py lock-status
    ;;
  acquire)
    OP="${2:-未命名操作}"
    MIN="${3:-30}"
    "$PY" scripts/taskboard.py lock-acquire --operation "$OP" --minutes "$MIN" --owner "$OWNER"
    ;;
  release)
    RESULT="${2:-完成}"
    "$PY" scripts/taskboard.py lock-release --result "$RESULT" --owner "$OWNER"
    ;;
  *)
    echo "用法: bash scripts/lock.sh status|acquire \"操作\" [分钟]|release \"结果\"" >&2
    exit 1
    ;;
esac
