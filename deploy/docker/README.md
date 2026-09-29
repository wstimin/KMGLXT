# Docker 部署

Docker 部署与 `deploy/km.sh` 一键安装互不依赖。数据只保存在宿主机 `./data` 目录中，升级容器不会覆盖数据库。

```bash
mkdir -p kmglxt && cd kmglxt
curl -fsSLO https://raw.githubusercontent.com/wstimin/KMGLXT/main/compose.yaml
printf 'TRUST_PROXY=0\n' > .env
docker compose up -d
```

浏览器访问 `http://服务器IP:1111`，首次访问会自动进入安装向导，在页面中创建管理员。如果使用宝塔或 1Panel 反向代理，请把 `.env` 中的 `TRUST_PROXY` 改为 `1`。

更新镜像：

```bash
docker compose pull
docker compose up -d
```

后台“部署与更新”页面会提示新版本并显示这条更新命令。出于主机安全考虑，容器不会挂载 Docker Socket，也不会从容器内部控制宿主机 Docker。
