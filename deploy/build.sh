#!/usr/bin/env bash
# ──────────────────────────────────────────────
# 十夜卡密 · 远程构建脚本
# 用法: bash build.sh [APP_DIR]
#   APP_DIR  代码根目录(默认 /opt/kmglxt)
# 功能: 拉取最新代码 → npm 依赖 → 前端构建 → 检查结果
# 前置: 需要 Node.js ≥ 24(由 km.sh 安装)
# ──────────────────────────────────────────────
set -euo pipefail

REPO_URL="${KM_REPO:-https://github.com/wstimin/KMGLXT.git}"
APP_DIR="${1:-/opt/kmglxt}"
DATA_DIR="${APP_DIR}/server/data"

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
BLU='\033[0;34m'
RST='\033[0m'
ok()   { echo -e "  ${GRN}✔${RST} $*"; }
warn() { echo -e "  ${YEL}⚠${RST} $*"; }
die()  { echo -e "  ${RED}✘${RST} $*"; exit 1; }
say()  { echo -e "  ${BLU}$*${RST}"; }

# ── 0. 预检 ──
echo
say "══════════════════════════════════════════"
say "  十夜卡密 · 远程构建"
say "══════════════════════════════════════════"
echo

# Node 版本检查
_node_ver() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }
if ! command -v node &>/dev/null; then
  die "未检测到 Node.js，请先通过 km.sh 安装"
fi
NODE_MAJOR=$(_node_ver)
[ "$NODE_MAJOR" -ge 24 ] 2>/dev/null || die "需要 Node.js ≥ 24，当前: $(node -v)"
ok "Node.js $(node -v)"

if [ ! -f "$APP_DIR/server/app.js" ]; then
  die "未检测到 $APP_DIR，请先运行安装(km install)"
fi
ok "应用目录: $APP_DIR"

# ── 1. 数据库备份 ──
echo
say "[1/5] 数据库备份..."
backup_dir="$DATA_DIR/backups/auto"
mkdir -p "$backup_dir"
backup_file="$backup_dir/pre-build-$(date +%Y%m%d-%H%M%S).db"
if [ -f "$DATA_DIR/shiyeka.db" ]; then
  (cd "$APP_DIR" && node server/scripts/db-backup.js "$backup_file" 2>/dev/null) \
    && ok "备份: $backup_file" \
    || warn "备份失败（继续构建）"
else
  warn "数据库文件不存在，跳过备份"
fi

# ── 2. 拉取代码 ──
echo
say "[2/5] 拉取最新代码..."
_pulled=0

# 2a. git fetch + reset（直接拉 main）
if [ -d "$APP_DIR/.git" ]; then
  if (cd "$APP_DIR" && git fetch --depth 1 origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null); then
    ok "代码已更新(origin/main)"
    _pulled=1
  fi

  # 2b. 直连失败 → ghfast.top 镜像
  if [ "$_pulled" -eq 0 ]; then
    warn "直连 GitHub 失败，尝试镜像..."
    if (cd "$APP_DIR" \
        && git remote set-url origin "https://ghfast.top/$REPO_URL" 2>/dev/null \
        && git fetch --depth 1 origin main 2>/dev/null \
        && git reset --hard origin/main 2>/dev/null); then
      ok "通过镜像 ghfast.top 更新"
      # 恢复原地址
      (cd "$APP_DIR" && git remote set-url origin "$REPO_URL" 2>/dev/null)
      _pulled=1
    fi
  fi

  # 2c. 镜像也失败 → ZIP 下载
  if [ "$_pulled" -eq 0 ]; then
    warn "镜像也失败，尝试 ZIP 下载..."
    _zip="/tmp/kmglxt.zip"
    _tmp="/tmp/kmglxt-extract-$$"
    rm -rf "$_tmp" "$_zip" 2>/dev/null
    if curl -fsSL -o "$_zip" "https://ghfast.top/$REPO_URL/archive/refs/heads/main.zip" 2>/dev/null \
       || curl -fsSL -o "$_zip" "https://ghproxy.net/https://github.com/wstimin/KMGLXT/archive/refs/heads/main.zip" 2>/dev/null; then
      mkdir -p "$_tmp"
      unzip -q "$_zip" -d "$_tmp" 2>/dev/null || { rm -rf "$_tmp" "$_zip"; die "ZIP 解压失败"; }
      # 保留 .git 和 server/data 不被覆盖
      _ver_dir=$(find "$_tmp" -maxdepth 1 -type d -name 'KMGLXT*' | head -1)
      if [ -n "$_ver_dir" ]; then
        # 保留数据库目录
        [ -d "$DATA_DIR" ] && mv "$DATA_DIR" "$DATA_DIR.bak" 2>/dev/null
        rsync -a --exclude='.git' "$_ver_dir/" "$APP_DIR/" 2>/dev/null \
          || { cp -r "$_ver_dir/"* "$APP_DIR/" 2>/dev/null; }
        [ -d "$DATA_DIR.bak" ] && mv "$DATA_DIR.bak" "$DATA_DIR" 2>/dev/null
        ok "通过 ZIP 下载并覆盖代码"
        _pulled=1
      fi
    fi
    rm -rf "$_tmp" "$_zip" 2>/dev/null
  fi

  # 恢复 ghfast 临时改写
  (cd "$APP_DIR" && git remote set-url origin "$REPO_URL" 2>/dev/null) 2>/dev/null
fi

if [ "$_pulled" -eq 0 ]; then
  warn "代码拉取失败，将使用本地现有代码继续构建"
fi

# ── 3. npm 依赖 ──
echo
say "[3/5] 安装依赖..."
if ! (cd "$APP_DIR/server" && npm install --no-fund --no-audit 2>&1 | tail -3); then
  warn "默认源安装失败，改用 npmmirror 镜像重试..."
  (cd "$APP_DIR/server" && npm install --no-fund --no-audit --registry=https://registry.npmmirror.com 2>&1 | tail -3) || die "server 依赖安装失败"
fi
ok "server 依赖安装完成"
if ! (cd "$APP_DIR/web" && npm install --no-fund --no-audit 2>&1 | tail -3); then
  warn "默认源安装失败，改用 npmmirror 镜像重试..."
  (cd "$APP_DIR/web" && npm install --no-fund --no-audit --registry=https://registry.npmmirror.com 2>&1 | tail -3) || die "web 依赖安装失败"
fi
ok "web 依赖安装完成"

# ── 4. 前端构建 ──
echo
say "[4/5] 构建前端..."
_build_log="/tmp/kmglxt-build-$(date +%s).log"
if (cd "$APP_DIR" && npm run build 2>&1 | tee "$_build_log" | tail -5); then
  ok "前端构建完成"
else
  echo
  warn "构建完整输出:"
  cat "$_build_log" 2>/dev/null | tail -30
  die "前端构建失败，请检查上方错误信息"
fi
rm -f "$_build_log" 2>/dev/null

# ── 5. 验证 ──
echo
say "[5/5] 验证构建产物..."
if [ -d "$APP_DIR/server/public/assets" ]; then
  _asset_count=$(find "$APP_DIR/server/public/assets" -type f | wc -l)
  ok "构建产物: $_asset_count 个文件"
else
  die "构建产物目录不存在: server/public/assets/"
fi

# 检查关键文件
for f in server/app.js server/db.js server/services/cardApi.js; do
  [ -f "$APP_DIR/$f" ] || die "关键文件缺失: $f"
done
ok "关键文件校验通过"

# 数据库自动迁移（amount 列兼容老库）
if [ -f "$DATA_DIR/shiyeka.db" ]; then
  node -e "
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync('$DATA_DIR/shiyeka.db');
    const cols=db.prepare('PRAGMA table_info(card_types)').all().map(c=>c.name);
    if(!cols.includes('amount')){db.exec('ALTER TABLE card_types ADD COLUMN amount REAL NOT NULL DEFAULT 0');console.log('✔ 老库补列:amount')}
    db.close();
  " 2>/dev/null && ok "数据库迁移检查" || warn "数据库迁移跳过"
fi

echo
say "══════════════════════════════════════════"
ok "构建完成！"
echo "  重启服务: systemctl restart kmglxt"
echo "  查看日志: journalctl -u kmglxt -f"
say "══════════════════════════════════════════"
echo
