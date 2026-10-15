import { resolve } from "node:path";
import { createGameServer } from "./server.ts";
const port = Number(process.env.PORT ?? 3000);
function integer(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Invalid environment setting: " + name);
  return value;
}
const app = createGameServer({
  database:
    process.env.DATABASE_PATH ?? resolve(".data/state/nomad-city.sqlite"),
  backupDirectory: process.env.BACKUP_DIR ?? resolve("backups"),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "true",
  securityLimits: {
    maxRooms: integer("MAX_ROOMS", 1000),
    maxConnections: integer("MAX_WS_CONNECTIONS", 128),
    maxPerIp: integer("MAX_WS_PER_IP", 16),
    maxRoomCommands: integer("MAX_ROOM_COMMANDS", 10000),
  },
  backupRetention: integer("AUTO_BACKUPS_KEEP", 7),
});
app.http.listen(port, process.env.HOST ?? "0.0.0.0", () =>
  console.info(
    `游城拓荒：http://localhost:${port} · ${process.env.HOST ?? "0.0.0.0"} · 自动保存已启用`,
  ),
);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await app.close();
}
process.on("SIGINT", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});
