import type { CSSProperties } from "react";
import {
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
  FACILITY_BY_ID,
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
} from "../../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import { FlipNumber, PresidentBadge } from "./TableMotion.tsx";
import { TablePiece } from "./TablePieces.tsx";
import { PlayerResourceStrip, ResourceStock } from "./ResourceStock.tsx";
import { EntrepreneurPortrait } from "./EntrepreneurPortrait.tsx";
import { oripathyEnterpriseImage } from "../../../../packages/rules/src/oripathy-data.ts";

export function TableDashboard({
  game,
  activeId,
  connectedIds,
  onCity,
  onSupply,
  onEnterprise,
}: {
  game: PlayerView;
  activeId?: string;
  connectedIds?: string[];
  onCity: (id: string) => void;
  onSupply: () => void;
  onEnterprise: () => void;
}) {
  const me = game.players.find((p) => p.id === game.me)!;
  return (
    <>
      <section className="resource-tray" aria-label="我的资源配件盘">
        <div className="section-label">
          <h2>资源储备</h2>
          <span>
            可用标记 <b>{me.availableMarkers}</b>
          </span>
        </div>
        <ResourceStock wallet={me.wallet} />
      </section>
      <section className="player-panel">
        <div className="section-label">
          <h2>
            {game.parallel
              ? game.parallel.kind === "select-role"
                ? "角色盖放"
                : "采集规划"
              : "企业家"}
          </h2>
          <span
            className={game.parallel ? "parallel-progress" : undefined}
            role={game.parallel ? "status" : undefined}
          >
            {game.parallel
              ? `${game.parallel.ready.length} / ${game.parallel.participants.length} 已确认`
              : `${game.players.length} 席`}
          </span>
        </div>
        {game.players.map((p) => (
          <button
            key={p.id}
            className={`player-row ${p.id === game.me ? "is-me" : ""} ${p.id === activeId ? "active" : ""}`}
            style={{ "--seat-color": PLAYER_COLORS[p.seat] } as CSSProperties}
            onClick={() => onCity(p.id)}
            aria-label={`查看${p.name}的城市与资源`}
          >
            <div className="entrepreneur-portrait">
              <EntrepreneurPortrait player={p} />
              <span>{PLAYER_SYMBOLS[p.seat]}</span>
            </div>
            {game.players[game.first]?.id === p.id && (
              <PresidentBadge compact />
            )}
            <div className="entrepreneur-info">
              <strong>
                {p.name}
                {p.id === game.me && <small> · 你</small>}
              </strong>
              <small
                className={
                  game.parallel
                    ? `parallel-seat ${game.parallel.ready.includes(p.id) ? "is-ready" : "is-planning"}`
                    : undefined
                }
                data-player-state={
                  game.parallel
                    ? game.parallel.ready.includes(p.id)
                      ? "ready"
                      : "planning"
                    : undefined
                }
              >
                {game.parallel
                  ? game.parallel.ready.includes(p.id)
                    ? game.parallel.kind === "select-role"
                      ? `✓ 已盖放 · 手牌 ${p.handCount}`
                      : "✓ 已确认方案"
                    : connectedIds && !connectedIds.includes(p.id)
                      ? "离线 · 等待返回"
                      : game.parallel.kind === "select-role"
                        ? "选牌中…"
                        : "规划路线与路费…"
                  : `可用标记 ${p.availableMarkers} · 手牌 ${p.handCount}`}
              </small>
            </div>
            <span className="entrepreneur-score">
              <FlipNumber value={p.wallet.score} />
              <small>分</small>
            </span>
            <PlayerResourceStrip wallet={p.wallet} />
          </button>
        ))}
      </section>
      <section className="table-overviews" aria-label="桌面配件">
        <button
          className="table-thumbnail city-thumbnail"
          onClick={() => onCity(game.me)}
          aria-label="我的城市"
        >
          <div className="mini-city" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>
                {me.built[i] && (
                  <img src={FACILITY_BY_ID[me.built[i].cardId].image} alt="" />
                )}
              </span>
            ))}
          </div>
          <div>
            <strong>移动城市</strong>
            <small>
              {Object.keys(me.built).length} / 12 设施 · {me.city ?? "等待入场"}
            </small>
            <span>展开城市 ↗</span>
          </div>
          <svg
            className="city-thumbnail-model"
            viewBox="-35 -43 70 66"
            aria-hidden="true"
          >
            <TablePiece kind="city" seat={me.seat} />
          </svg>
        </button>
        <button
          className="table-thumbnail facility-thumbnail"
          onClick={onSupply}
          aria-label="设施供应与城市样式"
        >
          <div className="mini-card-stack" aria-hidden="true">
            {game.market.slice(0, 3).map((id) => (
              <img
                key={id}
                src={FACILITY_BY_ID[id.split("@")[0]].image}
                alt=""
              />
            ))}
          </div>
          <div>
            <strong>设施供应</strong>
            <small>
              {game.market.length} 张待建 · {game.patterns.length} 种样式
            </small>
            <span>查看牌面 ↗</span>
          </div>
        </button>
        {game.expansion && (
          <button
            className="table-thumbnail enterprise-thumbnail"
            onClick={onEnterprise}
            aria-label="合作企业"
          >
            <div className="mini-enterprise" aria-hidden="true">
              {game.activeEnterprises.slice(0, 2).map((id) => (
                <img
                  key={id}
                  src={
                    game.oripathy
                      ? (oripathyEnterpriseImage(id) ?? ENTERPRISE_IMAGES[id])
                      : ENTERPRISE_IMAGES[id]
                  }
                  alt=""
                />
              ))}
            </div>
            <div>
              <strong>合作企业</strong>
              <small>
                {Object.entries(me.enterprise)
                  .filter(([, level]) => level > 0)
                  .map(([id, level]) => `${ENTERPRISE_NAMES[id]} ${level} 级`)
                  .join(" · ") || "选择合作方向"}
              </small>
              <span>查看企业板 ↗</span>
            </div>
          </button>
        )}
      </section>
    </>
  );
}
