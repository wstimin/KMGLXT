# 1Panel 安装

## 1. 准备运行环境

在“运行环境”中创建 Node.js 24 环境。创建应用目录 `/opt/kmglxt-panel`，从 GitHub Releases 下载并解压最新 `KMGLXT-v*-panel.tar.gz`。面板专用包已经包含生产依赖，不需要进入主机终端执行 `npm install`。

## 2. 创建 Node 网站

- 运行目录：`/opt/kmglxt-panel`
- 启动命令：`node server/app.js`
- 服务端口：1111
- 开启异常退出后自动重启
- 运行用户需要对应用目录和 `server/data` 有写权限

环境变量：

```text
NODE_ENV=production
PORT=1111
DATA_DIR=/opt/kmglxt-panel/server/data
TRUST_PROXY=1
DEPLOY_MODE=1panel
WEB_UPDATE_RESTART=1
```

## 3. 网站、HTTPS 与网页安装

创建反向代理网站，代理到 `http://127.0.0.1:1111`，域名和 HTTPS 证书由 1Panel 管理。不要运行 `km domain`。

打开绑定的域名，系统会自动进入安装向导。在页面中填写站点名称、超级管理员账号和密码，点击“完成安装并进入后台”即可。安装完成后安装入口自动关闭。

完成后，后台“部署与更新”页面可以显示 GitHub Release 新版本并执行更新。更新会先备份数据库，完成后退出 Node 进程，由 1Panel 的运行环境自动拉起。
