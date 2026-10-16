import { TITLE_GLYPHS } from "./components/PosterTitle.tsx";

export type ArtworkStatus = "pending" | "loaded" | "failed";
export function entryArtwork(invited: boolean, restoring: boolean): string[] {
  const brand = [
    "/assets/official-nomad-logo.webp",
    "/assets/official-arknights-logo.webp",
  ];
  if (restoring) return brand;
  return [
    ...brand,
    "/assets/nomad-table-backdrop.webp",
    "/assets/city-model-0.svg",
    ...(invited
      ? []
      : [
          ...TITLE_GLYPHS,
          ...[0, 1, 2, 3].map((i) => `/assets/entrepreneur-${i}.webp`),
        ]),
  ];
}

/** A resource completes only after decode; stalled images have a bounded retry path. */
export function decodeArtwork(
  src: string,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    function finish(ok: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      signal.removeEventListener("abort", abort);
      resolve(ok);
    }
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), 8000);
    if (signal.aborted) {
      finish(false);
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    img.onload = () => {
      if (!img.naturalWidth) {
        finish(false);
        return;
      }
      if (img.decode)
        void img.decode().then(
          () => finish(true),
          () => finish(false),
        );
      else finish(true);
    };
    img.onerror = () => finish(false);
    img.src = src;
  });
}
