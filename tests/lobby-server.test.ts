import { afterEach, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { createGameServer } from "../apps/server/src/server.ts";
type App = ReturnType<typeof createGameServer>;
const running: App[] = [];
afterEach(async () => {
  for (const app of running.splice(0)) await app.close();
});
async function start() {
  const app = createGameServer({ database: ":memory:" });
  running.push(app);
  await new Promise<void>((r) => app.http.listen(0, "127.0.0.1", r));
  const port = (app.http.address() as { port: number }).port;
  return {
    app,
    url: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}/ws`,
  };
}
async function post(url: string, body: unknown, token?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function client(url: string, id: string, token: string) {
  const ws = new WebSocket(url),
    inbox: any[] = [];
  let room: any;
  const waiters: { predicate: (v: any) => boolean; done: (v: any) => void }[] =
    [];
  ws.on("message", (raw) => {
    const v = JSON.parse(raw.toString());
    if (v.type === "state") room = v.room;
    const index = waiters.findIndex((w) => w.predicate(v));
    if (index < 0) inbox.push(v);
    else waiters.splice(index, 1)[0].done(v);
  });
  function next(predicate: (v: any) => boolean): Promise<any> {
    const index = inbox.findIndex(predicate);
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WebSocket response timeout")),
        3000,
      );
      waiters.push({
        predicate,
        done: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
      });
    });
  }
  await new Promise((r) => ws.once("open", r));
  ws.send(JSON.stringify({ type: "hello", roomId: id, token }));
  await next((v) => v.type === "state");
  async function send(type: string, data = {}) {
    const requestId = randomUUID();
    ws.send(
      JSON.stringify({ type, revision: room.revision, requestId, ...data }),
    );
    const result = await next((v) => v.requestId === requestId);
    if (result.type === "ack")
      await next(
        (v) => v.type === "state" && v.room.revision > result.revision - 1,
      );
    return result;
  }
  return {
    ws,
    next,
    send,
    get room() {
      return room;
    },
  };
}
describe("大厅与匹配 HTTP / WebSocket", () => {
  it("最后一位真人离座时收回人机，原房间可重新入座并获得房主", async () => {
    const s = await start();
    const host = (await post(`${s.url}/api/rooms`, { name: "A" })).body;
    const room = s.app.store.get(host.room.id)!;
    room.seats.push({
      id: "bot",
      name: "人机",
      tokenHash: "0".repeat(64),
      ready: true,
      bot: true,
    });
    s.app.store.save(room);
    expect(
      (await post(`${s.url}/api/rooms/${room.id}/leave`, {}, host.token))
        .status,
    ).toBe(200);
    expect(s.app.store.get(room.id)!.seats).toHaveLength(0);
    const next = (
      await post(`${s.url}/api/rooms/${room.id}/join`, { name: "B" })
    ).body;
    expect(next.room.hostId).toBe(next.room.me);
  });
  it("公开目录只投影已在线招募的元信息，保留私人房间并过滤玩法、人数", async () => {
    const s = await start();
    const privateRoom = (await post(`${s.url}/api/rooms`, { name: "私人房主" }))
      .body;
    const host = (
      await post(`${s.url}/api/rooms`, {
        name: "公开房主",
        isPublic: true,
        targetPlayers: 3,
      })
    ).body;
    expect((await (await fetch(`${s.url}/api/lobby`)).json()).rooms).toEqual(
      [],
    );
    await client(s.ws, host.room.id, host.token);
    const result = await (await fetch(`${s.url}/api/lobby?mode=base`)).json();
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]).toMatchObject({
      id: host.room.id,
      hostName: "公开房主",
      targetPlayers: 3,
      seated: 1,
    });
    expect(Object.keys(result.rooms[0]).sort()).toEqual(
      [
        "capacity",
        "createdAt",
        "hostName",
        "id",
        "mode",
        "ready",
        "seated",
        "targetPlayers",
      ].sort(),
    );
    expect(JSON.stringify(result)).not.toContain(host.token);
    expect(JSON.stringify(result)).not.toContain("tokenHash");
    expect(
      (await (await fetch(`${s.url}/api/lobby?players=2`)).json()).rooms,
    ).toEqual([]);
    expect(
      (await (await fetch(`${s.url}/api/lobby?mode=expert`)).json()).rooms,
    ).toEqual([]);
    expect(s.app.store.get(privateRoom.room.id)!.isPublic).toBe(false);
    expect((await fetch(`${s.url}/api/lobby?players=5`)).status).toBe(400);
  });
  it.each([2, 3, 4])(
    "%i 人同时请求可自动建房，正确凭证恢复本席，错误凭证无法冒领",
    async (players) => {
      const s = await start(),
        tokens = Array.from({ length: players }, () =>
          randomBytes(32).toString("hex"),
        );
      await Promise.all(
        tokens.map((token, i) =>
          post(
            `${s.url}/api/matchmaking`,
            { name: `玩家${i}`, mode: "expert", players },
            token,
          ),
        ),
      );
      const results = await Promise.all(
        tokens.map(async (token) =>
          (
            await fetch(`${s.url}/api/matchmaking`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).json(),
        ),
      );
      expect(results.every((v) => v.state === "matched")).toBe(true);
      expect(new Set(results.map((v) => v.roomId)).size).toBe(1);
      const id = results[0].roomId;
      const person = await client(s.ws, id, tokens[0]);
      expect(person.room.me).toBe(results[0].playerId);
      expect(person.room).toMatchObject({
        targetPlayers: players,
        oripathy: true,
        expert: true,
      });
      const room = s.app.store.get(id)!;
      expect(room.seats).toHaveLength(players);
      expect(s.app.store.count()).toBe(1);
      expect((await fetch(`${s.url}/api/matchmaking`)).status).toBe(401);
      const stranger = await fetch(`${s.url}/api/matchmaking`, {
        headers: { Authorization: `Bearer ${randomBytes(32).toString("hex")}` },
      });
      expect((await stranger.json()).state).toBe("expired");
    },
  );
  it("房主控制公开招募和目标人数，席位准备不能绕过三人局人数要求", async () => {
    const s = await start();
    const host = (
      await post(`${s.url}/api/rooms`, {
        name: "A",
        isPublic: true,
        targetPlayers: 3,
      })
    ).body;
    const friend = (
      await post(`${s.url}/api/rooms/${host.room.id}/join`, { name: "B" })
    ).body;
    const a = await client(s.ws, host.room.id, host.token),
      b = await client(s.ws, host.room.id, friend.token);
    async function sync(c: typeof a) {
      const revision = s.app.store.get(host.room.id)!.revision;
      if (c.room.revision !== revision)
        await c.next((v) => v.type === "state" && v.room.revision === revision);
    }
    async function ready() {
      for (const c of [a, b]) {
        await sync(c);
        expect((await c.send("ready", { ready: true })).type).toBe("ack");
      }
      await sync(a);
    }
    expect(
      (await b.send("lobby-settings", { isPublic: false, targetPlayers: 2 }))
        .type,
    ).toBe("error");
    await ready();
    const blocked = await a.send("start");
    expect(blocked.message).toContain("3 人");
    expect(
      (await a.send("lobby-settings", { isPublic: false, targetPlayers: 2 }))
        .type,
    ).toBe("ack");
    expect((await (await fetch(`${s.url}/api/lobby`)).json()).rooms).toEqual(
      [],
    );
    expect(s.app.store.get(host.room.id)!.seats.every((p) => !p.ready)).toBe(
      true,
    );
    await ready();
    expect(await a.send("start")).toMatchObject({ type: "ack" });
    expect(
      (await post(`${s.url}/api/rooms/${host.room.id}/leave`, {}, host.token))
        .status,
    ).toBe(409);
  });
  it("争抢最后一席不会超员，主动离座后转交房主且旧凭证失效", async () => {
    const s = await start();
    const host = (
      await post(`${s.url}/api/rooms`, {
        name: "A",
        isPublic: true,
        targetPlayers: 2,
      })
    ).body;
    await client(s.ws, host.room.id, host.token);
    const entries = await Promise.all(
      ["B", "C"].map((name) =>
        post(`${s.url}/api/rooms/${host.room.id}/join`, {
          name,
          publicJoin: true,
          mode: "base",
          players: 2,
        }),
      ),
    );
    expect(entries.map((r) => r.status).sort()).toEqual([201, 409]);
    const friend = entries.find((r) => r.status === 201)!.body;
    const rejoined = await post(
      `${s.url}/api/rooms/${host.room.id}/join`,
      { name: "A", publicJoin: true },
      host.token,
    );
    expect(rejoined.status).toBe(200);
    expect(s.app.store.get(host.room.id)!.seats).toHaveLength(2);
    expect(
      (
        await post(
          `${s.url}/api/rooms/${host.room.id}/leave`,
          {},
          friend.token + "bad",
        )
      ).status,
    ).toBe(401);
    expect(
      (await post(`${s.url}/api/rooms/${host.room.id}/leave`, {}, host.token))
        .status,
    ).toBe(200);
    const room = s.app.store.get(host.room.id)!;
    expect(room.hostId).toBe(friend.room.me);
    expect(room.seats).toHaveLength(1);
    expect(
      (await post(`${s.url}/api/rooms/${host.room.id}/leave`, {}, host.token))
        .status,
    ).toBe(401);
  });
  it("跨站匹配请求、非法凭证及错误请求体均被拒绝", async () => {
    const s = await start(),
      token = randomBytes(32).toString("hex");
    const cross = await fetch(`${s.url}/api/matchmaking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "cross-site",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "A" }),
    });
    expect(cross.status).toBe(403);
    expect(
      (await post(`${s.url}/api/matchmaking`, { name: "A" }, "bad")).status,
    ).toBe(401);
    expect(
      (await post(`${s.url}/api/matchmaking`, { name: "A", players: 8 }, token))
        .status,
    ).toBe(400);
    const cancelled = await fetch(`${s.url}/api/matchmaking`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await cancelled.json()).state).toBe("cancelled");
    expect(
      (await post(`${s.url}/api/matchmaking`, { name: "A" }, token)).body.state,
    ).toBe("cancelled");
  });
});
