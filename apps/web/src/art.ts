/** Detailed viewers use native scans; table thumbnails retain small assets. */
export function highResolutionArt(src: string) {
  return /^\/assets\/(?:role-\d+|cards-625\/\d+)\.webp$/.test(src)
    ? src.replace(".webp", "-hd.webp")
    : src;
}
