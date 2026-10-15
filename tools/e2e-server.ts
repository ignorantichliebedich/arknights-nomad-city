import { createGameServer } from "../apps/server/src/server.ts";
const app = createGameServer({
  database: process.env.E2E_DATABASE_PATH ?? ":memory:",
  webRoot: process.env.E2E_WEB_ROOT,
  // Security limits have dedicated isolated tests; UI fixtures create many short games.
  securityLimits: {
    roomsPerMinute: 120,
    apiPerMinute: 2000,
    connectionsPerMinute: 300,
  },
});
app.http.listen(3011, "127.0.0.1");
process.on("SIGTERM", () => {
  void app.close();
});
process.on("SIGINT", () => {
  void app.close();
});
