# 扇形棋桌素材与交互记录

2026-10-14。桌面浏览器使用暖褐色荒野背景、原版卡牌和浅色资源盘；实际地图保留高分辨率原扫描，棋子和路径由 SVG 绘制。

| 运行文件（相对项目根） | 来源与处理 |
|---|---|
| `apps/web/public/assets/nomad-table-backdrop.webp` | [《铸基者》官网 PV 背景](https://web.hycdn.cn/arknights/boardgame_nomadcity/_next/static/media/pv-bg.8156ad94.jpg)，800×450，保持完整构图；CSS 降低透明度、饱和度和亮度，34 秒缓慢漂移 |
| `apps/web/public/assets/terrain-margin-v1.webp` | 内置 imagegen 参考原三人棋盘生成的纯地形，用于清理印刷装饰后的空缺；生成图原文件归档 `.data/sources/generated/terrain-margin-v1.png` |
| `apps/web/public/assets/board-mask-3.svg`、`board-mask-4.svg` | 1000×1000 坐标遮罩，仅去除金属边框、回合/终局纸片和底部名称。边界轻微羽化。原道路、资源点、航道及规则坐标保持原扫描及规则数据 |
| `apps/web/public/assets/role-back.webp` | [公开桌游数字化资料中的角色牌背](https://steamusercontent-a.akamaihd.net/ugc/2490002538882613072/D28A381BADD5629CBA56EA18366B3E34F3D3EE75/)，用于确认后的翻面和已盖放提示 |

生成方式：**内置 imagegen**，调用 `exec-e04f6d70-dd70-4491-ab1e-d8db2ed10b64`，参考图为 `.data/sources/art/board-3.png`，非透明输出。生成地形只承担边角表现；卡牌、道路、费用和规则均独立于补绘图。

完整生成提示：

> Use case: precise-object-edit. Asset: terrain underlay for a browser tabletop game. Edit the supplied Nomad City board image into a clean, uninterrupted, square overhead terrain painting. Remove ALL board-game graphics: the metal frame around every edge, score numbers, paper reference sheets at the top left, title/logo, text, city rectangles, triangular markers, cream roads and dashed lines. Reconstruct natural rocky terrain in their places, closely matching surrounding original texture and colors. Keep the broad landscape composition unchanged: dusty red-brown rocky plateau on left third, pale gray ravines and fissures across center and right, small golden-orange glowing mineral outcrops, muted sage ground near bottom. Orthographic top-down camera, same detailed printed-board terrain style, no horizon or perspective. Seamless continuous terrain up to every edge; no borders, no UI, no words or numbers, no new structures or people. Preserve natural visible terrain texture, lighting and geographic arrangement. High resolution square output. This will only show in thin map-margin cutouts beneath the untouched original gameplay map, so the original terrain alignment and quiet detail are crucial.

素材归一化脚本：`tools/prepare-fan-assets.py`。WebP 编码质量 95，原始生成图与下载图均保留；运行文件出处、处理方式和 SHA-256 记录在 `assets/manifest.json`。原画权利归原作者，使用范围沿用项目私人好友试玩约定。

## 棋子与交互

- 大总统：原图制作 CSS 立体立牌，7 层厚度、圆形金属底座、轻微绕 Y 轴转动，桌面显示约 132–155 像素高；侧边席位另用 47 像素标识。此项为原图立牌建模。
- 影响力：共享等距几何，四层台座/柱身/顶盖、金属边沿、各玩家颜色与符号。可移动时具备键盘和指针入口。
- 资源：地图标记改为原版资源图标与数字，不再用缩写文字代替图像；可访问名称保留资源名和数量。
- 扇形手牌：卡牌不裁剪重要牌面，动态间距容纳普通角色和罗德岛角色；确认前只有本地预览，服务端确认后播放翻面。对手依然只得到手牌数量和规则允许公开的信息。
- 影响力拖动：`projectView().influenceMoves` 从裁定模块生成合法起终点；用户确认一次后依次提交原有主要行动、起点和终点指令，每一步检查新版本、待选类型和精确选项。刷新不恢复客户端指令队列，保留服务端等待选择。
- 减少动态效果：关闭背景漂移、立牌转动、翻牌、数字与棋子位移动画，保留明确的选择与确认状态。

操作提示与企业家共用定位容器，位于半身立绘上方。立绘宽度按棋盘左右实际空白计算；顶部单行栏高 38 像素。底部收起的扇面仅露出牌头，选牌时展开覆盖地图下沿，收起后恢复地图操作空间。
