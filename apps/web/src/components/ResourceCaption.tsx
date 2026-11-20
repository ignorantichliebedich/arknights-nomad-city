import { RESOURCE_NAMES } from "../../../../packages/rules/src/data.ts";
import type { Resource } from "../../../../packages/rules/src/types.ts";

export function ResourceCaption({ type }: { type: Resource }) {
  return (
    <span className="stock-hand-label" aria-hidden="true">
      {Array.from(RESOURCE_NAMES[type], (glyph, i) => (
        <i key={i}>{glyph}</i>
      ))}
    </span>
  );
}
