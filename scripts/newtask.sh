#!/usr/bin/env bash
# newtask.sh —— 一行命令往任务板建卡（收到需求的第一个动作）
#
# 为什么要有这个脚本：
#   手改 tasks.json 极易把 JSON 改坏（少个逗号、重复 key、BOM），整条协作链直接失效。
#   建卡是最频繁的动作，必须一条命令搞定、且改不坏。
#
# 用法：
#   bash scripts/newtask.sh "把日报从本机搬到服务器"
#   bash scripts/newtask.sh "修登录提示" --files web/login.js --owner cli-agent
#   bash scripts/newtask.sh "补测试" --files tests/test_api.py --next "先跑一遍现有用例确定基线"

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
[ -f config.sh ] && . ./config.sh
PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python

GOAL="${1:-}"
[ -n "$GOAL" ] || { echo '用法: bash scripts/newtask.sh "目标" [--files a,b] [--owner x] [--next "下一句"]' >&2; exit 1; }
shift || true

FILES=""; OWNER="${OWNER:-agent}"; NEXT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --files) FILES="${2:-}"; shift 2 ;;
    --owner) OWNER="${2:-}"; shift 2 ;;
    --next)  NEXT="${2:-}";  shift 2 ;;
    *) echo "未知参数：$1" >&2; exit 1 ;;
  esac
done

# tasks.json 必须是合法 JSON，否则中止，绝不覆盖
"$PY" - <<'PY' || exit 1
import json, sys
p = ".agent-coordination/tasks.json"
try:
    json.load(open(p, encoding="utf-8-sig"))
except FileNotFoundError:
    sys.exit(0)
except Exception as e:
    print("✖ tasks.json 不是合法 JSON：%s" % e, file=sys.stderr)
    print("  排查：%s -c \"import json;json.load(open('%s',encoding='utf-8-sig'))\"" % (sys.executable, p), file=sys.stderr)
    sys.exit(1)
PY

"$PY" scripts/taskboard.py add --goal "$GOAL" --files "$FILES" --owner "$OWNER" --next-step "$NEXT"
