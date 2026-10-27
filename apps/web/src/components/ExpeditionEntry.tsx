import type { CSSProperties, ComponentProps } from "react";
import { ExpeditionPermit } from "./ExpeditionPermit.tsx";
import { PosterTitle } from "./PosterTitle.tsx";
import { useHomeScene } from "../useHomeScene.ts";
import { ENTRY_MOTION } from "../entry-motion.ts";
import { ExpeditionShortcuts } from "./ExpeditionShortcuts.tsx";
import { FoundersDisplay } from "./FoundersDisplay.tsx";
import { FrontierPostcard } from "./FrontierPostcard.tsx";

export function ExpeditionAtmosphere() {
  return (
    <div className="expedition-atmosphere" aria-hidden="true">
      <div className="expedition-landscape" />
      <div className="expedition-grain" />
      <div className="expedition-dust">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <i key={i} />
        ))}
      </div>
    </div>
  );
}

type Props = ComponentProps<typeof ExpeditionPermit> & {
  onGuide: () => void;
  onPractice: () => void;
  paused?: boolean;
  initialLobby?: boolean;
};

/** Scene changes are presentation only. App owns room requests and form values. */
export function ExpeditionEntry({
  onGuide,
  onPractice,
  paused,
  initialLobby,
  ...permit
}: Props) {
  const { scene, moving, arriving, hidden, start, change, motion, busy } =
    useHomeScene(permit.code, permit.loading, initialLobby);
  return (
    <main
      className={`departure-entry departure-stage home-scene-${scene} ${moving ? "is-changing" : ""} ${arriving ? "is-arriving" : ""}`}
      data-scene={scene}
      data-paused={paused || hidden || undefined}
      style={
        {
          "--home-switch-ms": `${ENTRY_MOTION.scene}ms`,
          "--home-arrive-ms": `${ENTRY_MOTION.reveal}ms`,
        } as CSSProperties
      }
    >
      <div className="departure-rail" aria-hidden="true">
        <span>COLUMBIA / DISTRICT 105</span>
        <span>1099 · 拓荒发展运动</span>
      </div>
      <section
        className="home-scene home-hero"
        aria-labelledby="departure-title"
        inert={scene !== "hero" || busy}
        aria-hidden={scene !== "hero"}
        data-motion={motion("hero")}
      >
        <div className="hero-manifesto">
          <p className="hero-kicker">
            <span /> 铸基者 <i /> THE FOUNDERS
          </p>
          <PosterTitle />
          <div className="hero-actions">
            <button
              ref={start}
              className="primary-button launch-button"
              aria-label="开始拓荒"
              onClick={() => change("lobby")}
            >
              <span>
                <small>BEGIN YOUR EXPEDITION</small>开始拓荒
              </span>
              <b aria-hidden="true">↗</b>
            </button>
          </div>
          <ExpeditionShortcuts onPractice={onPractice} onGuide={onGuide} />
        </div>
        <FoundersDisplay />
        <div className="hero-spec">
          <span>
            <b>02—04</b> 位企业家
          </span>
          <i />
          <span>
            <b>08</b> 回合拓荒
          </span>
          <i />
          <span>一片共同的荒野</span>
        </div>
      </section>
      <section
        className="home-scene home-lobby"
        aria-label="联机大厅"
        inert={scene !== "lobby" || busy}
        aria-hidden={scene !== "lobby"}
        data-motion={motion("lobby")}
      >
        <div className="lobby-story">
          <span className="eyebrow">YOUR NEXT FRONTIER</span>
          <h1>
            下一座城，
            <br />
            <em>由你铸就。</em>
          </h1>
          <p>
            签下你的名字，召集同行的企业家。
            <br />
            从这里启程，去往尚未命名的荒野。
          </p>
          <FrontierPostcard oripathy={permit.oripathy} />
          <button
            className="subtle-button lobby-return"
            disabled={permit.loading || busy}
            onClick={() => (permit.code ? permit.onHome() : change("hero"))}
          >
            ← 返回主视觉
          </button>
        </div>
        <div className="permit-folio">
          <span className="permit-folder-tab" aria-hidden="true">
            105 / 拓荒许可
          </span>
          <ExpeditionPermit {...permit} />
        </div>
      </section>
      <div className="home-scene-index" aria-label="首页场景">
        <button
          aria-label="主视觉"
          aria-current={scene === "hero" ? "step" : undefined}
          disabled={busy || permit.loading}
          onClick={() => (permit.code ? permit.onHome() : change("hero"))}
        >
          01 <span>启程</span>
        </button>
        <i />
        <button
          aria-label="联机大厅"
          aria-current={scene === "lobby" ? "step" : undefined}
          disabled={busy || permit.loading}
          onClick={() => change("lobby")}
        >
          02 <span>集结</span>
        </button>
      </div>
      <div className="home-shutter" aria-hidden="true">
        <i />
        <i />
      </div>
    </main>
  );
}
