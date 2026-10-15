import type { Facility, Reward, Role, BoardDef, Resource } from "./types.ts";
import { COMPLETE_RHINE_RULES } from "./original-labs.ts";
export const RULES_VERSION = "founders-2023.1";
/** Printed maps: four players open at 4, three at 5; two-player appendix p.23 overrides to 6. */
export function redZoneOpensAt(playerCount: number): number {
  return playerCount === 4 ? 4 : playerCount === 3 ? 5 : 6;
}
// Only components verified against the printed rulebook enter the playable pack.
export const VERIFIED_ENTERPRISES = [
  "rhodes",
  "heide",
  ...(COMPLETE_RHINE_RULES ? ["rhine"] : []),
  "bank",
  "raythean",
  "mama",
  "blacksteel",
  "rim",
];
export const RESOURCES: Resource[] = [
  "rock",
  "ore",
  "iron",
  "prime",
  "cash",
  "score",
];
export const BASIC: Resource[] = ["rock", "ore", "iron"];
export const RESOURCE_NAMES: Record<Resource, string> = {
  rock: "源岩",
  ore: "源石",
  iron: "异铁",
  prime: "至纯源石",
  cash: "金券",
  score: "分数",
};
export const PLAYER_COLORS = ["#db674d", "#66a89d", "#6e9fcd", "#d4b65b"];
export const PLAYER_SYMBOLS = ["◆", "●", "▲", "■"];
const facility = (
  id: string,
  name: string,
  color: Facility["color"],
  cost: Reward,
  cashCost: number,
  points: number,
  copies: number,
  index: number,
  effect: string,
  unique = false,
  expansion = false,
): Facility => ({
  id,
  name,
  color,
  cost,
  cashCost,
  points,
  copies,
  index,
  effect,
  unique,
  expansion,
  image: `/assets/cards-166/${index}.webp`,
});
export const FACILITIES: Facility[] = [
  facility(
    "administration",
    "城邦行政区",
    "wild",
    { rock: 3, ore: 3, iron: 3 },
    30,
    3,
    3,
    0,
    "none",
    true,
  ),
  facility(
    "energy",
    "附属能源设施",
    "wild",
    { rock: 2, ore: 2, iron: 3 },
    23,
    1,
    3,
    3,
    "copy-entry",
    true,
  ),
  facility(
    "federal",
    "联邦理事处",
    "wild",
    { rock: 4, ore: 2 },
    17,
    0,
    3,
    6,
    "first-player",
    true,
  ),
  facility(
    "camp",
    "简陋工程营",
    "blue",
    { rock: 2, ore: 1 },
    8,
    -1,
    2,
    9,
    "free-build",
  ),
  facility(
    "logistics",
    "物流枢纽",
    "blue",
    { prime: 1, cash: 2 },
    24,
    2,
    2,
    11,
    "extend",
    true,
  ),
  facility(
    "refinery-blue",
    "源石精炼厂",
    "blue",
    { rock: 1, ore: 1, iron: 1 },
    10,
    0,
    1,
    13,
    "ore6",
  ),
  facility(
    "urban",
    "城市化区域",
    "blue",
    { rock: 3, iron: 2 },
    16,
    1,
    3,
    14,
    "adjacent-cash",
  ),
  facility(
    "smelter-blue",
    "异铁冶炼厂",
    "blue",
    { rock: 2, ore: 2, iron: 1 },
    15,
    1,
    1,
    17,
    "iron4",
  ),
  facility(
    "trade",
    "贸易街区",
    "blue",
    { rock: 1, iron: 1 },
    6,
    0,
    3,
    18,
    "trade",
  ),
  facility("extension-blue", "延伸枢纽", "blue", {}, 0, -1, 1, 21, "none"),
  facility("extension-yellow", "延伸枢纽", "yellow", {}, 0, -1, 1, 32, "none"),
  facility("extension-red", "延伸枢纽", "red", {}, 0, -1, 1, 43, "none"),
  facility(
    "industrial",
    "城邦工业区",
    "yellow",
    { rock: 4, ore: 3, cash: 2 },
    24,
    2,
    3,
    22,
    "none",
  ),
  facility(
    "power",
    "高性能动力设施",
    "yellow",
    { ore: 4, iron: 2 },
    20,
    0,
    2,
    25,
    "free-move",
  ),
  facility(
    "quarry-yellow",
    "固源岩提纯厂",
    "yellow",
    { rock: 1, ore: 1, iron: 1 },
    10,
    0,
    1,
    27,
    "rock7",
  ),
  facility(
    "refinery-yellow",
    "源石精炼厂",
    "yellow",
    { rock: 1, ore: 1, iron: 1 },
    10,
    0,
    1,
    28,
    "ore6",
  ),
  facility(
    "excavator",
    "开采电铲",
    "yellow",
    { ore: 2, iron: 1 },
    10,
    0,
    3,
    29,
    "basic5",
  ),
  facility(
    "smelter-red",
    "异铁冶炼厂",
    "red",
    { rock: 2, ore: 2, iron: 1 },
    15,
    1,
    1,
    33,
    "iron4",
  ),
  facility(
    "quarry-red",
    "固源岩提纯厂",
    "red",
    { rock: 1, ore: 1, iron: 1 },
    10,
    0,
    1,
    34,
    "rock7",
  ),
  facility(
    "mercenary",
    "佣兵指挥部",
    "red",
    { rock: 2, iron: 2, cash: 4 },
    18,
    1,
    3,
    35,
    "replace-place",
  ),
  facility(
    "escort",
    "护航调度中心",
    "red",
    { rock: 2, ore: 2, iron: 2 },
    18,
    0,
    2,
    38,
    "place2",
  ),
  facility(
    "garage",
    "载具仓库",
    "red",
    { rock: 1, ore: 2 },
    9,
    0,
    3,
    40,
    "remove-move-explore",
  ),
  facility("core", "核心指挥塔", "wild", {}, 0, 0, 4, 44, "none", true),
  facility(
    "office-red",
    "企业办事处",
    "red",
    { rock: 3, ore: 1, iron: 3 },
    23,
    1,
    1,
    48,
    "enterprise",
    false,
    true,
  ),
  facility(
    "office-blue",
    "企业办事处",
    "blue",
    { rock: 3, ore: 1, iron: 3 },
    23,
    1,
    1,
    49,
    "enterprise",
    false,
    true,
  ),
  facility(
    "office-yellow",
    "企业办事处",
    "yellow",
    { rock: 3, ore: 1, iron: 3 },
    23,
    1,
    1,
    50,
    "enterprise",
    false,
    true,
  ),
];
export const FACILITY_BY_ID = Object.fromEntries(
  FACILITIES.map((f) => [f.id, f]),
);
export const FACILITY_EFFECT_TEXT: Record<string, string> = {
  none: "没有入场效果。",
  rock7: "入场：获得 7 源岩。",
  ore6: "入场：获得 6 源石。",
  iron4: "入场：获得 4 异铁。",
  basic5: "入场：获得合计 5 个基础资源，种类自行分配。",
  place2: "入场：放置两次自己的影响力。",
  "replace-place": "入场：替换一个影响力，再放置一个自己的影响力。",
  "first-player": "入场：获得起始玩家标记，在下回合成为起始玩家。",
  "free-build": "入场：从设施供应区免费建设一张设施，并结算其入场效果。",
  extend:
    "入场：可选择余下的蓝、黄、红色延伸枢纽之一，建在城市空格，失去 1 分。",
  "adjacent-cash": "入场：每个十字相邻的非彩色设施带来 4 金券。",
  "copy-entry": "入场：选择一个十字相邻的非彩色设施，结算其入场效果。",
  trade: "入场：可任意出售资源，基础资源每个 1 金券，至纯源石每个 15 金券。",
  "free-move": "入场：免费移动城市，并在经过的航道放置一个自己的影响力。",
  "remove-move-explore":
    "入场：移除一个影响力并移动一次自己的影响力，或执行一次探索。",
  enterprise: "入场：选择一家合作企业，触发其中一个已解锁特效。",
};
export function facilityText(id: string): string {
  const card = FACILITY_BY_ID[id];
  return [
    FACILITY_EFFECT_TEXT[card.effect],
    id === "industrial"
      ? "资源支付时，城市里每种非彩色设施颜色降低 1 源岩费用；红、黄、蓝各计算一次，最多降低 3 源岩。"
      : "",
    id.startsWith("extension-") ? "只能通过物流枢纽的入场效果建设。" : "",
    card.unique ? "唯一：同名设施在自己的城市内只能建设一张。" : "",
  ]
    .filter(Boolean)
    .join("\n");
}
export const ENTERPRISE_TEXT: Record<string, string> = {
  rhine:
    "1 级解锁特效：切换为另一科室，获得与自己当前合作等级对应的科室奖励。\n2–5 级升级奖励：按全体玩家当前共用的激活科室，结算到达等级的奖励。\n切换科室只给操作者奖励，其他玩家后续升级按新科室结算。",
  rhodes:
    "1 级：提升另一家企业一级。\n2 级：在航道放置一个影响力，按自己在全部航道的影响力数量获得金券。\n3、5 级升级奖励：抽取干员并选择招募或得 1 分；两人局抽 3 张，其余抽 2 张。\n4 级：收回一张弃牌，弃置其余手牌，获得 10 金券。",
  heide:
    "1 级：获得 4 源岩。\n2 级：可支付 2 源岩，获得 15 金券。\n3 级升级奖励：1 分。\n4 级：可支付 6 源岩，洗回全部供应设施并重抽，再从新的供应区免费建设一张。\n5 级升级奖励：2 分。",
  bank: "1 级：获得 8 金券。\n3 级：获得 20 金券，其他玩家各获得 4 金券。\n4 级：自己获得 1 分，选择一名对手失去 1 分。\n5 级升级奖励：3 分。",
  raythean:
    "1 级：获得 3 源石。\n2、4 级升级奖励：各 1 分。\n3 级：可支付 2 源石，执行一次付费建设。\n5 级：从设施牌堆选择并付费建设一张设施，然后洗牌。",
  mama: "2 级：可失去 1 分，获得 20 金券。\n3 级：获得 1 分。\n4 级：可支付 25 金券，获得 3 分。\n5 级升级奖励：3 分。",
  blacksteel:
    "1 级：移除或放置一个影响力。\n2 级：移动两次自己的影响力。\n3、5 级升级奖励：各 1 分。\n4 级：依次执行两次移除或放置影响力。",
  rim: "1 级：获得各一种基础资源。\n2 级：可支付 4 金券，替换资源点的一个影响力。\n3 级升级奖励：1 分。\n4 级：可失去 1 分，立即执行一次采集并按当前局面支付路费。\n5 级升级奖励：2 分。",
};
export const BASE_ROLES: Role[] = [
  {
    id: "liskarm",
    name: "雷蛇",
    image: "/assets/role-1231.webp",
    strategy: "放置两次影响力；收尾移除一个自己的影响力。",
    tactic: "支付 3 金券，替换一个影响力。",
  },
  {
    id: "elysium",
    name: "极境",
    image: "/assets/role-1271.webp",
    strategy: "获得 4 个持有数量最少的基础资源。",
    tactic: "支付 3 源石，免费移动到相邻且有自己影响力的资源点。",
  },
  {
    id: "texas",
    name: "德克萨斯",
    image: "/assets/role-1232.webp",
    strategy: "获得 12 金券，将一张市场设施放到牌堆底。",
    tactic: "支付 3 金券，移除一个影响力，再移动两次自己的影响力。",
  },
  {
    id: "cannott",
    name: "坎诺特",
    image: "/assets/role-1272.webp",
    strategy: "自选数量出售资源：源岩/源石 3，异铁 4，至纯源石 15 金券。",
    tactic:
      "选择基础资源种类，所有玩家以 2 金券单价出售全部该资源；获得 1 分。",
  },
  {
    id: "tinman",
    name: "锡人",
    image: "/assets/role-1273.webp",
    strategy: "获得 1 分；可依次支付 12 和 15 金券各获得 1 至纯源石。",
    tactic: "收回全部弃牌，每张选择 5 金券或移动一个自己的影响力。",
  },
  {
    id: "mountain",
    name: "山",
    image: "/assets/role-1306.webp",
    strategy:
      "移除一条航道的全部影响力，改为公路；被移除影响力的玩家各得 1 分，你得 1 分。",
    tactic: "支付 2 金券，提升并触发同一家企业。",
    expansion: true,
  },
  {
    id: "mlynar",
    name: "玛恩纳",
    image: "/assets/role-1307.webp",
    strategy: "所有玩家提升同一家企业；触发一家企业。",
    tactic: "提升一家企业；获得 1 源岩、1 源石、1 异铁。",
    expansion: true,
  },
];
export const OPERATIVES: Role[] = [
  {
    id: "w",
    name: "W",
    image: "/assets/operatives/w.webp",
    strategy: "放置三次影响力；收尾移除两个自己的影响力。",
    tactic: "支付 4 金券，移除两名不同对手各一个影响力；一次性。",
    operative: true,
  },
  {
    id: "kaltsit",
    name: "凯尔希",
    image: "/assets/operatives/kaltsit.webp",
    strategy: "提升同一家企业两级，获得 1 分。",
    tactic: "选择一家企业，按自选顺序触发其已解锁的全部特效；一次性。",
    operative: true,
  },
  {
    id: "closure",
    name: "可露希尔",
    image: "/assets/operatives/closure.webp",
    strategy: "获得 1 源岩、1 源石、1 异铁；提升一家企业。",
    tactic: "取走市场两种不同设施保留，之后可支付费用建设；持续。",
    operative: true,
  },
  {
    id: "dorothy",
    name: "多萝西",
    image: "/assets/operatives/dorothy.webp",
    strategy: "移除自己两次影响力，放置三次影响力。",
    tactic:
      "可放至多 4 个标记；自己的影响力被移除或替换时可存入标记，收尾支付两个标记放置一次影响力；持续。",
    operative: true,
  },
  {
    id: "silverash",
    name: "银灰",
    image: "/assets/operatives/silverash.webp",
    strategy:
      "选择资源种类和玩家，令其以 4 金券单价售出全部该资源；获得 1 分。",
    tactic: "移动每位玩家一个影响力；一次性。",
    operative: true,
  },
  {
    id: "mudrock",
    name: "泥岩",
    image: "/assets/operatives/mudrock.webp",
    strategy: "支付 1 源岩，放置两次影响力。",
    tactic: "每次收尾可支付 2 源岩，放置一次影响力；持续。",
    operative: true,
  },
  {
    id: "passenger",
    name: "异客",
    image: "/assets/operatives/passenger.webp",
    strategy: "选择对手和基础资源，取走至多 4 个该资源；你和对手各获得 1 分。",
    tactic:
      "可放至多 5 个标记，每次资源支付可使用至多两个标记代替基础资源；持续。",
    operative: true,
  },
  {
    id: "eunectes",
    name: "森蚺",
    image: "/assets/operatives/eunectes.webp",
    strategy: "免费移动城市；移动每位对手一个影响力。",
    tactic: "移除市场两种不同设施，获得 3 异铁。",
    operative: true,
  },
];
export const ROLES = [...BASE_ROLES, ...OPERATIVES];
export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));
export const ENTERPRISES = [
  "rhodes",
  "heide",
  "rhine",
  "bank",
  "raythean",
  "mama",
  "blacksteel",
  "rim",
] as const;
export const ENTERPRISE_NAMES: Record<string, string> = {
  rhodes: "罗德岛",
  heide: "海德兄弟",
  rhine: "莱茵生命",
  bank: "富森银行",
  raythean: "雷神工业",
  mama: "约翰老妈",
  blacksteel: "黑钢国际",
  rim: "雷姆必拓",
};
export const ENTERPRISE_IMAGES = Object.fromEntries(
  ENTERPRISES.map((id, i) => [id, `/assets/cards-625/${i}.webp`]),
);
export type Pattern = {
  id: string;
  name: string;
  score: number;
  level: 1 | 2;
  expansion?: boolean;
  image: string;
  shape: [number, number, string][];
  effect: string;
  description: string;
};
export const PATTERNS: Pattern[] = [
  {
    id: "military",
    name: "军工化区域",
    score: 2,
    level: 1,
    image: "/assets/cards-165/0.webp",
    shape: [
      [0, 0, "blue|yellow"],
      [0, 1, "red"],
    ],
    effect: "military",
    description: "放置该样式标记数量的影响力，最多 3 个。",
  },
  {
    id: "mobilize",
    name: "动员配套体系",
    score: 3,
    level: 1,
    image: "/assets/cards-165/1.webp",
    shape: [
      [0, 0, "yellow"],
      [0, 1, "yellow"],
      [0, 2, "red"],
    ],
    effect: "mobilize",
    description: "放置一个影响力。",
  },
  {
    id: "composite",
    name: "复合动力系统",
    score: 3,
    level: 1,
    image: "/assets/cards-165/2.webp",
    shape: [
      [0, 0, "yellow"],
      [1, 0, "red"],
      [1, 1, "yellow"],
    ],
    effect: "composite",
    description:
      "支付 1 源石及合计 3 源岩/异铁，免费移动城市并在经过的航道放置一个影响力。",
  },
  {
    id: "relay",
    name: "物资中继站",
    score: 2,
    level: 1,
    image: "/assets/cards-165/8.webp",
    shape: [
      [0, 0, "blue|red"],
      [0, 1, "yellow"],
    ],
    effect: "relay",
    description: "宣告时获得各一种基础资源。",
  },
  {
    id: "city-expansion",
    name: "城建开拓区",
    score: 5,
    level: 1,
    expansion: true,
    image: "/assets/cards-165/4.webp",
    shape: [
      [0, 1, "yellow"],
      [1, 0, "blue"],
      [1, 1, "blue"],
      [1, 2, "red"],
    ],
    effect: "city-expansion",
    description: "失去 1 分，从牌堆选择并付费建造一张设施，之后洗牌。",
  },
  {
    id: "outpost",
    name: "拓荒者据点",
    score: 2,
    level: 1,
    expansion: true,
    image: "/assets/cards-165/5.webp",
    shape: [
      [0, 1, "yellow"],
      [1, 0, "blue"],
    ],
    effect: "outpost",
    description:
      "在自己城市的资源点放置两次影响力；移动该样式标记数量的影响力。",
  },
  {
    id: "commercial",
    name: "核心商业区",
    score: 3,
    level: 1,
    expansion: true,
    image: "/assets/cards-165/6.webp",
    shape: [
      [0, 0, "blue"],
      [0, 1, "blue"],
      [0, 2, "red"],
    ],
    effect: "commercial",
    description: "自选 4 金券或一种基础资源，然后执行一次其他主要行动。",
  },
  {
    id: "enterprise-park",
    name: "大型企业园",
    score: 3,
    level: 1,
    expansion: true,
    image: "/assets/cards-165/7.webp",
    shape: [
      [0, 0, "blue"],
      [1, 0, "red"],
      [1, 1, "blue"],
    ],
    effect: "enterprise-park",
    description: "提升同一家企业两级。",
  },
  {
    id: "industrial-core",
    name: "源石工业中枢",
    score: 6,
    level: 2,
    image: "/assets/cards-640/0.webp",
    shape: [
      [0, 0, "blue"],
      [1, 0, "red"],
      [1, 1, "blue"],
      [2, 0, "yellow"],
      [2, 1, "yellow"],
      [2, 2, "red"],
    ],
    effect: "industrial-core",
    description: "本轮禁用角色；支付 6 金券，额外执行两次主要行动。",
  },
  {
    id: "efficient",
    name: "高效移动管理体系",
    score: 7,
    level: 2,
    image: "/assets/cards-640/1.webp",
    shape: [
      [0, 0, "yellow"],
      [1, 0, "red"],
      [1, 1, "yellow"],
      [2, 0, "blue"],
      [2, 1, "blue"],
      [2, 2, "red"],
    ],
    effect: "efficient",
    description: "本轮禁用角色；支付 3 源石，连续执行两次免费城市移动。",
  },
  {
    id: "command-center",
    name: "拓荒指挥中枢",
    score: 7,
    level: 2,
    expansion: true,
    image: "/assets/cards-640/3.webp",
    shape: [
      [0, 0, "yellow"],
      [1, 0, "red"],
      [1, 1, "yellow"],
      [2, 0, "blue"],
      [2, 1, "blue"],
      [2, 2, "red"],
    ],
    effect: "command-center",
    description: "额外执行一次非特殊主要行动，本轮可连续使用角色的策略与计谋。",
  },
  {
    id: "security",
    name: "警备队辖区",
    score: 6,
    level: 2,
    expansion: true,
    image: "/assets/cards-640/2.webp",
    shape: [
      [0, 0, "blue"],
      [1, 0, "red"],
      [1, 1, "blue"],
      [2, 0, "yellow"],
      [2, 1, "yellow"],
      [2, 2, "red"],
    ],
    effect: "security",
    description:
      "本轮禁用角色；依次执行两次支付 2 源岩及 1 异铁替换、放置获源石、移除获异铁中的行动。",
  },
];
export const PATTERN_BY_ID = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));
export type EventOption = {
  label: string;
  gain?: Reward;
  cost?: Reward;
  effect?: string;
  others?: Reward;
};
export type EventCard = {
  id: string;
  name: string;
  tier: string;
  resource: Resource;
  amount: number;
  fourOnly?: boolean;
  image: string;
  options: EventOption[];
};
const ev = (
  tier: string,
  index: number,
  name: string,
  resource: Resource,
  amount: number,
  options: EventOption[],
  fourOnly = false,
): EventCard => ({
  id: `${tier}-${index}`,
  name,
  tier,
  resource,
  amount,
  options,
  fourOnly,
  image: `/assets/cards-${tier === "green" ? "154" : tier === "yellow" ? "167" : "156"}/${index}.webp`,
});
export const EVENTS: EventCard[] = [
  ev("green", 0, "中立采石场", "rock", 1, [
    { label: "获得 3 源石", gain: { ore: 3 } },
    { label: "获得 2 异铁、2 金券", gain: { iron: 2, cash: 2 } },
  ]),
  ev("green", 1, "清理虫巢", "iron", 1, [
    { label: "获得 7 金券", gain: { cash: 7 } },
    { label: "获得 3 源石", gain: { ore: 3 } },
  ]),
  ev("green", 2, "外露矿床", "ore", 1, [
    { label: "获得 4 源岩", gain: { rock: 4 } },
    { label: "获得 3 源石", gain: { ore: 3 } },
  ]),
  ev("green", 3, "富饶岩层", "rock", 1, [
    { label: "获得 4 源岩", gain: { rock: 4 } },
    { label: "获得 3 源石", gain: { ore: 3 } },
  ]),
  ev("green", 4, "矿业聚落", "ore", 1, [
    { label: "获得 3 源石", gain: { ore: 3 } },
    { label: "获得 7 金券", gain: { cash: 7 } },
  ]),
  ev(
    "green",
    5,
    "废弃矿坑",
    "ore",
    1,
    [
      { label: "获得 2 异铁、2 金券", gain: { iron: 2, cash: 2 } },
      { label: "获得 4 源岩", gain: { rock: 4 } },
    ],
    true,
  ),
  ev("yellow", 0, "大型源岩场", "rock", 1, [
    { label: "获得 5 源岩", gain: { rock: 5 } },
    { label: "获得 4 金券、1 分", gain: { cash: 4, score: 1 } },
  ]),
  ev("yellow", 1, "洞穴遗迹", "rock", 1, [
    { label: "获得 5 源岩", gain: { rock: 5 } },
    { label: "获得 10 金券", gain: { cash: 10 } },
  ]),
  ev("yellow", 2, "荒地人村落", "rock", 1, [
    { label: "获得 3 源岩、1 异铁", gain: { rock: 3, iron: 1 } },
    { label: "获得 4 源石", gain: { ore: 4 } },
  ]),
  ev("yellow", 3, "锈锤领地", "ore", 1, [
    { label: "支付 4 金券，移除影响力", cost: { cash: 4 }, effect: "remove" },
    { label: "获得 10 金券", gain: { cash: 10 } },
    { label: "获得 4 源石", gain: { ore: 4 } },
  ]),
  ev(
    "yellow",
    4,
    "情报交换",
    "ore",
    1,
    [
      { label: "在本点或相邻航道放置影响力", effect: "local-place" },
      { label: "获得 1 源岩、3 源石", gain: { rock: 1, ore: 3 } },
      { label: "获得 3 异铁", gain: { iron: 3 } },
    ],
    true,
  ),
  ev("yellow", 5, "风险任务", "ore", 1, [
    { label: "获得 3 异铁", gain: { iron: 3 } },
    { label: "获得 4 源石", gain: { ore: 4 } },
  ]),
  ev("yellow", 6, "异铁开采权", "iron", 1, [
    { label: "获得 1 异铁、3 源岩", gain: { iron: 1, rock: 3 } },
    {
      label: "获得 13 金券，对手各得 1 异铁",
      gain: { cash: 13 },
      others: { iron: 1 },
    },
  ]),
  ev(
    "yellow",
    7,
    "敌对生态圈",
    "iron",
    1,
    [
      { label: "获得 3 异铁", gain: { iron: 3 } },
      { label: "获得 2 源岩、1 分", gain: { rock: 2, score: 1 } },
    ],
    true,
  ),
  ev("yellow", 8, "富异铁区", "iron", 1, [
    { label: "获得 3 异铁", gain: { iron: 3 } },
    { label: "获得 2 源石、5 金券", gain: { ore: 2, cash: 5 } },
  ]),
  ev("yellow", 9, "遗弃矿场", "ore", 1, [
    { label: "获得 3 异铁", gain: { iron: 3 } },
    { label: "获得 4 源石", gain: { ore: 4 } },
  ]),
  ev("red", 0, "险中净土", "rock", 2, [
    { label: "获得 6 源石", gain: { ore: 6 } },
    { label: "获得 7 源岩", gain: { rock: 7 } },
    {
      label: "获得 6 金券并放置影响力",
      gain: { cash: 6 },
      effect: "local-place",
    },
  ]),
  ev("red", 1, "裂谷矿脉", "prime", 1, [
    { label: "获得 1 异铁、1 至纯源石", gain: { iron: 1, prime: 1 } },
    { label: "获得 3 源岩、3 源石", gain: { rock: 3, ore: 3 } },
  ]),
  ev("red", 2, "采集平台残骸", "iron", 1, [
    { label: "获得 4 异铁、5 金券", gain: { iron: 4, cash: 5 } },
    { label: "获得 4 源岩、3 源石", gain: { rock: 4, ore: 3 } },
  ]),
  ev("red", 3, "高污染环境", "rock", 2, [
    { label: "获得各 2 个基础资源", gain: { rock: 2, ore: 2, iron: 2 } },
    { label: "获得 18 金券", gain: { cash: 18 } },
    { label: "获得 1 至纯源石、4 金券", gain: { prime: 1, cash: 4 } },
  ]),
  ev(
    "red",
    4,
    "深层矿床",
    "prime",
    1,
    [
      { label: "获得 1 至纯源石、1 源岩", gain: { prime: 1, rock: 1 } },
      { label: "获得 3 源石、2 异铁", gain: { ore: 3, iron: 2 } },
      {
        label: "获得 18 金券，对手各得 3 金券",
        gain: { cash: 18 },
        others: { cash: 3 },
      },
    ],
    true,
  ),
  ev("red", 5, "地质瑰宝", "prime", 1, [
    { label: "获得 1 源石、1 至纯源石", gain: { ore: 1, prime: 1 } },
    { label: "获得 3 源岩、3 异铁", gain: { rock: 3, iron: 3 } },
  ]),
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
const nodeRows: [string, string, number, number][] = [
  ["A-01", "green", 835, 245],
  ["A-02", "green", 831, 447],
  ["A-03", "yellow", 691, 478],
  ["B-01", "green", 908, 644],
  ["B-02", "green", 804, 743],
  ["B-03", "yellow", 658, 677],
  ["C-01", "green", 803, 904],
  ["C-02", "yellow", 446, 826],
  ["C-03", "yellow", 137, 784],
  ["D-01", "yellow", 685, 347],
  ["D-02", "yellow", 558, 296],
  ["D-03", "yellow", 569, 489],
  ["E-01", "yellow", 545, 744],
  ["E-02", "red", 338, 683],
  ["E-03", "red", 196, 592],
  ["F-01", "red", 336, 337],
  ["F-02", "red", 391, 525],
  ["F-03", "red", 180, 399],
  ["G-01", "green", 735, 144],
  ["G-02", "yellow", 488, 163],
  ["G-03", "yellow", 146, 115],
  ["G-04", "red", 317, 230],
];
const roadRows: [string, string[], number, number, number][] = [
  ["G-1", ["G-03", "G-02"], 320, 101, 1],
  ["G-2", ["G-03", "G-04"], 181, 244, 1],
  ["F-1", ["G-04", "F-01", "F-03"], 194, 312, 2],
  ["F-2", ["F-01", "D-02"], 439, 303, 1],
  ["F-3", ["F-01", "F-02"], 323, 443, 1],
  ["D-1", ["F-02", "D-02", "D-03"], 465, 433, 2],
  ["D-2", ["D-02", "D-01", "D-03", "A-03"], 587, 386, 2],
  ["A-1", ["A-01", "A-02"], 813, 352, 1],
  ["A-2", ["A-02", "A-03", "B-03"], 709, 588, 2],
  ["B-1", ["A-02", "B-02"], 776, 626, 1],
  ["B-2", ["B-01", "B-02", "C-01"], 887, 834, 2],
  ["C-1", ["C-03", "C-02"], 303, 823, 1],
  ["C-2", ["C-01", "C-02", "B-02", "B-03"], 667, 822, 2],
  ["E-1", ["C-03", "E-02", "E-03"], 205, 693, 2],
  ["E-2", ["E-02", "E-01", "F-02"], 456, 666, 2],
  ["R-1", ["G-02", "G-01", "A-01", "D-01"], 686, 241, 2],
  ["R-2", ["G-01", "A-01", "B-01"], 920, 354, 2],
  ["R-3", ["A-02", "B-01"], 875, 545, 1],
  ["R-4", ["D-03", "B-03", "E-01"], 571, 597, 2],
  ["R-5", ["F-02", "E-03"], 285, 541, 1],
  ["R-6", ["F-03", "E-03"], 174, 499, 1],
  ["R-7", ["G-03", "C-03"], 91, 445, 1],
];
const threePos: Record<string, [number, number]> = {
  "A-01": [897, 225],
  "A-02": [875, 445],
  "A-03": [706, 385],
  "B-01": [912, 674],
  "B-02": [780, 743],
  "B-03": [663, 662],
  "C-01": [770, 912],
  "C-02": [490, 863],
  "C-03": [195, 870],
  "D-01": [669, 215],
  "D-02": [487, 228],
  "D-03": [500, 457],
  "E-01": [489, 674],
  "E-02": [253, 695],
  "E-03": [111, 618],
  "F-01": [282, 260],
  "F-02": [307, 465],
  "F-03": [113, 409],
};
const threeRoads: [string, string[], number, number, number][] = [
  ["F-1", ["F-01", "F-03"], 178, 315, 1],
  ["F-2", ["F-01", "D-02"], 379, 231, 1],
  ["F-3", ["F-01", "F-02"], 302, 366, 1],
  ["D-1", ["F-02", "D-02", "D-03"], 396, 351, 2],
  ["D-2", ["D-02", "D-01", "D-03", "A-03"], 595, 281, 2],
  ["A-1", ["A-01", "A-02"], 872, 345, 1],
  ["A-2", ["A-02", "A-03", "B-03"], 726, 500, 2],
  ["B-1", ["A-02", "B-02"], 790, 614, 1],
  ["B-2", ["B-01", "B-02", "C-01"], 869, 867, 2],
  ["C-1", ["C-03", "C-02"], 349, 909, 1],
  ["C-2", ["C-01", "C-02", "B-02", "B-03"], 650, 819, 2],
  ["E-1", ["C-03", "E-02", "E-03"], 149, 776, 2],
  ["E-2", ["E-02", "E-01", "F-02"], 313, 576, 2],
  ["R-1", ["D-01", "A-01"], 786, 191, 1],
  ["R-2", ["A-01", "B-01"], 926, 370, 1],
  ["R-3", ["A-02", "B-01"], 892, 547, 1],
  ["R-4", ["D-03", "B-03", "E-01"], 552, 566, 2],
  ["R-5", ["F-02", "F-03", "E-03"], 106, 520, 2],
  ["R-6", ["E-01", "C-03"], 349, 779, 1],
  ["R-7", ["E-01", "C-02"], 503, 767, 1],
];
export function boardFor(count: number): BoardDef {
  const four = count === 4;
  return {
    image: `/assets/board-${four ? 4 : 3}.webp`,
    nodes: nodeRows
      .filter(([id]) => four || !id.startsWith("G"))
      .map(([id, tier, x, y]) => ({
        id,
        region: id[0],
        tier: tier as "green" | "yellow" | "red",
        x: four ? x : threePos[id][0],
        y: four ? y : threePos[id][1],
        slots: 2,
      })),
    roads: (four ? roadRows : threeRoads).map(([id, nodes, x, y, slots]) => ({
      id,
      region: id[0],
      nodes,
      x,
      y,
      slots,
    })),
  };
}
