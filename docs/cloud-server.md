# 106.52.74.24 云端运行

后续更新先完成本地验证、递增版本并推送 GitHub，由用户本地试玩并明确确认对应版本上线后，再执行本文的更新操作。GitHub 检查不触发部署，详见 [发布流程](release.md)。

游戏入口：[http://106.52.74.24](http://106.52.74.24)。朋友在桌面浏览器打开，创建房间后分享邀请链接或六位房间码。房主可在“邀请朋友 → 人机同行”安排人机席位；实操教程在顶部“实操练习”中打开。

部署采用 Ubuntu 24.04、Docker Compose、Node.js 24 和 Caddy。项目位于 `/home/ubuntu/nomad-city`，已部署的手机棋桌版本位于 `/home/ubuntu/nomad-city-releases/20261015-mobile`，对应提交 `5714a5b`。数据库与备份分别保存于 `nomad-city_game-data`、`nomad-city_game-backups` 卷；更新和重启沿用这些卷。游戏容器以 UID 1000 运行，内部端口 3000 由 Caddy 代理。Docker 已设置开机启动，两项服务均设置 `unless-stopped`。

本次入口配置：

```dotenv
GAME_DOMAIN=106.52.74.24
GAME_SCHEME=http
```

云端另将 `compose.ip-https.yaml` 复制为 `compose.override.yaml`，默认 `docker compose` 管理命令会自动加载 HTTP/HTTPS 双入口。Caddy 使用 `deploy/Caddyfile.ip-https`，IP 证书已由 Let's Encrypt 签发并通过本机信任链验证，续期由持久化 Caddy 数据卷管理。`default_sni` 为不发送 IP SNI 的客户端选择正确证书。

2026-10-15 发布验收时：公网 80 可用，443 连接超时；主机 UFW 和 Docker 已允许 443，需要在云控制台为本实例放行入站 TCP 443，来源 `0.0.0.0/0`。放行后外网验证 `https://106.52.74.24/api/health`，无需跳过证书校验。本机验证可执行 `curl --resolve 106.52.74.24:443:127.0.0.1 https://106.52.74.24/api/health`。HTTP 原房间继续使用原协议恢复，两个协议的浏览器席位存储独立。

主机已启用 UFW，仅允许 22/80/443；fail2ban 使用 systemd SSH 日志，10 分钟内 5 次失败登录封禁 1 小时。容器使用只读根目录、能力与资源限制，游戏端口不发布。详细限额与上游防护范围见 [安全说明](../SECURITY.md)。

有域名后，在 DNS 中指向此 IP，将 `.env` 改为域名和 `GAME_SCHEME=https`，执行 `sudo docker compose up -d`。Caddy 与 WebSocket 来源会一起切换。浏览器按网址保存席位凭证；IP 地址和新域名的凭证分别保存。

## 管理服务

本机项目目录中使用已有的专用 SSH 配置：

```powershell
ssh -F .data/private/ssh/config nomad-city-cloud
```

登录后：

```sh
cd /home/ubuntu/nomad-city
sudo docker compose ps
sudo docker compose logs --tail 100 game caddy
curl -fsS http://106.52.74.24/api/health
```

只重启游戏：

```sh
sudo docker compose restart game
```

暂停入口或恢复入口：

```sh
sudo docker compose stop caddy
sudo docker compose start caddy
```

## 备份与更新

游戏运行期间每 24 小时创建一次在线 SQLite 备份。升级前手动备份：

```sh
sudo docker compose exec -T game node tools/backup.ts
sudo docker compose cp game:/app/backups ./exported-backups
sudo chown -R ubuntu:ubuntu ./exported-backups
chmod -R go-rwx ./exported-backups
```

本机另开终端，将备份保存到服务器之外：

```powershell
scp -F .data/private/ssh/config -r nomad-city-cloud:/home/ubuntu/nomad-city/exported-backups .data/cloud-backups
```

制作新包使用 `pnpm package:deploy`，上传到新的发布目录，核对 `.sha256`，再解压到项目目录并运行 `sudo docker compose up -d --build`。保留 `.env`、命名卷与上一版发布包。在线备份、恢复及域名配置的完整步骤见 [公网部署说明](deployment.md)。

本地数据库与云端数据库分别运行；本地原有房间继续通过原入口访问，云端创建的新房间使用此公网入口。
