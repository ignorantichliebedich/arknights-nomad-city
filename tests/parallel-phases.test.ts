import { describe, expect, it } from "vitest";
import {
  applyCommand,
  getParallelChoiceToken,
  projectView,
} from "../packages/rules/src/engine.ts";
import {
  chooseFor,
  harvestPlanning,
  rolePlanning,
} from "./fixtures/parallel.ts";
import type { GameState } from "../packages/rules/src/types.ts";

describe("全员并行选择与阶段屏障", () => {
  it.each([2, 3, 4])(
    "%i 人均可先盖放，最后一位确认才进入行动，秘密手牌不泄露",
    (count) => {
      let game = rolePlanning(count);
      const order = game.players.map((p) => p.id).reverse();
      const firstToken = getParallelChoiceToken(game, "p0");
      for (const [index, id] of order.entries()) {
        const before = JSON.stringify(game);
        const view = projectView(game, id);
        expect(view.decision!.playerId).toBe(id);
        expect(view.decision!.kind).toBe("select-role");
        expect(view.actions).toHaveLength(5);
        expect(JSON.stringify(game)).toBe(before);
        const chosen = view.actions.at(-1)!.command;
        game = applyCommand(game, id, chosen);
        if (index < count - 1) {
          expect(game.phase).toBe("select");
          expect(projectView(game, id).parallel!.ready).toHaveLength(index + 1);
          expect(projectView(game, id).decision).toBeNull();
          expect(projectView(game, id).actions).toEqual([]);
          expect(getParallelChoiceToken(game, "p0")).toBe(firstToken);
          expect(() => applyCommand(game, id, chosen)).toThrow("不可执行");
        }
        const observer = projectView(
          game,
          game.players.find((p) => p.id !== id)!.id,
        );
        expect(observer.players.find((p) => p.id === id)!.selected).toBeNull();
        expect(observer.players.find((p) => p.id === id)!.hand).toEqual([]);
        expect(observer).not.toHaveProperty("queue");
        expect(observer.parallel ?? {}).not.toHaveProperty("players");
      }
      expect(game.phase).toBe("actions");
      expect(game.parallel).toBeNull();
      expect(game.active).toBe(game.first);
      expect(game.players.every((p) => p.selected && p.hand.length === 4)).toBe(
        true,
      );
    },
  );

  it.each([2, 3, 4])(
    "%i 人采集包括零采集也需确认，最后一位前不支付、不领取",
    (count) => {
      let game = harvestPlanning(count);
      const initial = game.players.map((p) => structuredClone(p.wallet));
      game = chooseFor(game, "p0", "A-02");
      game = chooseFor(game, "p0", "A-03");
      const plan = projectView(game, "p0").decision!.options.find(
        (o) => o.id === "done",
      )!;
      const cost = plan.preview!.tolls!.reduce((n, toll) => n + toll.amount, 0);
      expect(new Set(plan.preview!.roads).size).toBe(
        plan.preview!.roads!.length,
      );
      game = chooseFor(game, "p0", "done");
      expect(projectView(game, "p0").decision!.kind).toBe("toll");
      expect(projectView(game, "p0").actions).toHaveLength(count === 2 ? 1 : 2);
      while (projectView(game, "p0").actions.length)
        game = chooseFor(game, "p0");
      expect(projectView(game, "p0").parallel!.ready).toEqual(["p0"]);
      expect(game.players.map((p) => p.wallet)).toEqual(initial);
      // No route, recipient, private queue, or deferred effect is in the friend's view.
      const friend = projectView(game, "p1");
      expect(friend.decision!.map!.selected).toEqual([]);
      expect(friend.parallel).not.toHaveProperty("players");
      expect(friend.parallel).not.toHaveProperty("effects");
      expect(friend.log.filter((e) => e.actor === "p0").at(-1)!.text).toBe(
        "已确认采集与路费方案",
      );
      for (let i = 1; i < count; i++) {
        game = chooseFor(game, `p${i}`, "done");
        if (i < count - 1) {
          expect(game.phase).toBe("harvest");
          expect(game.players.map((p) => p.wallet)).toEqual(initial);
        }
      }
      expect(game.round).toBe(2);
      expect(game.players[0].wallet.rock).toBe(initial[0].rock + 4);
      expect(game.players[0].wallet.cash).toBe(initial[0].cash - cost);
      expect(
        game.log.filter((e) => e.text.includes("所有玩家已确认采集方案")),
      ).toHaveLength(1);
    },
  );

  it("采集与收款人选择可交错恢复，结算结果和日志不依赖确认顺序", () => {
    const initial = harvestPlanning();
    function finish(order: string[]) {
      let game = structuredClone(initial);
      for (const id of order) {
        if (id === "p0") {
          game = chooseFor(game, id, "A-02");
          game = chooseFor(game, id, "A-03");
        }
        game = chooseFor(game, id, "done");
        while (projectView(game, id).decision?.kind === "toll") {
          const restored: GameState = JSON.parse(JSON.stringify(game));
          expect(projectView(restored, id)).toEqual(projectView(game, id));
          const option = projectView(game, id).actions.at(-1)!.command
            .optionId!;
          expect(chooseFor(restored, id, option)).toEqual(
            chooseFor(game, id, option),
          );
          game = chooseFor(restored, id, option);
        }
      }
      return game;
    }
    const a = finish(["p0", "p1", "p2", "p3"]);
    const b = finish(["p3", "p2", "p1", "p0"]);
    expect(a.players).toEqual(b.players);
    expect(a.randomState).toBe(b.randomState);
    expect(a.revision).toBe(b.revision);
    const settlement = (s: GameState) =>
      s.log.slice(
        s.log.findIndex((e) => e.text.includes("所有玩家已确认采集方案")),
      );
    expect(settlement(a)).toEqual(settlement(b));
  });

  it("本阶段的路费收入不能被提前花掉，共用航道预算和撤回即时校验", () => {
    let game = harvestPlanning();
    game.players[1].wallet.cash = 0;
    // Recreate the phase with the reduced opening budget using a legacy continuation.
    const phase = game.parallel!;
    game.decision = phase.players.p0.decision;
    game.parallel = null;
    game.queue.unshift(
      ...["p1", "p2", "p3"].map((actor) => ({ kind: "harvest", actor })),
    );
    const friendOptions = projectView(game, "p1").actions;
    game = chooseFor(game, "p0", "A-02");
    const selected = projectView(game, "p0").decision!.map!.selected;
    expect(selected).toEqual(["A-02"]);
    game = chooseFor(game, "p0", "unselect:A-02");
    expect(projectView(game, "p0").decision!.map!.roads).toEqual([]);
    game = chooseFor(game, "p0", "A-02");
    game = chooseFor(game, "p0", "done");
    while (projectView(game, "p0").decision) game = chooseFor(game, "p0", "p1");
    expect(game.players[1].wallet.cash).toBe(0);
    expect(projectView(game, "p1").actions).toEqual(friendOptions);
    expect(() => chooseFor(game, "p0", "done")).toThrow("不可执行");
  });

  it("旧版盖放和已选采集路线可原地恢复，投影不改写存档", () => {
    for (const initial of [rolePlanning(), harvestPlanning()]) {
      let game = initial;
      if (game.phase === "select") game = chooseFor(game, "p3");
      else game = chooseFor(game, "p0", "A-02");
      const parallel = game.parallel!;
      game.decision = parallel.players.p0.decision;
      game.parallel = undefined;
      game.queue.unshift(
        ...parallel.order
          .filter((id) => id !== "p0" && !parallel.players[id].ready)
          .map((actor) => ({ kind: parallel.kind, actor })),
      );
      const before = JSON.stringify(game);
      const own = projectView(game, "p0");
      const friend = projectView(game, "p1");
      expect(JSON.stringify(game)).toBe(before);
      expect(friend.decision!.playerId).toBe("p1");
      expect(own.parallel!.ready).toEqual(
        initial.phase === "select" ? ["p3"] : [],
      );
      if (initial.phase === "harvest")
        expect(own.decision!.map!.selected).toEqual(["A-02"]);
      const token = getParallelChoiceToken(game, "p0");
      const next = chooseFor(
        game,
        "p1",
        initial.phase === "harvest" ? "done" : undefined,
      );
      expect(getParallelChoiceToken(next, "p0")).toBe(token);
      expect(projectView(next, "p0").decision).toEqual(own.decision);
    }
  });
});
