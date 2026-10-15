import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { ROLES } from "../packages/rules/src/data.ts";
const entries = JSON.parse(
  readFileSync("assets/voice-manifest.json", "utf8"),
) as {
  roleId: string;
  language: string;
  cue: string;
  path: string;
  sourcePage: string;
  sourceUrl: string;
  sourceSha256: string;
  sha256: string;
  bytes: number;
  processing: string;
}[];
const root = resolve("apps/web/public/audio/voices");
const expected = new Set(
  ROLES.filter((r) => r.id !== "cannott").flatMap((r) =>
    ["zh", "ja"].flatMap((language) =>
      [
        "battle-1",
        "battle-2",
        "battle-3",
        "battle-4",
        "select-1",
        "select-2",
      ].map((cue) => `${r.id}/${language}/${cue}`),
    ),
  ),
);
for (const entry of entries) {
  const key = `${entry.roleId}/${entry.language}/${entry.cue}`,
    path = resolve(entry.path);
  if (
    !expected.delete(key) ||
    !path.startsWith(root + sep) ||
    !entry.sourcePage.startsWith("https://prts.wiki/w/") ||
    !entry.sourceUrl.startsWith("https://torappu.prts.wiki/assets/audio/") ||
    !entry.processing ||
    !/^[a-f0-9]{64}$/.test(entry.sourceSha256)
  )
    throw new Error("Invalid voice provenance: " + key);
  const bytes = readFileSync(path);
  if (
    bytes.length !== entry.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256
  )
    throw new Error("Voice checksum mismatch: " + key);
}
if (expected.size)
  throw new Error("Missing voice variants: " + [...expected].join(", "));
const catalog = JSON.parse(
  readFileSync("apps/web/public/audio/voices.json", "utf8"),
).voices;
if (
  JSON.stringify(catalog) !==
  JSON.stringify(
    entries.map((e) => ({
      roleId: e.roleId,
      language: e.language,
      cue: e.cue,
      src: e.path.replace("apps/web/public", ""),
    })),
  )
)
  throw new Error("Voice catalog differs from provenance");
console.info(
  `Verified ${entries.length} Chinese/Japanese clips, all 14 voiced roles; Cannott uses table sounds.`,
);
