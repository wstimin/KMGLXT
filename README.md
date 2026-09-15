# 十夜卡密 · 综合性卡密管理系统

> 全局统一卡池 · 一卡通用 · 单次核销 · 多项目接管
> 系统(`KMGLXT`)只负责**卡密存储与管理 + 对外验卡 API**,不做商城/支付——卡在外部平台售卖

## 目录
- `server/` Node.js 24 + Express 后端(`node:sqlite` 单文件数据库,零原生依赖)
- `web/` Vue3 + Vite + Element Plus 前端(「水晶玻璃·光晕蓝紫」主题)
- `docs/` 对外对接手册 + SDK 示例(PHP / Node / Python / curl)
- `deploy/` 一键安装脚本 `km.sh` + systemd 模板 + 部署说明
- `方案.md` 精简方案 · `规划书.md` 完整规划书

## 对外验卡 API
后台「项目管理」创建项目并领取 `app_key / app_secret`,对方网站请求 `POST /api/v1/card/*`(HMAC-SHA256 签名 + 时间戳 + nonce 防重放)。
签名算法、六个接口说明、回调格式与错误码:见 [`docs/对接文档.md`](docs/对接文档.md)。SDK:`docs/sdk/`。

## 服务器一键安装(推荐)

> 需要一台 Linux 服务器(Debian/Ubuntu/CentOS/RHEL/Rocky),全程交互,**不添加域名也能用**(通过 `IP:端口` 访问与对接)。

```bash
# 首次安装只需一次性获取脚本并运行:
curl -fsSL https://raw.githubusercontent.com/wstimin/KMGLXT/main/deploy/km.sh -o km.sh
sudo bash km.sh        # 打开交互菜单 → 选 1) 安装

# 安装完成后,系统命令:
km                      # 随时调出管理菜单
km info                 # 查看系统信息(含管理员账号密码)
km update               # 更新应用(自动备份数据库,保留现有数据)
km auth                 # 修改管理员账号/密码
km domain add ka.example.com   # 添加域名并申请 HTTPS 证书
km domain remove ka.example.com # 删除域名
km domain replace       # 更换域名
km uninstall            # 彻底卸载(删除全部数据)
```

安装向导:

| 步骤 | 说明 |
|---|---|
| 系统依赖 | curl / git / openssl 等 |
| Node.js | 自动安装 v24(NodeSource,失败自动回退官方二进制) |
| 拉取代码 | `git clone` 到 `/opt/kmglxt` |
| 依赖 + 构建 | `npm run setup` + 前端构建 |
| 初始化 | 自动生成随机强度管理员密码,**仅存本地 `600` 权限文件**(库里只存 bcrypt 哈希) |
| systemd | `kmglxt.service`,开机自启、崩溃自动拉起 |
| 防火墙 | 自动放行 1111 / 80 / 443 |
| 域名(可选) | 添加域名 → Nginx 反代 → 自动申请 Let's Encrypt 证书 |

## 快速开始(开发机)

```bash
# 1. 安装依赖(后端 + 前端)
npm run setup

# 2. 初始化数据库并创建超管(必须用环境变量提供凭据,不用默认弱口令)
ADMIN_USER=你的用户名 ADMIN_PASS=你的密码 npm run init-db

# 3. 构建前端
npm run build

# 4. 启动服务(默认 http://localhost:1111)
npm start
```

前端开发模式(热更新):另开终端 `npm run dev:web`,Vite 已代理 `/api` 到 1111 端口。

## 环境变量(可选)

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 1111 | 服务端口 |
| `DATA_DIR` | `server/data` | 数据库与密钥存放目录 |
| `JWT_SECRET` | 自动生成并持久化 | 登录令牌密钥 |
| `TRUST_PROXY` | 0 | 置 1 后来源 IP 取 `X-Forwarded-For`(配了域名反代时由 `km` 自动置 1) |
| `ADMIN_USER` / `ADMIN_PASS` | 无默认 | `init-db` 创建超管时使用;未设置且库中无管理员会**明确报错**,不再有默认弱口令 |

> 已安装的服务(km 方式部署)这些变量由 `/etc/kmglxt/env` 管理,不要手动改环境。

## 运维命令

| 操作 | 命令 |
|---|---|
| 查看服务状态 | `systemctl status kmglxt` |
| 查看日志 | `journalctl -u kmglxt -f` |
| 手动备份数据库 | 后台「系统设置 → 数据与备份」或 `node server/scripts/db-backup.js <路径>.db` |
| 修改账号密码 | `km auth` 或后台侧边栏 |

## 当前进度
- [x] P1 骨架:建库建表、管理员登录/锁定、水晶玻璃 UI 主题、登录页、主框架、系统设置
- [x] P2 核心:全局卡池、批量生成、套餐、导入导出、批量状态操作、核销流水
- [x] P3 接管:项目管理 + app_key/app_secret、对外验卡 API(HMAC 签名/防重放/限频)、核销流水、激活回调、SDK 示例与对接手册
- [x] P4 打磨:图表动效、备份恢复、部署上线、一键安装与管理脚本 `km`