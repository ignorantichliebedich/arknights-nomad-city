import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { musicTracks } from "../apps/web/src/audio-config.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check"))
  throw new Error("Usage: pnpm music:import | pnpm music:check");
const inbox = resolve(root, "music");
const destination = resolve(root, "apps/web/public/audio/music");
const entries = JSON.parse(
  readFileSync(resolve(root, "assets/music-manifest.json"), "utf8"),
) as {
  id: string;
  title: string;
  sourceFile: string;
  path: string;
  bytes: number;
  sha256: string;
  cover?: { path: string; bytes: number; sha256: string };
}[];
const tracks = entries.map((entry) => ({
  id: entry.id,
  title: entry.title,
  src: entry.path.replace("apps/web/public", ""),
  ...(entry.cover
    ? { cover: entry.cover.path.replace("apps/web/public", "") }
    : {}),
}));
const playlist = { tracks };
if (
  !entries.length ||
  JSON.stringify(musicTracks(playlist, "http://localhost")) !==
    JSON.stringify(tracks)
)
  throw new Error("Invalid music catalog");
const plans = entries.map((entry) => {
  const source = resolve(inbox, entry.sourceFile);
  const target = resolve(root, entry.path);
  if (
    !source.startsWith(inbox + sep) ||
    !target.startsWith(destination + sep) ||
    !/^[a-z0-9-]+\.mp3$/.test(entry.path.split("/").at(-1) ?? "") ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 1 ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  )
    throw new Error("Invalid music path or fingerprint: " + entry.id);
  const bytes = readFileSync(check ? target : source);
  if (
    bytes.length !== entry.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256
  )
    throw new Error("Music fingerprint mismatch: " + entry.id);
  return { source, target };
});
const catalog = resolve(root, "apps/web/public/audio/music.json");
if (check) {
  if (
    JSON.stringify(JSON.parse(readFileSync(catalog, "utf8"))) !==
    JSON.stringify(playlist)
  )
    throw new Error("Music playlist differs from the source catalog");
} else {
  // Validate every source before writing. Original files stay in the ignored inbox.
  for (const { source, target } of plans) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  for (const entry of entries)
    if (entry.cover) {
      const cover = resolve(root, entry.cover.path);
      if (!cover.startsWith(resolve(destination, "covers") + sep))
        throw new Error("Cover path outside music folder");
      mkdirSync(dirname(cover), { recursive: true });
      const result = spawnSync(
        process.env.FFMPEG_PATH ?? "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          resolve(root, entry.path),
          "-map",
          "0:v:0",
          "-c:v",
          "copy",
          "-frames:v",
          "1",
          "-update",
          "1",
          cover,
        ],
        { encoding: "utf8" },
      );
      if (result.status !== 0)
        throw new Error(
          "Extracting embedded music cover needs FFmpeg: " + result.stderr,
        );
    }
  writeFileSync(catalog, JSON.stringify(playlist, null, 2) + "\n");
}
for (const entry of entries)
  if (entry.cover) {
    const cover = resolve(root, entry.cover.path);
    if (!cover.startsWith(resolve(destination, "covers") + sep))
      throw new Error("Cover path outside music folder");
    const bytes = readFileSync(cover);
    if (
      bytes.length !== entry.cover.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== entry.cover.sha256
    )
      throw new Error("Music cover fingerprint mismatch: " + entry.id);
  }
console.info(
  `${check ? "Verified" : "Imported"} ${tracks.length} music tracks; original bytes and filenames remain in music/.`,
);
