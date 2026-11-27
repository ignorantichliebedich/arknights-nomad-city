import type {
  LobbyFilters,
  PublicRoom,
} from "../../../packages/shared/lobby.ts";
export class LobbyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function lobbyRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new LobbyError(data.error ?? "连接失败，请稍后重试", response.status);
  return data;
}
export type RoomListing = {
  rooms: PublicRoom[];
  total: number;
  nextOffset: number | null;
};
export function listRooms(
  filters: LobbyFilters,
  offset: number,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    mode: filters.mode,
    offset: String(offset),
  });
  if (filters.players) query.set("players", String(filters.players));
  return lobbyRequest<RoomListing>(`/api/lobby?${query}`, { signal });
}
