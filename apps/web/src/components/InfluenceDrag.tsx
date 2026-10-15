import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import { TablePiece } from "./TablePieces.tsx";
import { gameAudio } from "../audio.ts";
import { slotPoint } from "../board-layout.ts";

export type InfluenceTransfer = { from: string; to: string; owner: string };
export function useInfluenceTravel(game: PlayerView) {
  const slots = () =>
    Object.fromEntries(
      Object.entries(game.sites).flatMap(([site, s]) =>
        s.slots.map((owner, i) => [`${site}:${i}`, owner]),
      ),
    );
  const previous = useRef(slots());
  const [flight, setFlight] = useState<InfluenceTransfer | null>(null);
  useEffect(() => {
    const current = slots();
    const removed = Object.keys(current).filter(
      (s) => previous.current[s] && !current[s],
    );
    const added = Object.keys(current).filter(
      (s) => current[s] && !previous.current[s],
    );
    const from = removed[0],
      to = added[0];
    const owner = to ? current[to] : null;
    const transfer =
      removed.length === 1 &&
      added.length === 1 &&
      previous.current[from] === owner;
    previous.current = current;
    setFlight(null);
    if (
      !transfer ||
      !owner ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    setFlight({ from, to, owner });
    const timer = setTimeout(() => setFlight(null), 680);
    return () => clearTimeout(timer);
  }, [game.revision]);
  if (!flight) return { arrival: null, overlay: null };
  const from = influencePoint(game, flight.from),
    to = influencePoint(game, flight.to);
  return {
    arrival: flight.to,
    overlay: (
      <g
        key={game.revision}
        className="influence-travel"
        pointerEvents="none"
        style={
          {
            "--from-x": `${from.x}px`,
            "--from-y": `${from.y}px`,
            "--to-x": `${to.x}px`,
            "--to-y": `${to.y}px`,
          } as React.CSSProperties
        }
      >
        <TablePiece
          kind="influence"
          seat={game.players.find((p) => p.id === flight.owner)!.seat}
        />
      </g>
    ),
  };
}
export function influencePoint(game: PlayerView, slot: string) {
  const point = slotPoint(game, slot);
  return { ...point, y: point.y + 7 };
}
export function useInfluenceDrag(
  game: PlayerView,
  svg: RefObject<SVGSVGElement | null>,
  disabled: boolean,
  onDrop: (move: InfluenceTransfer) => void,
  onKeyboard: (from: string) => void,
) {
  const [drag, setDrag] = useState<{
    from: string;
    owner: string;
    destinations: string[];
    x: number;
    y: number;
    startX: number;
    startY: number;
    target: string;
    moved: boolean;
  } | null>(null);
  useEffect(() => setDrag(null), [game.revision, disabled]);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const point = (e: PointerEvent) => {
    const p = svg.current!.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  return {
    active: !!drag,
    cancel: () => setDrag(null),
    handle: (from: string) => {
      const move = game.influenceMoves?.find((m) => m.from === from);
      if (!move || disabled) return {};
      return {
        role: "button",
        tabIndex: 0,
        "data-influence-from": from,
        "aria-label": `拖动 ${from} 的影响力，或按回车选择目的地`,
        className: `influence-drag-handle ${drag?.from === from ? "influence-lifted" : ""}`,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onKeyboard(from);
          }
        },
        onPointerDown: (e: PointerEvent<SVGGElement>) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const p = point(e);
          setDrag({
            ...move,
            x: p.x,
            y: p.y,
            startX: p.x,
            startY: p.y,
            moved: false,
            target: "",
          });
          svg.current!.setPointerCapture(e.pointerId);
        },
      };
    },
    onMove: (e: PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      const p = point(e);
      if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > 5)
        void gameAudio.play("lift");
      const candidate = drag.destinations
        .map((slot) => ({ slot, p: influencePoint(game, slot) }))
        .map((d) => ({
          ...d,
          distance: Math.hypot(d.p.x - p.x, d.p.y - 7 - p.y),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      setDrag({
        ...drag,
        x: p.x,
        y: p.y,
        moved:
          drag.moved || Math.hypot(p.x - drag.startX, p.y - drag.startY) > 5,
        target: candidate && candidate.distance < 23 ? candidate.slot : "",
      });
    },
    onUp: (e: PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      setDrag(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (drag.moved && drag.target) {
        void gameAudio.play("select");
        onDrop({ from: drag.from, to: drag.target, owner: drag.owner });
      } else if (!drag.moved) onKeyboard(drag.from);
    },
    overlay: drag && (
      <g className="influence-drag-overlay" pointerEvents="none">
        {drag.destinations.map((slot) => {
          const from = influencePoint(game, drag.from),
            to = influencePoint(game, slot);
          return (
            <g key={slot} data-influence-destination={slot}>
              <path
                className={`influence-route ${slot === drag.target ? "focused" : ""}`}
                d={`M${from.x} ${from.y - 7} Q${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - 45} ${to.x} ${to.y - 7}`}
              />
              <circle
                cx={to.x}
                cy={to.y - 7}
                r="13"
                className={`influence-landing ${slot === drag.target ? "focused" : ""}`}
              />
            </g>
          );
        })}
        <g className="drag-influence">
          <TablePiece
            kind="influence"
            seat={game.players.find((p) => p.id === drag.owner)!.seat}
            x={drag.x}
            y={drag.y - 5}
          />
          <text x={drag.x} y={drag.y - 34} textAnchor="middle">
            {drag.target ? `${drag.target} · 松手预览` : "拖向虚线圈中的空位"}
          </text>
        </g>
      </g>
    ),
  };
}
export function InfluencePreview({
  game,
  move,
  disabled,
  onCancel,
  onCommit,
}: {
  game: PlayerView;
  move: InfluenceTransfer;
  disabled: boolean;
  onCancel: () => void;
  onCommit: () => void;
}) {
  return (
    <section
      className="route-panel influence-preview"
      aria-label="影响力移动确认"
    >
      <small>调度影响力</small>
      <h3>
        {move.from} → {move.to}
      </h3>
      <p>
        移动 {game.players.find((p) => p.id === move.owner)?.name} 的 1
        个影响力。
      </p>
      <p>确认后落子；仍有移动次数时继续选择。</p>
      <button className="primary-button" disabled={disabled} onClick={onCommit}>
        确认移动影响力
      </button>
      <button className="secondary-button" onClick={onCancel}>
        取消移动
      </button>
    </section>
  );
}
