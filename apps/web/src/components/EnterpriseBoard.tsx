import {
  oripathyEnterpriseImage,
  ORIPATHY_ENTERPRISE_TEXT,
} from "../../../../packages/rules/src/oripathy-data.ts";
import { useState } from "react";
import {
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
  ENTERPRISE_TEXT,
} from "../../../../packages/rules/src/data.ts";
import { RHINE_DEPARTMENTS } from "../../../../packages/rules/src/original-labs.ts";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import { highResolutionArt } from "../art.ts";
import { departmentDetail, type CardDetail } from "./enterprise-content.ts";
import { EnterpriseTrack } from "./EnterpriseTrack.tsx";

export function EnterpriseBoard({
  game,
  company,
  viewer,
  onDetail,
}: {
  game: PlayerView;
  company: string;
  viewer: PlayerView["players"][number];
  onDetail: (detail: CardDetail) => void;
}) {
  const [previewLab, setPreviewLab] = useState<number | null>(null);
  const lab = previewLab ?? game.activeLab;
  const active =
    game.activeLab == null ? null : RHINE_DEPARTMENTS[game.activeLab];
  const preview = lab == null ? null : RHINE_DEPARTMENTS[lab];
  const previewDetail = lab == null ? null : departmentDetail(lab);
  const currentDetail =
    game.activeLab == null ? null : departmentDetail(game.activeLab);
  return (
    <div className="enterprise-desk">
      <figure className="enterprise-original-board">
        <button
          aria-label={`放大${ENTERPRISE_NAMES[company]}企业板`}
          onClick={() =>
            onDetail({
              title: ENTERPRISE_NAMES[company],
              image: game.oripathy
                ? (oripathyEnterpriseImage(company) ??
                  ENTERPRISE_IMAGES[company])
                : ENTERPRISE_IMAGES[company],
              text: [
                game.oripathy
                  ? (ORIPATHY_ENTERPRISE_TEXT[company] ??
                    ENTERPRISE_TEXT[company])
                  : ENTERPRISE_TEXT[company],
                company === "rhine" ? currentDetail?.text : "",
              ]
                .filter(Boolean)
                .join("\n"),
            })
          }
        >
          <img
            src={highResolutionArt(
              game.oripathy
                ? (oripathyEnterpriseImage(company) ??
                    ENTERPRISE_IMAGES[company])
                : ENTERPRISE_IMAGES[company],
            )}
            alt={`${ENTERPRISE_NAMES[company]}原版企业板`}
            draggable={false}
          />
        </button>
        <figcaption>
          原版企业板<span>点击放大 ↗</span>
        </figcaption>
      </figure>
      <div className="enterprise-capabilities">
        {company === "rhine" && (
          <section className="rhine-department" aria-label="莱茵生命共享科室">
            <div className="department-heading">
              <h3>
                {active ? `激活科室：${active.name}` : "等待初始科室选择"}
              </h3>
              {previewDetail && (
                <button
                  className="subtle-button"
                  onClick={() => onDetail(previewDetail)}
                >
                  科室详情
                </button>
              )}
            </div>
            <div
              className="department-tabs"
              role="group"
              aria-label="预览莱茵生命科室"
            >
              {RHINE_DEPARTMENTS.map((department, index) => (
                <button
                  key={department.id}
                  aria-label={`预览${department.name}`}
                  aria-pressed={lab === index}
                  onClick={() =>
                    setPreviewLab(index === game.activeLab ? null : index)
                  }
                >
                  {department.name}
                  {index === game.activeLab && <small>激活</small>}
                </button>
              ))}
              <span role="status">
                {preview && lab !== game.activeLab
                  ? `正在预览${preview.name} · ${active ? `激活${active.name}` : "等待激活"}`
                  : "全体共用 · 切换时仅操作者获得奖励"}
              </span>
            </div>
          </section>
        )}
        <EnterpriseTrack
          game={game}
          company={company}
          viewer={viewer}
          lab={lab ?? null}
        />
        <p className="enterprise-reading-note">
          <span>◆</span>{" "}
          企业特效在能力触发时结算；升级奖励在到达对应等级时结算。
        </p>
      </div>
    </div>
  );
}
