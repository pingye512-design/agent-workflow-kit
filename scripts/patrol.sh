#!/usr/bin/env bash
# patrol.sh —— 定时巡检：每跑一次，就多一条「当时是好的」的证据
#
# 用法：
#   bash scripts/patrol.sh
#   bash scripts/patrol.sh --quiet
#
# 定时（Linux）：
#   # crontab -e  →  0 */2 * * * cd /path/to/repo && bash scripts/patrol.sh --quiet
# 定时（systemd）：
#   写一个 patrol.service + patrol.timer，不要挂在个人电脑的定时任务上
#   —— 人一关机，「定时」就停了，而且没有任何人会发现。
#
# 通知：在 config.sh 配 NOTIFY_CMD，失败时把摘要通过 stdin 传给它。

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
[ -f config.sh ] && . ./config.sh
PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python
STATE="${PATROL_STATE:-.agent-coordination/patrol-state.json}"
LOG=".agent-coordination/patrol.log"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

mkdir -p .agent-coordination
OUT="$(bash scripts/doctor.sh 2>&1)"
RC=$?

ROUND="$("$PY" - "$STATE" <<'PY'
import json, os, sys
p = sys.argv[1]
try:
    d = json.load(open(p, encoding="utf-8-sig"))
except Exception:
    d = {"round": 0}
d["round"] = int(d.get("round", 0)) + 1
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(d["round"])
PY
)"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S') 第 $ROUND 轮 ｜ 退出码 $RC"
  echo "$OUT"
  echo
} >> "$LOG"

if [ "$QUIET" -eq 0 ]; then
  echo "$OUT"
  echo
  echo "第 $ROUND 轮完成，退出码 $RC，日志：$LOG"
fi

if [ "$RC" -ne 0 ] && [ -n "${NOTIFY_CMD:-}" ]; then
  printf '【巡检异常】第 %s 轮 · %s\n\n%s\n' "$ROUND" "$(date '+%m-%d %H:%M')" "$OUT" | eval "$NOTIFY_CMD"
fi

exit "$RC"
