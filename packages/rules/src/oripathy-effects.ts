import { executeExpert, expertActions } from "./oripathy-experts.ts";
import {
  BASIC,
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
  FACILITY_BY_ID,
  PATTERN_BY_ID,
  RESOURCE_NAMES,
  ROLE_BY_ID,
} from "./data.ts";
import { ENTREPRENEURS, FLOW_ROLES, oripathyArt } from "./oripathy-data.ts";
import type { GameState, Option, Player, Reward, Step } from "./types.ts";

export type OripathyRuntime = {
  unlocked: (company: string, level: number) => boolean;
  canPay: (p: Player, cost: Reward) => boolean;
  entrySteps: (
    s: GameState,
    id: string,
    cardId: string,
    cell: string,
  ) => Step[];
  freeCells: (p: Player) => string[];
  removeInfluence: (s: GameState, site: string, index: number) => Step[];
  cityOptions: (
    s: GameState,
    id: string,
    data: Record<string, unknown>,
  ) => Option[];
  task: (kind: string, id: string, data?: Record<string, unknown>) => Step;
  gain: (id: string, reward: Reward) => Step;
  pay: (id: string, reward: Reward) => Step;
  option: (
    id: string,
    label: string,
    steps: Step[],
    target?: string,
    image?: string,
  ) => Option;
  player: (s: GameState, id: string) => Player;
  decide: (
    s: GameState,
    id: string,
    title: string,
    options: Option[],
    kind: string,
    privateInfo?: boolean,
  ) => void;
  prepend: (s: GameState, steps: Step[]) => void;
  log: (
    s: GameState,
    id: string | null,
    text: string,
    visibility?: string[],
  ) => void;
  random: (s: GameState) => number;
  stock: (s: GameState, id: string) => number;
  emptySlots: (
    s: GameState,
    id: string,
    targets?: string[],
    mode?: { normal?: boolean; moving?: boolean },
  ) => string[];
  occupied: (
    s: GameState,
    who: string,
    id: string,
    targets?: string[],
  ) => string[];
  enterpriseSteps: (
    s: GameState,
    id: string,
    company: string,
    level: number,
  ) => Step[];
  mainOptions: (s: GameState, id: string) => Option[];
  buildOptions: (
    s: GameState,
    id: string,
    data: Record<string, unknown>,
  ) => Option[];
  roleSteps: (s: GameState, id: string, role: string, mode: string) => Step[];
};

export function oripathyRoleSteps(
  role: string,
  strategy: boolean,
  id: string,
  c: Pick<OripathyRuntime, "task" | "gain">,
): Step[] | null {
  const { task: t, gain: g } = c;
  switch (role) {
    case "o-amiya":
      return strategy
        ? [t("operative-draw", id)]
        : [t("persistent", id, { role, markers: 0 })];
    case "o-silence":
      return [t(strategy ? "o:borrow-pattern" : "o:lock", id)];
    case "o-ceobe":
      return strategy
        ? [
            t("conditional", id, {
              cost: { ore: 1 },
              steps: [t("o:extra-action", id)],
            }),
          ]
        : [t("o:ceobe-roll", id)];
    case "o-swire":
      return strategy
        ? [t("o:low-trigger", id, { count: 2, excluded: [] })]
        : [t("o:swire-start", id, { owners: [] })];
    case "o-hellagur":
      return strategy
        ? [
            t("blacksteel-action", id, { count: 3 }),
            t("schedule", id, {
              at: "cleanup",
              step: t("remove", id, { count: 2, who: "self" }),
            }),
          ]
        : [t("o:hellagur-discard", id)];
    case "o-gavial":
      return [t(strategy ? "o:gavial-city" : "o:gavial-start", id)];
    case "o-lin":
      return strategy
        ? [t("o:lin-trade", id, { count: 10 })]
        : [t("persistent", id, { role, markers: 2 })];
    case "o-jessica":
      return strategy
        ? [t("o:borrow-company", id)]
        : [t("o:mortgage-build", id)];
    case "o-muelsyse":
      return strategy
        ? [
            t("place", id),
            t("shift", id),
            t("schedule", id, {
              at: "cleanup",
              step: t("o:muelsyse-cleanup", id),
            }),
          ]
        : [t("o:flows-start", id)];
    case "o-flow-a":
      return strategy
        ? [t("shift", id, { count: 2 })]
        : [t("place", id), t("retire-role", id, { role })];
    case "o-flow-b":
      return strategy
        ? [t("o:market-bottom", id, { count: 2, excluded: [] })]
        : [
            t("o:low-trigger", id, { count: 1 }),
            t("retire-role", id, { role }),
          ];
    case "o-flow-c":
      return strategy
        ? [t("o:flow-income", id, { count: 2 })]
        : [t("upgrade", id, { count: 2 }), t("retire-role", id, { role })];
    default:
      return null;
  }
}

/** All choices and dice remain in the authoritative, persisted effect queue. */
export function executeOripathy(
  s: GameState,
  step: Step,
  c: OripathyRuntime,
): void {
  if (!s.oripathy) throw new Error("本局未启用感染者扩展");
  const { task: t, gain: g, pay, option: o, decide, prepend, player, log } = c;
  const id = step.actor,
    p = player(s, id),
    d = step.data ?? ({} as Record<string, any>);
  const data = d as Record<string, any>,
    count = Number(data.count ?? 1);
  const choose = (
    title: string,
    options: Option[],
    kind = step.kind,
    secret = false,
  ) => decide(s, id, title, options, kind, secret);
  const finishPersistent = (role: string) => {
    p.persistent = p.persistent.filter((v) => v.roleId !== role);
    p.discard.push(role);
  };
  const securitySlots = (moving = false) =>
    Object.entries(s.sites).flatMap(([siteId, site]) => {
      const node = s.board.nodes.find((n) => n.id === siteId);
      if (
        site.publicRoad ||
        (node &&
          (!site.resource || s.players.some((v) => v.city === siteId))) ||
        (!moving &&
          s.oripathy!.lock &&
          [...s.board.nodes, ...s.board.roads].find((n) => n.id === siteId)
            ?.region === s.oripathy!.lock!.region)
      )
        return [];
      return site.slots.flatMap((owner, index) =>
        !owner && !s.oripathy!.security.includes(`${siteId}:${index}`)
          ? [`${siteId}:${index}`]
          : [],
      );
    });
  switch (step.kind) {
    case "o:borrow-pattern":
      choose(
        "淬羽赫默：执行场上一张Ⅱ级样式的特殊行动",
        s.patterns
          .filter((k) => PATTERN_BY_ID[k].level === 2)
          .map((pattern) =>
            o(
              pattern,
              PATTERN_BY_ID[pattern].name,
              [t("special", id, { pattern, borrowed: true })],
              undefined,
              PATTERN_BY_ID[pattern].image,
            ),
          ),
      );
      return;
    case "o:lock":
      s.oripathy.lock = {
        owner: id,
        turn: s.oripathy.turn,
        region: s.board.nodes.find((n) => n.id === p.city)!.region,
      };
      prepend(s, [g(id, { score: 1 })]);
      log(s, id, "锁定城市所在区块，下一次轮到自己行动时解除");
      return;
    case "o:extra-action":
      choose("额外执行一次主要行动", [
        ...c.mainOptions(s, id),
        ...(data.special
          ? expertActions({ ...s, mainDone: false, extraOnly: false }, p)
              .filter((a) => a.group === "main")
              .map((a) =>
                o(a.id, a.label, [
                  t("o:ability", id, { action: a.command.action }),
                ]),
              )
          : []),
        ...(data.special
          ? p.claims
              .filter((claim) => {
                const pattern = PATTERN_BY_ID[claim.patternId];
                return (
                  !claim.cooldown &&
                  claim.uses !== 0 &&
                  !["relay", "o-emerging", "o-management"].includes(
                    pattern.effect,
                  ) &&
                  (pattern.level === 1 ||
                    pattern.effect === "command-center" ||
                    !p.roleUsedThisTurn)
                );
              })
              .map((claim) =>
                o(
                  claim.patternId,
                  `特殊行动 · ${PATTERN_BY_ID[claim.patternId].name}`,
                  [t("special", id, { pattern: claim.patternId })],
                  undefined,
                  PATTERN_BY_ID[claim.patternId].image,
                ),
              )
          : []),
      ]);
      return;
    case "o:ceobe-roll": {
      const die = 1 + Math.floor(c.random(s) * 6);
      log(s, id, `刻俄柏掷出 ${die}`);
      prepend(
        s,
        die <= 2
          ? [t("remove", id), t("place", id, { count: 2 })]
          : die <= 4
            ? [g(id, { prime: 2 })]
            : [
                t("o:extra-action", id, { special: true }),
                t("o:ceobe-give", id),
              ],
      );
      return;
    }
    case "o:ceobe-give":
      choose(
        "将刻俄柏交给一位对手",
        s.players
          .filter((v) => v.id !== id)
          .map((v) =>
            o(v.id, v.name, [t("o:ceobe-give-at", id, { to: v.id })]),
          ),
      );
      return;
    case "o:ceobe-give-at":
      p.selected = null;
      p.coveredFlows = p.coveredFlows?.filter((v) => v !== "o-ceobe");
      p.hand = p.hand.filter((v) => v !== "o-ceobe");
      p.discard = p.discard.filter((v) => v !== "o-ceobe");
      player(s, data.to).hand.push("o-ceobe");
      return;
    case "o:low-trigger": {
      const choices = s.activeEnterprises.flatMap((company) =>
        Array.from(
          { length: Math.min(2, p.enterprise[company]) },
          (_, i) => i + 1,
        )
          .filter(
            (level) =>
              c.unlocked(company, level) &&
              !data.excluded?.includes(`${company}:${level}`),
          )
          .map((level) => ({ company, level, key: `${company}:${level}` })),
      );
      choose(
        "选择一个已解锁的 1–2 级企业特效",
        choices.map(({ company, level, key }) =>
          o(
            key,
            `${ENTERPRISE_NAMES[company]} · ${level} 级`,
            [
              ...c.enterpriseSteps(s, id, company, level),
              ...(count > 1
                ? [
                    t("o:low-trigger", id, {
                      count: count - 1,
                      excluded: [...(data.excluded ?? []), key],
                    }),
                  ]
                : []),
            ],
            undefined,
            ENTERPRISE_IMAGES[company],
          ),
        ),
      );
      return;
    }
    case "o:swire-start": {
      const owners: string[] = data.owners ?? [];
      choose("诗怀雅：邀请至多两位对手放置标记", [
        ...s.players
          .filter(
            (v) =>
              v.id !== id &&
              !owners.includes(v.id) &&
              c.stock(s, v.id) > 0 &&
              owners.length < 2,
          )
          .map((v) =>
            o(v.id, v.name, [
              t("o:swire-start", id, { owners: [...owners, v.id] }),
            ]),
          ),
        o(
          "done",
          `确认 ${owners.length} 位合作伙伴`,
          owners.length ? [t("o:swire-install", id, { owners })] : [],
        ),
      ]);
      return;
    }
    case "o:swire-install":
      p.persistent.push({
        roleId: "o-swire",
        markers: 0,
        stash: [],
        owners: data.owners,
      });
      if (p.selected === "o-swire") p.selected = null;
      return;
    case "o:swire-cleanup": {
      const effect = p.persistent.find((v) => v.roleId === "o-swire");
      if (!effect?.owners?.length) return;
      choose(
        "诗怀雅：选择返还的合作标记",
        effect.owners.map((owner) =>
          o(owner, player(s, owner).name, [
            t("o:swire-company", id, { owner }),
          ]),
        ),
      );
      return;
    }
    case "o:swire-company": {
      const effect = p.persistent.find((v) => v.roleId === "o-swire")!;
      effect.owners = effect.owners!.filter((v) => v !== data.owner);
      if (!effect.owners.length) finishPersistent("o-swire");
      prepend(s, [g(id, { cash: 6 })]);
      choose(
        "诗怀雅：两位玩家提升同一家企业",
        s.activeEnterprises.map((company) =>
          o(company, ENTERPRISE_NAMES[company], [
            t("upgrade-at", id, { company, count: 1 }),
            t("upgrade-at", data.owner, { company, count: 1 }),
          ]),
        ),
      );
      return;
    }
    case "o:hellagur-discard":
      choose(
        "赫拉格：可先弃置一张手牌",
        [
          ...p.hand.map((role) =>
            o(
              role,
              ROLE_BY_ID[role].name,
              [t("o:hellagur-discard-at", id, { role })],
              undefined,
              ROLE_BY_ID[role].image,
            ),
          ),
          o("skip", "不弃牌，继续盖放", [t("o:hellagur-cover", id)]),
        ],
        step.kind,
        true,
      );
      return;
    case "o:hellagur-discard-at":
      p.hand = p.hand.filter((v) => v !== data.role);
      p.discard.push(data.role);
      prepend(s, [t("o:hellagur-cover", id)]);
      return;
    case "o:hellagur-cover":
      choose(
        "赫拉格：秘密盖放一张手牌或弃牌，本轮不能使用",
        [...p.hand, ...p.discard]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((role) =>
            o(
              role,
              ROLE_BY_ID[role].name,
              [t("o:hellagur-cover-at", id, { role })],
              undefined,
              ROLE_BY_ID[role].image,
            ),
          ),
        step.kind,
        true,
      );
      return;
    case "o:hellagur-cover-at":
      if (p.selected) p.discard.push(p.selected);
      p.hand = p.hand.filter((v) => v !== data.role);
      p.discard = p.discard.filter((v) => v !== data.role);
      p.selected = data.role;
      p.revealed = false;
      p.oripathy!.turnBlocked = true;
      return;
    case "o:gavial-city":
      choose(
        "嘉维尔：免费移至任意已探索的空闲资源点",
        s.board.nodes
          .filter(
            (n) =>
              n.id !== p.city &&
              s.sites[n.id].resource &&
              !s.players.some((v) => v.city === n.id) &&
              !s.players.some(
                (v) =>
                  v.id !== id &&
                  v.oripathy?.entrepreneur === "paul" &&
                  v.oripathy.dilemmas.some(
                    (d) => d.round === 5 && d.side === "B",
                  ) &&
                  v.oripathy.gangSlots.some((slot) =>
                    slot.startsWith(`${n.id}:`),
                  ) &&
                  s.sites[n.id].slots.some(
                    (owner, index) =>
                      owner === v.id &&
                      !v.oripathy!.gangSlots.includes(`${n.id}:${index}`),
                  ),
              ),
          )
          .map((n) =>
            o(
              n.id,
              n.id,
              [t("relocate", id, { to: n.id, road: null, gavial: true })],
              n.id,
            ),
          ),
      );
      return;
    case "o:gavial-start":
      choose(
        "在任意资源点放置嘉维尔指示物",
        s.board.nodes.map((n) =>
          o(n.id, n.id, [t("o:gavial-set", id, { node: n.id })], n.id),
        ),
      );
      return;
    case "o:gavial-set":
      s.oripathy.gavial = { owner: id, node: data.node };
      p.persistent.push({ roleId: "o-gavial", markers: 0, stash: [] });
      if (p.selected === "o-gavial") p.selected = null;
      return;
    case "o:gavial-cleanup": {
      const marker = s.oripathy.gavial;
      if (!marker || marker.owner !== id) return;
      const adjacent = [
        ...new Set(
          s.board.roads
            .filter((r) => r.nodes.includes(marker.node))
            .flatMap((r) => r.nodes),
        ),
      ].filter((n) => n !== marker.node);
      choose(
        "嘉维尔：转移至相邻资源点",
        adjacent.map((node) =>
          o(node, node, [t("o:gavial-move", id, { node })], node),
        ),
      );
      return;
    }
    case "o:gavial-move":
      s.oripathy.gavial!.node = data.node;
      choose(
        "嘉维尔：移动该点一个影响力",
        c
          .occupied(s, "any", id, [data.node])
          .filter(
            (slot) =>
              !!s.sites[data.node].slots[Number(slot.split(":").at(-1))],
          )
          .map((slot) =>
            o(
              slot,
              slot,
              [
                t("shift-target", id, {
                  slot,
                  owner:
                    s.sites[data.node].slots[Number(slot.split(":").at(-1))],
                  count: 1,
                }),
              ],
              data.node,
            ),
          ),
      );
      return;
    case "o:lin-trade": {
      if (count <= 0) return;
      const prices = { rock: 3, ore: 4, iron: 5, prime: 15 } as const;
      choose(`林：剩 ${count} 次资源交易`, [
        o("done", "结束交易", []),
        ...Object.entries(prices).flatMap(([resource, price]) => [
          ...(p.wallet[resource as keyof typeof prices] > 0
            ? [
                o(
                  `sell:${resource}`,
                  `出售 1 ${RESOURCE_NAMES[resource as keyof typeof prices]}，获得 ${price} 金券`,
                  [
                    pay(id, { [resource]: 1 }),
                    g(id, { cash: price }),
                    t("o:lin-trade", id, { count: count - 1 }),
                  ],
                ),
              ]
            : []),
          ...(p.wallet.cash >= price - 2
            ? [
                o(
                  `buy:${resource}`,
                  `支付 ${price - 2} 金券，购入 1 ${RESOURCE_NAMES[resource as keyof typeof prices]}`,
                  [
                    pay(id, { cash: price - 2 }),
                    g(id, { [resource]: 1 }),
                    t("o:lin-trade", id, { count: count - 1 }),
                  ],
                ),
              ]
            : []),
        ]),
      ]);
      return;
    }
    case "o:lin-cleanup": {
      const effect = p.persistent.find((v) => v.roleId === "o-lin");
      if (!effect?.markers) return;
      choose("林：可消耗一个标记，取走富有对手的 10 金券", [
        o("skip", "保留标记", []),
        o("discard", "只移除一个标记", [t("o:lin-take", id)]),
        ...s.players
          .filter((v) => v.id !== id && v.wallet.cash >= 20)
          .map((v) => o(v.id, v.name, [t("o:lin-take", id, { owner: v.id })])),
      ]);
      return;
    }
    case "o:lin-take": {
      const effect = p.persistent.find((v) => v.roleId === "o-lin")!;
      effect.markers--;
      if (!effect.markers) finishPersistent("o-lin");
      if (data.owner)
        prepend(s, [pay(data.owner, { cash: 10 }), g(id, { cash: 10 })]);
      return;
    }
    case "o:borrow-company":
      choose(
        "涤火杰西卡：选择一位对手已解锁的企业特效",
        s.players
          .filter((v) => v.id !== id)
          .flatMap((v) =>
            s.activeEnterprises.flatMap((company) =>
              Array.from({ length: v.enterprise[company] }, (_, i) => i + 1)
                .filter((level) => c.unlocked(company, level))
                .map((level) =>
                  o(
                    `${v.id}:${company}:${level}`,
                    `${v.name} · ${ENTERPRISE_NAMES[company]} ${level} 级`,
                    c.enterpriseSteps(s, id, company, level),
                    undefined,
                    ENTERPRISE_IMAGES[company],
                  ),
                ),
            ),
          ),
      );
      return;
    case "o:mortgage-build":
      choose(
        "涤火杰西卡：失去 2 分并抵押免费建设",
        c.buildOptions(s, id, { free: true, mortgage: true }).map((v) => ({
          ...v,
          steps: [pay(id, { score: 2 }), ...v.steps],
        })),
      );
      return;
    case "o:mortgage-cleanup": {
      const effect = p.persistent.find((v) => v.roleId === "o-jessica");
      if (!effect?.cell || !p.built[effect.cell]) return;
      const cost =
        FACILITY_BY_ID[effect.mortgageCardId ?? p.built[effect.cell].cardId]
          .cashCost + 2;
      choose("涤火杰西卡：赎回抵押", [
        o("skip", "保留抵押", []),
        ...(p.wallet.cash >= cost
          ? [
              o("redeem", `支付 ${cost} 金券，获得 2 分并收回角色`, [
                pay(id, { cash: cost }),
                g(id, { score: 2 }),
                t("o:mortgage-redeem", id),
              ]),
            ]
          : []),
      ]);
      return;
    }
    case "o:mortgage-redeem":
      finishPersistent("o-jessica");
      return;
    case "o:muelsyse-cleanup":
      prepend(s, [t("place", id), t("shift", id)]);
      return;
    case "o:flows-start":
      if (!p.persistent.some((v) => v.roleId === "o-muelsyse"))
        p.persistent.push({ roleId: "o-muelsyse", markers: 0, stash: [] });
      if (p.selected === "o-muelsyse") p.selected = null;
      prepend(
        s,
        s.oripathy.flows.map((role) => t("o:flow-receive", id, { role })),
      );
      s.oripathy.flows = [];
      return;
    case "o:flow-receive":
      choose(
        `缪尔赛思：${ROLE_BY_ID[data.role].name} 加入手牌或弃牌`,
        [
          o("hand", "加入手牌", [
            t("o:flow-receive-at", id, { role: data.role, hand: true }),
          ]),
          o("discard", "加入弃牌", [
            t("o:flow-receive-at", id, { role: data.role, hand: false }),
          ]),
        ],
        step.kind,
        true,
      );
      return;
    case "o:flow-receive-at":
      (data.hand ? p.hand : p.discard).push(data.role);
      return;
    case "o:cover-flow":
      choose(
        "缪尔赛思：可额外盖放一张流形",
        [
          o("skip", "完成盖放", []),
          ...p.hand
            .filter((v) => v.startsWith("o-flow-"))
            .map((role) =>
              o(
                role,
                ROLE_BY_ID[role].name,
                [t("o:cover-flow-at", id, { role })],
                undefined,
                ROLE_BY_ID[role].image,
              ),
            ),
        ],
        step.kind,
        true,
      );
      return;
    case "o:cover-flow-at":
      p.hand = p.hand.filter((v) => v !== data.role);
      (p.coveredFlows ??= []).push(data.role);
      return;
    case "o:flow-income":
      if (count <= 0) return;
      choose("流形丙：选择资源", [
        ...BASIC.map((resource) =>
          o(resource, `获得 1 ${RESOURCE_NAMES[resource]}`, [
            g(id, { [resource]: 1 }),
            t("o:flow-income", id, { count: count - 1 }),
          ]),
        ),
        o("cash", "获得 4 金券", [
          g(id, { cash: 4 }),
          t("o:flow-income", id, { count: count - 1 }),
        ]),
      ]);
      return;
    case "o:market-bottom":
      if (count <= 0) return;
      choose("流形乙：将不同名称的设施放到牌堆底", [
        o("skip", "完成整理", []),
        ...s.market
          .filter(
            (v) =>
              !data.excluded?.includes(FACILITY_BY_ID[v.split("@")[0]].name),
          )
          .map((instance) =>
            o(instance, FACILITY_BY_ID[instance.split("@")[0]].name, [
              t("market-remove-at", id, { instance, bottom: true }),
              t("o:market-bottom", id, {
                count: count - 1,
                excluded: [
                  ...(data.excluded ?? []),
                  FACILITY_BY_ID[instance.split("@")[0]].name,
                ],
              }),
            ]),
          ),
      ]);
      return;
    case "o:consume-amiya":
      finishPersistent("o-amiya");
      return;
    case "o:rhodes-office":
      choose("罗德岛办事处：干员特派或提升两家不同企业", [
        o("operative", "干员特派", [t("operative-draw", id)]),
        o("companies", "提升两家不同企业", [
          t("o:distinct-upgrade", id, { count: 2, excluded: [] }),
        ]),
      ]);
      return;
    case "o:distinct-upgrade":
      if (count <= 0) return;
      choose(
        "选择提升的不同企业",
        s.activeEnterprises
          .filter(
            (company) =>
              p.enterprise[company] < 5 && !data.excluded?.includes(company),
          )
          .map((company) =>
            o(company, ENTERPRISE_NAMES[company], [
              t("upgrade-at", id, { company, count: 1 }),
              t("o:distinct-upgrade", id, {
                count: count - 1,
                excluded: [...(data.excluded ?? []), company],
              }),
            ]),
          ),
      );
      return;
    case "o:management":
      choose(
        "城区管理中心：收回一个Ⅱ级样式标记",
        p.claims.flatMap((claim, index) =>
          PATTERN_BY_ID[claim.patternId].level === 2
            ? [
                o(String(index), PATTERN_BY_ID[claim.patternId].name, [
                  t("o:management-at", id, { index }),
                  g(id, { prime: 1 }),
                ]),
              ]
            : [],
        ),
      );
      return;
    case "o:management-at":
      p.claims.splice(data.index, 1);
      return;
    case "o:company-double-trigger":
      choose(
        "综合企业办公区：同一家企业提升两次后触发",
        s.activeEnterprises.map((company) =>
          o(company, ENTERPRISE_NAMES[company], [
            t("upgrade-at", id, { company, count: 2 }),
            t("trigger", id, { company }),
          ]),
        ),
      );
      return;
    case "o:security-place":
      if (count <= 0 || s.oripathy.security.length >= 8) return;
      choose(
        `放置岩蹄安保影响力 · 剩 ${count} 次`,
        securitySlots().map((slot) =>
          o(
            slot,
            slot,
            [
              t("o:security-place-at", id, { slot }),
              ...(count > 1
                ? [t("o:security-place", id, { count: count - 1 })]
                : []),
            ],
            slot.slice(0, slot.lastIndexOf(":")),
          ),
        ),
      );
      return;
    case "o:security-place-at":
      if (
        s.oripathy.security.length >= 8 ||
        !securitySlots().includes(data.slot)
      )
        throw new Error("岩蹄安保标记或目标位置不可用");
      s.oripathy.security.push(data.slot);
      log(s, id, `在 ${data.slot} 放置岩蹄安保影响力`);
      return;
    case "o:security-shift":
      if (count <= 0) return;
      choose(
        "选择移动的岩蹄安保影响力",
        s.oripathy.security.map((slot) =>
          o(
            slot,
            slot,
            [t("o:security-destination", id, { slot, count })],
            slot.slice(0, slot.lastIndexOf(":")),
          ),
        ),
      );
      return;
    case "o:security-destination":
      choose(
        "选择岩蹄安保影响力的目标位置",
        securitySlots(true).map((to) =>
          o(
            to,
            to,
            [
              t("o:security-shift-at", id, { from: data.slot, to }),
              ...(count > 1
                ? [t("o:security-shift", id, { count: count - 1 })]
                : []),
            ],
            to.slice(0, to.lastIndexOf(":")),
          ),
        ),
      );
      return;
    case "o:security-shift-at":
      if (
        !s.oripathy.security.includes(data.from) ||
        !securitySlots(true).includes(data.to)
      )
        throw new Error("岩蹄安保移动位置无效");
      s.oripathy.security = s.oripathy.security.filter((v) => v !== data.from);
      s.oripathy.security.push(data.to);
      return;
    case "o:security-first":
      choose("岩蹄安保：放置一次或移动两次安保影响力", [
        o("place", "放置一次", [t("o:security-place", id)]),
        o("shift", "移动两次", [t("o:security-shift", id, { count: 2 })]),
      ]);
      return;
    case "o:security-upgrade":
      choose(
        "岩蹄安保：移除一个自己的影响力以提升合作等级",
        c
          .occupied(s, "self", id)
          .map((slot) =>
            o(
              slot,
              slot,
              [
                t("remove-at", id, { slot }),
                t("upgrade-at", id, { company: "stonehoove", count: 1 }),
              ],
              slot.slice(0, slot.lastIndexOf(":")),
            ),
          ),
      );
      return;
    case "o:security-fourth":
      choose(
        "岩蹄安保：放置自己的影响力后移动一次安保影响力",
        c
          .emptySlots(s, id)
          .map((slot) =>
            o(
              slot,
              slot,
              [t("place-at", id, { slot }), t("o:security-shift", id)],
              slot.slice(0, slot.lastIndexOf(":")),
            ),
          ),
      );
      return;
    case "o:security-contract":
      if (
        s.oripathy.contracts.length < 2 &&
        !s.oripathy.contracts.includes(id)
      ) {
        s.oripathy.contracts.push(id);
        log(s, id, "获得终身安保合约");
      }
      return;
    case "o:award-select":
      choose(
        "梅兰德基金会：选择剩余授勋牌",
        s.oripathy.awards.map((award) =>
          o(
            award,
            (
              {
                "1184": "快速触发企业",
                "1185": "立即获得 1 分",
                "1186": "获得 20 金券并修建两条公路",
                "1187": "持续收尾奖励",
              } as Record<string, string>
            )[award],
            [t("o:award-at", id, { award })],
            undefined,
            oripathyArt(award),
          ),
        ),
      );
      return;
    case "o:award-at":
      if (!s.oripathy.awards.includes(data.award))
        throw new Error("授勋牌已经被取走");
      s.oripathy.awards = s.oripathy.awards.filter((v) => v !== data.award);
      if (data.award === "1185") prepend(s, [g(id, { score: 1 })]);
      else if (data.award === "1186")
        prepend(s, [g(id, { cash: 20 }), t("o:award-road", id, { count: 2 })]);
      else p.oripathy!.awards.push(data.award);
      return;
    case "o:award-road":
      if (count <= 0) return;
      choose(
        "授勋：将一条航道改为公路",
        s.board.roads
          .filter((r) => !s.sites[r.id].publicRoad)
          .map((r) =>
            o(
              r.id,
              r.id,
              [
                t("public-road-at", id, { road: r.id, noCompensation: true }),
                ...(count > 1
                  ? [t("o:award-road", id, { count: count - 1 })]
                  : []),
              ],
              r.id,
            ),
          ),
      );
      return;
    case "o:award-cleanup":
      prepend(s, [
        g(id, { cash: 3 }),
        t("allocate", id, { count: 1, resources: BASIC }),
        t("shift", id),
      ]);
      return;
    case "o:award-use":
      if (!p.oripathy!.awards.includes("1184"))
        throw new Error("该授勋牌不可用");
      p.oripathy!.awards = p.oripathy!.awards.filter((v) => v !== "1184");
      prepend(s, [t("trigger", id)]);
      return;
    default:
      if (executeExpert(s, step, c)) return;
      throw new Error(`感染者效果未注册：${step.kind}`);
  }
}
