import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  FACILITY_BY_ID,
  facilityText,
  PATTERN_BY_ID,
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
  ROLE_BY_ID,
} from "../../../../packages/rules/src/data.ts";
import type {
  Color,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import { ResourceStock } from "./ResourceStock.tsx";
import { PresidentBadge } from "./TableMotion.tsx";

type CityPlayer = PlayerView["players"][number];
type ShowDetail = (value: {
  title: string;
  image?: string;
  text?: string;
}) => void;
const COLOR_NAMES: Record<Color, string> = {
  red: "红色设施",
  blue: "蓝色设施",
  yellow: "黄色设施",
  wild: "彩色设施",
};
const cells = Array.from({ length: 12 }, (_, i) => i);

export function CityPanel({
  game,
  playerId,
  onPlayerChange,
  onDetail,
}: {
  game: PlayerView;
  playerId: string;
  onPlayerChange: (id: string) => void;
  onDetail: ShowDetail;
}) {
  const player = game.players.find((p) => p.id === playerId)!;
  return (
    <div className="city-inspector">
      <div className="city-roster" role="group" aria-label="切换城市所属玩家">
        {game.players.map((p) => (
          <button
            key={p.id}
            className="city-owner"
            style={{ "--seat-color": PLAYER_COLORS[p.seat] } as CSSProperties}
            aria-label={`查看${p.name}的城市`}
            aria-pressed={p.id === playerId}
            title={p.name}
            onClick={() => onPlayerChange(p.id)}
          >
            <img src={`/assets/avatar-${p.seat}.webp?v=founders`} alt="" />
            <span className="city-owner-name">{p.name}</span>
            {p.id === game.me && <small>你</small>}
            <span className="city-owner-symbol" aria-hidden="true">
              {PLAYER_SYMBOLS[p.seat]}
            </span>
          </button>
        ))}
      </div>
      {/* Changing the owner resets inspection and number animations; live updates do not. */}
      <CityContents
        key={player.id}
        player={player}
        president={game.players[game.first]?.id === player.id}
        onDetail={onDetail}
      />
    </div>
  );
}

function CityContents({
  player: p,
  president,
  onDetail,
}: {
  player: CityPlayer;
  president: boolean;
  onDetail: ShowDetail;
}) {
  const [inspected, setInspected] = useState(() =>
    p.built[7] ? 7 : Number(Object.keys(p.built)[0] ?? 0),
  );
  const previewId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const built = p.built[inspected];
  const card = built ? FACILITY_BY_ID[built.cardId] : null;
  const row = Math.floor(inspected / 3) + 1;
  const column = (inspected % 3) + 1;
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = {
      ArrowLeft: index % 3 > 0 ? index - 1 : index,
      ArrowRight: index % 3 < 2 ? index + 1 : index,
      ArrowUp: index >= 3 ? index - 3 : index,
      ArrowDown: index < 9 ? index + 3 : index,
      Home: 0,
      End: 11,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)
      ?.focus();
  }
  function showCard(id: string) {
    const facility = FACILITY_BY_ID[id];
    onDetail({
      title: facility.name,
      image: facility.image,
      text: facilityText(id),
    });
  }
  return (
    <div
      className="city-contents"
      style={{ "--seat-color": PLAYER_COLORS[p.seat] } as CSSProperties}
    >
      <section className="city-resource-tray" aria-label={`${p.name}的资源`}>
        <div className="city-resource-heading">
          <h3>
            <span className="owner-symbol" aria-hidden="true">
              {PLAYER_SYMBOLS[p.seat]}
            </span>
            {p.name}的资源
          </h3>
          <span>
            可用标记 <b>{p.availableMarkers}</b>
            <i aria-hidden="true"> / </i>手牌 <b>{p.handCount}</b>
          </span>
        </div>
        <ResourceStock wallet={p.wallet} />
      </section>
      <div className="city-overview">
        <section
          className="city-model-board"
          aria-label={`${p.name}的城市布局`}
        >
          <div className="city-board-heading">
            <div>
              <h3>城市布局</h3>
              <span>停靠 {p.city ?? "等待入场"}</span>
            </div>
            {president && <PresidentBadge compact />}
            <strong>
              {Object.keys(p.built).length}
              <small> / 12 设施</small>
            </strong>
          </div>
          <div
            className="city-grid"
            ref={gridRef}
            role="group"
            aria-label="3 列 4 行城市格位"
          >
            {cells.map((index) => {
              const facility = p.built[index];
              const data = facility ? FACILITY_BY_ID[facility.cardId] : null;
              return (
                <button
                  key={index}
                  className={`city-cell ${data ? `built facility-${data.color}` : "empty"} ${facility?.used ? "pattern-used" : ""} ${inspected === index ? "is-inspected" : ""}`}
                  data-cell={index}
                  aria-label={`城市 ${index + 1} · ${data?.name ?? "空闲格位"}${facility?.used ? " · 已用于样式" : ""}`}
                  aria-controls={previewId}
                  onPointerEnter={() => setInspected(index)}
                  onFocus={() => setInspected(index)}
                  onKeyDown={(e) => moveFocus(e, index)}
                  onClick={() =>
                    data ? showCard(data.id) : setInspected(index)
                  }
                >
                  {data ? (
                    <img src={data.image} alt={data.name} draggable={false} />
                  ) : (
                    <span className="empty-slot-mark" aria-hidden="true">
                      ＋
                    </span>
                  )}
                  <span className="city-cell-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{data?.name ?? "空闲"}</strong>
                  {!!facility?.layers?.length && (
                    <span className="city-layer-count">
                      {facility.layers.length + 1} 层
                    </span>
                  )}
                  {facility?.used && (
                    <span className="city-cell-used" aria-hidden="true">
                      已宣告
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="city-board-hint">
            3 列 × 4 行<span>悬停预览 · 点击放大</span>
          </p>
        </section>
        <section
          className="city-building-preview"
          id={previewId}
          aria-label="建筑详情"
        >
          <div className="building-preview-heading">
            <span>
              第 {row} 行 · 第 {column} 列
            </span>
            <span>{card ? COLOR_NAMES[card.color] : "待建设"}</span>
          </div>
          {card ? (
            <div
              className="building-preview-content"
              key={`${inspected}:${card.id}`}
            >
              <button
                className="building-preview-art"
                aria-label={`放大${card.name}牌面`}
                onClick={() => showCard(card.id)}
              >
                <img
                  src={card.image}
                  alt={`${card.name}完整牌面`}
                  draggable={false}
                />
                <span>查看原始牌面 ↗</span>
              </button>
              <div className="building-preview-copy">
                <div className={`building-color-rule facility-${card.color}`} />
                <h3 aria-live="polite">{card.name}</h3>
                <div className="building-tags">
                  <span>{card.points} 设施分</span>
                  {card.unique && <span>唯一</span>}
                  <span className={built.used ? "is-used" : ""}>
                    {built.used ? "已用于样式" : "尚未用于样式"}
                  </span>
                </div>
                <h4>效果说明</h4>
                {facilityText(card.id)
                  .split("\n")
                  .map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                {!!built.layers?.length && (
                  <div className="buried-facilities" aria-label="下层设施">
                    <p>下层设施保留颜色与唯一性，不参与样式和相邻入场效果。</p>
                    {built.layers.map((layer, index) => (
                      <button
                        key={index}
                        onClick={() => showCard(layer.cardId)}
                      >
                        下层 {index + 1} · {FACILITY_BY_ID[layer.cardId].name} ↗
                      </button>
                    ))}
                  </div>
                )}
                <p className="building-preview-note">
                  移到其他格位即可查看下一座建筑。
                </p>
              </div>
            </div>
          ) : (
            <div className="building-empty-preview">
              <img src={`/assets/city-model-${p.seat}.svg`} alt="" />
              <h3 aria-live="polite">空闲格位</h3>
              <p>这里还没有设施。</p>
              <span>将鼠标移到已建建筑上，查看牌面与效果。</span>
            </div>
          )}
        </section>
      </div>
      {p.claims.length > 0 && (
        <section className="city-claims" aria-label="已宣告的城市样式">
          <h3>城市样式</h3>
          {p.claims.map((c, i) => (
            <span key={i}>
              {PATTERN_BY_ID[c.patternId].name} ·{" "}
              {c.uses === -1 ? "每回合" : `${c.uses} 次剩余`}
            </span>
          ))}
        </section>
      )}
      <PersistentEffects player={p} onDetail={onDetail} />
      <div className="city-role-zones">
        {[
          { title: "角色弃牌区", cards: p.discard },
          { title: "已退役角色", cards: p.removed },
        ].map(({ title, cards }) => (
          <section className="discard-list" aria-label={title} key={title}>
            <h3>
              {title}
              <small>{cards.length} 张</small>
            </h3>
            <div>
              {cards.map((id) => (
                <button
                  className="subtle-button"
                  key={id}
                  onClick={() =>
                    onDetail({
                      title: ROLE_BY_ID[id].name,
                      image: ROLE_BY_ID[id].image,
                      text: `策略：${ROLE_BY_ID[id].strategy}\n计谋：${ROLE_BY_ID[id].tactic}`,
                    })
                  }
                >
                  {ROLE_BY_ID[id].name}
                </button>
              ))}
              {!cards.length && <span className="muted">暂无角色</span>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
function PersistentEffects({
  player,
  onDetail,
}: {
  player: PlayerView["players"][number];
  onDetail: (value: { title: string; image?: string; text?: string }) => void;
}) {
  if (!player.persistent.length) return null;
  return (
    <section
      className="persistent-effects"
      aria-label={`${player.name}的持续角色`}
    >
      <div className="section-label">
        <h2>持续角色</h2>
        <span>留在场上持续生效</span>
      </div>
      <div className="persistent-list">
        {player.persistent.map((effect) => {
          const role = ROLE_BY_ID[effect.roleId];
          return (
            <article className="persistent-effect" key={effect.roleId}>
              <button
                className="persistent-role"
                onClick={() =>
                  onDetail({
                    title: role.name,
                    image: role.image,
                    text: `策略：${role.strategy}\n计谋：${role.tactic}`,
                  })
                }
              >
                <img src={role.image} alt={role.name} loading="lazy" />
                <span>
                  <strong>{role.name}</strong>
                  <small>
                    {effect.roleId === "closure"
                      ? `待建设施 ${effect.stash.length} 张`
                      : effect.roleId === "o-swire"
                        ? `合作标记 ${effect.owners?.length ?? 0}`
                        : effect.roleId === "o-amiya"
                          ? "下次角色生效时履行合作协议"
                          : effect.roleId === "o-muelsyse"
                            ? "每回合可额外盖放一张流形"
                            : effect.roleId === "o-jessica"
                              ? `抵押于城市 ${Number(effect.cell) + 1}`
                              : ["dorothy", "passenger", "o-lin"].includes(
                                    effect.roleId,
                                  )
                                ? `标记 ${effect.markers} / ${effect.roleId === "dorothy" ? 4 : effect.roleId === "o-lin" ? 2 : 5}`
                                : "每次收尾可发动一次"}
                  </small>
                </span>
              </button>
              <p>{role.tactic}</p>
              {effect.stash.length > 0 && (
                <div
                  className="stashed-facilities"
                  aria-label={`${role.name}的暂存设施`}
                >
                  {effect.stash.map((instance) => {
                    const card = FACILITY_BY_ID[instance.split("@")[0]];
                    return (
                      <button
                        key={instance}
                        onClick={() =>
                          onDetail({
                            title: card.name,
                            image: card.image,
                            text: facilityText(card.id),
                          })
                        }
                      >
                        <img src={card.image} alt={card.name} loading="lazy" />
                        <span>{card.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
