import type { CSSProperties } from "react";
import {
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
  ENTERPRISE_TEXT,
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
} from "../../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import { TablePiece } from "./TablePieces.tsx";
import { EnterpriseRuleText } from "./EnterpriseRuleText.tsx";
import { enterpriseLevels, type CardDetail } from "./enterprise-content.ts";

export function EnterpriseTrack({
  game,
  company,
  viewer,
  lab,
}: {
  game: PlayerView;
  company: string;
  viewer: PlayerView["players"][number];
  lab: number | null;
}) {
  const current = viewer.enterprise[company] ?? 0;
  return (
    <ol
      className="enterprise-track"
      aria-label={`${ENTERPRISE_NAMES[company]}等级与能力`}
    >
      {enterpriseLevels(company, lab).map(({ level, kind, text }) => (
        <li
          key={level}
          data-level={level}
          data-kind={kind}
          className={`enterprise-step ${level <= current ? "is-reached" : ""} ${level === current ? "is-current" : ""} ${level === current + 1 ? "is-next" : ""}`}
        >
          <span className="enterprise-level-flag" aria-label={`${level} 级`}>
            <small>LEVEL</small>
            <b>{level}</b>
          </span>
          <div className="enterprise-step-copy">
            <div className="enterprise-step-label">
              <strong>
                {kind === "effect"
                  ? "企业特效"
                  : kind === "reward"
                    ? "升级奖励"
                    : kind === "lab"
                      ? "科室奖励"
                      : level === 0
                        ? "合作起点"
                        : "合作等级"}
              </strong>
              {level === current + 1 ? (
                <span className="next-level-label">下一等级</span>
              ) : level === current ? (
                <span className="current-level-label">当前等级</span>
              ) : kind === "effect" && level <= current ? (
                <span>已解锁</span>
              ) : null}
            </div>
            <p>
              <EnterpriseRuleText text={text} />
            </p>
          </div>
          <div
            className="enterprise-level-markers"
            aria-label={`${level} 级玩家`}
          >
            {game.players
              .filter((p) => (p.enterprise[company] ?? 0) === level)
              .map((p) => (
                <span
                  key={p.id}
                  role="img"
                  className={`enterprise-level-token ${p.id === viewer.id ? "is-viewer" : ""}`}
                  title={`${p.name} · ${level} 级`}
                  aria-label={`${p.name} · ${level} 级`}
                  style={
                    { "--seat-color": PLAYER_COLORS[p.seat] } as CSSProperties
                  }
                >
                  <svg viewBox="-15 -24 30 34" aria-hidden="true">
                    <TablePiece kind="influence" seat={p.seat} />
                  </svg>
                </span>
              ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EnterpriseComparison({
  game,
  onDetail,
}: {
  game: PlayerView;
  onDetail: (detail: CardDetail) => void;
}) {
  return (
    <table className="enterprise-levels">
      <caption>企业合作等级</caption>
      <thead>
        <tr>
          <th scope="col">合作企业</th>
          {game.players.map((p) => (
            <th key={p.id} scope="col">
              <img
                className="comparison-avatar"
                src={`/assets/avatar-${p.seat}.webp?v=founders`}
                alt=""
              />
              <span
                className="marker"
                style={{ color: PLAYER_COLORS[p.seat] }}
                aria-hidden="true"
              >
                {PLAYER_SYMBOLS[p.seat]}
              </span>
              {p.name}
              {p.id === game.me ? "（你）" : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {game.activeEnterprises.map((company) => (
          <tr key={company}>
            <th scope="row">
              <button
                className="subtle-button"
                onClick={() =>
                  onDetail({
                    title: ENTERPRISE_NAMES[company],
                    image: ENTERPRISE_IMAGES[company],
                    text: ENTERPRISE_TEXT[company],
                  })
                }
              >
                {ENTERPRISE_NAMES[company]}
              </button>
            </th>
            {game.players.map((p) => (
              <td
                key={p.id}
                className={p.id === game.me ? "own-enterprise-level" : ""}
              >
                <span
                  aria-label={`${p.name}，${ENTERPRISE_NAMES[company]}，合作等级 ${p.enterprise[company] ?? 0}`}
                >
                  {p.enterprise[company] ?? 0}
                  <small>级</small>
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
