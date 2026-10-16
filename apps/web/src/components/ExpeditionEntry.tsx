import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ExpeditionPermit } from "./ExpeditionPermit.tsx";
import { PosterTitle } from "./PosterTitle.tsx";
import { gameAudio } from "../audio.ts";

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

type HomeScene = "hero" | "lobby";
type Props = ComponentProps<typeof ExpeditionPermit> & {
  onGuide: () => void;
  onPractice: () => void;
  paused?: boolean;
};

/** Scene changes are presentation only. App owns room requests and form values. */
export function ExpeditionEntry({
  onGuide,
  onPractice,
  paused,
  ...permit
}: Props) {
  const [scene, setScene] = useState<HomeScene>(permit.code ? "lobby" : "hero");
  const [moving, setMoving] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const lock = useRef(false);
  const focusPending = useRef(false);
  const target = useRef("nickname");
  const start = useRef<HTMLButtonElement>(null);
  const previousCode = useRef(permit.code);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (permit.code) setScene("lobby");
    else if (previousCode.current) setScene("hero");
    previousCode.current = permit.code;
  }, [permit.code]);
  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(
      () => {
        setMoving(false);
        lock.current = false;
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : 600,
    );
    return () => clearTimeout(timer);
  }, [scene, moving]);
  useEffect(() => {
    // The destination becomes focusable after React removes its inert attribute.
    if (moving || !focusPending.current) return;
    focusPending.current = false;
    if (scene === "lobby")
      document.getElementById(target.current)?.focus({ preventScroll: true });
    else start.current?.focus({ preventScroll: true });
  }, [scene, moving]);
  function change(next: HomeScene, focus = "nickname") {
    if (lock.current || permit.loading || next === scene) return;
    target.current = focus;
    focusPending.current = true;
    lock.current = true;
    setMoving(true);
    setScene(next);
    void gameAudio.play("open");
  }
  return (
    <main
      className={`departure-entry departure-stage home-scene-${scene} ${moving ? "is-changing" : ""}`}
      data-scene={scene}
      data-paused={paused || hidden || undefined}
    >
      <div className="departure-rail" aria-hidden="true">
        <span>COLUMBIA / DISTRICT 105</span>
        <span>1099 · 拓荒发展运动</span>
      </div>
      <section
        className="home-scene home-hero"
        aria-labelledby="departure-title"
        inert={scene !== "hero" || moving}
        aria-hidden={scene !== "hero"}
      >
        <div className="hero-manifesto">
          <p className="hero-kicker">
            <span /> 铸基者 <i /> THE FOUNDERS
          </p>
          <PosterTitle />
          <p className="hero-description">
            在荒野落下第一枚棋子。
            <br />
            与朋友建设城市，书写这片拓荒区的未来。
          </p>
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
            <button
              className="subtle-button hero-join"
              onClick={() => change("lobby", "room-code")}
            >
              加入好友 <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="hero-shortcuts">
            <button className="subtle-button" onClick={onPractice}>
              实操演习 <span>↗</span>
            </button>
            <button className="subtle-button" onClick={onGuide}>
              拓荒指南 <span>↗</span>
            </button>
          </div>
        </div>
        <div className="poster-founders" aria-hidden="true">
          <div className="founder-orbit" />
          <span className="founder-large-number">105</span>
          {[0, 1, 2, 3].map((i) => (
            <div className={`founder-card founder-card-${i}`} key={i}>
              <img
                src={`/assets/entrepreneur-${i}.webp`}
                alt=""
                draggable={false}
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            </div>
          ))}
          <div className="founder-caption">
            <span>FOUR FOUNDERS / ONE FRONTIER</span>
            <b>四席之约 · 一同拓荒</b>
          </div>
        </div>
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
        inert={scene !== "lobby" || moving}
        aria-hidden={scene !== "lobby"}
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
          <div className="lobby-city" aria-hidden="true">
            <span>105</span>
            <img
              src="/assets/city-model-0.svg"
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          </div>
          <button
            className="subtle-button lobby-return"
            disabled={permit.loading || moving}
            onClick={() => (permit.code ? permit.onHome() : change("hero"))}
          >
            ← 返回主视觉
          </button>
        </div>
        <ExpeditionPermit {...permit} />
      </section>
      <div className="home-scene-index" aria-label="首页场景">
        <button
          aria-label="主视觉"
          aria-current={scene === "hero" ? "step" : undefined}
          disabled={moving || permit.loading}
          onClick={() => (permit.code ? permit.onHome() : change("hero"))}
        >
          01 <span>启程</span>
        </button>
        <i />
        <button
          aria-label="联机大厅"
          aria-current={scene === "lobby" ? "step" : undefined}
          disabled={moving || permit.loading}
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
