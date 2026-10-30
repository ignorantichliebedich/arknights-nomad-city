import type { Facility, Role } from "./types.ts";
import type { Pattern } from "./data.ts";

/** Official rulebook dated 2024-11-11, printed pp. 2–10. */
export const ORIPATHY_RULES_VERSION = "oripathy-2024.1111";
export const SECURITY_PLAYER_ID = "@stonehoove";
export const oripathyArt = (face: string) => `/assets/oripathy/${face}.webp`;
export const ORIPATHY_ENTERPRISE_TEXT: Record<string, string> = {
  rhodes:
    "1 级：提升另一家企业一级。\n2 级：在航道放置一个影响力，按自己在全部航道的影响力数量获得金券。\n3 级：收回一张弃牌，弃置其余手牌，获得 10 金券。\n4 级升级奖励：从干员牌堆直接选择一张干员进行特派。\n5 级升级奖励：获得 2 分。",
  stonehoove:
    "1 级：移除一个影响力；之后选择放置一个安保影响力，或移动两次安保影响力。\n2 级：放置两个安保影响力；可移除一个自己的影响力，提升本企业一级。\n3 级升级奖励：获得 1 分。\n4 级：放置一个自己的影响力，之后移动一个安保影响力。\n5 级升级奖励：获得 1 至纯源石，放置一个安保影响力，并从剩余供应中获得终身安保合约。",
  maylander:
    "1 级：获得 4 金券与合计两个基础资源。\n2 级：进行探索，之后移除一个自己的影响力。\n3 级：可支付 4 异铁，获得 2 分。\n4 级：从剩余授勋牌中选择一张并获得其奖励。\n5 级升级奖励：获得 2 分。",
};
export function oripathyEnterpriseImage(company: string): string | undefined {
  const face = (
    { rhodes: "1072", stonehoove: "1191", maylander: "1192" } as Record<
      string,
      string
    >
  )[company];
  return face ? oripathyArt(face) : undefined;
}
const role = (
  id: string,
  name: string,
  face: string,
  strategy: string,
  tactic: string,
  operative = true,
): Role => ({
  id,
  name,
  image: oripathyArt(face),
  strategy,
  tactic,
  operative,
  oripathy: true,
});
export const AMIYA = role(
  "o-amiya",
  "阿米娅",
  "1291",
  "干员特派：抽取三张干员，选择一张并公开退役一张手牌或弃牌；也可放弃招募获得 1 分。",
  "合作协议：持续；下次使用角色时弃置本牌，按自选顺序连续使用其策略和计谋。",
  false,
);
export const ORIPATHY_OPERATIVES: Role[] = [
  role(
    "o-silence",
    "淬羽赫默",
    "1321",
    "执行一张场上Ⅱ级样式的特殊行动，无需宣告，不移动其标记；与宣告数量有关的效果仍按实际数量计算。",
    "获得 1 分；锁定移动城市所在区块，所有玩家不能在其中放置影响力；下一个行动轮移除锁定。",
  ),
  role(
    "o-ceobe",
    "刻俄柏",
    "1324",
    "支付 1 源石，额外执行一次非特殊主要行动。",
    "掷骰：1–2 移除一次、放置两次；3–4 获得 2 至纯源石；5–6 执行一次主要行动，随后把刻俄柏交给一位对手。",
  ),
  role(
    "o-swire",
    "诗怀雅",
    "1319",
    "触发两个不同的 1–2 级企业特效。",
    "选择至多两位对手各放一个玩家标记；每次收尾移除一个，获得 6 金券，选择一家企业，与标记所有者各提升一次合作等级。",
  ),
  role(
    "o-hellagur",
    "赫拉格",
    "1322",
    "依次三次选择放置或移除一次影响力；收尾移除自己的两个影响力。",
    "可先弃置一张手牌；从手牌或弃牌中秘密盖放一个角色，本轮不能使用。",
  ),
  role(
    "o-gavial",
    "百炼嘉维尔",
    "1323",
    "免费移动到一个已探索且未停泊其他城市的资源点；若移除了对手影响力，额外放置一次影响力。",
    "在任意资源点放置嘉维尔；每次收尾转移到相邻资源点，并移动该点一个影响力，由你执行。",
  ),
  role(
    "o-lin",
    "林",
    "1320",
    "至多交易十个资源：源岩／源石／异铁／至纯源石售价 3／4／5／15；购入单价分别少 2 金券。",
    "放置至多两个玩家标记；每次收尾可移除一个，从持有至少 20 金券的对手处取走 10 金券。",
  ),
  role(
    "o-jessica",
    "涤火杰西卡",
    "1318",
    "选择一名对手，触发其一个已解锁的企业特效。",
    "失去 2 分，免费建设并将本牌抵押在设施下；以后收尾可支付设施金券价加 2，获得 2 分并收回本牌至弃牌。",
  ),
  role(
    "o-muelsyse",
    "缪尔赛思",
    "1206",
    "放置并移动一次影响力；本回合收尾再放置并移动一次。",
    "取得三张流形，分别加入手牌或弃牌；盖放阶段可额外盖放一张流形，未使用的流形在采集开始时收回。",
  ),
];
export const FLOW_ROLES: Role[] = [
  role(
    "o-flow-a",
    "流形甲",
    "1089",
    "移动两次影响力。",
    "放置一次影响力，随后将本牌放回游戏盒。",
    false,
  ),
  role(
    "o-flow-b",
    "流形乙",
    "1090",
    "将供应区至多两张名称不同的设施放到牌堆底。",
    "触发一个 1–2 级企业特效，随后将本牌放回游戏盒。",
    false,
  ),
  role(
    "o-flow-c",
    "流形丙",
    "1091",
    "执行两次：选择获得 1 源岩、1 源石、1 异铁或 4 金券。",
    "选择一家企业提升两次合作等级，随后将本牌放回游戏盒。",
    false,
  ),
];
const facility = (
  id: string,
  name: string,
  color: Facility["color"],
  face: string,
  cost: Facility["cost"],
  cashCost: number,
  points: number,
  copies: number,
  effect: string,
  unique = false,
): Facility => ({
  id,
  name,
  color,
  cost,
  cashCost,
  points,
  copies,
  effect,
  unique,
  image: oripathyArt(face),
  index: -1,
  expansion: true,
  oripathy: true,
});
export const ORIPATHY_FACILITIES: Facility[] = [
  ...(["red", "blue", "yellow"] as const).map((color, i) =>
    facility(
      `o-rhodes-${color}`,
      "罗德岛办事处",
      color,
      String(1394 + i),
      { rock: 1, ore: 1, iron: 2 },
      14,
      0,
      1,
      "o-rhodes-office",
      true,
    ),
  ),
  facility(
    "o-settlement",
    "临时聚居点",
    "wild",
    "1158",
    { ore: 1, iron: 2 },
    11,
    0,
    3,
    "o-settlement",
    true,
  ),
  facility(
    "o-urban-red",
    "城市化区域",
    "red",
    "1156",
    { rock: 2, ore: 1, iron: 1 },
    13,
    0,
    3,
    "o-urban-place",
  ),
  facility(
    "o-urban-yellow",
    "城市化区域",
    "yellow",
    "1157",
    { rock: 1, ore: 2, iron: 4 },
    24,
    1,
    3,
    "o-urban-score",
  ),
  facility(
    "o-urban-blue",
    "城市化区域",
    "blue",
    "1154",
    { rock: 2, ore: 2, iron: 2 },
    20,
    1,
    3,
    "o-urban-cash",
  ),
];
export const ORIPATHY_PATTERNS: Pattern[] = [
  {
    id: "o-emerging",
    name: "新兴建筑群",
    score: 4,
    level: 1,
    expansion: true,
    oripathy: true,
    image: oripathyArt("1188"),
    shape: [
      [0, 1, "blue|red"],
      [1, 0, "yellow"],
      [1, 1, "yellow"],
      [1, 2, "red"],
    ],
    effect: "o-emerging",
    description: "宣告后立即建设；只能选择非彩色设施，且必须建在空位上。",
  },
  {
    id: "o-management",
    name: "城区管理中心",
    score: 3,
    level: 1,
    expansion: true,
    oripathy: true,
    image: oripathyArt("1189"),
    shape: [
      [0, 0, "blue"],
      [1, 0, "yellow"],
      [1, 1, "red"],
    ],
    effect: "o-management",
    description: "宣告后收回一个Ⅱ级样式上的玩家标记，获得 1 至纯源石。",
  },
  {
    id: "o-offices",
    name: "综合企业办公区",
    score: 6,
    level: 2,
    expansion: true,
    oripathy: true,
    image: oripathyArt("1190"),
    shape: [
      [0, 0, "yellow"],
      [1, 0, "red"],
      [1, 1, "yellow"],
      [2, 0, "blue"],
      [2, 1, "blue"],
      [2, 2, "red"],
    ],
    effect: "o-offices",
    description:
      "本轮不能使用角色；选择同一家企业，提升两次合作等级后触发一次已解锁特效。",
  },
];
export const ENTREPRENEURS = [
  {
    id: "thiago",
    name: "蒂亚戈·H·罗德里格斯",
    face: "1405",
    dilemmas: ["1346", "1347", "1348", "1349"],
  },
  {
    id: "agnes",
    name: "艾格尼丝·史密斯",
    face: "1397",
    dilemmas: ["1406", "1400", "1399", "1398"],
  },
  {
    id: "paul",
    name: "保罗·蒂尔曼",
    face: "1403",
    dilemmas: ["1381", "1382", "1383", "1384"],
  },
  {
    id: "martin",
    name: "马丁·费舍尔",
    face: "1404",
    dilemmas: ["1386", "1387", "1388", "1389"],
  },
  {
    id: "pioneer",
    name: "拓荒企业家",
    face: "1402",
    dilemmas: ["1393", "1392", "1391", "1390"],
  },
] as const;
