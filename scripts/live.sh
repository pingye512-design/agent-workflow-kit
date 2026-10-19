#!/usr/bin/env bash
# live.sh —— 生成「现场快照」.agent-coordination/LIVE.md
#
# 为什么要有这个脚本：
#   多 Agent 协作最大的敌人不是能力，是「文档会过期」。
#   手工维护的交接单，写的时候是对的，三小时后就骗人。
#   所以现场快照必须自动生成 —— 每次开工前刷一下，永远是当前真相。
#
# 用法：
#   bash scripts/live.sh            # 刷新并打印
#   bash scripts/live.sh --quiet    # 只刷新，不打印

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

[ -f config.sh ] && . ./config.sh
PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python
COORD=".agent-coordination"
OUT="$COORD/LIVE.md"
TS="$(date '+%Y-%m-%d %H:%M:%S')"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

mkdir -p "$COORD"

{
  echo "# 现场快照 · LIVE"
  echo
  echo '> 本文件由 `scripts/live.sh` 自动生成，**不要手改**（手改会在下次刷新时被覆盖）。'
  echo "> 生成时间：**$TS** ｜ 刷新：\`bash scripts/live.sh\`"
  echo
  echo "---"
  echo
  echo "## 1. 任务板（谁在干什么）"
  echo
  "$PY" scripts/taskboard.py counts
  echo
  echo "### 正在做（接这个，别另起炉灶）"
  echo
  "$PY" scripts/taskboard.py list --status doing
  echo
  echo "### 卡住的（等人或外部条件）"
  echo
  "$PY" scripts/taskboard.py list --status blocked
  echo
  echo "## 2. 写锁"
  echo
  "$PY" scripts/taskboard.py lock-status
  echo
  echo "## 3. 仓库"
  echo
  echo "- 分支：\`$(git branch --show-current 2>/dev/null || echo '非 git 目录')\`"
  if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    echo "- 工作区：干净"
  else
    echo "- 工作区：**有未提交改动**"
    git status --short 2>/dev/null | head -15 | sed 's/^/  - /'
  fi
  echo "- 最近提交："
  git log --oneline -5 2>/dev/null | sed 's/^/  - /'
  echo
  echo "## 4. 健康检查"
  echo
  if [ -n "${HEALTH_URL:-}" ] && command -v curl >/dev/null 2>&1; then
    CODE="$(curl -fsS -m 5 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)"
    echo "- \`$HEALTH_URL\` → HTTP $CODE"
  else
    echo "- 未配置 \`HEALTH_URL\`，跳过接口检查"
  fi
  if command -v df >/dev/null 2>&1; then
    echo "- 磁盘：$(df -h . 2>/dev/null | awk 'NR==2{print $5" 已用，可用 "$4}')"
  fi
  echo
  echo "## 5. 接手提醒"
  echo
  echo '- 动服务器前先 `bash scripts/lock.sh acquire "<操作名>" 30`'
  echo '- 改完跑 `bash scripts/doctor.sh`，把输出贴进卡片 note'
} > "$OUT"

[ "$QUIET" -eq 1 ] || cat "$OUT"
