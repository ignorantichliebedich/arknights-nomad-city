import type { CSSProperties } from "react";
import {
  BASIC,
  RESOURCES,
  RESOURCE_NAMES,
} from "../../../../packages/rules/src/data.ts";
import type { Resource, Wallet } from "../../../../packages/rules/src/types.ts";
import { FlipNumber } from "./TableMotion.tsx";
import { ResourceToken } from "./TablePieces.tsx";
import { MineralCounter } from "./MineralCounter.tsx";

/** The same public balances are used on the table and in a player's city. */
export function ResourceStock({
  wallet,
  counter = false,
}: {
  wallet: Wallet;
  counter?: boolean;
}) {
  function balance(type: Resource) {
    return (
      <div
        className={`stock-cell stock-${type}`}
        key={type}
        data-resource={type}
        role="group"
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
    );
  }
  if (!counter)
    return <div className="stock-grid">{RESOURCES.map(balance)}</div>;
  return (
    <div className="stock-counter">
      <div className="mineral-bank">
        {BASIC.map((type) => (
          <MineralCounter type={type} value={wallet[type]} key={type} />
        ))}
      </div>
      <div className="stock-grid counter-purse">
        {RESOURCES.filter((type) => !BASIC.includes(type)).map(balance)}
      </div>
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
