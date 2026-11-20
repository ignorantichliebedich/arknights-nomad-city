import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  projectView,
} from "../packages/rules/src/engine.ts";
import { chooseBotAction } from "../packages/rules/src/bot.ts";

describe("人机使用正常玩家视图做出合法选择", () => {
  it.each(
    [2, 3, 4].flatMap((count) =>
      [
        { expansion: false, oripathy: false, expert: false },
        { expansion: true, oripathy: false, expert: false },
        { expansion: true, oripathy: true, expert: false },
        { expansion: true, oripathy: true, expert: true },
      ].map((config) => ({ count, ...config })),
    ),
  )(
    "$count 人 / 企业 $expansion / 感染者 $oripathy / 专家 $expert：完成八回合并恢复后继续相同选择",
    ({ count, expansion, oripathy, expert }) => {
      let game = createGame(
        Array.from({ length: count }, (_, i) => ({
          id: `bot-${i}`,
          name: `人机 ${i}`,
        })),
        { expansion, oripathy, expert, seed: 52 },
      );
      for (let n = 0; game.phase !== "finished"; n++) {
        expect(n, `${game.phase}: ${game.decision?.title}`).toBeLessThan(2000);
        const views = game.players.map((p) => projectView(game, p.id));
        const view = views.find((v) => v.actions.length)!;
        expect(view).toBeDefined();
        const before = JSON.stringify(view);
        const action = chooseBotAction(view)!;
        expect(JSON.stringify(view)).toBe(before);
        expect(view.actions).toContainEqual(action);
        if (n % 50 === 0)
          expect(
            chooseBotAction(
              projectView(JSON.parse(JSON.stringify(game)), view.me),
            ),
          ).toEqual(action);
        game = applyCommand(game, view.me, action.command);
      }
      expect(game.round).toBe(8);
      expect(game.finalScores).toHaveLength(count);
      expect(
        game.players.every(
          (p) =>
            projectView(game, p.id).players.find((v) => v.id === p.id)!
              .availableMarkers >= 0,
        ),
      ).toBe(true);
    },
  );
  it("并行采集不会撤回已选节点形成循环，完成后等待其他玩家", () => {
    let game = createGame(
      [
        { id: "p0", name: "人机" },
        { id: "p1", name: "朋友" },
      ],
      { seed: 52 },
    );
    for (let n = 0; game.phase !== "actions"; n++) {
      const p = game.players.find(
        (p) => projectView(game, p.id).actions.length,
      )!;
      game = applyCommand(
        game,
        p.id,
        chooseBotAction(projectView(game, p.id))!.command,
      );
    }
    game.phase = "harvest";
    game.parallel = null;
    game.queue = [];
    game.decision = {
      playerId: "p0",
      kind: "fixture",
      title: "准备采集",
      options: [
        {
          id: "begin",
          label: "采集",
          steps: [{ kind: "parallel-harvest", actor: "p0" }],
        },
      ],
    };
    game = applyCommand(game, "p0", { type: "choose", optionId: "begin" });
    for (let n = 0; projectView(game, "p0").actions.length; n++) {
      expect(n).toBeLessThan(12);
      const action = chooseBotAction(projectView(game, "p0"))!;
      expect(action.command.optionId).not.toMatch(/^unselect:|^reset$/);
      game = applyCommand(game, "p0", action.command);
    }
    expect(game.parallel!.players.p0.ready).toBe(true);
    expect(chooseBotAction(projectView(game, "p0"))).toBeNull();
  });
});
