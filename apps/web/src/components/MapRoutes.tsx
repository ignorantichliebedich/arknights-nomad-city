import { RESOURCE_NAMES } from "../../../../packages/rules/src/data.ts";
import type {
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";

export function RouteOverlay({
  game,
  target,
  dragging,
  dragTarget,
}: {
  game: PlayerView;
  target: string;
  dragging: boolean;
  dragTarget: string;
}) {
  const d = game.decision;
  const routeMode =
    d &&
    ["harvest", "explore", "city", "toll"].includes(d.kind) &&
    d.playerId === game.me;
  const movePreview =
    !routeMode &&
    !!target &&
    game.cityDestinations?.some((m) => m.target === target);
  if (!routeMode && !dragging && !movePreview) return null;
  const moves =
    (dragging || movePreview) && !routeMode
      ? (game.cityDestinations ?? [])
      : [];
  const options = d?.options ?? [];
  const possible = new Set([
    ...options.flatMap((o) => o.preview?.roads ?? []),
    ...moves.map((m) => m.road),
  ]);
  const focus = options.find(
    (o) => o.target === (dragTarget || target),
  )?.preview;
  const focused = new Set(
    focus?.roads ??
      moves
        .filter((m) => m.target === (dragTarget || target))
        .map((m) => m.road),
  );
  const selected = new Set(d?.map?.roads ?? []);
  const roadTolls = new Map(
    options.flatMap((o) => o.preview?.tolls ?? []).map((t) => [t.road, t]),
  );
  return (
    <g
      className={`route-overlay ${dragging ? "dragging-routes" : ""}`}
      pointerEvents="none"
      aria-label="可选航道与路费"
    >
      {game.board.roads
        .filter((r) => possible.has(r.id) || selected.has(r.id))
        .map((road) => {
          const nodes = road.nodes.map((id) =>
            game.board.nodes.find((n) => n.id === id)!,
          );
          const toll = roadTolls.get(road.id);
          const active = focused.has(road.id) || selected.has(road.id);
          return (
            <g
              key={road.id}
              data-road={road.id}
              className={active ? "route-selected" : "route-possible"}
            >
              {nodes.map((n) => (
                <path
                  key={n.id}
                  d={`M${n.x - 8},${n.y} Q${road.x},${n.y} ${road.x},${road.y}`}
                  className="route-line"
                />
              ))}
              {!dragging && !movePreview && d?.kind !== "city" && (
                <g
                  className={`route-fee ${active ? "active" : ""}`}
                  transform={`translate(${road.x - 15} ${road.y - 22})`}
                >
                  <rect x="-18" y="-10" width="43" height="20" rx="10" />
                  <text textAnchor="middle" y="4" x="3">
                    {toll?.amount === 0 ? "免费" : "2 券"}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      {(d?.map?.selected ?? []).map((id) => {
        const n = game.board.nodes.find((n) => n.id === id)!;
        return (
          <g
            className="harvest-check"
            key={id}
            transform={`translate(${n.x + 22} ${n.y - 43})`}
          >
            <circle r="12" />
            <text textAnchor="middle" y="5">
              ✓
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function RoutePanel({
  game,
  selected,
  disabled,
  onChoose,
  onSelect,
  onCommit,
  plannedCity,
}: {
  game: PlayerView;
  selected: LegalAction | null;
  disabled: boolean;
  onChoose: (id: string) => void;
  onSelect: (a: LegalAction | null) => void;
  onCommit: () => void;
  plannedCity: { target: string; label: string } | null;
}) {
  const d = game.decision;
  if (
    !plannedCity &&
    (!d ||
      !["harvest", "explore", "city", "toll"].includes(d.kind) ||
      d.playerId !== game.me)
  )
    return null;
  const harvest = d?.kind === "harvest";
  const toll = d?.kind === "toll";
  const parallel = game.parallel?.kind === "harvest";
  const chosen = d?.options.find((o) => o.id === selected?.command.optionId);
  const done = game.actions.find((a) => a.command.optionId === "done");
  const snapshot = harvest
    ? d?.options.find((o) => o.id === "done")?.preview
    : chosen?.preview;
  const tolls = snapshot?.tolls ?? [];
  const selectedNodes =
    d?.map?.selected ??
    d?.options
      .filter((o) => o.id.startsWith("unselect:"))
      .map((o) => o.target!) ??
    [];
  return (
    <section className="route-panel" aria-label="地图路线与支付">
      <header>
        <small>地图操作</small>
        <h3>
          {plannedCity || d?.kind === "city"
            ? "移动城市"
            : harvest
              ? "规划采集路线"
              : toll
                ? "支付路费"
                : "探索路线"}
        </h3>
      </header>
      {parallel && (
        <p className="parallel-route-note">
          全员确认后统一支付与采集。路费预算为现有金券，本阶段路费收入在结算后到账。
        </p>
      )}
      {harvest && (
        <>
          <p>点击高亮资源点加入路线，再次点击撤回。共用航道只付一次。</p>
          <div className="route-target-list">
            {d?.options
              .filter((o) => o.target)
              .map((o) => (
                <button
                  key={o.id}
                  disabled={disabled}
                  className={selectedNodes.includes(o.target!) ? "picked" : ""}
                  onClick={() => onChoose(o.target!)}
                >
                  {selectedNodes.includes(o.target!) ? "✓ " : "+ "}
                  {o.target}
                  <small>
                    {game.sites[o.target!].amount}{" "}
                    {RESOURCE_NAMES[game.sites[o.target!].resource!]}
                  </small>
                </button>
              ))}
          </div>
          <strong className="route-total">{done?.label}</strong>
        </>
      )}
      {plannedCity && <p className="route-total">{plannedCity.label}</p>}
      {!harvest && !toll && !plannedCity && (
        <p>
          {selected
            ? selected.label
            : d?.kind === "city"
              ? "拖起你的城市，沿虚线选择停靠点；也可点击高亮位置。"
              : "点击高亮资源点，查看到达路线与费用。"}
        </p>
      )}
      {tolls.length > 0 && (
        <ul className="toll-breakdown">
          {tolls.map((t) => (
            <li key={t.road}>
              <b>{t.road}</b>
              <span>
                {t.amount === 0
                  ? "免费通行"
                  : `${t.amount} 金券 → ${t.recipients.length ? t.recipients.map((id) => game.players.find((p) => p.id === id)?.name ?? "银行").join(" / ") : "银行"}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {toll && (
        <>
          <p>
            {d?.map?.roads[0] ?? d?.title.split(" · ")[0]} · 支付 2
            金券，选择收款玩家。
          </p>
          <div className="toll-recipients">
            {game.actions.map((a) => {
              const p = game.players.find((p) => p.id === a.command.optionId);
              return (
                <button
                  key={a.id}
                  disabled={disabled}
                  className={selected?.id === a.id ? "picked" : ""}
                  onClick={() => onSelect(a)}
                >
                  {p && (
                    <img
                      src={`/assets/avatar-${p.seat}.webp?v=founders`}
                      alt=""
                    />
                  )}
                  {a.label}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="route-controls">
        {selected && (
          <button
            className="secondary-button"
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            取消预览
          </button>
        )}
        {harvest && selected?.id !== done?.id ? (
          <button
            className="primary-button"
            disabled={disabled || !done}
            onClick={() => done && onSelect(done)}
          >
            核对路费与采集
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={disabled || !selected}
            onClick={onCommit}
          >
            {disabled
              ? parallel
                ? "保存中…"
                : "结算中…"
              : plannedCity || d?.kind === "city"
                ? "确认移动 →"
                : harvest
                  ? parallel
                    ? "确认采集方案 →"
                    : "确认支付并采集 →"
                  : toll
                    ? parallel
                      ? "确认收款人 →"
                      : "确认支付 2 金券 →"
                    : "确认路费并探索 →"}
          </button>
        )}
      </div>
    </section>
  );
}
