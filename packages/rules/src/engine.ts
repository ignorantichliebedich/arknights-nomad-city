import { oripathyEnterpriseImage } from "./oripathy-data.ts";
import { batchChoice } from "./batch-choices.ts";
import {
  allBuilt,
  discountCosts,
  expertActions,
  hasDilemma,
  takeMarket,
} from "./oripathy-experts.ts";
import {
  AMIYA,
  FLOW_ROLES,
  ORIPATHY_OPERATIVES,
  ORIPATHY_RULES_VERSION,
  ENTREPRENEURS,
} from "./oripathy-data.ts";
import { executeOripathy, oripathyRoleSteps } from "./oripathy-effects.ts";
import {
  BASIC,
  BASE_ROLES,
  ENTERPRISES,
  ENTERPRISE_NAMES,
  ENTERPRISE_IMAGES,
  EVENTS,
  EVENT_BY_ID,
  FACILITIES,
  FACILITY_BY_ID,
  OPERATIVES,
  PATTERNS,
  PATTERN_BY_ID,
  RESOURCE_NAMES,
  RESOURCES,
  ROLE_BY_ID,
  RULES_VERSION,
  VERIFIED_ENTERPRISES,
  boardFor,
  redZoneOpensAt,
} from "./data.ts";
import { COMPLETE_RHINE_RULES, RHINE_DEPARTMENTS } from "./original-labs.ts";
import type { OriginalLabReward } from "./original-labs.ts";
import type {
  Command,
  Decision,
  GameState,
  LegalAction,
  Option,
  ParallelPhase,
  Player,
  PlayerView,
  Resource,
  Reward,
  ScoreLine,
  Step,
  Wallet,
} from "./types.ts";

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
const task = (
  kind: string,
  actor: string,
  data: Record<string, unknown> = {},
): Step => ({ kind, actor, data });
const gain = (actor: string, reward: Reward): Step =>
  task("gain", actor, { reward });
const pay = (actor: string, cost: Reward): Step => task("pay", actor, { cost });
const option = (
  id: string,
  label: string,
  steps: Step[],
  target?: string,
  image?: string,
): Option => ({ id, label, steps, target, image });
const wallet = (): Wallet => ({
  rock: 0,
  ore: 0,
  iron: 0,
  prime: 0,
  cash: 0,
  score: 0,
});
function player(s: GameState, id: string): Player {
  const p = s.players.find((p) => p.id === id);
  ensure(p, "玩家席位不存在");
  return p;
}
function random(s: GameState): number {
  let x = s.randomState;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.randomState = x >>> 0;
  return s.randomState / 4294967296;
}
function shuffle<T>(s: GameState, list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function log(
  s: GameState,
  actor: string | null,
  text: string,
  visibility?: string[],
) {
  s.log.push({
    seq: s.log.length + 1,
    round: s.round,
    actor,
    text,
    visibility,
  });
}
function prepend(s: GameState, steps: Step[]) {
  s.queue.unshift(...steps);
}
function canPay(p: Player, cost: Reward) {
  const markers =
    p.persistent.find((v) => v.roleId === "passenger")?.markers ?? 0;
  if (
    !["cash", "prime"].every(
      (r) => p.wallet[r as Resource] >= (cost[r as Resource] ?? 0),
    )
  )
    return false;
  return (
    BASIC.reduce((n, r) => n + Math.max(0, (cost[r] ?? 0) - p.wallet[r]), 0) <=
    Math.min(2, markers)
  );
}
function removeInfluence(s: GameState, siteId: string, index: number): Step[] {
  const slot = `${siteId}:${index}`;
  if (s.oripathy?.security.includes(slot)) {
    s.oripathy.security = s.oripathy.security.filter((v) => v !== slot);
    return [];
  }
  const owner = s.sites[siteId].slots[index];
  if (!owner) return [];
  s.sites[siteId].slots[index] = null;
  const p = player(s, owner),
    steps: Step[] = [];
  const gang = !!p.oripathy?.gangSlots.includes(slot);
  if (gang) {
    p.oripathy!.gangSlots = p.oripathy!.gangSlots.filter((v) => v !== slot);
    if (hasDilemma(p, 1) && p.city)
      steps.push(task("o:normal-place", owner, { targets: [p.city] }));
  }
  const dorothy = p.persistent.find((v) => v.roleId === "dorothy");
  if (!gang && p.oripathy?.entrepreneur === "pioneer")
    steps.push(task("o:removed-marker", owner));
  else if (!gang && dorothy && dorothy.markers < 4)
    steps.push(task("capture-marker", owner));
  if (p.oripathy?.entrepreneur === "agnes" && hasDilemma(p, 3, "A"))
    steps.push(task("o:commands", owner, { count: 1 }));
  return steps;
}
function paymentOptions(
  p: Player,
  cost: Reward,
): { id: string; cost: Reward; markers: number }[] {
  const available = Math.min(
    2,
    p.persistent.find((v) => v.roleId === "passenger")?.markers ?? 0,
  );
  const options: { id: string; cost: Reward; markers: number }[] = [];
  for (let rock = 0; rock <= Math.min(available, cost.rock ?? 0); rock++)
    for (let ore = 0; ore <= Math.min(available - rock, cost.ore ?? 0); ore++)
      for (
        let iron = 0;
        iron <= Math.min(available - rock - ore, cost.iron ?? 0);
        iron++
      ) {
        const reduced = { ...cost };
        if (cost.rock) reduced.rock = (reduced.rock ?? 0) - rock;
        if (cost.ore) reduced.ore = (reduced.ore ?? 0) - ore;
        if (cost.iron) reduced.iron = (reduced.iron ?? 0) - iron;
        if (
          RESOURCES.every(
            (r) => r === "score" || p.wallet[r] >= (reduced[r] ?? 0),
          )
        )
          options.push({
            id: `${rock}:${ore}:${iron}`,
            cost: reduced,
            markers: rock + ore + iron,
          });
      }
  return options;
}
function moneyText(reward: Reward) {
  return (
    RESOURCES.filter((r) => reward[r])
      .map((r) => `${reward[r]} ${RESOURCE_NAMES[r]}`)
      .join("、") || "免费"
  );
}
function decide(
  s: GameState,
  p: string,
  title: string,
  options: Option[],
  kind: string,
  privateInfo = false,
) {
  if (options.length)
    s.decision = { playerId: p, title, options, kind, private: privateInfo };
}
function stock(s: GameState, id: string): number {
  const p = player(s, id);
  return (
    p.tokenLimit -
    Object.values(s.sites).reduce(
      (n, site) => n + site.slots.filter((v) => v === id).length,
      0,
    ) -
    p.claims.length -
    Object.keys(p.enterprise).length -
    p.persistent.reduce((n, v) => n + v.markers, 0) -
    s.players.reduce(
      (n, other) =>
        n +
        other.persistent.reduce(
          (m, e) => m + (e.owners ?? []).filter((owner) => owner === id).length,
          0,
        ),
      0,
    ) -
    (p.oripathy?.markers ?? 0) -
    (p.oripathy?.dilemmas.filter((v) => v.marker).length ?? 0) +
    (p.oripathy?.gangSlots.length ?? 0)
  );
}
function emptySlots(
  s: GameState,
  id: string,
  targets?: string[],
  mode: { normal?: boolean; moving?: boolean } = {},
): string[] {
  const p = player(s, id),
    paul = p.oripathy?.entrepreneur === "paul",
    gangFree = 4 - (p.oripathy?.gangSlots.length ?? 0);
  if (!mode.moving) {
    if (
      mode.normal
        ? stock(s, id) <= 0
        : paul && hasDilemma(p, 3)
          ? gangFree <= 0
          : stock(s, id) <= 0 && (!paul || gangFree <= 0)
    )
      return [];
  }
  return Object.entries(s.sites).flatMap(([siteId, site]) => {
    if (targets && !targets.includes(siteId)) return [];
    const n = s.board.nodes.find((n) => n.id === siteId);
    if (s.oripathy?.lock && !mode.moving) {
      const region = s.oripathy.lock.region;
      const at = [...s.board.nodes, ...s.board.roads].find(
        (n) => n.id === siteId,
      );
      if (at?.region === region) return [];
    }
    if (
      site.publicRoad ||
      (n &&
        (!site.resource ||
          s.players.some((p) => p.id !== id && p.city === siteId)))
    )
      return [];
    return site.slots.flatMap((owner, i) =>
      owner === null && !s.oripathy?.security.includes(`${siteId}:${i}`)
        ? [`${siteId}:${i}`]
        : [],
    );
  });
}
function occupied(
  s: GameState,
  who: string,
  actor: string,
  targets?: string[],
): string[] {
  return Object.entries(s.sites).flatMap(([id, site]) =>
    targets && !targets.includes(id)
      ? []
      : site.slots.flatMap((owner, i) =>
          (owner ||
            ((who === "any" || who === "opponent") &&
              s.oripathy?.security.includes(`${id}:${i}`))) &&
          (who === "any" ||
            (who === "self"
              ? owner === actor
              : who === "opponent"
                ? owner !== actor
                : owner === who))
            ? [`${id}:${i}`]
            : [],
        ),
  );
}
function slotParts(slot: string): [string, number] {
  const i = slot.lastIndexOf(":");
  return [slot.slice(0, i), Number(slot.slice(i + 1))];
}
function nodeOpen(s: GameState, id: string) {
  const n = s.board.nodes.find((n) => n.id === id);
  return (
    !!n && (n.tier !== "red" || s.round >= redZoneOpensAt(s.players.length))
  );
}
function roadsFor(s: GameState, node: string) {
  return s.board.roads.filter((r) => r.nodes.includes(node));
}
function roadCost(s: GameState, id: string, road: string) {
  const site = s.sites[road];
  return site.publicRoad || site.slots.includes(id) ? 0 : 2;
}
export function routeTo(
  s: GameState,
  id: string,
  target: string,
  paidRoads: string[] = [],
): { roads: string[]; cost: number } {
  const start = player(s, id).city;
  ensure(start, "城市尚未入场");
  const dist = new Map<string, { cost: number; roads: string[] }>([
    [start, { cost: 0, roads: [] }],
  ]);
  const done = new Set<string>();
  while (true) {
    const entry = [...dist]
      .filter(([key]) => !done.has(key))
      .sort(
        (a, b) =>
          a[1].cost - b[1].cost ||
          a[1].roads.length - b[1].roads.length ||
          a[0].localeCompare(b[0]),
      )[0];
    if (!entry) break;
    const [key, path] = entry;
    if (key === target) return path;
    done.add(key);
    for (const road of roadsFor(s, key))
      for (const next of road.nodes) {
        if (done.has(next)) continue;
        const candidate = {
          cost:
            path.cost +
            (paidRoads.includes(road.id) ? 0 : roadCost(s, id, road.id)),
          roads: [...path.roads, road.id],
        };
        const old = dist.get(next);
        if (
          !old ||
          candidate.cost < old.cost ||
          (candidate.cost === old.cost &&
            candidate.roads.length < old.roads.length)
        )
          dist.set(next, candidate);
      }
  }
  throw new RuleError("资源点无法连接");
}
function tollSteps(
  s: GameState,
  id: string,
  roads: string[],
  free = false,
): Step[] {
  if (free) return [];
  return [...new Set(roads)]
    .filter((r) => roadCost(s, id, r) > 0)
    .map((r) => task("toll", id, { road: r }));
}
function pruneHarvestRoads(
  s: GameState,
  id: string,
  selected: string[],
  roads: string[],
): string[] {
  if (!selected.length) return [];
  const city = player(s, id).city;
  ensure(city, "城市尚未入场");
  let kept = [...roads];
  for (const road of [...roads].reverse()) {
    const candidate = kept.filter((r) => r !== road);
    const reachable = new Set<string>([city]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const link of s.board.roads.filter((r) =>
        candidate.includes(r.id),
      )) {
        if (!link.nodes.some((n) => reachable.has(n))) continue;
        for (const node of link.nodes)
          if (!reachable.has(node)) {
            reachable.add(node);
            changed = true;
          }
      }
    }
    if (selected.every((node) => reachable.has(node))) kept = candidate;
  }
  return kept;
}
function refill(s: GameState) {
  while (s.market.length < 6 && s.facilityDeck.length)
    s.market.push(s.facilityDeck.shift()!);
}
function cellCoords(cell: string): [number, number] {
  const index = Number(cell);
  return [Math.floor(index / 3), index % 3];
}
function freeCells(p: Player) {
  return Array.from({ length: 12 }, (_, i) => String(i)).filter(
    (i) => !p.built[i],
  );
}
function buildCost(p: Player, cardId: string): Reward {
  const card = FACILITY_BY_ID[cardId];
  const cost = { ...card.cost };
  if (cardId === "industrial") {
    const types = new Set(
      allBuilt(p)
        .filter((b) => FACILITY_BY_ID[b.cardId].color !== "wild")
        .map((b) => FACILITY_BY_ID[b.cardId].color),
    );
    cost.rock = Math.max(0, (cost.rock ?? 0) - types.size);
  }
  return cost;
}
export function patternMatches(p: Player, id: string): string[][] {
  const pattern = PATTERN_BY_ID[id];
  if (!pattern) return [];
  const matches: string[][] = [];
  for (let rotation = 0; rotation < 4; rotation++) {
    const transformed = pattern.shape.map(([r, c, color]) => {
      for (let i = 0; i < rotation; i++) {
        [r, c] = [c, -r];
      }
      return [r, c, color] as [number, number, string];
    });
    for (let row = -3; row <= 3; row++)
      for (let col = -3; col <= 3; col++) {
        const cells: string[] = [];
        let valid = true;
        for (const [r, c, color] of transformed) {
          const found = Object.keys(p.built).find((key) => {
            const [br, bc] = cellCoords(key);
            return br === r + row && bc === c + col;
          });
          if (!found || p.built[found].used) {
            valid = false;
            break;
          }
          const card = FACILITY_BY_ID[p.built[found].cardId];
          if (card.color !== "wild" && !color.split("|").includes(card.color)) {
            valid = false;
            break;
          }
          cells.push(found);
        }
        if (
          valid &&
          !matches.some(
            (m) => [...m].sort().join(",") === [...cells].sort().join(","),
          )
        )
          matches.push(cells);
      }
  }
  return matches;
}
export function createGame(
  players: { id: string; name: string }[],
  config: {
    expansion?: boolean;
    oripathy?: boolean;
    expert?: boolean;
    seed?: number;
  } = {},
): GameState {
  ensure(players.length >= 2 && players.length <= 4, "需要 2–4 位玩家");
  ensure(
    new Set(players.map((p) => p.id)).size === players.length,
    "玩家席位重复",
  );
  const expansion = !!config.expansion || !!config.oripathy;
  const board = boardFor(players.length);
  const s: GameState = {
    rulesVersion: config.oripathy ? ORIPATHY_RULES_VERSION : RULES_VERSION,
    expansion,
    ...(config.oripathy
      ? {
          oripathy: {
            expert: !!config.expert,
            entrepreneurs: ENTREPRENEURS.map((v) => v.id),
            security: [],
            contracts: [],
            awards: ["1184", "1185", "1186", "1187"],
            flows: FLOW_ROLES.map((v) => v.id),
            lock: null,
            gavial: null,
            turn: 0,
            marketUnder: {},
          },
        }
      : {}),
    revision: 0,
    phase: "setup",
    round: 1,
    lap: 1,
    first: 0,
    active: 0,
    mainDone: false,
    mainRemaining: 1,
    extraOnly: false,
    roleBlocked: false,
    roleDualThisTurn: false,
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      seat: i,
      wallet: wallet(),
      city: null,
      ...(config.oripathy
        ? {
            coveredFlows: [],
            oripathy: {
              entrepreneur: null,
              dilemmas: [],
              markers: 0,
              gangSlots: [],
              awards: [],
              blueprint: [],
            },
          }
        : {}),
      hand: [...BASE_ROLES, ...(config.oripathy ? [AMIYA] : [])]
        .filter((r) => expansion || !r.expansion)
        .map((r) => r.id),
      discard: [],
      selected: null,
      revealed: false,
      built: { "7": { cardId: "core", used: false } },
      claims: [],
      enterprise: {},
      lab: 0,
      persistent: [],
      removed: [],
      privateRemoved: [],
      tokenLimit: 29,
      roleUsedThisTurn: false,
    })),
    board,
    sites: Object.fromEntries(
      [...board.nodes, ...board.roads].map((n) => [
        n.id,
        { resource: null, amount: 0, slots: Array(n.slots).fill(null) },
      ]),
    ),
    market: [],
    facilityDeck: [],
    extensions: ["extension-blue", "extension-yellow", "extension-red"],
    eventDecks: {},
    activeEnterprises: [],
    activeLab: null,
    enterpriseDeck: [],
    operativeDeck: [],
    patterns: [],
    randomState: (config.seed ?? 0x12345678) >>> 0 || 1,
    queue: [],
    scheduled: [],
    decision: null,
    log: [],
    firstOverride: null,
    finalScores: [],
    winners: [],
  };
  s.facilityDeck = shuffle(
    s,
    FACILITIES.filter(
      (f) =>
        f.id !== "core" &&
        !f.id.startsWith("extension-") &&
        (s.expansion || !f.expansion) &&
        (s.oripathy || !f.oripathy) &&
        !f.id.startsWith("o-urban-"),
    ).flatMap((f) =>
      Array.from({ length: f.copies }, (_, i) => `${f.id}@${i}`),
    ),
  );
  refill(s);
  for (const tier of ["green", "yellow", "red"])
    s.eventDecks[tier] = shuffle(
      s,
      EVENTS.filter(
        (e) => e.tier === tier && (players.length === 4 || !e.fourOnly),
      ).map((e) => e.id),
    );
  s.patterns = s.expansion
    ? [
        ...shuffle(
          s,
          PATTERNS.filter(
            (p) => p.level === 1 && (s.oripathy || !p.oripathy),
          ).map((p) => p.id),
        ).slice(0, 4),
        ...shuffle(
          s,
          PATTERNS.filter(
            (p) => p.level === 2 && (s.oripathy || !p.oripathy),
          ).map((p) => p.id),
        ).slice(0, 2),
      ]
    : PATTERNS.filter((p) => !p.expansion).map((p) => p.id);
  if (s.expansion) {
    s.enterpriseDeck = shuffle(s, [
      ...VERIFIED_ENTERPRISES,
      ...(s.oripathy ? ["stonehoove", "maylander"] : []),
    ]);
    s.operativeDeck = shuffle(
      s,
      [...OPERATIVES, ...(s.oripathy ? ORIPATHY_OPERATIVES : [])].map(
        (r) => r.id,
      ),
    );
    if (s.oripathy?.expert)
      s.queue.push(
        ...[...s.players]
          .reverse()
          .map((p) => task("o:entrepreneur-draft", p.id)),
      );
    s.queue.push(
      ...s.players.map((p) =>
        task("draft-company", p.id, { count: players.length === 2 ? 2 : 1 }),
      ),
      task("finalize-companies", players[0].id),
    );
  }
  for (const p of s.players) {
    s.queue.push(task("initial-node", p.id));
    if (s.expansion)
      s.queue.push(task("trim-hand", p.id, { count: s.oripathy ? 3 : 2 }));
  }
  if (players.length === 2)
    s.queue.push(task("place", players[1].id, { count: 1 }));
  s.queue.push(task("start-round", players[0].id));
  log(s, null, "企业家们抵达第 105 号拓荒区。");
  advance(s);
  return s;
}

function entrySteps(
  s: GameState,
  id: string,
  cardId: string,
  cell: string,
): Step[] {
  const p = player(s, id);
  const card = FACILITY_BY_ID[cardId];
  if (card.effect === "o-rhodes-office") return [task("o:rhodes-office", id)];
  if (card.effect.startsWith("o-urban-"))
    return [task("o:urban-entry", id, { cardId })];
  switch (card.effect) {
    case "none":
    case "o-settlement":
      return [];
    case "rock7":
      return [gain(id, { rock: 7 })];
    case "ore6":
      return [gain(id, { ore: 6 })];
    case "iron4":
      return [gain(id, { iron: 4 })];
    case "basic5":
      return [task("allocate", id, { count: 5, resources: BASIC })];
    case "place2":
      return [task("place", id, { count: 2 })];
    case "replace-place":
      return [task("replace", id), task("place", id, { count: 1 })];
    case "first-player":
      return [task("override-first", id)];
    case "free-build":
      return [task("build", id, { free: true })];
    case "extend":
      return [task("extend", id)];
    case "adjacent-cash": {
      const [r, c] = cellCoords(cell);
      const n = Object.keys(p.built)
        .filter((k) => k !== cell)
        .filter((k) => {
          const [a, b] = cellCoords(k);
          return (
            Math.abs(a - r) + Math.abs(b - c) === 1 &&
            FACILITY_BY_ID[p.built[k].cardId].color !== "wild"
          );
        }).length;
      return [gain(id, { cash: n * 4 })];
    }
    case "copy-entry":
      return [task("copy-entry", id, { cell })];
    case "trade":
      return [
        task("sell", id, { prices: { rock: 1, ore: 1, iron: 1, prime: 15 } }),
      ];
    case "free-move":
      return [task("city", id, { free: true, placeRoad: true })];
    case "remove-move-explore":
      return [task("garage", id)];
    case "enterprise":
      return [task("trigger", id)];
    default:
      throw new RuleError("设施效果未注册");
  }
}
function roleSteps(
  s: GameState,
  id: string,
  roleId: string,
  mode: string,
): Step[] {
  const strategy = mode === "strategy";
  const p = player(s, id);
  const addition = oripathyRoleSteps(roleId, strategy, id, { task, gain });
  if (addition) return addition;
  switch (roleId) {
    case "liskarm":
      return strategy
        ? [
            task("place", id, { count: 2 }),
            task("schedule", id, {
              at: "cleanup",
              step: task("remove", id, { count: 1, who: "self" }),
            }),
          ]
        : [
            task("conditional", id, {
              cost: { cash: 3 },
              steps: [task("replace", id)],
            }),
          ];
    case "elysium":
      return strategy
        ? [task("least-resource", id)]
        : [
            task("conditional", id, {
              cost: { ore: 3 },
              steps: [task("city", id, { free: true, requiredOwn: true })],
            }),
          ];
    case "texas":
      return strategy
        ? [
            gain(id, { cash: 12 }),
            task("market-remove", id, { count: 1, bottom: true }),
          ]
        : [
            task("conditional", id, {
              cost: { cash: 3 },
              steps: [
                task("remove", id, { count: 1, who: "any" }),
                task("shift", id, { count: 2 }),
              ],
            }),
          ];
    case "cannott":
      return strategy
        ? [
            task("sell", id, {
              prices: { rock: 3, ore: 3, iron: 4, prime: 15 },
            }),
          ]
        : [
            task("forced-sale", id, { all: true, price: 2 }),
            gain(id, { score: 1 }),
          ];
    case "tinman":
      return strategy
        ? [
            gain(id, { score: 1 }),
            task("conditional", id, {
              cost: { cash: 12 },
              steps: [gain(id, { prime: 1 })],
            }),
            task("conditional", id, {
              cost: { cash: 15 },
              steps: [gain(id, { prime: 1 })],
            }),
          ]
        : [task("recall", id)];
    case "mountain":
      return strategy
        ? [task("public-road", id), gain(id, { score: 1 })]
        : [
            task("conditional", id, {
              cost: { cash: 2 },
              steps: [task("upgrade-trigger", id)],
            }),
          ];
    case "mlynar":
      return strategy
        ? [task("upgrade", id, { all: true }), task("trigger", id)]
        : [task("upgrade", id), gain(id, { rock: 1, ore: 1, iron: 1 })];
    case "w":
      return strategy
        ? [
            task("place", id, { count: 3 }),
            task("schedule", id, {
              at: "cleanup",
              step: task("remove", id, { count: 2, who: "self" }),
            }),
          ]
        : [
            task("conditional", id, {
              cost: { cash: 4 },
              steps: [
                task("different-opponents", id, { count: 2 }),
                task("retire-role", id, { role: roleId }),
              ],
            }),
          ];
    case "kaltsit":
      return strategy
        ? [task("upgrade", id, { count: 2 }), gain(id, { score: 1 })]
        : [
            task("trigger-all-company", id),
            task("retire-role", id, { role: roleId }),
          ];
    case "closure":
      return strategy
        ? [gain(id, { rock: 1, ore: 1, iron: 1 }), task("upgrade", id)]
        : [
            task("persistent", id, { role: roleId, markers: 0 }),
            task("market-remove", id, {
              count: 2,
              stash: roleId,
              different: true,
            }),
          ];
    case "dorothy":
      return strategy
        ? [
            task("remove", id, { count: 2, who: "self" }),
            task("place", id, { count: 3 }),
          ]
        : [task("persistent", id, { role: roleId, markers: 4 })];
    case "silverash":
      return strategy
        ? [task("forced-sale", id, { price: 4 }), gain(id, { score: 1 })]
        : [
            ...s.players.map((other) =>
              task("shift", id, { count: 1, owner: other.id }),
            ),
            task("retire-role", id, { role: roleId }),
          ];
    case "mudrock":
      return strategy
        ? [
            task("conditional", id, {
              cost: { rock: 1 },
              steps: [task("place", id, { count: 2 })],
            }),
          ]
        : [task("persistent", id, { role: roleId, markers: 0 })];
    case "passenger":
      return strategy
        ? [task("forced-take", id)]
        : [task("persistent", id, { role: roleId, markers: 5 })];
    case "eunectes":
      return strategy
        ? [
            task("city", id, { free: true }),
            ...s.players
              .filter((other) => other.id !== id)
              .map((other) => task("shift", id, { count: 1, owner: other.id })),
          ]
        : [
            task("market-remove", id, { count: 2, different: true }),
            gain(id, { iron: 3 }),
          ];
    default:
      throw new RuleError("角色效果未注册");
  }
}
function enterpriseSteps(
  s: GameState,
  id: string,
  company: string,
  level: number,
): Step[] {
  const p = player(s, id);
  if (s.oripathy) {
    if (company === "rhodes" && level === 3) return [task("rhodes-recall", id)];
    if (company === "rhodes" && level === 4) return [];
    if (company === "stonehoove")
      return level === 1
        ? [task("remove", id), task("o:security-first", id)]
        : level === 2
          ? [
              task("o:security-place", id, { count: 2 }),
              task("o:security-upgrade", id),
            ]
          : level === 4
            ? [task("o:security-fourth", id)]
            : [];
    if (company === "maylander")
      return level === 1
        ? [
            gain(id, { cash: 4 }),
            task("allocate", id, { count: 2, resources: BASIC }),
          ]
        : level === 2
          ? [task("explore", id), task("remove", id, { who: "self" })]
          : level === 3
            ? [
                task("conditional", id, {
                  cost: { iron: 4 },
                  steps: [gain(id, { score: 2 })],
                }),
              ]
            : level === 4
              ? [task("o:award-select", id)]
              : [];
  }
  if (company === "rhodes") {
    if (level === 1) return [task("upgrade", id, { exclude: company })];
    if (level === 2)
      return [
        task("place", id, {
          count: 1,
          targets: s.board.roads.map((r) => r.id),
        }),
        task("rhodes-road-income", id),
      ];
    if (level === 4) return [task("rhodes-recall", id)];
  }
  if (company === "heide") {
    if (level === 1) return [gain(id, { rock: 4 })];
    if (level === 2)
      return [
        task("conditional", id, {
          cost: { rock: 2 },
          steps: [gain(id, { cash: 15 })],
        }),
      ];
    if (level === 4)
      return [
        task("conditional", id, {
          cost: { rock: 6 },
          steps: [
            task("refresh-market", id),
            task("build", id, { free: true, marketOnly: true }),
          ],
        }),
      ];
  }
  if (company === "rhine") return [task("switch-lab", id)];
  if (company === "bank") {
    if (level === 1) return [gain(id, { cash: 8 })];
    if (level === 3)
      return [
        gain(id, { cash: 20 }),
        ...s.players
          .filter((v) => v.id !== id)
          .map((v) => gain(v.id, { cash: 4 })),
      ];
    if (level === 4)
      return [
        gain(id, { score: 1 }),
        task("opponent-loss", id, { reward: { score: 1 } }),
      ];
  }
  if (company === "raythean") {
    if (level === 1) return [gain(id, { ore: 3 })];
    if (level === 3)
      return [
        task("conditional", id, {
          cost: { ore: 2 },
          steps: [task("build", id)],
        }),
      ];
    if (level === 5)
      return [
        task("build", id, { source: "deck" }),
        task("shuffle-facilities", id),
      ];
  }
  if (company === "mama") {
    if (level === 2)
      return [
        task("conditional", id, {
          cost: { score: 1 },
          steps: [gain(id, { cash: 20 })],
        }),
      ];
    if (level === 3) return [gain(id, { score: 1 })];
    if (level === 4)
      return [
        task("conditional", id, {
          cost: { cash: 25 },
          steps: [gain(id, { score: 3 })],
        }),
      ];
  }
  if (company === "blacksteel") {
    if (level === 1) return [task("blacksteel-action", id, { count: 1 })];
    if (level === 2) return [task("shift", id, { count: 2 })];
    if (level === 4) return [task("blacksteel-action", id, { count: 2 })];
  }
  if (company === "rim") {
    if (level === 1) return [gain(id, { rock: 1, ore: 1, iron: 1 })];
    if (level === 2)
      return [
        task("conditional", id, {
          cost: { cash: 4 },
          steps: [task("replace", id, { resourceOnly: true })],
        }),
      ];
    if (level === 4)
      return [
        task("conditional", id, {
          cost: { score: 1 },
          steps: [task("harvest", id)],
        }),
      ];
  }
  return [];
}
function unlocked(company: string, level: number, oripathy = false): boolean {
  if (oripathy && company === "rhodes") return [1, 2, 3].includes(level);
  if (oripathy && company === "stonehoove") return [1, 2, 4].includes(level);
  if (oripathy && company === "maylander") return [1, 2, 3, 4].includes(level);
  return (
    (
      {
        rhodes: [1, 2, 4],
        heide: [1, 2, 4],
        rhine: [1],
        bank: [1, 3, 4],
        raythean: [1, 3, 5],
        mama: [2, 3, 4],
        blacksteel: [1, 2, 4],
        rim: [1, 2, 4],
      } as Record<string, number[]>
    )[company]?.includes(level) ?? false
  );
}
function originalLabSteps(
  id: string,
  name: string,
  reward: OriginalLabReward,
): Step[] {
  const effects: Step[] = [];
  if (reward.gain) effects.push(gain(id, reward.gain));
  if (reward.effect === "build")
    effects.push(
      task("build", id, {
        free: reward.free,
        maximumCashPrice: reward.maximumCashPrice,
        marketOnly: reward.free === true,
      }),
    );
  else if (reward.effect === "choose-place-or-remove")
    effects.push(
      task("blacksteel-action", id, {
        count: reward.count,
        sourceName: `莱茵生命 · ${name}`,
      }),
    );
  else if (reward.chooseOne) effects.push(task("rhine-defense-choice", id));
  else if (reward.effect === "downgrade-and-reward")
    effects.push(task("rhine-structural-downgrade", id));
  else ensure(!reward.effect, "科室效果尚无对应处理器");
  return effects;
}
function upgradeReward(
  s: GameState,
  id: string,
  company: string,
  level: number,
): Step[] {
  if (s.oripathy && company === "rhodes")
    return level === 4
      ? [task("operative-draw", id, { select: true })]
      : level === 5
        ? [gain(id, { score: 2 })]
        : [];
  if (s.oripathy && company === "stonehoove")
    return level === 3
      ? [gain(id, { score: 1 })]
      : level === 5
        ? [
            gain(id, { prime: 1 }),
            task("o:security-place", id),
            task("o:security-contract", id),
          ]
        : [];
  if (s.oripathy && company === "maylander")
    return level === 5 ? [gain(id, { score: 2 })] : [];
  if (company === "rhodes" && [3, 5].includes(level))
    return [task("operative-draw", id)];
  if (company === "rhine")
    return [task("rhine-reward", id, { lab: s.activeLab, level })];
  const scores: Record<string, Record<number, number>> = {
    rhodes: {},
    heide: { 3: 1, 5: 2 },
    bank: { 5: 3 },
    raythean: { 2: 1, 4: 1 },
    mama: { 5: 3 },
    blacksteel: { 3: 1, 5: 1 },
    rim: { 3: 1, 5: 2 },
  };
  return scores[company]?.[level]
    ? [gain(id, { score: scores[company][level] })]
    : [];
}

function buildOptions(
  s: GameState,
  id: string,
  data: Record<string, any>,
): Option[] {
  const p = player(s, id);
  const cards =
    data.source === "deck"
      ? s.facilityDeck
      : data.source === "blueprint"
        ? (p.oripathy?.blueprint ?? [])
        : s.market;
  const stash = data.marketOnly ? [] : p.persistent.flatMap((v) => v.stash);
  const pool = [
    ...cards,
    ...(data.source === "deck" || data.source === "blueprint" ? [] : stash),
    ...(!data.marketOnly && !data.source ? (p.oripathy?.blueprint ?? []) : []),
  ];
  const options: Option[] = [];
  for (const instance of [...new Set(pool)]) {
    const cardId = instance.split("@")[0];
    const card = FACILITY_BY_ID[cardId];
    if (!card || card.id === "core" || card.id.startsWith("extension-"))
      continue;
    if (
      typeof data.maximumCashPrice === "number" &&
      card.cashCost > data.maximumCashPrice
    )
      continue;
    if (
      card.unique &&
      allBuilt(p).some((b) => FACILITY_BY_ID[b.cardId].name === card.name)
    )
      continue;
    if (data.nonWild && card.color === "wild") continue;
    const stackable =
      p.oripathy?.entrepreneur === "martin" &&
      !data.nonWild &&
      occupied(s, "self", id).length
        ? Object.keys(p.built).filter(
            (cell) => card.points > FACILITY_BY_ID[p.built[cell].cardId].points,
          )
        : [];
    for (const cell of [...freeCells(p), ...stackable])
      for (const mode of data.free ? ["free"] : ["resources", "cash"]) {
        const cost: Reward =
          mode === "free"
            ? {}
            : mode === "cash"
              ? { cash: card.cashCost }
              : buildCost(p, cardId);
        const discount =
          s.players.some(
            (v) =>
              v.id !== id &&
              v.oripathy?.entrepreneur === "martin" &&
              hasDilemma(v, 5),
          ) && mode === "resources";
        const discounted = discount ? discountCosts(p, cost, canPay) : [];
        if (!canPay(p, cost) && !discounted.length) continue;
        const construct = task("construct", id, {
          instance,
          cell,
          source: p.oripathy?.blueprint.includes(instance)
            ? "blueprint"
            : (data.source ?? "market"),
          stack: !!p.built[cell],
          mortgage: !!data.mortgage,
        });
        const finish = p.built[cell]
          ? [task("o:stack-payment", id, { construct })]
          : [construct];
        options.push(
          option(
            `${instance}:${cell}:${mode}`,
            `${card.name} → 城市 ${Number(cell) + 1} · ${moneyText(cost)}${p.built[cell] ? "（叠建另移除自己的一个影响力）" : ""}`,
            [
              ...(discount
                ? [task("o:build-payment", id, { cost, steps: finish })]
                : [pay(id, cost), ...finish]),
            ],
            undefined,
            card.image,
          ),
        );
      }
  }
  return options;
}
function cityOptions(
  s: GameState,
  id: string,
  data: Record<string, any>,
): Option[] {
  const p = player(s, id);
  if (!p.city) return [];
  if (!data.free && !canPay(p, { ore: 3 })) return [];
  return roadsFor(s, p.city).flatMap((r) =>
    r.nodes
      .filter(
        (n) =>
          n !== p.city &&
          nodeOpen(s, n) &&
          !s.players.some((v) => v.id !== id && v.city === n) &&
          !s.players.some(
            (v) =>
              v.id !== id &&
              v.oripathy?.entrepreneur === "paul" &&
              hasDilemma(v, 5, "B") &&
              v.oripathy.gangSlots.some((slot) => slot.startsWith(`${n}:`)) &&
              s.sites[n].slots.some(
                (owner, index) =>
                  owner === v.id &&
                  !v.oripathy!.gangSlots.includes(`${n}:${index}`),
              ),
          ) &&
          (!data.requiredOwn || s.sites[n].slots.includes(id)),
      )
      .map((n) =>
        option(
          `${r.id}:${n}`,
          `${n} · ${data.free ? "免费" : "3 源石"}`,
          [
            ...(data.free ? [] : [pay(id, { ore: 3 })]),
            task("relocate", id, {
              to: n,
              road: r.id,
              placeRoad: !!data.placeRoad,
            }),
          ],
          n,
        ),
      ),
  );
}
function exploreOptions(s: GameState, id: string): Option[] {
  const p = player(s, id);
  return s.board.nodes
    .filter((n) => !s.sites[n.id].resource && nodeOpen(s, n.id))
    .flatMap((n) => {
      const route = routeTo(s, id, n.id);
      return route.cost <= p.wallet.cash
        ? [
            option(
              n.id,
              `${n.id} · 路费 ${route.cost} 金券`,
              [
                ...tollSteps(s, id, route.roads),
                task("discover", id, { node: n.id, place: true }),
              ],
              n.id,
            ),
          ]
        : [];
    });
}

function playerOrder(s: GameState) {
  return s.players.map(
    (_, i) => s.players[(s.first + i) % s.players.length].id,
  );
}

/** Drain only this seat's planning steps. Payments and rewards wait at the barrier. */
function advanceParallelChoice(s: GameState, id: string) {
  const phase = s.parallel!;
  const entry = phase.players[id];
  const continuation = s.queue;
  s.queue = entry.queue;
  s.decision = entry.decision;
  let iterations = 0;
  while (!s.decision && s.queue.length) {
    ensure(++iterations < 10000, "选择步骤超过上限");
    const step = s.queue.shift()!;
    if (phase.kind === "harvest" && ["pay", "gain"].includes(step.kind)) {
      entry.effects.push(step);
      continue;
    }
    ensure(
      (phase.kind === "harvest"
        ? ["harvest", "toll"]
        : ["select-role", "select-role-at", "o:cover-flow", "o:cover-flow-at"]
      ).includes(step.kind),
      "并行阶段出现了不适用的效果",
    );
    execute(s, step);
  }
  entry.queue = s.queue;
  entry.decision = s.decision;
  if (entry.decision) entry.decision.private = true;
  entry.ready = !entry.decision && !entry.queue.length;
  s.queue = continuation;
  s.decision = null;
  if (entry.ready && phase.kind === "harvest")
    log(s, id, "已确认采集与路费方案");
}

function syncParallel(s: GameState) {
  const phase = s.parallel!;
  // Keep a representative decision for saved-game tooling and serial simulations.
  // Player views and commands always use the requesting seat's own decision.
  s.decision =
    phase.order.map((id) => phase.players[id].decision).find(Boolean) ?? null;
  if (phase.order.some((id) => !phase.players[id].ready)) return;
  s.parallel = null;
  s.decision = null;
  if (phase.kind === "harvest") {
    log(s, null, "所有玩家已确认采集方案，按大总统起始顺序结算路费与资源");
    prepend(
      s,
      phase.order.flatMap((id) => phase.players[id].effects),
    );
  }
}

function beginParallel(
  s: GameState,
  kind: ParallelPhase["kind"],
  steps = playerOrder(s).map((id) => task(kind, id)),
  current?: Decision,
) {
  const order = playerOrder(s);
  s.parallel = {
    id: `${s.round}:${kind}:${s.revision}`,
    kind,
    order,
    players: Object.fromEntries(
      order.map((id) => [
        id,
        {
          revision: 0,
          ready:
            !steps.some((step) => step.actor === id) &&
            current?.playerId !== id,
          decision: current?.playerId === id ? current : null,
          queue: steps.filter((step) => step.actor === id),
          effects: [],
        },
      ]),
    ),
  };
  for (const id of order)
    if (!s.parallel.players[id].ready) advanceParallelChoice(s, id);
  syncParallel(s);
}

/** Upgrade pending legacy rounds without changing already paid fees or placed cards. */
function withParallelPhase(original: GameState): GameState {
  if (original.parallel || !original.decision) return original;
  const kind =
    original.phase === "select"
      ? "select-role"
      : original.phase === "harvest"
        ? "harvest"
        : null;
  if (!kind || original.decision.kind !== kind) return original;
  let count = 0;
  while (original.queue[count]?.kind === kind) count++;
  // An ability's individual harvest remains an individual action.
  if (
    original.queue[count]?.kind !==
    (kind === "harvest" ? "cleanup" : "begin-actions")
  )
    return original;
  const s = structuredClone(original);
  const current = s.decision!;
  const remaining = s.queue.splice(0, count);
  beginParallel(s, kind, remaining, current);
  return s;
}

export function getParallelChoiceToken(
  original: GameState,
  id: string,
): string | null {
  const phase = withParallelPhase(original).parallel;
  const entry = phase?.players[id];
  return phase && entry?.decision && !entry.ready
    ? `${phase.id}:${id}:${entry.revision}`
    : null;
}

function advance(s: GameState) {
  let iterations = 0;
  while (!s.parallel && !s.decision && s.queue.length) {
    ensure(++iterations < 10000, "效果链超过上限");
    const current = s.queue.shift()!;
    execute(s, current);
  }
}
function execute(s: GameState, step: Step) {
  const id = step.actor;
  const p = player(s, id);
  const d = step.data ?? ({} as Record<string, any>);
  const data = d as Record<string, any>;
  const count = Number(data.count ?? 1);
  if (step.kind.startsWith("o:")) {
    executeOripathy(s, step, {
      task,
      gain,
      pay,
      option,
      player,
      decide,
      prepend,
      log,
      random,
      stock,
      emptySlots,
      occupied,
      unlocked: (company, level) => unlocked(company, level, !!s.oripathy),
      enterpriseSteps,
      mainOptions,
      buildOptions,
      roleSteps,
      canPay,
      entrySteps,
      freeCells,
      removeInfluence,
      cityOptions,
    });
    return;
  }
  switch (step.kind) {
    case "gain": {
      const reward = data.reward as Reward;
      for (const r of RESOURCES) p.wallet[r] += reward[r] ?? 0;
      log(s, id, `获得 ${moneyText(reward)}`);
      return;
    }
    case "pay": {
      const cost = data.cost as Reward;
      ensure(canPay(p, cost), "资源不足");
      const options = paymentOptions(p, cost);
      if (options.length > 1 || options[0]?.markers) {
        decide(
          s,
          id,
          "选择资源支付方式",
          options.map((o) =>
            option(
              o.id,
              `${moneyText(o.cost)}${o.markers ? ` + ${o.markers} 个异客标记` : ""}`,
              [
                task("spend-markers", id, { count: o.markers }),
                task("pay-plain", id, { cost: o.cost }),
              ],
            ),
          ),
          "payment",
        );
        return;
      }
      prepend(s, [task("pay-plain", id, { cost })]);
      return;
    }
    case "pay-plain": {
      const cost = data.cost as Reward;
      ensure(
        RESOURCES.every((r) => r === "score" || p.wallet[r] >= (cost[r] ?? 0)),
        "资源不足",
      );
      for (const r of RESOURCES) p.wallet[r] -= cost[r] ?? 0;
      if (Object.values(cost).some(Boolean))
        log(s, id, `支付 ${moneyText(cost)}`);
      return;
    }
    case "spend-markers": {
      if (count === 0) return;
      const effect = p.persistent.find((v) => v.roleId === "passenger");
      ensure(
        effect && effect.markers >= count && count <= 2,
        "异客标记数量不足",
      );
      effect.markers -= count;
      if (effect.markers === 0) {
        p.persistent = p.persistent.filter((v) => v !== effect);
        p.discard.push("passenger");
      }
      return;
    }
    case "conditional":
      decide(
        s,
        id,
        `可选：支付 ${moneyText(data.cost)}`,
        canPay(p, data.cost)
          ? [
              option("yes", "执行", [pay(id, data.cost), ...data.steps]),
              option("no", "跳过", []),
            ]
          : [option("no", "资源不足，跳过", [])],
        "optional",
      );
      return;
    case "schedule":
      s.scheduled.push({ at: data.at, step: data.step });
      return;
    case "draft-company": {
      const pool: string[] =
        data.pool ?? s.enterpriseDeck.splice(0, s.players.length === 2 ? 4 : 2);
      decide(
        s,
        id,
        "选择初始合作企业",
        pool.map((c) =>
          option(
            c,
            ENTERPRISE_NAMES[c],
            [
              task("add-company", id, { company: c }),
              ...(count > 1
                ? [
                    task("draft-company", id, {
                      pool: pool.filter((v) => v !== c),
                      count: count - 1,
                    }),
                  ]
                : []),
            ],
            undefined,
            s.oripathy
              ? (oripathyEnterpriseImage(c) ?? ENTERPRISE_IMAGES[c])
              : ENTERPRISE_IMAGES[c],
          ),
        ),
        "company-draft",
        true,
      );
      return;
    }
    case "add-company":
      s.activeEnterprises.push(data.company);
      p.enterprise[data.company] = 1;
      return;
    case "finalize-companies": {
      if (s.players.length === 3)
        s.activeEnterprises.push(s.enterpriseDeck.shift()!);
      for (const v of s.players)
        for (const company of s.activeEnterprises) v.enterprise[company] ??= 0;
      if (s.activeEnterprises.includes("rhine")) {
        ensure(COMPLETE_RHINE_RULES, "莱茵生命三张原版科室须核验后接入规则包");
        if (!s.players.some((v) => v.enterprise.rhine > 0))
          s.activeLab = Math.floor(random(s) * RHINE_DEPARTMENTS.length);
      }
      for (const v of s.players)
        for (const [company, level] of Object.entries(v.enterprise))
          if (level) {
            if (company === "rhine")
              prepend(s, [task("switch-lab", v.id, { initial: true })]);
            else prepend(s, upgradeReward(s, v.id, company, level));
          }
      return;
    }
    case "initial-node":
      decide(
        s,
        id,
        "选择城市起始资源点",
        s.board.nodes
          .filter(
            (n) =>
              n.tier === "green" &&
              !s.players.some((v) => v.city === n.id) &&
              (s.players.length !== 2 || n.id !== "B-01"),
          )
          .map((n) =>
            option(
              n.id,
              n.id,
              [task("initial-enter", id, { node: n.id })],
              n.id,
            ),
          ),
        "initial-node",
      );
      return;
    case "initial-enter":
      p.city = data.node;
      if (data.node === "B-01")
        prepend(s, [gain(id, { rock: 2, ore: 2, iron: 2 })]);
      prepend(s, [task("discover", id, { node: data.node })]);
      return;
    case "trim-hand":
      decide(
        s,
        id,
        `选择放回游戏盒的角色（剩 ${count} 张）`,
        p.hand.map((role) =>
          option(
            role,
            ROLE_BY_ID[role].name,
            [
              task("retire-hand", id, { role, private: true }),
              ...(count > 1
                ? [task("trim-hand", id, { count: count - 1 })]
                : []),
            ],
            undefined,
            ROLE_BY_ID[role].image,
          ),
        ),
        "trim",
        true,
      );
      return;
    case "retire-hand":
      p.hand = p.hand.filter((r) => r !== data.role);
      p.removed.push(data.role);
      if (data.private) p.privateRemoved.push(data.role);
      return;
    case "discover": {
      const n = s.board.nodes.find((n) => n.id === data.node);
      ensure(n, "资源点不存在");
      ensure(!s.sites[n.id].resource, "资源点已经探索");
      const eventId = s.eventDecks[n.tier].shift();
      ensure(eventId, "事件牌堆数量不匹配");
      const event = EVENT_BY_ID[eventId];
      s.sites[n.id].resource = event.resource;
      s.sites[n.id].amount = event.amount;
      log(s, id, `探索 ${n.id}：${event.name}`);
      let options = event.options;
      if (s.expansion && eventId === "yellow-1")
        options = [
          ...options,
          {
            label: "支付 1 异铁，提升一家企业",
            cost: { iron: 1 },
            effect: "upgrade",
          },
        ];
      if (s.expansion && eventId === "red-2")
        options = [
          {
            label: "失去 1 分，提升同一家企业两级",
            cost: { score: 1 },
            effect: "upgrade2",
          },
          ...options,
        ];
      decide(
        s,
        id,
        `${event.name} · 选择事件结果`,
        options
          .filter((o) => canPay(p, o.cost ?? {}))
          .map((o, i) =>
            option(
              String(i),
              o.label,
              [
                ...(o.cost ? [pay(id, o.cost)] : []),
                ...(o.gain ? [gain(id, o.gain)] : []),
                ...(o.others
                  ? s.players
                      .filter((v) => v.id !== id)
                      .map((v) => gain(v.id, o.others!))
                  : []),
                ...(o.effect
                  ? [
                      task(
                        o.effect === "local-place"
                          ? "place"
                          : o.effect === "upgrade2"
                            ? "upgrade"
                            : o.effect,
                        id,
                        o.effect === "local-place"
                          ? {
                              targets: [
                                n.id,
                                ...roadsFor(s, n.id).map((r) => r.id),
                              ],
                              count: 1,
                            }
                          : o.effect === "upgrade2"
                            ? { count: 2 }
                            : {},
                      ),
                    ]
                  : []),
              ],
              n.id,
              s.expansion && eventId === "yellow-1"
                ? "/assets/cards-167/11.webp"
                : s.expansion && eventId === "red-2"
                  ? "/assets/cards-156/6.webp"
                  : event.image,
            ),
          ),
        "event",
      );
      if (data.place)
        s.queue.unshift(task("place", id, { count: 1, targets: [n.id] }));
      return;
    }
    case "toll": {
      const owners = [
        ...new Set(
          s.sites[data.road].slots.filter((v): v is string => !!v && v !== id),
        ),
      ];
      if (!roadCost(s, id, data.road)) return;
      if (!owners.length) {
        prepend(s, [pay(id, { cash: 2 })]);
        return;
      }
      decide(
        s,
        id,
        `${data.road} · 选择收取路费的玩家`,
        [
          ...owners.map((owner) =>
            option(owner, player(s, owner).name, [
              pay(id, { cash: 2 }),
              gain(owner, { cash: 2 }),
            ]),
          ),
          ...(s.oripathy?.security.some((slot) =>
            slot.startsWith(`${data.road}:`),
          )
            ? [option("bank", "银行 · 岩蹄安保", [pay(id, { cash: 2 })])]
            : []),
        ],
        "toll",
      );
      if (s.decision)
        s.decision.map = { roads: [data.road], selected: [], free: false };
      return;
    }
    case "place": {
      if (count <= 0) return;
      const targets = emptySlots(s, id, data.targets);
      decide(
        s,
        id,
        `放置影响力 · 剩 ${count} 次`,
        targets.map((slot) =>
          option(
            slot,
            slot.replace(":", " · 格 "),
            [
              task("place-at", id, { slot }),
              ...(count > 1
                ? [task("place", id, { ...data, count: count - 1 })]
                : []),
            ],
            slotParts(slot)[0],
          ),
        ),
        "place",
      );
      return;
    }
    case "place-at": {
      if (p.oripathy?.entrepreneur === "paul" && !data.markerChoice) {
        prepend(s, [task("o:paul-marker", id, data)]);
        return;
      }
      const [site, index] = slotParts(data.slot);
      ensure(
        emptySlots(s, id, undefined, { normal: !!data.normal }).includes(
          data.slot,
        ),
        "该位置无法放置影响力",
      );
      if (data.gang) {
        ensure(
          p.oripathy?.entrepreneur === "paul" &&
            p.oripathy.gangSlots.length < 4,
          "帮派标记不足",
        );
        p.oripathy.gangSlots.push(data.slot);
      } else ensure(stock(s, id) > 0, "普通玩家标记不足");
      s.sites[site].slots[index] = id;
      log(s, id, `在 ${site} 放置影响力`);
      return;
    }
    case "remove": {
      if (count <= 0) return;
      const targets = occupied(s, data.who ?? "any", id, data.targets);
      decide(
        s,
        id,
        `移除影响力 · 剩 ${count} 次`,
        targets.map((slot) =>
          option(
            slot,
            `${s.sites[slotParts(slot)[0]].slots[slotParts(slot)[1]] ? player(s, s.sites[slotParts(slot)[0]].slots[slotParts(slot)[1]]!).name : "岩蹄安保"} · ${slot}`,
            [
              task("remove-at", id, { slot }),
              ...(count > 1
                ? [task("remove", id, { ...data, count: count - 1 })]
                : []),
            ],
            slotParts(slot)[0],
          ),
        ),
        "remove",
      );
      return;
    }
    case "remove-at": {
      const [site, index] = slotParts(data.slot);
      ensure(
        s.sites[site].slots[index] || s.oripathy?.security.includes(data.slot),
        "影响力不存在",
      );
      prepend(s, removeInfluence(s, site, index));
      log(s, id, `移除 ${site} 的影响力`);
      return;
    }
    case "capture-marker": {
      const effect = p.persistent.find((v) => v.roleId === "dorothy");
      if (!effect || effect.markers >= 4) return;
      decide(
        s,
        id,
        "多萝西：是否将被移除的影响力存入角色牌",
        [
          option("yes", "存入一个标记", [task("capture-marker-at", id)]),
          option("no", "放回供应堆", []),
        ],
        "capture",
      );
      return;
    }
    case "capture-marker-at": {
      const effect = p.persistent.find((v) => v.roleId === "dorothy");
      if (effect && effect.markers < 4) effect.markers++;
      return;
    }
    case "dorothy-cleanup": {
      const effect = p.persistent.find((v) => v.roleId === "dorothy");
      if (!effect || effect.markers < 2) return;
      decide(
        s,
        id,
        "多萝西：支付两个标记，放置一次影响力",
        [
          option("yes", "执行", [
            task("dorothy-spend", id),
            task("place", id, { count: 1 }),
          ]),
          option("no", "保留标记", []),
        ],
        "dorothy-cleanup",
      );
      return;
    }
    case "dorothy-spend": {
      const effect = p.persistent.find((v) => v.roleId === "dorothy");
      ensure(effect && effect.markers >= 2, "多萝西标记不足");
      effect.markers -= 2;
      return;
    }
    case "shift": {
      if (count <= 0) return;
      const owner = data.owner ?? id;
      const possible = occupied(s, owner, id).filter(
        (slot) => emptySlotsForMoving(s, owner, slot).length,
      );
      decide(
        s,
        id,
        `移动影响力 · 剩 ${count} 次`,
        possible.map((slot) =>
          option(
            slot,
            `起点 ${slot}`,
            [task("shift-target", id, { ...data, owner, slot, count })],
            slotParts(slot)[0],
          ),
        ),
        "shift-from",
      );
      return;
    }
    case "shift-target": {
      const owner = data.owner ?? id;
      const slots = emptySlotsForMoving(s, owner, data.slot);
      decide(
        s,
        id,
        "选择影响力目标位置",
        slots.map((slot) =>
          option(
            slot,
            slot,
            [
              task("shift-at", id, { from: data.slot, to: slot, owner }),
              ...(count > 1
                ? [task("shift", id, { ...data, count: count - 1 })]
                : []),
            ],
            slotParts(slot)[0],
          ),
        ),
        "shift-to",
      );
      return;
    }
    case "shift-at": {
      const [a, ai] = slotParts(data.from);
      const [b, bi] = slotParts(data.to);
      ensure(s.sites[a].slots[ai] === data.owner, "源位置不属于指定玩家");
      ensure(
        emptySlotsForMoving(s, data.owner, data.from).includes(data.to),
        "目标位置无法放置",
      );
      s.sites[a].slots[ai] = null;
      s.sites[b].slots[bi] = data.owner;
      const moved = player(s, data.owner).oripathy;
      if (moved?.gangSlots.includes(data.from))
        moved.gangSlots = moved.gangSlots.map((slot) =>
          slot === data.from ? data.to : slot,
        );
      log(s, id, `将影响力从 ${a} 移动至 ${b}`);
      return;
    }
    case "replace": {
      const slots = occupied(
        s,
        "any",
        id,
        data.resourceOnly ? s.board.nodes.map((n) => n.id) : undefined,
      );
      decide(
        s,
        id,
        "选择要替换的影响力",
        slots.map((slot) =>
          option(
            slot,
            slot,
            [
              task("remove-at", id, { slot }),
              task("place-exact", id, { slot }),
            ],
            slotParts(slot)[0],
          ),
        ),
        "replace",
      );
      return;
    }
    case "place-exact":
      if (emptySlots(s, id).includes(data.slot))
        prepend(s, [task("place-at", id, data)]);
      return;
    case "explore":
      decide(s, id, "选择探索目标", exploreOptions(s, id), "explore");
      return;
    case "city":
      decide(s, id, "选择城市移动目标", cityOptions(s, id, data), "city");
      return;
    case "relocate": {
      const from = p.city;
      ensure(from, "城市尚未入场");
      p.city = data.to;
      if (s.oripathy?.lock?.owner === id)
        s.oripathy.lock.region = s.board.nodes.find(
          (n) => n.id === data.to,
        )!.region;
      const next: Step[] = [];
      const displaced =
        s.sites[data.to].slots.some((owner) => owner && owner !== id) ||
        !!s.oripathy?.security.some((slot) => slot.startsWith(`${data.to}:`));
      for (const siteId of [data.road, data.to].filter(Boolean))
        s.sites[siteId].slots.forEach((owner, index) => {
          if (
            (owner && owner !== id) ||
            s.oripathy?.security.includes(`${siteId}:${index}`)
          )
            next.push(...removeInfluence(s, siteId, index));
        });
      log(s, id, `城市从 ${from} 移动到 ${data.to}`);
      if (!s.sites[data.to].resource)
        next.push(task("discover", id, { node: data.to }));
      next.push(
        task("place", id, {
          count: 1,
          targets: data.placeRoad ? [data.road] : [from, data.to],
        }),
      );
      if (data.gavial && displaced) next.push(task("place", id));
      if (p.oripathy?.entrepreneur === "agnes" && hasDilemma(p, 5, "A"))
        next.push(gain(id, { ore: 2 }), task("shift", id));
      prepend(s, next);
      return;
    }
    case "build":
      decide(
        s,
        id,
        "选择设施、城市位置与支付方式",
        buildOptions(s, id, data),
        "build",
        data.source === "deck",
      );
      return;
    case "construct": {
      const cardId = data.instance.split("@")[0];
      const card = FACILITY_BY_ID[cardId];
      const previous = p.built[data.cell];
      ensure(!previous || data.stack, "城市位置已被占用");
      ensure(previous || freeCells(p).includes(data.cell), "城市位置不存在");
      if (previous)
        ensure(
          p.oripathy?.entrepreneur === "martin" &&
            card.points > FACILITY_BY_ID[previous.cardId].points,
          "马丁叠建需要分数严格更高的新设施",
        );
      let pool =
        data.source === "deck"
          ? s.facilityDeck
          : data.source === "blueprint"
            ? p.oripathy!.blueprint
            : s.market;
      let pos = pool.indexOf(data.instance);
      if (pos < 0) {
        const persistent = p.persistent.find((v) =>
          v.stash.includes(data.instance),
        );
        ensure(persistent, "设施不在可建造的供应中");
        pool = persistent.stash;
        pos = pool.indexOf(data.instance);
      }
      if (pool === s.market) takeMarket(s, data.instance);
      else pool.splice(pos, 1);
      const completedStash = p.persistent.find(
        (v) => v.roleId === "closure" && v.stash === pool && !v.stash.length,
      );
      if (completedStash) {
        p.persistent = p.persistent.filter((v) => v !== completedStash);
        p.discard.push("closure");
      }
      p.built[data.cell] = {
        cardId,
        used: false,
        ...(previous
          ? {
              layers: [
                { ...previous, layers: undefined },
                ...(previous.layers ?? []),
              ],
            }
          : {}),
      };
      if (data.mortgage) {
        p.persistent.push({
          roleId: "o-jessica",
          markers: 0,
          stash: [],
          cell: data.cell,
          mortgageCardId: cardId,
        });
        if (p.selected === "o-jessica") p.selected = null;
      }
      p.wallet.score += card.points;
      refill(s);
      log(s, id, `建设 ${card.name}，获得 ${card.points} 分`);
      prepend(s, [
        ...entrySteps(s, id, cardId, data.cell),
        ...(p.oripathy?.entrepreneur === "martin" &&
        card.name.includes("城市化区域")
          ? [task("o:share-urban", id, { cardId, cell: data.cell })]
          : []),
      ]);
      return;
    }
    case "override-first":
      s.firstOverride = p.seat;
      log(s, id, "本回合获得起始玩家标记");
      return;
    case "extend": {
      if (!s.extensions.length || !freeCells(p).length) return;
      decide(
        s,
        id,
        "物流枢纽：是否建设延伸枢纽",
        [
          ...s.extensions.flatMap((cardId) =>
            freeCells(p).map((cell) =>
              option(
                `${cardId}:${cell}`,
                `${FACILITY_BY_ID[cardId].color === "blue" ? "蓝" : FACILITY_BY_ID[cardId].color === "yellow" ? "黄" : "红"}色延伸枢纽 → 城市 ${Number(cell) + 1}`,
                [task("construct-extension", id, { cardId, cell })],
                undefined,
                FACILITY_BY_ID[cardId].image,
              ),
            ),
          ),
          option("no", "跳过", []),
        ],
        "extend",
      );
      return;
    }
    case "construct-extension": {
      ensure(
        s.extensions.includes(data.cardId) && freeCells(p).includes(data.cell),
        "延伸枢纽或城市位置不可用",
      );
      p.built[data.cell] = { cardId: data.cardId, used: false };
      p.wallet.score -= 1;
      s.extensions = s.extensions.filter((v) => v !== data.cardId);
      log(s, id, `建设延伸枢纽，失去 1 分`);
      return;
    }
    case "copy-entry": {
      const [r, c] = cellCoords(data.cell);
      const cells = Object.keys(p.built).filter((k) => {
        const [a, b] = cellCoords(k);
        return (
          Math.abs(a - r) + Math.abs(b - c) === 1 &&
          FACILITY_BY_ID[p.built[k].cardId].color !== "wild"
        );
      });
      decide(
        s,
        id,
        "选择十字相邻设施，结算其入场效果",
        cells.map((k) =>
          option(
            k,
            FACILITY_BY_ID[p.built[k].cardId].name,
            entrySteps(s, id, p.built[k].cardId, k),
          ),
        ),
        "copy",
      );
      return;
    }
    case "garage":
      decide(
        s,
        id,
        "载具仓库：选择入场效果",
        [
          option("influence", "移除一个影响力并移动一次", [
            task("remove", id, { count: 1, who: "any" }),
            task("shift", id, { count: 1 }),
          ]),
          ...(exploreOptions(s, id).length
            ? [option("explore", "执行一次探索", [task("explore", id)])]
            : []),
        ],
        "garage",
      );
      return;
    case "market-remove": {
      const available = s.market.filter(
        (v) => !data.excluded?.includes(FACILITY_BY_ID[v.split("@")[0]].name),
      );
      decide(
        s,
        id,
        "选择市场设施",
        available.map((instance) =>
          option(
            instance,
            FACILITY_BY_ID[instance.split("@")[0]].name,
            [
              task("market-remove-at", id, { instance, ...data }),
              ...(count > 1
                ? [
                    task("market-remove", id, {
                      ...data,
                      count: count - 1,
                      excluded: data.different
                        ? [
                            ...(data.excluded ?? []),
                            FACILITY_BY_ID[instance.split("@")[0]].name,
                          ]
                        : data.excluded,
                    }),
                  ]
                : []),
            ],
            undefined,
            FACILITY_BY_ID[instance.split("@")[0]].image,
          ),
        ),
        "market-remove",
      );
      return;
    }
    case "market-remove-at": {
      const index = s.market.indexOf(data.instance);
      ensure(index >= 0, "设施已经离开市场");
      takeMarket(s, data.instance);
      if (data.stash)
        p.persistent
          .find((v) => v.roleId === data.stash)!
          .stash.push(data.instance);
      else if (data.bottom) s.facilityDeck.push(data.instance);
      refill(s);
      log(
        s,
        id,
        `取走市场中的 ${FACILITY_BY_ID[data.instance.split("@")[0]].name}`,
      );
      return;
    }
    case "allocate": {
      if (count <= 0) return;
      decide(
        s,
        id,
        `选择资源 · 剩 ${count} 个`,
        (data.resources ?? BASIC).map((r: Resource) =>
          option(r, RESOURCE_NAMES[r], [
            gain(id, { [r]: 1 }),
            ...(count > 1
              ? [task("allocate", id, { ...data, count: count - 1 })]
              : []),
          ]),
        ),
        "allocate",
      );
      return;
    }
    case "least-resource": {
      const min = Math.min(...BASIC.map((r) => p.wallet[r]));
      decide(
        s,
        id,
        "选择持有数量最少的基础资源",
        BASIC.filter((r) => p.wallet[r] === min).map((r) =>
          option(r, RESOURCE_NAMES[r], [gain(id, { [r]: 4 })]),
        ),
        "least",
      );
      return;
    }
    case "sell": {
      const options: Option[] = [option("done", "完成出售", [])];
      for (const [r, price] of Object.entries(data.prices))
        for (let n = 1; n <= p.wallet[r as Resource]; n++)
          options.push(
            option(
              `${r}:${n}`,
              `出售 ${n} ${RESOURCE_NAMES[r as Resource]} → ${n * Number(price)} 金券`,
              [
                task("pay-plain", id, { cost: { [r]: n } }),
                gain(id, { cash: n * Number(price) }),
                task("sell", id, data),
              ],
            ),
          );
      decide(s, id, "选择出售的数量，可多次出售", options, "sell");
      return;
    }
    case "forced-sale": {
      const targets = data.all ? s.players : s.players;
      decide(
        s,
        id,
        "选择强制出售的资源种类",
        BASIC.map((r) =>
          option(
            r,
            RESOURCE_NAMES[r],
            data.all
              ? targets.flatMap((v) => [
                  task("pay-plain", v.id, { cost: { [r]: v.wallet[r] } }),
                  gain(v.id, { cash: v.wallet[r] * data.price }),
                ])
              : [
                  task("forced-sale-player", id, {
                    resource: r,
                    price: data.price,
                  }),
                ],
          ),
        ),
        "forced-sale",
      );
      return;
    }
    case "forced-sale-player":
      decide(
        s,
        id,
        "选择出售资源的玩家",
        s.players.map((v) =>
          option(v.id, v.name, [
            task("pay-plain", v.id, {
              cost: { [data.resource]: v.wallet[data.resource as Resource] },
            }),
            gain(v.id, {
              cash: v.wallet[data.resource as Resource] * data.price,
            }),
          ]),
        ),
        "target-player",
      );
      return;
    case "forced-take":
      decide(
        s,
        id,
        "异客：选择对手和基础资源",
        s.players
          .filter((v) => v.id !== id)
          .flatMap((v) =>
            BASIC.map((r) =>
              option(`${v.id}:${r}`, `${v.name} · ${RESOURCE_NAMES[r]}`, [
                task("pay-plain", v.id, {
                  cost: { [r]: Math.min(4, v.wallet[r]) },
                }),
                gain(id, { [r]: Math.min(4, v.wallet[r]) }),
                gain(id, { score: 1 }),
                gain(v.id, { score: 1 }),
              ]),
            ),
          ),
        "forced-take",
      );
      return;
    case "forced-loss":
      decide(
        s,
        id,
        "选择对手和要移除的资源",
        s.players
          .filter((v) => v.id !== id)
          .flatMap((v) =>
            [...BASIC, "prime" as Resource].map((r) =>
              option(`${v.id}:${r}`, `${v.name} · ${RESOURCE_NAMES[r]}`, [
                pay(v.id, { [r]: Math.min(4, v.wallet[r]) }),
              ]),
            ),
          ),
        "forced-loss",
      );
      return;
    case "recall": {
      const cards = [...p.discard];
      p.hand.push(...cards);
      p.discard = [];
      prepend(
        s,
        cards.map(() => task("recall-reward", id)),
      );
      return;
    }
    case "recall-reward":
      decide(
        s,
        id,
        "锡人：选择收回一张弃牌的奖励",
        [
          option("cash", "获得 5 金券", [gain(id, { cash: 5 })]),
          option("shift", "移动一个影响力", [task("shift", id, { count: 1 })]),
        ],
        "recall",
      );
      return;
    case "public-road":
      decide(
        s,
        id,
        "选择改造为公路的航道",
        s.board.roads
          .filter((r) => !s.sites[r.id].publicRoad)
          .map((r) =>
            option(
              r.id,
              r.id,
              [task("public-road-at", id, { road: r.id })],
              r.id,
            ),
          ),
        "public-road",
      );
      return;
    case "public-road-at": {
      const owners = [
        ...new Set(s.sites[data.road].slots.filter(Boolean)),
      ] as string[];
      const steps: Step[] = [];
      s.sites[data.road].slots.forEach((_, index) =>
        steps.push(...removeInfluence(s, data.road, index)),
      );
      s.sites[data.road].publicRoad = true;
      prepend(s, [
        ...steps,
        ...(data.noCompensation
          ? []
          : owners.map((owner) => gain(owner, { score: 1 }))),
      ]);
      log(s, id, `${data.road} 改造为公路`);
      return;
    }
    case "different-opponents": {
      const used: string[] = data.used ?? [];
      const slots = occupied(s, "opponent", id).filter(
        (slot) =>
          !used.includes(
            s.sites[slotParts(slot)[0]].slots[slotParts(slot)[1]]!,
          ),
      );
      decide(
        s,
        id,
        "选择不同对手的影响力",
        slots.map((slot) =>
          option(
            slot,
            slot,
            [
              task("remove-at", id, { slot }),
              ...(count > 1
                ? [
                    task("different-opponents", id, {
                      count: count - 1,
                      used: [
                        ...used,
                        s.sites[slotParts(slot)[0]].slots[slotParts(slot)[1]],
                      ],
                    }),
                  ]
                : []),
            ],
            slotParts(slot)[0],
          ),
        ),
        "different-opponents",
      );
      return;
    }
    case "persistent": {
      if (data.markers > 0) {
        decide(
          s,
          id,
          "选择放置在持续角色上的玩家标记数量",
          Array.from(
            { length: Math.min(data.markers, stock(s, id)) + 1 },
            (_, n) =>
              option(String(n), `${n} 个标记`, [
                task("persistent-at", id, { role: data.role, markers: n }),
              ]),
          ),
          "persistent-markers",
        );
        return;
      }
      prepend(s, [task("persistent-at", id, data)]);
      return;
    }
    case "persistent-at":
      if (["passenger", "o-lin"].includes(data.role) && data.markers === 0)
        p.discard.push(data.role);
      else
        p.persistent.push({
          roleId: data.role,
          markers: data.markers,
          stash: [],
        });
      p.selected = null;
      log(s, id, `${ROLE_BY_ID[data.role].name} 的持续效果生效`);
      return;
    case "retire-role":
      p.removed.push(data.role);
      p.discard = p.discard.filter((r) => r !== data.role);
      if (p.selected === data.role) p.selected = null;
      return;
    case "finish-role": {
      if (p.selected && (!data.role || p.selected === data.role)) {
        p.discard.push(p.selected);
        p.selected = null;
      }
      return;
    }
    case "upgrade": {
      const companies = s.activeEnterprises.filter(
        (c) =>
          c !== data.exclude &&
          (data.all
            ? s.players.some((other) => other.enterprise[c] < 5)
            : p.enterprise[c] < 5),
      );
      decide(
        s,
        id,
        "选择提升合作等级的企业",
        companies.map((c) =>
          option(
            c,
            `${ENTERPRISE_NAMES[c]} · ${p.enterprise[c]} → ${Math.min(5, p.enterprise[c] + count)}`,
            [task("upgrade-at", id, { company: c, count, all: !!data.all })],
            undefined,
            s.oripathy
              ? (oripathyEnterpriseImage(c) ?? ENTERPRISE_IMAGES[c])
              : ENTERPRISE_IMAGES[c],
          ),
        ),
        "upgrade",
      );
      return;
    }
    case "upgrade-at": {
      const company = data.company;
      const targets = data.all
        ? Array.from(
            { length: s.players.length },
            (_, i) => s.players[(p.seat + i) % s.players.length],
          )
        : [p];
      const steps: Step[] = [];
      for (const v of targets) {
        const previousLevel = v.enterprise[company];
        for (let i = 0; i < count; i++) {
          if (v.enterprise[company] >= 5) break;
          v.enterprise[company]++;
          if (!unlocked(company, v.enterprise[company], !!s.oripathy))
            steps.push(
              ...upgradeReward(s, v.id, company, v.enterprise[company]),
            );
        }
        if (v.enterprise[company] !== previousLevel)
          log(
            s,
            v.id,
            `${ENTERPRISE_NAMES[company]} 合作等级提升至 ${v.enterprise[company]}`,
          );
      }
      prepend(s, steps);
      return;
    }
    case "upgrade-trigger":
      decide(
        s,
        id,
        "选择提升并触发的同一家企业",
        s.activeEnterprises.map((c) =>
          option(
            c,
            ENTERPRISE_NAMES[c],
            [
              task("upgrade-at", id, { company: c, count: 1 }),
              task("trigger", id, { company: c }),
            ],
            undefined,
            s.oripathy
              ? (oripathyEnterpriseImage(c) ?? ENTERPRISE_IMAGES[c])
              : ENTERPRISE_IMAGES[c],
          ),
        ),
        "upgrade-trigger",
      );
      return;
    case "trigger": {
      const pool = data.company ? [data.company] : s.activeEnterprises;
      const options = pool.flatMap((c: string) =>
        Array.from({ length: p.enterprise[c] }, (_, i) => i + 1)
          .filter((l) => unlocked(c, l, !!s.oripathy))
          .map((l) =>
            option(
              `${c}:${l}`,
              `${ENTERPRISE_NAMES[c]} · ${l} 级`,
              enterpriseSteps(s, id, c, l),
              undefined,
              s.oripathy
                ? (oripathyEnterpriseImage(c) ?? ENTERPRISE_IMAGES[c])
                : ENTERPRISE_IMAGES[c],
            ),
          ),
      );
      if (data.allUnlocked) {
        prepend(
          s,
          options.flatMap((o) => o.steps),
        );
        return;
      }
      decide(s, id, "选择一个已解锁的企业特效", options, "trigger");
      return;
    }
    case "trigger-all-company":
      decide(
        s,
        id,
        "凯尔希：选择企业，触发所有已解锁特效",
        s.activeEnterprises
          .filter((c) => p.enterprise[c] > 0)
          .map((c) =>
            option(
              c,
              ENTERPRISE_NAMES[c],
              [
                task("trigger-order", id, {
                  company: c,
                  levels: Array.from(
                    { length: p.enterprise[c] },
                    (_, i) => i + 1,
                  ).filter((l) => unlocked(c, l, !!s.oripathy)),
                }),
              ],
              undefined,
              s.oripathy
                ? (oripathyEnterpriseImage(c) ?? ENTERPRISE_IMAGES[c])
                : ENTERPRISE_IMAGES[c],
            ),
          ),
        "trigger-all-company",
      );
      return;
    case "trigger-order": {
      const levels: number[] = data.levels;
      if (!levels.length) return;
      decide(
        s,
        id,
        "选择下一个企业特效的结算顺序",
        levels.map((level) =>
          option(
            String(level),
            `${ENTERPRISE_NAMES[data.company]} · ${level} 级`,
            [
              ...enterpriseSteps(s, id, data.company, level),
              task("trigger-order", id, {
                ...data,
                levels: levels.filter((l) => l !== level),
              }),
            ],
          ),
        ),
        "trigger-order",
      );
      return;
    }
    case "blacksteel-action":
      decide(
        s,
        id,
        `${data.sourceName ?? "黑钢国际"} · 剩 ${count} 次`,
        [
          option("place", "放置一次", [
            task("place", id, { count: 1 }),
            ...(count > 1
              ? [task("blacksteel-action", id, { ...data, count: count - 1 })]
              : []),
          ]),
          option("remove", "移除一次", [
            task("remove", id, { count: 1, who: "any" }),
            ...(count > 1
              ? [task("blacksteel-action", id, { ...data, count: count - 1 })]
              : []),
          ]),
        ],
        "blacksteel",
      );
      return;
    case "opponent-loss":
      decide(
        s,
        id,
        "选择对手",
        s.players
          .filter((v) => v.id !== id)
          .map((v) => option(v.id, v.name, [pay(v.id, data.reward)])),
        "opponent",
      );
      return;
    case "refresh-market":
      s.facilityDeck = shuffle(s, [
        ...s.facilityDeck,
        ...s.market,
        ...Object.values(s.oripathy?.marketUnder ?? {}).flat(),
      ]);
      if (s.oripathy) s.oripathy.marketUnder = {};
      s.market = [];
      refill(s);
      return;
    case "shuffle-facilities":
      s.facilityDeck = shuffle(s, s.facilityDeck);
      return;
    case "switch-lab":
      ensure(COMPLETE_RHINE_RULES, "莱茵生命三张原版科室须核验后接入规则包");
      decide(
        s,
        id,
        "选择莱茵生命科室",
        RHINE_DEPARTMENTS.map((_, i) => i)
          .filter((i) => data.initial || i !== s.activeLab)
          .map((i) =>
            option(String(i), RHINE_DEPARTMENTS[i].name, [
              task("set-lab", id, { lab: i, initial: !!data.initial }),
            ]),
          ),
        "lab",
      );
      return;
    case "set-lab":
      ensure(
        RHINE_DEPARTMENTS[data.lab]?.rewardEvidenceComplete,
        "科室奖励需原版牌面核验",
      );
      s.activeLab = data.lab;
      log(s, id, `莱茵生命激活 ${RHINE_DEPARTMENTS[data.lab].name}`);
      if (!data.initial)
        prepend(s, upgradeReward(s, id, "rhine", p.enterprise.rhine));
      return;
    case "rhine-reward": {
      const department = RHINE_DEPARTMENTS[data.lab];
      ensure(department?.rewardEvidenceComplete, "科室奖励需原版牌面核验");
      if (data.level <= 1) return;
      const reward = department.rewards[String(data.level)];
      ensure(reward, "科室奖励等级不存在");
      const effects = originalLabSteps(id, department.name, reward);
      prepend(
        s,
        reward.cost
          ? [task("conditional", id, { cost: reward.cost, steps: effects })]
          : effects,
      );
      return;
    }
    case "rhine-structural-downgrade": {
      ensure(p.enterprise.rhine > 0, "莱茵生命合作等级无法再降低");
      p.enterprise.rhine--;
      log(s, id, `结构科：莱茵生命合作等级降低至 ${p.enterprise.rhine}`);
      prepend(s, upgradeReward(s, id, "rhine", p.enterprise.rhine));
      return;
    }
    case "rhine-defense-choice":
      decide(
        s,
        id,
        "防卫科：选择替换一次或移动两次影响力",
        [
          option("replace", "替换一次", [task("replace", id)]),
          option("shift", "移动两次", [task("shift", id, { count: 2 })]),
        ],
        "rhine-defense",
      );
      return;
    case "operative-draw": {
      const pool = s.operativeDeck.splice(
        0,
        data.select
          ? s.operativeDeck.length
          : s.oripathy || s.players.length === 2
            ? 3
            : 2,
      );
      decide(
        s,
        id,
        "罗德岛：选择干员或获得 1 分",
        [
          option("score", "获得 1 分", [
            gain(id, { score: 1 }),
            task("return-operatives", id, { roles: pool }),
          ]),
          ...(p.hand.length || p.discard.length ? pool : []).map((role) =>
            option(
              role,
              ROLE_BY_ID[role].name,
              [task("operative-recruit", id, { role, pool })],
              undefined,
              ROLE_BY_ID[role].image,
            ),
          ),
        ],
        "operative-draw",
        true,
      );
      return;
    }
    case "return-operatives":
      s.operativeDeck = shuffle(s, [...s.operativeDeck, ...data.roles]);
      return;
    case "operative-recruit":
      decide(
        s,
        id,
        "选择公开退役一张手牌或弃牌",
        [...p.hand, ...p.discard].map((role) =>
          option(
            role,
            ROLE_BY_ID[role].name,
            [
              task("retire-hand", id, { role }),
              task("operative-recruit-at", id, { ...data, retire: role }),
            ],
            undefined,
            ROLE_BY_ID[role].image,
          ),
        ),
        "operative-retire",
      );
      return;
    case "operative-recruit-at":
      p.discard = p.discard.filter((r) => r !== data.retire);
      p.hand.push(data.role);
      s.operativeDeck = shuffle(s, [
        ...s.operativeDeck,
        ...data.pool.filter((r: string) => r !== data.role),
      ]);
      log(s, id, `招募 ${ROLE_BY_ID[data.role].name}`);
      return;
    case "rhodes-recall":
      decide(
        s,
        id,
        "罗德岛：收回一张弃牌，其余手牌弃置",
        p.discard.map((role) =>
          option(
            role,
            ROLE_BY_ID[role].name,
            [task("rhodes-recall-at", id, { role })],
            undefined,
            ROLE_BY_ID[role].image,
          ),
        ),
        "rhodes-recall",
      );
      return;
    case "rhodes-road-income":
      prepend(s, [
        gain(id, {
          cash: s.board.roads.reduce(
            (n, road) =>
              n + s.sites[road.id].slots.filter((owner) => owner === id).length,
            0,
          ),
        }),
      ]);
      return;
    case "rhodes-recall-at":
      p.discard = p.discard.filter((r) => r !== data.role);
      p.discard.push(...p.hand);
      p.hand = [data.role];
      prepend(s, [gain(id, { cash: 10 })]);
      return;
    case "harvest": {
      const selected: string[] = data.selected ?? [];
      const roads: string[] = data.roads ?? [];
      const total = roads.reduce((n, r) => n + roadCost(s, id, r), 0);
      const eligible = s.board.nodes.filter(
        (n) =>
          s.sites[n.id].resource &&
          (s.sites[n.id].slots.includes(id) ||
            p.city === n.id ||
            (s.phase === "harvest" &&
              s.oripathy?.contracts.includes(id) &&
              s.oripathy.security.some((slot) =>
                slot.startsWith(`${n.id}:`),
              ))) &&
          !selected.includes(n.id),
      );
      const options = [
        option(
          "done",
          `${s.parallel?.kind === "harvest" ? "采集方案" : "完成采集"} · ${selected.length} 个资源点 · ${data.free ? 0 : total} 金券`,
          [
            ...tollSteps(s, id, roads, !!data.free),
            ...selected.map((n) =>
              gain(id, { [s.sites[n].resource!]: s.sites[n].amount }),
            ),
          ],
        ),
      ];
      for (const node of selected) {
        const remaining = selected.filter((n) => n !== node);
        options.push(
          option(
            `unselect:${node}`,
            `撤回 ${node} 的采集选择`,
            [
              task("harvest", id, {
                ...data,
                selected: remaining,
                roads: pruneHarvestRoads(s, id, remaining, roads),
              }),
            ],
            node,
          ),
        );
      }
      if (selected.length)
        options.push(
          option("reset", "清空本次采集选择", [
            task("harvest", id, { ...data, selected: [], roads: [] }),
          ]),
        );
      for (const n of eligible) {
        const route = routeTo(s, id, n.id, roads);
        const nextRoads = [...new Set([...roads, ...route.roads])];
        const cost = nextRoads.reduce((sum, r) => sum + roadCost(s, id, r), 0);
        if (data.free || cost <= p.wallet.cash)
          options.push(
            option(
              n.id,
              `${n.id} · ${s.sites[n.id].amount} ${RESOURCE_NAMES[s.sites[n.id].resource!]} · 总路费 ${data.free ? 0 : cost}`,
              [
                task("harvest", id, {
                  ...data,
                  selected: [...selected, n.id],
                  roads: nextRoads,
                }),
              ],
              n.id,
            ),
          );
      }
      decide(s, id, "选择采集资源点，共用航道只付一次路费", options, "harvest");
      if (s.decision)
        s.decision.map = {
          roads: [...roads],
          selected: [...selected],
          free: !!data.free,
        };
      return;
    }
    case "pattern-declare": {
      const pattern = PATTERN_BY_ID[data.pattern];
      if (stock(s, id) <= 0) return;
      const matches = patternMatches(p, pattern.id);
      decide(
        s,
        id,
        `宣告 ${pattern.name} · 选择组合`,
        matches.map((cells, i) =>
          option(
            String(i),
            `城市格 ${cells.map((c) => Number(c) + 1).join("、")}`,
            [task("pattern-declare-at", id, { pattern: pattern.id, cells })],
          ),
        ),
        "pattern",
      );
      return;
    }
    case "pattern-declare-at": {
      for (const cell of data.cells) p.built[cell].used = true;
      const pattern = PATTERN_BY_ID[data.pattern];
      const already = p.claims.some((c) => c.patternId === pattern.id);
      const usedThisRound = p.claims.some(
        (c) => c.patternId === pattern.id && c.cooldown > 0,
      );
      p.claims.push({
        patternId: pattern.id,
        cooldown: usedThisRound ? 1 : 0,
        uses: pattern.level === 2 ? (already ? 0 : 2) : -1,
      });
      p.wallet.score += pattern.score;
      log(s, id, `宣告 ${pattern.name}，获得 ${pattern.score} 分`);
      for (const cell of data.cells)
        if (p.built[cell]?.cardId === "o-settlement")
          prepend(s, [task("o:settlement-return", id, { cell })]);
      if (pattern.effect === "o-emerging")
        prepend(s, [task("build", id, { nonWild: true })]);
      if (pattern.effect === "o-management")
        prepend(s, [task("o:management", id)]);
      if (pattern.effect === "relay")
        prepend(s, [gain(id, { rock: 1, ore: 1, iron: 1 })]);
      return;
    }
    case "special": {
      const index = p.claims.findIndex(
        (c) => c.patternId === data.pattern && c.cooldown === 0 && c.uses !== 0,
      );
      ensure(data.borrowed || index >= 0, "样式行动本回合不可用");
      const claim = p.claims[index];
      const pattern = PATTERN_BY_ID[data.pattern];
      if (!data.borrowed) {
        for (const c of p.claims)
          if (c.patternId === pattern.id) c.cooldown = 1;
        if (claim.uses > 0) claim.uses--;
      }
      if (
        !data.borrowed &&
        pattern.level === 2 &&
        pattern.effect !== "command-center"
      ) {
        ensure(!p.roleUsedThisTurn, "本轮已使用角色，不能执行此高级样式");
        s.roleBlocked = true;
      }
      const markers = p.claims.filter((c) => c.patternId === pattern.id).length;
      const steps: Step[] = [];
      switch (pattern.effect) {
        case "o-offices":
          steps.push(task("o:company-double-trigger", id));
          break;
        case "military":
          steps.push(task("place", id, { count: Math.min(3, markers) }));
          break;
        case "mobilize":
          steps.push(task("place", id, { count: 1 }));
          break;
        case "composite":
          steps.push(task("composite-payment", id));
          break;
        case "outpost":
          steps.push(
            task("place", id, { count: 2, targets: [p.city] }),
            task("shift", id, { count: markers }),
          );
          break;
        case "enterprise-park":
          steps.push(task("upgrade", id, { count: 2 }));
          break;
        case "city-expansion":
          steps.push(
            pay(id, { score: 1 }),
            task("build", id, { source: "deck" }),
            task("shuffle-facilities", id),
          );
          break;
        case "commercial":
          steps.push(task("commercial-reward", id), task("extra-main", id));
          break;
        case "industrial-core":
          steps.push(
            task("conditional", id, {
              cost: { cash: 6 },
              steps: [task("extra-main", id), task("extra-main", id)],
            }),
          );
          break;
        case "efficient":
          steps.push(
            task("conditional", id, {
              cost: { ore: 3 },
              steps: [
                task("city", id, { free: true }),
                task("city", id, { free: true }),
              ],
            }),
          );
          break;
        case "command-center":
          s.roleDualThisTurn = true;
          steps.push(task("extra-main", id));
          break;
        case "security":
          steps.push(task("security", id, { count: 2 }));
          break;
        default:
          throw new RuleError("该样式没有特殊行动");
      }
      prepend(s, steps);
      return;
    }
    case "pay-basic": {
      if (count <= 0) return;
      const resources: Resource[] = data.resources ?? BASIC;
      ensure(
        resources.reduce((n, r) => n + p.wallet[r], 0) >= count,
        "基础资源不足",
      );
      decide(
        s,
        id,
        `支付基础资源 · 剩 ${count} 个`,
        resources
          .filter((r) => p.wallet[r] > 0)
          .map((r) =>
            option(r, RESOURCE_NAMES[r], [
              pay(id, { [r]: 1 }),
              ...(count > 1
                ? [task("pay-basic", id, { ...data, count: count - 1 })]
                : []),
            ]),
          ),
        "pay-basic",
      );
      return;
    }
    case "composite-payment": {
      const options: Option[] = [];
      for (let rock = 0; rock <= 3; rock++) {
        const cost = { ore: 1, rock, iron: 3 - rock };
        if (canPay(p, cost) && cityOptions(s, id, { free: true }).length)
          options.push(
            option(String(rock), `支付 ${moneyText(cost)}`, [
              pay(id, cost),
              task("city", id, { free: true, placeRoad: true }),
            ]),
          );
      }
      options.push(option("skip", "跳过付费效果", []));
      decide(s, id, "复合动力系统：选择资源组合", options, "composite-payment");
      return;
    }
    case "commercial-reward":
      decide(
        s,
        id,
        "核心商业区：选择奖励",
        [
          option("cash", "4 金券", [gain(id, { cash: 4 })]),
          ...BASIC.map((r) =>
            option(r, `1 ${RESOURCE_NAMES[r]}`, [gain(id, { [r]: 1 })]),
          ),
        ],
        "commercial",
      );
      return;
    case "platform-payment":
      decide(
        s,
        id,
        "大型采集平台：选择支付方式",
        [
          ...(p.wallet.cash >= 16
            ? [option("cash", "支付 16 金券", [pay(id, { cash: 16 })])]
            : []),
          option("score", "失去 1 分", [pay(id, { score: 1 })]),
        ],
        "platform",
      );
      return;
    case "security":
      if (count <= 0) return;
      decide(
        s,
        id,
        "警备队辖区：选择行动",
        [
          ...(canPay(p, { rock: 2, iron: 1 })
            ? [
                option("replace", "支付 2 源岩、1 异铁，替换一个影响力", [
                  pay(id, { rock: 2, iron: 1 }),
                  task("replace", id),
                  ...(count > 1
                    ? [task("security", id, { count: count - 1 })]
                    : []),
                ]),
              ]
            : []),
          option("place", "放置影响力，获得 1 源石", [
            task("place", id, { count: 1 }),
            gain(id, { ore: 1 }),
            ...(count > 1 ? [task("security", id, { count: count - 1 })] : []),
          ]),
          option("remove", "移除影响力，获得 2 异铁", [
            task("remove", id, { count: 1, who: "any" }),
            gain(id, { iron: 2 }),
            ...(count > 1 ? [task("security", id, { count: count - 1 })] : []),
          ]),
        ],
        "security",
      );
      return;
    case "extra-main":
      s.mainRemaining++;
      s.mainDone = false;
      s.extraOnly = true;
      return;
    case "start-round": {
      if (s.round === 1) {
        const funds =
          s.players.length === 4
            ? [10, 12, 14, 18]
            : s.players.length === 3
              ? [10, 12, 18]
              : [10, 18];
        s.players.forEach((v, i) => {
          v.wallet.cash += funds[i];
          if (s.players.length === 2 && i === 1) v.wallet.score += 3;
        });
      }
      s.phase = "select";
      s.lap = 1;
      s.mainDone = false;
      s.mainRemaining = 1;
      s.extraOnly = false;
      s.roleBlocked = false;
      s.roleDualThisTurn = false;
      const steps: Step[] = [];
      const marketSteps: Step[] = [];
      if (s.oripathy && s.players.length === 3)
        marketSteps.push(
          task("market-remove", s.players[s.first].id, { count: 1 }),
        );
      if (s.players.length === 2)
        for (let i = 0; i < s.players.length; i++)
          marketSteps.push(
            task(
              "market-remove",
              s.players[(s.first + i) % s.players.length].id,
              { count: 1 },
            ),
          );
      if (
        s.expansion &&
        s.round ===
          (s.players.length === 4 ? 4 : s.players.length === 3 ? 5 : 6)
      )
        for (let i = 0; i < s.players.length; i++)
          steps.push(
            task("upgrade", s.players[(s.first + i) % s.players.length].id),
          );
      // Infection flow card p. 10: red-zone upgrades precede market removal.
      if (s.oripathy) steps.push(...marketSteps);
      else steps.unshift(...marketSteps);
      for (let i = 0; i < s.players.length; i++) {
        const v = s.players[(s.first + i) % s.players.length];
        if (!v.hand.length) {
          v.hand.push(...v.discard);
          v.discard = [];
        }
      }
      if (s.oripathy?.expert && s.round % 2 === 1)
        for (const actor of playerOrder(s))
          steps.push(task("o:dilemma", actor));
      if (s.oripathy?.expert)
        for (const v of s.players)
          if (v.oripathy?.entrepreneur === "agnes" && hasDilemma(v, 1))
            steps.push(task("o:commands", v.id, { count: 1 }));
      steps.push(task("parallel-roles", id));
      steps.push(task("begin-actions", id));
      prepend(s, steps);
      return;
    }
    case "parallel-roles":
      beginParallel(s, "select-role");
      return;
    case "parallel-harvest":
      if (s.oripathy)
        for (const v of s.players) {
          v.hand.push(...(v.coveredFlows ?? []));
          v.coveredFlows = [];
          if (v.selected?.startsWith("o-flow-")) {
            v.hand.push(v.selected);
            v.selected = null;
          }
        }
      beginParallel(s, "harvest");
      return;
    case "select-role": {
      if (!p.hand.length) return;
      decide(
        s,
        id,
        "秘密盖放本回合角色牌",
        p.hand.map((role) =>
          option(
            role,
            ROLE_BY_ID[role].name,
            [task("select-role-at", id, { role })],
            undefined,
            ROLE_BY_ID[role].image,
          ),
        ),
        "select-role",
        true,
      );
      return;
    }
    case "select-role-at":
      p.selected = data.role;
      p.hand = p.hand.filter((r) => r !== data.role);
      p.revealed = false;
      if (p.persistent.some((v) => v.roleId === "o-muelsyse"))
        prepend(s, [task("o:cover-flow", id)]);
      log(s, id, "盖放了一张角色牌");
      return;
    case "begin-actions":
      s.phase = "actions";
      s.active = s.first;
      if (s.oripathy?.lock?.owner === s.players[s.first].id)
        s.oripathy.lock = null;
      if (s.oripathy)
        for (const v of s.players) v.oripathy!.turnBlocked = false;
      for (const v of s.players) v.roleUsedThisTurn = false;
      log(s, null, `第 ${s.round} 回合 · 第 1 轮行动`);
      return;
    case "cleanup": {
      s.phase = "cleanup";
      const steps: Step[] = [];
      const at = s.scheduled.filter((v) => v.at === "cleanup");
      s.scheduled = s.scheduled.filter((v) => v.at !== "cleanup");
      for (let i = 0; i < s.players.length; i++) {
        const v = s.players[(s.first + i) % s.players.length];
        const effects = at
          .filter((t) => t.step.actor === v.id)
          .map((t) => t.step);
        for (const persistent of v.persistent) {
          const added: Record<string, string> = {
            "o-swire": "o:swire-cleanup",
            "o-gavial": "o:gavial-cleanup",
            "o-lin": "o:lin-cleanup",
            "o-jessica": "o:mortgage-cleanup",
          };
          if (added[persistent.roleId])
            effects.push(task(added[persistent.roleId], v.id));
          if (persistent.roleId === "mudrock")
            effects.push(
              task("conditional", v.id, {
                cost: { rock: 2 },
                steps: [task("place", v.id, { count: 1 })],
              }),
            );
          if (persistent.roleId === "dorothy" && persistent.markers >= 2)
            effects.push(task("dorothy-cleanup", v.id));
        }
        if (v.oripathy?.awards.includes("1187"))
          effects.push(task("o:award-cleanup", v.id));
        if (v.oripathy?.entrepreneur)
          effects.push(task("o:entrepreneur-cleanup", v.id));
        steps.push(task("cleanup-order", v.id, { effects }));
      }
      steps.push(task("next-round", id));
      prepend(s, steps);
      return;
    }
    case "cleanup-order": {
      const effects: Step[] = data.effects;
      if (effects.length <= 1) {
        prepend(s, effects);
        return;
      }
      const labels: Record<string, string> = {
        remove: "结算临时部署的影响力回收",
        conditional: "结算泥岩的持续部署",
        "dorothy-cleanup": "结算多萝西的标记转化",
      };
      decide(
        s,
        id,
        "选择收尾效果的执行顺序",
        effects.map((effect, index) =>
          option(String(index), labels[effect.kind] ?? "结算收尾效果", [
            effect,
            task("cleanup-order", id, {
              effects: effects.filter((_, i) => i !== index),
            }),
          ]),
        ),
        "cleanup-order",
      );
      return;
    }
    case "next-round": {
      for (const v of s.players) {
        for (const claim of v.claims) claim.cooldown = 0;
        for (const d of v.oripathy?.dilemmas ?? []) d.used = false;
        if (v.selected) {
          v.hand.push(v.selected, ...v.discard);
          v.discard = [];
          v.selected = null;
        }
        v.revealed = false;
      }
      s.first = s.firstOverride ?? (s.first + 1) % s.players.length;
      s.firstOverride = null;
      if (s.round >= 8) {
        s.phase = "finished";
        s.finalScores = scoreGame(s);
        const sorted = [...s.finalScores].sort(
          (a, b) =>
            b.total - a.total ||
            player(s, b.playerId).wallet.cash -
              player(s, a.playerId).wallet.cash ||
            player(s, b.playerId).wallet.prime -
              player(s, a.playerId).wallet.prime,
        );
        const best = sorted[0];
        s.winners = sorted
          .filter(
            (v) =>
              v.total === best.total &&
              player(s, v.playerId).wallet.cash ===
                player(s, best.playerId).wallet.cash &&
              player(s, v.playerId).wallet.prime ===
                player(s, best.playerId).wallet.prime,
          )
          .map((v) => v.playerId);
        log(
          s,
          null,
          `拓荒结束：${s.winners.map((id) => player(s, id).name).join("、")} 获胜`,
        );
      } else {
        s.round++;
        prepend(s, [task("start-round", s.players[s.first].id)]);
      }
      return;
    }
    default:
      throw new RuleError(`未知效果：${step.kind}`);
  }
}
function emptySlotsForMoving(
  s: GameState,
  owner: string,
  from: string,
): string[] {
  const [site, index] = slotParts(from);
  const copy = structuredClone(s);
  copy.sites[site].slots[index] = null;
  return emptySlots(copy, owner, undefined, { moving: true }).filter(
    (to) => to !== from,
  );
}
function mainOptions(s: GameState, id: string): Option[] {
  const options: Option[] = [];
  if (emptySlots(s, id).length)
    options.push(
      option("deploy", "部署 · 放置一次影响力", [
        task("place", id, { count: 1 }),
      ]),
    );
  if (
    occupied(s, "self", id).some(
      (slot) => emptySlotsForMoving(s, id, slot).length,
    )
  )
    options.push(
      option("shift", "调度 · 移动两次影响力", [
        task("shift", id, { count: 2 }),
      ]),
    );
  if (exploreOptions(s, id).length)
    options.push(
      option("explore", "探索 · 支付路费并结算事件", [task("explore", id)]),
    );
  if (cityOptions(s, id, {}).length)
    options.push(option("city", "城市移动 · 支付 3 源石", [task("city", id)]));
  if (buildOptions(s, id, {}).length)
    options.push(option("build", "建设 · 购买并放置设施", [task("build", id)]));
  return options;
}
export function getLegalActions(s: GameState, id: string): LegalAction[] {
  s = withParallelPhase(s);
  const p = player(s, id);
  const decision = s.parallel ? s.parallel.players[id].decision : s.decision;
  if (decision)
    return decision.playerId === id
      ? decision.options.map((o) => ({
          id: o.id,
          label: o.label,
          group: "choice",
          command: { type: "choose", optionId: o.id },
          target: o.target,
        }))
      : [];
  if (s.parallel) return [];
  if (s.phase !== "actions" || s.players[s.active].id !== id || s.queue.length)
    return [];
  const actions: LegalAction[] = [...expertActions(s, p)];
  if (!s.mainDone) {
    for (const o of mainOptions(s, id))
      actions.push({
        id: o.id,
        label: o.label,
        group: "main",
        command: { type: "main", action: o.id },
      });
    for (const claim of p.claims) {
      const pattern = PATTERN_BY_ID[claim.patternId];
      if (
        s.extraOnly ||
        claim.cooldown ||
        claim.uses === 0 ||
        ["relay", "o-emerging", "o-management"].includes(pattern.effect) ||
        (pattern.level === 2 &&
          pattern.effect !== "command-center" &&
          p.roleUsedThisTurn)
      )
        continue;
      if (!actions.some((a) => a.id === `special:${pattern.id}`))
        actions.push({
          id: `special:${pattern.id}`,
          label: `特殊行动 · ${pattern.name}`,
          group: "main",
          command: { type: "special", patternId: pattern.id },
        });
    }
  }
  if (p.selected && !s.roleBlocked && !p.oripathy?.turnBlocked) {
    const modes = p.persistent.some((v) => v.roleId === "o-amiya")
      ? ["strategy-tactic", "tactic-strategy"]
      : s.active === s.first || s.roleDualThisTurn
        ? ["strategy", "tactic", "strategy-tactic", "tactic-strategy"]
        : ["strategy", "tactic"];
    for (const mode of modes)
      actions.push({
        id: `role:${mode}`,
        label:
          mode === "strategy"
            ? "角色策略"
            : mode === "tactic"
              ? "角色计谋"
              : mode === "strategy-tactic"
                ? "先策略后计谋"
                : "先计谋后策略",
        group: "quick",
        command: { type: "role", mode },
      });
  }
  if (p.oripathy?.awards.includes("1184"))
    actions.push({
      id: "award:1184",
      label: "授勋 · 触发企业特效",
      group: "quick",
      command: { type: "ability", action: "award:1184" },
    });
  if (!s.roleBlocked)
    for (const role of p.coveredFlows ?? [])
      for (const mode of p.persistent.some((v) => v.roleId === "o-amiya")
        ? ["strategy-tactic", "tactic-strategy"]
        : [
            "strategy",
            "tactic",
            ...(s.active === s.first || s.roleDualThisTurn
              ? ["strategy-tactic", "tactic-strategy"]
              : []),
          ])
        actions.push({
          id: `role:flow:${role}:${mode}`,
          label: `${ROLE_BY_ID[role].name} · ${mode.includes("-") ? "策略与计谋" : mode === "strategy" ? "策略" : "计谋"}`,
          group: "quick",
          command: { type: "role", mode: `flow|${role}|${mode}` },
        });
  if (stock(s, id) > 0)
    for (const patternId of s.patterns)
      if (patternMatches(p, patternId).length)
        actions.push({
          id: `declare:${patternId}`,
          label: `宣告 · ${PATTERN_BY_ID[patternId].name}`,
          group: "quick",
          command: { type: "declare", patternId },
        });
  if (s.mainDone || !actions.some((a) => a.group === "main"))
    actions.push({
      id: "end",
      label: "结束本轮行动",
      group: "end",
      command: { type: "end" },
    });
  return actions;
}
export function applyCommand(
  original: GameState,
  id: string,
  command: Command,
): GameState {
  original = withParallelPhase(original);
  ensure(original.phase !== "finished", "对局已经结束");
  ensure(
    command !== null && typeof command === "object" && !Array.isArray(command),
    "行动指令格式无效",
  );
  if (command.type === "choose-many") {
    const batch = batchChoice(original, id);
    ensure(batch, "此选择不能批量提交");
    ensure(
      Object.keys(command).length === 2 &&
        Array.isArray(command.optionIds) &&
        command.optionIds.length === batch.count &&
        command.optionIds.every(
          (v) => typeof v === "string" && v.length <= 128,
        ),
      `请选满 ${batch.count} 项后确认`,
    );
    const ids = command.optionIds!;
    for (const value of new Set(ids))
      ensure(
        ids.filter((v) => v === value).length <= (batch.limits[value] ?? 0),
        "所选项目或数量不可用",
      );
    const kind = (
      original.parallel
        ? original.parallel.players[id].decision
        : original.decision
    )!.kind;
    let next = original;
    for (const [index, optionId] of ids.entries()) {
      const d = next.parallel
        ? next.parallel.players[id]?.decision
        : next.decision;
      ensure(
        d?.playerId === id &&
          d.kind === kind &&
          batchChoice(next, id)?.count === ids.length - index,
        "选择内容已变化，请重新选择",
      );
      // Each step uses the ordinary validator on a copy. Any failure discards
      // the entire batch; persistence and broadcast happen only after success.
      next = applyCommand(next, id, { type: "choose", optionId });
    }
    next.revision = original.revision + 1;
    return next;
  }
  const legal = getLegalActions(original, id);
  ensure(
    legal.some(({ command: expected }) => {
      const keys = Object.keys(expected) as (keyof Command)[];
      return (
        Object.keys(command).length === keys.length &&
        keys.every(
          (key) =>
            Object.prototype.hasOwnProperty.call(command, key) &&
            command[key] === expected[key],
        )
      );
    }),
    "此操作在当前阶段不可执行",
  );
  const s = structuredClone(original);
  const p = player(s, id);
  if (s.parallel) {
    const entry = s.parallel.players[id];
    const decision = entry.decision!;
    const selected = decision.options.find((o) => o.id === command.optionId)!;
    log(s, id, selected.label, [id]);
    entry.decision = null;
    entry.queue.unshift(...selected.steps);
    entry.revision++;
    advanceParallelChoice(s, id);
    syncParallel(s);
  } else if (command.type === "choose") {
    const decision = s.decision!;
    const selected = decision.options.find((o) => o.id === command.optionId)!;
    log(s, id, selected.label, decision.private ? [id] : undefined);
    s.decision = null;
    prepend(s, selected.steps);
  } else if (command.type === "main") {
    const selected = mainOptions(s, id).find((o) => o.id === command.action)!;
    s.mainRemaining--;
    s.mainDone = s.mainRemaining <= 0;
    log(s, id, selected.label);
    prepend(s, selected.steps);
  } else if (command.type === "role") {
    const flow = command.mode!.startsWith("flow|")
      ? command.mode!.split("|")
      : null;
    const role = flow ? flow[1] : p.selected!;
    const mode = flow ? flow[2] : command.mode!;
    if (flow) {
      p.coveredFlows = p.coveredFlows!.filter((v) => v !== role);
      p.discard.push(role);
    }
    p.revealed = flow ? p.revealed : true;
    p.roleUsedThisTurn = true;
    log(
      s,
      id,
      `使用 ${ROLE_BY_ID[role].name} · ${{ strategy: "策略", tactic: "计谋", "strategy-tactic": "策略后计谋", "tactic-strategy": "计谋后策略" }[mode]}`,
    );
    prepend(s, [
      ...(p.persistent.some((v) => v.roleId === "o-amiya") && role !== "o-amiya"
        ? [task("o:consume-amiya", id)]
        : []),
      ...mode.split("-").flatMap((mode) => roleSteps(s, id, role, mode)),
      ...(flow ? [] : [task("finish-role", id, { role })]),
    ]);
  } else if (command.type === "ability") {
    if (command.action === "award:1184") prepend(s, [task("o:award-use", id)]);
    else {
      if (command.action?.endsWith(":main")) {
        s.mainRemaining--;
        s.mainDone = s.mainRemaining <= 0;
      }
      prepend(s, [task("o:ability", id, { action: command.action })]);
    }
  } else if (command.type === "declare")
    prepend(s, [task("pattern-declare", id, { pattern: command.patternId })]);
  else if (command.type === "special") {
    s.mainRemaining--;
    s.mainDone = s.mainRemaining <= 0;
    prepend(s, [task("special", id, { pattern: command.patternId })]);
  } else if (command.type === "end") {
    const next = (s.active + 1) % s.players.length;
    if (next === s.first && s.lap === 2) {
      s.phase = "harvest";
      prepend(s, [task("parallel-harvest", id), task("cleanup", id)]);
    } else {
      s.active = next;
      if (next === s.first) s.lap = 2;
      s.mainDone = false;
      s.mainRemaining = 1;
      s.extraOnly = false;
      s.roleBlocked = false;
      s.roleDualThisTurn = false;
      s.players[next].roleUsedThisTurn = false;
      if (s.oripathy) {
        s.oripathy.turn++;
        if (s.oripathy.lock?.owner === s.players[next].id)
          s.oripathy.lock = null;
        s.players[next].oripathy!.turnBlocked = false;
      }
    }
  }
  advance(s);
  const result = withParallelPhase(s);
  result.revision++;
  return result;
}
export function scoreGame(s: GameState): ScoreLine[] {
  const regionIds = [
    ...new Set([...s.board.nodes, ...s.board.roads].map((n) => n.region)),
  ];
  const control: Record<string, Record<string, number>> = {};
  const gangRegions = (p: Player) =>
    new Set(
      (p.oripathy?.gangSlots ?? [])
        .map(
          (slot) =>
            [...s.board.nodes, ...s.board.roads].find(
              (n) => n.id === slot.slice(0, slot.lastIndexOf(":")),
            )?.region,
        )
        .filter((v): v is string => !!v),
    );
  for (const region of regionIds) {
    const sites = [...s.board.nodes, ...s.board.roads].filter(
      (n) => n.region === region,
    );
    const security =
      s.oripathy?.security.filter((slot) =>
        sites.some((site) => slot.startsWith(`${site.id}:`)),
      ).length ?? 0;
    const totals = s.players.map((p) => ({
      id: p.id,
      count:
        sites.reduce(
          (n, site) =>
            n + s.sites[site.id].slots.filter((owner) => owner === p.id).length,
          0,
        ) +
        (s.board.nodes.find((n) => n.id === p.city)?.region === region
          ? 2 +
            (p.oripathy?.entrepreneur === "agnes" && hasDilemma(p, 7, "B")
              ? 2
              : 0)
          : 0) +
        (s.oripathy?.contracts.includes(p.id) ? Math.floor(security / 2) : 0) +
        (p.oripathy?.entrepreneur === "paul" &&
        hasDilemma(p, 5, "A") &&
        gangRegions(p).has(region)
          ? 1
          : 0),
    }));
    const max = Math.max(...totals.map((v) => v.count));
    const winners = totals.filter((v) => v.count === max && max > 0);
    const agnes = winners.find((v) => {
      const p = player(s, v.id);
      return p.oripathy?.entrepreneur === "agnes" && hasDilemma(p, 7, "A");
    });
    const winner = winners.length === 1 ? winners[0] : agnes;
    if (winner) {
      const bonus = s.players.some(
        (p) =>
          p.oripathy?.entrepreneur === "paul" &&
          hasDilemma(p, 7, "B") &&
          gangRegions(p).has(region),
      )
        ? 1
        : 0;
      (control[winner.id] ??= {})[region] =
        (["E", "F"].includes(region) ? 4 : 3) +
        bonus -
        (winners.length > 1 ? 2 : 0);
    }
  }
  return s.players.map((p) => {
    const regions = control[p.id] ?? {},
      expert: Record<string, number> = {};
    const martin = p.oripathy?.entrepreneur === "martin",
      paul = p.oripathy?.entrepreneur === "paul";
    const piles = Object.values(p.built),
      stacks = piles.filter((v) => v.layers?.length).length;
    const ironExtra = martin && hasDilemma(p, 3, "A") ? stacks : 0;
    const alternate = paul && hasDilemma(p, 7, "A");
    const resources: Reward = {
      rock: Math.floor(
        p.wallet.rock / (alternate ? (s.players.length === 3 ? 7 : 6) : 9),
      ),
      ore: alternate ? 0 : Math.floor(p.wallet.ore / 8),
      iron: Math.floor(
        (p.wallet.iron + ironExtra) /
          (alternate ? (s.players.length === 3 ? 5 : 4) : 6),
      ),
      prime: p.wallet.prime,
    };
    if (alternate)
      resources.cash = Math.floor(
        p.wallet.cash / (s.players.length === 3 ? 30 : 25),
      );
    if (martin && hasDilemma(p, 3))
      expert[
        hasDilemma(p, 3, "A") ? "设施集群（另获同数异铁）" : "最高设施叠层"
      ] = hasDilemma(p, 3, "A")
        ? stacks
        : Math.max(0, ...piles.map((v) => 1 + (v.layers?.length ?? 0))) * 2;
    if (p.oripathy?.entrepreneur === "agnes") {
      if (hasDilemma(p, 5)) {
        const influence = (id: string) =>
          Object.values(s.sites).reduce(
            (n, site) => n + site.slots.filter((v) => v === id).length,
            0,
          );
        const mine = influence(p.id);
        expert["影响力优势"] = s.players.every(
          (v) => v.id === p.id || influence(v.id) < mine,
        )
          ? 2
          : -1;
      }
      if (hasDilemma(p, 7, "A"))
        expert["区块治理"] = Object.keys(regions).length;
    }
    if (paul && hasDilemma(p, 7, "B")) expert["帮派秩序"] = gangRegions(p).size;
    if (p.oripathy?.entrepreneur === "pioneer" && hasDilemma(p, 7))
      expert[hasDilemma(p, 7, "A") ? "至纯源石储备" : "荒野管辖"] = hasDilemma(
        p,
        7,
        "A",
      )
        ? Math.floor(p.wallet.prime / 4)
        : Object.keys(regions).length * 2;
    return {
      playerId: p.id,
      ongoing: p.wallet.score,
      regions,
      resources,
      ...(Object.keys(expert).length ? { expert } : {}),
      total:
        p.wallet.score +
        Object.values(regions).reduce((a, b) => a + b, 0) +
        Object.values(resources).reduce((a, b) => a + b, 0) +
        Object.values(expert).reduce((a, b) => a + b, 0),
    };
  });
}
export function projectView(s: GameState, id: string): PlayerView {
  s = withParallelPhase(s);
  player(s, id);
  const {
    queue,
    scheduled,
    randomState,
    facilityDeck,
    eventDecks,
    enterpriseDeck,
    operativeDeck,
    decision: representativeDecision,
    parallel,
    players,
    ...publicState
  } = structuredClone(s);
  const decision = parallel
    ? parallel.players[id].decision
    : representativeDecision;
  const actions = getLegalActions(s, id);
  let decisionMap = decision?.map;
  // Earlier saves contain the same pending payment steps, but no map snapshot.
  // Recover their paid roads and connect the selected nodes through free/paid
  // links. This is a view projection only; it never rewrites the saved choice.
  if (
    decision?.playerId === id &&
    !decisionMap &&
    decision.kind === "harvest"
  ) {
    const selected = decision.options
      .filter((o) => o.id.startsWith("unselect:"))
      .map((o) => o.target!);
    const done = decision.options.find((o) => o.id === "done");
    const roads = [
      ...new Set(
        (done?.steps ?? [])
          .filter((v) => v.kind === "toll")
          .map((v) => String(v.data!.road)),
      ),
    ];
    const free = decision.options.some((o) =>
      o.steps.some((v) => v.kind === "harvest" && v.data?.free),
    );
    for (const node of selected)
      for (const road of routeTo(s, id, node, roads).roads)
        if (!roads.includes(road)) roads.push(road);
    decisionMap = { selected, roads, free };
  }
  if (decision?.playerId === id && !decisionMap && decision.kind === "toll") {
    const road = decision.title.split(" · ")[0];
    if (s.board.roads.some((r) => r.id === road))
      decisionMap = { roads: [road], selected: [], free: false };
  }
  return {
    ...publicState,
    sites: Object.fromEntries(
      Object.entries(publicState.sites).map(([siteId, site]) => [
        siteId,
        {
          ...site,
          slots: site.slots.map((owner, index) =>
            s.oripathy?.security.includes(`${siteId}:${index}`)
              ? "@stonehoove"
              : owner,
          ),
        },
      ]),
    ),
    parallel: parallel
      ? {
          id: parallel.id,
          kind: parallel.kind,
          participants: parallel.order,
          ready: parallel.order.filter(
            (playerId) => parallel.players[playerId].ready,
          ),
          choiceToken: getParallelChoiceToken(s, id),
        }
      : null,
    log: s.log
      .filter((e) => !e.visibility || e.visibility.includes(id))
      .map(({ visibility, ...event }) => event),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      wallet: p.wallet,
      city: p.city,
      discard: p.discard,
      revealed: p.revealed,
      built: p.built,
      claims: p.claims,
      enterprise: p.enterprise,
      persistent: p.persistent,
      removed: p.removed.filter((role) => !p.privateRemoved.includes(role)),
      tokenLimit: p.tokenLimit,
      roleUsedThisTurn: p.roleUsedThisTurn,
      hand: p.id === id ? p.hand : [],
      handCount: p.hand.length,
      availableMarkers: stock(s, p.id),
      selected: p.id === id || p.revealed ? p.selected : null,
      coveredFlows: p.id === id ? p.coveredFlows : [],
      oripathy: p.oripathy,
    })),
    decision: decision
      ? {
          playerId: decision.playerId,
          title:
            decision.private && decision.playerId !== id
              ? "该玩家正在进行秘密选择"
              : decision.title,
          kind: decision.kind,
          private: decision.private,
          ...(decision.playerId === id && batchChoice(s, id)
            ? { batch: batchChoice(s, id) }
            : {}),
          ...(decision.playerId === id && decisionMap
            ? { map: decisionMap }
            : {}),
          options:
            decision.playerId === id
              ? decision.options.map(({ steps, ...o }) => {
                  // Whitelist display-only geometry. Never expose the effect queue,
                  // random state, hidden cards, or choices belonging to another seat.
                  const harvest = steps.find((v) => v.kind === "harvest")?.data;
                  const declaration = steps.find(
                    (v) => v.kind === "pattern-declare-at",
                  )?.data;
                  const relocate = steps.find(
                    (v) => v.kind === "relocate",
                  )?.data;
                  const roads =
                    decision.kind === "explore" && o.target
                      ? routeTo(s, id, o.target).roads
                      : relocate
                        ? relocate.road
                          ? [String(relocate.road)]
                          : []
                        : harvest
                          ? (harvest.roads as string[])
                          : decision.kind === "harvest" && o.id === "done"
                            ? decisionMap?.roads
                            : decision.kind === "toll"
                              ? decisionMap?.roads
                              : undefined;
                  const free =
                    !!harvest?.free ||
                    (decision.kind === "harvest" && !!decisionMap?.free);
                  const preview = {
                    ...(roads
                      ? {
                          roads,
                          tolls: roads.map((road) => ({
                            road,
                            amount:
                              relocate || free ? 0 : roadCost(s, id, road),
                            recipients: [
                              ...new Set(
                                s.sites[road].slots.filter(
                                  (owner): owner is string =>
                                    !!owner && owner !== id,
                                ),
                              ),
                              ...(s.oripathy?.security.some((slot) =>
                                slot.startsWith(`${road}:`),
                              )
                                ? ["bank"]
                                : []),
                            ],
                          })),
                        }
                      : {}),
                    ...(harvest
                      ? { selected: harvest.selected as string[] }
                      : {}),
                    ...(declaration
                      ? {
                          cells: declaration.cells as string[],
                          patternId: String(declaration.pattern),
                        }
                      : {}),
                  };
                  return {
                    ...o,
                    ...(Object.keys(preview).length ? { preview } : {}),
                  };
                })
              : [],
        }
      : null,
    me: id,
    actions,
    influencePlacements: actions.some(
      (a) => a.command.type === "main" && a.command.action === "deploy",
    )
      ? emptySlots(s, id).map((slot) => ({
          target: slotParts(slot)[0],
          optionId: slot,
          label: slot.replace(":", " · 格 "),
        }))
      : [],
    influenceMoves: (() => {
      if (decision?.playerId === id && decision.kind === "shift-from")
        return decision.options.map((o) => {
          const data = o.steps.find((v) => v.kind === "shift-target")!.data!;
          return {
            from: String(data.slot),
            owner: String(data.owner),
            destinations: emptySlotsForMoving(
              s,
              String(data.owner),
              String(data.slot),
            ),
          };
        });
      if (decision?.playerId === id && decision.kind === "shift-to") {
        const data = decision.options[0]?.steps.find(
          (v) => v.kind === "shift-at",
        )?.data;
        return data
          ? [
              {
                from: String(data.from),
                owner: String(data.owner),
                destinations: decision.options.map((o) => o.id),
              },
            ]
          : [];
      }
      return actions.some(
        (a) => a.command.type === "main" && a.command.action === "shift",
      )
        ? occupied(s, id, id)
            .map((from) => ({
              from,
              owner: id,
              destinations: emptySlotsForMoving(s, id, from),
            }))
            .filter((m) => m.destinations.length)
        : [];
    })(),
    cityDestinations: actions.some(
      (a) => a.command.type === "main" && a.command.action === "city",
    )
      ? cityOptions(s, id, {}).map((o) => ({
          target: o.target!,
          road: String(o.steps.find((v) => v.kind === "relocate")!.data!.road),
          optionId: o.id,
          label: o.label,
        }))
      : [],
    explorationTargets: actions.some(
      (a) => a.command.type === "main" && a.command.action === "explore",
    )
      ? exploreOptions(s, id).map((o) => ({
          target: o.target!,
          optionId: o.id,
          label: o.label,
        }))
      : [],
    deckCounts: {
      facility: facilityDeck.length,
      operatives: operativeDeck.length,
    },
  };
}
