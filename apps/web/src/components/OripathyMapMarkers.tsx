import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import { siteLayout } from "../board-layout.ts";

export function OripathyMapMarkers({ game }: { game: PlayerView }) {
  const state = game.oripathy;
  if (!state) return null;
  const locked = game.board.nodes.filter(
    (n) => n.region === state.lock?.region,
  );
  const at = state.gavial ? siteLayout(game, state.gavial.node).frame : null;
  return (
    <g className="oripathy-map-marker" aria-label="感染者特殊标记">
      {locked.map((node) => {
        const f = siteLayout(game, node.id).frame;
        return (
          <g key={node.id}>
            <title>{node.id} 所在区块已锁定，不能放置影响力</title>
            <rect
              className="region-lock-frame"
              x={f.x - 3}
              y={f.y - 3}
              width={f.w + 6}
              height={f.h + 6}
              rx="4"
            />
            <g transform={`translate(${f.x + f.w / 2} ${f.y - 13})`}>
              <rect
                className="region-lock-emblem"
                x="-8"
                y="-6"
                width="16"
                height="12"
                rx="2"
              />
              <path
                d="M-5 -6 V-10 A5 5 0 0 1 5 -10 V-6 M0 -2 V2"
                fill="none"
                stroke="#f5dfbb"
                strokeWidth="2"
              />
            </g>
          </g>
        );
      })}
      {at && (
        <g transform={`translate(${at.x + at.w + 8} ${at.y + at.h - 17})`}>
          <title>百炼嘉维尔指示物 · 收尾时转移并移动一个影响力</title>
          <path
            className="gavial-marker"
            d="M0 -17 L14 -9 V8 L0 17 L-14 8 V-9 Z"
          />
          <text className="oripathy-marker-text" y="4">
            嘉
          </text>
        </g>
      )}
    </g>
  );
}
