import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createGameServer } from "../apps/server/src/server.ts";

describe("音乐分段读取", () => {
  const root = mkdtempSync(resolve(tmpdir(), "nomad-media-"));
  const bytes = Buffer.from("0123456789abcdef");
  const app = createGameServer({ database: ":memory:", webRoot: root });
  let url: string;
  beforeAll(async () => {
    writeFileSync(resolve(root, "test.mp3"), bytes);
    await new Promise<void>((done) => app.http.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(app.http.address() as { port: number }).port}/test.mp3`;
  });
  afterAll(async () => {
    await app.close();
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("nomad-media-")
    )
      throw new Error("Unexpected scratch path");
    rmSync(root, { recursive: true, force: true });
  });
  it.each([
    ["bytes=0-1", 0, 1],
    ["bytes=8-", 8, 15],
    ["bytes=-4", 12, 15],
    ["bytes=12-99", 12, 15],
    ["bytes=-99", 0, 15],
  ])("%s 返回准确的 206 内容及长度", async (range, start, end) => {
    const response = await fetch(url, { headers: { Range: range as string } });
    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe(
      `bytes ${start}-${end}/${bytes.length}`,
    );
    expect(Number(response.headers.get("content-length"))).toBe(
      Number(end) - Number(start) + 1,
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      bytes.subarray(Number(start), Number(end) + 1),
    );
  });
  it("无可用范围返回 416，畸形、多段和无法验证的条件范围回退完整响应", async () => {
    for (const range of ["bytes=16-", "bytes=-0"]) {
      const response = await fetch(url, { headers: { Range: range } });
      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */16");
      expect((await response.arrayBuffer()).byteLength).toBe(0);
    }
    const fallbacks: Record<string, string>[] = [
      { Range: "bytes=8-2" },
      { Range: "bytes=0-1,4-5" },
      { Range: "garbage" },
      { Range: "bytes=999999999999999999999-" },
      { Range: "bytes=0-1", "If-Range": '"old"' },
    ];
    for (const headers of fallbacks) {
      const response = await fetch(url, { headers });
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    }
    const head = await fetch(url, {
      method: "HEAD",
      headers: { Range: "bytes=0-1" },
    });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("16");
    expect((await head.arrayBuffer()).byteLength).toBe(0);
  });
});
