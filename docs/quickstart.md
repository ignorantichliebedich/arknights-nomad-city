# 本地运行与开发

[返回项目首页](../README.md) · [棋桌操作](how-to-play.md) · [发布流程](release.md)

以下命令均在项目根目录运行。运行图像与音频按清单单独获取，Git 仓库中的展示截图不代替这些素材。

需要 Node.js 24.14 或更新的 24.x、pnpm 11。

```powershell
pnpm install --frozen-lockfile
pnpm assets:restore
pnpm assets:check
pnpm build
pnpm start
```

打开 <http://localhost:3000>，选择窗口或全屏进入，点击“开始拓荒”后输入昵称并创建房间。朋友可通过联机大厅、邀请链接或六位房间码入座。全部玩家准备后，房主开始拓荒。企业配置在建房时选择。标题素材的原图与重建方式见 [首页视觉记录](../assets/entry-art-direction.md)。

公开仓库包含源码、规则数据和素材来源清单。运行图像与操作音效由 `assets:restore` 按 SHA-256 获取到本地，背景音乐由 `music:import` 从开发者本地 `music/` 导入；原始研究扫描及历史截图保存在开发者本地。持有音乐原件时另行执行 `pnpm music:import` 与 `pnpm music:check`；音乐不是运行规则与联机的前提。可设置 `ASSET_BASE_URL` 使用自己维护的素材源；素材权利见 [第三方说明](../THIRD_PARTY_NOTICES.md)。

开发版新增素材可直接从原始公开来源重建：先安装 `tools/requirements.txt` 并运行 `python tools/prepare-table-experience.py`，再使用 `pnpm voices:acquire` 获取中日语音，最后执行 `assets:restore` 校验其余已发布素材。当素材源还不包含新增文件时，可以使用这条重建路径。语音采集通过 HTTP 读取公开索引，需要 Node.js 与 FFmpeg，音乐封面提取也使用 FFmpeg；可通过 `FFMPEG_PATH` 指定程序路径。测量参数和出处见 [棋桌素材记录](../assets/table-experience-art.md)。

首页标题和感染者素材的来源重建命令如下；正常恢复素材成功时无需重复执行。各步骤的来源与校验方式见 [首页视觉记录](../assets/entry-art-direction.md)和[感染者配件](oripathy.md#配件与素材)。

```powershell
python -m pip install -r tools/requirements.txt
python tools/prepare-title-glyphs.py
python tools/research-oripathy.py
python tools/import-oripathy.py
pnpm assets:check
```

另一台 Windows 电脑可使用预编译运行包：在开发电脑运行 `pnpm package:windows`，将生成的 `.data/releases/nomad-city-windows.zip` 复制过去完整解压。目标电脑安装 Node.js 24 后，双击 `start-game.cmd` 启动；运行素材和服务端依赖已随包提供。局域网、隧道、配置检测及备份操作见 [Windows 运行说明](../deploy/windows/START-HERE.txt)。

局域网朋友访问 `http://房主电脑的局域网IP:3000`。服务默认监听 `0.0.0.0`。Windows 可使用 `ipconfig` 查看局域网 IPv4 地址；如系统防火墙询问，允许该服务在私人网络上连接。所有人应使用固定的同一个主机地址，浏览器的席位凭证按站点保存在本地。

开发使用单一命令 `pnpm dev`，打开 <http://localhost:5173>。该命令同时运行规则服务及 Vite。生产启动只需要 3000 端口。

## 验证

```powershell
pnpm check
pnpm test
pnpm assets:check
pnpm build
pnpm exec playwright install chromium firefox
pnpm browsers:prepare
pnpm test:e2e
```

浏览器项目覆盖 Chromium、系统 Microsoft Edge 和 Firefox，分辨率为 1920×1080 与 1366×768。整局测试同时验证服务端状态重放和实际浏览器 WebSocket 同步，自动对局属于回归验收，朋友试玩按 [验收记录](acceptance.md) 执行。

容量复测使用 `pnpm load:test --tables 1,4,8,16,32 --seconds 30`，工具自动创建独立服务与合成数据库，结果保存到私有 `.data/load-tests/`。云端常规负载、同步盖牌高峰、压缩对照及建议容量见 [承压测试报告](capacity-test.md)；`pnpm load:test --help` 查看参数。正式服务器压测需单独授权，不随 CI 或发布自动运行。

安装 Playwright 浏览器需要网络；Edge 项目需要本机安装 Microsoft Edge。测试使用独立临时数据库和 3011 端口，不修改试玩数据库。

## 备份与恢复

已部署的云端入口：[http://106.52.74.24](http://106.52.74.24)，管理与备份步骤见 [云端运行](cloud-server.md)。本地房间与云端房间分别保存。

公网开服的选购、上传、安装、HTTPS、备份和停服步骤见 [公网部署说明](deployment.md)。本地运行 `pnpm package:deploy` 生成可上传的部署包和 SHA-256 校验文件。

运行服务每 24 小时创建 SQLite 在线备份，默认保留最近 7 份自动备份，手动备份单独保留。公网防护、连接限制与运维边界见 [安全说明](../SECURITY.md)。也可手动执行：

```powershell
pnpm backup
```

备份包含房间、完整对局状态、等待选择、随机状态、操作日志及指令回执。客户端的席位凭证仍由各玩家原浏览器保管。

恢复时先在服务终端按 `Ctrl+C` 停止服务，将 `nomad-city.sqlite`、同名 `-wal`、`-shm` 文件一起移入单独的留存目录，再将选定的备份复制为 `.data/state/nomad-city.sqlite`。启动 `pnpm start`，通过健康检查和原房间核对版本、阶段与日志。保留恢复前数据库及备份，避免覆盖唯一存档。容器恢复步骤见 [部署说明](deployment.md)。

## 结构

| 目录                  | 内容                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `packages/rules/src/` | 独立、可序列化的规则状态机；配件数据、合法行动、指令执行、玩家投影和计分 |
| `apps/server/src/`    | HTTP、WebSocket、席位验证、房间串行执行、SQLite 与备份                   |
| `apps/web/src/`       | React 界面、原图背景与 SVG 交互层、卡牌、城市和日志                      |
| `assets/`             | 配件目录与素材来源、处理参数、SHA-256 清单                               |
| `tests/`              | 规则、卡牌、服务恢复及浏览器验收                                         |
| `tools/`              | 开发启动、备份、公开资料读取、素材归一化及校验                           |
| `deploy/`             | Caddy 配置；根目录另有 Dockerfile 与 Compose                             |

已归一化素材随项目运行目录提供，启动游戏不需要重新下载。重建素材使用 `python -m pip install -r tools/requirements.txt`，依次运行 `tools/research.py`、`tools/extract-tabletop.py`、`tools/import-assets.py`、`tools/prepare-hd-assets.py`、`tools/prepare-table-motion-assets.py`、`tools/prepare-fan-assets.py`，再运行 `pnpm assets:catalog` 和 `pnpm assets:check`。资料脚本只读取公开内容，不执行模组里的 Lua 脚本。

项目用于朋友私人试玩。原画及桌游素材权利归原作者；公开下载地址本身不构成素材再分发授权。出处及处理记录保存在 `assets/manifest.json`。
