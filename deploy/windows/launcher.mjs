import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 24 || minor < 14) {
  console.error(
    "需要 Node.js 24.14 或更新的 24.x：https://nodejs.org/en/download",
  );
  process.exit(1);
}
const root = fileURLToPath(new URL("./", import.meta.url));
process.chdir(root);
if (
  !existsSync("apps/web/dist/index.html") ||
  !existsSync("node_modules/ws/package.json")
) {
  console.error("请完整解压 Windows 运行包后再启动。");
  process.exit(1);
}
const lan = process.argv.includes("--lan");
process.env.HOST = lan ? "0.0.0.0" : "127.0.0.1";
// Forwarded addresses are trusted only on the local tunnel endpoint.
process.env.TRUST_PROXY = lan ? "false" : "true";
process.env.PORT ??= "3000";
console.info(
  lan
    ? `局域网模式：朋友访问 http://本机局域网IP:${process.env.PORT}`
    : `隧道模式：本机访问 http://127.0.0.1:${process.env.PORT}`,
);
console.info("存档位于 .data/state；备份位于 backups。按 Ctrl+C 停止服务。");
await import("./apps/server/src/index.ts");
