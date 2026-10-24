import {
  BASIC,
  FACILITY_BY_ID,
  PATTERN_BY_ID,
  RESOURCE_NAMES,
} from "./data.ts";
import { ENTREPRENEURS, oripathyArt } from "./oripathy-data.ts";
import type { OripathyRuntime } from "./oripathy-effects.ts";
import type {
  Built,
  GameState,
  LegalAction,
  Option,
  Player,
  Reward,
  Step,
} from "./types.ts";

export const hasDilemma = (p: Player, round: number, side?: string) =>
  !!p.oripathy?.dilemmas.some(
    (v) => v.round === round && (!side || v.side === side),
  );
export const allBuilt = (p: Player): Built[] =>
  Object.values(p.built).flatMap((v) => [v, ...(v.layers ?? [])]);
export function discountCosts(
  p: Player,
  cost: Reward,
  canPay: (p: Player, cost: Reward) => boolean,
): Reward[] {
  const out: Reward[] = [];
  for (let rock = 0; rock <= (cost.rock ?? 0); rock++)
    for (let ore = 0; ore <= (cost.ore ?? 0); ore++)
      for (let iron = 0; iron <= (cost.iron ?? 0); iron++) {
        const reduced = {
          ...cost,
          rock: (cost.rock ?? 0) - rock,
          ore: (cost.ore ?? 0) - ore,
          iron: (cost.iron ?? 0) - iron,
          cash: (cost.cash ?? 0) + rock + ore + iron,
        };
        if (canPay(p, reduced)) out.push(reduced);
      }
  return out;
}
const marked = (who: string, round: number, side: string) =>
  who === "thiago"
    ? round === 7
    : who === "agnes"
      ? round < 7 || side === "B"
      : who === "paul"
        ? round === 1 || round === 5 || (round === 3 && side === "A")
        : who === "martin"
          ? round !== 3
          : false;

/** Remove a visible supply card and expose its first underlying card before refilling. */
export function takeMarket(s: GameState, instance: string): boolean {
  const index = s.market.indexOf(instance);
  if (index < 0) return false;
  const under = s.oripathy?.marketUnder[instance] ?? [];
  if (under.length) {
    const next = under[0];
    s.market[index] = next;
    delete s.oripathy!.marketUnder[instance];
    if (under.length > 1) s.oripathy!.marketUnder[next] = under.slice(1);
  } else s.market.splice(index, 1);
  return true;
}

export function expertActions(s: GameState, p: Player): LegalAction[] {
  const e = p.oripathy;
  if (!s.oripathy?.expert || !e?.entrepreneur) return [];
  const actions: LegalAction[] = [];
  const add = (action: string, label: string, main = false) => {
    if (main && (s.mainDone || s.extraOnly)) return;
    actions.push({
      id: `expert:${action}`,
      label,
      group: main ? "main" : "quick",
      command: { type: "ability", action },
    });
  };
  for (const d of e.dilemmas.filter((v) => v.marker && !v.used)) {
    const key = `dilemma:${d.round}`;
    if (
      e.entrepreneur === "thiago" &&
      d.round === 7 &&
      e.markers >= (d.side === "A" ? 3 : 2)
    )
      add(`${key}:quick`, "企业家 · 立即基金投资");
    if (e.entrepreneur === "agnes") {
      if (d.round < 7) {
        if (e.markers >= 2)
          add(`tactical:${d.round}:quick`, `战术 ${d.round} · 支付 2 指令`);
        add(`tactical:${d.round}:main`, `战术 ${d.round} · 获得 10 金券`, true);
      } else if (d.side === "B" && p.wallet.prime >= 1 && !p.roleUsedThisTurn)
        add(`${key}:main`, "企业家 · 连续城市移动", true);
    }
    if (e.entrepreneur === "paul") {
      if (d.round === 1 && (d.side === "A" || p.wallet.cash >= 4))
        add(`${key}:quick`, "帮派 · 行动调度");
      if (
        d.round === 3 &&
        d.side === "A" &&
        BASIC.reduce((n, r) => n + p.wallet[r], 0) >= 2
      )
        add(`${key}:quick`, "帮派 · 支付两份资源部署");
      if (
        d.round === 5 &&
        p.city &&
        s.sites[p.city].slots.filter(Boolean).length >= 2
      )
        add(`${key}:quick`, "帮派 · 移除城市驻军并收集资源");
    }
    if (e.entrepreneur === "martin") {
      if (d.round === 1 && (d.side === "A" || p.wallet.ore >= 1))
        add(`${key}:main`, "马丁 · 技术与拓荒", true);
      if (d.round === 5 && (d.side === "A" || p.wallet.cash >= 2))
        add(
          `${key}:${d.side === "A" ? "quick" : "main"}`,
          "马丁 · 建设图纸",
          d.side === "B",
        );
      if (
        d.round === 7 &&
        (d.side === "A" ? Object.keys(p.built).length > 0 : p.wallet.prime >= 1)
      )
        add(`${key}:quick`, "马丁 · 紧急建设");
    }
  }
  return actions;
}

const description = (who: string, round: number, side: string) => {
  const text: Record<string, string[]> = {
    thiago: [
      "基础资源与低价投资／贷款资金",
      "追加投资与额外骰子／调整点数",
      "声望计分优惠／三颗骰子",
      "永久消耗声望指定效果／支付声望再次投资",
    ],
    agnes: [
      "取得指令，解锁部署战术",
      "干员特派，解锁新的战术与指令费用",
      "影响力终局奖励与城市移动／收尾战术",
      "区块平局优势／强化城市与连续移动",
    ],
    paul: [
      "帮派被移除时返还普通影响力，解锁调度",
      "改用帮派部署，解锁资源收获",
      "取得资金，强化帮派区控／保护据点",
      "改变剩余资源计分／强化帮派区块得分",
    ],
    martin: [
      "解锁探索与图纸互换／移动与供应叠放",
      "建设额外核心，按叠层计分",
      "补贴其他企业家，解锁图纸操作",
      "拆除换资源／至纯源石建设",
    ],
    pioneer: [
      "取得至纯源石／部署两次",
      "取得至纯源石／资金，所有玩家提升企业",
      "干员特派，移除换至纯源石／部署两次",
      "按至纯源石／控制区块额外计分",
    ],
  };
  return `${side} 方案 · ${text[who]?.[(round - 1) / 2] ?? "查看牌面"}`;
};

export function executeExpert(
  s: GameState,
  step: Step,
  c: OripathyRuntime,
): boolean {
  if (!s.oripathy) return false;
  const { task: t, gain: g, pay, option: o, decide, prepend, player, log } = c;
  const id = step.actor,
    p = player(s, id),
    e = p.oripathy!,
    data = (step.data ?? {}) as Record<string, any>;
  const choice = (
    title: string,
    options: Option[],
    kind = step.kind,
    secret = false,
  ) => decide(s, id, title, options, kind, secret);
  const h = (round: number, side?: string) => hasDilemma(p, round, side);
  const part = (slot: string) =>
    [
      slot.slice(0, slot.lastIndexOf(":")),
      Number(slot.slice(slot.lastIndexOf(":") + 1)),
    ] as const;
  const remove = (slot: string) => {
    const [site, index] = part(slot);
    return c.removeInfluence(s, site, index);
  };
  const ownNormal = () =>
    c.occupied(s, "self", id).filter((slot) => !e.gangSlots.includes(slot));
  const costOptions = (n: number, cash = 0) => {
    const out: { key: string; cost: Reward }[] = [];
    for (let rock = 0; rock <= n; rock++)
      for (let ore = 0; ore <= n - rock; ore++) {
        const cost = { rock, ore, iron: n - rock - ore, cash };
        if (c.canPay(p, cost)) out.push({ key: `${rock}:${ore}`, cost });
      }
    return out;
  };
  const investmentCost = () => ({
    cash: 4 - (h(1, "A") ? 2 : 0) + (h(3, "A") ? 4 : 0) + (h(5, "B") ? 4 : 0),
    basic: (h(3, "B") ? 1 : 0) + (h(5, "A") ? 1 : 0),
  });
  const diceEffect = (value: number): Step[] =>
    ({
      0: [t("trigger", id)],
      1: [t("replace", id)],
      2: [g(id, { cash: 15 })],
      3: [t("upgrade", id)],
      4: [t("sell", id, { prices: { rock: 3, ore: 3, iron: 4, prime: 15 } })],
      5: [g(id, { rock: 2, ore: 2, iron: 1 })],
      6: [t("place", id), t("shift", id)],
      7: [t("upgrade", id, { count: 2 })],
    })[value as 0] ?? [];
  switch (step.kind) {
    case "o:entrepreneur-draft":
      choice(
        "选择本局企业家 · 从末位开始逆序挑选",
        ENTREPRENEURS.filter((v) =>
          s.oripathy!.entrepreneurs.includes(v.id),
        ).map((v) =>
          o(
            v.id,
            v.name,
            [t("o:entrepreneur-at", id, { who: v.id })],
            undefined,
            oripathyArt(v.face),
          ),
        ),
      );
      return true;
    case "o:entrepreneur-at":
      if (!s.oripathy.entrepreneurs.includes(data.who))
        throw new Error("企业家已被选择");
      e.entrepreneur = data.who;
      s.oripathy.entrepreneurs = s.oripathy.entrepreneurs.filter(
        (v) => v !== data.who,
      );
      if (data.who === "pioneer") e.markers = 2;
      if (data.who === "martin")
        e.blueprint = ["red", "blue", "yellow"].flatMap((color) =>
          [0, 1, 2].map((i) => `o-urban-${color}@${id}-${i}`),
        );
      log(s, id, `选择 ${ENTREPRENEURS.find((v) => v.id === data.who)!.name}`);
      return true;
    case "o:dilemma": {
      if (!e.entrepreneur) return true;
      const expert = ENTREPRENEURS.find((v) => v.id === e.entrepreneur)!;
      const face = expert.dilemmas[(s.round - 1) / 2];
      choice(
        `第 ${s.round} 回合 · ${expert.name}的抉择`,
        ["A", "B"].map((side) =>
          o(
            side,
            description(expert.id, s.round, side),
            [t("o:dilemma-at", id, { round: s.round, side })],
            undefined,
            oripathyArt(face + (side === "B" ? "-back" : "")),
          ),
        ),
      );
      return true;
    }
    case "o:dilemma-at": {
      const round = Number(data.round),
        side = data.side as "A" | "B",
        a = side === "A";
      if (e.dilemmas.some((v) => v.round === round))
        throw new Error("本回合抉择已经确认");
      e.dilemmas.push({ round, side, used: false, marker: false });
      const steps: Step[] = [];
      if (marked(e.entrepreneur!, round, side))
        steps.push(t("o:dilemma-marker", id, { round }));
      switch (e.entrepreneur) {
        case "thiago":
          if (round === 1)
            steps.push(
              g(id, a ? { rock: 1, ore: 1, iron: 1 } : { cash: 42, score: -1 }),
            );
          if (round === 5) steps.push(pay(id, { score: 1 }));
          break;
        case "agnes":
          if (round === 1) steps.push(t("o:commands", id, { count: 2 }));
          if (round === 3) {
            steps.push(pay(id, { score: 1 }), t("operative-draw", id));
            if (!a)
              steps.push(
                t("o:commands", id, { count: 4 }),
                t("upgrade", id, { count: 2 }),
              );
          }
          if (round === 5 && a) steps.push(t("o:commands", id, { count: 2 }));
          if (round === 7) steps.push(g(id, a ? { score: 1 } : { prime: 4 }));
          break;
        case "paul":
          if (round === 3) steps.push(t("o:normal-place", id));
          if (round === 5) {
            steps.push(g(id, { score: -2, prime: 1, cash: 15 }));
            if (!a) steps.push(t("operative-draw", id));
          }
          break;
        case "martin":
          if (round === 3) {
            steps.push(t("o:core", id));
            if (!a) steps.push(t("extend", id));
          }
          if (round === 5) {
            if (a) steps.push(t("place", id));
            steps.push(g(id, { cash: 10 }));
          }
          break;
        case "pioneer":
          if (round === 1 || round === 7)
            steps.push(a ? g(id, { prime: 1 }) : t("place", id, { count: 2 }));
          if (round === 3)
            steps.push(
              g(id, a ? { prime: 1 } : { cash: 18 }),
              t("upgrade", id, { all: true }),
            );
          if (round === 5)
            steps.push(
              pay(id, { score: 2 }),
              t("operative-draw", id),
              a
                ? t("o:pay-influence", id, { steps: [g(id, { prime: 2 })] })
                : t("place", id, { count: 2 }),
            );
          break;
      }
      prepend(s, steps);
      return true;
    }
    case "o:dilemma-marker": {
      const d = e.dilemmas.find((v) => v.round === data.round)!;
      if (c.stock(s, id) > 0) {
        d.marker = true;
        return true;
      }
      choice(
        "本能力需要一个玩家标记：从地图取回一个自己的普通影响力",
        ownNormal().map((slot) =>
          o(
            slot,
            slot,
            [t("o:dilemma-marker-at", id, { slot, round: data.round })],
            part(slot)[0],
          ),
        ),
      );
      return true;
    }
    case "o:dilemma-marker-at": {
      const [site, index] = part(data.slot);
      if (s.sites[site].slots[index] !== id || e.gangSlots.includes(data.slot))
        throw new Error("需要自己的普通玩家标记");
      s.sites[site].slots[index] = null;
      e.dilemmas.find((v) => v.round === data.round)!.marker = true;
      return true;
    }
    case "o:commands": {
      const maximum = Math.max(
        0,
        Math.min(
          data.count,
          c.stock(s, id),
          h(3) ? Math.floor(p.wallet.cash / 2) : Infinity,
        ),
      );
      choice(
        "艾格尼丝：选择获得的指令数量",
        Array.from({ length: maximum + 1 }, (_, n) =>
          o(String(n), `${n} 指令${h(3) ? ` · 支付 ${n * 2} 金券` : ""}`, [
            ...(h(3) ? [pay(id, { cash: n * 2 })] : []),
            t("o:markers-gain", id, { count: n }),
          ]),
        ),
      );
      return true;
    }
    case "o:markers-gain":
      if (data.count > c.stock(s, id)) throw new Error("玩家标记不足");
      e.markers += data.count;
      return true;
    case "o:markers-spend":
      if (e.markers < data.count) throw new Error("企业家标记不足");
      e.markers -= data.count;
      if (data.retire) p.tokenLimit -= data.count;
      return true;
    case "o:removed-marker": {
      const dorothy = p.persistent.find((v) => v.roleId === "dorothy");
      choice("选择被移除玩家标记的去向", [
        o("supply", "返回供应堆", []),
        ...(e.entrepreneur === "pioneer"
          ? [
              o("pioneer", "保存在企业家牌上", [
                t("o:markers-gain", id, { count: 1 }),
              ]),
            ]
          : []),
        ...(dorothy && dorothy.markers < 4
          ? [o("dorothy", "保存在多萝西牌上", [t("capture-marker-at", id)])]
          : []),
      ]);
      return true;
    }
    case "o:pay-influence":
      choice(
        "移除一个自己的影响力以支付费用",
        c
          .occupied(s, "self", id)
          .map((slot) =>
            o(
              slot,
              slot,
              [t("remove-at", id, { slot }), ...(data.steps ?? [])],
              part(slot)[0],
            ),
          ),
      );
      return true;
    case "o:normal-place": {
      if (c.stock(s, id) <= 0) return true;
      const slots = c.emptySlots(s, id, data.targets, { normal: true });
      choice(
        "放置一个普通影响力",
        slots.map((slot) =>
          o(
            slot,
            slot,
            [t("place-at", id, { slot, normal: true, markerChoice: true })],
            part(slot)[0],
          ),
        ),
      );
      return true;
    }
    case "o:paul-marker": {
      const onlyGang = h(3) && !data.normal;
      choice("保罗：选择放置的影响力标记", [
        ...(!onlyGang && c.stock(s, id) > 0
          ? [
              o("normal", "普通影响力", [
                t("place-at", id, { ...data, gang: false, markerChoice: true }),
              ]),
            ]
          : []),
        ...(!data.normal && e.gangSlots.length < 4
          ? [
              o("gang", "帮派影响力", [
                t("place-at", id, { ...data, gang: true, markerChoice: true }),
              ]),
            ]
          : []),
      ]);
      return true;
    }
    case "o:entrepreneur-cleanup": {
      const out: Option[] = [o("done", "完成企业家收尾", [])];
      if (e.entrepreneur === "thiago") {
        const cost = investmentCost(),
          used = !!data.used;
        if (!used && costOptions(cost.basic, cost.cash).length)
          out.push(
            o("invest", "执行一次基金投资", [
              t("o:investment", id),
              t("o:entrepreneur-cleanup", id, { used: true }),
            ]),
          );
        const repCost = 3 - (h(5, "A") ? 1 : 0);
        if (e.markers >= repCost)
          out.push(
            o("score", `支付 ${repCost} 声望，获得 1 分`, [
              t("o:markers-spend", id, { count: repCost }),
              g(id, { score: 1 }),
              t("o:entrepreneur-cleanup", id, { ...data }),
            ]),
          );
      }
      if (e.entrepreneur === "pioneer" && e.markers >= 3)
        for (const result of ["prime", "place"])
          out.push(
            o(
              result,
              `支付 3 标记，${result === "prime" ? "获得 1 至纯源石" : "放置一个影响力"}`,
              [
                t("o:markers-spend", id, { count: 3 }),
                result === "prime" ? g(id, { prime: 1 }) : t("place", id),
                t("o:entrepreneur-cleanup", id),
              ],
            ),
          );
      if (
        e.entrepreneur === "paul" &&
        h(3) &&
        !data.used &&
        e.gangSlots.some((slot) =>
          s.board.nodes.some((n) => n.id === part(slot)[0]),
        )
      )
        out.push(
          o("gang", "移除一个资源点的帮派影响力并共享收获", [
            t("o:gang-harvest", id),
          ]),
        );
      if (
        e.entrepreneur === "agnes" &&
        h(5, "B") &&
        e.markers >= 2 &&
        !data.used
      )
        out.push(
          o("tactical", "支付 2 指令，执行一项未使用的战术行动", [
            t("o:cleanup-tactical", id),
          ]),
        );
      choice("企业家收尾 · 可自行安排标记转化与能力", out);
      return true;
    }
    case "o:investment": {
      const cost = investmentCost();
      choice(
        "基金投资：确认合计费用",
        costOptions(cost.basic, cost.cash).map((v) =>
          o(
            v.key,
            `${cost.cash} 金券、${v.cost.rock} 源岩、${v.cost.ore} 源石、${v.cost.iron} 异铁`,
            [
              pay(id, v.cost),
              t("o:investment-roll", id, { forced: !!data.forced }),
            ],
          ),
        ),
      );
      return true;
    }
    case "o:investment-roll": {
      const dice = Array.from(
        { length: h(5, "B") ? 3 : 2 },
        () => 1 + Math.floor(c.random(s) * 6),
      );
      log(s, id, `基金投资掷出 ${dice.join("、")}`);
      const gain =
        1 + (h(3, "A") ? 2 : 0) + (h(3, "B") ? 1 : 0) + (h(5, "B") ? 1 : 0);
      choice(
        "基金投资：可选择获得声望",
        Array.from({ length: Math.min(gain, c.stock(s, id)) + 1 }, (_, n) =>
          o(String(n), `获得 ${n} 声望`, [
            t("o:markers-gain", id, { count: n }),
            t("o:investment-choose", id, { dice, forced: data.forced }),
          ]),
        ),
      );
      return true;
    }
    case "o:investment-choose": {
      const dice: number[] = data.dice;
      const values = data.forced
        ? [0, 1, 2, 3, 4, 5, 6, 7]
        : [
            ...new Set(
              dice.flatMap((v) => (h(3, "B") ? [v - 1, v, v + 1] : [v])),
            ),
          ];
      choice(
        "基金投资：选择要发动的点数效果",
        values.map((value) =>
          o(String(value), `发动点数 ${value} 的效果`, [
            ...diceEffect(value),
            ...(h(3, "A") && !data.extra
              ? [t("o:investment-extra", id, { dice, chosen: value })]
              : []),
          ]),
        ),
      );
      return true;
    }
    case "o:investment-extra": {
      const dice: number[] = data.dice;
      choice("是否支付 2 声望发动另一颗点数不同的骰子", [
        o("done", "结束本次投资", []),
        ...(e.markers >= 2
          ? [...new Set(dice)]
              .filter((v) => v !== data.chosen)
              .map((value) =>
                o(String(value), `支付 2 声望，发动 ${value}`, [
                  t("o:markers-spend", id, { count: 2 }),
                  ...diceEffect(value),
                ]),
              )
          : []),
      ]);
      return true;
    }
    case "o:gang-harvest":
      choice(
        "选择收获并移除的帮派影响力",
        e.gangSlots
          .filter((slot) => s.board.nodes.some((n) => n.id === part(slot)[0]))
          .map((slot) =>
            o(
              slot,
              slot,
              [t("o:gang-harvest-at", id, { slot })],
              part(slot)[0],
            ),
          ),
      );
      return true;
    case "o:gang-harvest-at": {
      const [site] = part(data.slot),
        node = s.sites[site],
        owners = [
          id,
          ...new Set(node.slots.filter((v): v is string => !!v && v !== id)),
        ];
      prepend(s, [
        t("remove-at", id, { slot: data.slot }),
        ...(node.resource
          ? owners.map((owner) => g(owner, { [node.resource!]: node.amount }))
          : []),
      ]);
      return true;
    }
    case "o:cleanup-tactical":
      choice(
        "选择尚未使用的战术行动",
        e.dilemmas
          .filter((v) => v.round < 7 && v.marker && !v.used)
          .map((v) =>
            o(String(v.round), `第 ${v.round} 回合战术`, [
              t("o:markers-spend", id, { count: 2 }),
              t("o:tactical", id, { round: v.round }),
            ]),
          ),
      );
      return true;
    case "o:ability": {
      const [kind, number, mode] = String(data.action).split(":"),
        round = Number(number),
        d = e.dilemmas.find((v) => v.round === round);
      if (!d || d.used || !d.marker)
        throw new Error("本回合能力已使用或缺少标记");
      if (kind === "tactical") {
        if (mode === "quick") {
          if (e.markers < 2) throw new Error("指令不足");
          e.markers -= 2;
        }
        prepend(s, [
          ...(mode === "main" ? [g(id, { cash: 10 })] : []),
          t("o:tactical", id, { round }),
        ]);
        return true;
      }
      d.used = true;
      const a = d.side === "A";
      if (e.entrepreneur === "thiago")
        prepend(s, [
          t("o:markers-spend", id, { count: a ? 3 : 2, retire: a }),
          t("o:investment", id, { forced: a }),
        ]);
      if (e.entrepreneur === "agnes") {
        s.roleBlocked = true;
        prepend(s, [
          pay(id, { prime: 1 }),
          t("city", id, { free: true }),
          t("city", id, { free: true }),
        ]);
      }
      if (e.entrepreneur === "paul") {
        if (round === 1)
          prepend(
            s,
            a
              ? [
                  t("o:optional-shift", id),
                  t("o:pay-influence", id, { steps: [t("shift", id)] }),
                ]
              : [pay(id, { cash: 4 }), t("o:replace-own", id), t("shift", id)],
          );
        if (round === 3)
          prepend(s, [
            t("o:basic-payment", id, { count: 2, steps: [t("place", id)] }),
          ]);
        if (round === 5)
          prepend(s, [
            t("o:local-two-remove", id, { count: 2 }),
            t("o:all-gang-income", id),
          ]);
      }
      if (e.entrepreneur === "martin") {
        if (round === 1)
          prepend(
            s,
            a
              ? [t("o:martin-explore-place", id), t("o:blueprint-swap", id)]
              : [
                  pay(id, { ore: 1 }),
                  t("city", id, { free: true }),
                  t("o:blueprint-stack", id, { below: true }),
                ],
          );
        if (round === 5)
          prepend(
            s,
            a
              ? [
                  t("o:blueprint-stack", id, { below: false }),
                  t("o:market-bottom", id, { count: 1, excluded: [] }),
                ]
              : [pay(id, { cash: 2 }), t("build", id, { source: "blueprint" })],
          );
        if (round === 7)
          prepend(
            s,
            a
              ? [
                  t("o:demolish", id),
                  t("place", id),
                  t("allocate", id, { count: 2, resources: BASIC }),
                ]
              : [pay(id, { prime: 1 }), t("build", id), t("place", id)],
          );
      }
      return true;
    }
    case "o:tactical": {
      const d = e.dilemmas.find((v) => v.round === data.round)!;
      if (d.used) throw new Error("此战术本回合已使用");
      d.used = true;
      if (d.round === 1)
        prepend(
          s,
          d.side === "A"
            ? [t("place", id), g(id, { cash: 5 })]
            : [
                t("place", id, { count: 2 }),
                t("schedule", id, {
                  at: "cleanup",
                  step: t("remove", id, { who: "self" }),
                }),
              ],
        );
      if (d.round === 3)
        prepend(
          s,
          d.side === "A"
            ? [
                t("blacksteel-action", id),
                t("allocate", id, { count: 1, resources: BASIC }),
              ]
            : [
                t("conditional", id, {
                  cost: { ore: 2 },
                  steps: [t("remove", id), t("place", id, { count: 2 })],
                }),
              ],
        );
      if (d.round === 5)
        prepend(s, [
          t("o:shift-or-remove", id),
          t("o:commands", id, { count: 1 }),
        ]);
      return true;
    }
    case "o:shift-or-remove":
      choice("选择移动或移除影响力", [
        o("shift", "移动一次", [t("shift", id)]),
        o("remove", "移除一次", [t("remove", id)]),
      ]);
      return true;
    case "o:optional-shift":
      choice("可先移动一个自己的影响力", [
        o("yes", "移动一次", [t("shift", id)]),
        o("skip", "跳过移动", []),
      ]);
      return true;
    case "o:replace-own":
      choice(
        "替换一个自己的影响力",
        c
          .occupied(s, "self", id)
          .map((slot) =>
            o(
              slot,
              slot,
              [t("remove-at", id, { slot }), t("place-exact", id, { slot })],
              part(slot)[0],
            ),
          ),
      );
      return true;
    case "o:basic-payment":
      choice(
        "选择合计支付的基础资源",
        costOptions(data.count).map((v) =>
          o(
            v.key,
            `${v.cost.rock} 源岩、${v.cost.ore} 源石、${v.cost.iron} 异铁`,
            [pay(id, v.cost), ...data.steps],
          ),
        ),
      );
      return true;
    case "o:local-two-remove": {
      if (data.count <= 0 || !p.city) return true;
      choice(
        `移除城市所在资源点影响力 · 剩 ${data.count}`,
        c
          .occupied(s, "any", id, [p.city])
          .map((slot) =>
            o(
              slot,
              slot,
              [
                t("remove-at", id, { slot }),
                t("o:local-two-remove", id, { count: data.count - 1 }),
              ],
              p.city!,
            ),
          ),
      );
      return true;
    }
    case "o:all-gang-income": {
      const nodes = [
        ...new Set(e.gangSlots.map((slot) => part(slot)[0])),
      ].filter((node) => s.sites[node].resource);
      prepend(
        s,
        nodes.map((node) =>
          g(id, { [s.sites[node].resource!]: s.sites[node].amount }),
        ),
      );
      return true;
    }
    case "o:martin-explore-place":
      choice("马丁：探索一次或放置两次", [
        o("explore", "进行探索", [t("explore", id)]),
        o("place", "放置两次影响力", [t("place", id, { count: 2 })]),
      ]);
      return true;
    case "o:core":
      choice(
        "选择额外核心指挥塔的位置",
        c
          .freeCells(p)
          .map((cell) =>
            o(cell, `城市 ${Number(cell) + 1}`, [t("o:core-at", id, { cell })]),
          ),
      );
      return true;
    case "o:core-at":
      if (p.built[data.cell]) throw new Error("核心指挥塔需要空位");
      p.built[data.cell] = { cardId: "core", used: false };
      return true;
    case "o:stack-payment":
      choice(
        "马丁叠建：移除一个自己的影响力",
        c
          .occupied(s, "self", id)
          .map((slot) =>
            o(
              slot,
              slot,
              [t("remove-at", id, { slot }), data.construct],
              part(slot)[0],
            ),
          ),
      );
      return true;
    case "o:build-payment":
      choice(
        "马丁技术补贴：每份基础资源可改付 1 金券",
        discountCosts(p, data.cost, c.canPay).map((cost, index) =>
          o(
            String(index),
            `${cost.rock ?? 0} 源岩、${cost.ore ?? 0} 源石、${cost.iron ?? 0} 异铁、${cost.cash ?? 0} 金券`,
            [pay(id, cost), ...data.steps],
          ),
        ),
      );
      return true;
    case "o:settlement-return":
      choice("临时聚居点：是否拆除并获得 12 金券", [
        o("keep", "保留设施", []),
        o("return", "放回游戏盒，获得 12 金券", [
          t("o:demolish-at", id, { cell: data.cell }),
          g(id, { cash: 12 }),
        ]),
      ]);
      return true;
    case "o:urban-entry": {
      const card = FACILITY_BY_ID[data.cardId],
        cores = allBuilt(p).filter((v) => v.cardId === "core").length;
      prepend(
        s,
        card.effect === "o-urban-place"
          ? [t("place", id, { count: cores })]
          : [
              g(
                id,
                card.effect === "o-urban-score"
                  ? { score: cores }
                  : { cash: cores * 12 },
              ),
            ],
      );
      return true;
    }
    case "o:share-urban":
      choice(
        "马丁：选择一位对手分享城市化区域的入场效果",
        s.players
          .filter((v) => v.id !== id)
          .map((v) =>
            o(v.id, v.name, c.entrySteps(s, v.id, data.cardId, data.cell)),
          ),
      );
      return true;
    case "o:blueprint-swap":
    case "o:blueprint-stack": {
      const pool = s.market.filter(
        (v) => FACILITY_BY_ID[v.split("@")[0]].color !== "wild",
      );
      choice(
        "选择供应设施及同色建设图纸",
        pool.flatMap((market) =>
          e.blueprint
            .filter(
              (v) =>
                FACILITY_BY_ID[v.split("@")[0]].color ===
                FACILITY_BY_ID[market.split("@")[0]].color,
            )
            .map((blueprint) =>
              o(
                `${market}|${blueprint}`,
                `${FACILITY_BY_ID[market.split("@")[0]].name} ↔ ${FACILITY_BY_ID[blueprint.split("@")[0]].name}`,
                [
                  t("o:blueprint-change", id, {
                    market,
                    blueprint,
                    swap: step.kind === "o:blueprint-swap",
                    below: !!data.below,
                  }),
                ],
                undefined,
                FACILITY_BY_ID[blueprint.split("@")[0]].image,
              ),
            ),
        ),
      );
      return true;
    }
    case "o:blueprint-change": {
      const index = s.market.indexOf(data.market),
        b = e.blueprint.indexOf(data.blueprint);
      if (index < 0 || b < 0) throw new Error("设施供应或建设图纸发生变化");
      if (data.swap) {
        s.market[index] = data.blueprint;
        e.blueprint[b] = data.market;
        const under = s.oripathy.marketUnder[data.market];
        if (under) {
          delete s.oripathy.marketUnder[data.market];
          s.oripathy.marketUnder[data.blueprint] = under;
        }
      } else {
        e.blueprint.splice(b, 1);
        if (data.below)
          (s.oripathy.marketUnder[data.market] ??= []).unshift(data.blueprint);
        else {
          s.market[index] = data.blueprint;
          s.oripathy.marketUnder[data.blueprint] = [
            data.market,
            ...(s.oripathy.marketUnder[data.market] ?? []),
          ];
          delete s.oripathy.marketUnder[data.market];
        }
      }
      return true;
    }
    case "o:demolish":
      choice(
        "马丁：移除城市面板最上层的一个设施",
        Object.entries(p.built).map(([cell, b]) =>
          o(cell, FACILITY_BY_ID[b.cardId].name, [
            t("o:demolish-at", id, { cell }),
          ]),
        ),
      );
      return true;
    case "o:demolish-at": {
      const built = p.built[data.cell];
      if (!built) throw new Error("设施不存在");
      if (built.layers?.length)
        p.built[data.cell] = {
          ...built.layers[0],
          layers: built.layers.slice(1),
        };
      else delete p.built[data.cell];
      const mortgage = p.persistent.find(
        (v) =>
          v.roleId === "o-jessica" &&
          v.cell === data.cell &&
          v.mortgageCardId === built.cardId,
      );
      if (mortgage) {
        p.persistent = p.persistent.filter((v) => v !== mortgage);
        p.removed.push("o-jessica");
      }
      return true;
    }
    default:
      return false;
  }
}
