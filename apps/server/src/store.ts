import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GameState } from "../../../packages/rules/src/types.ts";
export type Seat = {
  id: string;
  name: string;
  tokenHash: string;
  ready: boolean;
  bot?: true;
};
export type Room = {
  id: string;
  hostId: string;
  expansion: boolean;
  oripathy?: boolean;
  expert?: boolean;
  revision: number;
  seats: Seat[];
  game: GameState | null;
  createdAt: string;
  updatedAt: string;
};
export class RoomStore {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS commands(room_id TEXT NOT NULL REFERENCES rooms(id), player_id TEXT NOT NULL, command_id TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(room_id,player_id,command_id));
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT OR IGNORE INTO metadata VALUES('schema','1');`);
  }
  get(id: string): Room | null {
    const row = this.db.prepare("SELECT body FROM rooms WHERE id=?").get(id) as
      { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  replay(roomId: string, playerId: string, commandId: string) {
    const row = this.db
      .prepare(
        "SELECT response FROM commands WHERE room_id=? AND player_id=? AND command_id=?",
      )
      .get(roomId, playerId, commandId) as { response: string } | undefined;
    return row ? JSON.parse(row.response) : null;
  }
  save(
    room: Room,
    command?: { playerId: string; id: string; response: unknown },
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO rooms VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body,updated_at=excluded.updated_at",
        )
        .run(room.id, room.revision, JSON.stringify(room), room.updatedAt);
      if (command)
        this.db
          .prepare("INSERT INTO commands VALUES(?,?,?,?)")
          .run(
            room.id,
            command.playerId,
            command.id,
            JSON.stringify(command.response),
          );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  count(): number {
    return Number(
      (
        this.db.prepare("SELECT count(*) AS total FROM rooms").get() as {
          total: number;
        }
      ).total,
    );
  }
  countCommands(roomId: string): number {
    return Number(
      (
        this.db
          .prepare("SELECT COUNT(*) AS n FROM commands WHERE room_id=?")
          .get(roomId) as { n: number }
      ).n,
    );
  }
  async backup(
    directory: string,
    options: { automatic?: boolean; keep?: number } = {},
  ) {
    const keep = options.keep ?? 7;
    if (!Number.isSafeInteger(keep) || keep < 1)
      throw new Error("Invalid backup retention");
    mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const path = resolve(
      directory,
      (options.automatic ? "auto-" : "") + "nomad-city-" + stamp + ".sqlite",
    );
    await backup(this.db, path);
    if (options.automatic) {
      const root = resolve(directory);
      const automatic = readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() &&
            /^auto-nomad-city-\d{4}-\d{2}-\d{2}T[\d.-]+Z\.sqlite$/.test(
              entry.name,
            ),
        )
        .map((entry) => entry.name)
        .sort();
      for (const name of automatic.slice(
        0,
        Math.max(0, automatic.length - keep),
      )) {
        const target = resolve(root, name);
        if (dirname(target) !== root)
          throw new Error("Backup path escaped directory");
        unlinkSync(target);
      }
    }
    return path;
  }
  close() {
    this.db.close();
  }
}
