import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.platform !== "win32")
  throw new Error("Run this packager on Windows.");
const root = fileURLToPath(new URL("../", import.meta.url));
const releases = resolve(root, ".data/releases");
mkdirSync(releases, { recursive: true });
const stage = mkdtempSync(resolve(releases, "windows-stage-"));
function run(program: string, args: string[], env = process.env) {
  const result = spawnSync(program, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${program} exited with ${result.status}`);
}
// Build inside the staging directory, keeping the currently served frontend intact.
run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
run(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "build",
  "--config",
  "apps/web/vite.config.ts",
  "--outDir",
  resolve(stage, "apps/web/dist"),
  "--emptyOutDir",
]);
for (const relative of [
  "apps/server/src",
  "packages/rules/src",
  "assets",
  "tools/backup.ts",
]) {
  const destination = resolve(stage, relative);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(resolve(root, relative), destination, {
    recursive: true,
    dereference: true,
  });
}
const require = createRequire(import.meta.url);
const wsSource = dirname(require.resolve("ws/package.json"));
mkdirSync(resolve(stage, "node_modules"), { recursive: true });
cpSync(wsSource, resolve(stage, "node_modules/ws"), {
  recursive: true,
  dereference: true,
});
mkdirSync(resolve(stage, "licenses"), { recursive: true });
for (const name of ["react", "react-dom"]) {
  const source = dirname(require.resolve(`${name}/package.json`));
  cpSync(resolve(source, "LICENSE"), resolve(stage, "licenses", `${name}.txt`));
}
for (const name of [
  "launcher.mjs",
  "start-game.cmd",
  "backup-game.cmd",
  "start-tunnel.cmd",
  "check-pc.ps1",
  "START-HERE.txt",
])
  cpSync(resolve(root, "deploy/windows", name), resolve(stage, name));
const original = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
writeFileSync(
  resolve(stage, "package.json"),
  JSON.stringify(
    {
      name: "nomad-city-windows-runtime",
      version: original.version,
      private: true,
      type: "module",
      engines: original.engines,
      scripts: { start: "node launcher.mjs", backup: "node tools/backup.ts" },
    },
    null,
    2,
  ) + "\n",
);
const output = resolve(releases, "nomad-city-windows.zip");
const temporary = resolve(releases, `${basename(stage)}.zip`);
run(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:NOMAD_WINDOWS_STAGE, $env:NOMAD_WINDOWS_ARCHIVE)",
  ],
  {
    ...process.env,
    NOMAD_WINDOWS_STAGE: stage,
    NOMAD_WINDOWS_ARCHIVE: temporary,
  },
);
renameSync(temporary, output);
const checksum = createHash("sha256")
  .update(readFileSync(output))
  .digest("hex");
writeFileSync(`${output}.sha256`, `${checksum}  ${basename(output)}\n`);
console.info(output);
console.info(`SHA256 ${checksum}`);
