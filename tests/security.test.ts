import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGameServer,
  type ServerOptions,
} from "../apps/server/src/server.ts";
import { RoomStore } from "../apps/server/src/store.ts";
const apps: ReturnType<typeof createGameServer>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
async function start(options: ServerOptions = {}) {
  const app = createGameServer({ database: ":memory:", ...options });
  apps.push(app);
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const port = (app.http.address() as { port: number }).port;
  return {
    app,
    url: "http://127.0.0.1:" + port,
    ws: "ws://127.0.0.1:" + port + "/ws",
  };
}
async function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url + "/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}
async function socket(address: string) {
  const ws = new WebSocket(address),
    messages: any[] = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  ws.on("error", () => {});
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, messages };
}
async function until(predicate: () => boolean) {
  await expect.poll(predicate, { timeout: 5000 }).toBe(true);
}
describe("公网防护", () => {
  it("生产来源白名单不能由同名 Host 绕过，允许正常白名单请求", async () => {
    const server = await start({ allowedOrigins: ["https://friends.example"] });
    expect(
      (
        await post(
          server.url,
          { name: "入侵" },
          { origin: "https://attacker.example", host: "attacker.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          server.url,
          { name: "入侵" },
          { origin: "http://friends.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          server.url,
          { name: "房主" },
          { origin: "https://friends.example" },
        )
      ).status,
    ).toBe(201);
    expect(server.app.store.count()).toBe(1);
  });
  it("限制建房频率与 API 扫描，返回可重试状态", async () => {
    const server = await start({
      securityLimits: { roomsPerMinute: 1, apiPerMinute: 3 },
    });
    expect((await post(server.url, { name: "一" })).status).toBe(201);
    const blocked = await post(server.url, { name: "二" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    expect((await fetch(server.url + "/api/unknown-a")).status).toBe(404);
    expect((await fetch(server.url + "/api/unknown-b")).status).toBe(429);
    expect(server.app.store.count()).toBe(1);
  });
  it("房间容量满后保留已有房间并允许朋友加入", async () => {
    const server = await start({ securityLimits: { maxRooms: 1 } });
    const created = await post(server.url, { name: "房主" });
    expect((await post(server.url, { name: "另一个房间" })).status).toBe(503);
    const joined = await fetch(
      server.url + "/api/rooms/" + created.body.room.id + "/join",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "朋友" }),
      },
    );
    expect(joined.status).toBe(201);
    expect(server.app.store.get(created.body.room.id)!.seats).toHaveLength(2);
  });
  it("拒绝超大请求、表单跨站写入与隐藏路径，安全头允许全屏和同源音频", async () => {
    const server = await start();
    expect(
      (await post(server.url, { name: "大包", padding: "x".repeat(17000) }))
        .status,
    ).toBe(413);
    expect(
      (
        await post(
          server.url,
          { name: "跨站" },
          { "sec-fetch-site": "cross-site" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(server.url + "/api/rooms", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: '{"name":"表单"}',
        })
      ).status,
    ).toBe(415);
    expect((await fetch(server.url + "/.env")).status).toBe(404);
    expect((await fetch(server.url + "/assets/missing.mp3")).status).toBe(404);
    const health = await fetch(server.url + "/api/health");
    expect(health.headers.get("permissions-policy")).toContain(
      "fullscreen=(self)",
    );
    expect(health.headers.get("content-security-policy")).toContain(
      "media-src 'self'",
    );
    expect(health.headers.get("x-frame-options")).toBe("DENY");
    expect(server.app.store.count()).toBe(0);
  });
  it("连接额度包含未验证连接，断开后释放额度", async () => {
    const server = await start({ securityLimits: { maxPerIp: 1 } });
    const first = await socket(server.ws);
    const refused = new WebSocket(server.ws);
    refused.on("error", () => {});
    const status = await new Promise<number>((resolve, reject) => {
      refused.on("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode!);
      });
      refused.on("open", () => reject(new Error("Connection cap bypassed")));
    });
    expect(status).toBe(429);
    refused.terminate();
    const closed = new Promise((resolve) => first.ws.once("close", resolve));
    first.ws.close();
    await closed;
    const next = await socket(server.ws);
    expect(next.ws.readyState).toBe(WebSocket.OPEN);
    next.ws.close();
  });
  it.each(["malformed", "binary", "oversized"] as const)(
    "异常 %s 帧在裁定前断开且不写入状态",
    async (mode) => {
      const server = await start(),
        client = await socket(server.ws);
      const closed = new Promise<number>((resolve) =>
        client.ws.once("close", resolve),
      );
      if (mode === "malformed") {
        client.ws.send("{");
        client.ws.send("{");
        client.ws.send("{");
      } else if (mode === "binary")
        client.ws.send(Buffer.from('{"type":"hello"}'));
      else
        client.ws.send(
          JSON.stringify({ type: "hello", padding: "x".repeat(18000) }),
        );
      expect(await closed).toBe(
        mode === "binary" ? 1003 : mode === "oversized" ? 1009 : 1008,
      );
      expect(server.app.store.count()).toBe(0);
    },
  );
  it("未验证的普通消息也受频率限制", async () => {
    const server = await start({ securityLimits: { messagesPerMinute: 2 } }),
      client = await socket(server.ws);
    const closed = new Promise<number>((resolve) =>
      client.ws.once("close", resolve),
    );
    for (let i = 0; i < 3; i++) client.ws.send('{"type":"unknown"}');
    expect(await closed).toBe(1008);
    expect(server.app.store.count()).toBe(0);
  });
  it("单房指令记录限额保留旧回执和已保存状态", async () => {
    const server = await start({ securityLimits: { maxRoomCommands: 1 } });
    const created = await post(server.url, { name: "房主" }),
      client = await socket(server.ws);
    client.ws.send(
      JSON.stringify({
        type: "hello",
        roomId: created.body.room.id,
        token: created.body.token,
      }),
    );
    await until(() =>
      client.messages.some((message) => message.type === "state"),
    );
    const first = {
      type: "ready",
      ready: true,
      revision: 0,
      requestId: randomUUID(),
    };
    client.ws.send(JSON.stringify(first));
    await until(() =>
      client.messages.some(
        (message) =>
          message.type === "ack" && message.requestId === first.requestId,
      ),
    );
    const blockedId = randomUUID();
    client.ws.send(
      JSON.stringify({
        type: "ready",
        ready: false,
        revision: 1,
        requestId: blockedId,
      }),
    );
    await until(() =>
      client.messages.some(
        (message) =>
          message.type === "error" && message.requestId === blockedId,
      ),
    );
    client.ws.send(JSON.stringify(first));
    await until(
      () =>
        client.messages.filter(
          (message) =>
            message.type === "ack" && message.requestId === first.requestId,
        ).length === 2,
    );
    const saved = server.app.store.get(created.body.room.id)!;
    expect(saved.revision).toBe(1);
    expect(saved.seats[0].ready).toBe(true);
    expect(server.app.store.countCommands(saved.id)).toBe(1);
    client.ws.close();
  });
  it("自动备份保留最近两份，手工备份及其他文件保持原样", async () => {
    const folder = mkdtempSync(join(tmpdir(), "nomad-backup-retention-")),
      store = new RoomStore(":memory:");
    try {
      const manual = await store.backup(folder);
      const digest = () =>
        createHash("sha256").update(readFileSync(manual)).digest("hex");
      const original = digest();
      writeFileSync(
        join(folder, "auto-nomad-city-not-a-date.sqlite"),
        "retained",
      );
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await store.backup(folder, { automatic: true, keep: 2 });
      }
      const files = readdirSync(folder);
      expect(
        files.filter((file) => /^auto-nomad-city-\d/.test(file)),
      ).toHaveLength(2);
      expect(files).toContain("auto-nomad-city-not-a-date.sqlite");
      expect(digest()).toBe(original);
      await expect(
        store.backup(folder, { automatic: true, keep: 0 }),
      ).rejects.toThrow("retention");
    } finally {
      store.close();
    }
  });
});
