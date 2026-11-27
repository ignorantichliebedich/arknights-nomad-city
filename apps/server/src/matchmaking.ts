import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  capacity,
  modeFor,
  modeOptions,
  type LobbyFilters,
  type MatchStatus,
  type PlayerCount,
  type PublicRoom,
} from "../../../packages/shared/lobby.ts";
import { RuleError } from "../../../packages/rules/src/engine.ts";
import type { Room, RoomStore, Seat } from "./store.ts";
import { SecurityRejection } from "./security.ts";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function playerCount(value: unknown): PlayerCount {
  if (value === undefined || value === null) return null;
  if (value !== 2 && value !== 3 && value !== 4)
    throw new RuleError("人数请选择不限、2、3 或 4 人");
  return value;
}
export function lobbyFilters(input: Record<string, unknown>): LobbyFilters {
  const mode = input.mode ?? "base";
  if (!["base", "enterprise", "oripathy", "expert"].includes(String(mode)))
    throw new RuleError("玩法筛选无效");
  return {
    mode: mode as LobbyFilters["mode"],
    players: playerCount(input.players),
  };
}
type Ticket = {
  key: string;
  ip: string;
  name: string;
  filters: LobbyFilters;
  since: number;
  touched: number;
  state: "waiting" | "matched" | "joined" | "cancelled" | "expired";
  roomId?: string;
  playerId?: string;
  order?: number;
};
type Options = {
  online: (room: string, player: string) => boolean;
  changed: (room: string) => void;
  maxRooms: number;
  maxMatching: number;
  matchingPerIp: number;
  now?: () => number;
};
const WAIT_TTL = 90_000,
  ARRIVAL_TTL = 60_000;

/** One SQLite transaction owns queue allocation and all seats it creates. */
export class Matchmaker {
  private changed = new Set<string>();
  private now: () => number;
  private store: RoomStore;
  private options: Options;
  constructor(store: RoomStore, options: Options) {
    this.store = store;
    this.options = options;
    this.now = options.now ?? Date.now;
  }
  private get(key: string): Ticket | null {
    const row = this.store.db
      .prepare("SELECT body FROM match_tickets WHERE token_hash=?")
      .get(key) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  private save(t: Ticket) {
    this.store.db
      .prepare(
        "INSERT INTO match_tickets VALUES(?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at,status=excluded.status",
      )
      .run(t.key, JSON.stringify(t), t.touched, t.state);
  }
  private active(): Ticket[] {
    return (
      this.store.db
        .prepare(
          "SELECT rowid AS sequence,body FROM match_tickets WHERE status IN ('waiting','matched') ORDER BY rowid",
        )
        .all() as { body: string; sequence: number }[]
    ).map((v) => ({ ...JSON.parse(v.body), order: v.sequence }));
  }
  private mutate<T>(work: () => T): T {
    this.changed.clear();
    const result = this.store.atomic(work);
    for (const room of this.changed) this.options.changed(room);
    this.changed.clear();
    return result;
  }
  private saveRoom(room: Room) {
    room.revision++;
    room.updatedAt = new Date(this.now()).toISOString();
    this.store.save(room);
    this.changed.add(room.id);
  }
  removeSeat(room: Room, playerId: string) {
    if (room.game) throw new RuleError("对局已开始，席位已锁定");
    room.seats = room.seats.filter((p) => p.id !== playerId);
    if (room.seats.every((p) => p.bot)) room.seats = [];
    if (room.hostId === playerId)
      room.hostId =
        room.seats.find((p) => !p.bot)?.id ?? room.seats[0]?.id ?? "";
    this.saveRoom(room);
  }
  private expire() {
    const now = this.now();
    for (const t of this.active()) {
      if (now - t.touched < (t.state === "waiting" ? WAIT_TTL : ARRIVAL_TTL))
        continue;
      if (t.state === "matched") {
        const room = this.store.get(t.roomId!);
        if (room?.game || this.options.online(t.roomId!, t.playerId!)) {
          t.state = "joined";
          t.touched = now;
          this.save(t);
          continue;
        }
        if (room?.seats.some((s) => s.id === t.playerId))
          this.removeSeat(room, t.playerId!);
      }
      t.state = "expired";
      t.touched = now;
      this.save(t);
    }
    this.store.db
      .prepare(
        "DELETE FROM match_tickets WHERE (status IN ('joined','expired') AND updated_at<?) OR (status='cancelled' AND updated_at<?)",
      )
      .run(now - 86_400_000, now - 600_000);
  }
  rooms(filters: LobbyFilters): PublicRoom[] {
    return this.store
      .openRooms()
      .filter(
        (r) =>
          r.mode === filters.mode &&
          r.seated < (filters.players ?? r.capacity) &&
          (filters.players === null ||
            r.targetPlayers === null ||
            r.targetPlayers === filters.players) &&
          this.options.online(r.id, r.hostId),
      )
      .map(({ hostId: _, ...room }) => room);
  }
  private assign(t: Ticket, room: Room, name = t.name) {
    const seat: Seat = {
      id: randomUUID(),
      name,
      tokenHash: t.key,
      ready: false,
    };
    room.seats.push(seat);
    t.state = "matched";
    t.touched = this.now();
    t.roomId = room.id;
    t.playerId = seat.id;
    this.save(t);
  }
  private formGroups(waiting: Ticket[]) {
    for (const anchor of waiting) {
      if (anchor.state !== "waiting") continue;
      const sizes = anchor.filters.players
        ? [anchor.filters.players]
        : [4, 3, 2];
      for (const size of sizes) {
        const group = [
          anchor,
          ...waiting.filter(
            (t) =>
              t !== anchor &&
              t.state === "waiting" &&
              t.filters.mode === anchor.filters.mode &&
              (t.filters.players === null || t.filters.players === size),
          ),
        ].slice(0, size);
        if (group.length < size || this.store.count() >= this.options.maxRooms)
          continue;
        let id: string;
        do {
          id = randomBytes(3).toString("hex").toUpperCase();
        } while (this.store.get(id));
        const date = new Date(this.now()).toISOString();
        const room: Room = {
          id,
          hostId: "",
          ...modeOptions(anchor.filters.mode),
          isPublic: true,
          targetPlayers: size as PlayerCount,
          revision: 0,
          seats: [],
          game: null,
          createdAt: date,
          updatedAt: date,
        };
        for (const t of group) {
          let name = t.name,
            suffix = 2;
          while (room.seats.some((p) => p.name === name))
            name = `${t.name.slice(0, 16)}·${suffix++}`;
          this.assign(t, room, name);
        }
        room.hostId = room.seats[0].id;
        this.saveRoom(room);
        break;
      }
    }
  }
  private fillRooms(waiting: Ticket[]) {
    const available = this.store
      .openRooms()
      .filter(
        (r) => r.seated < r.capacity && this.options.online(r.id, r.hostId),
      );
    for (const t of waiting.filter((t) => t.state === "waiting")) {
      // Brief rendezvous lets concurrent requests form a complete group first.
      if (this.now() - t.since < 1000) continue;
      for (const summary of available) {
        if (
          summary.mode !== t.filters.mode ||
          summary.seated >= (t.filters.players ?? summary.capacity) ||
          (t.filters.players !== null &&
            summary.targetPlayers !== null &&
            summary.targetPlayers !== t.filters.players)
        )
          continue;
        const room = this.store.get(summary.id)!;
        if (
          room.game ||
          !room.isPublic ||
          room.seats.length >= capacity(room) ||
          room.seats.some((p) => p.name === t.name)
        )
          continue;
        if (room.targetPlayers == null && t.filters.players !== null) {
          room.targetPlayers = t.filters.players;
          for (const seat of room.seats) if (!seat.bot) seat.ready = false;
        }
        this.assign(t, room);
        this.saveRoom(room);
        summary.seated = room.seats.length;
        summary.targetPlayers = room.targetPlayers ?? null;
        summary.capacity = capacity(room);
        break;
      }
    }
  }
  private pumpInside() {
    const waiting = this.active()
      .filter((t) => t.state === "waiting")
      .sort((a, b) => a.since - b.since || (a.order ?? 0) - (b.order ?? 0));
    this.formGroups(waiting);
    this.fillRooms(waiting);
  }
  pump() {
    this.mutate(() => {
      this.expire();
      this.pumpInside();
    });
  }
  register(
    token: string,
    ip: string,
    name: string,
    filters: LobbyFilters,
  ): MatchStatus {
    return this.mutate(() => {
      this.expire();
      const key = digest(token);
      let ticket = this.get(key);
      if (ticket?.state === "cancelled" || ticket?.state === "expired")
        return this.status(ticket);
      if (!ticket) {
        const active = this.active();
        if (
          active.length >= this.options.maxMatching ||
          active.filter((t) => t.ip === digest(ip)).length >=
            this.options.matchingPerIp
        )
          throw new SecurityRejection(
            429,
            "匹配席位较多，请先取消其他页面的匹配",
          );
        ticket = {
          key,
          ip: digest(ip),
          name,
          filters,
          since: this.now(),
          touched: this.now(),
          state: "waiting",
        };
        this.save(ticket);
      } else if (
        ticket.name !== name ||
        ticket.filters.mode !== filters.mode ||
        ticket.filters.players !== filters.players
      )
        throw new RuleError("先取消原匹配，再修改筛选");
      this.pumpInside();
      const current = this.get(key)!;
      if (
        current.state === "waiting" &&
        this.store.count() >= this.options.maxRooms
      )
        throw new SecurityRejection(503, "房间容量已达上限，请稍后匹配");
      return this.status(current);
    });
  }
  poll(token: string): MatchStatus {
    return this.mutate(() => {
      this.expire();
      const ticket = this.get(digest(token));
      if (!ticket) return { state: "expired" };
      if (ticket.state === "waiting") {
        ticket.touched = this.now();
        this.save(ticket);
      }
      this.pumpInside();
      return this.status(this.get(ticket.key)!);
    });
  }
  cancel(token: string): MatchStatus {
    return this.mutate(() => {
      this.expire();
      const ticket = this.get(digest(token));
      if (!ticket) {
        const tombstones = this.store.db
          .prepare(
            "SELECT count(*) AS n FROM match_tickets WHERE status='cancelled'",
          )
          .get() as { n: number };
        if (tombstones.n >= this.options.maxMatching)
          throw new SecurityRejection(429, "取消请求较多，请稍后重试");
        this.save({
          key: digest(token),
          ip: "",
          name: "",
          filters: { mode: "base", players: null },
          state: "cancelled",
          since: this.now(),
          touched: this.now(),
        });
        return { state: "cancelled" };
      }
      if (ticket.state === "joined") return this.status(ticket);
      if (ticket.state === "matched") {
        const room = this.store.get(ticket.roomId!);
        if (room?.game || this.options.online(ticket.roomId!, ticket.playerId!))
          return this.status(ticket);
        if (room?.seats.some((p) => p.id === ticket.playerId))
          this.removeSeat(room, ticket.playerId!);
      }
      ticket.state = "cancelled";
      ticket.touched = this.now();
      this.save(ticket);
      this.pumpInside();
      return { state: "cancelled" };
    });
  }
  claim(token: string, roomId: string, playerId: string) {
    const ticket = this.get(digest(token));
    if (
      ticket?.state === "matched" &&
      ticket.roomId === roomId &&
      ticket.playerId === playerId
    ) {
      ticket.state = "joined";
      ticket.touched = this.now();
      this.save(ticket);
    }
  }
  private status(t: Ticket): MatchStatus {
    if (t.state === "matched" || t.state === "joined") {
      const seat = this.store
        .get(t.roomId!)
        ?.seats.find((p) => p.id === t.playerId);
      return seat
        ? {
            state: "matched",
            roomId: t.roomId!,
            playerId: seat.id,
            name: seat.name,
          }
        : { state: "expired" };
    }
    if (t.state !== "waiting") return { state: t.state };
    const queued = this.active().filter(
      (v) =>
        v.state === "waiting" &&
        v.filters.mode === t.filters.mode &&
        (t.filters.players === null ||
          v.filters.players === null ||
          t.filters.players === v.filters.players),
    ).length;
    return {
      state: "waiting",
      filters: t.filters,
      queued,
      since: t.since,
      expiresAt: t.touched + WAIT_TTL,
    };
  }
}
