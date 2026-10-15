import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, ".data/releases/nomad-city-deploy.tar.gz");
// Explicit source paths keep local games, browser tokens, .env and research caches out.
const paths = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "Dockerfile",
  "compose.yaml",
  "compose.ip-https.yaml",
  ".dockerignore",
  ".env.example",
  "README.md",
  "apps/server/src",
  "apps/web/src",
  "apps/web/public",
  "apps/web/index.html",
  "apps/web/vite.config.ts",
  "packages/rules/src",
  "assets",
  "deploy",
  "tools/backup.ts",
  "tools/package-deploy.ts",
  "tools/restore-assets.ts",
  "THIRD_PARTY_NOTICES.md",
  "SECURITY.md",
  "docs/audio.md",
  "docs/deployment.md",
  "docs/cloud-server.md",
];
mkdirSync(dirname(output), { recursive: true });
const result = spawnSync("tar", ["-czf", output, "-C", root, ...paths], {
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`tar exited with ${result.status}`);
const checksum = createHash("sha256")
  .update(readFileSync(output))
  .digest("hex");
writeFileSync(`${output}.sha256`, `${checksum}  ${basename(output)}\n`);
console.info(output);
console.info(`SHA256 ${checksum}`);
