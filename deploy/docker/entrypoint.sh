#!/bin/sh
set -eu

mkdir -p "${DATA_DIR:-/data}"

# 绑定宿主机目录时先修正权限，再降权到 node 用户运行应用。
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "${DATA_DIR:-/data}"
  exec su-exec node:node "$0" "$@"
fi

exec node server/app.js
