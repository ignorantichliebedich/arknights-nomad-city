export type MediaRange =
  { start: number; end: number } | "unsatisfiable" | null;

/** Single byte ranges (RFC 9110 §14). Unsupported/malformed ranges use the full response. */
export function mediaRange(
  header: string | undefined,
  size: number,
): MediaRange {
  if (!header || header.length > 128) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ([first, last].some((n) => n !== undefined && !Number.isSafeInteger(n)))
    return null;
  if (first === undefined) {
    if (!last || !size) return "unsatisfiable";
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (last !== undefined && last < first) return null;
  if (first >= size) return "unsatisfiable";
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}
