# 公网部署与恢复

使用一台 Linux 服务器运行游戏和 SQLite，Caddy 提供网页与 WebSocket 入口。域名使用 HTTPS；公共 IP 可使用 IP 证书配置，也保留 HTTP 入口。玩家打开固定网址，创建房间并分享房间码；每局支持 2–4 人，可以同时存在多个房间。客户端无需安装软件。

## 1. 准备服务器和域名

建议从按月计费的 **2 核、2 GB 内存、40–60 GB SSD、公共 IPv4、Ubuntu 24.04 LTS** 开始，供小规模公开试玩。地区可选香港或新加坡，购买前让不同运营商的朋友测试厂商提供的线路。2 GB 是起步配置；同时对局数需要根据实际负载确定，不能由单局人数推算。高清图片的首次加载也会消耗服务器流量，购买时检查流量额度、超额单价和续费价格。

价格参考（2026-10-14）：[AWS Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) 的公共 IPv4、2 核、2 GB、60 GB Linux 套餐为 **12 美元/月**，流量额度随地区不同；[Porkbun](https://porkbun.com/products/domains) 普通 `.com` 域名注册和续费均为 **11.08 美元/年**。按预算汇率 1 美元 = 7.2 元估算，约 86 元/月加 80 元/年，合计约 1,120 元/年，另计税费、汇率变化及超额流量。HTTPS 由 Caddy 自动申请和续期，无需购买证书。

在云厂商安全组开放 TCP 80、443 给所有访客，TCP 22 只允许你的管理来源。游戏的 3000 端口由 Compose 留在内部网络。购买服务器时配置 SSH 公钥，用 SSH 或厂商控制台登录。

在域名控制台添加一条 DNS 记录，例如：

| 类型 | 主机记录 | 值                    |
| ---- | -------- | --------------------- |
| A    | `game`   | 服务器的固定公共 IPv4 |

若主域名是 `example.com`，游戏网址就是 `https://game.example.com`。把域名的 A 记录设为固定 IP，并确认解析生效；仅在服务器确实支持并开放 IPv6 时配置 AAAA 记录。第一轮部署使用直接 DNS 解析，随后再评估 CDN。

## 2. 制作并上传部署包

在本地项目目录运行：

```powershell
pnpm package:deploy
```

从公开仓库克隆后先执行 `pnpm install --frozen-lockfile`、`pnpm assets:restore`、`pnpm assets:check`，再打包，确保运行素材已按清单还原。

输出 `.data/releases/nomad-city-deploy.tar.gz` 和同名 `.sha256` 文件。部署包包含代码、运行素材、Docker/Caddy 配置和本说明，云端构建前端。它通过明确的文件清单打包，不包含本地对局数据库、备份、`.env`、依赖和资料下载缓存。

下面的 `SERVER_IP`、`ubuntu` 是占位符，替换为实际 IP 和 SSH 用户；SSH 已配置名称时也可使用该名称。

```powershell
scp .data/releases/nomad-city-deploy.tar.gz .data/releases/nomad-city-deploy.tar.gz.sha256 ubuntu@SERVER_IP:~/
ssh ubuntu@SERVER_IP
```

以下命令均在服务器的 Linux 终端执行：

```sh
sha256sum -c nomad-city-deploy.tar.gz.sha256
mkdir -p ~/nomad-city
tar -xzf ~/nomad-city-deploy.tar.gz -C ~/nomad-city
cd ~/nomad-city
```

## 3. 安装 Docker 并启动

新装 Ubuntu 可以执行项目内的安装脚本，它使用 [Docker 官方 apt 仓库](https://docs.docker.com/engine/install/ubuntu/) 安装 Engine 和 Compose 插件；已有 Engine 与 Compose 时会显示版本并退出。其他 Linux 发行版按照对应的官方安装说明操作。

```sh
sudo bash deploy/install-docker-ubuntu.sh
cp .env.example .env
nano .env
```

把 `.env` 的域名改为自己的域名，填写主机名即可，例如：

```dotenv
GAME_DOMAIN=game.example.com
GAME_SCHEME=https
```

只有 IP 时，例如本次服务器，可以先配置：

```dotenv
GAME_DOMAIN=106.52.74.24
GAME_SCHEME=http
```

对应入口为 `http://106.52.74.24`，检查地址为 `http://106.52.74.24/api/health`。配置中的网页和 WebSocket 来源会同时切换为 HTTP；游戏端口 3000 仍仅在容器网络内开放。之后接入域名时修改这两个变量并执行 `sudo docker compose up -d`，新网址的席位凭证由浏览器分别保存。

为 IP 启用可信 HTTPS，可将 `compose.ip-https.yaml` 复制为 `compose.override.yaml` 后按下方步骤启动。配置使用 Caddy 2.11 的 Let's Encrypt `shortlived` IP 证书，自动续期，并保留旧 HTTP 房间入口。云防火墙和主机同时放行 TCP 80/443；`default_sni` 支持不发送 IP SNI 的浏览器。详细存档与防护边界见 [安全说明](../SECURITY.md)。

保存后启动：

```sh
sudo docker compose config --quiet
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail 100 game caddy
curl -fsS https://game.example.com/api/health
```

最后一条命令的域名也要替换。DNS 和端口就绪后，Caddy 自动申请 HTTPS 证书，并代理 WebSocket。健康接口返回 `status: "ok"`、规则版本、房间数量和运行时间。首次拉取镜像和构建需要等待；`game` 应显示健康状态。

用两个不同浏览器打开最终 HTTPS 地址，创建房间、加入、准备并开局，做一次行动后刷新。再让一位朋友使用外部网络重复加入流程。所有玩家始终使用同一个域名，席位凭证按站点保存在各自浏览器中；原来 localhost 或局域网的凭证不会自动迁移到新域名。

## 4. 运行、备份与更新

游戏以非 root 用户运行，`game-data` 卷保存 SQLite，`game-backups` 卷保存在线备份；证书另有持久化卷。服务连续运行时每 24 小时自动生成备份，默认保留最近 7 份自动备份；上线当天和升级前手动备份一次，手动备份独立保留。Docker 日志已配置轮转，每个服务最多保留约 30 MB。

```sh
sudo docker compose logs --tail 100 game
sudo docker stats --no-stream
sudo docker compose exec -T game node tools/backup.ts
sudo docker compose cp game:/app/backups ./exported-backups
```

在本地另开终端，把备份带出服务器：

```powershell
scp -r ubuntu@SERVER_IP:~/nomad-city/exported-backups ./cloud-backups
```

数据库和每日备份会随对局数量增长，定期检查磁盘并将旧备份归档到服务器外。暂存于同一台机器的备份不能应对整台服务器丢失。

更新时保留旧部署包及其校验文件，先备份，在无人在行动的时间上传并解压新包，再执行 `sudo docker compose up -d --build`。服务重建期间浏览器会断开连接，随后按原网址恢复。规则版本变化的存档需使用对应版本继续。

暂停公开访问：

```sh
sudo docker compose stop caddy
```

恢复公开访问：

```sh
sudo docker compose start caddy
```

停服并保留存档：

```sh
sudo docker compose stop
```

## 5. 恢复演练

1. 记录规则版本和选定备份路径，保留对应版本代码或容器。
2. 执行一次在线备份，并导出至服务器以外的位置。
3. 执行 `sudo docker compose stop game`。
4. 使用挂载游戏数据卷的临时工具容器，将现有数据库及同名 `-wal`、`-shm` 文件移入留存目录，再将选定备份复制为 `/app/data/nomad-city.sqlite`。保留恢复前数据库。
5. 执行 `sudo docker compose start game`，确认健康检查通过。
6. 从玩家原浏览器打开原房间，核对轮次、待选择玩家、状态版本和最后几条日志。

SQLite 采用单实例部署。增加服务器副本前，需要调整房间锁和存储架构。

## 常见问题

- **证书申请失败：**检查 A/AAAA 记录、服务器安全组的 80/443，以及其他服务是否占用这些端口；查看 `caddy` 日志。
- **能打开网页但连接不上房间：**用最终 HTTPS 域名访问，检查 `/ws` 的 WebSocket 连接；`GAME_DOMAIN` 与实际访问域名要一致。
- **同一席位在另一页打开：**只保留一个活动标签页，原页会收到席位转移提示。
- **镜像拉取或 npm 安装失败：**检查服务器是否能访问 Docker Hub 和 npm 仓库，再重新构建。
- **多人频繁被限流：**本配置通过唯一的 Caddy 入口按玩家来源计算限额。不要直接发布 3000；如果另外加入 CDN，需要同时调整代理来源配置。

## 环境变量

| 变量              | 默认或用途                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `HOST`            | `0.0.0.0`                                                                         |
| `PORT`            | `3000`                                                                            |
| `DATABASE_PATH`   | 本地 `.data/state/nomad-city.sqlite`；容器 `/app/data/nomad-city.sqlite`          |
| `BACKUP_DIR`      | 本地 `backups`；容器 `/app/backups`                                               |
| `ALLOWED_ORIGINS` | 逗号分隔的允许来源；Compose 设为与 `GAME_SCHEME`、`GAME_DOMAIN` 一致的网址          |
| `TRUST_PROXY`     | 默认关闭；Compose 在 3000 仅能经内部代理访问时设为 `true`，信任单层代理的来源地址 |
| `GAME_DOMAIN`     | Compose/Caddy 使用的域名或公共 IP，只填主机名或 IP                                 |
| `GAME_SCHEME`     | 默认 `https`；公共 IP 的 HTTP 试玩入口设为 `http`                                 |

注：公网证书、线路和 Docker 运行效果在目标服务器上验收；本机生成部署包并执行代码验证。套餐与域名价格以购买页面为准。
