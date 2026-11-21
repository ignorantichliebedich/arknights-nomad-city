import type { CSSProperties, ReactNode } from "react";
import { useDisplayMode } from "../display-mode.ts";
import { useEntryBoot } from "../useEntryBoot.ts";
import { ENTRY_MOTION } from "../entry-motion.ts";
import { FullscreenWelcome } from "./FullscreenWelcome.tsx";
import { ResourcePackGate } from "./ResourcePackGate.tsx";
import { assetUrl } from "../resource-media.ts";
import "../resource-pack.css";

export function EntryBootstrap({ children }: { children: ReactNode }) {
  const display = useDisplayMode();
  const {
    phase,
    packReady,
    acceptPack,
    pending,
    progress,
    complete,
    total,
    failures,
    offerFullscreen,
    fullIntro,
    revealDuration,
    retry,
    reveal,
  } = useEntryBoot();
  return (
    <>
      {(phase === "revealing" || phase === "ready") && (
        <div
          className={`entry-content entry-content-${phase}`}
          inert={phase !== "ready"}
          aria-hidden={phase !== "ready" || undefined}
          style={
            { "--home-arrive-ms": `${ENTRY_MOTION.reveal}ms` } as CSSProperties
          }
        >
          {children}
        </div>
      )}
      {phase !== "ready" && (
        <div
          className={`entry-bootstrap ${display.phone ? "phone-layout" : ""} boot-${phase}`}
          data-boot-phase={phase}
          data-full-intro={fullIntro || undefined}
          data-resources-pending={pending || undefined}
          style={
            {
              "--boot-intro-ms": `${ENTRY_MOTION.intro}ms`,
              "--boot-reveal-ms": `${revealDuration}ms`,
              "--boot-settle-ms": `${ENTRY_MOTION.settle}ms`,
            } as CSSProperties
          }
        >
          <div className="boot-frame" aria-hidden="true" />
          <div className="boot-scan-clip" aria-hidden="true">
            <div className="boot-scan" />
          </div>
          <div className="boot-registration">
            <span>NOMAD CITY / THE FOUNDERS</span>
            <span>105 · 拓荒准备</span>
          </div>
          <div className="boot-emblem" aria-hidden="true">
            <div className="boot-registration-mark">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="boot-print-strips">
              <i />
              <i />
              <i />
            </div>
            <span>明日方舟</span>
            {packReady && (
              <img
                src={assetUrl("/assets/official-arknights-logo.webp")}
                alt=""
                width="420"
                height="210"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            )}
          </div>
          {(phase === "intro" || packReady) && (
            <div className="boot-progress">
              <div
                className="boot-track"
                role="progressbar"
                aria-label={packReady ? "首屏资源加载" : "开场动画"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <i
                  style={{ width: phase === "intro" ? "100%" : `${progress}%` }}
                />
              </div>
              <div className="boot-progress-label">
                <span>
                  ▶{" "}
                  {phase === "intro"
                    ? "正在准备"
                    : pending
                      ? "正在载入"
                      : failures
                        ? "可以启程"
                        : "准备就绪"}{" "}
                  {packReady && <b>{progress}%</b>}
                </span>
                <span>
                  {packReady && `${complete} / ${total} · `}NOMAD CITY
                </span>
              </div>
              {failures > 0 && (
                <p className="boot-resource-error">
                  {failures} 项图片暂未载入，可以重试或继续进入。
                </p>
              )}
            </div>
          )}
          <footer className="boot-footer">
            <span>明日方舟 · 游城拓荒</span>
            <span>好友联机 / v{import.meta.env.VITE_APP_VERSION}</span>
          </footer>
          {phase === "pack" && <ResourcePackGate onReady={acceptPack} />}
          {phase === "choice" &&
            (offerFullscreen ? (
              <FullscreenWelcome
                phone={display.phone}
                onDone={reveal}
                failedCount={failures}
                onRetry={retry}
              />
            ) : (
              <div className="boot-recovery">
                <button className="secondary-button" onClick={retry}>
                  重试图片
                </button>
                <button className="primary-button" onClick={reveal}>
                  继续进入 →
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
