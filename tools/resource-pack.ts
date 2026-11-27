import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import type { Plugin } from "vite";
import {
  MAX_RESOURCE_PACK_BYTES,
  RESOURCE_PACK_MANIFEST,
  resourceType,
  type ResourcePackDownloads,
  type ResourcePack,
} from "../packages/shared/resource-pack.ts";

const publishedResourcePack = {
  version: "2e36df79df724e7e1349112b0f0dd66185d73063c48f939b89297d0c3e743c39",
  release:
    "https://github.com/ignorantichliebedich/arknights-nomad-city/releases/download/resource-pack-2e36df79df72",
};

export function createResourcePack(publicDir: string) {
  function list(directory: string): string[] {
    const root = join(publicDir, directory);
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return list(path);
      return entry.isFile() && resourceType(path) ? [path] : [];
    });
  }

  const artwork = list("assets");
  // A source-only build has no private artwork. It still serves the game shell.
  if (!artwork.length) return null;
  const paths = [...artwork, ...list("audio")].sort();
  const files = Object.fromEntries(
    paths.map((path) => {
      const bytes = readFileSync(join(publicDir, path));
      const text = /\.(json|svg)$/i.test(path);
      return [
        path,
        text
          ? Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"))
          : bytes,
      ];
    }),
  );
  const archive = zipSync(files, { level: 0, mtime: new Date(2000, 0, 1) });
  if (archive.byteLength > MAX_RESOURCE_PACK_BYTES)
    throw new Error("素材包超过浏览器导入上限。");
  const version = createHash("sha256").update(archive).digest("hex");
  return {
    version,
    bytes: archive.byteLength,
    filename: `nomad-city-${version}.zip`,
    archive,
  };
}

export function resourcePackPlugin(downloads: ResourcePackDownloads): Plugin {
  let publicDir: string;
  let manifest: ResourcePack | null | undefined;
  function current() {
    if (manifest !== undefined) return manifest;
    const pack = createResourcePack(publicDir);
    if (!pack) return (manifest = null);
    const github =
      downloads.github ??
      (pack.version === publishedResourcePack.version
        ? { url: `${publishedResourcePack.release}/${pack.filename}` }
        : undefined);
    manifest = {
      version: pack.version,
      bytes: pack.bytes,
      downloads: { ...downloads, github },
    };
    return manifest;
  }
  return {
    name: "nomad-resource-pack",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    configureServer(server) {
      server.watcher.on("all", (_event, path) => {
        if (
          path.startsWith(publicDir) &&
          resourceType(path.slice(publicDir.length + 1).replaceAll("\\", "/"))
        )
          manifest = undefined;
      });
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== RESOURCE_PACK_MANIFEST) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(current()));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: RESOURCE_PACK_MANIFEST.slice(1),
        source: JSON.stringify(current()),
      });
    },
  };
}
