import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { unzipSync } from "fflate";
import { resourceType } from "../../../packages/shared/resource-pack.ts";

self.onmessage = async ({
  data,
}: MessageEvent<{ file: File; version: string }>) => {
  try {
    const archive = new Uint8Array(await data.file.arrayBuffer());
    // Verify the exact release archive before the ZIP reader processes it.
    if (bytesToHex(sha256(archive)) !== data.version) throw new Error();
    const files = Object.entries(unzipSync(archive)).map(([path, bytes]) => {
      const type = resourceType(path);
      if (!type) throw new Error();
      // fflate uses Uint8Array allocations backed by ArrayBuffer.
      return [
        "/" + path,
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type }),
      ];
    });
    self.postMessage({ files });
  } catch {
    self.postMessage({ files: null });
  }
};
