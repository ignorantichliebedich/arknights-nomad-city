/** Shared clocks keep the visual finish and the interaction lock in step. */
export const ENTRY_MOTION = {
  intro: 1800,
  settle: 180,
  reveal: 900,
  scene: 780,
  reduced: 120,
} as const;

export function motionDuration(duration: number) {
  return matchMedia("(prefers-reduced-motion: reduce)").matches
    ? ENTRY_MOTION.reduced
    : duration;
}
