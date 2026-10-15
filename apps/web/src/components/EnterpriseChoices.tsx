import type { CSSProperties } from "react";
import {
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
} from "../../../../packages/rules/src/data.ts";
import type {
  LegalAction,
  PlayerView,
} from "../../../../packages/rules/src/types.ts";
import { highResolutionArt } from "../art.ts";
import { EnterpriseRuleText } from "./EnterpriseRuleText.tsx";
import { ENTERPRISE_COLORS, enterpriseLevels } from "./enterprise-content.ts";
import type { CardDetail } from "./ActionComposer.tsx";

type Choice = NonNullable<PlayerView["decision"]>["options"][number];
const profiles: Record<string, string> = {
  rhodes: "干员招募 · 企业协作",
  heide: "源岩供给 · 设施建设",
  rhine: "科室切换 · 技术协作",
  bank: "金券供给 · 资金运营",
  raythean: "源石供给 · 设施采购",
  mama: "金券与分数的交换",
  blacksteel: "影响力部署 · 战术调度",
  rim: "资源采集 · 据点争夺",
};

export function enterpriseForImage(image?: string) {
  return Object.keys(ENTERPRISE_IMAGES).find(
    (id) => ENTERPRISE_IMAGES[id] === image,
  );
}

/** Only presents server-provided choices; inspecting a dossier never submits it. */
export function EnterpriseChoices({
  game,
  actions,
  selected,
  disabled,
  onSelect,
  onDetail,
  detailFor,
}: {
  game: PlayerView;
  actions: LegalAction[];
  selected: LegalAction | null;
  disabled: boolean;
  onSelect: (action: LegalAction) => void;
  onDetail: (detail: CardDetail) => void;
  detailFor: (option: Choice) => CardDetail;
}) {
  const options = game.decision!.options;
  const me = game.players.find((player) => player.id === game.me)!;
  const selectedOption = options.find(
    (option) => option.id === selected?.command.optionId,
  );
  const selectedCompany = enterpriseForImage(selectedOption?.image);
  const choices = actions.map((action) => {
    const option = options.find(
      (entry) => entry.id === action.command.optionId,
    );
    return { action, option, company: enterpriseForImage(option?.image) };
  });
  return (
    <div
      className="enterprise-offers"
      data-count={choices.filter((choice) => choice.company).length}
    >
      <div
        className="action-list enterprise-choice-grid"
        aria-label="可选合作企业"
      >
        {choices
          .filter((choice) => choice.company)
          .map(({ action, option, company }) => {
            const id = company!;
            const picked = action.id === selected?.id;
            const levels = enterpriseLevels(id, game.activeLab ?? null);
            const current = me.enterprise[id] ?? 0;
            // Upgrades and individual triggers must keep their exact level visible.
            const targetLevel = /(?:→\s*| · )([1-5])(?: 级)?$/.exec(
              option!.label,
            )?.[1];
            const feature =
              (targetLevel
                ? levels.find((level) => level.level === Number(targetLevel))
                : undefined) ??
              [...levels]
                .reverse()
                .find(
                  (level) => level.level > current && level.kind !== "empty",
                ) ??
              levels.find((level) => level.kind !== "empty")!;
            return (
              <article
                key={action.id}
                className={`enterprise-offer ${picked ? "is-picked" : ""}`}
                style={
                  { "--brand-color": ENTERPRISE_COLORS[id] } as CSSProperties
                }
              >
                <button
                  className={`action-button enterprise-offer-select ${picked ? "picked" : ""}`}
                  disabled={disabled}
                  aria-label={action.label}
                  aria-pressed={picked}
                  onClick={() => onSelect(action)}
                >
                  <span className="enterprise-offer-art" aria-hidden="true">
                    <img
                      src={highResolutionArt(ENTERPRISE_IMAGES[id])}
                      alt=""
                      draggable={false}
                    />
                  </span>
                  <span className="enterprise-offer-copy">
                    <span className="enterprise-offer-heading">
                      <strong>{ENTERPRISE_NAMES[id]}</strong>
                      <span
                        className="enterprise-offer-check"
                        aria-hidden="true"
                      >
                        {picked ? "✓" : "+"}
                      </span>
                    </span>
                    <span className="enterprise-offer-profile">
                      {profiles[id]}
                    </span>
                    {option!.label !== ENTERPRISE_NAMES[id] && (
                      <span className="enterprise-offer-action">
                        {option!.label.replace(
                          `${ENTERPRISE_NAMES[id]} · `,
                          "合作 · ",
                        )}
                      </span>
                    )}
                    <span className="enterprise-offer-feature">
                      <span className="enterprise-offer-level">
                        {feature.level} 级 ·{" "}
                        {feature.kind === "reward"
                          ? "升级奖励"
                          : feature.kind === "lab"
                            ? "科室奖励"
                            : feature.kind === "empty"
                              ? "合作等级"
                              : "企业特效"}
                      </span>
                      <span>
                        <EnterpriseRuleText text={feature.text} />
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  className="choice-detail-button enterprise-offer-detail"
                  aria-label={`查看${option!.label}的牌面`}
                  onClick={() => onDetail(detailFor(option!))}
                >
                  <span>完整企业板</span>
                  <span aria-hidden="true">↗</span>
                </button>
              </article>
            );
          })}
      </div>
      {choices.some((choice) => !choice.company) && (
        <div className="action-list enterprise-other-options">
          {choices
            .filter((choice) => !choice.company)
            .map(({ action }) => (
              <button
                key={action.id}
                className={`action-button ${selected?.id === action.id ? "picked" : ""}`}
                disabled={disabled}
                aria-pressed={selected?.id === action.id}
                onClick={() => onSelect(action)}
              >
                <span>{action.label}</span>
              </button>
            ))}
        </div>
      )}
      {selectedCompany && (
        <section
          className="enterprise-offer-insight"
          aria-label={`${ENTERPRISE_NAMES[selectedCompany]}合作能力`}
          style={
            {
              "--brand-color": ENTERPRISE_COLORS[selectedCompany],
            } as CSSProperties
          }
        >
          <div className="enterprise-insight-heading">
            <strong>
              {ENTERPRISE_NAMES[selectedCompany]} <span>合作能力</span>
            </strong>
            <span>已选中 · 确认后生效</span>
          </div>
          <ol>
            {enterpriseLevels(selectedCompany, game.activeLab ?? null)
              .filter((level) => level.level > 0)
              .reverse()
              .map((level) => (
                <li key={level.level}>
                  <span className="enterprise-insight-level">
                    {level.level}
                    <small>级</small>
                  </span>
                  <p>
                    <EnterpriseRuleText text={level.text} />
                  </p>
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  );
}
