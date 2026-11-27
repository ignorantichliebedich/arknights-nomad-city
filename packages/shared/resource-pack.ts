export const RESOURCE_PACK_MANIFEST = "/resource-packs/current.json";
export const MAX_RESOURCE_PACK_BYTES = 256 * 1024 * 1024;

export const resourcePackSources = {
  github: { label: "GitHub", host: "github.com" },
  baidu: { label: "百度网盘", host: "pan.baidu.com" },
  quark: { label: "夸克网盘", host: "pan.quark.cn" },
} as const;
export type ResourcePackSource = keyof typeof resourcePackSources;
export const resourcePackSourceIds = Object.keys(
  resourcePackSources,
) as ResourcePackSource[];
export type ResourcePackDownloads = Partial<
  Record<ResourcePackSource, { url: string; code?: string }>
>;

export type ResourcePack = {
  version: string;
  bytes: number;
  downloads: ResourcePackDownloads;
};

export function readResourcePackDownloads(
  value: unknown,
): ResourcePackDownloads {
  const downloads: ResourcePackDownloads = {};
  if (!value || typeof value !== "object") return downloads;
  for (const source of resourcePackSourceIds) {
    const entry = (value as Record<string, unknown>)[source];
    if (!entry || typeof entry !== "object") continue;
    const { url, code } = entry as { url?: unknown; code?: unknown };
    if (typeof url !== "string") continue;
    let link: URL;
    try {
      link = new URL(url);
    } catch {
      continue;
    }
    if (
      link.origin !== `https://${resourcePackSources[source].host}` ||
      link.username ||
      link.password ||
      link.pathname === "/"
    )
      continue;
    downloads[source] = {
      url: link.href,
      ...(source !== "github" &&
      typeof code === "string" &&
      /^[a-zA-Z0-9]{4}$/.test(code)
        ? { code }
        : {}),
    };
  }
  return downloads;
}

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
