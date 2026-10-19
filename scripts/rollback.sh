#!/usr/bin/env bash
# rollback.sh —— 一键回滚：改坏了，退回上一个好版本
#
# 原理：deploy.sh 每次覆盖前都会留 <文件名>.bak-<时间戳>；回滚就是把它复制回来。
#
# 用法：
#   bash scripts/rollback.sh                      # 列出可回滚的备份（只读，安全）
#   bash scripts/rollback.sh index.html           # 退回该文件最近一次备份
#   bash scripts/rollback.sh index.html 20261019-0931   # 退回指定时间点

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
[ -f config.sh ] && . ./config.sh
DEPLOY_DIR="${DEPLOY_DIR:-./deploy}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_DIR="${REMOTE_DIR:-}"
FILE="${1:-}"
STAMP="${2:-}"

if [ -z "$FILE" ]; then
  echo "现有备份（每个时间点都能回滚）："
  echo
  if [ -n "$REMOTE_HOST" ]; then
    ssh -o BatchMode=yes "$REMOTE_HOST" "cd '$REMOTE_DIR' && ls -t *.bak-* 2>/dev/null | head -30" 2>/dev/null | sed 's/^/  /' \
      || echo "  （连不上远端或没有备份）"
  else
    ls -t "$DEPLOY_DIR"/*.bak-* 2>/dev/null | head -30 | sed 's/^/  /' || echo "  （本地没有备份）"
  fi
  echo
  echo "回滚方法："
  echo "  bash scripts/rollback.sh <文件名>            # 最近一次"
  echo "  bash scripts/rollback.sh <文件名> <时间戳>   # 指定时间点"
  exit 0
fi

if [ -n "$REMOTE_HOST" ]; then
  SRC="$FILE.bak-${STAMP:-latest}"
  ssh -o BatchMode=yes "$REMOTE_HOST" \
    "cd '$REMOTE_DIR' && \
     SRC='$SRC'; \
     if [ \"$STAMP\" = \"\" ]; then SRC=\$(ls -t '$FILE'.bak-* 2>/dev/null | head -1); fi; \
     [ -n \"\$SRC\" ] || { echo '✖ 没有可用备份'; exit 1; }; \
     cp -p \"\$SRC\" '$FILE' && echo \"✔ 已回滚：\$SRC → $FILE\"" \
    || exit 1
  echo "提示：如果服务需要重启，请在服务器上执行你的重启命令。"
else
  if [ -z "$STAMP" ]; then
    SRC="$(ls -t "$DEPLOY_DIR/$FILE".bak-* 2>/dev/null | head -1)"
  else
    SRC="$DEPLOY_DIR/$FILE.bak-$STAMP"
  fi
  [ -n "${SRC:-}" ] && [ -f "$SRC" ] || { echo "✖ 没有找到备份：$FILE ${STAMP:-}" >&2; exit 1; }
  cp -p "$SRC" "$DEPLOY_DIR/$FILE"
  echo "✔ 已回滚：$(basename "$SRC") → $FILE"
fi

echo "回滚也建议记一笔：bash scripts/lock.sh release \"已回滚 <文件名>\""
