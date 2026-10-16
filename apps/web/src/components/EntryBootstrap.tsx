import { useEffect, useRef, useState, type ReactNode } from "react";
import { gameAudio } from "../audio.ts";
import { readCredential } from "../network.ts";
import { useDisplayMode } from "../display-mode.ts";
import {
  decodeArtwork,
  entryArtwork,
  type ArtworkStatus,
} from "../entry-loading.ts";
import {
  FULLSCREEN_PROMPT_KEY,
  FullscreenWelcome,
  shouldOfferFullscreen,
} from "./FullscreenWelcome.tsx";

type Phase = "loading" | "choice" | "revealing" | "ready";

export function EntryBootstrap({ children }: { children: ReactNode }) {
  const display = useDisplayMode();
  const [route] = useState(() => {
    const code =
      /^\/room\/([A-Z0-9]{6})$/i.exec(location.pathname)?.[1].toUpperCase() ??
      "";
    const restoring = !!code && !!readCredential(code);
    return { assets: entryArtwork(!!code, restoring), restoring };
  });
  const assets = route.assets;
  const [offerFullscreen] = useState(
    () => !route.restoring && shouldOfferFullscreen(),
  );
  const [status, setStatus] = useState<Record<string, ArtworkStatus>>(() =>
    Object.fromEntries(assets.map((src) => [src, "pending"])),
  );
  const loaded = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const failures = Object.values(status).filter((s) => s === "failed").length;
  const complete = Object.values(status).filter((s) => s === "loaded").length;
  const pending = Object.values(status).some((s) => s === "pending");
  const progress = Math.round((complete / assets.length) * 100);
  useEffect(() => {
    gameAudio.preload();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    for (const src of assets) {
      if (loaded.current.has(src)) continue;
      void decodeArtwork(src, controller.signal).then((ok) => {
        if (controller.signal.aborted) return;
        if (ok) loaded.current.add(src);
        setStatus((value) => ({ ...value, [src]: ok ? "loaded" : "failed" }));
      });
    }
    return () => controller.abort();
  }, [assets, attempt]);
  useEffect(() => {
    if (phase === "loading" && !pending)
      setPhase(offerFullscreen || failures ? "choice" : "revealing");
  }, [phase, pending, offerFullscreen, failures]);
  useEffect(() => {
    if (phase !== "revealing") return;
    try {
      sessionStorage.setItem(FULLSCREEN_PROMPT_KEY, "1");
    } catch {
      /* Navigation within this visit remains uninterrupted. */
    }
    const timer = setTimeout(
      () => setPhase("ready"),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 420,
    );
    return () => clearTimeout(timer);
  }, [phase]);
  function retry() {
    setStatus((value) =>
      Object.fromEntries(
        Object.entries(value).map(([src, state]) => [
          src,
          state === "failed" ? "pending" : state,
        ]),
      ),
    );
    setPhase("loading");
    setAttempt((value) => value + 1);
  }
  if (phase === "ready") return children;
  return (
    <div
      className={`entry-bootstrap ${display.phone ? "phone-layout" : ""} boot-${phase}`}
      data-boot-phase={phase}
    >
      <div className="boot-frame" aria-hidden="true" />
      <div className="boot-registration">
        <span>NOMAD CITY / THE FOUNDERS</span>
        <span>105 · 拓荒准备</span>
      </div>
      <div className="boot-emblem" aria-hidden="true">
        <span>明日方舟</span>
        <img
          src="/assets/official-arknights-logo.webp"
          alt=""
          width="420"
          height="210"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      </div>
      <div className="boot-loading">
        <div
          className="boot-track"
          role="progressbar"
          aria-label="首屏资源加载"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="boot-progress-label">
          <span>
            ▶ {pending ? "正在载入" : failures ? "可以启程" : "准备就绪"}{" "}
            <b>{progress}%</b>
          </span>
          <span>
            {complete} / {assets.length} · NOMAD CITY
          </span>
        </div>
        {failures > 0 && (
          <p className="boot-resource-error">
            {failures} 项图片暂未载入，可以重试或继续进入。
          </p>
        )}
      </div>
      <footer className="boot-footer">
        <span>明日方舟 · 游城拓荒</span>
        <span>好友联机 / v{import.meta.env.VITE_APP_VERSION}</span>
      </footer>
      {phase === "choice" &&
        (offerFullscreen ? (
          <FullscreenWelcome
            phone={display.phone}
            onDone={() => setPhase("revealing")}
            failedCount={failures}
            onRetry={retry}
          />
        ) : (
          <div className="boot-recovery">
            <button className="secondary-button" onClick={retry}>
              重试图片
            </button>
            <button
              className="primary-button"
              onClick={() => setPhase("revealing")}
            >
              继续进入 →
            </button>
          </div>
        ))}
    </div>
  );
}
