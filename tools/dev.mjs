import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const processes = [
  spawn(process.execPath, ["--watch", "apps/server/src/index.ts"], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts"],
    { cwd: root, stdio: "inherit" },
  ),
];
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  for (const child of processes) child.kill();
}
for (const child of processes)
  child.on("exit", (code) => {
    if (!closing) {
      stop();
      process.exitCode = code ?? 1;
    }
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
