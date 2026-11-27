import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createResourcePack } from "./resource-pack.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const pack = createResourcePack(join(root, "apps/web/public"));
if (!pack) throw new Error("请先准备本地运行素材。");
const folder = join(root, ".data/releases/resource-packs");
mkdirSync(folder, { recursive: true });
const output = join(folder, pack.filename);
writeFileSync(output, pack.archive);
writeFileSync(output + ".sha256", `${pack.version}  ${pack.filename}\n`);
console.log(output);
