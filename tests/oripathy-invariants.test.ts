import { describe, expect, it } from "vitest";
import { setImmediate } from "node:timers/promises";
import {
  applyCommand,
  createGame,
  projectView,
} from "../packages/rules/src/engine.ts";
import { ENTREPRENEURS } from "../packages/rules/src/oripathy-data.ts";

describe("感染者多分支对局与库存一致性", () => {
  it.each(
    ENTREPRENEURS.flatMap((who, index) =>
      [2, 3, 4].map((count) => ({ who: who.id, count, seed: 41 + index })),
    ),
  )(
    "$count 人／首选 $who：随机行动至终局，库存与中断恢复保持一致",
    async ({ who, count, seed }) => {
      await setImmediate();
      let s = createGame(
        Array.from({ length: count }, (_, i) => ({
          id: `p${i}`,
          name: `随机玩家 ${i}`,
        })),
        { oripathy: true, expert: true, seed },
      );
      let rng = seed * 89 + count;
      const random = () => {
        rng ^= rng << 13;
        rng ^= rng >>> 17;
        rng ^= rng << 5;
        return (rng >>> 0) / 4294967296;
      };
      for (let turn = 0; s.phase !== "finished"; turn++) {
        expect(turn, `${s.round} / ${s.decision?.kind}`).toBeLessThan(3500);
        const actor = s.decision?.playerId ?? s.players[s.active].id;
        const view = projectView(s, actor);
        expect(
          view.actions.length,
          `${s.round} / ${s.decision?.title}`,
        ).toBeGreaterThan(0);
        let candidates = view.actions;
        const draft =
          view.decision?.kind === "o:entrepreneur-draft" &&
          s.players.every((p) => !p.oripathy?.entrepreneur);
        if (draft) candidates = candidates.filter((a) => a.id === who);
        const finish = candidates.find((a) =>
          ["done", "skip", "no", "keep"].includes(a.id),
        );
        if (finish && random() < 0.35) candidates = [finish];
        const command =
          candidates[Math.floor(random() * candidates.length)].command;
        const next = applyCommand(s, actor, command);
        if (turn % 60 === 0)
          expect(
            applyCommand(JSON.parse(JSON.stringify(s)), actor, command),
          ).toEqual(next);
        s = next;
        const facilities = [
          ...s.market,
          ...s.facilityDeck,
          ...Object.values(s.oripathy!.marketUnder).flat(),
          ...s.players.flatMap((p) => [
            ...p.oripathy!.blueprint,
            ...p.persistent.flatMap((v) => v.stash),
          ]),
        ];
        expect(new Set(facilities).size, "同一实体设施不能在多个区域出现").toBe(
          facilities.length,
        );
        expect(s.oripathy!.security.length).toBeLessThanOrEqual(8);
        expect(new Set(s.oripathy!.security).size).toBe(
          s.oripathy!.security.length,
        );
        for (const p of s.players) {
          for (const [r, n] of Object.entries(p.wallet)) {
            expect(Number.isSafeInteger(n), `${p.id} ${r}`).toBe(true);
            if (r !== "score")
              expect(n, `${p.id} ${r}`).toBeGreaterThanOrEqual(0);
          }
          expect(
            projectView(s, p.id).players.find((v) => v.id === p.id)!
              .availableMarkers,
            `${p.id} 普通标记供应`,
          ).toBeGreaterThanOrEqual(0);
          expect(p.oripathy!.gangSlots.length).toBeLessThanOrEqual(4);
          for (const slot of p.oripathy!.gangSlots) {
            const i = slot.lastIndexOf(":");
            expect(
              s.sites[slot.slice(0, i)].slots[Number(slot.slice(i + 1))],
            ).toBe(p.id);
          }
        }
      }
      expect(s.round).toBe(8);
      expect(s.finalScores).toHaveLength(count);
      expect(s.queue).toEqual([]);
    },
  );
});
