import { resolve } from "node:path";
import { RoomStore } from "../apps/server/src/store.ts";
const store = new RoomStore(
  process.env.DATABASE_PATH ?? resolve(".data/state/nomad-city.sqlite"),
);
try {
  console.log(await store.backup(process.env.BACKUP_DIR ?? resolve("backups")));
} finally {
  store.close();
}
