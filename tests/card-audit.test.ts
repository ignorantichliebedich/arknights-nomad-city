import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  getLegalActions,
  patternMatches,
  projectView,
} from "../packages/rules/src/engine.ts";
import {
  FACILITY_BY_ID,
  facilityText,
  ROLE_BY_ID,
} from "../packages/rules/src/data.ts";
import type { GameState, Step } from "../packages/rules/src/types.ts";
import { chooseFor, paulHarvest } from "./fixtures/parallel.ts";

// Expected outcomes are transcribed from the printed cards and official
// clarifications, independently of their effect definitions. See docs/card-audit.md.
function choose(s: GameState, key?: string): GameState {
  const d = s.decision!;
  expect(d).toBeTruthy();
  const o = key
    ? d.options.find((v) => v.id === key)
    : (d.options.find((v) => ["done", "skip", "no", "keep"].includes(v.id)) ??
      d.options[0]);
  expect(o, `${d.title}: ${key ?? "可选项"}`).toBeTruthy();
  return applyCommand(s, d.playerId, { type: "choose", optionId: o!.id });
}
function settle(s: GameState): GameState {
  for (let i = 0; s.decision; i++) {
    expect(i).toBeLessThan(200);
    s = choose(s);
  }
  return s;
}
function fixture(oripathy = false, count = 3): GameState {
  let s = createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `玩家${i}`,
    })),
    { expansion: true, oripathy, expert: false, seed: 42 },
  );
  for (let i = 0; s.phase !== "actions"; i++) {
    expect(i).toBeLessThan(300);
    s = choose(s);
  }
  s.active = 0;
  for (const site of Object.values(s.sites)) site.slots.fill(null);
  for (const node of s.board.nodes) {
    s.sites[node.id].resource = "ore";
    s.sites[node.id].amount = 1;
  }
  for (const p of s.players) {
    p.wallet = {
      rock: 100,
      ore: 100,
      iron: 100,
      prime: 10,
      cash: 100,
      score: 0,
    };
    p.persistent = [];
    p.claims = [];
  }
  return s;
}
function effect(
  s: GameState,
  kind: string,
  data: Record<string, unknown> = {},
): GameState {
  s.parallel = null;
  s.queue = [];
  s.decision = {
    playerId: "p0",
    title: "牌面结算场景",
    kind: "fixture",
    options: [
      {
        id: "run",
        label: "执行",
        steps: [{ kind, actor: "p0", data } as Step],
      },
    ],
  };
  return choose(s, "run");
}
function build(s: GameState, card: string, cell = "0"): GameState {
  s.market.unshift(`${card}@audit`);
  return choose(
    applyCommand(s, "p0", { type: "main", action: "build" }),
    `${card}@audit:${cell}:cash`,
  );
}
const countMarks = (s: GameState, id: string) =>
  Object.values(s.sites).reduce(
    (n, site) => n + site.slots.filter((v) => v === id).length,
    0,
  );
const claim = (patternId: string) => ({ patternId, cooldown: 0, uses: -1 });

describe("原牌复核：设施费用、唯一与入场", () => {
  it("彩色工程营可以充当样式的红格，但不计工业区折扣和附属能源复制", () => {
    const s = fixture();
    const p = s.players[0];
    p.built["0"] = { cardId: "industrial", used: false };
    p.built["1"] = { cardId: "excavator", used: false };
    p.built["2"] = { cardId: "camp", used: false };
    expect(patternMatches(p, "mobilize")).toContainEqual(["0", "1", "2"]);
    s.market = ["industrial@audit", "energy@audit"];
    const built = choose(
      applyCommand(s, "p0", { type: "main", action: "build" }),
      "industrial@audit:3:resources",
    );
    expect(built.players[0].wallet.rock).toBe(97);
    p.built["4"] = { cardId: "quarry-yellow", used: false };
    const copy = build(s, "energy", "5");
    expect(copy.decision?.kind).toBe("copy");
    expect(copy.decision!.options.map((o) => o.id)).toEqual(["4"]);
  });
  it("简陋工程营给予付费建设，不能凭空免费造下一张设施", () => {
    let s = fixture();
    s.market = ["camp@audit", "quarry-red@next"];
    s.facilityDeck = [];
    s = choose(
      applyCommand(s, "p0", { type: "main", action: "build" }),
      "camp@audit:0:resources",
    );
    expect(s.decision?.kind).toBe("build");
    expect(s.decision!.options.every((o) => !o.id.endsWith(":free"))).toBe(
      true,
    );
    s = choose(s, "quarry-red@next:1:resources");
    expect(s.players[0].wallet).toMatchObject({
      rock: 104,
      ore: 98,
      iron: 99,
      score: -1,
    });
    expect(FACILITY_BY_ID.camp.unique).toBe(true);
    expect(facilityText("camp")).toContain("照常支付");
  });
  it.each([false, true])(
    "简陋工程营唯一限制包含被叠放的旧设施：%s",
    (buried) => {
      const s = fixture(true);
      s.players[0].oripathy!.entrepreneur = "martin";
      s.players[0].built["0"] = buried
        ? {
            cardId: "administration",
            used: false,
            layers: [{ cardId: "camp", used: false }],
          }
        : { cardId: "camp", used: false };
      s.market = ["camp@duplicate"];
      s.facilityDeck = [];
      expect(
        getLegalActions(s, "p0").some((a) => a.command.action === "build"),
      ).toBe(false);
    },
  );
  it("贸易街区单价为源岩3、源石3、异铁4、至纯源石15", () => {
    let s = build(fixture(), "trade");
    for (const resource of ["rock", "ore", "iron", "prime"])
      s = choose(s, `${resource}:1`);
    s = choose(s, "done");
    expect(s.players[0].wallet).toMatchObject({
      rock: 99,
      ore: 99,
      iron: 99,
      prime: 9,
      cash: 119,
    });
  });
  it.each([
    ["0", 8],
    ["4", 12],
  ])("城市化区域建在%s：以核心为中心，计入彩色设施与自身", (cell, gain) => {
    const s = fixture();
    s.players[0].built["6"] = { cardId: "administration", used: false };
    s.players[0].built["10"] = { cardId: "quarry-red", used: false };
    const next = build(s, "urban", cell as string);
    expect(next.players[0].wallet.cash).toBe(100 - 16 + Number(gain));
  });
  it("双核心相邻范围取设施并集，覆盖层只计算顶牌", () => {
    const s = fixture(true);
    s.players[0].built["1"] = { cardId: "core", used: false };
    s.players[0].built["4"] = {
      cardId: "camp",
      used: false,
      layers: [{ cardId: "quarry-red", used: false }],
    };
    const next = build(s, "urban");
    expect(next.players[0].wallet.cash).toBe(100 - 16 + 8);
  });
  it("附属能源复制城市化区域时，仍按核心相邻设施结算", () => {
    const s = fixture();
    for (const [cell, cardId] of Object.entries({
      0: "urban",
      6: "administration",
      10: "quarry-red",
    }))
      s.players[0].built[cell] = { cardId, used: false };
    let next = build(s, "energy", "3");
    next = choose(next, "0");
    expect(next.players[0].wallet.cash).toBe(100 - 23 + 8);
  });
  it("马丁分享本体城市化区域，对手按自己的核心相邻情况获益", () => {
    let s = fixture(true);
    s.players[0].oripathy!.entrepreneur = "martin";
    s.players[1].built["6"] = { cardId: "administration", used: false };
    s = build(s, "urban");
    expect(s.decision?.kind).toBe("o:share-urban");
    s = choose(s, "p1");
    expect(s.players[0].wallet.cash).toBe(84);
    expect(s.players[1].wallet.cash).toBe(104);
  });
  it.each(["replace", "place"])(
    "佣兵指挥部选择%s后结束，不再自动执行另一项",
    (branch) => {
      let s = fixture();
      s.sites["D-1"].slots[0] = "p1";
      s = build(s, "mercenary");
      expect(s.decision?.kind).toBe("mercenary");
      s = choose(s, branch);
      s = choose(s, branch === "replace" ? "D-1:0" : s.decision!.options[0].id);
      expect(s.decision).toBeNull();
      expect(countMarks(s, "p0")).toBe(1);
      expect(countMarks(s, "p1")).toBe(branch === "replace" ? 0 : 1);
    },
  );
});

describe("原牌复核：角色与选择数量", () => {
  it.each([2, 1])(
    "雷蛇先策略后计谋，剩 %i 枚帮派标记时按合法库存放置",
    (available) => {
      let s = fixture(true, 4);
      s.round = 8;
      s.first = 0;
      const paul = s.players[0];
      paul.selected = "liskarm";
      paul.oripathy!.entrepreneur = "paul";
      paul.oripathy!.dilemmas = [
        { round: 3, side: "B", marker: false, used: false },
      ];
      paul.oripathy!.gangSlots = ["D-1:0", "D-1:1", "R-3:0"].slice(
        0,
        4 - available,
      );
      for (const [site, index] of paul.oripathy!.gangSlots.map((slot) =>
        slot.split(":"),
      ))
        s.sites[site].slots[Number(index)] = "p0";
      s.sites["E-02"].slots[0] = "p1";
      const before = countMarks(s, "p0");
      s = applyCommand(s, "p0", { type: "role", mode: "strategy-tactic" });
      expect(s.decision?.title).toContain("剩 2 次");
      s = choose(choose(s, "C-2:0"), "gang");
      if (available === 2) {
        s = JSON.parse(JSON.stringify(s)) as GameState;
        expect(s.decision?.title).toContain("剩 1 次");
        s = choose(choose(s, "A-2:0"), "gang");
      }
      expect(s.decision?.kind).toBe("optional");
      expect(
        s.log.some((entry) =>
          entry.text.includes("跳过 1 次放置影响力（帮派标记已用完）"),
        ),
      ).toBe(available === 1);
      expect(countMarks(s, "p0")).toBe(before + available);
      s = choose(choose(s, "yes"), "E-02:0");
      expect(s.players[0].wallet.cash).toBe(97);
      expect(s.sites["E-02"].slots[0]).toBeNull();
      expect(s.log.map((entry) => entry.text)).toContain(
        "替换后未补放影响力（帮派标记已用完）",
      );
      expect(s.scheduled).toContainEqual({
        at: "cleanup",
        step: { kind: "remove", actor: "p0", data: { count: 1, who: "self" } },
      });
    },
  );
  it("W替换两名不同对手各一枚，不能第二次选同一对手", () => {
    let s = fixture();
    s.players[0].selected = "w";
    s.sites["D-1"].slots = ["p1", "p2"];
    s.sites["A-1"].slots[0] = "p1";
    s = choose(applyCommand(s, "p0", { type: "role", mode: "tactic" }), "yes");
    s = choose(s, "D-1:0");
    expect(s.sites["D-1"].slots[0]).toBe("p0");
    expect(s.decision!.options.map((o) => o.id)).toEqual(["D-1:1"]);
    s = choose(s, "D-1:1");
    expect(s.sites["D-1"].slots).toEqual(["p0", "p0"]);
    expect(s.players[0].wallet.cash).toBe(96);
    expect(s.players[0].removed).toContain("w");
  });
  it("银灰由使用者依次移除所有玩家各一枚，包含自己，安保不属于玩家", () => {
    let s = fixture(true);
    s.players[0].selected = "silverash";
    s.sites["A-1"].slots[0] = "p0";
    s.sites["D-1"].slots = ["p1", "p2"];
    s.oripathy!.security = ["A-1:1"];
    s = applyCommand(s, "p0", { type: "role", mode: "tactic" });
    for (const slot of ["A-1:0", "D-1:0", "D-1:1"]) {
      expect(s.decision).toMatchObject({ kind: "remove", playerId: "p0" });
      s = choose(s, slot);
    }
    expect(s.players.every((p) => countMarks(s, p.id) === 0)).toBe(true);
    expect(s.oripathy!.security).toEqual(["A-1:1"]);
    expect(s.players[0].removed).toContain("silverash");
  });
  it("泥岩策略先付1源岩，再支付设施费用建设", () => {
    let s = fixture();
    s.players[0].selected = "mudrock";
    s.market = ["quarry-red@next"];
    s.facilityDeck = [];
    s = choose(
      applyCommand(s, "p0", { type: "role", mode: "strategy" }),
      "yes",
    );
    expect(s.decision?.kind).toBe("build");
    s = choose(s, "quarry-red@next:0:resources");
    expect(s.players[0].wallet).toMatchObject({ rock: 105, ore: 99, iron: 99 });
    expect(countMarks(s, "p0")).toBe(0);
  });
  it.each(["closure", "eunectes"])(
    "%s允许取0张，且可露希尔不留下空持续状态",
    (role) => {
      let s = fixture();
      s.players[0].selected = role;
      const market = [...s.market];
      s = choose(
        applyCommand(s, "p0", { type: "role", mode: "tactic" }),
        "done",
      );
      expect(s.decision).toBeNull();
      expect(s.market).toEqual(market);
      expect(s.players[0].persistent).toEqual([]);
      expect(s.players[0].discard).toContain(role);
      expect(s.players[0].wallet.iron).toBe(role === "eunectes" ? 103 : 100);
    },
  );
  it("可露希尔允许只取一张；付费建设该张后才结束持续效果", () => {
    let s = fixture();
    s.players[0].selected = "closure";
    s.market = [
      "quarry-red@one",
      "quarry-yellow@same-name",
      "administration@other",
    ];
    s.facilityDeck = [];
    s = choose(
      applyCommand(s, "p0", { type: "role", mode: "tactic" }),
      "quarry-red@one",
    );
    expect(s.decision!.options.map((o) => o.id)).not.toContain(
      "quarry-yellow@same-name",
    );
    s = choose(s, "done");
    expect(s.players[0].persistent[0].stash).toEqual(["quarry-red@one"]);
    s = choose(
      applyCommand(s, "p0", { type: "main", action: "build" }),
      "quarry-red@one:0:cash",
    );
    expect(s.players[0].wallet.cash).toBe(90);
    expect(s.players[0].persistent).toEqual([]);
    expect(s.players[0].discard).toContain("closure");
  });
  it("森蚺仅移动本次城市路径中的对手标记，保持数量，不触发多萝西移除回调", () => {
    let s = fixture();
    s.players[0].selected = "eunectes";
    s.players[1].persistent = [{ roleId: "dorothy", markers: 0, stash: [] }];
    s = applyCommand(s, "p0", { type: "role", mode: "strategy" });
    const o = s.decision!.options[0];
    const move = o.steps.find((v) => v.kind === "relocate")!.data! as {
      road: string;
      to: string;
    };
    s.sites[move.road].slots[0] = "p1";
    s.sites[move.to].slots = ["p1", "p2"];
    const unrelated = s.board.nodes.find(
      (n) => n.id !== move.to && !s.players.some((p) => p.city === n.id),
    )!.id;
    s.sites[unrelated].slots[0] = "p2";
    s = choose(s, o.id);
    for (let i = 0; i < 3; i++) {
      expect(s.decision?.kind).toBe("shift-to");
      expect(s.decision!.options.every((v) => v.target !== move.to)).toBe(true);
      s = choose(s);
    }
    s = settle(s);
    expect(countMarks(s, "p1")).toBe(2);
    expect(countMarks(s, "p2")).toBe(2);
    expect(s.sites[unrelated].slots[0]).toBe("p2");
    expect(s.players[1].persistent[0].markers).toBe(0);
  });
  it("森蚺同样移动本次路径的中立安保，存档重放保留精确起点", () => {
    let s = fixture(true);
    s.players[0].selected = "eunectes";
    s = applyCommand(s, "p0", { type: "role", mode: "strategy" });
    const o = s.decision!.options[0];
    const move = o.steps.find((v) => v.kind === "relocate")!.data! as {
      road: string;
    };
    s.oripathy!.security = [`${move.road}:0`];
    s = choose(s, o.id);
    expect(s.decision?.kind).toBe("o:security-destination");
    const restored = JSON.parse(JSON.stringify(s)) as GameState;
    expect(settle(restored)).toEqual(settle(s));
    const final = settle(s);
    expect(final.oripathy!.security).toHaveLength(1);
    expect(final.oripathy!.security).not.toContain(`${move.road}:0`);
  });
  it("赫默只借用Ⅰ级的特殊行动，立即奖励样式不列入；无自己的宣告标记时军工收益为0", () => {
    let s = fixture(true);
    s.players[0].selected = "o-silence";
    s.patterns = [
      "military",
      "mobilize",
      "relay",
      "o-emerging",
      "o-management",
      "industrial-core",
    ];
    s.players[1].claims = [claim("military"), claim("military")];
    s = applyCommand(s, "p0", { type: "role", mode: "strategy" });
    expect(s.decision!.options.map((o) => o.id)).toEqual([
      "military",
      "mobilize",
    ]);
    s = choose(s, "military");
    expect(s.decision).toBeNull();
    expect(countMarks(s, "p0")).toBe(0);
    expect(s.players[1].claims.every((v) => v.cooldown === 0)).toBe(true);
    expect(s.players[0].claims).toEqual([]);
    expect(ROLE_BY_ID["o-silence"].strategy).toContain("Ⅰ级");
  });
  it("赫默借用时按自己的标记数量结算，但不消耗或翻转标记", () => {
    let s = fixture(true);
    s.players[0].selected = "o-silence";
    s.patterns = ["military"];
    s.players[0].claims = [{ ...claim("military"), cooldown: 1 }];
    s.players[1].claims = [claim("military"), claim("military")];
    s = settle(
      choose(
        applyCommand(s, "p0", { type: "role", mode: "strategy" }),
        "military",
      ),
    );
    expect(countMarks(s, "p0")).toBe(1);
    expect(s.players[0].claims[0].cooldown).toBe(1);
  });
  it("流形丙计谋只升级一级，随后退役", () => {
    let s = fixture(true);
    s.players[0].selected = "o-flow-c";
    s.activeEnterprises = ["bank"];
    s.players[0].enterprise = { bank: 1 };
    s = choose(applyCommand(s, "p0", { type: "role", mode: "tactic" }), "bank");
    expect(s.players[0].enterprise.bank).toBe(2);
    expect(s.players[0].removed).toContain("o-flow-c");
    expect(s.players[0].discard).not.toContain("o-flow-c");
  });
});

describe("原牌复核：保罗的帮派影响力", () => {
  const plan = (s: GameState) => projectView(s, "p0").decision!;
  const toll = (s: GameState) =>
    plan(s)
      .options.find((o) => o.id === "done")!
      .preview!.tolls!.reduce((sum, { amount }) => sum + amount, 0);

  it("隐蔽运输允许零金券采集帮派点；普通点与 A 面照常受路费预算限制", () => {
    const a = paulHarvest(fixture(true, 4), "A", 0);
    expect(plan(a).options.some((o) => o.id === "A-02")).toBe(false);
    let b = paulHarvest(fixture(true, 4), "B", 0);
    const before = b.players[0].wallet.rock;
    expect(plan(b).options.some((o) => o.id === "A-03")).toBe(false);
    b = chooseFor(b, "p0", "A-02");
    expect(toll(b)).toBe(0);
    expect(plan(b).map).toMatchObject({
      selected: ["A-02"],
      tollExemptNodes: ["A-02"],
    });
    for (const p of b.players) b = chooseFor(b, p.id, "done");
    expect(b.players[0].wallet).toMatchObject({ cash: 0, rock: before + 2 });
  });

  it.each([
    ["A-02", "A-03"],
    ["A-03", "A-02"],
  ])(
    "混采 %s、%s 时只为普通点支付共用航道，撤回普通点后归零",
    (first, second) => {
      let s = paulHarvest(fixture(true, 4), "B", 2);
      const before = s.players.map((p) => ({ ...p.wallet }));
      for (const node of [first, second]) s = chooseFor(s, "p0", node);
      expect(toll(s)).toBe(2);
      expect(plan(s).map?.roads).toEqual(["A-2"]);
      s = chooseFor(s, "p0", "unselect:A-03");
      expect(toll(s)).toBe(0);
      s = chooseFor(s, "p0", "A-03");
      s = chooseFor(s, "p0", "done");
      expect(plan(s).kind).toBe("toll");
      s = chooseFor(s, "p0", "p1");
      expect(s.players.map((p) => p.wallet)).toEqual(before);
      for (const p of s.players.slice(1)) s = chooseFor(s, p.id, "done");
      expect(s.players[0].wallet).toMatchObject({
        cash: 0,
        rock: before[0].rock + 2,
        iron: before[0].iron + 1,
      });
      expect(s.players[1].wallet.cash).toBe(before[1].cash + 2);
    },
  );

  it.each([true, false])(
    "旧存档未确认采集会按隐蔽运输重算（有路线快照：%s）",
    (hasMap) => {
      let s = chooseFor(paulHarvest(fixture(true, 4), "A", 2), "p0", "A-02");
      expect(toll(s)).toBe(2);
      s.players[0].oripathy!.dilemmas[0].side = "B";
      if (!hasMap) delete s.parallel!.players.p0.decision!.map;
      s = JSON.parse(JSON.stringify(s)) as GameState;
      const before = JSON.stringify(s);
      expect(toll(s)).toBe(0);
      expect(plan(s).map?.selected).toEqual(["A-02"]);
      expect(JSON.stringify(s)).toBe(before);
      s = chooseFor(s, "p0", "done");
      expect(projectView(s, "p0").parallel?.ready).toContain("p0");
      for (const p of s.players.slice(1)) s = chooseFor(s, p.id, "done");
      expect(s.players[0].wallet.cash).toBe(2);
    },
  );

  it.each(["A", "B"] as const)(
    "保罗第五回合 %s 面的收获可用岩蹄安保凑足两枚影响力",
    (side) => {
      let s = fixture(true, 4);
      s.oripathy!.expert = true;
      const p = s.players[0];
      p.city = "B-03";
      p.oripathy!.entrepreneur = "paul";
      p.oripathy!.dilemmas = [{ round: 5, side, used: false, marker: true }];
      p.oripathy!.gangSlots = ["A-02:0", "A-02:1"];
      s.sites["A-02"].slots = ["p0", "p0"];
      s.sites["B-03"].slots[0] = "p1";
      s.oripathy!.security = ["B-03:1"];
      const action = { type: "ability", action: "dilemma:5:quick" } as const;
      expect(getLegalActions(s, "p0").map((a) => a.command)).toContainEqual(
        action,
      );
      s = applyCommand(s, "p0", action);
      s = choose(choose(s, "B-03:1"), "B-03:0");
      expect(s.oripathy!.security).toEqual([]);
      expect(s.sites["B-03"].slots[0]).toBeNull();
      expect(s.players[0].wallet.ore).toBe(101);
      expect(getLegalActions(s, "p0").map((a) => a.command)).not.toContainEqual(
        action,
      );
    },
  );

  it("民心所向的双标记资源点也禁止保罗自己移动进入", () => {
    const s = fixture(true, 4);
    const p = s.players[0];
    p.city = "B-03";
    s.players[1].city = "A-01";
    s.players[2].city = "B-01";
    s.players[3].city = "C-01";
    p.oripathy!.entrepreneur = "paul";
    p.oripathy!.dilemmas = [{ round: 5, side: "B", used: false, marker: true }];
    p.oripathy!.gangSlots = ["A-02:0"];
    s.sites["A-02"].slots = ["p0", "p0"];
    const destinations = (state: GameState) =>
      projectView(state, "p0").cityDestinations!.map((v) => v.target);
    expect(destinations(s)).not.toContain("A-02");
    expect(
      effect(structuredClone(s), "o:gavial-city").decision!.options.map(
        (o) => o.id,
      ),
    ).not.toContain("A-02");
    s.sites["A-02"].slots[1] = null;
    expect(destinations(s)).toContain("A-02");
  });
});

describe("原牌复核：奖励时机、事件范围与额外主要行动", () => {
  it("梅兰德四级授勋在升级时发生，不能作为已解锁特效反复触发", () => {
    let s = fixture(true);
    s.activeEnterprises = ["maylander"];
    s.players[0].enterprise = { maylander: 3 };
    s = effect(s, "upgrade-at", { company: "maylander", count: 1 });
    expect(s.decision?.kind).toBe("o:award-select");
    s = choose(s, "1185");
    expect(s.players[0].wallet.score).toBe(1);
    s = effect(s, "trigger", { company: "maylander" });
    expect(s.decision!.options.map((o) => o.id)).toEqual([
      "maylander:1",
      "maylander:2",
      "maylander:3",
    ]);
  });
  it.each([
    ["yellow-4", "yellow", false],
    ["red-0", "red", true],
  ])(
    "%s的局部部署范围按原牌区分资源点与相邻航道",
    (event, tier, nodeAllowed) => {
      let s = fixture(false, 4);
      s.round = 6;
      const node = s.board.nodes.find(
        (n) => n.tier === tier && !s.players.some((p) => p.city === n.id),
      )!.id;
      s.sites[node].resource = null;
      s.eventDecks[tier as string] = [event as string];
      s = choose(
        effect(s, "discover", { node }),
        event === "red-0" ? "2" : "0",
      );
      expect(s.decision?.kind).toBe("place");
      const targets = new Set(s.decision!.options.map((o) => o.target));
      expect(targets.has(node)).toBe(nodeAllowed);
      for (const target of targets)
        expect(
          target === node ||
            s.board.roads.some(
              (r) => r.id === target && r.nodes.includes(node),
            ),
        ).toBe(true);
    },
  );
  it("源石工业中枢的两次额外行动可以执行特殊行动，快速宣告仍可穿插", () => {
    let s = fixture();
    s.patterns = ["industrial-core", "mobilize", "military", "relay"];
    s.players[0].selected = "tinman";
    s.players[0].claims = [
      { patternId: "industrial-core", cooldown: 0, uses: 2 },
      claim("mobilize"),
      claim("military"),
    ];
    s.players[0].built["0"] = { cardId: "quarry-red", used: false };
    s.players[0].built["1"] = { cardId: "quarry-yellow", used: false };
    s = choose(
      applyCommand(s, "p0", { type: "special", patternId: "industrial-core" }),
      "yes",
    );
    expect(s.mainRemaining).toBe(2);
    expect(s.players[0].wallet.cash).toBe(94);
    expect(
      getLegalActions(s, "p0").some((a) => a.command.type === "declare"),
    ).toBe(true);
    expect(
      getLegalActions(s, "p0").some((a) => a.command.type === "role"),
    ).toBe(false);
    s = settle(
      applyCommand(s, "p0", { type: "special", patternId: "mobilize" }),
    );
    s = settle(
      applyCommand(s, "p0", { type: "special", patternId: "military" }),
    );
    expect(s.mainDone).toBe(true);
    expect(countMarks(s, "p0")).toBe(2);
  });
  it("工业行动与商业区的普通行动混合，先花受限次数并在恢复后保留特殊行动额度", () => {
    let s = fixture();
    s.patterns = ["industrial-core", "commercial", "mobilize"];
    s.players[0].claims = [
      { patternId: "industrial-core", cooldown: 0, uses: 2 },
      claim("commercial"),
      claim("mobilize"),
    ];
    s = choose(
      applyCommand(s, "p0", { type: "special", patternId: "industrial-core" }),
      "yes",
    );
    s = settle(
      applyCommand(s, "p0", { type: "special", patternId: "commercial" }),
    );
    expect(s.mainRemaining).toBe(2);
    expect(s.ordinaryMainRemaining).toBe(1);
    s = settle(
      applyCommand(JSON.parse(JSON.stringify(s)), "p0", {
        type: "main",
        action: "deploy",
      }),
    );
    expect(s.mainRemaining).toBe(1);
    expect(s.ordinaryMainRemaining).toBe(0);
    expect(s.extraOnly).toBe(false);
    s = settle(
      applyCommand(s, "p0", { type: "special", patternId: "mobilize" }),
    );
    expect(s.mainDone).toBe(true);
  });
  it("旧存档的普通额外行动仍不能执行特殊行动", () => {
    const s = fixture();
    delete s.ordinaryMainRemaining;
    s.extraOnly = true;
    s.mainRemaining = 1;
    s.players[0].claims = [claim("mobilize")];
    expect(
      getLegalActions(s, "p0").some((a) => a.command.type === "special"),
    ).toBe(false);
    const next = settle(
      applyCommand(s, "p0", { type: "main", action: "deploy" }),
    );
    expect(next.mainDone).toBe(true);
    expect(next.mainRemaining).toBe(0);
  });
  it("赫默借用商业区取得普通额外行动后，原有的主要行动仍可用于特殊行动", () => {
    let s = fixture(true);
    s.players[0].selected = "o-silence";
    s.patterns = ["commercial", "mobilize"];
    s.players[0].claims = [claim("mobilize")];
    s = settle(
      choose(
        applyCommand(s, "p0", { type: "role", mode: "strategy" }),
        "commercial",
      ),
    );
    expect(s.mainRemaining).toBe(2);
    expect(s.extraOnly).toBe(false);
    s = settle(
      applyCommand(s, "p0", { type: "special", patternId: "mobilize" }),
    );
    expect(s.mainRemaining).toBe(1);
    expect(s.extraOnly).toBe(true);
    expect(
      getLegalActions(s, "p0").every((a) => a.command.type !== "special"),
    ).toBe(true);
    s = settle(applyCommand(s, "p0", { type: "main", action: "deploy" }));
    expect(s.mainDone).toBe(true);
  });
});
