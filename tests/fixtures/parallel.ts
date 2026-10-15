import {
  applyCommand,
  createGame,
  projectView,
  routeTo,
} from "../../packages/rules/src/engine.ts";
import type { GameState } from "../../packages/rules/src/types.ts";

export function rolePlanning(
  count = 4,
  seats?: { id: string; name: string }[],
) {
  let game = createGame(
    seats ??
      Array.from({ length: count }, (_, i) => ({
        id: `p${i}`,
        name: `企业家${i}`,
      })),
    { seed: 52 },
  );
  for (let i = 0; i < 100 && game.parallel?.kind !== "select-role"; i++) {
    const d = game.decision!;
    game = applyCommand(game, d.playerId, {
      type: "choose",
      optionId: d.options[0].id,
    });
  }
  if (game.parallel?.kind !== "select-role")
    throw new Error("Role planning fixture did not start");
  return game;
}

export function chooseFor(game: GameState, id: string, optionId?: string) {
  return applyCommand(game, id, {
    type: "choose",
    optionId: optionId ?? projectView(game, id).actions[0].command.optionId,
  });
}

export function harvestPlanning(
  count = 4,
  seats?: { id: string; name: string }[],
) {
  let game = rolePlanning(count, seats);
  for (const p of game.players) game = chooseFor(game, p.id);
  for (const site of Object.values(game.sites)) site.slots.fill(null);
  const me = game.players[0];
  me.city = "B-03";
  for (const node of ["A-02", "A-03"]) {
    game.sites[node].resource = "rock";
    game.sites[node].amount = 2;
    game.sites[node].slots[0] = me.id;
  }
  // A shared paid road offers multiple recipients in 3/4-player fixtures.
  const road = routeTo(game, me.id, "A-02").roads[0];
  game.sites[road].slots[0] = game.players[1].id;
  if (count > 2 && game.sites[road].slots.length > 1)
    game.sites[road].slots[1] = game.players[2].id;
  for (const p of game.players) p.wallet.cash = 20;
  game.active = (game.first + count - 1) % count;
  game.lap = 2;
  game.mainDone = true;
  game.mainRemaining = 0;
  return applyCommand(game, game.players[game.active].id, { type: "end" });
}
