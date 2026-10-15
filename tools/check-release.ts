import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { compareVersions, versionParts } from "./release-version.ts";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
versionParts(pkg.version);
const changelog = readFileSync("CHANGELOG.md", "utf8");
const current = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\r?$/m.exec(changelog);
if (!current || current[1] !== pkg.version)
  throw new Error(
    "package.json version must match the newest CHANGELOG.md entry",
  );
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--base"))
  throw new Error("Usage: pnpm release:check [--base git-ref]");
const base = args[1] ?? process.env.RELEASE_BASE_REF;
if (base && !/^0+$/.test(base)) {
  if (!/^[\w./-]+$/.test(base) || base.startsWith("-"))
    throw new Error("Invalid base ref");
  const previous = spawnSync("git", ["show", base + ":package.json"], {
    encoding: "utf8",
  });
  if (previous.status !== 0)
    throw new Error("Cannot read release base: " + base);
  const version = JSON.parse(previous.stdout).version;
  if (compareVersions(pkg.version, version) <= 0)
    throw new Error(
      `Version must increase from ${version}; run pnpm release:prepare before pushing`,
    );
}
console.info(
  `Release v${pkg.version} and changelog agree${base ? "; version increased from the Git base" : ""}. Cloud deployment is a separate manual step.`,
);
