import { ORIPATHY_ENTERPRISE_TEXT } from "../../../../packages/rules/src/oripathy-data.ts";
import {
  ENTERPRISE_TEXT,
  RESOURCES,
  RESOURCE_NAMES,
} from "../../../../packages/rules/src/data.ts";
import {
  RHINE_DEPARTMENTS,
  type OriginalLabReward,
} from "../../../../packages/rules/src/original-labs.ts";
import type { Reward } from "../../../../packages/rules/src/types.ts";
export type CardDetail = { title: string; image?: string; text?: string };

export const ENTERPRISE_COLORS: Record<string, string> = {
  rhodes: "#006b96",
  heide: "#907c47",
  rhine: "#7a952f",
  bank: "#246e45",
  raythean: "#555a52",
  mama: "#a88c09",
  blacksteel: "#984a40",
  rim: "#85508f",
  stonehoove: "#ad8546",
  maylander: "#17749c",
};
export type EnterpriseLevel = {
  level: number;
  kind: "effect" | "reward" | "lab" | "empty";
  text: string;
};

/** Presentation of the existing rule text, never a separate ability implementation. */
export function enterpriseLevels(
  company: string,
  lab: number | null,
  oripathy = false,
): EnterpriseLevel[] {
  const levels: EnterpriseLevel[] = [5, 4, 3, 2, 1, 0].map((level) => ({
    level,
    kind: "empty",
    text: level === 0 ? "尚未与这家企业建立合作。" : "本级无新增特效或奖励。",
  }));
  if (company === "rhine") {
    for (const entry of levels) {
      if (entry.level === 1) {
        entry.kind = "effect";
        entry.text = "切换为另一科室，获得与自己当前合作等级对应的科室奖励。";
      } else if (entry.level > 1) {
        entry.kind = "lab";
        const department = lab == null ? null : RHINE_DEPARTMENTS[lab];
        entry.text = department
          ? rewardText(department.rewards[String(entry.level)])
          : "选择初始科室后，按激活科室领取对应等级的奖励。";
      }
    }
    return levels;
  }
  for (const line of (oripathy
    ? (ORIPATHY_ENTERPRISE_TEXT[company] ?? ENTERPRISE_TEXT[company])
    : ENTERPRISE_TEXT[company]
  ).split("\n")) {
    const match = /^([1-5](?:、[1-5])*) 级(升级奖励)?：(.+)$/.exec(line);
    if (!match) continue;
    for (const number of match[1].split("、")) {
      const entry = levels.find((row) => row.level === Number(number))!;
      entry.kind = match[2] ? "reward" : "effect";
      entry.text = match[3];
    }
  }
  return levels;
}

function amounts(reward: Reward) {
  return RESOURCES.filter((resource) => reward[resource])
    .map((resource) => `${reward[resource]} ${RESOURCE_NAMES[resource]}`)
    .join("、");
}
function rewardText(reward: OriginalLabReward) {
  const actions: string[] = [];
  if (reward.gain) actions.push(`获得 ${amounts(reward.gain)}`);
  if (reward.effect === "build")
    actions.push(
      reward.free
        ? `从供应区免费建设一张设施${reward.maximumCashPrice === undefined ? "" : `（牌面金券价格不超过 ${reward.maximumCashPrice}）`}`
        : "按正常费用建设一张设施",
    );
  if (reward.chooseOne)
    actions.push(
      reward.chooseOne
        .map(
          (choice) =>
            `${choice.effect === "replace" ? "替换" : "移动"} ${choice.count} 次影响力`,
        )
        .join("，或"),
    );
  if (reward.effect === "choose-place-or-remove")
    actions.push(`执行 ${reward.count} 次，每次选择放置或移除影响力`);
  if (reward.effect === "downgrade-and-reward")
    actions.push(
      "降低 1 级莱茵生命合作等级，再获得降低后等级的奖励（四级费用仍可选择支付）",
    );
  const action = actions.join("；");
  return reward.cost ? `可支付 ${amounts(reward.cost)}，${action}` : action;
}
export function departmentDetail(index: number): CardDetail | null {
  const department = RHINE_DEPARTMENTS[index];
  if (!department?.rewardEvidenceComplete) return null;
  return {
    title: `莱茵生命 · ${department.name}`,
    text: [
      "所有玩家共用激活科室；升级按达到的等级获得奖励，切换时仅操作者获得当前等级奖励。",
      ...[2, 3, 4, 5].map(
        (level) =>
          `${level} 级：${rewardText(department.rewards[String(level)])}`,
      ),
    ].join("\n"),
  };
}
