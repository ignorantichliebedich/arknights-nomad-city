import type {
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import type { CardDetail } from "./ActionComposer.tsx";
import {
  ENTREPRENEURS,
  oripathyArt,
} from "../../../../packages/rules/src/oripathy-data.ts";

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
  const remaining = game.oripathy?.entrepreneurs.length ?? game.actions.length;
  const choices = dilemma
    ? game.actions.map((action) => {
        const option = game.decision!.options.find(
          (o) => o.id === action.command.optionId,
        )!;
        return {
          id: option.id,
          label: option.label,
          image: option.image,
          action,
          owner: undefined as string | undefined,
        };
      })
    : ENTREPRENEURS.map((who) => ({
        id: who.id,
        label: who.name,
        image: oripathyArt(who.face),
        action: game.actions.find(
          (action) => action.command.optionId === who.id,
        ),
        owner: game.players.find(
          (player) => player.oripathy?.entrepreneur === who.id,
        )?.name,
      }));
  return (
    <>
      {!dilemma && (
        <div className="identity-offer-summary" role="status">
          <strong>五位企业家 · 剩余 {remaining} 位可选</strong>
          <span>从末位玩家开始逆序选择；灰色牌已被其他玩家选走。</span>
        </div>
      )}
      <div
        className={`oripathy-choices ${dilemma ? "dilemma-choices" : "entrepreneur-choices"}`}
        aria-label={dilemma ? "抉择方案" : "五位企业家名册"}
      >
        {choices.map(({ id, label, image, action, owner }) => {
          const picked = !!action && selected?.id === action.id;
          return (
            <article
              key={id}
              data-identity={dilemma ? undefined : id}
              className={`${picked ? "is-picked" : ""} ${owner ? "is-taken" : ""}`}
            >
              <button
                className="oripathy-choice-art"
                aria-label={
                  action?.label ??
                  `${label} · ${owner ? `已由${owner}选择` : "不可选择"}`
                }
                aria-pressed={picked}
                disabled={disabled || !action}
                onClick={() => action && onSelect(action)}
              >
                <img src={image} alt={label} draggable={false} />
                <span>
                  {!action
                    ? owner
                      ? `${owner}已选`
                      : "不可选择"
                    : picked
                      ? "✓ 已选中"
                      : dilemma
                        ? `选择 ${id} 方案`
                        : "选择这位企业家"}
                </span>
              </button>
              <button
                className="oripathy-face-detail"
                onClick={() => onDetail({ title: label, image })}
              >
                查看完整牌面 ↗
              </button>
              <p>{label}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}

export { EntrepreneurDossier as OripathyPanel } from "./EntrepreneurDossier.tsx";
