import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  projectView,
} from "../packages/rules/src/engine.ts";
import { batchChoice } from "../packages/rules/src/batch-choices.ts";
import type { Command, GameState } from "../packages/rules/src/types.ts";

function trimSetup(count = 4, oripathy = false) {
  let s = createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `玩家${i}`,
    })),
    { expansion: true, oripathy, expert: false, seed: 52 },
  );
  for (let n = 0; s.decision?.kind !== "trim"; n++) {
    if (n > 100) throw new Error("未进入开局裁剪");
    s = applyCommand(s, s.decision!.playerId, {
      type: "choose",
      optionId: s.decision!.options[0].id,
    });
  }
  return s;
}
function effect(kind: string, count: number) {
  const s = trimSetup();
  s.queue = [];
  s.decision = {
    kind: "test",
    playerId: "p0",
    title: "测试",
    options: [
      {
        id: "go",
        label: "开始",
        steps: [{ kind, actor: "p0", data: { count } }],
      },
    ],
  };
  s.players[0].wallet = {
    rock: 3,
    ore: 1,
    iron: 2,
    prime: 0,
    cash: 0,
    score: 0,
  };
  return applyCommand(s, "p0", { type: "choose", optionId: "go" });
}
function sequential(s: GameState, id: string, ids: string[]) {
  let next = s;
  for (const optionId of ids)
    next = applyCommand(next, id, { type: "choose", optionId });
  next.revision = s.revision + 1;
  return next;
}
describe("独立重复选择的整组提交", () => {
  it.each(
    [2, 3, 4].flatMap((count) =>
      [false, true].map((oripathy) => ({ count, oripathy })),
    ),
  )(
    "$count 人、感染者 $oripathy：两／三张角色一次退回，结果与逐张相同",
    ({ count, oripathy }) => {
      const s = trimSetup(count, oripathy),
        id = s.decision!.playerId;
      const amount = oripathy ? 3 : 2;
      const ids = s.decision!.options.slice(0, amount).map((o) => o.id);
      expect(projectView(s, id).decision!.batch?.count).toBe(amount);
      const next = applyCommand(s, id, { type: "choose-many", optionIds: ids });
      expect(next).toEqual(sequential(s, id, ids));
      expect(next.revision).toBe(s.revision + 1);
      const friend = projectView(next, s.players.find((p) => p.id !== id)!.id);
      expect(friend.players.find((p) => p.id === id)!.removed).toEqual([]);
      expect(friend.log.filter((l) => l.visibility?.includes(id))).toEqual([]);
    },
  );
  it("恢复旧的中途选择后，按剩余两张完成", () => {
    const original = trimSetup(3, true),
      id = original.decision!.playerId;
    const s = JSON.parse(
      JSON.stringify(
        applyCommand(original, id, {
          type: "choose",
          optionId: original.decision!.options[0].id,
        }),
      ),
    );
    expect(batchChoice(s, id)?.count).toBe(2);
    const ids = s.decision.options.slice(0, 2).map((o: { id: string }) => o.id);
    expect(
      applyCommand(s, id, { type: "choose-many", optionIds: ids }),
    ).toEqual(sequential(s, id, ids));
  });
  it.each(["allocate", "pay-basic"])("%s 支持重复资源和混合分配", (kind) => {
    const s = effect(kind, 4),
      ids = ["rock", "iron", "rock", "ore"];
    expect(
      applyCommand(s, "p0", { type: "choose-many", optionIds: ids }),
    ).toEqual(sequential(s, "p0", ids));
    expect(projectView(s, "p1").decision?.batch).toBeUndefined();
  });
  it("资源数量超限与错误行动者均不修改原状态", () => {
    const s = effect("pay-basic", 4),
      before = JSON.stringify(s);
    expect(() =>
      applyCommand(s, "p0", {
        type: "choose-many",
        optionIds: ["ore", "ore", "rock", "iron"],
      }),
    ).toThrow();
    expect(() =>
      applyCommand(s, "p1", {
        type: "choose-many",
        optionIds: ["rock", "rock", "rock", "iron"],
      }),
    ).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("异客可替代支付时保留原来的逐步选择", () => {
    const s = effect("pay-basic", 3);
    s.players[0].persistent.push({
      roleId: "passenger",
      markers: 2,
      stash: [],
    });
    expect(batchChoice(s, "p0")).toBeUndefined();
    expect(() =>
      applyCommand(s, "p0", {
        type: "choose-many",
        optionIds: ["rock", "rock", "iron"],
      }),
    ).toThrow();
  });
  it("拒绝少选、多选、重复卡、未知卡、额外字段及超大请求", () => {
    const s = trimSetup(),
      id = s.decision!.playerId,
      [a, b] = s.decision!.options;
    const before = JSON.stringify(s);
    for (const command of [
      { type: "choose-many", optionIds: [a.id] },
      { type: "choose-many", optionIds: [a.id, a.id] },
      { type: "choose-many", optionIds: [a.id, "unknown"] },
      { type: "choose-many", optionIds: [a.id, b.id], action: "end" },
      { type: "choose-many", optionIds: Array(1000).fill(a.id) },
      { type: "choose-many", optionIds: [a.id, null] },
    ])
      expect(() => applyCommand(s, id, command as Command)).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
});
