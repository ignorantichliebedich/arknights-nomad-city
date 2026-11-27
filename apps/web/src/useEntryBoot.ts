import { useCallback, useEffect, useRef, useState } from "react";
import { gameAudio } from "./audio.ts";
import { readCredential } from "./network.ts";
import {
  decodeArtwork,
  entryArtwork,
  type ArtworkStatus,
} from "./entry-loading.ts";
import { ENTRY_MOTION, motionDuration } from "./entry-motion.ts";
import {
  FULLSCREEN_PROMPT_KEY,
  shouldOfferFullscreen,
} from "./components/FullscreenWelcome.tsx";

type Phase =
  "intro" | "pack" | "loading" | "settling" | "choice" | "revealing" | "ready";

export function useEntryBoot() {
  const [route] = useState(() => {
    const code =
      /^\/room\/([A-Z0-9]{6})$/i.exec(location.pathname)?.[1].toUpperCase() ??
      "";
    const restoring = !!code && !!readCredential(code);
    return {
      assets: entryArtwork(!!code, restoring),
      restoring,
      offerFullscreen: !restoring && shouldOfferFullscreen(),
    };
  });
  const { assets, offerFullscreen } = route;
  const [status, setStatus] = useState<Record<string, ArtworkStatus>>(() =>
    Object.fromEntries(assets.map((src) => [src, "pending"])),
  );
  const loaded = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [packReady, setPackReady] = useState(false);
  const acceptPack = useCallback(() => {
    setPackReady(true);
    setPhase("loading");
  }, []);
  const failures = Object.values(status).filter((s) => s === "failed").length;
  const complete = Object.values(status).filter((s) => s === "loaded").length;
  const pending = Object.values(status).some((s) => s === "pending");
  const revealDuration = motionDuration(
    route.restoring ? ENTRY_MOTION.reduced : ENTRY_MOTION.reveal,
  );

  useEffect(() => {
    if (packReady) gameAudio.preload();
  }, [packReady]);
  useEffect(() => {
    const timer = setTimeout(
      () => setPhase("pack"),
      offerFullscreen ? motionDuration(ENTRY_MOTION.intro) : 0,
    );
    return () => clearTimeout(timer);
  }, [offerFullscreen]);
  useEffect(() => {
    if (!packReady) return;
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
  }, [assets, attempt, packReady]);
  useEffect(() => {
    // Animation and resource readiness are separate gates; progress stays factual.
    if (phase === "loading" && !pending) setPhase("settling");
  }, [phase, pending]);
  useEffect(() => {
    if (phase !== "settling") return;
    const timer = setTimeout(
      () => setPhase(offerFullscreen || failures ? "choice" : "revealing"),
      offerFullscreen ? motionDuration(ENTRY_MOTION.settle) : 0,
    );
    return () => clearTimeout(timer);
  }, [phase, failures, offerFullscreen]);
  useEffect(() => {
    if (phase !== "revealing") return;
    try {
      sessionStorage.setItem(FULLSCREEN_PROMPT_KEY, "1");
    } catch {
      /* This visit can continue. */
    }
    const timer = setTimeout(() => setPhase("ready"), revealDuration);
    return () => clearTimeout(timer);
  }, [phase, revealDuration]);

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
  return {
    phase,
    packReady,
    acceptPack,
    failures,
    complete,
    pending,
    offerFullscreen,
    revealDuration,
    total: assets.length,
    progress: Math.round((complete / assets.length) * 100),
    fullIntro: offerFullscreen && attempt === 0,
    retry,
    reveal: () => setPhase("revealing"),
  };
}
