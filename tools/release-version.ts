import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type ReleaseKind = "patch" | "minor" | "major";
export function versionParts(version: string): number[] {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error("Use a stable major.minor.patch version: " + version);
  const parts = version.split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part)))
    throw new Error("Version is too large");
  return parts;
}
export function compareVersions(a: string, b: string) {
  const left = versionParts(a),
    right = versionParts(b);
  return Math.sign(
    left[0] - right[0] || left[1] - right[1] || left[2] - right[2],
  );
}
export function nextVersion(version: string, kind: ReleaseKind) {
  const parts = versionParts(version);
  const index = ["major", "minor", "patch"].indexOf(kind);
  if (index < 0) throw new Error("Choose patch, minor or major");
  parts[index]++;
  parts.fill(0, index + 1);
  const result = parts.join(".");
  versionParts(result);
  return result;
}
export function prepareRelease(
  root: string,
  kind: ReleaseKind,
  notes: string[],
  date: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !notes.length ||
    notes.some((note) => !note.trim() || /[\r\n]/.test(note))
  )
    throw new Error(
      "Provide a release date and at least one single-line --note",
    );
  const path = resolve(root, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  const version = nextVersion(pkg.version, kind);
  const changelogPath = resolve(root, "CHANGELOG.md");
  const heading = "# 更新记录\n\n";
  const old = existsSync(changelogPath)
    ? readFileSync(changelogPath, "utf8").replace(/\r\n/g, "\n")
    : heading;
  if (!old.startsWith(heading))
    throw new Error("Unexpected CHANGELOG.md heading");
  const entry = `## [${version}] - ${date}\n\n${notes.map((note) => "- " + note.trim()).join("\n")}\n\n`;
  pkg.version = version;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync(changelogPath, heading + entry + old.slice(heading.length));
  return version;
}
