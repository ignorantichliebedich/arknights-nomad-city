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

export { EntrepreneurDossier as OripathyPanel } from "./EntrepreneurDossier.tsx";
