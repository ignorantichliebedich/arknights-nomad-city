import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  projectView,
} from "../packages/rules/src/engine.ts";
import { COMPLETE_RHINE_RULES } from "../packages/rules/src/original-labs.ts";
import type { GameState, Step } from "../packages/rules/src/types.ts";

function choose(state: GameState, id: string) {
  const decision = state.decision!;
  expect(
    decision?.options.some((o) => o.id === id),
    `${decision?.title}: ${id}`,
  ).toBe(true);
  return applyCommand(state, decision.playerId, {
    type: "choose",
    optionId: id,
  });
}
function fixture(lab = 0) {
  let state = createGame(
    [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}` })),
    { expansion: true, seed: 42 },
  );
  while (state.phase !== "actions")
    state = choose(state, state.decision!.options[0].id);
  state.activeLab = lab;
  state.activeEnterprises = ["rhine", "heide", "bank", "rhodes"];
  for (const player of state.players) {
    player.enterprise = { rhine: 0, heide: 0, bank: 0, rhodes: 0 };
    player.wallet = {
      rock: 100,
      ore: 100,
      iron: 100,
      prime: 10,
      cash: 100,
      score: 0,
    };
  }
  for (const site of Object.values(state.sites)) site.slots.fill(null);
  return state;
}
function effect(state: GameState, steps: Step[]) {
  state.decision = {
    playerId: "p0",
    kind: "fixture",
    title: "原版科室场景",
    options: [{ id: "run", label: "执行", steps }],
  };
  return choose(state, "run");
}
function upgrade(state: GameState, level: number, actor = "p0") {
  state.players.find((p) => p.id === actor)!.enterprise.rhine = level - 1;
  return effect(state, [
    { kind: "upgrade-at", actor, data: { company: "rhine", count: 1 } },
  ]);
}
function market(state: GameState, types: string[]) {
  const pool = [...state.market, ...state.facilityDeck];
  state.market = types.map((type) => {
    const i = pool.findIndex((card) => card.startsWith(type + "@"));
    expect(i).toBeGreaterThanOrEqual(0);
    return pool.splice(i, 1)[0];
  });
  state.facilityDeck = pool;
}

describe("工程科原版奖励", () => {
  it("二级获得三源岩，三级获得二异铁", () => {
    let state = upgrade(fixture(), 2);
    expect(state.players[0].wallet).toMatchObject({ rock: 103, iron: 100 });
    state = upgrade(state, 3);
    expect(state.players[0].wallet).toMatchObject({ rock: 103, iron: 102 });
  });
  it("四级先支付三源岩，再正常支付设施费用进行建设", () => {
    let state = fixture();
    market(state, [
      "garage",
      "logistics",
      "administration",
      "energy",
      "industrial",
      "escort",
    ]);
    const garage = state.market[0];
    state = upgrade(state, 4);
    state = choose(state, "yes");
    expect(state.players[0].wallet.rock).toBe(97);
    state = choose(state, `${garage}:0:resources`);
    expect(state.players[0].built["0"].cardId).toBe("garage");
    expect(state.players[0].wallet).toMatchObject({ rock: 96, ore: 98 });
  });
  it("五级支付一至纯源石，仅免费建设供应区中原价不超过二十三金券的设施", () => {
    let state = fixture();
    market(state, [
      "garage",
      "logistics",
      "administration",
      "energy",
      "industrial",
      "escort",
    ]);
    const garage = state.market[0];
    const campIndex = state.facilityDeck.findIndex((card) =>
      card.startsWith("camp@"),
    );
    const camp = state.facilityDeck.splice(campIndex, 1)[0];
    state.players[0].persistent = [
      { roleId: "closure", markers: 0, stash: [camp] },
    ];
    state = upgrade(state, 5);
    state = choose(state, "yes");
    expect(state.players[0].wallet.prime).toBe(9);
    expect(
      state.decision!.options.some(
        (o) =>
          o.id.startsWith("logistics@") ||
          o.id.startsWith("administration@") ||
          o.id.startsWith("industrial@") ||
          o.id.startsWith(camp),
      ),
    ).toBe(false);
    expect(
      state.decision!.options.some((o) => o.id.startsWith("energy@")),
    ).toBe(true);
    state = choose(state, `${garage}:0:free`);
    expect(state.players[0].wallet).toMatchObject({
      rock: 100,
      ore: 100,
      cash: 100,
    });
    expect(state.players[0].built["0"].cardId).toBe("garage");
  });
  it("可选择跳过付费奖励，保留等级提升而不支付或建造", () => {
    let state = upgrade(fixture(), 5);
    state = choose(state, "no");
    expect(state.players[0].enterprise.rhine).toBe(5);
    expect(state.players[0].wallet.prime).toBe(10);
    expect(Object.keys(state.players[0].built)).toEqual(["7"]);
  });
});

describe("防卫科原版奖励", () => {
  it("二级获得七金券", () => {
    const state = upgrade(fixture(1), 2);
    expect(state.players[0].wallet.cash).toBe(107);
  });
  it("三级支付三金券，选择替换一个影响力", () => {
    let state = fixture(1);
    state.sites["D-1"].slots[0] = "p1";
    state = upgrade(state, 3);
    state = choose(state, "yes");
    state = choose(state, "replace");
    state = choose(state, "D-1:0");
    expect(state.sites["D-1"].slots[0]).toBe("p0");
    expect(state.players[0].wallet.cash).toBe(97);
  });
  it("三级另一选项是移动两次同一影响力，不额外付费", () => {
    let state = fixture(1);
    state.sites["A-1"].slots[0] = "p0";
    state = upgrade(state, 3);
    state = choose(state, "yes");
    state = choose(state, "shift");
    state = choose(state, "A-1:0");
    state = choose(state, "A-2:0");
    state = choose(state, "A-2:0");
    state = choose(state, "D-1:0");
    expect(state.sites["A-1"].slots[0]).toBeNull();
    expect(state.sites["A-2"].slots[0]).toBeNull();
    expect(state.sites["D-1"].slots[0]).toBe("p0");
    expect(state.players[0].wallet.cash).toBe(97);
  });
  it("四级支付十二金券，可按选择先移除再放置影响力", () => {
    let state = fixture(1);
    state.sites["D-1"].slots[0] = "p1";
    state = upgrade(state, 4);
    state = choose(state, "yes");
    expect(state.decision!.title).toContain("防卫科");
    state = choose(state, "remove");
    state = choose(state, "D-1:0");
    expect(state.decision!.title).toContain("防卫科");
    state = choose(state, "place");
    state = choose(state, "A-1:0");
    expect(state.sites["D-1"].slots[0]).toBeNull();
    expect(state.sites["A-1"].slots[0]).toBe("p0");
    expect(state.players[0].wallet).toMatchObject({
      cash: 88,
      rock: 100,
      ore: 100,
      iron: 100,
    });
  });
  it("五级支付二十五金券，获得三至纯源石", () => {
    let state = upgrade(fixture(1), 5);
    state = choose(state, "yes");
    expect(state.players[0].wallet).toMatchObject({ cash: 75, prime: 13 });
  });
});

describe("结构科原版奖励", () => {
  it("二级获得三源石，三级获得一分", () => {
    let state = upgrade(fixture(2), 2);
    expect(state.players[0].wallet).toMatchObject({ ore: 103, score: 0 });
    state = upgrade(state, 3);
    expect(state.players[0].wallet).toMatchObject({ ore: 103, score: 1 });
  });
  it("四级支付三源石，获得一至纯源石，保存恢复保持付费选择", () => {
    let state = upgrade(fixture(2), 4);
    const restored = JSON.parse(JSON.stringify(state));
    state = choose(state, "yes");
    expect(state.players[0].wallet).toMatchObject({ ore: 97, prime: 11 });
    expect(choose(restored, "yes")).toEqual(state);
  });
  it("五级先降低到四级，再选择支付四级费用", () => {
    let state = upgrade(fixture(2), 5);
    expect(state.players[0].enterprise.rhine).toBe(4);
    expect(state.players[0].wallet).toMatchObject({ ore: 100, prime: 10 });
    const restored = JSON.parse(JSON.stringify(state));
    state = choose(state, "yes");
    expect(state.players[0].wallet).toMatchObject({ ore: 97, prime: 11 });
    expect(state.players[0].enterprise.rhine).toBe(4);
    expect(choose(restored, "yes")).toEqual(state);
  });
  it("五级四级费用可跳过，资源不足也不会撤销已发生的降级", () => {
    let state = upgrade(fixture(2), 5);
    state = choose(state, "no");
    expect(state.players[0].enterprise.rhine).toBe(4);
    expect(state.players[0].wallet).toMatchObject({ ore: 100, prime: 10 });
    state = fixture(2);
    state.players[0].wallet.ore = 2;
    state = upgrade(state, 5);
    expect(state.players[0].enterprise.rhine).toBe(4);
    expect(state.players[0].wallet).toMatchObject({ ore: 2, prime: 10 });
    expect(state.decision!.options.map((option) => option.id)).toEqual(["no"]);
    state = choose(state, "no");
    expect(state.decision).toBeNull();
  });
  it("五级玩家切换至结构科仅给切换者降级与奖励", () => {
    let state = fixture(0);
    state.players[0].enterprise.rhine = 5;
    state.players[1].enterprise.rhine = 5;
    state = effect(state, [{ kind: "set-lab", actor: "p0", data: { lab: 2 } }]);
    expect(state.activeLab).toBe(2);
    expect(state.players.map((player) => player.enterprise.rhine)).toEqual([
      4, 5, 0,
    ]);
    state = choose(state, "yes");
    expect(state.players.map((player) => player.wallet.prime)).toEqual([
      11, 10, 10,
    ]);
  });
  it("三级一次提升两级，依序获得四级奖励及五级降级后的四级奖励", () => {
    let state = fixture(2);
    state.players[0].enterprise.rhine = 3;
    state = effect(state, [
      { kind: "upgrade-at", actor: "p0", data: { company: "rhine", count: 2 } },
    ]);
    state = choose(state, "yes");
    expect(state.players[0].enterprise.rhine).toBe(4);
    state = choose(state, "yes");
    expect(state.players[0].wallet).toMatchObject({ ore: 94, prime: 12 });
    expect(state.players[0].enterprise.rhine).toBe(4);
  });
  it("全员升级按顺时针依次结算各自的降级及付费选择", () => {
    let state = fixture(2);
    for (const player of state.players) player.enterprise.rhine = 4;
    state = effect(state, [
      {
        kind: "upgrade-at",
        actor: "p1",
        data: { company: "rhine", count: 1, all: true },
      },
    ]);
    for (const actor of ["p1", "p2", "p0"]) {
      expect(state.decision!.playerId).toBe(actor);
      state = choose(state, "yes");
    }
    expect(state.players.map((player) => player.enterprise.rhine)).toEqual([
      4, 4, 4,
    ]);
    expect(state.players.map((player) => player.wallet.prime)).toEqual([
      11, 11, 11,
    ]);
  });
});

describe("全员共享的科室状态", () => {
  it("切换只给操作者当前等级奖励，其他玩家以新科室结算后续升级", () => {
    let state = fixture(0);
    state.players[0].enterprise.rhine = 2;
    state = effect(state, [{ kind: "set-lab", actor: "p0", data: { lab: 1 } }]);
    expect(state.activeLab).toBe(1);
    expect(state.players.map((p) => p.wallet.cash)).toEqual([107, 100, 100]);
    state = upgrade(state, 2, "p1");
    expect(state.players.map((p) => p.wallet.cash)).toEqual([107, 107, 100]);
    expect(projectView(state, "p2").activeLab).toBe(1);
  });
  it("初始激活不提前发放奖励，保存和恢复保留共享状态及付费选择", () => {
    let state = effect(fixture(), [
      { kind: "set-lab", actor: "p0", data: { lab: 1, initial: true } },
    ]);
    expect(state.players[0].wallet.cash).toBe(100);
    state = upgrade(state, 5);
    const restored = JSON.parse(JSON.stringify(state));
    expect(choose(restored, "yes")).toEqual(choose(state, "yes"));
  });
  it("正式配置完整启用三张科室，非法科室指令保持状态不变", () => {
    expect(COMPLETE_RHINE_RULES).toBe(true);
    const state = fixture(99);
    state.players[0].enterprise.rhine = 1;
    const before = JSON.stringify(state);
    expect(() =>
      effect(structuredClone(state), [
        {
          kind: "upgrade-at",
          actor: "p0",
          data: { company: "rhine", count: 1 },
        },
      ]),
    ).toThrow("原版牌面核验");
    expect(JSON.stringify(state)).toBe(before);
    expect(() =>
      effect(structuredClone(state), [
        { kind: "set-lab", actor: "p0", data: { lab: 99 } },
      ]),
    ).toThrow("原版牌面核验");
  });
});
