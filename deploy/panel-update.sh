#!/usr/bin/env bash
# 宝塔 / 1Panel / systemd / PM2 通用网页更新器。
# 与 deploy/km.sh 一键安装器相互独立，由后台“部署与更新”页面调用。
set -Eeuo pipefail

APP_DIR="$(cd "${1:?缺少应用目录}" && pwd)"
TARGET_TAG="${2:?缺少目标版本}"
DATA_DIR="${DATA_DIR:-$APP_DIR/server/data}"
STATUS_FILE="$DATA_DIR/update-status.json"
LOG_FILE="$DATA_DIR/update.log"

[[ "$TARGET_TAG" =~ ^v[0-9]+([.][0-9]+)*([-._][0-9A-Za-z]+)*$ ]] || { echo "无效版本号"; exit 1; }
[ -f "$APP_DIR/server/app.js" ] || { echo "应用目录无效"; exit 1; }
mkdir -p "$DATA_DIR"
exec >>"$LOG_FILE" 2>&1

write_status() {
  local status="$1" phase="$2" message="$3"
  node - "$STATUS_FILE" "$status" "$phase" "$message" "$TARGET_TAG" <<'NODE'
const fs = require('fs');
const [file, status, phase, message, version] = process.argv.slice(2);
fs.writeFileSync(file, JSON.stringify({ status, phase, message, version, updatedAt: Date.now() }, null, 2));
NODE
}

fail() {
  local code=$?
  write_status "failed" "failed" "更新失败，请查看 server/data/update.log"
  exit "$code"
}
trap fail ERR

for command in node npm curl tar; do
  command -v "$command" >/dev/null 2>&1 || { write_status "failed" "prerequisite" "缺少命令：$command"; exit 1; }
done

TMP_DIR="$(mktemp -d /tmp/kmglxt-panel-update-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT
ARCHIVE="$TMP_DIR/KMGLXT-${TARGET_TAG}.tar.gz"
RELEASE_URL="https://github.com/wstimin/KMGLXT/releases/download/${TARGET_TAG}/KMGLXT-${TARGET_TAG}.tar.gz"

write_status "running" "backup" "正在备份数据库"
mkdir -p "$DATA_DIR/backups/auto"
if [ -f "$DATA_DIR/shiyeka.db" ]; then
  node "$APP_DIR/server/scripts/db-backup.js" "$DATA_DIR/backups/auto/pre-web-update-$(date +%Y%m%d-%H%M%S).db"
fi

write_status "running" "download" "正在下载 ${TARGET_TAG}"
curl -fSL --connect-timeout 10 --max-time 180 -o "$ARCHIVE" "$RELEASE_URL" \
  || curl -fSL --connect-timeout 10 --max-time 180 -o "$ARCHIVE" "https://ghfast.top/${RELEASE_URL}" \
  || curl -fSL --connect-timeout 10 --max-time 180 -o "$ARCHIVE" "https://ghproxy.net/${RELEASE_URL}"

write_status "running" "extract" "正在校验并安装构建包"
mkdir -p "$TMP_DIR/extract"
tar -xzf "$ARCHIVE" -C "$TMP_DIR/extract"
SOURCE="$TMP_DIR/extract"
if [ ! -f "$SOURCE/server/app.js" ]; then
  SERVER_FILE="$(find "$SOURCE" -maxdepth 3 -type f -path '*/server/app.js' | head -1)"
  [ -n "$SERVER_FILE" ] || { write_status "failed" "validate" "安装包缺少 server/app.js"; exit 1; }
  SOURCE="$(dirname "$(dirname "$SERVER_FILE")")"
fi
[ -f "$SOURCE/server/public/index.html" ] || { write_status "failed" "validate" "安装包缺少前端构建产物"; exit 1; }

# Release 不包含 server/data；复制时保留数据库、密钥和备份。
rm -rf "$APP_DIR/server/public"
for directory in server web deploy docs; do
  [ -d "$SOURCE/$directory" ] || continue
  mkdir -p "$APP_DIR/$directory"
  cp -a "$SOURCE/$directory/." "$APP_DIR/$directory/"
done
for file in package.json README.md .gitignore Dockerfile compose.yaml .dockerignore; do
  [ -f "$SOURCE/$file" ] && cp -a "$SOURCE/$file" "$APP_DIR/$file"
done

write_status "running" "dependencies" "正在安装服务端依赖"
(cd "$APP_DIR/server" && npm install --omit=dev --no-fund --no-audit) \
  || (cd "$APP_DIR/server" && npm install --omit=dev --no-fund --no-audit --registry=https://registry.npmmirror.com)

printf '%s\n' "$TARGET_TAG" > "$APP_DIR/.km-version"
chmod 644 "$APP_DIR/.km-version"

if [ "${KM_AUTO_RESTART:-0}" = "1" ] && [[ "${KM_SERVER_PID:-}" =~ ^[0-9]+$ ]]; then
  write_status "success" "restarting" "更新完成，服务正在自动重启"
  sleep 1
  kill -TERM "$KM_SERVER_PID" 2>/dev/null || true
else
  write_status "success" "restart_required" "更新文件已安装，请在面板中重启 Node 服务"
fi
