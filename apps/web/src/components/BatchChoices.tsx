import { RESOURCE_NAMES } from "../../../../packages/rules/src/data.ts";
import type {
  PlayerView,
  Resource,
} from "../../../../packages/rules/src/types.ts";

export function BatchChoices({
  game,
  selected,
  disabled,
  onChange,
  onCommit,
}: {
  game: PlayerView;
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
  onCommit: () => void;
}) {
  const decision = game.decision!,
    batch = decision.batch!;
  return (
    <section className="batch-choices" aria-label={batch.label}>
      <div className="batch-heading">
        <span className="eyebrow">EXPEDITION SUPPLIES</span>
        <h3>{batch.label}</h3>
        <p>搭配好数量，再一起确认。</p>
      </div>
      <div className="batch-resource-grid">
        {decision.options.map((option) => {
          const amount = selected.filter((id) => id === option.id).length;
          const name = RESOURCE_NAMES[option.id as Resource] ?? option.label;
          return (
            <article key={option.id} className={amount ? "is-picked" : ""}>
              <img src={`/assets/table-resource-${option.id}.webp`} alt="" />
              <strong>{name}</strong>
              <div className="batch-stepper">
                <button
                  aria-label={`减少 1 ${name}`}
                  disabled={disabled || !amount}
                  onClick={() => {
                    const ids = [...selected];
                    ids.splice(ids.indexOf(option.id), 1);
                    onChange(ids);
                  }}
                >
                  −
                </button>
                <output aria-label={`已选${name}`}>{amount}</output>
                <button
                  aria-label={`增加 1 ${name}`}
                  disabled={
                    disabled ||
                    amount >= batch.limits[option.id] ||
                    selected.length >= batch.count
                  }
                  onClick={() => onChange([...selected, option.id])}
                >
                  ＋
                </button>
              </div>
              {decision.kind === "pay-basic" && (
                <small>可支付 {batch.limits[option.id]} 个</small>
              )}
            </article>
          );
        })}
      </div>
      <div className="batch-confirm">
        <span role="status">
          已选 {selected.length} / {batch.count}
        </span>
        <button
          className="secondary-button"
          disabled={disabled || !selected.length}
          onClick={() => onChange([])}
        >
          清空选择
        </button>
        <button
          className="primary-button"
          disabled={disabled || selected.length !== batch.count}
          onClick={onCommit}
        >
          确认{batch.label} →
        </button>
      </div>
    </section>
  );
}
