import source from "../../../assets/board-layout.json" with { type: "json" };
import type { PlayerView } from "../../../packages/rules/src/types.ts";
type Point = { x: number; y: number };
export type SiteLayout = Point & {
  frame: { x: number; y: number; w: number; h: number };
  resource?: { x: number; y: number; w: number; h: number };
  slots: Point[];
};
const layouts = source.boards as Record<string, Record<string, SiteLayout>>;
export function siteLayout(
  game: { players: readonly unknown[] },
  id: string,
): SiteLayout {
  const layout = layouts[game.players.length === 4 ? "4" : "3"][id];
  if (!layout) throw new Error("Unknown printed map site: " + id);
  return layout;
}
// A saved game may contain coordinates from an older version. Rebase only the
// display copy; server topology, costs, state and legal action IDs stay intact.
export function displayBoard(game: PlayerView): PlayerView {
  const position = <T extends Point & { id: string }>(site: T): T => {
    const { x, y } = siteLayout(game, site.id);
    return { ...site, x, y };
  };
  return {
    ...game,
    board: {
      ...game.board,
      nodes: game.board.nodes.map(position),
      roads: game.board.roads.map(position),
    },
  };
}
export function slotPoint(game: { players: readonly unknown[] }, slot: string) {
  const split = slot.lastIndexOf(":"),
    siteId = slot.slice(0, split),
    index = Number(slot.slice(split + 1));
  const point = siteLayout(game, siteId).slots[index];
  if (!point) throw new Error("Unknown printed slot: " + slot);
  return { ...point, siteId };
}
