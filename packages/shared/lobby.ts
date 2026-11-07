export type PlayerCount = 2 | 3 | 4 | null;
export type GameMode = "base" | "enterprise" | "oripathy" | "expert";
export type LobbyFilters = { mode: GameMode; players: PlayerCount };
export const MODE_NAMES: Record<GameMode, string> = {
  base: "铸基者 · 基础版",
  enterprise: "铸基者 + 企业扩展",
  oripathy: "感染者 · 常规玩法",
  expert: "感染者 · 企业家抉择",
};
export function modeFor(v: {
  expansion?: boolean;
  oripathy?: boolean;
  expert?: boolean;
}): GameMode {
  return v.oripathy
    ? v.expert
      ? "expert"
      : "oripathy"
    : v.expansion
      ? "enterprise"
      : "base";
}
export function modeOptions(mode: GameMode) {
  return {
    expansion: mode !== "base",
    oripathy: mode === "oripathy" || mode === "expert",
    expert: mode === "expert",
  };
}
export function capacity(room: { targetPlayers?: PlayerCount }) {
  return room.targetPlayers ?? 4;
}
export type PublicRoom = {
  id: string;
  hostName: string;
  seated: number;
  ready: number;
  targetPlayers: PlayerCount;
  capacity: number;
  mode: GameMode;
  createdAt: string;
};
export type MatchStatus =
  | {
      state: "waiting";
      filters: LobbyFilters;
      queued: number;
      since: number;
      expiresAt: number;
    }
  | { state: "matched"; roomId: string; playerId: string; name: string }
  | { state: "cancelled" | "expired" };
