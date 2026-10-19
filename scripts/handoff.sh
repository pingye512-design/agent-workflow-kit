#!/usr/bin/env bash
# handoff.sh —— 生成一份「现在能直接接着做」的交接摘要
#
# 为什么要它：
#   收尾时人最容易偷懒，只写一句「已完成」。
#   这个脚本把事实摊开：谁在做什么、今天改了什么、下一步是什么、怎么退。

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
[ -f config.sh ] && . ./config.sh
PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python
OUT=".agent-coordination/HANDOFF-latest.md"
TS="$(date '+%Y-%m-%d %H:%M')"

{
  echo "# 交接摘要 · $TS"
  echo
  echo "## 任务状态"
  echo
  "$PY" scripts/taskboard.py counts
  echo
  "$PY" scripts/taskboard.py list --status doing
  echo
  echo "## 今天改了什么"
  echo
  git log --since="00:00" --pretty='- `%h` %s' 2>/dev/null || echo "- （非 git 目录）"
  echo
  echo "## 未提交的改动"
  echo
  git status --short 2>/dev/null | head -20 | sed 's/^/  - /' || true
  echo
  echo "## 写锁"
  echo
  "$PY" scripts/taskboard.py lock-status
  echo
  echo "## 接手提示"
  echo
  echo "1. 先跑 \`bash scripts/live.sh\`，读 LIVE.md。"
  echo "2. 有 doing 卡就接着做，不要另起炉灶。"
  echo "3. 改完跑 \`bash scripts/doctor.sh\`，把输出贴进卡片 note。"
  echo "4. 需要回滚：\`bash scripts/rollback.sh\`。"
} > "$OUT"

cat "$OUT"
echo
echo "已写入：$OUT"
