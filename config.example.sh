# config.example.sh —— 复制成 config.sh 后按自己的环境改
# ⚠️ config.sh 已在 .gitignore 里，不要提交真实地址与密钥

# ---- 项目 ----
PROJECT_NAME="hello-service"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# ---- 运行环境 ----
PY="${PY:-python3}"                 # 有 python 即可；Windows 下可写 python
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/health}"

# ---- 远端（留空 = 只在本机操作）----
REMOTE_HOST="${REMOTE_HOST:-}"      # ssh 别名，例如 my-server
REMOTE_DIR="${REMOTE_DIR:-/opt/hello-service}"

# ---- 通知（留空 = 不发通知）----
NOTIFY_CMD="${NOTIFY_CMD:-}"        # 例如: curl -s -X POST "$WEBHOOK" -d @-

# ---- 巡检 ----
PATROL_STATE=".agent-coordination/patrol-state.json"
