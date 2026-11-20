import { useLayoutEffect, useRef, useState } from "react";
import {
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
  ENTERPRISE_TEXT,
  FACILITY_BY_ID,
  facilityText,
  PATTERN_BY_ID,
  ROLE_BY_ID,
} from "../../../../packages/rules/src/data.ts";
import type {
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import { departmentDetail } from "./EnterprisePanel.tsx";
import { highResolutionArt } from "../art.ts";
import { PatternPicker } from "./SupplyWindow.tsx";
import { EnterpriseChoices, enterpriseForImage } from "./EnterpriseChoices.tsx";
import { ActionEmblem } from "./ActionEmblem.tsx";
import { ORIPATHY_ENTERPRISE_TEXT } from "../../../../packages/rules/src/oripathy-data.ts";
import { OripathyChoices } from "./OripathyPanel.tsx";

export type CardDetail = { title: string; image?: string; text?: string };
type Choice = NonNullable<PlayerView["decision"]>["options"][number];
const displayLabel = (label: string) =>
  label.replace(/ · 格 (\d+)/g, (_, n: string) => ` · 第 ${Number(n) + 1} 格`);

export function choiceDetail(game: PlayerView, option: Choice): CardDetail {
  if (game.decision?.kind === "lab") {
    const lab = departmentDetail(Number(option.id));
    if (lab) return { ...lab, text: `本次选择：${option.label}\n${lab.text}` };
  }
  const role = Object.values(ROLE_BY_ID).find((c) => c.image === option.image);
  const facility = Object.values(FACILITY_BY_ID).find(
    (c) => c.image === option.image,
  );
  const pattern = Object.values(PATTERN_BY_ID).find(
    (c) => c.image === option.image,
  );
  const company = enterpriseForImage(option.image);
  const text = role
    ? `策略：${role.strategy}\n计谋：${role.tactic}`
    : facility
      ? facilityText(facility.id)
      : pattern
        ? pattern.description
        : company
          ? game.oripathy
            ? (ORIPATHY_ENTERPRISE_TEXT[company] ?? ENTERPRISE_TEXT[company])
            : ENTERPRISE_TEXT[company]
          : "";
  return {
    title:
      role?.name ??
      facility?.name ??
      pattern?.name ??
      (company ? ENTERPRISE_NAMES[company] : option.label),
    image: option.image,
    text: [`本次选择：${option.label}`, text].filter(Boolean).join("\n"),
  };
}

const actionHelp: Record<string, string> = {
  deploy: "先开始部署，再在棋盘上点选一个高亮位置，放置你的影响力。",
  shift: "先点选自己的影响力，再选择目的地。你可以移动最多两次。",
  explore: "在棋盘选择未知资源点，查看路费，探索后亲自选择事件结果。",
  city: "选择城市停靠点，查看移动费用，再确认移动。",
  build: "从可建设的设施中选牌，选择城市格和付款方式，再确认建设。",
};

function BuildPicker({
  game,
  selected,
  onSelect,
  onDetail,
  disabled,
  preferredFacility,
}: {
  game: PlayerView;
  selected: LegalAction | null;
  onSelect: (a: LegalAction | null) => void;
  onDetail: (d: CardDetail) => void;
  disabled: boolean;
  preferredFacility?: string;
}) {
  const [instance, setInstance] = useState(() =>
    preferredFacility &&
    game.actions.some((a) =>
      a.command.optionId?.startsWith(`${preferredFacility}:`),
    )
      ? preferredFacility
      : "",
  );
  const [cell, setCell] = useState("");
  const options = game.actions.flatMap((action) => {
    const match = /^(.+):(\d+):(resources|cash|free)$/.exec(
      action.command.optionId ?? "",
    );
    return match
      ? [{ action, instance: match[1], cell: match[2], mode: match[3] }]
      : [];
  });
  const cards = [...new Set(options.map((o) => o.instance))];
  const player = game.players.find((p) => p.id === game.me)!;
  return (
    <div className="build-picker">
      <h3>
        <b>1</b> 选择设施
      </h3>
      <div className="build-cards">
        {cards.map((id) => {
          const card = FACILITY_BY_ID[id.split("@")[0]];
          return (
            <div className="build-card" key={id}>
              <button
                className={instance === id ? "picked" : ""}
                aria-label={`选择设施 ${card.name}`}
                aria-pressed={instance === id}
                disabled={disabled}
                onClick={() => {
                  setInstance(id);
                  setCell("");
                  onSelect(null);
                }}
              >
                <img src={card.image} alt="" />
                <strong>{card.name}</strong>
              </button>
              <button
                className="subtle-button"
                aria-label={`查看${card.name}的牌面`}
                onClick={() =>
                  onDetail({
                    title: card.name,
                    image: card.image,
                    text: facilityText(card.id),
                  })
                }
              >
                牌面 ↗
              </button>
            </div>
          );
        })}
      </div>
      {instance && (
        <>
          <h3>
            <b>2</b> 放入城市
          </h3>
          <div className="build-city-grid" aria-label="选择建设城市格">
            {Array.from({ length: 12 }, (_, i) => {
              const built = player.built[i];
              const legal = options.some(
                (o) => o.instance === instance && o.cell === String(i),
              );
              return (
                <button
                  key={i}
                  disabled={disabled || !legal}
                  aria-label={`城市 ${i + 1}${built ? `，已有${FACILITY_BY_ID[built.cardId].name}` : "，空地"}`}
                  aria-pressed={cell === String(i)}
                  className={`${cell === String(i) ? "picked" : ""} ${built && legal ? "can-overbuild" : ""}`}
                  onClick={() => {
                    setCell(String(i));
                    onSelect(null);
                  }}
                >
                  {built ? (
                    <img
                      src={FACILITY_BY_ID[built.cardId].image}
                      alt={FACILITY_BY_ID[built.cardId].name}
                    />
                  ) : (
                    <span>{cell === String(i) ? "◆" : "+"}</span>
                  )}
                  <small>{i + 1}</small>
                  {built && legal && (
                    <span className="overbuild-label">叠建</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
      {cell !== "" && (
        <>
          <h3>
            <b>3</b> 选择付款方式
          </h3>
          <div className="action-list payment-options">
            {options
              .filter((o) => o.instance === instance && o.cell === cell)
              .map(({ action, mode }) => (
                <button
                  key={action.id}
                  className={`action-button ${selected?.id === action.id ? "picked" : ""}`}
                  aria-pressed={selected?.id === action.id}
                  disabled={disabled}
                  onClick={() => onSelect(action)}
                >
                  <span>
                    {mode === "resources"
                      ? "支付资源"
                      : mode === "cash"
                        ? "支付金券"
                        : "免费建设"}
                    <small>{action.label.split(" · ").at(-1)}</small>
                  </span>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ActionComposer({
  game,
  selected,
  target,
  disabled,
  onSelect,
  onCommit,
  onTarget,
  onDetail,
  hideOptions = false,
  preferredFacility,
}: {
  game: PlayerView;
  selected: LegalAction | null;
  target: string;
  disabled: boolean;
  onSelect: (a: LegalAction | null) => void;
  onCommit: () => void;
  onTarget: (id: string) => void;
  onDetail: (d: CardDetail) => void;
  hideOptions?: boolean;
  preferredFacility?: string;
}) {
  const [search, setSearch] = useState("");
  const decision = game.decision;
  const actions = game.actions.filter(
    (a) =>
      (!target || a.target === target) && (!search || a.label.includes(search)),
  );
  const option = decision?.options.find(
    (o) => o.id === selected?.command.optionId,
  );
  const preview = option ? choiceDetail(game, option) : null;
  const me = game.players.find((p) => p.id === game.me)!;
  const role =
    selected?.command.type === "role"
      ? ROLE_BY_ID[
          selected.command.mode?.startsWith("flow|")
            ? selected.command.mode.split("|")[1]
            : me.selected!
        ]
      : null;
  const roleMode = selected?.command.mode?.split("|").at(-1);
  const isOripathyChoice = ["o:dilemma", "o:entrepreneur-draft"].includes(
    decision?.kind ?? "",
  );
  const boardChoice =
    decision?.kind !== "event" && game.actions.some((a) => a.target);
  const isBuild = decision?.kind === "build";
  const isEnterpriseChoice = decision?.options.some((o) =>
    enterpriseForImage(o.image),
  );
  const hasExplanation =
    (preview?.image && decision?.kind !== "event") ||
    preview?.text?.includes("\n") ||
    role ||
    selected?.command.type === "main" ||
    selected?.command.type === "end" ||
    selected?.command.type === "declare";
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Enterprise dossiers show their summary below the cards; keep the selected
    // card in view when the offer list spans several rows.
    if (
      selected &&
      !isBuild &&
      !isEnterpriseChoice &&
      !isOripathyChoice &&
      body.current
    )
      body.current.scrollTop = 0;
  }, [selected?.id, isBuild, isEnterpriseChoice, isOripathyChoice]);
  return (
    <>
      <div
        className={`composer-body ${isEnterpriseChoice ? "enterprise-composer" : ""}`}
        ref={body}
      >
        <p className="decision-title">
          {decision?.title ?? "这一步，由你决定"}
        </p>
        <p className="interaction-hint">
          {isEnterpriseChoice
            ? "挑选合作伙伴，查看企业能力，再确认你的选择。"
            : isBuild
              ? "设施、位置和费用都由你选择。"
              : boardChoice
                ? "点击棋盘高亮位置，再确认落子。"
                : decision?.kind === "select-role"
                  ? "挑选一张角色牌，确认后秘密盖放。"
                  : decision
                    ? "点选牌面或选项，查看效果后确认。"
                    : "选择主要行动，也可以先发动角色能力。"}
        </p>
        {selected &&
          !isBuild &&
          !isEnterpriseChoice &&
          !isOripathyChoice &&
          hasExplanation && (
            <div className="action-explanation">
              {preview?.image &&
                decision?.kind !== "event" &&
                !me.hand.some(
                  (id) => ROLE_BY_ID[id].image === preview.image,
                ) && (
                  <button
                    className="preview-art"
                    onClick={() => onDetail(preview)}
                    aria-label="放大所选牌面"
                  >
                    <img
                      src={highResolutionArt(preview.image)}
                      alt={preview.title}
                    />
                  </button>
                )}
              {preview?.text &&
                preview.text
                  .split("\n")
                  .slice(1)
                  .map((line, i) => <p key={i}>{line}</p>)}
              {role && (
                <>
                  <h3>{role.name}</h3>
                  {roleMode?.split("-").map((mode, i) => (
                    <p key={i}>
                      <b>{mode === "strategy" ? "策略" : "计谋"}：</b>
                      {mode === "strategy" ? role.strategy : role.tactic}
                    </p>
                  ))}
                </>
              )}
              {selected.command.type === "main" && (
                <p>
                  {actionHelp[selected.id] ??
                    "开始行动后，按提示亲自选择目标。"}
                </p>
              )}
              {selected.command.type === "end" && (
                <p>结束你的本轮行动，交给下一位企业家。</p>
              )}
              {selected.command.type === "declare" &&
                selected.command.patternId && (
                  <div className="declare-preview">
                    <img
                      src={PATTERN_BY_ID[selected.command.patternId].image}
                      alt={PATTERN_BY_ID[selected.command.patternId].name}
                    />
                    <p>
                      {PATTERN_BY_ID[selected.command.patternId].description}
                    </p>
                    <b>
                      下一步：亲自挑选设施组合，确认后获得{" "}
                      {PATTERN_BY_ID[selected.command.patternId].score} 分。
                    </b>
                  </div>
                )}
            </div>
          )}
        {hideOptions ? null : isOripathyChoice ? (
          <OripathyChoices
            game={game}
            selected={selected}
            disabled={disabled}
            onSelect={onSelect}
            onDetail={onDetail}
          />
        ) : isEnterpriseChoice ? (
          <EnterpriseChoices
            game={game}
            actions={actions}
            selected={selected}
            disabled={disabled}
            onSelect={onSelect}
            onDetail={onDetail}
            detailFor={(choice) => choiceDetail(game, choice)}
          />
        ) : isBuild ? (
          <BuildPicker
            game={game}
            selected={selected}
            onSelect={onSelect}
            onDetail={onDetail}
            disabled={disabled}
            preferredFacility={preferredFacility}
          />
        ) : decision?.kind === "pattern" ? (
          <PatternPicker
            game={game}
            selected={selected}
            onSelect={onSelect}
            onDetail={onDetail}
            disabled={disabled}
          />
        ) : (
          <>
            {target && (
              <button
                className="subtle-button target-filter"
                onClick={() => {
                  onTarget("");
                  onSelect(null);
                }}
              >
                ← 重选位置 · {target}
              </button>
            )}
            {actions.length > 12 && (
              <input
                className="choice-search"
                aria-label="筛选行动"
                placeholder="输入名称或位置…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            <div
              className={`action-list ${decision?.options.some((o) => o.image) ? "illustrated-choices" : ""}`}
            >
              {actions.map((a) => {
                const o = decision?.options.find(
                  (o) => o.id === a.command.optionId,
                );
                return (
                  <div className="action-row" key={a.id}>
                    <button
                      className={`action-button ${selected?.id === a.id ? "picked" : ""} ${a.group === "end" ? "end-action" : ""} ${a.group === "quick" ? "quick-action" : ""}`}
                      disabled={disabled}
                      aria-label={displayLabel(a.label)}
                      aria-pressed={selected?.id === a.id}
                      onClick={() => onSelect(a)}
                    >
                      {o?.image && <img src={o.image} alt="" />}
                      {a.command.type === "main" && (
                        <ActionEmblem action={a.id} />
                      )}
                      <span>{displayLabel(a.label)}</span>
                      <span aria-hidden="true">
                        {selected?.id === a.id ? "✓" : "›"}
                      </span>
                    </button>
                    {o &&
                      (o.image ||
                        (decision?.kind === "lab" &&
                          departmentDetail(Number(o.id)))) && (
                        <button
                          className="choice-detail-button"
                          aria-label={`查看${o.label}的牌面`}
                          onClick={() => onDetail(choiceDetail(game, o))}
                        >
                          ↗
                        </button>
                      )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="commit-tray" aria-live="polite">
        <span className="commit-caption">
          {selected ? "已选 · 等你确认" : "等待你选牌或落子"}
        </span>
        <strong>
          {selected
            ? displayLabel(selected.label)
            : isBuild
              ? "选择设施 → 城市格 → 付款方式"
              : "先选择，再执行"}
        </strong>
        <div>
          <button
            className="secondary-button"
            disabled={!selected || disabled}
            onClick={() => onSelect(null)}
          >
            取消选择
          </button>
          <button
            className="primary-button"
            disabled={!selected || disabled}
            onClick={onCommit}
          >
            {disabled
              ? "正在结算…"
              : selected?.command.type === "main" ||
                  selected?.command.type === "role" ||
                  selected?.command.type === "special"
                ? "执行行动 →"
                : "确认选择 →"}
          </button>
        </div>
      </div>
    </>
  );
}
