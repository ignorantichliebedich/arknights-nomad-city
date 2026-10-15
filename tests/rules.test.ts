import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  getLegalActions,
  patternMatches,
  projectView,
  routeTo,
  scoreGame,
} from "../packages/rules/src/engine.ts";
import { FACILITIES, BASE_ROLES, EVENTS } from "../packages/rules/src/data.ts";
import type { Command, GameState } from "../packages/rules/src/types.ts";

function choose(s: GameState, id?: string) {
  const d = s.decision!;
  const selected = d.options.find((o) => o.id === id) ?? d.options[0];
  return applyCommand(s, d.playerId, { type: "choose", optionId: selected.id });
}
function fixture(count = 3, expansion = false) {
  let s = createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `玩家${i + 1}`,
    })),
    { expansion, seed: 42 },
  );
  let n = 0;
  while (s.phase !== "actions") {
    expect(++n).toBeLessThan(300);
    s = choose(s);
  }
  return s;
}
function settle(s: GameState) {
  let n = 0;
  while (s.decision) {
    expect(++n).toBeLessThan(300);
    const d = s.decision;
    const target =
      d.kind === "sell"
        ? "done"
        : d.kind === "harvest"
          ? (d.options.find((o) => s.board.nodes.some((n) => n.id === o.id))
              ?.id ?? "done")
          : d.options[0].id;
    s = choose(s, target);
  }
  return s;
}

describe("规则来源与配件数量", () => {
  it("本体具有 41 张供应设施、4 核心、3 延伸枢纽、20 初始角色、22 事件", () => {
    expect(
      FACILITIES.filter(
        (f) =>
          !f.expansion && f.id !== "core" && !f.id.startsWith("extension-"),
      ).reduce((n, f) => n + f.copies, 0),
    ).toBe(41);
    expect(FACILITIES.find((f) => f.id === "core")!.copies).toBe(4);
    expect(
      FACILITIES.filter((f) => f.id.startsWith("extension-")).reduce(
        (n, f) => n + f.copies,
        0,
      ),
    ).toBe(3);
    expect(BASE_ROLES.filter((r) => !r.expansion).length * 4).toBe(20);
    expect(EVENTS.length).toBe(22);
  });
  it("三人局移除标有四人的四张事件，三种颜色与资源点数量相符", () => {
    const s = createGame(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      { seed: 15 },
    );
    for (const tier of ["green", "yellow", "red"]) {
      const count = s.board.nodes.filter((n) => n.tier === tier).length;
      const discovered = s.board.nodes.filter(
        (n) => n.tier === tier && s.sites[n.id].resource,
      ).length;
      expect(s.eventDecks[tier].length + discovered).toBe(count);
    }
  });
  it("航道可连接三个或四个资源点", () => {
    const s = fixture(4);
    expect(s.board.roads.some((r) => r.nodes.length === 4)).toBe(true);
    expect(s.board.nodes).toHaveLength(22);
  });
});
describe("规则引擎", () => {
  it("指令字段顺序不影响合法行动，但拒绝附加效果字段", () => {
    const s = fixture();
    const normal: Command = { type: "main", action: "deploy" };
    const reordered: Command = JSON.parse('{"action":"deploy","type":"main"}');
    expect(applyCommand(s, "p0", reordered)).toEqual(
      applyCommand(s, "p0", normal),
    );
    expect(() =>
      applyCommand(s, "p0", {
        ...normal,
        steps: [
          { kind: "gain", actor: "p0", data: { reward: { score: 999 } } },
        ],
      } as Command),
    ).toThrow();
  });
  it.each([2, 3, 4])("%i 人局完成初始入场，并按原表发放起始资金", (count) => {
    const s = fixture(count);
    expect(s.round).toBe(1);
    expect(s.lap).toBe(1);
    expect(s.players.every((p) => p.city && p.selected)).toBe(true);
    if (count === 2) {
      expect(s.players[0].city).not.toBe("B-01");
      expect(s.players[1].city).not.toBe("B-01");
      expect(s.players[1].wallet.score).toBe(3);
    }
  });
  it("拒绝越权行动且原状态保持不变", () => {
    const s = fixture();
    const before = JSON.stringify(s);
    expect(() =>
      applyCommand(s, "p1", { type: "main", action: "deploy" }),
    ).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("第一轮所有人行动后进入第二轮，第二轮结束才采集", () => {
    let s = fixture();
    for (let i = 0; i < 3; i++) {
      s = settle(
        applyCommand(s, s.players[s.active].id, {
          type: "main",
          action: "deploy",
        }),
      );
      s = applyCommand(s, s.players[s.active].id, { type: "end" });
    }
    expect(s.phase).toBe("actions");
    expect(s.lap).toBe(2);
    for (let i = 0; i < 3; i++) {
      s = settle(
        applyCommand(s, s.players[s.active].id, {
          type: "main",
          action: "deploy",
        }),
      );
      s = applyCommand(s, s.players[s.active].id, { type: "end" });
    }
    expect(s.phase).toBe("harvest");
  });
  it("每轮只有一个主要行动", () => {
    let s = fixture();
    s = settle(applyCommand(s, "p0", { type: "main", action: "deploy" }));
    expect(() =>
      applyCommand(s, "p0", { type: "main", action: "deploy" }),
    ).toThrow();
    expect(getLegalActions(s, "p0").some((a) => a.command.type === "end")).toBe(
      true,
    );
  });
  it("先手能连续使用策略和计谋，后手只有一种", () => {
    let s = fixture();
    expect(
      getLegalActions(s, "p0").some(
        (a) => a.command.mode === "strategy-tactic",
      ),
    ).toBe(true);
    s = settle(applyCommand(s, "p0", { type: "main", action: "deploy" }));
    s = applyCommand(s, "p0", { type: "end" });
    expect(
      getLegalActions(s, "p1").filter((a) => a.command.type === "role"),
    ).toHaveLength(2);
  });
  it("公共投影隐藏手牌、盖放角色、牌库顺序、随机状态和待执行效果", () => {
    const s = fixture();
    const view = projectView(s, "p0");
    expect(view.players[1].hand).toEqual([]);
    expect(view.players[1].selected).toBeNull();
    expect(view).not.toHaveProperty("randomState");
    expect(view).not.toHaveProperty("facilityDeck");
    expect(view).not.toHaveProperty("queue");
    expect(view).not.toHaveProperty("scheduled");
  });
  it("建局只接收昵称和身份，席位凭证及其他服务字段不进入规则状态", () => {
    const seats = [
      {
        id: "a",
        name: "A",
        tokenHash: "private-a",
        ready: true,
        serverOnly: "internal",
      },
      {
        id: "b",
        name: "B",
        tokenHash: "private-b",
        ready: true,
        serverOnly: "internal",
      },
    ];
    const s = createGame(seats, { seed: 42 });
    expect(
      s.players.some(
        (p) => "tokenHash" in p || "ready" in p || "serverOnly" in p,
      ),
    ).toBe(false);
  });
  it("旧存档中的附加席位字段也不会出现在任何玩家视图", () => {
    const s = fixture();
    Object.assign(s.players[0], {
      tokenHash: "legacy-private",
      ready: true,
      serverOnly: "internal",
    });
    for (const player of s.players) {
      const view = projectView(s, player.id);
      expect(
        view.players.some(
          (p) => "tokenHash" in p || "ready" in p || "serverOnly" in p,
        ),
      ).toBe(false);
      expect(view.players[0].name).toBe(s.players[0].name);
    }
  });
  it("可用标记扣除影响力、样式、企业和持续角色，并在部署后同步减少", () => {
    let s = fixture(3, true);
    for (const site of Object.values(s.sites)) site.slots.fill(null);
    s.sites["A-1"].slots[0] = "p0";
    s.sites["A-01"].slots = ["p0", "p0"];
    const p = s.players[0];
    p.enterprise = { rhodes: 1, heide: 0, bank: 0, rim: 0 };
    p.claims = [
      { patternId: "mobilize", cooldown: 0, uses: -1 },
      { patternId: "relay", cooldown: 0, uses: -1 },
    ];
    p.persistent = [
      { roleId: "dorothy", markers: 3, stash: [] },
      { roleId: "passenger", markers: 2, stash: [] },
    ];
    expect(projectView(s, "p0").players[0].availableMarkers).toBe(15);
    s = settle(applyCommand(s, "p0", { type: "main", action: "deploy" }));
    expect(projectView(s, "p0").players[0].availableMarkers).toBe(14);
  });
  it("秘密决策不会把选项或私人日志发送给对手", () => {
    const s = createGame(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      { expansion: true, seed: 16 },
    );
    expect(s.decision?.private).toBe(true);
    const actor = s.decision!.playerId;
    const other = s.players.find((p) => p.id !== actor)!.id;
    expect(projectView(s, other).decision!.options).toEqual([]);
    const next = choose(s);
    expect(
      projectView(next, other).log.some(
        (e) => e.text.includes("莱茵") && e.actor === actor,
      ),
    ).toBe(false);
  });
  it("企业开局放回盒中的两张角色是非公开信息，投影不暴露退役列表", () => {
    let s = createGame(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      { expansion: true, seed: 22 },
    );
    while (s.decision?.kind !== "trim") s = choose(s);
    const actor = s.decision.playerId;
    const other = s.players.find((p) => p.id !== actor)!.id;
    const card = s.decision.options[0].id;
    s = choose(s);
    expect(s.players.find((p) => p.id === actor)!.removed).toContain(card);
    const view = projectView(s, other);
    expect(view.players.find((p) => p.id === actor)!.removed).not.toContain(
      card,
    );
    expect(view.players[0]).not.toHaveProperty("privateRemoved");
    expect(view.log.some((e) => e.actor === actor && e.text === card)).toBe(
      false,
    );
  });
  it("影响力区域平局没有区域分，移动城市按两个影响力计入", () => {
    const s = fixture();
    for (const site of Object.values(s.sites)) site.slots.fill(null);
    s.players.forEach((p) => (p.city = null));
    s.sites["A-01"].slots = ["p0", "p1"];
    expect(scoreGame(s)[0].regions.A).toBeUndefined();
    s.players[0].city = "A-01";
    expect(scoreGame(s)[0].regions.A).toBe(3);
  });
  it("资源分按 9/8/6/1 转换，与金券分开", () => {
    const s = fixture();
    s.players[0].wallet = {
      rock: 19,
      ore: 17,
      iron: 13,
      prime: 4,
      cash: 999,
      score: 7,
    };
    const result = scoreGame(s)[0];
    expect(result.resources).toEqual({ rock: 2, ore: 2, iron: 2, prime: 4 });
    expect(result.ongoing).toBe(7);
  });
  it("红区开放轮次为四人4、三人5、两人6；航道一直可放置", () => {
    for (const count of [2, 3, 4]) {
      const s = fixture(count);
      expect(getLegalActions(s, "p0").some((a) => a.id === "explore")).toBe(
        true,
      );
      const main = applyCommand(s, "p0", { type: "main", action: "explore" });
      expect(
        main.decision!.options.some(
          (o) => s.board.nodes.find((n) => n.id === o.id)?.tier === "red",
        ),
      ).toBe(false);
      s.round = count === 4 ? 4 : count === 3 ? 5 : 6;
      const open = applyCommand(s, "p0", { type: "main", action: "explore" });
      expect(
        open.decision!.options.some(
          (o) => s.board.nodes.find((n) => n.id === o.id)?.tier === "red",
        ),
      ).toBe(true);
    }
  });
  it("自己控制的航道免费，公路免费，其他航道每条2金券", () => {
    const s = fixture();
    s.players[0].city = "A-01";
    s.sites["A-1"].slots = ["p0"];
    expect(routeTo(s, "p0", "A-02").cost).toBe(0);
    s.sites["A-1"].slots = [null];
    expect(routeTo(s, "p0", "A-02").cost).toBe(2);
    s.sites["A-1"].publicRoad = true;
    expect(routeTo(s, "p0", "A-02").cost).toBe(0);
  });
  it("不能在对手城市停靠的资源点部署", () => {
    let s = fixture();
    const target = s.players[1].city!;
    s = applyCommand(s, "p0", { type: "main", action: "deploy" });
    expect(s.decision!.options.some((o) => o.target === target)).toBe(false);
  });
  it("同一资源点的两个影响力不使产出翻倍", () => {
    let s = fixture();
    for (const site of Object.values(s.sites)) site.slots.fill(null);
    s.players.forEach((p) => (p.city = null));
    s.players[0].city = "A-01";
    s.sites["A-01"].resource = "rock";
    s.sites["A-01"].amount = 1;
    s.sites["A-01"].slots = ["p0", "p0"];
    s.phase = "harvest";
    s.decision = {
      playerId: "p0",
      title: "采集",
      kind: "harvest",
      options: [
        {
          id: "begin",
          label: "begin",
          steps: [{ kind: "harvest", actor: "p0" }],
        },
      ],
    };
    const before = s.players[0].wallet.rock;
    s = choose(s, "begin");
    s = choose(s, "A-01");
    s = choose(s, "done");
    expect(s.players[0].wallet.rock).toBe(before + 1);
  });
  it("采集确认前可撤回资源点选择，清除其路费且不提前发放资源", () => {
    let s = fixture();
    for (const site of Object.values(s.sites)) site.slots.fill(null);
    s.players[0].city = "A-01";
    s.sites["A-01"].resource = "rock";
    s.sites["A-01"].amount = 1;
    s.sites["A-02"].resource = "ore";
    s.sites["A-02"].amount = 1;
    s.sites["A-02"].slots[0] = "p0";
    const initial = { ...s.players[0].wallet };
    s.phase = "harvest";
    s.decision = {
      playerId: "p0",
      kind: "fixture",
      title: "采集场景",
      options: [
        {
          id: "begin",
          label: "开始",
          steps: [{ kind: "harvest", actor: "p0" }],
        },
      ],
    };
    s = choose(s, "begin");
    s = choose(s, "A-01");
    s = choose(s, "A-02");
    expect(s.players[0].wallet).toEqual(initial);
    const remove = s.decision!.options.find((o) => o.id === "unselect:A-02");
    expect(remove).toBeDefined();
    s = choose(s, "unselect:A-02");
    expect(s.decision!.options.find((o) => o.id === "done")!.label).toContain(
      "0 金券",
    );
    expect(s.players[0].wallet).toEqual(initial);
    s = choose(s, "done");
    expect(s.players[0].wallet).toEqual({ ...initial, rock: initial.rock + 1 });
  });
  it("样式可以旋转、不能镜像，已用于宣告的设施不能重复使用", () => {
    const s = fixture();
    const p = s.players[0];
    p.built = {
      "0": { cardId: "industrial", used: false },
      "3": { cardId: "escort", used: false },
      "4": { cardId: "industrial", used: false },
    };
    expect(patternMatches(p, "composite").length).toBeGreaterThan(0);
    p.built["3"].used = true;
    expect(patternMatches(p, "composite")).toEqual([]);
  });
  it("等待选择的状态经 JSON 存档恢复后继续相同效果", () => {
    const s = applyCommand(fixture(), "p0", { type: "main", action: "deploy" });
    const restored = JSON.parse(JSON.stringify(s));
    const command: Command = {
      type: "choose",
      optionId: s.decision!.options[0].id,
    };
    expect(applyCommand(restored, "p0", command)).toEqual(
      applyCommand(s, "p0", command),
    );
  });
});
describe("整局自动验收", () => {
  it.each([
    [2, false],
    [3, false],
    [4, false],
    [2, true],
    [3, true],
    [4, true],
  ])("%i 人、企业扩展 %s：完整八回合且确定性重放", (count, expansion) => {
    const seed = 841;
    let s = createGame(
      Array.from({ length: count as number }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
      })),
      { expansion: expansion as boolean, seed },
    );
    const initial = structuredClone(s);
    const history: { player: string; command: Command }[] = [];
    for (let n = 0; s.phase !== "finished"; n++) {
      expect(n).toBeLessThan(5000);
      let actor: string;
      let command: Command;
      if (s.decision) {
        actor = s.decision.playerId;
        const d = s.decision;
        const selected =
          d.kind === "sell"
            ? d.options.find((o) => o.id === "done")!
            : d.kind === "harvest"
              ? (d.options.find((o) =>
                  s.board.nodes.some((n) => n.id === o.id),
                ) ?? d.options[0])
              : d.options[0];
        command = { type: "choose", optionId: selected.id };
      } else {
        actor = s.players[s.active].id;
        const actions = getLegalActions(s, actor);
        const selected =
          actions.find(
            (a) => a.command.type === "role" && a.command.mode === "strategy",
          ) ??
          actions.find((a) => a.id === "build") ??
          actions.find((a) => a.id === "explore") ??
          actions.find((a) => a.id === "deploy") ??
          actions.find((a) => a.id === "shift") ??
          actions.find((a) => a.id === "end");
        expect(selected, `无可用行动，phase=${s.phase}`).toBeDefined();
        command = selected!.command;
      }
      history.push({ player: actor, command });
      s = applyCommand(s, actor, command);
    }
    expect(s.round).toBe(8);
    expect(s.finalScores).toHaveLength(count as number);
    expect(s.winners.length).toBeGreaterThan(0);
    expect(
      s.players.every((p) => BASIC_KEYS.every((r) => p.wallet[r] >= 0)),
    ).toBe(true);
    const replay = history.reduce(
      (state, item) => applyCommand(state, item.player, item.command),
      initial,
    );
    expect(replay).toEqual(s);
  });
});
const BASIC_KEYS = ["rock", "ore", "iron", "cash", "prime"] as const;
