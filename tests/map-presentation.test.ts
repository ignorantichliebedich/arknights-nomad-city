import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  projectView,
  routeTo,
} from "../packages/rules/src/engine.ts";
import type { GameState } from "../packages/rules/src/types.ts";
import {
  displayBoard,
  siteLayout,
  slotPoint,
} from "../apps/web/src/board-layout.ts";
import { boardFor } from "../packages/rules/src/data.ts";

function fixture() {
  let game = createGame(
    Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `企业家${i}` })),
    { seed: 52, expansion: false },
  );
  while (game.phase !== "actions")
    game = applyCommand(game, game.decision!.playerId, {
      type: "choose",
      optionId: game.decision!.options[0].id,
    });
  game.players[0].wallet.cash = 100;
  game.players[0].wallet.ore = 20;
  return game;
}
function harvest(game: GameState, free = false) {
  game.phase = "harvest";
  game.queue = [];
  game.decision = {
    playerId: "p0",
    kind: "fixture",
    title: "采集",
    options: [
      {
        id: "begin",
        label: "开始",
        steps: [{ kind: "harvest", actor: "p0", data: { free } }],
      },
    ],
  };
  return applyCommand(game, "p0", { type: "choose", optionId: "begin" });
}
describe("地图预览只披露行动者可见的几何与费用", () => {
  it("快捷探索目标等于正式探索选项，且只对行动者披露公开目标", () => {
    const game = fixture(),
      before = JSON.stringify(game),
      view = projectView(game, "p0");
    expect(view.explorationTargets!.length).toBeGreaterThan(0);
    expect(projectView(game, "p1").explorationTargets).toEqual([]);
    const choosing = applyCommand(game, "p0", {
      type: "main",
      action: "explore",
    });
    expect(view.explorationTargets).toEqual(
      choosing.decision!.options.map((o) => ({
        target: o.target,
        optionId: o.id,
        label: o.label,
      })),
    );
    expect(JSON.stringify(game)).toBe(before);
    expect(
      view.explorationTargets!.every(
        (o) => Object.keys(o).sort().join(",") === "label,optionId,target",
      ),
    ).toBe(true);
  });
  it.each([2, 3, 4])(
    "%i 人原图校准覆盖全部地点和空位，旧存档只调整显示副本",
    (count) => {
      const state = fixture(),
        game = projectView(state, "p0");
      game.players = game.players.slice(0, count);
      game.board = boardFor(count);
      const before = JSON.stringify(game),
        display = displayBoard(game);
      for (const site of [...game.board.nodes, ...game.board.roads]) {
        const layout = siteLayout(game, site.id),
          frame = layout.frame;
        expect(layout.slots).toHaveLength(site.slots);
        for (let i = 0; i < site.slots; i++) {
          const p = slotPoint(game, `${site.id}:${i}`);
          expect(p.x).toBeGreaterThan(frame.x);
          expect(p.x).toBeLessThan(frame.x + frame.w);
          expect(p.y).toBeGreaterThan(frame.y);
          expect(p.y).toBeLessThan(frame.y + frame.h);
        }
      }
      expect(display.board.roads.map((r) => r.nodes)).toEqual(
        game.board.roads.map((r) => r.nodes),
      );
      expect(display.board.nodes[0].x).not.toBe(game.board.nodes[0].x);
      expect(JSON.stringify(game)).toBe(before);
    },
  );
  it("直接部署预览与正式放置选项一致，未确认不消耗主要行动或标记", () => {
    const game = fixture();
    const before = JSON.stringify(game);
    const placements = projectView(game, "p0").influencePlacements!;
    expect(placements.length).toBeGreaterThan(0);
    expect(projectView(game, "p1").influencePlacements).toEqual([]);
    expect(JSON.stringify(game)).toBe(before);
    const placing = applyCommand(game, "p0", {
      type: "main",
      action: "deploy",
    });
    expect(placements).toEqual(
      placing.decision!.options.map((o) => ({
        target: o.target,
        optionId: o.id,
        label: o.label,
      })),
    );
    expect(projectView(placing, "p0").influencePlacements).toEqual([]);
    const choice = placements[0];
    const done = applyCommand(placing, "p0", {
      type: "choose",
      optionId: choice.optionId,
    });
    const [site, index] = choice.optionId.split(":");
    expect(done.sites[site].slots[Number(index)]).toBe("p0");
    expect(done.mainRemaining).toBe(game.mainRemaining - 1);
    expect(projectView(done, "p0").players[0].availableMarkers).toBe(
      projectView(game, "p0").players[0].availableMarkers - 1,
    );
    expect(projectView(done, "p0").influencePlacements).toEqual([]);
  });
  it("部署高亮排除公路、满格、未知资源点、对手城市及储备耗尽的状态", () => {
    const game = fixture();
    const [publicRoad, fullRoad] = game.board.roads;
    game.sites[publicRoad.id].publicRoad = true;
    game.sites[fullRoad.id].slots.fill("p1");
    const unknown = game.board.nodes.find((n) => !game.sites[n.id].resource)!;
    const foreignCity = game.players[1].city!;
    const excluded = [publicRoad.id, fullRoad.id, unknown.id, foreignCity];
    const choices = projectView(game, "p0").influencePlacements!;
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.some((c) => excluded.includes(c.target))).toBe(false);
    game.players[0].tokenLimit = 0;
    expect(projectView(game, "p0").influencePlacements).toEqual([]);
  });
  it("影响力拖动与逐步调度选项一致，预览不挪棋子且不泄露对手选项", () => {
    const game = fixture();
    game.sites[game.players[0].city!].slots[0] = "p0";
    const before = JSON.stringify(game);
    const moves = projectView(game, "p0").influenceMoves!;
    expect(moves.length).toBeGreaterThan(0);
    expect(projectView(game, "p1").influenceMoves).toEqual([]);
    expect(JSON.stringify(game)).toBe(before);
    const shifting = applyCommand(game, "p0", {
      type: "main",
      action: "shift",
    });
    expect(moves.map((m) => m.from)).toEqual(
      shifting.decision!.options.map((o) => o.id),
    );
    expect(projectView(shifting, "p0").influenceMoves).toEqual(moves);
    for (const move of moves) {
      const target = applyCommand(shifting, "p0", {
        type: "choose",
        optionId: move.from,
      });
      expect(move.destinations).toEqual(
        target.decision!.options.map((o) => o.id),
      );
      expect(projectView(target, "p0").influenceMoves).toEqual([move]);
      expect(projectView(target, "p1").influenceMoves).toEqual([]);
      const restored = JSON.parse(JSON.stringify(target));
      expect(projectView(restored, "p0").influenceMoves).toEqual([move]);
      const result = applyCommand(restored, "p0", {
        type: "choose",
        optionId: move.destinations[0],
      });
      const [site, index] = move.from.split(":");
      const [to, ti] = move.destinations[0].split(":");
      expect(result.sites[site].slots[Number(index)]).toBeNull();
      expect(result.sites[to].slots[Number(ti)]).toBe("p0");
    }
  });
  it("拖动目的地与开始移动后的合法选项完全一致，预览不改变状态", () => {
    const game = fixture();
    const before = JSON.stringify(game);
    const view = projectView(game, "p0");
    expect(view.cityDestinations!.length).toBeGreaterThan(0);
    expect(projectView(game, "p1").cityDestinations).toEqual([]);
    expect(JSON.stringify(game)).toBe(before);
    const moved = applyCommand(game, "p0", { type: "main", action: "city" });
    expect(view.cityDestinations!.map((m) => m.optionId)).toEqual(
      moved.decision!.options.map((o) => o.id),
    );
    for (const option of projectView(moved, "p0").decision!.options)
      expect(option.preview!.tolls!.every((t) => t.amount === 0)).toBe(true);
  });
  it("探索路线及付款对象来自相同裁定，隐藏效果和对手选项不外传", () => {
    let game = fixture();
    game = applyCommand(game, "p0", { type: "main", action: "explore" });
    for (const option of projectView(game, "p0").decision!.options) {
      expect(option.preview!.roads).toEqual(
        routeTo(game, "p0", option.target!).roads,
      );
      expect(option.preview!.tolls!.reduce((sum, t) => sum + t.amount, 0)).toBe(
        routeTo(game, "p0", option.target!).cost,
      );
      expect(option).not.toHaveProperty("steps");
    }
    expect(projectView(game, "p1").decision!.options).toEqual([]);
    expect(projectView(game, "p1")).not.toHaveProperty("queue");
  });
  it.each([false, true])(
    "采集恢复后保留共用航道和撤回后的费用，免费=%s",
    (free) => {
      let game = fixture();
      for (const site of Object.values(game.sites)) site.slots.fill(null);
      game.players[0].city = "A-01";
      for (const id of ["A-02", "A-03"]) {
        game.sites[id].resource = "rock";
        game.sites[id].amount = 2;
        game.sites[id].slots[0] = "p0";
      }
      const initial = { ...game.players[0].wallet };
      game = harvest(game, free);
      for (const id of ["A-02", "A-03"])
        game = applyCommand(game, "p0", { type: "choose", optionId: id });
      const view = projectView(game, "p0");
      const done = view.decision!.options.find((o) => o.id === "done")!;
      expect(done.preview!.roads!.length).toBe(
        new Set(done.preview!.roads).size,
      );
      const total = done.preview!.tolls!.reduce((sum, t) => sum + t.amount, 0);
      expect(done.label).toContain(`${total} 金券`);
      if (free) expect(total).toBe(0);
      expect(view.decision!.map!.selected).toEqual(["A-02", "A-03"]);
      expect(projectView(game, "p1").decision).not.toHaveProperty("map");
      expect(projectView(JSON.parse(JSON.stringify(game)), "p0")).toEqual(view);
      expect(game.players[0].wallet).toEqual(initial);
      const legacy = JSON.parse(JSON.stringify(game));
      delete legacy.decision.map;
      const legacyBefore = JSON.stringify(legacy);
      const restoredPreview = projectView(legacy, "p0").decision!;
      expect(restoredPreview.map!.selected).toEqual(["A-02", "A-03"]);
      expect(
        restoredPreview.options
          .find((o) => o.id === "done")!
          .preview!.tolls!.reduce((sum, t) => sum + t.amount, 0),
      ).toBe(total);
      expect(JSON.stringify(legacy)).toBe(legacyBefore);
      game = applyCommand(game, "p0", {
        type: "choose",
        optionId: "unselect:A-03",
      });
      const after = projectView(game, "p0").decision!;
      expect(after.map!.selected).toEqual(["A-02"]);
      expect(
        after.options
          .find((o) => o.id === "done")!
          .preview!.tolls!.reduce((sum, t) => sum + t.amount, 0),
      ).toBeLessThanOrEqual(total);
    },
  );
  it("宣告预览的城市格正是确认后被使用的设施", () => {
    let game = fixture();
    game.players[0].built = {
      "0": { cardId: "industrial", used: false },
      "3": { cardId: "escort", used: false },
      "4": { cardId: "industrial", used: false },
    };
    if (!game.patterns.includes("composite")) game.patterns.push("composite");
    game = applyCommand(game, "p0", {
      type: "declare",
      patternId: "composite",
    });
    const choice = projectView(game, "p0").decision!.options[0];
    expect(choice.preview!.patternId).toBe("composite");
    const result = applyCommand(game, "p0", {
      type: "choose",
      optionId: choice.id,
    });
    expect(
      Object.keys(result.players[0].built)
        .filter((c) => result.players[0].built[c].used)
        .sort(),
    ).toEqual([...choice.preview!.cells!].sort());
  });
});
