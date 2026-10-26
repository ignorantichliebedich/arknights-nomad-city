import { useState, type CSSProperties } from "react";
import {
  ENTREPRENEURS,
  oripathyArt,
} from "../../../../packages/rules/src/oripathy-data.ts";
import {
  FACILITY_BY_ID,
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
  ROLE_BY_ID,
  facilityText,
} from "../../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import type { CardDetail } from "./ActionComposer.tsx";
import { EntrepreneurPortrait } from "./EntrepreneurPortrait.tsx";

export function EntrepreneurDossier({
  game,
  onDetail,
}: {
  game: PlayerView;
  onDetail: (d: CardDetail) => void;
}) {
  const [playerId, setPlayerId] = useState(game.me);
  const p = game.players.find((p) => p.id === playerId) ?? game.players[0];
  const e = p.oripathy!;
  const identity = ENTREPRENEURS.find((who) => who.id === e.entrepreneur);
  const markerName = (
    { thiago: "声望", agnes: "指令", pioneer: "收集标记" } as Record<
      string,
      string
    >
  )[e.entrepreneur ?? ""];
  const hasContract = game.oripathy!.contracts.includes(p.id);
  const cardButton = (
    id: string,
    title: string,
    image: string,
    text?: string,
  ) => (
    <button
      key={id}
      className="oripathy-reference"
      onClick={() => onDetail({ title, image, text })}
    >
      <img src={image} alt={title} loading="lazy" draggable={false} />
      <span>{title} ↗</span>
    </button>
  );
  return (
    <section
      className="oripathy-dossier"
      style={{ "--seat-color": PLAYER_COLORS[p.seat] } as CSSProperties}
    >
      <nav className="oripathy-roster" aria-label="查看玩家的感染者档案">
        {game.players.map((player) => (
          <button
            key={player.id}
            aria-pressed={p.id === player.id}
            onClick={() => setPlayerId(player.id)}
            style={
              { "--tab-color": PLAYER_COLORS[player.seat] } as CSSProperties
            }
          >
            <i aria-hidden="true">{PLAYER_SYMBOLS[player.seat]}</i>
            <span>
              {player.name}
              {player.id === game.me ? " · 你" : ""}
            </span>
            <small>0{player.seat + 1}</small>
          </button>
        ))}
      </nav>
      <article className="dossier-sheet" key={p.id}>
        <div className="dossier-registration">
          <span>COLUMBIA / ENTREPRENEUR RECORD</span>
          <span>第 105 号拓荒区 · 第 {game.round} 回合</span>
        </div>
        <header className="oripathy-dossier-heading">
          <div>
            <small>感染者 · 企业家档案</small>
            <h3>{identity?.name ?? p.name}</h3>
            <p>
              {p.name} <span>/</span> {identity ? "企业家与抉择" : "常规拓荒"}
            </p>
          </div>
          <span className="dossier-file-seal" aria-hidden="true">
            <small>已建档</small>
            <b>0{p.seat + 1}</b>
            <small>DISTRICT 105</small>
          </span>
        </header>
        <div className="dossier-spread">
          <aside className="dossier-identity">
            <span className="dossier-section-label">01 / 企业家能力</span>
            {identity ? (
              cardButton(identity.id, "企业家能力", oripathyArt(identity.face))
            ) : (
              <div className="dossier-standard-portrait">
                <EntrepreneurPortrait player={p} variant="portrait" />
                <span>常规拓荒 · 无专属能力</span>
              </div>
            )}
            <div className="dossier-counter-rack" aria-label="个人特殊标记">
              {markerName && (
                <div className="dossier-counter">
                  <span>{markerName}</span>
                  <b>{e.markers}</b>
                </div>
              )}
              {e.entrepreneur === "paul" && (
                <div className="dossier-counter">
                  <span>帮派影响力</span>
                  <b>
                    {e.gangSlots.length}
                    <small> / 4</small>
                  </b>
                </div>
              )}
              {hasContract && (
                <div className="security-contract">
                  <span aria-hidden="true">✚</span>
                  <b>终身安保合约</b>
                  <small>岩蹄安保 · 已签署</small>
                </div>
              )}
            </div>
          </aside>
          <section
            className="dossier-decisions"
            aria-labelledby="dossier-decisions-title"
          >
            <div className="dossier-section-heading">
              <div>
                <span className="dossier-section-label">02 / 抉择记录</span>
                <h4 id="dossier-decisions-title">在荒野留下你的选择</h4>
              </div>
              <small>{e.dilemmas.length} / 4</small>
            </div>
            <p>
              {identity
                ? "第 1、3、5、7 回合，各留下一张抉择。点击已归档的牌面查看效果。"
                : "本局使用常规规则。专属企业家与抉择可在创建房间时开启。"}
            </p>
            <div className="oripathy-dilemma-history">
              {[1, 3, 5, 7].map((round, index) => {
                const d = e.dilemmas.find((d) => d.round === round);
                const face =
                  identity && d
                    ? oripathyArt(
                        identity.dilemmas[index] +
                          (d.side === "B" ? "-back" : ""),
                      )
                    : null;
                return (
                  <div className="dossier-decision-slot" key={round}>
                    <span className="dossier-round">
                      <b>{String(round).padStart(2, "0")}</b> 回合
                    </span>
                    {d && face ? (
                      <button
                        className={`dossier-decision-card ${d.used ? "is-used" : ""}`}
                        aria-label={`查看第 ${round} 回合 ${d.side} 方案`}
                        onClick={() =>
                          onDetail({
                            title: `第 ${round} 回合 · ${d.side} 方案`,
                            image: face,
                          })
                        }
                      >
                        <img
                          src={face}
                          alt={`第 ${round} 回合 ${d.side} 方案牌面`}
                          draggable={false}
                        />
                        <b className="dossier-choice-seal">{d.side}</b>
                        <span className="dossier-decision-status">
                          {d.marker
                            ? d.used
                              ? "本回合已使用"
                              : "本回合可使用"
                            : "持续效果"}
                        </span>
                      </button>
                    ) : (
                      <div className="dossier-empty-card">
                        <span aria-hidden="true">◇</span>
                        <b>{identity ? "待抉择" : "常规规则"}</b>
                        <small>
                          {identity ? `第 ${round} 回合开启` : "未启用抉择"}
                        </small>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="oripathy-public-status" aria-label="公共供应记录">
              <span>
                场上安保影响力{" "}
                <b>
                  {game.oripathy!.security.length}
                  <small> / 8</small>
                </b>
              </span>
              <span>
                可签安保合约 <b>{2 - game.oripathy!.contracts.length}</b>
              </span>
              <span>
                剩余授勋 <b>{game.oripathy!.awards.length}</b>
              </span>
            </div>
          </section>
        </div>
        {!!e.awards.length && (
          <section className="dossier-attachments">
            <h4>
              <span>03</span> 获得的授勋 <small>{e.awards.length} 枚</small>
            </h4>
            <div className="oripathy-reference-list">
              {e.awards.map((face) =>
                cardButton(face, "梅兰德授勋", oripathyArt(face)),
              )}
            </div>
          </section>
        )}
        {!!e.blueprint.length && (
          <section className="dossier-attachments">
            <h4>
              <span>附件</span> 城市化区域 · 私有建设图纸{" "}
              <small>{e.blueprint.length} 张</small>
            </h4>
            <p>可按建设规则筹建，或通过马丁的抉择与公共供应交换。</p>
            <div className="oripathy-reference-list">
              {e.blueprint.map((instance) => {
                const c = FACILITY_BY_ID[instance.split("@")[0]];
                return cardButton(
                  instance,
                  c.name +
                    " · " +
                    { red: "红", blue: "蓝", yellow: "黄", wild: "彩" }[
                      c.color
                    ],
                  c.image,
                  facilityText(c.id),
                );
              })}
            </div>
          </section>
        )}
        {p.id === game.me && !!p.coveredFlows?.length && (
          <section className="dossier-attachments">
            <h4>
              <span>私密</span> 额外盖放的流形
            </h4>
            <div className="oripathy-reference-list">
              {p.coveredFlows.map((id) => {
                const c = ROLE_BY_ID[id];
                return cardButton(
                  id,
                  c.name,
                  c.image,
                  `策略：${c.strategy}\n计谋：${c.tactic}`,
                );
              })}
            </div>
          </section>
        )}
        <footer className="dossier-footer">
          <span>ORIPATHY DILEMMA</span>
          <i aria-hidden="true" />
          <span>档案随对局更新</span>
        </footer>
      </article>
    </section>
  );
}
