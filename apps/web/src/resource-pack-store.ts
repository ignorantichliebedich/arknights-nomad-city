import {
  MAX_RESOURCE_PACK_BYTES,
  readResourcePackDownloads,
  RESOURCE_PACK_MANIFEST,
  type ResourcePack,
} from "../../../packages/shared/resource-pack.ts";

type InstalledPack = { version: string; files: [string, Blob][] };
const slot = "installed";

async function store<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("nomad-resources", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("packs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("packs", mode);
      const request = action(transaction.objectStore("packs"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function readInstalledPack() {
  return store<InstalledPack | undefined>("readonly", (db) => db.get(slot));
}

export async function readLatestPack() {
  const response = await fetch(RESOURCE_PACK_MANIFEST, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error();
  const pack: ResourcePack | null = await response.json();
  if (pack === null) return null;
  if (
    typeof pack?.version !== "string" ||
    !/^[a-f0-9]{64}$/.test(pack.version) ||
    !Number.isSafeInteger(pack.bytes) ||
    pack.bytes <= 0 ||
    pack.bytes > MAX_RESOURCE_PACK_BYTES
  )
    throw new Error();
  return {
    version: pack.version,
    bytes: pack.bytes,
    downloads: readResourcePackDownloads(pack.downloads),
  };
}

export async function installPack(file: File, pack: ResourcePack) {
  if (file.size !== pack.bytes)
    throw new Error("这个 ZIP 与当前资源包不匹配，请下载页面提供的版本。");
  const files = await new Promise<[string, Blob][]>((resolve, reject) => {
    const worker = new Worker(
      new URL("./resource-pack.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.files) resolve(data.files);
      else reject(new Error("资源包校验失败，请重新下载并导入。"));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("浏览器无法读取这个资源包。"));
    };
    worker.postMessage({ file, version: pack.version });
  });
  try {
    await store("readwrite", (db) =>
      db.put({ version: pack.version, files }, slot),
    );
  } catch {
    throw new Error("浏览器保存失败。请检查可用空间或改用普通窗口后重试。");
  }
}
