import type {
  InfluencePlacement,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";

/** Both main-action previews and resumed placement effects use server options. */
export function placementOptions(game: PlayerView): InfluencePlacement[] {
  if (game.decision?.kind === "place")
    return game.actions.flatMap((action) =>
      action.target && action.command.optionId
        ? [
            {
              target: action.target,
              optionId: action.command.optionId,
              label: action.label,
            },
          ]
        : [],
    );
  return game.influencePlacements ?? [];
}

export function PlacementPreview({
  game,
  selected,
  disabled,
  onSelect,
  onCancel,
  onCommit,
}: {
  game: PlayerView;
  selected: InfluencePlacement;
  disabled: boolean;
  onSelect: (choice: InfluencePlacement) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const slots = placementOptions(game).filter(
    (choice) => choice.target === selected.target,
  );
  const me = game.players.find((p) => p.id === game.me)!;
  return (
    <section className="placement-panel" aria-label="影响力放置确认">
      <header>
        <small>
          {game.decision?.kind === "place"
            ? game.decision.title
            : "主要行动 · 部署"}
        </small>
        <h3>
          放置影响力 <span>{selected.target}</span>
        </h3>
      </header>
      <p>
        使用 1 枚影响力标记 · 储备 {me.availableMarkers} →{" "}
        {me.availableMarkers - 1}
      </p>
      {slots.length > 1 && (
        <div className="placement-slots" role="group" aria-label="选择空位">
          {slots.map((choice) => (
            <button
              key={choice.optionId}
              disabled={disabled}
              aria-pressed={choice.optionId === selected.optionId}
              onClick={() => onSelect(choice)}
            >
              空位 {Number(choice.optionId.split(":").at(-1)) + 1}
            </button>
          ))}
        </div>
      )}
      <div className="placement-controls">
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={onCancel}
        >
          取消放置
        </button>
        <button
          className="primary-button"
          disabled={disabled}
          onClick={onCommit}
        >
          确认放置 →
        </button>
      </div>
      <small className="placement-hint">可点击其他高亮位置改选</small>
    </section>
  );
}
