import type { CSSProperties } from "react";
import type {
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import type { CardDetail } from "./ActionComposer.tsx";
import { EnterpriseRuleText } from "./EnterpriseRuleText.tsx";

/** The original event card and its server-authorized outcomes form one encounter. */
export function EventEncounter({
  game,
  selected,
  disabled,
  onSelect,
  onCommit,
  onDetail,
}: {
  game: PlayerView;
  selected: LegalAction | null;
  disabled: boolean;
  onSelect: (choice: LegalAction | null) => void;
  onCommit: () => void;
  onDetail: (detail: CardDetail) => void;
}) {
  const decision = game.decision!;
  const art = decision.options.find((option) => option.image)?.image;
  const title = decision.title.replace(/ · 选择事件结果$/, "");
  const tier = art?.includes("cards-154/")
    ? "green"
    : art?.includes("cards-156/")
      ? "red"
      : "yellow";
  const choices = game.actions.filter(
    (action) => action.command.type === "choose",
  );
  const choice = choices.find((action) => action.id === selected?.id);
  return (
    <section
      className="event-encounter"
      data-tier={tier}
      aria-label={`${title}事件卡与结果`}
    >
      {art ? (
        <button
          className="event-art"
          aria-label="查看事件完整牌面"
          onClick={() =>
            onDetail({
              title: decision.title,
              image: art,
              text: decision.options.map((option) => option.label).join("\n"),
            })
          }
        >
          <img src={art} alt={title} draggable={false} />
          <span className="event-magnify" aria-hidden="true">
            ↗
          </span>
        </button>
      ) : (
        <h3 className="event-card-title">{title}</h3>
      )}
      <div className="event-choice-panel">
        <div
          className="action-list event-options"
          role="group"
          aria-label="事件结果选项"
          style={
            {
              "--event-options": Math.min(choices.length, 3) || 1,
            } as CSSProperties
          }
        >
          {choices.map((action, i) => (
            <button
              key={action.id}
              className={`action-button event-option ${choice?.id === action.id ? "picked" : ""}`}
              aria-label={action.label}
              aria-pressed={choice?.id === action.id}
              disabled={disabled}
              onClick={() => onSelect(action)}
            >
              <span className="event-option-number" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="event-option-text">
                <EnterpriseRuleText text={action.label} />
              </span>
              <span className="event-option-mark" aria-hidden="true">
                {choice?.id === action.id ? "✓" : "›"}
              </span>
            </button>
          ))}
        </div>
        <div className="event-resolution">
          <p className="event-choice-note" aria-live="polite">
            <span>{choice ? "已选 · 等你确认" : "你的选择"}</span>
            <strong>{choice?.label ?? "点选一个结果，再确认结算"}</strong>
          </p>
          <div className="event-confirm-buttons">
            <button
              className="secondary-button"
              disabled={!choice || disabled}
              onClick={() => onSelect(null)}
            >
              取消选择
            </button>
            <button
              className="primary-button"
              disabled={!choice || disabled}
              onClick={onCommit}
            >
              确认选择 →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
