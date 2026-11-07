import {
  oripathyEnterpriseImage,
  ORIPATHY_ENTERPRISE_TEXT,
} from "../../../../packages/rules/src/oripathy-data.ts";
import { useState, type CSSProperties } from "react";
import {
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
} from "../../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import { highResolutionArt } from "../art.ts";
import { EnterpriseBoard } from "./EnterpriseBoard.tsx";
import { EnterpriseComparison } from "./EnterpriseTrack.tsx";
import { ENTERPRISE_COLORS, type CardDetail } from "./enterprise-content.ts";
export { departmentDetail, type CardDetail } from "./enterprise-content.ts";

export function EnterprisePanel({
  game,
  onDetail,
}: {
  game: PlayerView;
  onDetail: (detail: CardDetail) => void;
}) {
  const [selected, setSelected] = useState(game.activeEnterprises[0]);
  const [viewerId, setViewerId] = useState(game.me);
  const company = game.activeEnterprises.includes(selected)
    ? selected
    : game.activeEnterprises[0];
  const viewer = game.players.find((p) => p.id === viewerId) ?? game.players[0];
  if (!company)
    return (
      <section className="enterprise-empty">
        <h3>等待建立合作</h3>
        <p>入场选择后，本局的合作企业板会陈列在这里。</p>
      </section>
    );
  const level = viewer.enterprise[company] ?? 0;
  return (
    <section
      className="enterprise-panel enterprise-showcase"
      aria-label="企业合作等级"
      style={
        { "--enterprise-color": ENTERPRISE_COLORS[company] } as CSSProperties
      }
    >
      <div
        className="enterprise-catalog"
        role="group"
        aria-label="本局合作企业"
      >
        {game.activeEnterprises.map((id) => (
          <button
            key={id}
            className="enterprise-brand-tab"
            style={{ "--brand-color": ENTERPRISE_COLORS[id] } as CSSProperties}
            aria-label={`查看${ENTERPRISE_NAMES[id]}企业板`}
            aria-pressed={id === company}
            onClick={() => setSelected(id)}
          >
            <span className="enterprise-brand-art" aria-hidden="true">
              <img
                src={highResolutionArt(
                  game.oripathy
                    ? (oripathyEnterpriseImage(id) ?? ENTERPRISE_IMAGES[id])
                    : ENTERPRISE_IMAGES[id],
                )}
                alt=""
                draggable={false}
              />
            </span>
            <span className="enterprise-brand-name">
              <strong>{ENTERPRISE_NAMES[id]}</strong>
              <small>
                合作 <b>{viewer.enterprise[id] ?? 0}</b> 级
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="enterprise-observers">
        <span className="enterprise-observers-label">查看进度</span>
        <div
          role="group"
          aria-label="查看玩家合作进度"
          className="enterprise-players"
        >
          {game.players.map((p) => (
            <button
              key={p.id}
              className="enterprise-viewer"
              aria-label={`查看${p.name}的合作进度`}
              aria-pressed={p.id === viewer.id}
              title={p.name}
              style={{ "--seat-color": PLAYER_COLORS[p.seat] } as CSSProperties}
              onClick={() => setViewerId(p.id)}
            >
              <img src={`/assets/avatar-${p.seat}.webp?v=founders`} alt="" />
              <span>
                {p.name}
                {p.id === game.me && <small> · 你</small>}
              </span>
              <i aria-hidden="true">{PLAYER_SYMBOLS[p.seat]}</i>
            </button>
          ))}
        </div>
        <span
          className="enterprise-current-level"
          aria-label={`${viewer.name}，${ENTERPRISE_NAMES[company]}，当前 ${level} 级`}
        >
          <b>{level}</b> 级{" "}
          <small>{level === 5 ? "当前满级" : `下一等级 ${level + 1}`}</small>
        </span>
      </div>
      <EnterpriseBoard
        key={company}
        game={game}
        company={company}
        viewer={viewer}
        onDetail={onDetail}
      />
      <details className="enterprise-comparison">
        <summary>
          全体合作等级
          <span>展开对照本局 {game.activeEnterprises.length} 家企业 ↗</span>
        </summary>
        <EnterpriseComparison game={game} onDetail={onDetail} />
      </details>
    </section>
  );
}
