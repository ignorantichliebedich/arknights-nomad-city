export const RESOURCE_PACK_MANIFEST = "/resource-packs/current.json";
export const MAX_RESOURCE_PACK_BYTES = 256 * 1024 * 1024;

export type ResourcePack = {
  version: string;
  bytes: number;
  download: string;
};

const contentTypes: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  json: "application/json",
};

export function resourceType(path: string) {
  if (!/^(assets|audio)\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.[a-z0-9]+$/i.test(path))
    return undefined;
  const extension = path.split(".").at(-1)!.toLowerCase();
  const type = contentTypes[extension];
  if (path.startsWith("assets/"))
    return type?.startsWith("image/") ? type : undefined;
  if (path === "audio/music.json" || path === "audio/voices.json") return type;
  return type?.startsWith("audio/") ||
    (path.startsWith("audio/music/covers/") && type?.startsWith("image/"))
    ? type
    : undefined;
}
