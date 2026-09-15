#!/usr/bin/env bash
# ┌─────────────────────────────────────────────────────┐
# │  十夜卡密(KMGLXT) 一键安装管理工具                  │
# │  安装后 /usr/local/bin/km 调出菜单                  │
# │  也可直接 bash deploy/km.sh [子命令]                │
# └─────────────────────────────────────────────────────┘
set -uo pipefail

# ── 路径解析 ──────────────────────────────────────────
SELF="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
BASE_DIR="$(cd "$(dirname "$SELF")" && pwd)"
APP_DIR="${KM_DIR:-$(cd "$BASE_DIR/.." && pwd)}"

# ── 全局状态 ──────────────────────────────────────────
STATE_DIR="/etc/kmglxt"
ENV_FILE="$STATE_DIR/env"
DOMAINS_FILE="$STATE_DIR/domains"
NGINX_CONFD="/etc/nginx/conf.d"
UNIT="kmglxt.service"
DEFAULT_PORT=1111
REPO_URL="${KM_REPO:-https://github.com/wstimin/KMGLXT.git}"

# ── 从 env 文件加载变量(已安装则读取) ───────────────
PORT="${DEFAULT_PORT}"
DATA_DIR="$APP_DIR/server/data"
TRUST_PROXY=0
[ -f "$ENV_FILE" ] && . "$ENV_FILE" 2>/dev/null || true
PORT="${PORT:-$DEFAULT_PORT}"
DATA_DIR="${DATA_DIR:-$APP_DIR/server/data}"
TRUST_PROXY="${TRUST_PROXY:-0}"
CREDS_FILE="$DATA_DIR/.admin-credentials"
DB_PATH="$DATA_DIR/shiyeka.db"

# ── 颜色 ──────────────────────────────────────────────
if [ -t 1 ]; then
  R='\033[1;31m' G='\033[1;32m' Y='\033[1;33m' B='\033[1;34m'
  C='\033[1;36m' DIM='\033[2m' BOLD='\033[1m' RST='\033[0m'
else
  R='' G='' Y='' B='' C='' DIM='' BOLD='' RST=''
fi

# ── 工具函数 ──────────────────────────────────────────
say()  { printf '%b\n' "$*"; }
info() { printf "${G}✔ %b${RST}\n" "$*"; }
warn() { printf "${Y}⚠ %b${RST}\n" "$*"; }
err()  { printf "${R}✘ %b${RST}\n" "$*"; }
die()  { err "$*"; exit 1; }
need_root() { [ "$(id -u)" -eq 0 ] || die "需要 root 权限，请使用 sudo km 或 sudo bash $*"; }
confirm() {
  local msg="${1:-确认执行?}"
  printf "${Y}%b [y/N]: ${RST}" "$msg"
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ── 包管理器检测 ─────────────────────────────────────
PM="" PM_INSTALL="" PM_UPDATE=""
detect_pkg() {
  if command -v apt-get &>/dev/null; then
    PM=apt-get; PM_INSTALL="apt-get install -y"; PM_UPDATE="apt-get update -qq"
  elif command -v dnf &>/dev/null; then
    PM=dnf; PM_INSTALL="dnf install -y"
  elif command -v yum &>/dev/null; then
    PM=yum; PM_INSTALL="yum install -y"
  else
    die "不支持的系统发行版(仅支持 Debian/Ubuntu/CentOS/RHEL/Rocky)"
  fi
}

# ── Node 安装 ────────────────────────────────────────
ensure_node() {
  if command -v node &>/dev/null; then
    local v
    v="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    [ "$v" -ge 24 ] 2>/dev/null && { info "Node.js $(node -v) 已就绪"; return 0; }
    warn "当前 Node.js 版本 $(node -v) 低于 v24，将更新..."
  fi
  say "${B}正在安装 Node.js 24 (NodeSource)...${RST}"
  case "$PM" in
    apt-get)
      curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null 2>&1 || die "NodeSource 配置失败"
      $PM_INSTALL nodejs >/dev/null 2>&1 || die "nodejs 安装失败"
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - >/dev/null 2>&1 || die "NodeSource 配置失败"
      $PM_INSTALL nodejs -y >/dev/null 2>&1 || die "nodejs 安装失败"
      ;;
  esac
  if ! command -v node &>/dev/null || [ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" -lt 24 ]; then
    warn "NodeSource 安装失败，尝试手动下载二进制包..."
    _install_node_tarball
  fi
  hash -r
  command -v node &>/dev/null && info "Node.js $(node -v) 安装完成" || die "Node.js 安装失败，请手动安装 v24+"
}
_install_node_tarball() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) die "不支持的 CPU 架构: $arch" ;;
  esac
  local ver
  ver="$(curl -fsSL https://nodejs.org/dist/latest-v24.x/ 2>/dev/null | grep -oE 'v24\.[0-9]+\.[0-9]+' | head -1)"
  [ -z "$ver" ] && die "无法获取 Node.js 24 最新版本"
  local url="https://nodejs.org/dist/$ver/node-$ver-linux-$arch.tar.xz"
  cd /tmp && curl -fsSLO "$url" && tar -xJf "node-$ver-linux-$arch.tar.xz" -C /usr/local --strip-components=1 && hash -r
  rm -f "node-$ver-linux-$arch.tar.xz"
}

# ── 数据库管理员查询 ─────────────────────────────────
_db_has_admin() {
  [ -f "$DB_PATH" ] || { echo 0; return; }
  DBP="$DB_PATH" node -e "
    const{DatabaseSync}=require('node:sqlite');
    const d=new DatabaseSync(process.env.DBP);
    try{const r=d.prepare('SELECT COUNT(*) c FROM admins').get();console.log(r.c)}
    catch{console.log(0)}
    d.close()
  " 2>/dev/null || echo 0
}
_db_admin_user() {
  [ -f "$DB_PATH" ] || { echo ""; return; }
  DBP="$DB_PATH" node -e "
    const{DatabaseSync}=require('node:sqlite');
    const d=new DatabaseSync(process.env.DBP);
    try{const r=d.prepare('SELECT username FROM admins LIMIT 1').get();if(r)console.log(r.username)}
    catch{}
    d.close()
  " 2>/dev/null
}

# ── 随机密码生成 ─────────────────────────────────────
_gen_pass() {
  local len="${1:-16}"
  if command -v openssl &>/dev/null; then
    openssl rand -base64 "$((len*2))" | tr -dc 'A-Za-z0-9' | head -c "$len"
  elif [ -r /dev/urandom ]; then
    head -c 256 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c "$len"
  else
    date +%s%N | sha256sum | head -c "$len"
  fi
}

# ── 管理员凭证文件 ──────────────────────────────────
_save_creds() {
  local user="$1" pass="$2"
  mkdir -p "$(dirname "$CREDS_FILE")"
  cat > "$CREDS_FILE" <<EOF
# 管理员登录凭证(安装时生成,修改后自动同步)
username: $user
password: $pass
updated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
EOF
  chmod 600 "$CREDS_FILE"
}

# ── env 文件写入 ─────────────────────────────────────
_write_env() {
  mkdir -p "$STATE_DIR"
  cat > "$ENV_FILE" <<EOF
# KMGLXT 环境变量(由 km 工具管理,请勿手动修改)
PORT=$PORT
DATA_DIR=$DATA_DIR
TRUST_PROXY=$TRUST_PROXY
EOF
  chmod 600 "$ENV_FILE"
}

# ── 服务管理 ─────────────────────────────────────────
_restart_service() {
  if systemctl is-active "$UNIT" &>/dev/null; then
    systemctl restart "$UNIT" && info "服务已重启" || warn "服务重启失败，请手动 systemctl status $UNIT"
  elif systemctl is-enabled "$UNIT" &>/dev/null; then
    systemctl start "$UNIT" && info "服务已启动" || warn "服务启动失败"
  fi
}

# ── systemd 部署 ────────────────────────────────────
_install_systemd() {
  case "$APP_DIR" in
    *" "*) die "安装路径不能包含空格: $APP_DIR" ;;
  esac
  local unit_src="$APP_DIR/deploy/systemd/kmglxt.service"
  [ -f "$unit_src" ] || die "未找到 systemd 模板: $unit_src"
  mkdir -p /etc/systemd/system
  sed "s|@APP_DIR@|$APP_DIR|g" "$unit_src" > /etc/systemd/system/"$UNIT"
  systemctl daemon-reload
  systemctl enable --now "$UNIT" &>/dev/null
}

# ── 防火墙 ───────────────────────────────────────────
_open_firewall() {
  local port="$1"
  if command -v ufw &>/dev/null; then
    ufw allow "$port/tcp" &>/dev/null || true
  elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-port="$port/tcp" &>/dev/null || true
    firewall-cmd --reload &>/dev/null || true
  fi
}

# ── Nginx ────────────────────────────────────────────
_ensure_nginx() {
  if command -v nginx &>/dev/null; then return 0; fi
  say "${B}正在安装 Nginx...${RST}"
  $PM_INSTALL nginx >/dev/null 2>&1 || die "Nginx 安装失败"
  systemctl enable --now nginx &>/dev/null
  info "Nginx 安装完成"
}
_ensure_certbot() {
  if command -v certbot &>/dev/null; then return 0; fi
  say "${B}正在安装 Certbot...${RST}"
  case "$PM" in
    apt-get) $PM_INSTALL certbot python3-certbot-nginx >/dev/null 2>&1 ;;
    dnf|yum) $PM_INSTALL epel-release >/dev/null 2>&1; $PM_INSTALL certbot python3-certbot-nginx >/dev/null 2>&1 ;;
  esac
  command -v certbot &>/dev/null || die "Certbot 安装失败，请手动安装"
  info "Certbot 安装完成"
}

# ── Nginx 域名配置 ──────────────────────────────────
_domain_conf_name() {
  local d="$1"
  echo "$NGINX_CONFD/kmglxt-${d//./-}.conf"
}
_write_nginx_conf() {
  local domain="$1" conf
  conf="$(_domain_conf_name "$domain")"
  mkdir -p "$NGINX_CONFD"
  cat > "$conf" <<CONF
server {
    listen 80;
    server_name $domain;

    # 请求体上限(导入 / 备份恢复用)
    client_max_body_size 520m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
    }
}
CONF
  nginx -t &>/dev/null || { rm -f "$conf"; die "Nginx 配置语法错误"; }
}
_nginx_reload() {
  nginx -t &>/dev/null && systemctl reload nginx &>/dev/null
}

# ── 公网 IP 检测 ─────────────────────────────────────
# hostname -I 只会返回内网 IP,这里依次查询公网 IP(国内可访问的接口优先)
detect_public_ip() {
  local ip=""
  ip="$(curl -s --connect-timeout 3 --max-time 5 https://myip.ipip.net 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  [ -n "$ip" ] && { echo "$ip"; return; }
  ip="$(curl -s --connect-timeout 3 --max-time 5 https://cip.cc 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  [ -n "$ip" ] && { echo "$ip"; return; }
  ip="$(curl -s --connect-timeout 3 --max-time 5 https://api.ipify.org 2>/dev/null | tr -dc '0-9.')"
  [ -n "$ip" ] && { echo "$ip"; return; }
  ip="$(curl -s --connect-timeout 3 --max-time 5 https://ifconfig.me 2>/dev/null | tr -dc '0-9.')"
  [ -n "$ip" ] && { echo "$ip"; return; }
}

# ── 访问地址输出(公网优先生效) ──────────────────────
print_access_urls() {
  local pub_ip priv_ip
  pub_ip="$(detect_public_ip)"
  priv_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  say "  ${B}访问地址:${RST}"
  if [ -n "$pub_ip" ]; then
    say "    ${G}公网:${RST} http://$pub_ip:${PORT}"
  else
    say "    ${Y}公网:${RST} https://myip.ipip.net 查询(或看云服务商控制台公网 IP)"
  fi
  [ -n "$priv_ip" ] && say "    内网: http://$priv_ip:${PORT}"
  echo
}

# ── 域名登记表 ──────────────────────────────────────
_register_domain() {
  local d="$1"
  touch "$DOMAINS_FILE"
  grep -qx "$d" "$DOMAINS_FILE" 2>/dev/null || echo "$d" >> "$DOMAINS_FILE"
}
_unregister_domain() {
  local d="$1"
  [ -f "$DOMAINS_FILE" ] && sed -i "/^$(printf '%s' "$d" | sed 's/[&/\]/\\&/g')$/d" "$DOMAINS_FILE"
  [ -s "$DOMAINS_FILE" ] || rm -f "$DOMAINS_FILE"
}
_domain_count() {
  [ -f "$DOMAINS_FILE" ] && grep -c '.' "$DOMAINS_FILE" 2>/dev/null || echo 0
}
_list_domains() {
  [ -f "$DOMAINS_FILE" ] && cat "$DOMAINS_FILE" 2>/dev/null
}
_valid_domain() {
  local d="$1"
  echo "$d" | grep -qE '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$' 2>/dev/null
}

# ── TRUST_PROXY 同步 ────────────────────────────────
_sync_trust_proxy() {
  local cnt
  cnt="$(_domain_count)"
  TRUST_PROXY=$([ "$cnt" -gt 0 ] && echo 1 || echo 0)
  _write_env
  _restart_service
}

# ══════════════════════════════════════════════════════
#                        功能菜单
# ══════════════════════════════════════════════════════

# ── 1. 安装 ─────────────────────────────────────────
cmd_install() {
  need_root "$0"
  detect_pkg

  # 如果已安装则提示
  if [ -f "$APP_DIR/server/app.js" ]; then
    warn "检测到 $APP_DIR 已有应用代码"
    warn "如需升级请选「2) 更新」；如需重装请先卸载"
    read -r -p "按回车返回..."
    return
  fi

  say "${B}══════════════════════════════════════════${RST}"
  say "${B}  十夜卡密(KMGLXT) 一键安装向导${RST}"
  say "${B}══════════════════════════════════════════${RST}"
  echo

  # 1. 系统依赖
  say "${B}[1/8] 系统依赖...${RST}"
  $PM_UPDATE &>/dev/null 2>&1 || true
  $PM_INSTALL curl git unzip tar openssl ca-certificates &>/dev/null 2>&1 || die "系统依赖安装失败"

  # 2. Node.js
  say "${B}[2/8] Node.js...${RST}"
  ensure_node

  # 3. 拉取代码(自动回退:直连 → 镜像 → ZIP 下载)
  say "${B}[3/8] 拉取代码...${RST}"
  mkdir -p "$(dirname "$APP_DIR")"
  if git clone --depth 1 "$REPO_URL" "$APP_DIR" 2>/dev/null; then
    info "代码已拉取到 $APP_DIR"
  elif git clone --depth 1 "https://ghfast.top/$REPO_URL" "$APP_DIR" 2>/dev/null; then
    info "通过镜像拉取到 $APP_DIR"
  elif
    local _zip="/tmp/kmglxt.zip"
    say "  使用 CDN 下载源码..."
    curl -fsSL -o "$_zip" "https://ghfast.top/$REPO_URL/archive/refs/heads/main.zip" 2>/dev/null \
      || curl -fsSL -o "$_zip" "https://ghproxy.net/https://github.com/wstimin/KMGLXT/archive/refs/heads/main.zip" 2>/dev/null
  then
    command -v unzip &>/dev/null || $PM_INSTALL unzip >/dev/null 2>&1
    local _tmp="/tmp/kmglxt-extract-$$"
    mkdir -p "$_tmp"
    unzip -q "$_zip" -d "$_tmp" >/dev/null 2>&1 || { rm -rf "$_tmp" "$_zip"; die "ZIP 解压失败"; }
    mv "$_tmp"/KMGLXT-main/* "$APP_DIR" 2>/dev/null || mv "$_tmp"/KMGLXT-*/* "$APP_DIR" 2>/dev/null
    rm -rf "$_tmp" "$_zip"
    info "通过 ZIP 下载到 $APP_DIR"
  else
    rm -f "$_zip" 2>/dev/null
    die "拉取失败:直连、镜像、ZIP 均不可用,请检查服务器网络"
  fi

  # 4. 安装依赖 + 构建
  say "${B}[4/8] 安装依赖并构建前端...${RST}"
  (cd "$APP_DIR" && npm run setup > /dev/null 2>&1) || die "npm 依赖安装失败"
  (cd "$APP_DIR" && npm run build > /dev/null 2>&1) || die "前端构建失败"
  info "依赖安装与构建完成"

  # 5. 初始化数据库 + 管理员
  say "${B}[5/8] 初始化数据库...${RST}"
  mkdir -p "$DATA_DIR"
  local admin_user="${KM_ADMIN_USER:-admin}"
  local admin_pass
  local had_admin
  had_admin="$(_db_has_admin)"
  if [ "$had_admin" -gt 0 ] 2>/dev/null; then
    admin_user="$(_db_admin_user)"
    info "数据库已有管理员: $admin_user（保留）"
    # 尝试恢复密码到凭证文件
    if [ ! -f "$CREDS_FILE" ]; then
      _save_creds "$admin_user" "（密码未知，请用 km auth 重置）"
      warn "凭证文件缺失，已创建占位；请用 km auth 重置密码"
    fi
  else
    admin_pass="$(_gen_pass 16)"
    (cd "$APP_DIR" && ADMIN_USER="$admin_user" ADMIN_PASS="$admin_pass" npm run init-db) > /dev/null 2>&1 \
      || die "数据库初始化失败"
    _save_creds "$admin_user" "$admin_pass"
    info "管理员已创建: $admin_user"
  fi

  # 6. 写入环境文件
  say "${B}[6/8] 写入环境配置...${RST}"
  _write_env
  info "环境变量已写入 $ENV_FILE"

  # 7. systemd 服务
  say "${B}[7/8] 配置系统服务...${RST}"
  _install_systemd
  info "服务 $UNIT 已启动"

  # 8. 防火墙 + km 链接
  say "${B}[8/8] 防火墙 + 命令链接...${RST}"
  _open_firewall "$PORT"
  chmod +x "$APP_DIR/deploy/km.sh"
  ln -sf "$APP_DIR/deploy/km.sh" /usr/local/bin/km
  info "km 命令已注册: /usr/local/bin/km"

  echo
  say "${G}══════════════════════════════════════════${RST}"
  say "${G}  ✔ 安装完成！${RST}"
  say "${G}══════════════════════════════════════════${RST}"
  if [ -f "$CREDS_FILE" ]; then
    say ""
    say "${B}管理员账号:${RST}"
    cat "$CREDS_FILE"
    echo
  fi
  print_access_urls
  say "${B}管理菜单:${RST} km"
  say ""
  if ! confirm "是否现在添加域名并申请 HTTPS 证书?"; then
    info "跳过域名配置，可随时用 km domain add <域名> 添加"
  else
    cmd_domain_add
  fi
}

# ── 2. 更新 ─────────────────────────────────────────
cmd_update() {
  need_root "$0"
  if [ ! -f "$APP_DIR/server/app.js" ]; then
    die "未检测到已安装的应用，请先运行安装"
  fi

  say "${B}══════════════════════════════════════════${RST}"
  say "${B}  十夜卡密(KMGLXT) 更新${RST}"
  say "${B}══════════════════════════════════════════${RST}"

  # 数据库热备份
  say "${B}[1/4] 数据库备份...${RST}"
  local backup_dir="$DATA_DIR/backups/auto"
  mkdir -p "$backup_dir"
  local backup_file="$backup_dir/pre-update-$(date +%Y%m%d-%H%M%S).db"
  if [ -f "$DB_PATH" ]; then
    (cd "$APP_DIR" && node server/scripts/db-backup.js "$backup_file") > /dev/null 2>&1 \
      && info "备份完成: $backup_file" || warn "数据库备份失败（继续更新）"
  else
    warn "未找到数据库文件，跳过备份"
  fi

  # Git 拉取
  say "${B}[2/4] 拉取最新代码...${RST}"
  local _pulled=0
  if [ -d "$APP_DIR/.git" ]; then
    # 优先用 fetch + reset(兼容浅克隆,比 pull --ff-only 更健壮)
    if (cd "$APP_DIR" && git fetch --depth 1 origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null); then
      info "代码已更新"
      _pulled=1
    fi
    # 直连失败,尝试镜像
    if [ "$_pulled" -eq 0 ]; then
      if (cd "$APP_DIR" && git remote set-url origin "https://ghfast.top/$REPO_URL" 2>/dev/null && git fetch --depth 1 origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null); then
        info "通过镜像更新代码"
        (cd "$APP_DIR" && git remote set-url origin "$REPO_URL" 2>/dev/null)
        _pulled=1
      fi
    fi
    if [ "$_pulled" -eq 0 ]; then
      warn "git fetch 失败，跳过代码更新（继续使用当前代码）"
    fi
  else
    warn "非 Git 仓库，跳过代码拉取（使用当前代码）"
  fi

  # 依赖与构建
  say "${B}[3/4] 安装依赖并构建前端...${RST}"
  (cd "$APP_DIR" && npm run setup > /dev/null 2>&1 && npm run build > /dev/null 2>&1) \
    || die "构建失败"
  info "依赖与构建完成"

  # 重启服务
  say "${B}[4/4] 重启服务...${RST}"
  _restart_service

  # 同步 km 链接
  chmod +x "$APP_DIR/deploy/km.sh"
  ln -sf "$APP_DIR/deploy/km.sh" /usr/local/bin/km

  echo
  info "✔ 更新完成！"
  say "  数据目录: $DATA_DIR（已保留）"
  say "  管理员账号: $([ -f "$CREDS_FILE" ] && grep 'username:' "$CREDS_FILE" | awk '{print $2}' || echo '未找到')"
  print_access_urls
}

# ── 3. 查看信息 ─────────────────────────────────────
cmd_info() {
  say "${B}══════════════════════════════════════════${RST}"
  say "${B}  十夜卡密(KMGLXT) 系统信息${RST}"
  say "${B}══════════════════════════════════════════${RST}"
  echo

  # 应用信息
  if [ -f "$APP_DIR/package.json" ]; then
    local ver
    ver="$(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo '?')"
    say "  ${B}版本:${RST}  $ver"
  else
    say "  ${Y}状态:${RST}  未安装（未找到 package.json）"
    return
  fi

  # 服务状态
  local svc_status
  svc_status="$(systemctl is-active "$UNIT" 2>/dev/null || echo '未运行')"
  if [ "$svc_status" = "active" ]; then
    say "  ${G}服务:${RST}  $svc_status ✓${RST}"
  else
    say "  ${R}服务:${RST}  $svc_status"
  fi

  # 系统环境
  say "  ${B}Node:${RST}   $(node -v 2>/dev/null || echo '未安装')"
  say "  ${B}端口:${RST}   $PORT"
  local _pub
  _pub="$(detect_public_ip 2>/dev/null)"
  if [ -n "$_pub" ]; then
    say "  ${G}公网IP:${RST}  $_pub（http://$_pub:$PORT）"
  else
    say "  ${Y}公网IP:${RST}  未能查询(请以云服务商控制台为准)"
  fi

  # API 自检
  local api_status
  api_status="$(curl -s --connect-timeout 2 "http://127.0.0.1:$PORT/api/v1/status" 2>/dev/null || echo '无响应')"
  if echo "$api_status" | grep -q '"ok"' 2>/dev/null; then
    say "  ${G}API:${RST}    正常 ✓${RST}"
  else
    say "  ${R}API:${RST}    $api_status"
  fi

  # 管理员
  echo
  say "  ${B}管理员:${RST}"
  if [ -f "$CREDS_FILE" ]; then
    local cred_user cred_pass
    cred_user="$(grep 'username:' "$CREDS_FILE" | awk '{print $2}')"
    cred_pass="$(grep 'password:' "$CREDS_FILE" | awk '{print $2}')"
    [ -n "$cred_user" ] && say "    用户名: $cred_user"
    [ -n "$cred_pass" ] && say "    密  码: $cred_pass"
  else
    local db_user
    db_user="$(_db_admin_user)"
    [ -n "$db_user" ] && say "    用户名: $db_user（密码未记录，可用 km auth 重置）"
  fi

  # 数据库
  echo
  say "  ${B}数据:${RST}"
  if [ -f "$DB_PATH" ]; then
    local db_size
    db_size="$(ls -lh "$DB_PATH" 2>/dev/null | awk '{print $5}')"
    say "    数据库: $DB_PATH（$db_size）"
  else
    say "    数据库: 未找到"
  fi
  local data_size
  data_size="$(du -sh "$DATA_DIR" 2>/dev/null | awk '{print $1}')"
  [ -n "$data_size" ] && say "    数据目录: $DATA_DIR（$data_size）"

  # 域名
  echo
  say "  ${B}域名:${RST}"
  local cnt
  cnt="$(_domain_count)"
  if [ "$cnt" -gt 0 ]; then
    while IFS= read -r d; do
      local ssl_status
      ssl_status="$(curl -s --connect-timeout 2 -o /dev/null -w '%{http_code}' "https://$d/api/v1/status" 2>/dev/null || echo '?')"
      [ "$ssl_status" = "200" ] && ssl_status="HTTPS ✓" || ssl_status="HTTP"
      say "    $d （$ssl_status）"
    done < <(_list_domains)
  else
    say "    （未配置域名）"
  fi

  echo
  say "  ${B}TRUST_PROXY:${RST} $TRUST_PROXY"
  echo
}

# ── 4. 修改账号密码 ─────────────────────────────────
cmd_auth() {
  need_root "$0"
  if [ ! -f "$APP_DIR/server/app.js" ]; then
    die "未检测到已安装的应用"
  fi

  say "${B}══════════════════════════════════════════${RST}"
  say "${B}  修改管理员账号 / 密码${RST}"
  say "${B}══════════════════════════════════════════${RST}"
  echo

  # 显示当前账号
  local current_user
  if [ -f "$CREDS_FILE" ]; then
    current_user="$(grep 'username:' "$CREDS_FILE" | awk '{print $2}')"
  fi
  [ -z "$current_user" ] && current_user="$(_db_admin_user)"
  say "  当前用户名: ${B}${current_user:-未知}${RST}"
  echo

  # 新用户名
  local new_user
  printf "  新用户名 [${current_user:-admin}]: "
  read -r new_user
  [ -z "$new_user" ] && new_user="${current_user:-admin}"

  # 新密码(输入两次，最少 6 位)
  local pass1 pass2
  while true; do
    printf "  新密码(至少 6 位): "
    read -s -r pass1
    echo
    [ ${#pass1} -lt 6 ] && { warn "密码太短（至少 6 位）"; continue; }
    printf "  再次输入密码: "
    read -s -r pass2
    echo
    [ "$pass1" = "$pass2" ] && break || warn "两次密码不一致，请重新输入"
  done

  # 执行修改
  (cd "$APP_DIR" && node server/scripts/set-admin.js "$new_user" "$pass1") \
    || die "修改失败"
  _save_creds "$new_user" "$pass1"
  info "管理员已更新为: $new_user"
}

# ── 5. 域名管理 ─────────────────────────────────────
cmd_domain_menu() {
  while true; do
    echo
    say "${B}  域名管理${RST}"
    echo "  ─────────────────────────────"
    echo "    1) 添加域名 / 申请证书"
    echo "    2) 删除域名"
    echo "    3) 更换域名"
    echo "    4) 查看域名列表"
    echo "    0) 返回主菜单"
    echo
    printf "  选择: "
    read -r sub
    case "$sub" in
      1) cmd_domain_add ;;
      2) cmd_domain_remove ;;
      3) cmd_domain_replace ;;
      4) cmd_domain_list ;;
      0) return ;;
      *) warn "无效选择"; sleep 1 ;;
    esac
  done
}

cmd_domain_list() {
  local cnt
  cnt="$(_domain_count)"
  echo
  if [ "$cnt" -gt 0 ]; then
    say "  已配置域名（$cnt 个）:"
    local i=1
    while IFS= read -r d; do
      say "    $i) $d"
      ((i++))
    done < <(_list_domains)
  else
    say "  （尚未配置域名）"
    say "  即使不添加域名，系统也可通过 IP:端口 正常访问"
  fi
  echo
  read -r -p "  按回车返回..."
}

cmd_domain_add() {
  need_root "$0"

  local domain
  printf "  输入域名 (如 ka.example.com): "
  read -r domain
  [ -z "$domain" ] && { warn "域名不能为空"; return; }
  _valid_domain "$domain" || { warn "域名格式无效（仅支持字母数字与连字符）"; return; }

  # 已存在检查
  grep -qx "$domain" "$DOMAINS_FILE" 2>/dev/null && { warn "域名 $domain 已存在"; return; }

  say "${B}[1/4] 安装 Nginx...${RST}"
  _ensure_nginx

  say "${B}[2/4] 配置 Nginx...${RST}"
  _write_nginx_conf "$domain"
  _nginx_reload
  _register_domain "$domain"
  info "Nginx 已配置 $domain → http://127.0.0.1:$PORT"

  say "${B}[3/4] 更新代理设置...${RST}"
  _sync_trust_proxy
  info "TRUST_PROXY=$TRUST_PROXY"

  say "${B}[4/4] SSL 证书..."
  if confirm "申请 Let's Encrypt HTTPS 证书?"; then
    _ensure_certbot
    local email
    printf "  证书接收邮箱 [回车跳过]: "
    read -r email
    local certbot_cmd="certbot --nginx -d $domain --non-interactive --agree-tos"
    if [ -n "$email" ]; then
      certbot_cmd="$certbot_cmd -m $email"
    else
      certbot_cmd="$certbot_cmd --register-unsafely-without-email"
    fi
    if eval "$certbot_cmd" &>/dev/null; then
      _nginx_reload
      info "HTTPS 证书已申请并启用: https://$domain"
    else
      warn "证书申请失败（可能是 DNS 未解析到本服务器），当前使用 HTTP"
      warn "可稍后手动执行: certbot --nginx -d $domain"
    fi
  else
    info "跳过 SSL 证书，当前使用 HTTP: http://$domain"
  fi
}

cmd_domain_remove() {
  need_root "$0"
  local cnt
  cnt="$(_domain_count)"
  [ "$cnt" -gt 0 ] || { warn "没有已配置的域名"; return; }

  # 选择要删除的域名
  say "  已配置域名:"
  local i=1 domains_arr=()
  while IFS= read -r d; do
    domains_arr+=("$d")
    echo "    $i) $d"
    ((i++))
  done < <(_list_domains)
  echo "    0) 取消"
  echo
  local idx
  printf "  选择要删除的编号: "
  read -r idx
  [ "$idx" = "0" ] || [ -z "$idx" ] && return
  [ "$idx" -ge 1 ] 2>/dev/null && [ "$idx" -le "$cnt" ] 2>/dev/null || { warn "无效编号"; return; }

  local target="${domains_arr[$((idx-1))]}"
  if ! confirm "确认删除域名 $target 并取消其 HTTPS 证书?"; then return; fi

  # 删除 Nginx 配置
  rm -f "$(_domain_conf_name "$target")"

  # 删除证书
  if command -v certbot &>/dev/null; then
    certbot delete --cert-name "$target" --non-interactive &>/dev/null || true
  fi

  _unregister_domain "$target"
  _nginx_reload
  _sync_trust_proxy
  info "已删除域名 $target"
}

cmd_domain_replace() {
  need_root "$0"
  local cnt
  cnt="$(_domain_count)"
  [ "$cnt" -gt 0 ] || { warn "没有已配置的域名，请先添加"; return; }

  say "  已配置域名:"
  local i=1 domains_arr=()
  while IFS= read -r d; do
    domains_arr+=("$d")
    echo "    $i) $d"
    ((i++))
  done < <(_list_domains)
  echo "    0) 取消"
  echo

  local old_idx
  printf "  选择要替换的编号: "
  read -r old_idx
  [ "$old_idx" = "0" ] || [ -z "$old_idx" ] && return
  [ "$old_idx" -ge 1 ] 2>/dev/null && [ "$old_idx" -le "$cnt" ] 2>/dev/null || { warn "无效编号"; return; }
  local old_domain="${domains_arr[$((old_idx-1))]}"

  local new_domain
  printf "  输入新域名: "
  read -r new_domain
  [ -z "$new_domain" ] && { warn "新域名不能为空"; return; }
  _valid_domain "$new_domain" || { warn "域名格式无效"; return; }

  if ! confirm "确认将 $old_domain 替换为 $new_domain?"; then return; fi

  # 删除旧域名配置和证书
  rm -f "$(_domain_conf_name "$old_domain")"
  if command -v certbot &>/dev/null; then
    certbot delete --cert-name "$old_domain" --non-interactive &>/dev/null || true
  fi
  _unregister_domain "$old_domain"

  # 添加新域名
  _ensure_nginx
  _write_nginx_conf "$new_domain"
  _register_domain "$new_domain"
  _nginx_reload
  _sync_trust_proxy
  info "已将 $old_domain 替换为 $new_domain"

  # 申请新证书
  if confirm "为 $new_domain 申请 HTTPS 证书?"; then
    _ensure_certbot
    local email
    printf "  证书接收邮箱 [回车跳过]: "
    read -r email
    local certbot_cmd="certbot --nginx -d $new_domain --non-interactive --agree-tos"
    if [ -n "$email" ]; then
      certbot_cmd="$certbot_cmd -m $email"
    else
      certbot_cmd="$certbot_cmd --register-unsafely-without-email"
    fi
    if eval "$certbot_cmd" &>/dev/null; then
      _nginx_reload
      info "HTTPS 已启用: https://$new_domain"
    else
      warn "证书申请失败，当前使用 HTTP: http://$new_domain"
    fi
  fi
}

# ── 6. 卸载 ─────────────────────────────────────────
cmd_uninstall() {
  need_root "$0"
  if [ ! -f "$APP_DIR/server/app.js" ] && [ ! -f "$ENV_FILE" ]; then
    warn "未检测到已安装的十夜卡密系统"
    return
  fi

  say "${R}══════════════════════════════════════════${RST}"
  say "${R}  ⚠ 卸载十夜卡密(KMGLXT)${RST}"
  say "${R}══════════════════════════════════════════${RST}"
  echo
  warn "此操作将彻底删除："
  say "  - 应用代码与所有数据库: $APP_DIR"
  say "  - 系统配置: $STATE_DIR"
  say "  - systemd 服务: $UNIT"
  say "  - Nginx 域名配置与 SSL 证书"
  say "  - 命令链接: /usr/local/bin/km"
  echo

  if ! confirm "⚠ 确认完全卸载（不可恢复）?"; then
    say "已取消"
    return
  fi
  local check
  printf "  再次确认，请输入 ${R}kmglxt${RST} 以继续: "
  read -r check
  [ "$check" = "kmglxt" ] || { say "已取消"; return; }

  echo
  say "${B}[1/5] 停止服务...${RST}"
  systemctl disable --now "$UNIT" &>/dev/null || true
  rm -f "/etc/systemd/system/$UNIT"
  systemctl daemon-reload &>/dev/null

  say "${B}[2/5] 清理 Nginx 与证书...${RST}"
  if [ -f "$DOMAINS_FILE" ]; then
    while IFS= read -r d; do
      [ -z "$d" ] && continue
      rm -f "$(_domain_conf_name "$d")"
      command -v certbot &>/dev/null && certbot delete --cert-name "$d" --non-interactive &>/dev/null || true
    done < "$DOMAINS_FILE"
  fi
  rm -f "$NGINX_CONFD"/kmglxt-*.conf 2>/dev/null
  nginx -t &>/dev/null && systemctl reload nginx &>/dev/null || true

  say "${B}[3/5] 清理防火墙规则...${RST}"
  if command -v ufw &>/dev/null; then
    ufw delete allow "$PORT/tcp" &>/dev/null || true
    ufw delete allow 80/tcp &>/dev/null || true
    ufw delete allow 443/tcp &>/dev/null || true
  fi
  command -v firewall-cmd &>/dev/null && firewall-cmd --reload &>/dev/null || true

  say "${B}[4/5] 删除命令链接...${RST}"
  rm -f /usr/local/bin/km

  say "${B}[5/5] 清理数据与配置...${RST}"
  rm -f "$ENV_FILE" "$DOMAINS_FILE"
  rmdir "$STATE_DIR" 2>/dev/null || true

  # 最后删除应用目录(脚本自身在此目录内,用后台子进程避免删除运行中的文件)
  local rm_target="$APP_DIR"
  (sleep 1; rm -rf "$rm_target") &
  rm_pid=$!
  disown "$rm_pid" 2>/dev/null || true

  echo
  say "${G}══════════════════════════════════════════${RST}"
  say "${G}  ✔ 十夜卡密(KMGLXT) 已完全卸载${RST}"
  say "${G}══════════════════════════════════════════${RST}"
  echo
}

# ══════════════════════════════════════════════════════
#                     交互主菜单
# ══════════════════════════════════════════════════════
menu() {
  while true; do
    clear 2>/dev/null || true
    say "${C}"
    say "  ┌──────────────────────────────────────┐"
    say "  │      十夜卡密  系统管理菜单          │"
    say "  │      KMGLXT Server Manager           │"
    say "  └──────────────────────────────────────┘"
    say "${RST}"
    echo "    1) 安装（首次部署）"
    echo "    2) 更新（保留现有数据）"
    echo "    3) 查看当前信息"
    echo "    4) 修改账号 / 密码"
    echo "    5) 域名管理"
    echo "    6) 卸载（彻底清除）"
    echo ""
    echo "    0) 退出"
    echo ""
    printf "  请选择 [0-6]: "
    read -r choice
    echo
    case "$choice" in
      1) cmd_install ;;
      2) cmd_update ;;
      3) cmd_info ;;
      4) cmd_auth ;;
      5) cmd_domain_menu ;;
      6) cmd_uninstall ;;
      0) exit 0 ;;
      *) warn "无效选择，请重试"; sleep 1 ;;
    esac
  done
}

# ══════════════════════════════════════════════════════
#                     入口分发
# ══════════════════════════════════════════════════════
usage() {
  cat <<EOF
用法: km [命令]

命令:
  (无参数)        打开交互管理菜单
  install         首次安装部署
  update          更新应用（保留数据）
  info            查看系统信息（含账号密码）
  auth            修改管理员账号/密码
  domain add      添加域名并申请证书
  domain remove   删除域名
  domain replace  更换域名
  domain list     查看域名列表
  uninstall       彻底卸载（不可恢复）
  help            显示本帮助

示例:
  km                        # 交互菜单
  km info                   # 查看当前状态
  km domain add ka.example.com   # 添加域名
EOF
}

case "${1:-}" in
  ''|menu)
    if [ -t 0 ]; then
      menu
    else
      # 非交互环境(如 piped)直接显示信息
      cmd_info
    fi
    ;;
  install)  cmd_install ;;
  update)   cmd_update ;;
  info)     cmd_info ;;
  auth)     cmd_auth ;;
  domain)
    shift
    case "${1:-}" in
      add)     cmd_domain_add ;;
      remove|del) cmd_domain_remove ;;
      replace|change) cmd_domain_replace ;;
      list|ls) cmd_domain_list ;;
      *) usage ;;
    esac
    ;;
  uninstall|remove) cmd_uninstall ;;
  help|-h|--help) usage ;;
  *) err "未知命令: $1"; usage; exit 1 ;;
esac
