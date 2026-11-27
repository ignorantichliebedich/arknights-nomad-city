const cssMedia = {
  "--media-backdrop": "/assets/nomad-table-backdrop.webp",
  "--media-city": "/assets/city-model-0.svg",
  "--media-board": "/assets/board-4.webp",
  "--media-mask-3": "/assets/board-mask-3.svg",
  "--media-mask-4": "/assets/board-mask-4.svg",
};

let localFiles = new Map<string, Blob>();
const urls = new Map<string, string>();

export function useLocalMedia(files: [string, Blob][]) {
  localFiles = new Map(files);
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  for (const [property, path] of Object.entries(cssMedia)) {
    document.documentElement.style.setProperty(
      property,
      `url("${assetUrl(path)}")`,
    );
  }
}

function mediaPath(src: string) {
  return (
    src.startsWith(location.origin + "/")
      ? src.slice(location.origin.length)
      : src
  ).split(/[?#]/, 1)[0];
}

export function assetUrl<T extends string | null | undefined>(
  src: T,
): T | string {
  if (!src || !localFiles.size) return src;
  const path = mediaPath(src);
  const file = localFiles.get(path);
  if (!file) return src;
  let url = urls.get(path);
  if (!url) {
    url = URL.createObjectURL(file);
    urls.set(path, url);
  }
  return url;
}

export function assetFetch(src: string, options?: RequestInit) {
  const file = localFiles.size ? localFiles.get(mediaPath(src)) : undefined;
  return file ? Promise.resolve(new Response(file)) : fetch(src, options);
}
