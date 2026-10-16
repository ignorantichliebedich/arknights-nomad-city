import { describe, expect, it } from "vitest";
import { setImmediate } from "node:timers/promises";
import {
  applyCommand,
  createGame,
  projectView,
} from "../packages/rules/src/engine.ts";
import type { GameState } from "../packages/rules/src/types.ts";

const cases = [2, 3, 4].flatMap((count) =>
  [false, true].flatMap((expansion) =>
    [1, 7, 41, 2026].map((seed) => ({ count, expansion, seed })),
  ),
);

function assertInventory(state: GameState) {
  const cards = [
    ...state.market,
    ...state.facilityDeck,
    ...state.players.flatMap((p) =>
      p.persistent.flatMap((effect) => effect.stash),
    ),
  ];
  expect(
    new Set(cards).size,
    "供应区、牌库和暂存设施不能重复占有同一实体牌",
  ).toBe(cards.length);
  expect(state.market.length).toBeLessThanOrEqual(6);
  expect(new Set(state.players.map((p) => p.city)).size).toBe(
    state.players.length,
  );
  for (const player of state.players) {
    for (const [resource, amount] of Object.entries(player.wallet)) {
      expect(Number.isSafeInteger(amount), `${player.id} ${resource}`).toBe(
        true,
      );
      if (resource !== "score")
        expect(amount, `${player.id} ${resource}`).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(player.built).length).toBeLessThanOrEqual(12);
    expect(player.built["7"].cardId).toBe("core");
    const markers = projectView(state, player.id).players.find(
      (p) => p.id === player.id,
    )!.availableMarkers;
    expect(markers).toBeGreaterThanOrEqual(0);
    expect(markers).toBeLessThanOrEqual(29);
  }
}

describe("多种合法选择下的整局一致性", () => {
  it.each(cases)(
    "$count 人，企业 $expansion，随机种子 $seed",
    async ({ count, expansion, seed }) => {
      // Let the worker deliver progress between CPU-heavy complete games.
      await setImmediate();
      let state = createGame(
        Array.from({ length: count }, (_, i) => ({
          id: `p${i}`,
          name: `玩家 ${i}`,
        })),
        { expansion, seed },
      );
      let choiceRandom = seed * 131 + count * 79 + Number(expansion);
      function nextRandom() {
        choiceRandom ^= choiceRandom << 13;
        choiceRandom ^= choiceRandom >>> 17;
        choiceRandom ^= choiceRandom << 5;
        return (choiceRandom >>> 0) / 0x100000000;
      }
      let commands = 0;
      while (state.phase !== "finished") {
        expect(
          commands++,
          `seed=${seed} revision=${state.revision} ${state.decision?.title}`,
        ).toBeLessThan(2500);
        const actor =
          state.decision?.playerId ?? state.players[state.active].id;
        const view = projectView(state, actor);
        expect(
          view.actions.length,
          `${state.phase}: ${view.decision?.title}`,
        ).toBeGreaterThan(0);
        let candidates = view.actions;
        if (["harvest", "sell"].includes(view.decision?.kind ?? "")) {
          const finish = candidates.find((a) => a.command.optionId === "done");
          if (finish && nextRandom() < 0.3) candidates = [finish];
        }
        const command =
          candidates[Math.floor(nextRandom() * candidates.length)].command;
        const next = applyCommand(state, actor, command);
        expect(next.revision).toBe(state.revision + 1);
        if (commands % 40 === 0) {
          const restored: GameState = JSON.parse(JSON.stringify(state));
          expect(applyCommand(restored, actor, command)).toEqual(next);
        }
        state = next;
        if (state.players.every((p) => p.city !== null)) assertInventory(state);
      }
      expect(state.round).toBe(8);
      expect(state.finalScores).toHaveLength(count);
      expect(state.winners.length).toBeGreaterThan(0);
      expect(state.decision).toBeNull();
      expect(state.queue).toEqual([]);
    },
  );
});
