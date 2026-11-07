import { useState } from "react";

const FOUNDERS = [
  ["蒂亚戈·H·罗德里格斯", "声望与远见"],
  ["马丁·费舍尔", "建设与革新"],
  ["保罗·蒂尔曼", "势力与野心"],
  ["艾格尼丝·史密斯", "规划与决断"],
];

/** Each printed face moves independently; focus and touch can lift a card too. */
export function FoundersDisplay() {
  const [hovered, setHovered] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const active = hovered ?? picked;
  return (
    <div className="poster-founders" onPointerLeave={() => setHovered(null)}>
      <div className="founder-orbit" aria-hidden="true" />
      <span className="founder-large-number" aria-hidden="true">
        105
      </span>
      {FOUNDERS.map(([name, theme], i) => (
        <button
          key={name}
          type="button"
          className={`founder-card founder-card-${i} ${active === i ? "is-lifted" : ""}`}
          aria-label={`查看企业家 ${name}`}
          aria-pressed={picked === i}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setHovered(i);
          }}
          onFocus={() => setHovered(i)}
          onBlur={() => setHovered(null)}
          onClick={() => setPicked(picked === i ? null : i)}
        >
          <span className="founder-print">
            <img
              src={`/assets/entrepreneur-${i}.webp`}
              alt={name}
              draggable={false}
            />
            <span className="founder-card-label">
              <small>0{i + 1} / FOUNDER</small>
              <b>{theme}</b>
            </span>
          </span>
        </button>
      ))}
      <div className="founder-caption" aria-live="polite">
        <span>
          {active === null
            ? "FOUR FOUNDERS / ONE FRONTIER"
            : FOUNDERS[active][1]}
        </span>
        <b>{active === null ? "四席之约 · 一同拓荒" : FOUNDERS[active][0]}</b>
      </div>
    </div>
  );
}
