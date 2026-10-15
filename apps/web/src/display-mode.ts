import { useEffect, useState } from "react";

type Orientation = ScreenOrientation & {
  lock?: (value: "landscape") => Promise<void>;
};
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
let ownsOrientation = false;
const CHANGE = "nomad:display-change";
export function isPhone() {
  return (
    matchMedia("(pointer: coarse)").matches &&
    Math.min(
      screen.width || innerWidth,
      screen.height || innerHeight,
      innerWidth,
      innerHeight,
    ) <= 700
  );
}
function nativeFullscreen() {
  return (
    document.fullscreenElement ??
    (document as FullscreenDocument).webkitFullscreenElement
  );
}
export function displaySnapshot() {
  return {
    nativeFullscreen: !!nativeFullscreen(),
    phone: isPhone(),
    portrait: innerHeight > innerWidth,
    fullscreen:
      !!nativeFullscreen() ||
      document.documentElement.dataset.windowFullscreen === "true",
    height: Math.round(
      Math.abs((window.visualViewport?.scale ?? 1) - 1) < 0.01
        ? (window.visualViewport?.height ?? innerHeight)
        : innerHeight,
    ),
  };
}
function changed() {
  document.dispatchEvent(new Event(CHANGE));
}
function unlock() {
  if (!ownsOrientation) return;
  ownsOrientation = false;
  try {
    screen.orientation?.unlock();
  } catch {
    /* Not exposed by every browser. */
  }
}
export async function enterGameFullscreen() {
  const root = document.documentElement as FullscreenRoot;
  if (!nativeFullscreen()) {
    try {
      if (root.requestFullscreen)
        await root.requestFullscreen({ navigationUI: "hide" });
      else if (root.webkitRequestFullscreen)
        await root.webkitRequestFullscreen();
      else throw new Error("Fullscreen unavailable");
      delete root.dataset.windowFullscreen;
    } catch (error) {
      if (!isPhone()) throw error;
      // Keep a usable edge-to-edge table on browsers without document fullscreen.
      root.dataset.windowFullscreen = "true";
    }
  }
  changed();
  if (isPhone() && nativeFullscreen()) {
    try {
      const orientation = screen.orientation as Orientation | undefined;
      if (orientation?.lock) {
        await orientation.lock("landscape");
        ownsOrientation = true;
        if (!nativeFullscreen()) unlock();
      }
    } catch {
      /* Rotation guidance remains available when locking is denied. */
    }
  }
  changed();
}
export async function exitGameFullscreen() {
  unlock();
  delete document.documentElement.dataset.windowFullscreen;
  if (document.fullscreenElement) await document.exitFullscreen();
  else if ((document as FullscreenDocument).webkitFullscreenElement)
    await (document as FullscreenDocument).webkitExitFullscreen?.();
  changed();
}
export function useDisplayMode() {
  const [value, setValue] = useState(displaySnapshot);
  useEffect(() => {
    const update = () => {
      if (!nativeFullscreen()) unlock();
      const next = displaySnapshot();
      setValue((previous) =>
        Object.keys(next).every(
          (key) =>
            next[key as keyof typeof next] ===
            previous[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    document.addEventListener(CHANGE, update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
      document.removeEventListener(CHANGE, update);
    };
  }, []);
  return value;
}
