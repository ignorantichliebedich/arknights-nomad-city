import { useState, type CSSProperties } from "react";
import {
  ENTREPRENEURS,
  oripathyArt,
} from "../../../../packages/rules/src/oripathy-data.ts";
import {
  FACILITY_BY_ID,
  PLAYER_COLORS,
  ROLE_BY_ID,
  facilityText,
} from "../../../../packages/rules/src/data.ts";
import type {
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import type { CardDetail } from "./ActionComposer.tsx";

/** Large printed faces for irreversible identity and A/B decisions. */
export function OripathyChoices({
  game,
  selected,
  disabled,
  onSelect,
  onDetail,
}: {
  game: PlayerView;
  selected: LegalAction | null;
  disabled: boolean;
  onSelect: (action: LegalAction) => void;
  onDetail: (detail: CardDetail) => void;
}) {
  const dilemma = game.decision?.kind === "o:dilemma";
  return (
    <div
      className={`oripathy-choices ${dilemma ? "dilemma-choices" : "entrepreneur-choices"}`}
    >
      {game.actions.map((action) => {
        const option = game.decision!.options.find(
          (o) => o.id === action.command.optionId,
        )!;
        return (
          <article
            key={action.id}
            className={selected?.id === action.id ? "is-picked" : ""}
          >
            <button
              className="oripathy-choice-art"
              aria-label={action.label}
              aria-pressed={selected?.id === action.id}
              disabled={disabled}
              onClick={() => onSelect(action)}
            >
              <img src={option.image} alt={option.label} draggable={false} />
              <span>
                {selected?.id === action.id
                  ? "✓ 已选中"
                  : dilemma
                    ? `选择 ${option.id} 方案`
                    : "选择这位企业家"}
              </span>
            </button>
            <button
              className="oripathy-face-detail"
              onClick={() =>
                onDetail({ title: option.label, image: option.image })
              }
            >
              查看完整牌面 ↗
            </button>
            <p>{option.label}</p>
          </article>
        );
      })}
    </div>
  );
}

export function OripathyPanel({
  game,
  onDetail,
}: {
  game: PlayerView;
  onDetail: (d: CardDetail) => void;
}) {
  const [playerId, setPlayerId] = useState(game.me);
  const p = game.players.find((p) => p.id === playerId)!;
  const e = p.oripathy!;
  const identity = ENTREPRENEURS.find((who) => who.id === e.entrepreneur);
  const markerName = (
    { thiago: "声望", agnes: "指令", pioneer: "收集标记" } as Record<
      string,
      string
    >
  )[e.entrepreneur ?? ""];
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
      <img src={image} alt={title} />
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
          >
            {player.name}
            {player.id === game.me ? " · 你" : ""}
          </button>
        ))}
      </nav>
      <header className="oripathy-dossier-heading">
        <div>
          <small>感染者 · 拓荒档案</small>
          <h3>{identity?.name ?? "常规拓荒"}</h3>
        </div>
        {markerName && (
          <span>
            {markerName}
            <b>{e.markers}</b>
          </span>
        )}
        {e.entrepreneur === "paul" && (
          <span>
            帮派影响力<b>{e.gangSlots.length} / 4</b>
          </span>
        )}
        {game.oripathy!.contracts.includes(p.id) && (
          <span className="security-contract">终身安保合约 ✚</span>
        )}
      </header>
      {identity && (
        <div className="oripathy-identity-row">
          {cardButton(identity.id, "企业家能力", oripathyArt(identity.face))}
          <div>
            <h4>企业家抉择</h4>
            <p>第 1、3、5、7 回合选择 A 或 B 方案，保留所选效果至游戏结束。</p>
            <div className="oripathy-dilemma-history">
              {[1, 3, 5, 7].map((round, index) => {
                const d = e.dilemmas.find((d) => d.round === round);
                return d ? (
                  <button
                    key={round}
                    className={d.used ? "is-used" : ""}
                    onClick={() =>
                      onDetail({
                        title: `第 ${round} 回合 · ${d.side} 方案`,
                        image: oripathyArt(
                          identity.dilemmas[index] +
                            (d.side === "B" ? "-back" : ""),
                        ),
                      })
                    }
                  >
                    <small>第 {round} 回合</small>
                    <b>{d.side}</b>
                    <span>
                      {d.marker
                        ? d.used
                          ? "本回合已使用"
                          : "本回合可使用"
                        : "持续效果"}
                    </span>
                  </button>
                ) : (
                  <div key={round}>
                    <small>第 {round} 回合</small>
                    <b>—</b>
                    <span>等待抉择</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="oripathy-public-status">
        <span>
          安保影响力 <b>{game.oripathy!.security.length} / 8</b>
        </span>
        <span>
          剩余终身合约 <b>{2 - game.oripathy!.contracts.length}</b>
        </span>
        <span>
          剩余授勋 <b>{game.oripathy!.awards.length}</b>
        </span>
      </div>
      {!!e.awards.length && (
        <section>
          <h4>获得的授勋</h4>
          <div className="oripathy-reference-list">
            {e.awards.map((face) =>
              cardButton(face, "梅兰德授勋", oripathyArt(face)),
            )}
          </div>
        </section>
      )}
      {!!e.blueprint.length && (
        <section>
          <h4>城市化区域 · 私有建设图纸</h4>
          <p>
            这些设施可按建设规则直接筹建，也可通过马丁的抉择与公共供应交换。
          </p>
          <div className="oripathy-reference-list">
            {e.blueprint.map((instance) => {
              const c = FACILITY_BY_ID[instance.split("@")[0]];
              return cardButton(
                instance,
                c.name +
                  " · " +
                  { red: "红", blue: "蓝", yellow: "黄", wild: "彩" }[c.color],
                c.image,
                facilityText(c.id),
              );
            })}
          </div>
        </section>
      )}
      {p.id === game.me && !!p.coveredFlows?.length && (
        <section>
          <h4>额外盖放的流形</h4>
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
    </section>
  );
}
