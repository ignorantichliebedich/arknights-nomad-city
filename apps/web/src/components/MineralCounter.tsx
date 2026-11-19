import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { RESOURCE_NAMES } from "../../../../packages/rules/src/data.ts";
import type { Resource } from "../../../../packages/rules/src/types.ts";
import { ResourceToken } from "./TablePieces.tsx";
import { FlipNumber } from "./TableMotion.tsx";

/** The edge and its printed scale turn together beneath the cardboard cover. */
function CounterWheel({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const angle = (value % 10) * 36;
  useLayoutEffect(() => {
    const delta = value - previous.current;
    previous.current = value;
    if (!delta || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const steps = Math.sign(delta) * (Math.abs(delta) % 10 || 10);
    const movement = ref.current?.animate(
      [
        { transform: `rotate(${angle - steps * 36}deg)` },
        { transform: `rotate(${angle}deg)` },
      ],
      {
        duration: 200 + 22 * Math.abs(steps),
        easing: "cubic-bezier(.2,.7,.28,1)",
      },
    );
    return () => movement?.cancel();
  }, [value, angle]);
  return (
    <span
      ref={ref}
      className="counter-wheel"
      style={{ transform: `rotate(${angle}deg)` }}
    />
  );
}

export function MineralCounter({
  type,
  value,
}: {
  type: Resource;
  value: number;
}) {
  return (
    <div
      className={`stock-cell stock-${type} mineral-counter`}
      data-resource={type}
      role="group"
      aria-label={`${RESOURCE_NAMES[type]} ${value}`}
      style={{ "--value-length": String(value).length } as CSSProperties}
    >
      <span className="counter-wheels" aria-hidden="true">
        <CounterWheel value={Math.trunc(value / 10)} />
        <CounterWheel value={value} />
      </span>
      <span className="counter-face" aria-hidden="true" />
      <span className="counter-legend">
        <ResourceToken type={type} />
        <b>{RESOURCE_NAMES[type]}</b>
      </span>
      <FlipNumber value={value} splitDial />
      <span className="counter-axles" aria-hidden="true" />
    </div>
  );
}
