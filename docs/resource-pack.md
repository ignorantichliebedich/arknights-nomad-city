# 游戏资源包

开场动画结束后，页面检查浏览器里的资源包版本。首次使用或资源已更新时，点击「下载资源包」，在窗口中选择 GitHub、百度网盘或夸克网盘。下载后回到游戏页面点击「导入 ZIP」，选择原文件。已提前拿到同一份 ZIP 时，可直接导入。

ZIP 在本机校验并保存到网站的 IndexedDB。使用同一浏览器和同一网址时可以在刷新或重启后继续使用。换浏览器、切换 IP 或域名、从 HTTP 换到 HTTPS、清除网站数据后，回到对应网址重新导入即可。联机仍由服务器同步。

## 构建和分发

1. 准备本地运行素材，执行 `pnpm resource-pack:export`。ZIP 和 SHA-256 校验文件保存在忽略目录 `.data/releases/resource-packs/`。
2. 将同一份 ZIP 原样上传到有权分发的目的地。已发布的 ZIP 校验值匹配时，游戏自动使用对应的 GitHub Release 地址。用 `NOMAD_RESOURCE_PACK_GITHUB_URL`、`NOMAD_RESOURCE_PACK_BAIDU_URL`、`NOMAD_RESOURCE_PACK_QUARK_URL` 可配置对应的 HTTPS 链接。需要提取码时设置 `NOMAD_RESOURCE_PACK_BAIDU_CODE` 或 `NOMAD_RESOURCE_PACK_QUARK_CODE`。窗口把这些分享信息展示给玩家。
3. 将这些变量写入项目根目录的本地 `.env`，或传给 Docker Compose 构建。游戏构建仅生成版本、大小及下载链接清单，ZIP 由外部站点提供。发布前核对三个链接下载的文件与导出的 SHA-256 一致。

只修改代码或分享地址时，只要包内容不变，浏览器可继续使用已安装的资源包。
