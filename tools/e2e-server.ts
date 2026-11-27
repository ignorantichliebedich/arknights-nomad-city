import { createGameServer } from "../apps/server/src/server.ts";
const app = createGameServer({
  database: process.env.E2E_DATABASE_PATH ?? ":memory:",
  webRoot: process.env.E2E_WEB_ROOT,
  resourcePackCheck: process.env.E2E_REQUIRE_RESOURCE_PACK === "1",
  // Security limits have dedicated isolated tests; UI fixtures create many short games.
  securityLimits: {
    roomsPerMinute: 120,
    apiPerMinute: 2000,
    connectionsPerMinute: 300,
  },
});
app.http.listen(Number(process.env.E2E_PORT ?? "3011"), "127.0.0.1");
process.on("SIGTERM", () => {
  void app.close();
});
process.on("SIGINT", () => {
  void app.close();
});
