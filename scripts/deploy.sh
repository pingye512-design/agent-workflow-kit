#!/usr/bin/env bash
# deploy.sh —— 带备份的发布：先留退路，再覆盖
#
# 原则：
#   1. 只发指定文件，不整目录覆盖。
#   2. 覆盖前一定备份 <文件名>.bak-<时间戳>。
#   3. 发布前必须持有写锁（或显式 --force）。
#
# 用法：
#   bash scripts/deploy.sh web/index.html
#   bash scripts/deploy.sh web/index.html --force
#
# 配置（config.sh）：
#   DEPLOY_DIR  本地发布目录（REMOTE_HOST 为空时使用，默认 ./deploy）
#   REMOTE_HOST ssh 别名（设置后走远端发布）
#   REMOTE_DIR  远端目录

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
[ -f config.sh ] && . ./config.sh
PY="${PY:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python
TS="$(date '+%Y%m%d-%H%M')"
DEPLOY_DIR="${DEPLOY_DIR:-./deploy}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_DIR="${REMOTE_DIR:-}"

FORCE=0
FILES=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    *) FILES+=("$a") ;;
  esac
done
[ ${#FILES[@]} -gt 0 ] || { echo "用法: bash scripts/deploy.sh <文件...> [--force]" >&2; exit 1; }

# ---- 写锁检查 ----
HOLDER="$("$PY" - <<'PY' 2>/dev/null
import json
try:
    d = json.load(open(".agent-coordination/server-lock.json", encoding="utf-8-sig"))
    print(d.get("lock_holder") or "")
except Exception:
    print("")
PY
)"
if [ -z "$HOLDER" ] && [ "$FORCE" -eq 0 ]; then
  echo "✖ 当前没有写锁。先执行：" >&2
  echo "  bash scripts/lock.sh acquire \"发布 <文件名>\" 30" >&2
  echo "  或者确认没人协作时加 --force" >&2
  exit 1
fi

# ---- 发布 ----
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "✖ 找不到文件：$f" >&2; exit 1; }
  base="$(basename "$f")"
  if [ -n "$REMOTE_HOST" ]; then
    [ -n "$REMOTE_DIR" ] || { echo "✖ 未配置 REMOTE_DIR" >&2; exit 1; }
    ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" \
      "mkdir -p '$REMOTE_DIR' && cd '$REMOTE_DIR' && [ -f '$base' ] && cp -p '$base' '$base.bak-$TS' || true" \
      || { echo "✖ 远端备份失败" >&2; exit 1; }
    scp -q "$f" "$REMOTE_HOST:$REMOTE_DIR/$base" || { echo "✖ 上传失败：$f" >&2; exit 1; }
    echo "✔ 已发布 $base → $REMOTE_HOST:$REMOTE_DIR（备份 .bak-$TS）"
  else
    mkdir -p "$DEPLOY_DIR"
    if [ -f "$DEPLOY_DIR/$base" ]; then
      cp -p "$DEPLOY_DIR/$base" "$DEPLOY_DIR/$base.bak-$TS"
      echo "  已备份：$DEPLOY_DIR/$base.bak-$TS"
    fi
    cp -p "$f" "$DEPLOY_DIR/$base"
    echo "✔ 已发布 $base → $DEPLOY_DIR"
  fi
done

echo
echo "下一步：bash scripts/doctor.sh  然后 bash scripts/lock.sh release \"发布完成\""
