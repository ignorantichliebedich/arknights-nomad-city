import { useEffect, useRef, useState, type PointerEvent } from "react";
import { RESOURCE_NAMES } from "../../../../packages/rules/src/data.ts";
import { gameAudio } from "../audio.ts";
import type {
  InfluencePlacement,
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import { TablePiece } from "./TablePieces.tsx";
import { RouteOverlay } from "./MapRoutes.tsx";
import { ScoreTrack } from "./TableMotion.tsx";
import {
  useInfluenceDrag,
  useInfluenceTravel,
  influencePoint,
  type InfluenceTransfer,
} from "./InfluenceDrag.tsx";
export function mapBounds(game: PlayerView) {
  return game.players.length === 4
    ? { x: 46, y: 58, w: 916, h: 910 }
    : { x: 46, y: 150, w: 916, h: 818 };
}
export function BoardMap({
  game,
  confirm,
  target,
  placement,
  placements,
  choosePlacement,
  boardChoice,
  chooseSite,
  disabled,
  onCityDrop,
  onCityKeyboard,
  onInfluenceDrop,
  onInfluenceKeyboard,
}: {
  game: PlayerView;
  confirm: LegalAction | null;
  target: string;
  placement: InfluencePlacement | null;
  placements: InfluencePlacement[];
  choosePlacement: (choice: InfluencePlacement) => void;
  boardChoice: boolean;
  chooseSite: (id: string) => void;
  disabled: boolean;
  onCityDrop: (target: string, optionId: string) => void;
  onCityKeyboard: () => void;
  onInfluenceDrop: (move: InfluenceTransfer) => void;
  onInfluenceKeyboard: (from: string) => void;
}) {
  const me = game.players.find((p) => p.id === game.me);
  const decision = game.decision;
  const bounds = mapBounds(game);
  const svgRef = useRef<SVGSVGElement>(null);
  const influence = useInfluenceDrag(
    game,
    svgRef,
    disabled,
    onInfluenceDrop,
    onInfluenceKeyboard,
  );
  const travel = useInfluenceTravel(game);
  const [drag, setDrag] = useState<{
    seat: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    target: string;
  } | null>(null);
  const destinations =
    decision?.kind === "city" && decision.playerId === game.me
      ? game.actions
          .filter((a) => a.target)
          .map((a) => ({ target: a.target!, optionId: a.command.optionId! }))
      : (game.cityDestinations ?? []);
  useEffect(() => {
    setDrag(null);
  }, [game.revision, disabled]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrag(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  function mapPoint(x: number, y: number) {
    const point = svgRef.current!.createSVGPoint();
    point.x = x;
    point.y = y;
    return point.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());
  }
  function moveCity(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = mapPoint(e.clientX, e.clientY);
    if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > 5)
      void gameAudio.play("lift");
    const node = game.board.nodes.find(
      (n) =>
        destinations.some((d) => d.target === n.id) &&
        p.x >= n.x - 58 &&
        p.x <= n.x + 31 &&
        p.y >= n.y - 51 &&
        p.y <= n.y + 53,
    );
    setDrag({
      ...drag,
      x: p.x,
      y: p.y,
      moved: drag.moved || Math.hypot(p.x - drag.startX, p.y - drag.startY) > 5,
      target: node?.id ?? "",
    });
  }
  function dropCity(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const dest = destinations.find((d) => d.target === drag.target);
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag.moved && dest) {
      void gameAudio.play("select");
      onCityDrop(dest.target, dest.optionId);
    } else if (!drag.moved) onCityKeyboard();
  }
  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
        onPointerMove={(e) => {
          moveCity(e);
          influence.onMove(e);
        }}
        onPointerUp={(e) => {
          dropCity(e);
          influence.onUp(e);
        }}
        onPointerCancel={() => {
          setDrag(null);
          influence.cancel();
        }}
        role="group"
        aria-label="第 105 号拓荒区棋盘"
      >
        <RouteOverlay
          game={game}
          target={target || confirm?.target || ""}
          dragging={!!drag}
          dragTarget={drag?.target ?? ""}
        />
        {[...game.board.roads, ...game.board.nodes].map((site) => {
          const isNode = "tier" in site;
          const state = game.sites[site.id];
          const actions = boardChoice
            ? game.actions.filter((a) => a.target === site.id)
            : [];
          const reachable =
            !!drag && destinations.some((m) => m.target === site.id);
          const deployable =
            !disabled &&
            !drag &&
            !influence.active &&
            placements.some((p) => p.target === site.id);
          const city = game.players.find((p) => p.city === site.id);
          const y = isNode ? site.y : site.y;
          const previewSlot =
            placement?.target === site.id
              ? /:(\d+)$/.exec(placement.optionId)?.[1]
              : confirm?.target === site.id
                ? /:(\d+)$/.exec(confirm.command.optionId ?? "")?.[1]
                : undefined;
          return (
            <g key={site.id}>
              <rect
                className={`board-hit ${actions.length || reachable || deployable ? "legal" : ""} ${deployable ? "deployable" : ""} ${drag?.target === site.id ? "drop-target" : ""} ${confirm?.target === site.id || target === site.id ? "selected" : ""}`}
                x={site.x - (isNode ? 58 : 27)}
                y={y - (isNode ? 51 : 13)}
                width={isNode ? 89 : Math.max(58, state.slots.length * 18 + 22)}
                height={isNode ? 104 : 29}
                rx="3"
                role="button"
                data-site-id={site.id}
                tabIndex={0}
                aria-label={`${site.id}${state.resource ? `，${state.amount} ${RESOURCE_NAMES[state.resource]}` : ""}${city ? `，${city.name}的城市` : ""}${deployable ? "，可放置影响力" : actions.length ? "，可以操作" : ""}`}
                onClick={() => chooseSite(site.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    chooseSite(site.id);
                  }
                }}
              />
              {(confirm?.target === site.id ||
                placement?.target === site.id ||
                (target === site.id && actions.length)) && (
                <g pointerEvents="none" className="placement-preview">
                  <rect
                    x={site.x - 37}
                    y={site.y - (isNode ? 62 : 25)}
                    width="76"
                    height={isNode ? 124 : 54}
                    rx="6"
                  />
                  <text x={site.x} y={site.y - (isNode ? 70 : 33)}>
                    待确认 · {site.id}
                  </text>
                </g>
              )}
              {isNode && state.resource && (
                <g
                  pointerEvents="none"
                  className={`map-resource-token resource-${state.resource}`}
                  key={`${site.id}:${state.resource}:${state.amount}`}
                >
                  <rect
                    x={site.x - 58}
                    y={site.y - 47}
                    width="30"
                    height="39"
                    rx="4"
                    fill="#29231fee"
                    stroke="#e3c890"
                  />
                  <image
                    href={`/assets/resource-${state.resource}.webp`}
                    x={site.x - 57}
                    y={site.y - 48}
                    width="28"
                    height="27"
                  />
                  <text
                    x={site.x - 43}
                    y={site.y - 12}
                    className="board-resource count"
                  >
                    ×{state.amount}
                  </text>
                </g>
              )}
              {state.slots.map((owner, i) => {
                if (!owner) return null;
                const p = game.players.find((p) => p.id === owner)!;
                return (
                  <g
                    key={`${i}:${owner}`}
                    className="map-piece"
                    {...influence.handle(`${site.id}:${i}`)}
                    style={{
                      opacity: travel.arrival === `${site.id}:${i}` ? 0 : 1,
                    }}
                  >
                    <TablePiece
                      kind="influence"
                      seat={p.seat}
                      x={isNode ? site.x - 44 : site.x + 2 + i * 18}
                      y={isNode ? site.y + 16 + i * 20 : site.y + 13}
                    />
                    {game.influenceMoves?.some(
                      (m) => m.from === `${site.id}:${i}`,
                    ) &&
                      !disabled && (
                        <rect
                          x={(isNode ? site.x - 44 : site.x + 2 + i * 18) - 12}
                          y={(isNode ? site.y + 16 + i * 20 : site.y + 13) - 23}
                          width="24"
                          height="31"
                          fill="transparent"
                        />
                      )}
                  </g>
                );
              })}
              {state.publicRoad && (
                <g pointerEvents="none">
                  <rect
                    x={site.x - 27}
                    y={site.y - 10}
                    width="57"
                    height="25"
                    fill="#222b2b"
                    stroke="#d2b25c"
                  />
                  <text
                    x={site.x + 2}
                    y={site.y + 7}
                    className="board-resource"
                  >
                    公路 ▰
                  </text>
                </g>
              )}
              {previewSlot !== undefined &&
                me &&
                (placement ||
                  ["place", "shift-to", "replace"].includes(
                    decision?.kind ?? "",
                  )) && (
                  <TablePiece
                    kind="influence"
                    seat={me.seat}
                    ghost
                    x={
                      isNode
                        ? site.x - 44
                        : site.x + 2 + Number(previewSlot) * 18
                    }
                    y={
                      isNode
                        ? site.y + 16 + Number(previewSlot) * 20
                        : site.y + 13
                    }
                  />
                )}
            </g>
          );
        })}
        {game.players
          .filter((p) => p.city)
          .map((p) => {
            const node = game.board.nodes.find((n) => n.id === p.city)!;
            const canDrag =
              p.id === game.me && destinations.length > 0 && !disabled;
            return (
              <g
                key={p.id}
                className={`city-position ${canDrag ? "city-drag-handle" : ""} ${drag?.seat === p.seat ? "city-lifted" : ""}`}
                style={{ transform: `translate(${node.x}px,${node.y + 12}px)` }}
                data-player={p.id}
                data-city={p.city}
                role={canDrag ? "button" : undefined}
                tabIndex={canDrag ? 0 : undefined}
                aria-label={
                  canDrag
                    ? `拖动${p.name}的城市，或按回车选择目的地`
                    : undefined
                }
                onKeyDown={(e) => {
                  if (canDrag && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onCityKeyboard();
                  }
                }}
                onPointerDown={(e) => {
                  if (!canDrag || e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const point = mapPoint(e.clientX, e.clientY);
                  setDrag({
                    seat: p.seat,
                    x: point.x,
                    y: point.y,
                    startX: point.x,
                    startY: point.y,
                    moved: false,
                    target: "",
                  });
                  svgRef.current?.setPointerCapture(e.pointerId);
                }}
                onClick={() => {
                  if (!canDrag) chooseSite(p.city!);
                }}
              >
                <TablePiece kind="city" seat={p.seat} />
                {canDrag && (
                  <rect
                    className="city-grab-area"
                    x="-40"
                    y="-48"
                    width="80"
                    height="58"
                    fill="transparent"
                  />
                )}
              </g>
            );
          })}
        {!disabled &&
          !drag &&
          !influence.active &&
          placements.map((choice) => {
            const p = influencePoint(game, choice.optionId);
            const picked = placement?.optionId === choice.optionId;
            return (
              <g
                key={choice.optionId}
                className={`deployment-slot ${picked ? "picked" : ""}`}
                data-placement-slot={choice.optionId}
                transform={`translate(${p.x},${p.y - 7})`}
                role="button"
                tabIndex={0}
                aria-label={`在 ${choice.target} 空位 ${Number(choice.optionId.split(":").at(-1)) + 1} 放置影响力`}
                aria-pressed={picked}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => choosePlacement(choice)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choosePlacement(choice);
                  }
                }}
              >
                <circle r="10" />
                {!picked && <path d="M-4 0H4 M0-4V4" />}
              </g>
            );
          })}
        {drag && (
          <g className="drag-city" pointerEvents="none">
            <TablePiece
              kind="city"
              seat={drag.seat}
              x={drag.x}
              y={drag.y - 9}
            />
            <text x={drag.x} y={drag.y - 62} textAnchor="middle">
              {drag.target
                ? `停靠 ${drag.target} · 松手预览`
                : "沿虚线选择停靠点"}
            </text>
          </g>
        )}
        {influence.overlay}
        {travel.overlay}
        <ScoreTrack game={game} bounds={bounds} />
      </svg>
    </>
  );
}
