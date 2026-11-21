import {
  applyCommand,
  chooseBotCommand,
  createGame,
  projectView,
  type PlayerView,
} from "../v1.ts";

// 修改这里就能尝试另一种人机策略。每个席位只读取自己的可见行动。
function preferExploration(view: PlayerView) {
  return (
    view.actions.find(
      ({ command }) => command.type === "main" && command.action === "explore",
    )?.command ?? chooseBotCommand(view)
  );
}

const players = [
  { id: "scout", name: "勘探队" },
  { id: "coach", name: "原版教练" },
];
let game = createGame(players, { seed: 52 });
while (game.phase !== "finished") {
  const view = players
    .map(({ id }) => projectView(game, id))
    .find((seat) => seat.actions.length);
  if (!view || game.revision > 2000) throw new Error("策略未能结束这局推演");
  const command =
    view.me === "scout" ? preferExploration(view) : chooseBotCommand(view);
  if (!command) throw new Error("当前席位没有可执行指令");
  game = applyCommand(game, view.me, command);
}
for (const score of game.finalScores ?? []) {
  const player = players.find(({ id }) => id === score.playerId)!;
  console.log(`${player.name} · ${score.total} 分`);
}
