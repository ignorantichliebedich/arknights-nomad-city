import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  getLegalActions,
} from "../packages/rules/src/engine.ts";
import {
  EVENTS,
  FACILITIES,
  PATTERNS,
  ROLES,
  VERIFIED_ENTERPRISES,
} from "../packages/rules/src/data.ts";
import type { GameState, Resource, Step } from "../packages/rules/src/types.ts";

function choose(s: GameState, id?: string) {
  const d = s.decision!;
  const o = id ? d.options.find((o) => o.id === id) : d.options[0];
  expect(o, `缺少选择 ${id}，${d.title}`).toBeDefined();
  return applyCommand(s, d.playerId, { type: "choose", optionId: o!.id });
}
function settle(s: GameState) {
  for (let i = 0; s.decision; i++) {
    expect(i).toBeLessThan(300);
    s = choose(
      s,
      s.decision.kind === "sell" || s.decision.kind === "harvest"
        ? "done"
        : undefined,
    );
  }
  return s;
}
function fixture(count = 3) {
  let s = createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `玩家 ${i}`,
    })),
    { expansion: true, seed: 42 },
  );
  while (s.phase !== "actions") s = choose(s);
  s.activeEnterprises = [...VERIFIED_ENTERPRISES];
  s.activeLab ??= 0;
  for (const p of s.players) {
    p.wallet = {
      rock: 100,
      ore: 100,
      iron: 100,
      prime: 10,
      cash: 100,
      score: 0,
    };
    p.enterprise = Object.fromEntries(VERIFIED_ENTERPRISES.map((c) => [c, 5]));
  }
  s.sites["A-1"].slots[0] = "p0";
  s.sites["D-1"].slots = ["p1", "p2"];
  return s;
}
function effect(s: GameState, steps: Step[]) {
  s.decision = {
    playerId: "p0",
    kind: "fixture",
    title: "规则场景",
    options: [{ id: "run", label: "执行", steps }],
  };
  return choose(s, "run");
}

describe("设施牌面与入场结算", () => {
  it.each(
    FACILITIES.filter(
      (f) => !f.oripathy && f.id !== "core" && !f.id.startsWith("extension-"),
    ),
  )("$name（$id）：支付、入城、结算及市场即时补牌", (card) => {
    let s = fixture();
    s.market = [`${card.id}@test`];
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    s = choose(s, `${card.id}@test:0:resources`);
    s = settle(s);
    expect(s.players[0].built["0"].cardId).toBe(card.id);
    expect(s.players[0].wallet.score).toBeGreaterThanOrEqual(card.points - 2);
    expect(s.market).not.toContain(`${card.id}@test`);
    expect(s.market).toHaveLength(6);
    expect(
      s.players.every(
        (p) => p.wallet.rock >= 0 && p.wallet.ore >= 0 && p.wallet.iron >= 0,
      ),
    ).toBe(true);
  });
  it.each([
    ["quarry-yellow", { rock: 106, ore: 99, iron: 99 }],
    ["refinery-blue", { rock: 99, ore: 105, iron: 99 }],
    ["smelter-red", { rock: 98, ore: 98, iron: 103 }],
  ])("%s 的资源净变化符合原牌面", (card, expected) => {
    let s = fixture();
    s.market = [`${card}@0`];
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    s = settle(choose(s, `${card}@0:0:resources`));
    expect(s.players[0].wallet).toMatchObject(expected);
  });
  it("城市开局为 4×3 格，核心在第三行中间；物流可选择三色枢纽和任意空格", () => {
    let s = fixture();
    expect(s.players[0].built["7"].cardId).toBe("core");
    s.market = ["logistics@0"];
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    expect(
      s.decision!.options.some((o) => o.id === "logistics@0:11:cash"),
    ).toBe(true);
    s = choose(s, "logistics@0:11:cash");
    expect(s.decision!.kind).toBe("extend");
    s = choose(s, "extension-yellow:10");
    expect(s.players[0].built["10"].cardId).toBe("extension-yellow");
    expect(s.extensions).toEqual(["extension-blue", "extension-red"]);
    expect(s.players[0].wallet.score).toBe(1);
  });
  it.each([
    { cards: ["garage", "escort"], rock: 97 },
    { cards: ["quarry-red", "quarry-yellow", "energy"], rock: 98 },
    {
      cards: ["garage", "escort", "trade", "power", "energy", "administration"],
      rock: 99,
    },
    { cards: ["administration"], rock: 96 },
  ])(
    "城邦工业区按非彩色设施颜色折扣：$cards → 剩余源岩 $rock",
    ({ cards, rock }) => {
      let s = fixture();
      cards.forEach((cardId, i) => {
        s.players[0].built[String(i)] = { cardId, used: false };
      });
      s.market = ["industrial@0"];
      s = applyCommand(s, "p0", { type: "main", action: "build" });
      s = settle(choose(s, "industrial@0:11:resources"));
      expect(s.players[0].wallet).toMatchObject({ rock, ore: 97, cash: 98 });
    },
  );
  it("唯一设施按名称拒绝重复建设", () => {
    const s = fixture();
    s.players[0].built["0"] = { cardId: "administration", used: false };
    s.market = ["administration@1"];
    expect(getLegalActions(s, "p0").some((a) => a.id === "build")).toBe(false);
  });
  it("同色多种设施不能额外降低工业区费用，合法建设与确认费用一致", () => {
    let s = fixture();
    s.players[0].built["0"] = { cardId: "garage", used: false };
    s.players[0].built["1"] = { cardId: "escort", used: false };
    s.players[0].wallet = {
      rock: 2,
      ore: 3,
      iron: 0,
      cash: 2,
      prime: 0,
      score: 0,
    };
    s.market = ["industrial@0"];
    expect(getLegalActions(s, "p0").some((a) => a.id === "build")).toBe(false);
    s.players[0].wallet.rock = 3;
    expect(getLegalActions(s, "p0").some((a) => a.id === "build")).toBe(true);
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    s = choose(s, "industrial@0:11:resources");
    expect(s.players[0].wallet).toMatchObject({
      rock: 0,
      ore: 0,
      cash: 0,
      score: 2,
    });
  });
});

describe("角色的策略、计谋与持续状态", () => {
  it.each([
    { cash: 11, first: false, second: false, prime: 10, remaining: 11 },
    { cash: 100, first: false, second: false, prime: 10, remaining: 100 },
    { cash: 12, first: true, second: false, prime: 11, remaining: 0 },
    { cash: 26, first: true, second: false, prime: 11, remaining: 14 },
    { cash: 27, first: true, second: true, prime: 12, remaining: 0 },
    { cash: 27, first: true, second: false, prime: 11, remaining: 15 },
    { cash: 100, first: false, second: true, prime: 11, remaining: 85 },
  ])(
    "锡人先得一分，再分别选择两段条件式兑换：$cash 金券，$first / $second",
    ({ cash, first, second, prime, remaining }) => {
      let s = fixture();
      s.players[0].selected = "tinman";
      s.players[0].wallet.cash = cash;
      s = applyCommand(s, "p0", { type: "role", mode: "strategy" });
      expect(s.players[0].wallet).toMatchObject({ score: 1, cash, prime: 10 });
      for (const [price, accept] of [
        [12, first],
        [15, second],
      ] as const) {
        expect(s.decision!.options.some((o) => o.id === "yes")).toBe(
          s.players[0].wallet.cash >= price,
        );
        const restored = JSON.parse(JSON.stringify(s));
        s = choose(s, accept ? "yes" : "no");
        expect(choose(restored, accept ? "yes" : "no")).toEqual(s);
      }
      expect(s.players[0].wallet).toMatchObject({
        score: 1,
        cash: remaining,
        prime,
      });
      expect(s.players[0].selected).toBeNull();
      expect(s.decision).toBeNull();
      expect(s.queue).toEqual([]);
    },
  );
  it.each(
    ROLES.filter((r) => !r.oripathy).flatMap((r) =>
      ["strategy", "tactic"].map((mode) => ({ role: r.id, mode })),
    ),
  )(
    "$role / $mode：所有决定均由合法指令完成且可序列化恢复",
    ({ role, mode }) => {
      let s = fixture();
      s.players[0].selected = role;
      s.players[0].discard = ["liskarm", "texas"];
      s = settle(applyCommand(s, "p0", { type: "role", mode }));
      expect(s.players[0].selected).toBeNull();
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      expect(s.queue).toEqual([]);
    },
  );
  it("异客只取走对手实际持有的基础资源，双方各得一分", () => {
    let s = fixture();
    s.players[0].selected = "passenger";
    s.players[1].wallet.ore = 2;
    s = applyCommand(s, "p0", { type: "role", mode: "strategy" });
    s = choose(s, "p1:ore");
    expect(s.players[0].wallet.ore).toBe(102);
    expect(s.players[1].wallet.ore).toBe(0);
    expect(s.players.slice(0, 2).map((p) => p.wallet.score)).toEqual([1, 1]);
  });
  it("异客不能把标记当作可出售的资源，每笔支付最多使用两枚", () => {
    let s = fixture();
    s.players[0].persistent = [{ roleId: "passenger", markers: 5, stash: [] }];
    s.players[0].wallet.rock = 0;
    s.players[0].wallet.iron = 0;
    s.market = ["urban@0"];
    expect(
      getLegalActions(s, "p0").find((a) => a.id === "build"),
    ).toBeDefined(); // 金券支付仍然可用
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    expect(s.decision!.options.some((o) => o.id.endsWith(":resources"))).toBe(
      false,
    );
    s = fixture();
    s.players[0].persistent = [{ roleId: "passenger", markers: 5, stash: [] }];
    s.players[0].selected = "cannott";
    s = applyCommand(s, "p0", { type: "role", mode: "strategy" });
    s = choose(s, "rock:1");
    expect(s.players[0].persistent[0].markers).toBe(5);
    expect(s.players[0].wallet.rock).toBe(99);
  });
  it("异客标记全部支付后进入弃牌区", () => {
    let s = fixture();
    s.players[0].persistent = [{ roleId: "passenger", markers: 2, stash: [] }];
    s.players[0].wallet.rock = 0;
    s.players[0].wallet.ore = 0;
    s.market = ["garage@0"];
    s.players[0].wallet.ore = 1;
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    s = choose(s, "garage@0:0:resources");
    s = settle(choose(s, "1:1:0"));
    expect(s.players[0].persistent).toEqual([]);
    expect(s.players[0].discard).toContain("passenger");
  });
  it("可露希尔取两种不同设施，第二张建造后结束持续效果", () => {
    let s = fixture();
    s.players[0].selected = "closure";
    s.market = ["garage@0", "garage@1", "quarry-red@0"];
    s = applyCommand(s, "p0", { type: "role", mode: "tactic" });
    s = choose(s, "garage@0");
    expect(s.decision!.options.some((o) => o.id === "garage@1")).toBe(false);
    s = choose(s, "quarry-red@0");
    expect(s.players[0].persistent[0].stash).toEqual([
      "garage@0",
      "quarry-red@0",
    ]);
    for (const [card, cell] of [
      ["garage@0", "0"],
      ["quarry-red@0", "1"],
    ]) {
      s.mainDone = false;
      s.mainRemaining = 1;
      s = applyCommand(s, "p0", { type: "main", action: "build" });
      s = settle(choose(s, `${card}:${cell}:cash`));
    }
    expect(s.players[0].persistent).toEqual([]);
    expect(s.players[0].discard).toContain("closure");
  });
  it("多萝西被他人移除的影响力可存入牌中，标记上限四枚", () => {
    let s = fixture();
    s.players[1].persistent = [{ roleId: "dorothy", markers: 3, stash: [] }];
    s.players[0].selected = "texas";
    s = applyCommand(s, "p0", { type: "role", mode: "tactic" });
    s = choose(s, "yes");
    s = choose(s, "D-1:0");
    expect(s.decision!.playerId).toBe("p1");
    s = choose(s, "yes");
    s = settle(s);
    expect(s.players[1].persistent[0].markers).toBe(4);
  });
  it("凯尔希选择一家企业，按自选顺序触发全部已解锁特效并退役", () => {
    let s = fixture();
    s.players[0].selected = "kaltsit";
    s = applyCommand(s, "p0", { type: "role", mode: "tactic" });
    s = choose(s, "mama");
    s = choose(s, "4");
    s = choose(s, "yes");
    s = choose(s, "2");
    s = choose(s, "yes");
    s = choose(s, "3");
    expect(s.players[0].wallet).toMatchObject({ score: 3, cash: 95 });
    expect(s.players[0].removed).toContain("kaltsit");
  });
});

describe("企业升级与连锁裁定", () => {
  it("山可触发已经满级的企业，不能升级时仍执行后续特效", () => {
    let s = fixture();
    s.activeEnterprises = ["bank"];
    s.players[0].selected = "mountain";
    s = applyCommand(s, "p0", { type: "role", mode: "tactic" });
    s = choose(s, "yes");
    expect(s.decision!.kind).toBe("upgrade-trigger");
    s = choose(s, "bank");
    s = choose(s, "bank:1");
    expect(s.players[0].enterprise.bank).toBe(5);
    expect(s.players[0].wallet.cash).toBe(106);
    expect(s.players[0].selected).toBeNull();
  });
  it("玛恩纳自身合作满级时仍能选择同家企业提升其他玩家", () => {
    let s = fixture();
    s.activeEnterprises = ["heide"];
    s.players[0].selected = "mlynar";
    s.players[1].enterprise.heide = 2;
    s = applyCommand(s, "p0", { type: "role", mode: "strategy" });
    expect(s.decision!.kind).toBe("upgrade");
    s = choose(s, "heide");
    expect(s.players.map((p) => p.enterprise.heide)).toEqual([5, 3, 5]);
    expect(s.players[1].wallet.score).toBe(1);
    s = choose(s, "heide:1");
    expect(s.players[0].wallet.rock).toBe(104);
  });
  it("玛恩纳同时提升所有玩家时，由操作者开始按顺时针发放干员奖励", () => {
    let s = fixture(4);
    s.active = 1;
    s.activeEnterprises = ["rhodes"];
    s.players[1].selected = "mlynar";
    for (const p of s.players) p.enterprise.rhodes = 2;
    s = applyCommand(s, "p1", { type: "role", mode: "strategy" });
    s = choose(s, "rhodes");
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      expect(s.decision!.kind).toBe("operative-draw");
      order.push(s.decision!.playerId);
      s = choose(s, "score");
    }
    expect(order).toEqual(["p1", "p2", "p3", "p0"]);
    expect(s.players.map((p) => p.wallet.score)).toEqual([1, 1, 1, 1]);
    expect(s.decision!.kind).toBe("trigger");
  });
  it("罗德岛二级按放置后的航道影响力发放金券，等待选择可恢复", () => {
    let s = fixture();
    const before = s.players[0].wallet.cash;
    s = effect(s, [
      { kind: "trigger", actor: "p0", data: { company: "rhodes" } },
    ]);
    s = choose(s, "rhodes:2");
    expect(s.players[0].wallet.cash).toBe(before);
    const restored = JSON.parse(JSON.stringify(s));
    s = choose(s, "A-2:0");
    expect(s.players[0].wallet.cash).toBe(before + 2);
    expect(choose(restored, "A-2:0")).toEqual(s);
  });
  it("罗德岛二级无法部署时仍按现有航道影响力结算", () => {
    let s = fixture();
    s.players[0].tokenLimit = 8;
    const before = s.players[0].wallet.cash;
    s = effect(s, [
      { kind: "trigger", actor: "p0", data: { company: "rhodes" } },
    ]);
    s = choose(s, "rhodes:2");
    expect(s.decision).toBeNull();
    expect(s.players[0].wallet.cash).toBe(before + 1);
  });
  it.each(VERIFIED_ENTERPRISES)(
    "%s：1–5 级触发与升级奖励均可结算",
    (company) => {
      for (let level = 1; level <= 5; level++) {
        let s = fixture();
        s.players[0].enterprise[company] = level - 1;
        s = effect(s, [
          { kind: "upgrade-at", actor: "p0", data: { company, count: 1 } },
          { kind: "trigger", actor: "p0", data: { company } },
        ]);
        s = settle(s);
        expect(s.players[0].enterprise[company]).toBe(level);
        expect(s.queue).toEqual([]);
      }
    },
  );
  it("富森银行 3 级的金券先给自己，再给所有对手", () => {
    let s = fixture();
    s = effect(s, [
      { kind: "trigger", actor: "p0", data: { company: "bank" } },
    ]);
    s = choose(s, "bank:3");
    expect(s.players.map((p) => p.wallet.cash)).toEqual([120, 104, 104]);
  });
  it("海德四级仅免费建设新供应区设施，不能取可露希尔暂存牌", () => {
    let s = fixture();
    const stash = s.facilityDeck.splice(0, 1);
    s.players[0].persistent = [{ roleId: "closure", markers: 0, stash }];
    s = effect(s, [
      { kind: "trigger", actor: "p0", data: { company: "heide" } },
    ]);
    s = choose(s, "heide:4");
    s = choose(s, "yes");
    expect(s.players[0].wallet.rock).toBe(94);
    expect(s.market).toHaveLength(6);
    const builds = s.decision!.options.filter((o) => o.id.endsWith(":free"));
    expect(builds.length).toBeGreaterThan(0);
    expect(
      builds.every((o) => s.market.some((card) => o.id.startsWith(card + ":"))),
    ).toBe(true);
    expect(builds.some((o) => o.id.startsWith(stash[0] + ":"))).toBe(false);
    s = settle(choose(s, builds[0].id));
    expect(s.players[0].persistent[0].stash).toEqual(stash);
  });
  it("正式企业池包含八家原版企业，四人初始配牌每人有两家不同候选", () => {
    expect(VERIFIED_ENTERPRISES).toHaveLength(8);
    for (let seed = 1; seed < 20; seed++) {
      let s = createGame(
        [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}` })),
        { expansion: true, seed },
      );
      const candidates = new Set<string>();
      for (let player = 0; player < 4; player++) {
        expect(s.decision!.kind).toBe("company-draft");
        expect(s.decision!.options).toHaveLength(2);
        for (const option of s.decision!.options) candidates.add(option.id);
        s = choose(s);
      }
      expect(candidates).toEqual(new Set(VERIFIED_ENTERPRISES));
      expect(s.activeEnterprises).toHaveLength(4);
    }
  });
});

describe("城市样式和收尾边界", () => {
  it.each(PATTERNS.filter((p) => !p.oripathy))(
    "$name：宣告得分和特殊行动可自动裁定",
    (pattern) => {
      let s = fixture();
      s.patterns = [pattern.id];
      s.players[0].built = {};
      for (const [row, col, colors] of pattern.shape) {
        const id =
          colors.split("|")[0] === "blue"
            ? "trade"
            : colors.split("|")[0] === "red"
              ? "garage"
              : "industrial";
        s.players[0].built[String(row * 3 + col)] = { cardId: id, used: false };
      }
      s = settle(
        applyCommand(s, "p0", { type: "declare", patternId: pattern.id }),
      );
      expect(s.players[0].wallet.score).toBe(pattern.score);
      expect(s.players[0].claims[0].uses).toBe(pattern.level === 2 ? 2 : -1);
      if (pattern.effect !== "relay") {
        s = settle(
          applyCommand(s, "p0", { type: "special", patternId: pattern.id }),
        );
        expect(s.players[0].claims[0].cooldown).toBe(1);
        expect(s.queue).toEqual([]);
      } else
        expect(s.players[0].wallet).toMatchObject({
          rock: 101,
          ore: 101,
          iron: 101,
        });
    },
  );
  it("工业中枢消费一次特殊行动，提供两次普通主要行动且本轮禁用角色", () => {
    let s = fixture();
    s.players[0].claims = [
      { patternId: "industrial-core", cooldown: 0, uses: 2 },
    ];
    s = applyCommand(s, "p0", {
      type: "special",
      patternId: "industrial-core",
    });
    s = choose(s, "yes");
    expect(s.mainRemaining).toBe(2);
    expect(s.players[0].wallet.cash).toBe(94);
    expect(
      getLegalActions(s, "p0").some(
        (a) => a.command.type === "role" || a.command.type === "special",
      ),
    ).toBe(false);
    for (let i = 0; i < 2; i++)
      s = settle(applyCommand(s, "p0", { type: "main", action: "deploy" }));
    expect(s.mainDone).toBe(true);
    expect(getLegalActions(s, "p0").some((a) => a.id === "end")).toBe(true);
  });
  it("同一回合多次宣告同一样式不重置特殊行动冷却", () => {
    let s = fixture();
    s.players[0].claims = [{ patternId: "mobilize", cooldown: 0, uses: -1 }];
    s.patterns.push("mobilize");
    s = settle(
      applyCommand(s, "p0", { type: "special", patternId: "mobilize" }),
    );
    s.players[0].built = {
      "0": { cardId: "industrial", used: false },
      "1": { cardId: "industrial", used: false },
      "2": { cardId: "escort", used: false },
    };
    s = settle(
      applyCommand(s, "p0", { type: "declare", patternId: "mobilize" }),
    );
    expect(s.players[0].claims.map((c) => c.cooldown)).toEqual([1, 1]);
  });
  it("多个收尾效果由玩家选择顺序，序列化后保持等待和顺序", () => {
    let s = fixture();
    s.players[0].persistent = [{ roleId: "mudrock", markers: 0, stash: [] }];
    s.scheduled = [
      {
        at: "cleanup",
        step: { kind: "remove", actor: "p0", data: { count: 1, who: "self" } },
      },
    ];
    s = effect(s, [{ kind: "cleanup", actor: "p0" }]);
    expect(s.decision!.kind).toBe("cleanup-order");
    expect(s.decision!.options).toHaveLength(2);
    const next = choose(s, "1");
    const restored = choose(JSON.parse(JSON.stringify(s)), "1");
    expect(restored).toEqual(next);
    expect(next.decision!.kind).toBe("optional");
  });
  it("最终同分按金券、至纯源石决定，共同胜利也可复现", () => {
    let s = fixture();
    s.round = 8;
    for (const site of Object.values(s.sites)) site.slots.fill(null);
    for (const p of s.players) {
      p.city = null;
      p.wallet = { rock: 0, ore: 0, iron: 0, prime: 0, cash: 5, score: 10 };
      p.selected = null;
    }
    s.players[1].wallet.cash = 6;
    s = effect(s, [{ kind: "next-round", actor: "p0" }]);
    expect(s.winners).toEqual(["p1"]);
    s = fixture();
    s.round = 8;
    for (const site of Object.values(s.sites)) site.slots.fill(null);
    for (const p of s.players) {
      p.city = null;
      p.wallet = { rock: 0, ore: 0, iron: 0, prime: 0, cash: 5, score: 10 };
      p.selected = null;
    }
    s = effect(s, [{ kind: "next-round", actor: "p0" }]);
    expect(s.winners).toEqual(["p0", "p1", "p2"]);
  });
});

describe("事件牌分支", () => {
  it.each(EVENTS)("$name：每个牌面选项都可独立结算", (event) => {
    for (let i = 0; i < event.options.length; i++) {
      let s = fixture();
      s.expansion = false;
      const node = s.board.nodes.find((n) => n.tier === event.tier)!.id;
      s.sites[node].resource = null;
      s.eventDecks[event.tier] = [event.id];
      s = effect(s, [{ kind: "discover", actor: "p0", data: { node } }]);
      s = settle(choose(s, String(i)));
      expect(s.sites[node]).toMatchObject({
        resource: event.resource,
        amount: event.amount,
      });
      if (event.options[i].gain)
        for (const [key, value] of Object.entries(event.options[i].gain!)) {
          const initial =
            key === "cash"
              ? 100
              : key === "score"
                ? 0
                : key === "prime"
                  ? 10
                  : 100;
          expect(s.players[0].wallet[key as Resource]).toBe(initial + value);
        }
    }
  });
});
