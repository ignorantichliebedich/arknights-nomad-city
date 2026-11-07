# 项目展示截图

这些画面由 `tools/capture-readme.ts` 从本地生产构建拍摄，用于 GitHub 项目介绍。脚本启动独立内存服务，使用虚构昵称和演示席位；结束后关闭服务，不读取玩家数据库。截图中的 `DEMO26`、`DEMO28` 是演示房间码。

| 文件              | 内容                 |
| ----------------- | -------------------- |
| `home.jpg`        | 游戏首页与四位企业家 |
| `table.jpg`       | 四人棋桌与扇形手牌   |
| `enterprises.jpg` | 企业合作档案         |
| `oripathy.jpg`    | 感染者企业家选择     |
| `practice.jpg`    | 影响力部署实操课     |

画面以 1600×900 拍摄，直接由浏览器输出 JPEG，便于仓库首页加载；原始牌面、图像和音频继续保留在忽略目录。文件大小与 SHA-256 见 [manifest.json](manifest.json)。

重新拍摄前先准备运行素材、执行 `pnpm build`，然后运行 `node tools/capture-readme.ts`。本机优先使用 `.data/browsers/chrome-win64/chrome.exe`，其他环境使用 Playwright Chromium。

图片展示的是项目界面。画面中《明日方舟》《游城拓荒》的原有美术及标识权利归鹰角网络与各自权利人；截图不改变这些素材的许可。来源详见 [第三方说明](../../THIRD_PARTY_NOTICES.md)及素材清单。
