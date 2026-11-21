# 自制你的拓荒人机

从这份示例开始，可以写一个偏爱探索的对手，让它和原版教练在本地完成八回合，再比较得分。只需 Node.js 24.14 或以上的 24.x 版本和本分支源码。示例在内存中运行，无需启动游戏服务或下载美术素材。

在仓库根目录运行：

```sh
node packages/diy/examples/explorer.ts
```

打开 [勘探队示例](../packages/diy/examples/explorer.ts)，在 `preferExploration` 里将 `"explore"` 改为 `"build"`，就能试验优先建设的策略。保留 `seed: 52` 可重复使用同一开局。

## 本地 TypeScript 接口

从 [v1 入口](../packages/diy/v1.ts) 导入函数和类型。

| 接口 | 用途 |
| --- | --- |
| `createGame(players, config)` | 创建 2–4 人的初始局面，可指定种子和扩展。 |
| `projectView(game, playerId)` | 获取该席位可见的棋桌和合法行动。将这个视图传给策略函数。 |
| `chooseBotCommand(view)` | 采用内置策略选择行动，可作为自制策略的默认选择。 |
| `applyCommand(game, playerId, command)` | 校验并返回下一局面。每次行动后重新获取席位视图。 |

示例展示了如何处理多人同时选牌和采集：每步寻找有合法行动的席位，再从该席位的 `view.actions` 选指令。对局结束时，`game.finalScores` 包含各席位的计分结果。

这套接口供玩家在本地或自有分支运行。希望把玩法带入主项目，可以在首页「拓荒信箱 → DIY 灵感」留下规则、示例或作品链接。
