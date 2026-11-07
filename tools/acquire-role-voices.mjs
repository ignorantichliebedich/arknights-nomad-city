import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { VOICED_ROLES } from "../apps/web/src/voice-catalog.ts";

const sourceRoot = resolve(".data/sources/voices");
const htmlRoot = resolve(".data/research-voices");
mkdirSync(htmlRoot, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const records = [];
const previous = JSON.parse(readFileSync("assets/voice-manifest.json", "utf8"));
async function download(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 8 * 1024 * 1024)
        throw new Error("Unexpected source size: " + url);
      return bytes;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}
{
  for (const role of VOICED_ROLES) {
    const verified = previous.filter((record) => record.roleId === role.id);
    if (
      verified.length === 12 &&
      verified.every(
        (record) =>
          existsSync(record.path) &&
          existsSync(record.sourceFile) &&
          hash(readFileSync(record.path)) === record.sha256 &&
          hash(readFileSync(record.sourceFile)) === record.sourceSha256,
      )
    ) {
      records.push(...verified);
      console.info(role.name + ": preserved 12 verified voice clips");
      continue;
    }
    const sourcePage =
      "https://prts.wiki/w/" + encodeURIComponent(role.name) + "/语音记录";
    const cache = resolve(htmlRoot, role.id + ".html");
    if (!existsSync(cache)) {
      const html = (await download(sourcePage)).toString("utf8");
      if (!html.includes("data-voice-base"))
        throw new Error("Missing public voice index: " + role.id);
      writeFileSync(cache, html);
    }
    const html = readFileSync(cache, "utf8")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replaceAll("&amp;", "&");
    const base = /data-voice-base="([^"]+)"/.exec(html)?.[1];
    if (!base) throw new Error("Missing voice base: " + role.id);
    const bases = Object.fromEntries(
      base.split(",").map((value) => value.split(":")),
    );
    const items = [
      ...html.matchAll(/<div[^>]*class="voice-data-item"[^>]*>/g),
    ].map(([tag]) =>
      Object.fromEntries(
        [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [
          match[1],
          match[2],
        ]),
      ),
    );
    const cues = [
      ...[1, 2, 3, 4].map((n) => ({
        cue: "battle-" + n,
        item: items.find((v) => v["data-place-type"] === "BATTLE_SKILL_" + n),
      })),
      ...[1, 2].map((n) => ({
        cue: "select-" + n,
        item: items.find((v) => v["data-title"] === "选中干员" + n),
      })),
    ];
    if (cues.some((c) => !c.item))
      throw new Error("Missing battle/select cue: " + role.id);
    const tasks = Object.entries({ ja: "日语", zh: "中文-普通话" }).flatMap(
      ([language, label]) =>
        cues.map(({ cue, item }) => ({
          language,
          cue,
          item,
          base: bases[label],
        })),
    );
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (;;) {
          const job = tasks[cursor++];
          if (!job) break;
          if (!job.base)
            throw new Error(
              "Missing language: " + role.id + "/" + job.language,
            );
          const sourceUrl =
            "https://torappu.prts.wiki/assets/audio/" +
            job.base +
            "/" +
            job.item["data-voice-filename"].toLowerCase();
          const original = resolve(
            sourceRoot,
            job.language,
            role.id,
            job.cue + ".wav",
          );
          mkdirSync(dirname(original), { recursive: true });
          if (!existsSync(original)) {
            const bytes = await download(sourceUrl);
            if (bytes.toString("ascii", 0, 4) !== "RIFF")
              throw new Error("Expected original WAV: " + sourceUrl);
            writeFileSync(original, bytes);
          }
          const path = `apps/web/public/audio/voices/${job.language}/${role.id}/${job.cue}.mp3`;
          mkdirSync(dirname(resolve(path)), { recursive: true });
          const ffmpeg = spawnSync(
            process.env.FFMPEG_PATH ?? "ffmpeg",
            [
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-i",
              original,
              "-vn",
              "-ac",
              "1",
              "-ar",
              "44100",
              "-c:a",
              "libmp3lame",
              "-b:a",
              "80k",
              "-map_metadata",
              "-1",
              resolve(path),
            ],
            { encoding: "utf8" },
          );
          if (ffmpeg.status !== 0)
            throw new Error(
              "Voice conversion failed: " + role.id + " " + ffmpeg.stderr,
            );
          const raw = readFileSync(original),
            output = readFileSync(path);
          records.push({
            roleId: role.id,
            language: job.language,
            cue: job.cue,
            label: job.item["data-title"],
            path,
            sourcePage,
            sourceUrl,
            sourceFile: original
              .replaceAll("\\", "/")
              .replace(resolve(".").replaceAll("\\", "/") + "/", ""),
            sourceSha256: hash(raw),
            sha256: hash(output),
            bytes: output.length,
            processing:
              "Original PRTS game voice; mono 44.1 kHz MP3 at 80 kbps; metadata removed; voice identity and spoken content retained.",
          });
        }
      }),
    );
    console.info(role.name + ": 12 voice clips verified");
  }
  records.sort((a, b) =>
    (a.roleId + a.language + a.cue).localeCompare(
      b.roleId + b.language + b.cue,
    ),
  );
  writeFileSync(
    "assets/voice-manifest.json",
    JSON.stringify(records, null, 2) + "\n",
  );
  writeFileSync(
    "apps/web/public/audio/voices.json",
    JSON.stringify(
      {
        voices: records.map(({ roleId, language, cue, path }) => ({
          roleId,
          language,
          cue,
          src: path.replace("apps/web/public", ""),
        })),
      },
      null,
      2,
    ) + "\n",
  );
  console.info(
    "Verified " +
      records.length +
      " Chinese/Japanese role voice files. Cannott and Flow cards use nonverbal table cues.",
  );
}
