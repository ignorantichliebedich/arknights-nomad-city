import {
  ENTREPRENEURS,
  oripathyArt,
} from "../../../packages/rules/src/oripathy-data.ts";

type IdentityPlayer = {
  seat: number;
  oripathy?: { entrepreneur: string | null };
};
const PORTRAITS: Partial<Record<(typeof ENTREPRENEURS)[number]["id"], number>> = {
  thiago: 0,
  martin: 1,
  paul: 2,
  agnes: 3,
};

/** Seat colours stay fixed; the selected identity determines every portrait. */
export function entrepreneurPresentation(player: IdentityPlayer) {
  const identity = ENTREPRENEURS.find(
    (who) => who.id === player.oripathy?.entrepreneur,
  );
  const index = identity ? PORTRAITS[identity.id] : player.seat;
  return {
    identity,
    id: identity?.id ?? `seat-${player.seat}`,
    name: identity?.name ?? "企业家",
    avatar:
      index === undefined
        ? oripathyArt(identity!.face)
        : `/assets/avatar-${index}.webp`,
    portrait:
      index === undefined
        ? oripathyArt(identity!.face)
        : `/assets/entrepreneur-${index}.webp`,
    bust:
      index === undefined
        ? oripathyArt(identity!.face)
        : `/assets/entrepreneur-bust-${index}.webp`,
    silhouette: identity?.id === "pioneer",
  };
}
