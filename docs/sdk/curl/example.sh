#!/usr/bin/env bash
# 十夜卡密 · curl 调试示例(bash + openssl)
# 用法: ./example.sh verify SY2026XXXX
set -euo pipefail

ENDPOINT='http://localhost:1111'       # 换成你的服务地址
APP_KEY='XXXXXXXXXXXXXXXXXXXXXXXX'
APP_SECRET='XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
ACTION="${1:-verify}"                  # verify | activate | consume | query | freeze | unfreeze
CARD="${2:-SY2026XXXX}"

body="{\"card\":\"$CARD\"}"
ts=$(date +%s)
nonce=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
body_hash=$(printf '%s' "$body" | openssl dgst -sha256 | awk '{print $2}')
sign=$(printf '%s\n%s\n%s\n%s' "$APP_KEY" "$ts" "$nonce" "$body_hash" \
  | openssl dgst -sha256 -hmac "$APP_SECRET" | awk '{print $2}')

curl -sS -X POST "$ENDPOINT/api/v1/card/$ACTION" \
  -H 'Content-Type: application/json' \
  -H "X-App-Key: $APP_KEY" \
  -H "X-Timestamp: $ts" \
  -H "X-Nonce: $nonce" \
  -H "X-Sign: $sign" \
  -d "$body"
echo