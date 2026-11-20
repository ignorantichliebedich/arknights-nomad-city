import type { BatchChoice, GameState } from "./types.ts";

/** Only independent, deterministic repetitions can be submitted together.
 * Derive the remaining count from saved steps so older pending saves work too.
 * Refilling markets and effects with intervening choices remain sequential.
 */
export function batchChoice(s: GameState, id: string): BatchChoice | undefined {
  const d = s.parallel ? s.parallel.players[id]?.decision : s.decision;
  if (!d || d.playerId !== id || !d.options.length) return;
  const rules: Record<string, { step: string; label: string }> = {
    trim: { step: "trim-hand", label: "放回卡盒" },
    allocate: { step: "allocate", label: "分配资源" },
    "pay-basic": { step: "pay-basic", label: "支付资源" },
  };
  const repeat = rules[d.kind];
  if (!repeat) return;
  const counts = d.options.map(
    (o) =>
      1 +
      Number(
        o.steps.find((step) => step.kind === repeat.step)?.data?.count ?? 0,
      ),
  );
  const count = counts[0];
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 32 ||
    counts.some((n) => n !== count)
  )
    return;
  const p = s.players.find((p) => p.id === id)!;
  // Passenger introduces an intervening choice about marker substitution.
  if (
    d.kind === "pay-basic" &&
    p.persistent.some((v) => v.roleId === "passenger" && v.markers > 0)
  )
    return;
  return {
    count,
    label: repeat.label,
    limits: Object.fromEntries(
      d.options.map((o) => [
        o.id,
        d.kind === "trim"
          ? 1
          : d.kind === "pay-basic"
            ? Math.min(count, p.wallet[o.id as keyof typeof p.wallet] ?? 0)
            : count,
      ]),
    ),
  };
}
