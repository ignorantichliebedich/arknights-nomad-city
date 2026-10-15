import type { Resource } from "../../../../packages/rules/src/types.ts";
import { ResourceToken } from "./TablePieces.tsx";

const resources: Record<string, Resource> = {
  至纯源石: "prime",
  源岩: "rock",
  源石: "ore",
  异铁: "iron",
  金券: "cash",
  分数: "score",
  分: "score",
};

/** Keep the rule wording intact while pairing amounts with official component art. */
export function EnterpriseRuleText({ text }: { text: string }) {
  const parts = text.split(/(\d+ (?:至纯源石|源岩|源石|异铁|金券|分数|分))/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^(\d+) (至纯源石|源岩|源石|异铁|金券|分数|分)$/.exec(
          part,
        );
        return match ? (
          <span className="enterprise-amount" key={i}>
            <ResourceToken type={resources[match[2]]} />
            <b>{match[1]}</b> {match[2]}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}
