#!/usr/bin/env bash
# doctor.sh —— 一次体检：把「看起来能用」变成「检查过能用」
#
# 检查项：python / 任务板 JSON / git 状态 / 接口健康 / 磁盘 / 备份数量
# 退出码：0 = 全绿；1 = 有失败项（可用于发布门禁）
#
# 用法：
#   bash scripts/doctor.sh
#   bash scripts/doctor.sh --quiet   # 只输出失败项

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
[ -f config.sh ] && . ./config.sh

PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python
DEPLOY_DIR="${DEPLOY_DIR:-./deploy}"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

FAIL=0
ok()   { [ "$QUIET" -eq 1 ] || printf '✔ %s\n' "$1"; }
warn() { printf '! %s\n' "$1"; }
bad()  { printf '✖ %s\n' "$1"; FAIL=$((FAIL+1)); }

echo "== 环境 =="
if command -v "$PY" >/dev/null 2>&1; then ok "python: $($PY -V 2>&1)"; else bad "找不到 python"; fi
if [ -f config.sh ]; then ok "config.sh 存在"; else warn "config.sh 不存在（可复制 config.example.sh）"; fi
if command -v git >/dev/null 2>&1; then ok "git: $(git --version)"; else bad "找不到 git"; fi

echo
echo "== 任务板 =="
if "$PY" - <<'PY' 2>/dev/null
import json
d = json.load(open(".agent-coordination/tasks.json", encoding="utf-8-sig"))
assert isinstance(d.get("tasks"), list)
PY
then
  ok "tasks.json 合法，$($PY scripts/taskboard.py counts)"
else
  bad "tasks.json 缺失或不是合法 JSON"
fi

echo
echo "== 仓库 =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -z "$(git status --porcelain)" ]; then ok "工作区干净"; else warn "有未提交改动（$(git status --porcelain | wc -l | tr -d ' ') 个文件）"; fi
  ok "最近提交：$(git log -1 --pretty='%h %s')"
else
  warn "不是 git 仓库"
fi

echo
echo "== 线上 =="
if [ -n "${HEALTH_URL:-}" ] && command -v curl >/dev/null 2>&1; then
  CODE="$(curl -fsS -m 5 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)"
  if [ "$CODE" = "200" ]; then ok "接口 200：$HEALTH_URL"; else bad "接口异常 HTTP $CODE：$HEALTH_URL"; fi
else
  warn "未配置 HEALTH_URL 或没有 curl"
fi

echo
echo "== 备份 =="
if [ -d "$DEPLOY_DIR" ]; then
  N="$(find "$DEPLOY_DIR" -maxdepth 1 -name '*.bak-*' 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${N:-0}" -gt 0 ]; then ok "可回滚备份 $N 个"; else warn "没有找到备份（首次部署可忽略）"; fi
else
  warn "部署目录不存在：$DEPLOY_DIR"
fi

if command -v df >/dev/null 2>&1; then
  echo
  echo "== 资源 =="
  ok "磁盘：$(df -h . | awk 'NR==2{print $5" 已用，可用 "$4}')"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "结果：全绿（0 个失败项）"
  exit 0
else
  echo "结果：$FAIL 个失败项"
  exit 1
fi
