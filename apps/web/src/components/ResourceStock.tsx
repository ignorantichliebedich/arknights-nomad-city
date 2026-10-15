import type { CSSProperties } from "react";
import {
  RESOURCES,
  RESOURCE_NAMES,
} from "../../../../packages/rules/src/data.ts";
import type { Wallet } from "../../../../packages/rules/src/types.ts";
import { FlipNumber } from "./TableMotion.tsx";
import { ResourceToken } from "./TablePieces.tsx";

/** The same public balances are used on the table and in a player's city. */
export function ResourceStock({ wallet }: { wallet: Wallet }) {
  return (
    <div className="stock-grid">
      {RESOURCES.map((type) => (
        <div
          className={`stock-cell stock-${type}`}
          key={type}
          data-resource={type}
          style={
            { "--value-length": String(wallet[type]).length } as CSSProperties
          }
          aria-label={`${RESOURCE_NAMES[type]} ${wallet[type]}`}
        >
          <ResourceToken type={type} />
          <div>
            <FlipNumber value={wallet[type]} />
            <span>{RESOURCE_NAMES[type]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlayerResourceStrip({ wallet }: { wallet: Wallet }) {
  return (
    <span className="player-stock-strip">
      {RESOURCES.filter((type) => type !== "score").map((type) => (
        <span
          className={`player-stock ${wallet[type] === 0 ? "is-empty" : ""}`}
          key={type}
          data-resource={type}
          aria-label={`${RESOURCE_NAMES[type]} ${wallet[type]}`}
          title={`${RESOURCE_NAMES[type]}：${wallet[type]}`}
        >
          <ResourceToken type={type} />
          <FlipNumber value={wallet[type]} />
        </span>
      ))}
    </span>
  );
}
