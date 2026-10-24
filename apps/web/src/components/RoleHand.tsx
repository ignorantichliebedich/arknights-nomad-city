import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ROLE_BY_ID } from "../../../../packages/rules/src/data.ts";
import type {
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import { highResolutionArt } from "../art.ts";
import type { CardDetail } from "./ActionComposer.tsx";
import { useQuickActivate } from "../useQuickActivate.ts";
import { gameAudio } from "../audio.ts";
import { roleCardBack } from "../card-backs.ts";

export function RoleHand({
  touch = false,
  game,
  selected,
  disabled,
  expanded,
  onExpand,
  onSelect,
  onCommit,
  onQuickCommit,
  onDetail,
  onAction,
}: {
  touch?: boolean;
  game: PlayerView;
  selected: LegalAction | null;
  disabled: boolean;
  expanded: boolean;
  onExpand: (open: boolean) => void;
  onSelect: (action: LegalAction | null) => void;
  onCommit: () => void;
  onQuickCommit: (action: LegalAction) => void;
  onDetail: (detail: CardDetail) => void;
  onAction: () => void;
}) {
  const me = game.players.find((p) => p.id === game.me)!;
  const quick = useQuickActivate();
  const picking =
    ["select-role", "trim", "o:cover-flow"].includes(
      game.decision?.kind ?? "",
    ) && game.decision?.playerId === me.id;
  const trim = game.decision?.kind === "trim";
  const picked =
    picking && selected?.command.type === "choose"
      ? ROLE_BY_ID[selected.command.optionId!]
      : null;
  const previous = useRef(me.selected);
  const [placed, setPlaced] = useState<string | null>(null);
  const hand = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelFold = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const fold = () => {
    cancelFold();
    // Keep the local choice, but move keyboard focus out of the retracted cards.
    if (hand.current?.contains(document.activeElement))
      hand.current
        .querySelector<HTMLButtonElement>(".fan-toggle")
        ?.focus({ preventScroll: true });
    onExpand(false);
  };
  const scheduleFold = () => {
    if (!closeTimer.current) closeTimer.current = setTimeout(fold, 280);
  };
  useEffect(() => {
    if (!expanded) {
      cancelFold();
      return cancelFold;
    }
    const outside = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.target instanceof Node && hand.current?.contains(e.target))
        cancelFold();
      else scheduleFold();
    };
    const outsidePress = (e: PointerEvent) => {
      if (e.target instanceof Node && !hand.current?.contains(e.target)) fold();
    };
    document.addEventListener("pointermove", outside);
    document.addEventListener("pointerdown", outsidePress);
    return () => {
      cancelFold();
      document.removeEventListener("pointermove", outside);
      document.removeEventListener("pointerdown", outsidePress);
    };
  }, [expanded, onExpand]);
  useEffect(() => {
    if (me.selected && me.selected !== previous.current) {
      setPlaced(me.selected);
      const timer = setTimeout(() => setPlaced(null), 1100);
      previous.current = me.selected;
      return () => clearTimeout(timer);
    }
    previous.current = me.selected;
  }, [me.selected]);
  const detail = (id: string) => {
    const card = ROLE_BY_ID[id];
    onDetail({
      title: card.name,
      image: card.image,
      text: `策略：${card.strategy}\n计谋：${card.tactic}`,
    });
  };
  return (
    <section
      ref={hand}
      className={`role-hand fan-hand ${expanded ? "is-expanded" : "is-folded"} ${picking ? "is-picking" : ""}`}
      aria-label="角色手牌"
      style={
        {
          "--hand-count": me.hand.length,
          "--hand-span": `min(var(--fan-max-span), ${Math.max(0, me.hand.length - 1) * 64}px)`,
        } as CSSProperties
      }
      onPointerEnter={cancelFold}
      onPointerLeave={(e) => {
        if (expanded && e.pointerType !== "touch") scheduleFold();
      }}
      onBlur={(e) => {
        if (
          expanded &&
          !e.currentTarget.contains(e.relatedTarget as Node | null)
        )
          scheduleFold();
      }}
      onKeyDown={(e) => {
        cancelFold();
        if (e.key === "Escape") {
          onSelect(null);
          fold();
        }
      }}
    >
      {expanded && <div className="fan-interaction-zone" aria-hidden="true" />}
      <button
        className="fan-toggle"
        aria-label={`角色手牌 ${me.hand.length} 张`}
        aria-expanded={expanded}
        aria-controls="fan-cards"
        onClick={() => onExpand(!expanded)}
      >
        <span aria-hidden="true">▱</span> 角色手牌 <b>{me.hand.length}</b>
        <span>
          {expanded
            ? touch
              ? "点击收起 ▾"
              : "移开收起 ▾"
            : picked
              ? `${picked.name} · 待确认 ▴`
              : "展开 ▴"}
        </span>
      </button>
      <div
        className="hand-cards"
        id="fan-cards"
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") {
            cancelFold();
            onExpand(true);
          }
        }}
      >
        {me.hand.map((id, i) => {
          const card = ROLE_BY_ID[id];
          const choice = picking
            ? game.actions.find(
                (a) => a.command.type === "choose" && a.command.optionId === id,
              )
            : undefined;
          const offset = i - (me.hand.length - 1) / 2;
          const isPicked = !!choice && selected?.id === choice.id;
          return (
            <div
              key={id}
              className={`hand-slot ${isPicked ? "is-picked" : ""}`}
              style={
                {
                  "--fan-x": `calc(${offset} * min(64px, var(--fan-max-span) / ${Math.max(1, me.hand.length - 1)}))`,
                  "--fan-angle": `${offset * Math.min(7, 34 / Math.max(1, me.hand.length - 1))}deg`,
                  "--fan-y": `${Math.pow(offset, 2) * Math.min(3, 30 / Math.max(1, Math.pow(me.hand.length / 2, 2)))}px`,
                  "--fan-index": i,
                } as CSSProperties
              }
            >
              <button
                className={`hand-card ${choice ? "playable" : ""} ${isPicked ? "picked" : ""}`}
                aria-label={`${choice ? "选择" : "查看"}角色 ${card.name}`}
                aria-pressed={isPicked}
                tabIndex={expanded ? 0 : -1}
                disabled={disabled && !!choice}
                onPointerDown={(e) => {
                  // Keep the release on this card while its hover/focus lift moves it.
                  if (e.button === 0)
                    e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") void gameAudio.play("select");
                }}
                onPointerUp={(e) => {
                  if (choice && !trim && !disabled)
                    quick.touch(id, e, () => onQuickCommit(choice));
                }}
                onDoubleClick={(e) => {
                  if (choice && !trim && !disabled)
                    quick.double(id, e, () => onQuickCommit(choice));
                }}
                onClick={(event) => {
                  if (quick.quiet(id) || event.detail > 1) return;
                  onExpand(true);
                  if (choice) onSelect(isPicked ? null : choice);
                  else detail(id);
                }}
                onFocus={(e) => {
                  cancelFold();
                  if (e.currentTarget.matches(":focus-visible")) onExpand(true);
                }}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const buttons = e.currentTarget
                      .closest(".hand-cards")!
                      .querySelectorAll<HTMLButtonElement>(".hand-card");
                    const index =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? buttons.length - 1
                          : (i +
                              (e.key === "ArrowLeft" ? -1 : 1) +
                              buttons.length) %
                            buttons.length;
                    buttons[index]?.focus();
                  }
                }}
              >
                <img
                  src={highResolutionArt(card.image)}
                  alt={card.name}
                  draggable={false}
                />
                <span>
                  {card.name}
                  <small>
                    {card.operative ? "罗德岛合作" : "角色牌"}
                    {isPicked ? " · 已选" : ""}
                  </small>
                </span>
              </button>
              <button
                className="hand-detail"
                tabIndex={expanded ? 0 : -1}
                aria-label={`查看${card.name}的完整效果`}
                onClick={() => detail(id)}
              >
                完整效果 ↗
              </button>
            </div>
          );
        })}
      </div>
      {expanded && picking && (
        <div className="fan-confirm" aria-live="polite">
          <div className="action-explanation">
            <strong>
              {picked
                ? picked.name
                : trim
                  ? "选择要移出的手牌"
                  : "选一张角色牌"}
            </strong>
            <p>
              {picked
                ? `策略：${picked.strategy}`
                : trim
                  ? game.decision?.title
                  : "点选预览，再确认盖放。"}
            </p>
            {picked && (
              <button
                className="subtle-button"
                onClick={() => detail(picked.id)}
              >
                策略与计谋全文 ↗
              </button>
            )}
          </div>
          <div className="fan-confirm-buttons">
            <button
              className="secondary-button"
              disabled={!picked || disabled}
              onClick={() => onSelect(null)}
            >
              取消选择
            </button>
            <button
              className="primary-button"
              disabled={!picked || disabled}
              onClick={onCommit}
            >
              {trim ? "确认移出" : "确认盖放"}
            </button>
          </div>
        </div>
      )}
      {!me.hand.length && expanded && (
        <p className="fan-empty">手牌已用尽，下次盖放时收回可用弃牌。</p>
      )}
      {game.decision?.kind === "o:cover-flow" && expanded && (
        <button
          className="secondary-button flow-skip"
          disabled={disabled}
          onClick={() => {
            const skip = game.actions.find(
              (a) => a.command.optionId === "skip",
            );
            if (skip) onQuickCommit(skip);
          }}
        >
          不额外盖放流形
        </button>
      )}
      {!!me.coveredFlows?.length && (
        <div className="covered-flows">
          {me.coveredFlows.map((id) => (
            <button key={id} onClick={() => detail(id)}>
              <img src={roleCardBack(me.seat, id)} alt="流形牌背" />
              <span>{ROLE_BY_ID[id].name} · 已额外盖放</span>
            </button>
          ))}
          {game.actions.some((a) => a.command.mode?.startsWith("flow|")) && (
            <button onClick={onAction}>安排流形能力 →</button>
          )}
        </div>
      )}
      {me.selected && (
        <div className="selected-role-summary">
          <button
            className="selected-role"
            onClick={() => detail(me.selected!)}
            aria-label="查看本回合盖放的角色"
          >
            <img
              src={roleCardBack(me.seat, me.selected)}
              alt="本回合盖放的角色牌背"
            />
            <span>
              <small>{me.revealed ? "本回合角色" : "已秘密盖放"}</small>
              <strong>{ROLE_BY_ID[me.selected].name}</strong>
            </span>
          </button>
          {game.actions.some((a) => a.command.type === "role") && (
            <button className="role-ability-link" onClick={onAction}>
              安排角色能力 →
            </button>
          )}
        </div>
      )}
      {placed && (
        <div className="card-placement" aria-hidden="true" key={placed}>
          <div className="card-placement-inner">
            <img
              className="placement-face"
              src={highResolutionArt(ROLE_BY_ID[placed].image)}
              alt=""
            />
            <img
              className="placement-back"
              src={roleCardBack(me.seat, placed)}
              alt=""
            />
          </div>
        </div>
      )}
    </section>
  );
}
