import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  FACILITIES,
  ROLES,
  EVENTS,
  PATTERNS,
  ENTERPRISE_IMAGES,
  boardFor,
} from "../packages/rules/src/data.ts";
const root = resolve("apps/web/public");
const images = new Set(
  [...FACILITIES, ...ROLES, ...EVENTS, ...PATTERNS].map((x) => x.image),
);
for (const image of Object.values(ENTERPRISE_IMAGES)) {
  images.add(image);
  images.add(image.replace(".webp", "-hd.webp"));
}
images.add(boardFor(3).image);
images.add(boardFor(4).image);
images.add(boardFor(3).image.replace(".webp", "-hd.webp"));
images.add(boardFor(4).image.replace(".webp", "-hd.webp"));
for (const role of ROLES)
  if (/\/role-\d+\.webp$/.test(role.image))
    images.add(role.image.replace(".webp", "-hd.webp"));
images.add("/assets/cards-167/11.webp");
images.add("/assets/cards-156/6.webp");
for (let seat = 0; seat < 4; seat++) {
  images.add(`/assets/avatar-${seat}.webp`);
  images.add(`/assets/entrepreneur-${seat}.webp`);
  images.add(`/assets/entrepreneur-bust-${seat}.webp`);
  images.add(`/assets/city-model-${seat}.svg`);
  images.add(`/assets/role-back-${seat}.webp`);
}
for (const name of [
  "role-back-rhodes.webp",
  "official-arknights-logo.webp",
  "official-nomad-logo.webp",
  "table-resource-rock.webp",
  "table-resource-ore.webp",
  "table-resource-iron.webp",
  "table-resource-prime.webp",
])
  images.add(`/assets/${name}`);
for (const resource of ["rock", "ore", "iron", "prime", "cash", "score"])
  images.add(`/assets/resource-${resource}.webp`);
images.add("/assets/president.webp");
images.add("/assets/board-hint-3.webp");
images.add("/assets/board-hint-4.webp");
for (const name of [
  "terrain-margin-v1.webp",
  "nomad-table-backdrop.webp",
  "role-back.webp",
  "board-mask-3.svg",
  "board-mask-4.svg",
])
  images.add(`/assets/${name}`);
const manifest: {
  path: string;
  sha256: string;
  sourceUrl: string;
  processing: string;
}[] = JSON.parse(readFileSync("assets/manifest.json", "utf8"));
for (const image of images) {
  const path = resolve(root, `.${image}`);
  if (!path.startsWith(root) || !existsSync(path))
    throw new Error(`缺少素材：${image}`);
  const entry = manifest.find((m) => resolve(m.path) === path);
  if (!entry?.sourceUrl || !entry.processing)
    throw new Error(`缺少出处：${image}`);
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash !== entry.sha256) throw new Error(`素材校验失败：${image}`);
}
console.log(
  `校验 ${images.size} 个规则引用图像：文件、出处、处理说明和 SHA-256 均匹配。`,
);
const audio = JSON.parse(
  readFileSync("assets/audio-manifest.json", "utf8"),
) as {
  path: string;
  sha256: string;
  sourceUrl: string;
  sourceSha256: string;
  processing: string;
  bytes: number;
}[];
for (const entry of audio) {
  const path = resolve(entry.path);
  if (
    !path.startsWith(resolve(root, "audio/sfx") + "/") &&
    !path.startsWith(resolve(root, "audio/sfx") + "\\")
  )
    throw new Error("音效路径越界：" + entry.path);
  const bytes = readFileSync(path);
  if (
    !entry.sourceUrl ||
    !entry.sourceSha256 ||
    !entry.processing ||
    bytes.length !== entry.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256
  )
    throw new Error("音效校验失败：" + entry.path);
}
console.info(
  "校验 " +
    audio.length +
    " 个原版音效：出处、处理说明、大小与 SHA-256 均匹配。",
);
