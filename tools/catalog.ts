import { mkdirSync, writeFileSync } from "node:fs";
import {
  FACILITIES,
  BASE_ROLES,
  OPERATIVES,
  EVENTS,
  PATTERNS,
  ENTERPRISE_NAMES,
  ENTERPRISE_TEXT,
  VERIFIED_ENTERPRISES,
  RULES_VERSION,
  facilityText,
} from "../packages/rules/src/data.ts";
import originalLabs from "../assets/original-labs.json" with { type: "json" };
const baseFacilities = FACILITIES.filter((f) => !f.expansion).reduce(
  (n, f) => n + f.copies,
  0,
);
const catalog = {
  rulesVersion: RULES_VERSION,
  sources: {
    official: "https://ak.hypergryph.com/boardgame_nomadcity/",
    wiki: "https://prts.wiki/w/游城拓荒：铸基者",
    archive:
      "https://steamcommunity.com/sharedfiles/filedetails/?id=3064722448",
    manual:
      "https://steamusercontent-a.akamaihd.net/ugc/2282825689394632887/8F1D80001580DF5B3F528E7B80302B646C2AF857/",
  },
  components: {
    base: {
      facilities: baseFacilities,
      roles: 20,
      events: 22,
      patterns: 6,
      playerAids: 4,
      total: 100,
    },
    enterprise: {
      roles: 8,
      operatives: 8,
      facilities: 3,
      replacementEvents: 2,
      patterns: 6,
      total: 27,
      companyBoards: 8,
      laboratoryBoards: 3,
      publicRoadTokens: 8,
    },
  },
  facilities: FACILITIES.map((f) => ({
    ...f,
    text: facilityText(f.id),
    evidence: [
      { kind: "card-face", asset: f.image },
      { kind: "printed-manual", pages: [7, 13] },
    ],
  })),
  roles: [...BASE_ROLES, ...OPERATIVES].map((r) => ({
    ...r,
    copies: r.operative ? 1 : 4,
    evidence: [
      {
        kind: "printed-manual",
        pages: r.operative ? [19, 20] : r.expansion ? [19] : [14],
      },
    ],
  })),
  events: EVENTS.map((e) => ({
    ...e,
    copies: 1,
    evidence: [{ kind: "card-face", asset: e.image }],
  })),
  replacementEvents: [
    {
      id: "yellow-1",
      image: "/assets/cards-167/11.webp",
      addedOption: "支付 1 异铁，提升一家企业一级",
    },
    {
      id: "red-2",
      image: "/assets/cards-156/6.webp",
      addedOption: "失去 1 分，提升同一家企业两级",
    },
  ],
  patterns: PATTERNS.map((p) => ({
    ...p,
    copies: 1,
    evidence: [
      { kind: "card-face", asset: p.image },
      { kind: "printed-manual", pages: [8, 9, 11, 18] },
    ],
  })),
  enterprises: Object.entries(ENTERPRISE_NAMES).map(([id, name]) => ({
    id,
    name,
    text: ENTERPRISE_TEXT[id],
    enabled: VERIFIED_ENTERPRISES.includes(id),
    evidence: [
      {
        kind: "card-face",
        asset: `/assets/cards-625/${["rhodes", "heide", "rhine", "bank", "raythean", "mama", "blacksteel", "rim"].indexOf(id)}.webp`,
      },
      { kind: "printed-manual", pages: [16, 21, 22] },
    ],
  })),
  laboratory: originalLabs,
  evidenceIssues: [
    {
      id: "rhine-original-labs",
      status: "verified",
      component: "莱茵生命三张原版科室",
      evidence:
        "工程科依据原说明书，防卫科依据官方指导图，结构科依据公开高清实物开箱及独立实物镜头；共享激活、切换与升级结算按原规则书页 22 实现。逐档数据、原文及来源见 laboratory。",
      impact: "完整八企业抽选池和三张原版科室接入正式企业扩展。",
    },
  ],
};
mkdirSync("assets", { recursive: true });
writeFileSync("assets/catalog.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `规则目录：本体 ${catalog.components.base.total} 张，企业 ${catalog.components.enterprise.total} 张；规则版本 ${RULES_VERSION}`,
);
