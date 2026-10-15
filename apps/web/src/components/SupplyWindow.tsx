import { useEffect, useRef, useState } from "react";
import {
  FACILITY_BY_ID,
  PATTERN_BY_ID,
  RESOURCE_NAMES,
  facilityText,
} from "../../../../packages/rules/src/data.ts";
import type {
  LegalAction,
  PlayerView,
  Resource,
} from "../../../../packages/rules/src/types.ts";
import type { CardDetail } from "./ActionComposer.tsx";
import { ResourceToken } from "./TablePieces.tsx";

export function SupplyWindow({
  game,
  disabled,
  onDetail,
  onAction,
}: {
  game: PlayerView;
  disabled: boolean;
  onDetail: (d: CardDetail) => void;
  onAction: (a: LegalAction, instance?: string) => void;
}) {
  const build = game.actions.find(
    (a) => a.command.type === "main" && a.command.action === "build",
  );
  return (
    <section className="supply-workshop">
      <header className="supply-intro">
        <div>
          <small>公共设施供应</small>
          <h3>为城市挑选下一座设施</h3>
        </div>
        <span>牌堆 {game.deckCounts.facility} 张</span>
      </header>
      <p>
        查看费用与能力，选定设施后依次安排城市格和付款。建设完成后展示补入的新牌。
      </p>
      <div className="supply-cards">
        {game.market.map((instance, i) => {
          const card = FACILITY_BY_ID[instance.split("@")[0]];
          return (
            <article
              className={`supply-card ${card.color}`}
              key={instance}
              style={{ animationDelay: `${i * 65}ms` }}
            >
              <button
                className="supply-card-art"
                onClick={() =>
                  onDetail({
                    title: card.name,
                    image: card.image,
                    text: facilityText(card.id),
                  })
                }
                aria-label={`查看${card.name}的牌面`}
              >
                <img src={card.image} alt={card.name} />
              </button>
              <strong>
                {card.name}
                <small> +{card.points} 分</small>
              </strong>
              <div className="supply-cost">
                {Object.entries(card.cost).map(([r, n]) => (
                  <span key={r}>
                    <ResourceToken type={r as Resource} />
                    {n}
                  </span>
                ))}
                <small>或 {card.cashCost} 金券</small>
              </div>
              <button
                className="secondary-button"
                disabled={disabled || !build}
                onClick={() => build && onAction(build, instance)}
              >
                筹建这座设施 →
              </button>
            </article>
          );
        })}
      </div>
      <header className="supply-intro">
        <div>
          <small>公共城市样式</small>
          <h3>用设施组合宣告城市成就</h3>
        </div>
      </header>
      <div className="supply-patterns">
        {game.patterns.map((id) => {
          const card = PATTERN_BY_ID[id];
          const declare = game.actions.find(
            (a) => a.command.type === "declare" && a.command.patternId === id,
          );
          return (
            <article key={id} className={declare ? "can-declare" : ""}>
              <button
                onClick={() =>
                  onDetail({
                    title: card.name,
                    image: card.image,
                    text: card.description,
                  })
                }
              >
                <img src={card.image} alt={card.name} />
              </button>
              <div>
                <strong>{card.name}</strong>
                <span>
                  等级 {card.level} · {card.score} 分
                </span>
                <button
                  className="secondary-button"
                  disabled={disabled}
                  onClick={() =>
                    declare
                      ? onAction(declare)
                      : onDetail({
                          title: card.name,
                          image: card.image,
                          text: card.description,
                        })
                  }
                >
                  {declare ? "预览宣告 →" : "查看组合条件"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function PatternPicker({
  game,
  selected,
  disabled,
  onSelect,
  onDetail,
}: {
  game: PlayerView;
  selected: LegalAction | null;
  disabled: boolean;
  onSelect: (a: LegalAction | null) => void;
  onDetail: (d: CardDetail) => void;
}) {
  const option = game.decision?.options.find(
    (o) => o.id === selected?.command.optionId,
  );
  const patternId = game.decision?.options.find((o) => o.preview?.patternId)
    ?.preview?.patternId;
  const card = patternId ? PATTERN_BY_ID[patternId] : undefined;
  const cells = option?.preview?.cells ?? [];
  const me = game.players.find((p) => p.id === game.me)!;
  return (
    <div className="pattern-picker">
      {card && (
        <aside>
          <button
            onClick={() =>
              onDetail({
                title: card.name,
                image: card.image,
                text: card.description,
              })
            }
          >
            <img src={card.image} alt={card.name} />
          </button>
          <h3>
            {card.name} · +{card.score} 分
          </h3>
          <p>{card.description}</p>
        </aside>
      )}
      <div>
        <h3>选择使用的设施组合</h3>
        <p>高亮的设施将在确认后用于本次宣告，已经用过的设施不能再次参与。</p>
        <div className="pattern-city-grid" aria-label="宣告使用的城市格">
          {Array.from({ length: 12 }, (_, i) => {
            const built = me.built[i];
            return (
              <div
                key={i}
                className={`${cells.includes(String(i)) ? "matched" : ""} ${built?.used ? "used" : ""}`}
                data-cell={i}
              >
                {built && (
                  <img
                    src={FACILITY_BY_ID[built.cardId].image}
                    alt={FACILITY_BY_ID[built.cardId].name}
                  />
                )}
                <small>
                  {i + 1}
                  {built?.used
                    ? " · 已使用"
                    : cells.includes(String(i))
                      ? " · 本次宣告"
                      : ""}
                </small>
              </div>
            );
          })}
        </div>
        <div className="pattern-combinations">
          {game.actions.map((a, i) => (
            <button
              key={a.id}
              disabled={disabled}
              className={`action-button ${selected?.id === a.id ? "picked" : ""}`}
              aria-pressed={selected?.id === a.id}
              onClick={() => onSelect(a)}
            >
              <b>组合 {i + 1}</b>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type TableReceipt = {
  title: string;
  image: string;
  name: string;
  cells: string[];
  changes: { type: Resource; value: number }[];
  incoming: string[];
};
export function useTableReceipt(game?: PlayerView | null) {
  const previous = useRef<PlayerView | null>(null);
  const [receipt, setReceipt] = useState<TableReceipt | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = game ?? null;
    if (
      !before ||
      !game ||
      before.me !== game.me ||
      before.revision === game.revision
    )
      return;
    const old = before.players.find((p) => p.id === game.me)!;
    const me = game.players.find((p) => p.id === game.me)!;
    const cells = Object.keys(me.built).filter(
      (c) => !old.built[c] || old.built[c].cardId !== me.built[c].cardId,
    );
    const claim =
      me.claims.length > old.claims.length ? me.claims.at(-1) : undefined;
    const incoming = game.market.filter((id) => !before.market.includes(id));
    const actor =
      before.decision?.playerId ?? before.players[before.active]?.id;
    const supplyChanged = actor === game.me && incoming.length > 0;
    if (!cells.length && !claim && !supplyChanged) return;
    const card = claim
      ? PATTERN_BY_ID[claim.patternId]
      : FACILITY_BY_ID[
          cells.length ? me.built[cells[0]].cardId : incoming[0].split("@")[0]
        ];
    setReceipt({
      title: claim
        ? "城市样式宣告成功"
        : cells.length
          ? "设施已落位"
          : "设施供应已更新",
      image: card.image,
      name: card.name,
      cells: claim
        ? Object.keys(me.built).filter(
            (c) => me.built[c].used && !old.built[c]?.used,
          )
        : cells,
      changes: (Object.keys(me.wallet) as Resource[])
        .filter((r) => me.wallet[r] !== old.wallet[r])
        .map((type) => ({ type, value: me.wallet[type] - old.wallet[type] })),
      incoming,
    });
  }, [game?.revision, game?.me]);
  return { receipt, closeReceipt: () => setReceipt(null) };
}
export function ReceiptContents({
  receipt,
  onClose,
}: {
  receipt: TableReceipt;
  onClose: () => void;
}) {
  return (
    <div className="table-receipt">
      <img
        className="receipt-main-card"
        src={receipt.image}
        alt={receipt.name}
      />
      <div>
        <small>本次行动结果</small>
        <h3>{receipt.name}</h3>
        {receipt.cells.length > 0 ? (
          <p>城市格 {receipt.cells.map((c) => Number(c) + 1).join("、")}</p>
        ) : (
          <p>查看新补入的设施，再继续安排下一步。</p>
        )}
        <div className="receipt-changes">
          {receipt.changes.map((c) => (
            <span key={c.type}>
              <ResourceToken type={c.type} />
              <b>
                {c.value > 0 ? "+" : ""}
                {c.value}
              </b>
              {RESOURCE_NAMES[c.type]}
            </span>
          ))}
        </div>
        {receipt.incoming.length > 0 && (
          <section>
            <h4>供应区补入 {receipt.incoming.length} 张设施</h4>
            <div className="receipt-refill">
              {receipt.incoming.map((id) => (
                <img
                  key={id}
                  src={FACILITY_BY_ID[id.split("@")[0]].image}
                  alt={FACILITY_BY_ID[id.split("@")[0]].name}
                />
              ))}
            </div>
          </section>
        )}
        <button className="primary-button" onClick={onClose}>
          继续拓荒 →
        </button>
      </div>
    </div>
  );
}
