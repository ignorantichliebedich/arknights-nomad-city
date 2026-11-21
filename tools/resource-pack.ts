import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import type { Plugin } from "vite";
import {
  MAX_RESOURCE_PACK_BYTES,
  RESOURCE_PACK_MANIFEST,
  resourceType,
  type ResourcePack,
} from "../packages/shared/resource-pack.ts";

export function createResourcePack(publicDir: string, download?: string) {
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
  const pathname = `/resource-packs/nomad-city-${version}.zip`;
  const manifest: ResourcePack = {
    version,
    bytes: archive.byteLength,
    download: download || pathname,
  };
  return { manifest, pathname, archive };
}

export function resourcePackPlugin(download?: string): Plugin {
  let publicDir: string;
  let pack: ReturnType<typeof createResourcePack> | undefined;
  const current = () => (pack ??= createResourcePack(publicDir, download));
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
          pack = undefined;
      });
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (!path?.startsWith("/resource-packs/")) return next();
        const release = current();
        if (path === RESOURCE_PACK_MANIFEST) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          return res.end(JSON.stringify(release?.manifest ?? null));
        }
        if (!release || path !== release.pathname) return next();
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Length", release.archive.byteLength);
        res.end(req.method === "HEAD" ? undefined : release.archive);
      });
    },
    generateBundle() {
      const release = current();
      this.emitFile({
        type: "asset",
        fileName: RESOURCE_PACK_MANIFEST.slice(1),
        source: JSON.stringify(release?.manifest ?? null),
      });
      if (release)
        this.emitFile({
          type: "asset",
          fileName: release.pathname.slice(1),
          source: release.archive,
        });
    },
  };
}
