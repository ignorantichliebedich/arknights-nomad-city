import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  getLegalActions,
  patternMatches,
  projectView,
  scoreGame,
} from "../packages/rules/src/engine.ts";
import {
  FACILITY_BY_ID,
  ROLE_BY_ID,
  VERIFIED_ENTERPRISES,
} from "../packages/rules/src/data.ts";
import {
  AMIYA,
  FLOW_ROLES,
  ORIPATHY_FACILITIES,
  ORIPATHY_OPERATIVES,
  ORIPATHY_RULES_VERSION,
  ENTREPRENEURS,
} from "../packages/rules/src/oripathy-data.ts";
import type { GameState, Step } from "../packages/rules/src/types.ts";
import { chooseBotAction } from "../packages/rules/src/bot.ts";

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `企业家 ${i}` }));
function choose(s: GameState, key?: string): GameState {
  const d = s.decision!;
  expect(d).toBeTruthy();
  const option = key
    ? d.options.find((v) => v.id === key)
    : (d.options.find((v) => ["done", "skip", "no", "keep"].includes(v.id)) ??
      d.options[0]);
  expect(option, `${d.kind} 缺少 ${key ?? "可选项"}`).toBeTruthy();
  return applyCommand(s, d.playerId, { type: "choose", optionId: option!.id });
}
function settle(s: GameState): GameState {
  for (let n = 0; s.decision; n++) {
    expect(n, s.decision.kind).toBeLessThan(300);
    s = choose(s);
  }
  return s;
}
function fixture(n = 3, expert = false): GameState {
  let s = createGame(players(n), { oripathy: true, expert, seed: 42 });
  for (let i = 0; s.phase !== "actions"; i++) {
    expect(i).toBeLessThan(250);
    s = choose(s);
  }
  s.activeEnterprises = [...VERIFIED_ENTERPRISES, "stonehoove", "maylander"];
  s.activeLab = 0;
  for (const p of s.players) {
    p.wallet = {
      rock: 100,
      ore: 100,
      iron: 100,
      prime: 10,
      cash: 100,
      score: 0,
    };
    p.enterprise = Object.fromEntries(s.activeEnterprises.map((v) => [v, 5]));
  }
  for (const n of s.board.nodes) {
    s.sites[n.id].resource ??= "ore";
    s.sites[n.id].amount = 1;
  }
  s.sites["A-1"].slots[0] = "p0";
  s.sites["D-1"].slots = ["p1", "p2"];
  return s;
}
function effect(s: GameState, steps: Step[]): GameState {
  s.parallel = null;
  s.queue = [];
  s.decision = {
    playerId: "p0",
    title: "测试结算",
    kind: "fixture",
    options: [{ id: "go", label: "结算", steps }],
  };
  return choose(s, "go");
}
const step = (kind: string, data: Record<string, unknown> = {}): Step => ({
  kind,
  actor: "p0",
  data,
});

describe("感染者配置与隐私", () => {
  it("旧规则包的设施、样式、干员池不包含感染者", () => {
    for (const expansion of [false, true]) {
      const s = createGame(players(3), { expansion, seed: 42 });
      expect(
        [
          ...s.market,
          ...s.facilityDeck,
          ...s.operativeDeck,
          ...s.patterns,
        ].some((v) => v.startsWith("o-")),
      ).toBe(false);
      expect(s.oripathy).toBeUndefined();
    }
  });
  it("自动包含企业扩展，加入八位新干员与六张公共设施，并裁剪到五张初始角色", () => {
    const fresh = createGame(players(3), { oripathy: true, seed: 42 });
    expect(fresh.rulesVersion).toBe(ORIPATHY_RULES_VERSION);
    expect(fresh.expansion).toBe(true);
    expect(fresh.operativeDeck).toHaveLength(16);
    expect(
      [...fresh.market, ...fresh.facilityDeck].filter((v) =>
        v.startsWith("o-"),
      ),
    ).toHaveLength(6);
    expect(
      fresh.players.every(
        (p) => p.hand.includes(AMIYA.id) && p.hand.length === 8,
      ),
    ).toBe(true);
    const s = fixture();
    expect(
      s.players.every((p) => p.hand.length + (p.selected ? 1 : 0) === 5),
    ).toBe(true);
  });
  it("专家开局按末位逆序选择企业家，已选择身份不可重复", () => {
    let s = createGame(players(4), { oripathy: true, expert: true, seed: 42 });
    expect(s.decision).toMatchObject({
      playerId: "p3",
      kind: "o:entrepreneur-draft",
    });
    s = choose(s, "martin");
    expect(s.decision!.playerId).toBe("p2");
    expect(s.decision!.options.some((v) => v.id === "martin")).toBe(false);
    expect(s.players[3].oripathy!.blueprint).toHaveLength(9);
  });
  it("额外盖放的流形只向自己展示，刷新存档保持私牌隔离", () => {
    const s = fixture();
    s.players[0].coveredFlows = ["o-flow-a"];
    const restored = JSON.parse(JSON.stringify(s));
    expect(projectView(restored, "p0").players[0].coveredFlows).toEqual([
      "o-flow-a",
    ]);
    expect(projectView(restored, "p1").players[0].coveredFlows).toEqual([]);
    expect(JSON.stringify(projectView(restored, "p1"))).not.toContain(
      '"randomState"',
    );
  });
});

describe("感染者新增角色的两种能力", () => {
  it.each(
    [AMIYA, ...ORIPATHY_OPERATIVES, ...FLOW_ROLES].flatMap((role) =>
      ["strategy", "tactic"].map((mode) => ({ role, mode })),
    ),
  )("$role.name · $mode：效果队列可以完成并保存", ({ role, mode }) => {
    let s = fixture();
    s.players[0].selected = role.id;
    s.players[0].hand = s.players[0].hand.filter((v) => v !== role.id);
    s = applyCommand(s, "p0", { type: "role", mode });
    s = settle(s);
    expect(s.log.some((v) => v.text.includes(`使用 ${role.name}`))).toBe(true);
    expect(() =>
      projectView(JSON.parse(JSON.stringify(s)), "p0"),
    ).not.toThrow();
    expect(
      s.players.every((p) => Object.values(p.wallet).every(Number.isFinite)),
    ).toBe(true);
  });
  it("刻俄柏的骰子使用存档随机状态，完全相同的指令可复现", () => {
    const s = fixture();
    s.players[0].selected = "o-ceobe";
    const a = settle(applyCommand(s, "p0", { type: "role", mode: "tactic" })),
      b = settle(
        applyCommand(JSON.parse(JSON.stringify(s)), "p0", {
          type: "role",
          mode: "tactic",
        }),
      );
    expect(a).toEqual(b);
    expect(a.log.some((v) => v.text.includes("刻俄柏掷出"))).toBe(true);
  });
  it("阿米娅合作协议允许后续非先手连续使用角色，并消耗协议", () => {
    let s = fixture();
    s.active = 1;
    s.players[1].persistent.push({ roleId: "o-amiya", markers: 0, stash: [] });
    s.players[1].selected = "texas";
    const modes = getLegalActions(s, "p1")
      .filter((a) => a.command.type === "role")
      .map((a) => a.command.mode);
    expect(modes).toEqual(["strategy-tactic", "tactic-strategy"]);
    s = settle(
      applyCommand(s, "p1", { type: "role", mode: "strategy-tactic" }),
    );
    expect(s.players[1].persistent.some((v) => v.roleId === "o-amiya")).toBe(
      false,
    );
    expect(s.players[1].discard).toContain("o-amiya");
  });
  it("淬羽赫默锁定整个城市所在区块，移除仍可执行", () => {
    let s = fixture();
    s.players[0].selected = "o-silence";
    s = settle(applyCommand(s, "p0", { type: "role", mode: "tactic" }));
    const region = s.board.nodes.find(
      (n) => n.id === s.players[0].city,
    )!.region;
    s = effect(s, [step("place")]);
    expect(
      s.decision!.options.every(
        (o) =>
          [...s.board.nodes, ...s.board.roads].find((n) => n.id === o.target)
            ?.region !== region,
      ),
    ).toBe(true);
    s = effect(s, [step("remove")]);
    expect(s.decision!.options.length).toBeGreaterThan(0);
  });
  it("赫拉格重新盖放的角色保留到下一轮，不能被收尾步骤错误弃置", () => {
    let s = fixture();
    s.players[0].selected = "o-hellagur";
    s = applyCommand(s, "p0", { type: "role", mode: "tactic" });
    s = choose(s, "skip");
    const covered = s.decision!.options[0].id;
    s = choose(s, covered);
    expect(s.players[0].selected).toBe(covered);
    expect(
      getLegalActions(s, "p0").some((a) => a.command.type === "role"),
    ).toBe(false);
    expect(s.players[0].discard).toContain("o-hellagur");
  });
  it("流形的一次性计谋放回游戏盒，不进入弃牌区", () => {
    for (const flow of FLOW_ROLES) {
      let s = fixture();
      s.players[0].selected = flow.id;
      s = settle(applyCommand(s, "p0", { type: "role", mode: "tactic" }));
      expect(s.players[0].removed).toContain(flow.id);
      expect(s.players[0].discard).not.toContain(flow.id);
    }
  });
});

describe("新增设施、企业与叠层", () => {
  it.each(ORIPATHY_FACILITIES.filter((f) => !f.id.startsWith("o-urban-")))(
    "$name / $id：收费、入城与补牌一致",
    (card) => {
      let s = fixture();
      s.market = [`${card.id}@0`];
      s = applyCommand(s, "p0", { type: "main", action: "build" });
      s = settle(choose(s, `${card.id}@0:11:cash`));
      expect(s.players[0].built["11"].cardId).toBe(card.id);
      expect(s.players[0].wallet.cash).toBe(100 - card.cashCost);
      expect(s.market).toHaveLength(6);
    },
  );
  it("安保标记独立于玩家供应，不能放在任意城市停泊点", () => {
    let s = fixture();
    const before = projectView(s, "p0").players[0].availableMarkers;
    s = effect(s, [step("o:security-place")]);
    expect(
      s.decision!.options.every(
        (o) => !s.players.some((p) => p.city === o.target),
      ),
    ).toBe(true);
    const chosen = s.decision!.options[0].id;
    s = choose(s, chosen);
    expect(s.oripathy!.security).toEqual([chosen]);
    expect(projectView(s, "p0").players[0].availableMarkers).toBe(before);
    expect(JSON.stringify(projectView(s, "p0").sites)).toContain("@stonehoove");
  });
  it("安保是可替换的对手影响力，但移除不会访问虚构玩家席位", () => {
    let s = fixture();
    s.oripathy!.security = ["A-1:0"];
    s.sites["A-1"].slots[0] = null;
    s = effect(s, [step("replace")]);
    s = choose(s, "A-1:0");
    s = settle(s);
    expect(s.oripathy!.security).toEqual([]);
    expect(s.sites["A-1"].slots[0]).toBe("p0");
  });
  it("终身合约只扩展常规采集，额外采集保持原规则", () => {
    let s = fixture();
    const target = s.board.nodes.find(
      (n) => !s.players.some((p) => p.city === n.id),
    )!.id;
    s.oripathy!.contracts = ["p0"];
    s.oripathy!.security = [`${target}:0`];
    s = effect(s, [step("harvest")]);
    expect(s.decision!.options.some((o) => o.id === target)).toBe(false);
    s.phase = "harvest";
    s = effect(s, [step("harvest")]);
    expect(s.decision!.options.some((o) => o.id === target)).toBe(true);
  });
  it("马丁只能用分数更高的新设施叠建，下层仍用于唯一判断", () => {
    let s = fixture();
    s.players[0].oripathy!.entrepreneur = "martin";
    s.players[0].built["0"] = { cardId: "camp", used: true };
    s.market = ["administration@0"];
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    s = choose(s, "administration@0:0:cash");
    s = settle(s);
    expect(s.players[0].built["0"]).toMatchObject({
      cardId: "administration",
      used: false,
      layers: [{ cardId: "camp", used: true }],
    });
    expect(s.sites["A-1"].slots[0]).toBe(null);
    s.mainDone = false;
    s.mainRemaining = 1;
    s.market = ["camp@1"];
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    expect(s.decision!.options.some((o) => o.id === "camp@1:0:cash")).toBe(
      false,
    );
  });
  it("马丁叠建后不能用被埋的设施宣告样式", () => {
    const s = fixture();
    s.players[0].built = {
      "0": {
        cardId: "administration",
        used: false,
        layers: [{ cardId: "quarry-yellow", used: false }],
      },
    };
    expect(patternMatches(s.players[0], "o-management")).toEqual([]);
  });
  it("资金资助是每份基础资源替代，普通玩家无法获得叠建选项", () => {
    let s = fixture();
    s.players[1].oripathy!.entrepreneur = "martin";
    s.players[1].oripathy!.dilemmas = [
      { round: 5, side: "B", used: false, marker: true },
    ];
    s.players[0].wallet = {
      rock: 0,
      ore: 0,
      iron: 0,
      prime: 0,
      cash: 9,
      score: 0,
    };
    s.market = ["administration@0"];
    s = applyCommand(s, "p0", { type: "main", action: "build" });
    s = choose(s, "administration@0:0:resources");
    s = settle(s);
    expect(s.players[0].wallet.cash).toBe(0);
    expect(s.players[0].built["0"].cardId).toBe("administration");
  });
});

describe("企业家时机与计分", () => {
  it("指令费用在第 3 回合起逐个支付，允许只拿可负担的部分", () => {
    let s = fixture();
    s.players[0].oripathy!.entrepreneur = "agnes";
    s.players[0].oripathy!.dilemmas = [
      { round: 3, side: "B", used: false, marker: true },
    ];
    s.players[0].wallet.cash = 5;
    s = effect(s, [step("o:commands", { count: 4 })]);
    expect(s.decision!.options.map((o) => o.id)).toEqual(["0", "1", "2"]);
    s = choose(s, "2");
    expect(s.players[0].wallet.cash).toBe(1);
    expect(s.players[0].oripathy!.markers).toBe(2);
  });
  it("普通玩家标记不足时，不生成无法支付的指令选项", () => {
    let s = fixture();
    s.players[0].tokenLimit = 1;
    s.players[0].oripathy!.entrepreneur = "agnes";
    s = effect(s, [step("o:commands", { count: 4 })]);
    expect(s.decision!.options.map((o) => o.id)).toEqual(["0"]);
  });
  it("基础基金投资按存档重放，组合费用不足不能拆付获得声望", () => {
    let s = fixture();
    const p = s.players[0];
    p.oripathy!.entrepreneur = "thiago";
    p.oripathy!.dilemmas = [
      { round: 1, side: "B", used: false, marker: false },
      { round: 3, side: "A", used: false, marker: false },
    ];
    p.wallet.cash = 7;
    s = effect(s, [step("o:investment")]);
    expect(s.decision).toBe(null);
    expect(s.players[0].oripathy!.markers).toBe(0);
  });
  it("拓荒企业家的标记转化为至纯源石，消耗后归还供应", () => {
    let s = fixture();
    s.players[0].oripathy!.entrepreneur = "pioneer";
    s.players[0].oripathy!.markers = 3;
    s = effect(s, [step("o:entrepreneur-cleanup")]);
    s = choose(s, "prime");
    s = choose(s, "done");
    expect(s.players[0].wallet.prime).toBe(11);
    expect(s.players[0].oripathy!.markers).toBe(0);
  });
  it("保罗资源计分替代本体规则，源石不计分，三人局采用印刷单价", () => {
    const s = fixture();
    const p = s.players[0];
    p.oripathy!.entrepreneur = "paul";
    p.oripathy!.dilemmas = [
      { round: 7, side: "A", used: false, marker: false },
    ];
    p.wallet = { rock: 14, ore: 100, iron: 10, prime: 2, cash: 60, score: 0 };
    expect(scoreGame(s)[0].resources).toEqual({
      rock: 2,
      ore: 0,
      iron: 2,
      prime: 2,
      cash: 2,
    });
  });
  it("马丁叠层计分先获得异铁，再换算剩余资源", () => {
    const s = fixture();
    const p = s.players[0];
    p.oripathy!.entrepreneur = "martin";
    p.oripathy!.dilemmas = [
      { round: 3, side: "A", used: false, marker: false },
    ];
    p.wallet.iron = 5;
    p.built["0"] = {
      cardId: "administration",
      used: false,
      layers: [{ cardId: "camp", used: false }],
    };
    expect(scoreGame(s)[0]).toMatchObject({
      expert: { "设施集群（另获同数异铁）": 1 },
      resources: { iron: 1 },
    });
    expect(p.wallet.iron).toBe(5);
  });
});

describe("官方牌面时机、费用与抉择覆盖", () => {
  it.each(["1184", "1185", "1186", "1187"])(
    "授勋 %s：奖励、保留与消耗遵循原牌",
    (award) => {
      let s = fixture();
      s = effect(s, [step("o:award-at", { award })]);
      if (award === "1184") {
        expect(s.players[0].oripathy!.awards).toContain(award);
        s = effect(s, [step("o:award-use")]);
        s = choose(s, "bank:1");
        expect(s.players[0].wallet.cash).toBe(108);
        expect(s.players[0].oripathy!.awards).not.toContain(award);
      } else if (award === "1185") expect(s.players[0].wallet.score).toBe(1);
      else if (award === "1186") {
        s = settle(s);
        expect(s.players[0].wallet.cash).toBe(120);
        expect(
          Object.values(s.sites).filter((site) => site.publicRoad),
        ).toHaveLength(2);
        expect(s.players[1].wallet.score).toBe(0);
      } else {
        expect(s.players[0].oripathy!.awards).toContain(award);
        s = settle(effect(s, [step("o:award-cleanup")]));
        expect(s.players[0].wallet.cash).toBe(103);
        expect(
          s.players[0].wallet.rock +
            s.players[0].wallet.ore +
            s.players[0].wallet.iron,
        ).toBe(301);
      }
      expect(s.oripathy!.awards).not.toContain(award);
    },
  );
  it("岩蹄与梅兰德只触发已解锁特效；三级奖励不会作为岩蹄特效", () => {
    for (const [company, expected] of [
      ["stonehoove", [1, 2, 4]],
      ["maylander", [1, 2, 3, 4]],
      ["rhodes", [1, 2, 3]],
    ] as const) {
      const s = effect(fixture(), [step("trigger", { company })]);
      expect(s.decision!.options.map((o) => o.id)).toEqual(
        expected.map((n) => `${company}:${n}`),
      );
    }
    let s = fixture();
    s.players[0].enterprise.stonehoove = 2;
    s = effect(s, [step("upgrade-at", { company: "stonehoove", count: 1 })]);
    expect(s.players[0].wallet.score).toBe(1);
  });
  it("新兴建筑群宣告得四分，后续建设只能选择非彩色设施和空格", () => {
    let s = fixture();
    s.patterns = ["o-emerging"];
    for (const [cell, cardId] of Object.entries({
      1: "camp",
      3: "industrial",
      4: "quarry-yellow",
      5: "quarry-red",
    }))
      s.players[0].built[cell] = { cardId, used: false };
    s.market = ["administration@wild", "quarry-red@red"];
    s = applyCommand(s, "p0", { type: "declare", patternId: "o-emerging" });
    s = choose(s, "0");
    expect(s.players[0].wallet.score).toBe(4);
    expect(s.decision!.kind).toBe("build");
    expect(
      s.decision!.options.every(
        (o) =>
          o.id.startsWith("quarry-red@red:") &&
          !Object.keys(s.players[0].built).includes(o.id.split(":")[1]),
      ),
    ).toBe(true);
  });
  it("城区管理中心返还一个高级样式标记，获得至纯源石", () => {
    let s = fixture();
    s.patterns = ["o-management"];
    for (const [cell, cardId] of Object.entries({
      0: "camp",
      3: "industrial",
      4: "quarry-red",
    }))
      s.players[0].built[cell] = { cardId, used: false };
    s.players[0].claims = [
      { patternId: "industrial-core", uses: 1, cooldown: 1 },
    ];
    s = applyCommand(s, "p0", { type: "declare", patternId: "o-management" });
    s = choose(s, "0");
    s = choose(s, "0");
    expect(s.players[0].wallet.score).toBe(3);
    expect(s.players[0].wallet.prime).toBe(11);
    expect(s.players[0].claims.map((c) => c.patternId)).toEqual([
      "o-management",
    ]);
  });
  it("综合企业办公区得六分，使用时同企业升两级再触发，阻止本轮角色", () => {
    let s = fixture();
    s.patterns = ["o-offices"];
    for (const [cell, cardId] of Object.entries({
      0: "industrial",
      3: "quarry-red",
      4: "quarry-yellow",
      6: "camp",
      7: "refinery-blue",
      8: "smelter-red",
    }))
      s.players[0].built[cell] = { cardId, used: false };
    s.players[0].enterprise.bank = 0;
    s = applyCommand(s, "p0", { type: "declare", patternId: "o-offices" });
    s = choose(s, "0");
    expect(s.players[0].wallet.score).toBe(6);
    s = applyCommand(s, "p0", { type: "special", patternId: "o-offices" });
    s = choose(s, "bank");
    expect(s.players[0].enterprise.bank).toBe(2);
    s = choose(s, "bank:1");
    expect(s.players[0].wallet.cash).toBe(108);
    expect(s.players[0].claims[0]).toMatchObject({ uses: 1, cooldown: 1 });
    expect(
      getLegalActions(s, "p0").some((a) => a.command.type === "role"),
    ).toBe(false);
  });
  it.each(
    ENTREPRENEURS.flatMap((who) =>
      [1, 3, 5, 7].flatMap((round) =>
        ["A", "B"].map((side) => ({ who, round, side })),
      ),
    ),
  )(
    "$who.name 第 $round 回合 $side：原版牌面、持续状态与单回合能力限制",
    ({ who, round, side }) => {
      let s = fixture();
      s.oripathy!.expert = true;
      s.round = round;
      const e = s.players[0].oripathy!;
      e.entrepreneur = who.id;
      e.markers = 6;
      if (who.id === "martin")
        e.blueprint = ["red", "blue", "yellow"].flatMap((color) =>
          [0, 1, 2].map((i) => `o-urban-${color}@private-${i}`),
        );
      s = effect(s, [step("o:dilemma")]);
      expect(s.decision!.options.map((o) => o.id)).toEqual(["A", "B"]);
      expect(s.decision!.options[side === "A" ? 0 : 1].image).toBe(
        `/assets/oripathy/${who.dilemmas[(round - 1) / 2]}${side === "B" ? "-back" : ""}.webp`,
      );
      s = settle(choose(s, side));
      expect(s.players[0].oripathy!.dilemmas).toContainEqual(
        expect.objectContaining({ round, side, used: false }),
      );
      const active = getLegalActions(s, "p0").find(
        (a) => a.command.type === "ability",
      );
      if (active) {
        s = settle(applyCommand(s, "p0", active.command));
        expect(
          s.players[0].oripathy!.dilemmas.find((d) => d.round === round)!.used,
        ).toBe(true);
        expect(getLegalActions(s, "p0").some((a) => a.id === active.id)).toBe(
          false,
        );
      }
      for (const p of s.players) {
        for (const [r, n] of Object.entries(p.wallet))
          if (r !== "score") expect(n).toBeGreaterThanOrEqual(0);
        expect(
          projectView(s, p.id).players.find((v) => v.id === p.id)!
            .availableMarkers,
        ).toBeGreaterThanOrEqual(0);
      }
    },
  );
  it("新罗德岛四级升级直接从整副干员选择，三级解锁不触发特派", () => {
    let s = fixture();
    s.players[0].enterprise.rhodes = 2;
    s = effect(s, [step("upgrade-at", { company: "rhodes", count: 1 })]);
    expect(s.decision).toBe(null);
    const count = s.operativeDeck.length;
    s = effect(s, [step("upgrade-at", { company: "rhodes", count: 1 })]);
    expect(s.decision!.kind).toBe("operative-draw");
    expect(s.decision!.options.filter((o) => o.id !== "score")).toHaveLength(
      count,
    );
  });
  it("红区开放的企业升级先于两三人供应移除和企业家抉择", () => {
    for (const count of [2, 3]) {
      let s = fixture(count);
      s.round = count === 2 ? 6 : 5;
      for (const p of s.players)
        for (const c of s.activeEnterprises) p.enterprise[c] = 0;
      s = effect(s, [step("start-round")]);
      expect(s.decision!.kind).toBe("upgrade");
      expect(s.queue.some((v) => v.kind === "market-remove")).toBe(true);
    }
  });
  it("规则书第七页：赫默锁定随城市移动，禁止新放置但允许移入", () => {
    let s = fixture();
    s = settle(effect(s, [step("o:lock")]));
    const previousRegion = s.oripathy!.lock!.region;
    const target = s.board.nodes.find(
      (n) =>
        n.region !== previousRegion && !s.players.some((p) => p.city === n.id),
    )!;
    s = settle(effect(s, [step("relocate", { to: target.id, road: null })]));
    const region = target.region;
    expect(s.oripathy!.lock!.region).toBe(region);
    s = effect(s, [step("place")]);
    expect(
      s.decision!.options.every(
        (o) =>
          [...s.board.nodes, ...s.board.roads].find((n) => n.id === o.target)!
            .region !== region,
      ),
    ).toBe(true);
    s = effect(s, [step("shift-target", { slot: "A-1:0", owner: "p0" })]);
    expect(
      s.decision!.options.some(
        (o) =>
          [...s.board.nodes, ...s.board.roads].find((n) => n.id === o.target)!
            .region === region,
      ),
    ).toBe(true);
  });
  it("岩蹄与其他玩家共同驻守的航道，可选择向银行支付路费", () => {
    let s = fixture();
    const road = s.board.roads.find((r) => s.sites[r.id].slots.length >= 2)!;
    s.sites[road.id].slots = ["p1", null];
    s.oripathy!.security = [`${road.id}:1`];
    s = effect(s, [step("toll", { road: road.id })]);
    expect(s.decision!.options.map((o) => o.id)).toEqual(["p1", "bank"]);
    expect(() => chooseBotAction(projectView(s, "p0"))).not.toThrow();
    s = choose(s, "bank");
    expect(s.players[0].wallet.cash).toBe(98);
    expect(s.players[1].wallet.cash).toBe(100);
  });
  it("流形额外盖放保留在同一个并行屏障，直到全部玩家完成", () => {
    let s = fixture();
    s.phase = "select";
    s.players[0].persistent.push({
      roleId: "o-muelsyse",
      markers: 0,
      stash: [],
    });
    s.players[0].hand = ["texas", "o-flow-a"];
    s = effect(s, [step("parallel-roles"), step("begin-actions")]);
    s = applyCommand(s, "p0", { type: "choose", optionId: "texas" });
    expect(projectView(s, "p0").decision!.kind).toBe("o:cover-flow");
    expect(s.parallel!.players.p0.ready).toBe(false);
    s = applyCommand(s, "p0", { type: "choose", optionId: "o-flow-a" });
    expect(s.parallel!.players.p0.ready).toBe(true);
    expect(projectView(s, "p1").players[0].coveredFlows).toEqual([]);
    for (const id of ["p1", "p2"])
      s = applyCommand(s, id, projectView(s, id).actions[0].command);
    expect(s.phase).toBe("actions");
    expect(s.players[0].coveredFlows).toEqual(["o-flow-a"]);
    expect(
      getLegalActions(s, "p0").some((a) => a.command.mode?.startsWith("flow|")),
    ).toBe(true);
  });
  it("供应叠放只暴露顶牌，取得后先露出下层，刷新供应收回整叠", () => {
    let s = fixture();
    s.market = ["o-settlement@top"];
    s.oripathy!.marketUnder = {
      "o-settlement@top": ["o-urban-red@under", "industrial@bottom"],
    };
    s = effect(s, [step("build")]);
    expect(
      s.decision!.options.every((o) => o.id.startsWith("o-settlement@top:")),
    ).toBe(true);
    s = settle(choose(s, "o-settlement@top:11:cash"));
    expect(s.market).toContain("o-urban-red@under");
    expect(s.oripathy!.marketUnder["o-urban-red@under"]).toEqual([
      "industrial@bottom",
    ]);
    s = effect(s, [step("refresh-market")]);
    expect(s.oripathy!.marketUnder).toEqual({});
    expect([...s.market, ...s.facilityDeck]).toContain("industrial@bottom");
  });
  it("林可以只移除标记，没有富有对手时也能结束持续效果", () => {
    let s = fixture();
    s.players[0].persistent.push({ roleId: "o-lin", markers: 1, stash: [] });
    for (const p of s.players) p.wallet.cash = 0;
    s = effect(s, [step("o:lin-cleanup")]);
    expect(s.decision!.options.map((o) => o.id)).toEqual(["skip", "discard"]);
    s = choose(s, "discard");
    expect(s.players[0].persistent.some((v) => v.roleId === "o-lin")).toBe(
      false,
    );
    expect(s.players[0].discard).toContain("o-lin");
  });
  it("刻俄柏计谋额外主要行动可以选择企业家特殊行动，策略仍限普通主要行动", () => {
    let s = fixture();
    s.oripathy!.expert = true;
    s.players[0].oripathy!.entrepreneur = "martin";
    s.players[0].oripathy!.dilemmas = [
      { round: 1, side: "A", used: false, marker: true },
    ];
    s.mainDone = true;
    s = effect(s, [step("o:extra-action", { special: true })]);
    expect(
      s.decision!.options.some((o) => o.id === "expert:dilemma:1:main"),
    ).toBe(true);
    s = effect(s, [step("o:extra-action")]);
    expect(s.decision!.options.some((o) => o.id.startsWith("expert:"))).toBe(
      false,
    );
  });
  it.each(["o-urban-red", "o-urban-blue", "o-urban-yellow"])(
    "%s 入场按拥有的核心数量结算，并可选择对手分享",
    (cardId) => {
      let s = fixture();
      s.players[0].built["0"] = { cardId: "core", used: false };
      s = effect(s, [step("o:urban-entry", { cardId })]);
      s = settle(s);
      if (cardId.endsWith("blue")) expect(s.players[0].wallet.cash).toBe(124);
      else if (cardId.endsWith("yellow"))
        expect(s.players[0].wallet.score).toBe(2);
      else
        expect(
          Object.values(s.sites)
            .flatMap((site) => site.slots)
            .filter((owner) => owner === "p0").length,
        ).toBe(3);
      s = effect(s, [step("o:share-urban", { cardId, cell: "11" })]);
      expect(s.decision!.options.map((o) => o.id)).toEqual(["p1", "p2"]);
      s = settle(choose(s, "p1"));
      if (cardId.endsWith("blue")) expect(s.players[1].wallet.cash).toBe(112);
      else if (cardId.endsWith("yellow"))
        expect(s.players[1].wallet.score).toBe(1);
    },
  );
  it("拓荒企业家与多萝西同时生效时，一个被移除的普通标记只能选择一个去向", () => {
    let s = fixture();
    s.players[0].oripathy!.entrepreneur = "pioneer";
    s.players[0].persistent.push({ roleId: "dorothy", markers: 0, stash: [] });
    s = effect(s, [step("remove-at", { slot: "A-1:0" })]);
    expect(s.decision!.options.map((o) => o.id)).toEqual([
      "supply",
      "pioneer",
      "dorothy",
    ]);
    s = choose(s, "pioneer");
    expect(s.players[0].oripathy!.markers).toBe(1);
    expect(s.players[0].persistent[0].markers).toBe(0);
  });
  it("两份安保合约分别按区块内每两个安保计入控制，安保不成为玩家", () => {
    const s = fixture();
    for (const p of s.players) p.city = null;
    for (const site of Object.values(s.sites))
      site.slots = site.slots.map(() => null);
    s.oripathy!.security = ["A-1:0", "A-1:1", "A-2:0"];
    s.oripathy!.contracts = ["p0", "p1"];
    const scores = scoreGame(s);
    expect(scores.every((v) => v.regions.A === undefined)).toBe(true);
    const extra = [...s.board.nodes, ...s.board.roads]
      .filter((n) => n.region === "A")
      .flatMap((n) =>
        s.sites[n.id].slots.map((_, index) => ({
          site: n.id,
          index,
          slot: `${n.id}:${index}`,
        })),
      )
      .find((v) => !s.oripathy!.security.includes(v.slot))!;
    s.sites[extra.site].slots[extra.index] = "p0";
    expect(scoreGame(s)[0].regions.A).toBe(3);
  });
});

describe("感染者整局回归", () => {
  it.each(
    [2, 3, 4].flatMap((count) =>
      [false, true].map((expert) => ({ count, expert })),
    ),
  )("$count 人／专家 $expert：八回合可保存重放至终局", ({ count, expert }) => {
    let s = createGame(players(count), { oripathy: true, expert, seed: 64 });
    const initial = JSON.parse(JSON.stringify(s));
    const commands: {
      id: string;
      command: ReturnType<typeof getLegalActions>[number]["command"];
    }[] = [];
    for (let i = 0; s.phase !== "finished"; i++) {
      expect(i, `回合 ${s.round} / ${s.decision?.kind}`).toBeLessThan(5000);
      const id = s.decision?.playerId ?? s.players[s.active].id;
      const actions = getLegalActions(s, id);
      expect(
        actions.length,
        `${s.phase} / ${s.decision?.kind}`,
      ).toBeGreaterThan(0);
      const a = s.decision
        ? (actions.find((a) => ["done", "skip", "no", "keep"].includes(a.id)) ??
          actions[0])
        : (actions.find((a) => a.command.type === "role") ??
          actions.find((a) => a.group === "main") ??
          actions.find((a) => a.command.type === "end") ??
          actions[0]);
      commands.push({ id, command: a.command });
      s = applyCommand(s, id, a.command);
    }
    expect(s.round).toBe(8);
    expect(s.finalScores).toHaveLength(count);
    expect(s.winners.length).toBeGreaterThan(0);
    const replay = commands.reduce(
      (state, { id, command }) => applyCommand(state, id, command),
      initial,
    );
    expect(replay).toEqual(s);
  });
});
