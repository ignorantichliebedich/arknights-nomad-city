import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve, dirname, sep } from "node:path";

type Asset = { path: string; sha256: string; bytes: number };
const root = resolve(process.env.ASSET_OUTPUT_ROOT ?? ".");
const base = new URL(process.env.ASSET_BASE_URL ?? "http://106.52.74.24/");
if (
  !/^https?:$/.test(base.protocol) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw new Error(
    "ASSET_BASE_URL must be an HTTP(S) origin without credentials",
  );
const entries: Asset[] = [
  ...JSON.parse(readFileSync("assets/manifest.json", "utf8")),
  ...JSON.parse(readFileSync("assets/audio-manifest.json", "utf8")),
  ...JSON.parse(readFileSync("assets/voice-manifest.json", "utf8")),
].filter((entry: Asset) =>
  /^apps\/web\/public\/(assets|audio\/(sfx|voices))\//.test(entry.path),
);
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
let cursor = 0,
  restored = 0,
  verified = 0;
async function worker() {
  while (cursor < entries.length) {
    const entry = entries[cursor++];
    const destination = resolve(root, entry.path);
    if (
      !destination.startsWith(root + sep) ||
      entry.path.split("/").some((p) => p === ".." || p === ".") ||
      !/^[a-zA-Z0-9_./-]+$/.test(entry.path) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > 32 * 1024 * 1024
    )
      throw new Error("Invalid asset manifest entry: " + entry.path);
    if (
      existsSync(destination) &&
      digest(readFileSync(destination)) === entry.sha256
    ) {
      verified++;
      continue;
    }
    const url = new URL(
      "/" + entry.path.replace("apps/web/public/", ""),
      base.origin,
    );
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(180000),
      credentials: "omit",
    });
    if (!response.ok || !response.body)
      throw new Error(
        "Asset download failed: " + entry.path + " (" + response.status + ")",
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > entry.bytes) {
        await reader.cancel();
        throw new Error("Asset exceeds manifest size: " + entry.path);
      }
      chunks.push(chunk);
    }
    reader.releaseLock();
    const bytes = Buffer.concat(chunks);
    if (size !== entry.bytes || digest(bytes) !== entry.sha256)
      throw new Error("Asset checksum mismatch: " + entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    const pending = destination + ".download";
    writeFileSync(pending, bytes);
    renameSync(pending, destination);
    restored++;
    if (restored % 25 === 0) console.info("Verified downloads: " + restored);
  }
}
await Promise.all(Array.from({ length: 2 }, () => worker()));
console.info(
  "Assets ready: " +
    restored +
    " restored, " +
    verified +
    " already verified. Artwork and audio retain their respective owners' rights.",
);
