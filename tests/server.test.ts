import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createGameServer } from "../apps/server/src/server.ts";
import type { ServerOptions } from "../apps/server/src/server.ts";
import {
  createGame,
  applyCommand,
  getParallelChoiceToken,
  projectView,
} from "../packages/rules/src/engine.ts";
import {
  rolePlanning,
  harvestPlanning,
  chooseFor,
} from "./fixtures/parallel.ts";
import { RoomStore } from "../apps/server/src/store.ts";
import { chooseBotCommand } from "../packages/rules/src/bot.ts";
type App = ReturnType<typeof createGameServer>;
const running: App[] = [];
afterEach(async () => {
  for (const app of running.splice(0)) await app.close();
});
async function start(database = ":memory:", options: ServerOptions = {}) {
  const app = createGameServer({ ...options, database });
  running.push(app);
  await new Promise<void>((r) => app.http.listen(0, "127.0.0.1", r));
  const address = app.http.address() as { port: number };
  return {
    app,
    url: `http://127.0.0.1:${address.port}`,
    ws: `ws://127.0.0.1:${address.port}/ws`,
  };
}
async function post(
  url: string,
  data: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}
async function client(
  address: string,
  roomId: string,
  token: string,
  headers: Record<string, string> = {},
  perMessageDeflate = true,
) {
  const ws = new WebSocket(address, { headers, perMessageDeflate });
  const inbox: any[] = [];
  const waiters: {
    predicate: (m: any) => boolean;
    resolve: (m: any) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  ws.on("message", (raw) => {
    const item = JSON.parse(raw.toString());
    const index = waiters.findIndex((w) => w.predicate(item));
    if (index >= 0) {
      const w = waiters.splice(index, 1)[0];
      clearTimeout(w.timer);
      w.resolve(item);
    } else inbox.push(item);
  });
  await new Promise((r) => ws.once("open", r));
  ws.send(JSON.stringify({ type: "hello", roomId, token }));
  function next(predicate: (m: any) => boolean) {
    const i = inbox.findIndex(predicate);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise<any>((resolve, reject) => {
      const w = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("WebSocket message timed out"));
        }, 5000),
      };
      waiters.push(w);
    });
  }
  return { ws, next };
}
describe("房间服务", () => {
  it("感染者首页配置经真实 WebSocket 开局，企业家选择保存并重启恢复", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nomad-oripathy-"));
    const database = join(directory, "rooms.sqlite");
    const server = await start(database);
    const host = (
      await post(`${server.url}/api/rooms`, {
        name: "感染者房主",
        expansion: false,
        oripathy: true,
        expert: true,
      })
    ).body;
    expect(host.room).toMatchObject({
      oripathy: true,
      expert: true,
      expansion: true,
      rulesVersion: "oripathy-2024.1111",
    });
    const guest = (
      await post(`${server.url}/api/rooms/${host.room.id}/join`, {
        name: "感染者朋友",
      })
    ).body;
    const a = await client(server.ws, host.room.id, host.token),
      b = await client(server.ws, host.room.id, guest.token);
    await a.next((m) => m.type === "state");
    await b.next((m) => m.type === "state");
    async function send(seat: typeof a, type: string, extra = {}) {
      const requestId = randomUUID();
      const message = {
        type,
        requestId,
        revision: server.app.store.get(host.room.id)!.revision,
        ...extra,
      };
      seat.ws.send(JSON.stringify(message));
      const response = await seat.next((m) => m.requestId === requestId);
      expect(response.type).toBe("ack");
      return message;
    }
    await send(a, "ready", { ready: true });
    await send(b, "ready", { ready: true });
    await send(a, "start");
    expect(server.app.store.get(host.room.id)!.game!.decision).toMatchObject({
      kind: "o:entrepreneur-draft",
      playerId: guest.room.me,
    });
    const command = await send(b, "command", {
      command: { type: "choose", optionId: "martin" },
    });
    const saved = structuredClone(server.app.store.get(host.room.id)!.game!);
    b.ws.send(JSON.stringify(command));
    expect((await b.next((m) => m.requestId === command.requestId)).type).toBe(
      "ack",
    );
    expect(server.app.store.get(host.room.id)!.game).toEqual(saved);
    a.ws.close();
    b.ws.close();
    await server.app.close();
    running.splice(running.indexOf(server.app), 1);
    const restored = await start(database);
    const reconnected = await client(restored.ws, host.room.id, guest.token);
    const snapshot = await reconnected.next((m) => m.type === "state");
    expect(restored.app.store.get(host.room.id)!.game).toEqual(saved);
    expect(
      snapshot.room.game.players.find((p: any) => p.id === guest.room.me)
        .oripathy.blueprint,
    ).toHaveLength(9);
    expect(snapshot.room.game.decision.options).toEqual([]);
    expect(snapshot.room.game.actions).toEqual([]);
    expect(JSON.stringify(snapshot.room.game)).not.toContain('"randomState"');
    reconnected.ws.close();
  });
  it("只有房主可增删人机，重复添加只执行一次，开局后锁定席位", async () => {
    const server = await start(":memory:", { botDelayMs: 5 });
    const host = (await post(`${server.url}/api/rooms`, { name: "房主" })).body;
    const guest = (
      await post(`${server.url}/api/rooms/${host.room.id}/join`, {
        name: "朋友",
        bot: true,
      })
    ).body;
    expect(guest.room.seats[1].bot).toBeUndefined();
    const a = await client(server.ws, host.room.id, host.token);
    const b = await client(server.ws, host.room.id, guest.token);
    await a.next((m) => m.type === "state");
    await b.next((m) => m.type === "state");
    const request = async (seat: typeof a, type: string, extra = {}) => {
      const requestId = randomUUID();
      const message = {
        type,
        requestId,
        revision: server.app.store.get(host.room.id)!.revision,
        ...extra,
      };
      seat.ws.send(JSON.stringify(message));
      return {
        message,
        response: await seat.next((m) => m.requestId === requestId),
      };
    };
    expect((await request(b, "add-bot")).response.message).toContain(
      "只有房主",
    );
    const added = await request(a, "add-bot");
    expect(added.response.type).toBe("ack");
    a.ws.send(JSON.stringify(added.message));
    expect(
      (await a.next((m) => m.requestId === added.message.requestId)).revision,
    ).toBe(added.response.revision);
    let room = server.app.store.get(host.room.id)!;
    expect(room.seats.filter((s) => s.bot)).toHaveLength(1);
    await request(a, "remove-bot", {
      playerId: room.seats.find((s) => s.bot)!.id,
    });
    expect(server.app.store.get(host.room.id)!.seats).toHaveLength(2);
    await request(a, "add-bot");
    await request(a, "add-bot");
    expect((await request(a, "add-bot")).response.message).toContain("满员");
    await request(a, "ready", { ready: true });
    await request(b, "ready", { ready: true });
    expect((await request(a, "start")).response.type).toBe("ack");
    expect(
      (
        await request(a, "remove-bot", {
          playerId: room.seats.find((s) => s.bot)!.id,
        })
      ).response.message,
    ).toContain("开局后");
    const state = await a.next((m) => m.type === "state" && m.room.game);
    expect(
      state.room.seats
        .filter((s: any) => s.bot)
        .every((s: any) => s.connected && s.ready && !s.tokenHash),
    ).toBe(true);
  });
  it("一位真人与人机经真实房间完成八回合，自动行动保存回执", async () => {
    const server = await start(":memory:", { botDelayMs: 1 });
    const host = (await post(`${server.url}/api/rooms`, { name: "真人" })).body;
    const seat = await client(server.ws, host.room.id, host.token);
    await seat.next((m) => m.type === "state");
    const send = async (type: string, extra = {}) => {
      const room = server.app.store.get(host.room.id)!;
      const requestId = randomUUID();
      seat.ws.send(
        JSON.stringify({
          type,
          requestId,
          revision: room.revision,
          ...(room.game?.parallel
            ? { choiceToken: getParallelChoiceToken(room.game, room.hostId) }
            : {}),
          ...extra,
        }),
      );
      return seat.next((m) => m.requestId === requestId);
    };
    await send("add-bot");
    await send("ready", { ready: true });
    await send("start");
    for (
      let n = 0;
      server.app.store.get(host.room.id)!.game!.phase !== "finished";
      n++
    ) {
      expect(n).toBeLessThan(5000);
      const room = server.app.store.get(host.room.id)!;
      const view = projectView(room.game!, room.hostId);
      const command = chooseBotCommand(view);
      if (command) {
        const result = await send("command", { command });
        expect(result.type === "ack" || result.message.includes("已更新")).toBe(
          true,
        );
      } else await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const room = server.app.store.get(host.room.id)!;
    expect(room.game!.finalScores).toHaveLength(2);
    const bot = room.seats.find((s) => s.bot)!;
    expect(
      Number(
        (
          server.app.store.db
            .prepare("SELECT COUNT(*) AS n FROM commands WHERE player_id=?")
            .get(bot.id) as { n: number }
        ).n,
      ),
    ).toBeGreaterThan(20);
    expect(
      projectView(room.game!, room.hostId).players.find((p) => p.id === bot.id)!
        .hand,
    ).toEqual([]);
  }, 20000);
  it("真人离线时暂停人机，服务重启后连接原席位继续待选", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nomad-bots-"));
    const database = join(directory, "rooms.sqlite");
    const first = await start(database, { botDelayMs: 1000 });
    const host = (await post(`${first.url}/api/rooms`, { name: "朋友" })).body;
    const { seat: bot } = {
      seat: {
        id: "bot-seat",
        name: "人机企业家 1",
        bot: true as const,
        ready: true,
        tokenHash: "0".repeat(64),
      },
    };
    const room = first.app.store.get(host.room.id)!;
    room.seats.push(bot);
    room.game = rolePlanning(2, room.seats);
    room.revision++;
    first.app.store.save(room);
    const before = JSON.stringify(room.game);
    await first.app.close();
    running.splice(running.indexOf(first.app), 1);
    const second = await start(database, { botDelayMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(JSON.stringify(second.app.store.get(room.id)!.game)).toBe(before);
    const resumed = await client(second.ws, room.id, host.token);
    await resumed.next((m) => m.type === "state");
    await expect
      .poll(
        () =>
          second.app.store.get(room.id)!.game!.parallel!.players[bot.id].ready,
      )
      .toBe(true);
    expect(
      second.app.store.get(room.id)!.game!.parallel!.players[room.hostId].ready,
    ).toBe(false);
    expect(
      second.app.store.get(room.id)!.seats.find((s) => s.id === bot.id)!.bot,
    ).toBe(true);
  });
  async function parallelRoom(
    server: Awaited<ReturnType<typeof start>>,
    count: number,
    kind = "select-role",
  ) {
    const host = await post(`${server.url}/api/rooms`, { name: "房主" });
    const id = host.body.room.id;
    const credentials = [host.body];
    for (let i = 1; i < count; i++)
      credentials.push(
        (await post(`${server.url}/api/rooms/${id}/join`, { name: `朋友${i}` }))
          .body,
      );
    const room = server.app.store.get(id)!;
    room.game =
      kind === "harvest"
        ? harvestPlanning(count, room.seats)
        : rolePlanning(count, room.seats);
    room.revision++;
    server.app.store.save(room);
    const clients = await Promise.all(
      credentials.map((c) => client(server.ws, id, c.token)),
    );
    const initialStates = await Promise.all(
      clients.map((c) => c.next((m) => m.type === "state")),
    );
    return { id, clients, credentials, room, initialStates };
  }
  it("四席协商压缩同步后期完整日志，保持私牌隔离和原请求回执", async () => {
    const server = await start();
    const { id, clients, room, initialStates } = await parallelRoom(server, 4);
    await Promise.all(
      clients.map((c, i) =>
        initialStates[i].room.seats.every((s: any) => s.connected)
          ? Promise.resolve()
          : c.next(
              (m) =>
                m.type === "state" &&
                m.room.seats.every((s: any) => s.connected),
            ),
      ),
    );
    for (let i = 0; i < 1300; i++)
      room.game!.log.push({
        seq: room.game!.log.length + 1,
        round: 7,
        actor: null,
        text: `第 ${i} 次采集：获得金券与源石，移动城市经过公路并支付路费。`,
      });
    server.app.store.save(room);
    const receivedBytes = (ws: WebSocket) =>
      (ws as unknown as { _socket: { bytesRead: number } })._socket.bytesRead;
    const before = clients.map((c) => receivedBytes(c.ws));
    expect(
      clients.every((c) => c.ws.extensions.includes("permessage-deflate")),
    ).toBe(true);
    const message = {
      type: "command",
      requestId: randomUUID(),
      revision: room.revision,
      choiceToken: getParallelChoiceToken(room.game!, room.hostId),
      command: projectView(room.game!, room.hostId).actions[0].command,
    };
    clients[0].ws.send(JSON.stringify(message));
    expect(
      (await clients[0].next((m) => m.requestId === message.requestId)).type,
    ).toBe("ack");
    const states = await Promise.all(
      clients.map((c) =>
        c.next(
          (m) => m.type === "state" && m.room.revision === room.revision + 1,
        ),
      ),
    );
    const rawBytes = states.reduce(
      (sum, m) => sum + Buffer.byteLength(JSON.stringify(m)),
      0,
    );
    const wireBytes = clients.reduce(
      (sum, c, i) => sum + receivedBytes(c.ws) - before[i],
      0,
    );
    expect(wireBytes).toBeLessThan(rawBytes * 0.3);
    const saved = server.app.store.get(id)!;
    states.forEach((m, i) => {
      expect(m.room.game).toEqual(projectView(saved.game!, room.seats[i].id));
      expect(m.room.game.log.length).toBeGreaterThanOrEqual(1300);
      expect(m.room.seats.every((s: any) => !s.tokenHash)).toBe(true);
    });
    clients[0].ws.send(JSON.stringify(message));
    expect(
      (await clients[0].next((m) => m.requestId === message.requestId)).type,
    ).toBe("ack");
    expect(server.app.store.get(id)!.revision).toBe(saved.revision);
  });

  it("未协商压缩的客户端仍可同步并准备", async () => {
    const server = await start();
    const host = (await post(`${server.url}/api/rooms`, { name: "兼容客户端" }))
      .body;
    const seat = await client(server.ws, host.room.id, host.token, {}, false);
    const initial = await seat.next((m) => m.type === "state");
    expect(seat.ws.extensions).toBe("");
    const requestId = randomUUID();
    seat.ws.send(
      JSON.stringify({
        type: "ready",
        requestId,
        revision: initial.room.revision,
        ready: true,
      }),
    );
    expect((await seat.next((m) => m.requestId === requestId)).type).toBe(
      "ack",
    );
    expect(
      (
        await seat.next(
          (m) => m.type === "state" && m.room.revision > initial.room.revision,
        )
      ).room.seats[0].ready,
    ).toBe(true);
  });

  it.each([2, 3, 4])(
    "%i 位玩家在同一房间版本同时盖放均成功，屏障只推进一次",
    async (count) => {
      const server = await start();
      const { id, clients, room } = await parallelRoom(server, count);
      const messages = room.seats.map((p) => ({
        type: "command",
        requestId: randomUUID(),
        revision: room.revision,
        choiceToken: getParallelChoiceToken(room.game!, p.id),
        command: projectView(room.game!, p.id).actions[0].command,
      }));
      clients.forEach((c, i) => c.ws.send(JSON.stringify(messages[i])));
      const replies = await Promise.all(
        clients.map((c, i) =>
          c.next((m) => m.requestId === messages[i].requestId),
        ),
      );
      expect(replies.map((r) => r.type)).toEqual(Array(count).fill("ack"));
      const after = server.app.store.get(id)!;
      expect(after.revision).toBe(room.revision + count);
      expect(after.game!.phase).toBe("actions");
      expect(
        after.game!.players.every((p) => p.selected && p.hand.length === 4),
      ).toBe(true);
      expect(
        after.game!.log.filter((e) => e.text === "第 1 回合 · 第 1 轮行动"),
      ).toHaveLength(1);
      clients[0].ws.send(JSON.stringify(messages[0]));
      expect(
        (await clients[0].next((m) => m.requestId === messages[0].requestId))
          .type,
      ).toBe("ack");
      expect(server.app.store.get(id)!.revision).toBe(after.revision);
    },
  );

  it("并行版本仅对本人的未变选择有效，重复、越席、跨阶段和未来版本受校验", async () => {
    const server = await start();
    const { id, clients, room } = await parallelRoom(server, 3);
    const actor = room.seats[0].id;
    const base = {
      type: "command",
      revision: room.revision,
      choiceToken: getParallelChoiceToken(room.game!, actor),
      command: projectView(room.game!, actor).actions[0].command,
    };
    async function send(c: (typeof clients)[number], data: object) {
      const message = { ...data, requestId: randomUUID() };
      c.ws.send(JSON.stringify(message));
      return c.next((m) => m.requestId === message.requestId);
    }
    expect((await send(clients[1], base)).type).toBe("error");
    expect(
      (await send(clients[0], { ...base, revision: room.revision + 1 })).type,
    ).toBe("error");
    const messages = [0, 1].map((i) => ({
      ...base,
      requestId: randomUUID(),
      command: projectView(room.game!, actor).actions[i].command,
    }));
    for (const m of messages) clients[0].ws.send(JSON.stringify(m));
    const replies = await Promise.all(
      messages.map((m) => clients[0].next((r) => r.requestId === m.requestId)),
    );
    expect(replies.map((r) => r.type)).toEqual(["ack", "error"]);
    expect(server.app.store.get(id)!.game!.players[0].hand).toHaveLength(4);
    const after = server.app.store.get(id)!;
    expect(
      (await send(clients[0], { ...base, revision: after.revision })).type,
    ).toBe("error");
    for (let i = 1; i < 3; i++) {
      const playerId = room.seats[i].id;
      // Intentionally keep the original room revision; only this seat's token matters.
      expect(
        (
          await send(clients[i], {
            ...base,
            choiceToken: getParallelChoiceToken(room.game!, playerId),
            command: projectView(room.game!, playerId).actions[0].command,
          })
        ).type,
      ).toBe("ack");
    }
    const acting = server.app.store.get(id)!;
    expect(acting.game!.phase).toBe("actions");
    expect(
      (
        await send(clients[0], {
          ...base,
          revision: acting.revision,
          command: projectView(acting.game!, actor).actions[0].command,
        })
      ).type,
    ).toBe("error");
    expect(server.app.store.get(id)!.revision).toBe(acting.revision);
  });

  it("路费选择中重启保留各人的路线、已确认状态和回执，最后确认才统一到账", async () => {
    const database = join(
      mkdtempSync(join(tmpdir(), "nomad-parallel-")),
      "rooms.sqlite",
    );
    const first = await start(database);
    const { id, clients, credentials, room } = await parallelRoom(
      first,
      3,
      "harvest",
    );
    const ids = room.seats.map((p) => p.id);
    const oldPlanToken = getParallelChoiceToken(room.game!, ids[0]);
    room.game = chooseFor(room.game!, ids[0], "A-02");
    room.game = chooseFor(room.game, ids[1], "done");
    first.app.store.save(room);
    const wallets = room.game.players.map((p) => structuredClone(p.wallet));
    const stalePlan = {
      type: "command",
      requestId: randomUUID(),
      revision: room.revision,
      choiceToken: oldPlanToken,
      command: { type: "choose", optionId: "done" },
    };
    clients[0].ws.send(JSON.stringify(stalePlan));
    expect(
      (await clients[0].next((m) => m.requestId === stalePlan.requestId)).type,
    ).toBe("error");
    expect(first.app.store.get(id)!.game).toEqual(room.game);
    const message = {
      type: "command",
      requestId: randomUUID(),
      revision: room.revision,
      choiceToken: getParallelChoiceToken(room.game, ids[0]),
      command: { type: "choose", optionId: "done" },
    };
    clients[0].ws.send(JSON.stringify(message));
    expect(
      (await clients[0].next((m) => m.requestId === message.requestId)).type,
    ).toBe("ack");
    const saved = first.app.store.get(id)!;
    expect(projectView(saved.game!, ids[0]).decision!.kind).toBe("toll");
    expect(saved.game!.players.map((p) => p.wallet)).toEqual(wallets);
    await first.app.close();
    running.splice(running.indexOf(first.app), 1);
    const second = await start(database);
    const resumed = await client(second.ws, id, credentials[0].token);
    const restored = (await resumed.next((m) => m.type === "state")).room;
    expect(restored.game.parallel.ready).toEqual([ids[1]]);
    expect(restored.game.decision.kind).toBe("toll");
    expect(restored.game.parallel).not.toHaveProperty("players");
    expect(restored.game.parallel).not.toHaveProperty("effects");
    resumed.ws.send(JSON.stringify(message));
    expect(
      (await resumed.next((m) => m.requestId === message.requestId)).type,
    ).toBe("ack");
    expect(second.app.store.get(id)!.game).toEqual(saved.game);
    async function submit(
      c: Awaited<ReturnType<typeof client>>,
      playerId: string,
      optionId: string,
    ) {
      const current = second.app.store.get(id)!;
      const m = {
        type: "command",
        requestId: randomUUID(),
        revision: current.revision,
        choiceToken: getParallelChoiceToken(current.game!, playerId),
        command: { type: "choose", optionId },
      };
      c.ws.send(JSON.stringify(m));
      expect((await c.next((r) => r.requestId === m.requestId)).type).toBe(
        "ack",
      );
    }
    while (
      projectView(second.app.store.get(id)!.game!, ids[0]).decision?.kind ===
      "toll"
    ) {
      const option = projectView(second.app.store.get(id)!.game!, ids[0])
        .actions[0].command.optionId!;
      await submit(resumed, ids[0], option);
    }
    expect(
      second.app.store.get(id)!.game!.players.map((p) => p.wallet),
    ).toEqual(wallets);
    const last = await client(second.ws, id, credentials[2].token);
    await last.next((m) => m.type === "state");
    await submit(last, ids[2], "done");
    const settled = second.app.store.get(id)!.game!;
    expect(settled.round).toBe(2);
    expect(settled.players[0].wallet.rock).toBe(wallets[0].rock + 2);
    expect(settled.players[1].wallet.cash).toBe(wallets[1].cash + 2);
  });

  it("单层可信代理后的玩家分别计算 HTTP 和 WebSocket 限额", async () => {
    const server = await start(":memory:", {
      trustProxy: true,
      securityLimits: { maxPerIp: 1 },
    });
    for (let i = 0; i < 60; i++) {
      const result = await post(
        `${server.url}/api/rooms`,
        { name: "" },
        {
          "X-Forwarded-For": "192.0.2.1",
        },
      );
      expect(result.body.error).toContain("昵称");
    }
    const blocked = await post(
      `${server.url}/api/rooms`,
      { name: "A" },
      {
        "X-Forwarded-For": "192.0.2.1",
      },
    );
    expect(blocked.body.error).toContain("过于频繁");
    const host = await post(
      `${server.url}/api/rooms`,
      { name: "B" },
      {
        "X-Forwarded-For": "192.0.2.1, 2001:db8::2",
      },
    );
    expect(host.status).toBe(201);
    const seat = await client(server.ws, host.body.room.id, host.body.token, {
      "X-Forwarded-For": "2001:db8::2",
    });
    await seat.next((m) => m.type === "state");
    const limited = new WebSocket(server.ws, {
      headers: { "X-Forwarded-For": "2001:db8::2" },
    });
    const status = await new Promise<number>((resolve, reject) => {
      limited.on("unexpected-response", (_, response) => {
        resolve(response.statusCode!);
        response.resume();
        limited.terminate();
      });
      limited.on("open", () => reject(new Error("Expected connection limit")));
      limited.on("error", () => {});
    });
    expect(status).toBe(429);
    const other = await client(server.ws, host.body.room.id, host.body.token, {
      "X-Forwarded-For": "192.0.2.1",
    });
    expect((await other.next((m) => m.type === "state")).room.me).toBe(
      host.body.room.me,
    );
  });
  it("直接访问不能通过伪造转发地址绕过限额", async () => {
    const server = await start();
    for (let i = 0; i < 60; i++) {
      const result = await post(
        `${server.url}/api/rooms`,
        { name: "" },
        {
          "X-Forwarded-For": `192.0.2.${i + 1}`,
        },
      );
      expect(result.body.error).toContain("昵称");
    }
    const result = await post(
      `${server.url}/api/rooms`,
      { name: "A" },
      {
        "X-Forwarded-For": "198.51.100.1",
      },
    );
    expect(result.body.error).toContain("过于频繁");
  });
  it("可信代理传入无效地址时仍按连接来源计算限额", async () => {
    const server = await start(":memory:", { trustProxy: true });
    for (let i = 0; i < 60; i++) {
      const result = await post(
        `${server.url}/api/rooms`,
        { name: "" },
        {
          "X-Forwarded-For": `invalid-${i}`,
        },
      );
      expect(result.body.error).toContain("昵称");
    }
    const result = await post(
      `${server.url}/api/rooms`,
      { name: "A" },
      {
        "X-Forwarded-For": "still-invalid",
      },
    );
    expect(result.body.error).toContain("过于频繁");
  });
  it("同时提交相同状态版本时只接收一条操作，另一条得到过期原因", async () => {
    const server = await start();
    const a = await post(`${server.url}/api/rooms`, { name: "A" });
    const id = a.body.room.id;
    const b = await post(`${server.url}/api/rooms/${id}/join`, { name: "B" });
    const ca = await client(server.ws, id, a.body.token);
    const cb = await client(server.ws, id, b.body.token);
    await ca.next((m) => m.type === "state");
    await cb.next((m) => m.type === "state");
    const revision = server.app.store.get(id)!.revision;
    const ids = [randomUUID(), randomUUID()];
    [ca, cb].forEach((c, i) =>
      c.ws.send(
        JSON.stringify({
          type: "ready",
          ready: true,
          requestId: ids[i],
          revision,
        }),
      ),
    );
    const replies = await Promise.all(
      [ca, cb].map((c, i) => c.next((m) => m.requestId === ids[i])),
    );
    expect(replies.map((r) => r.type).sort()).toEqual(["ack", "error"]);
    expect(replies.find((r) => r.type === "error").message).toContain(
      "最新状态",
    );
    expect(server.app.store.get(id)!.revision).toBe(revision + 1);
    expect(server.app.store.get(id)!.seats.filter((s) => s.ready)).toHaveLength(
      1,
    );
  });
  it("建房、加入、准备、开局、重复提交、过期状态与隐私", async () => {
    const server = await start();
    const host = await post(`${server.url}/api/rooms`, { name: "房主" });
    const id = host.body.room.id;
    const joined = await post(`${server.url}/api/rooms/${id}/join`, {
      name: "朋友",
    });
    const a = await client(server.ws, id, host.body.token);
    const b = await client(server.ws, id, joined.body.token);
    await a.next((m) => m.type === "state");
    await b.next((m) => m.type === "state");
    let room = server.app.store.get(id)!;
    for (const c of [a, b]) {
      const message = {
        type: "ready",
        ready: true,
        requestId: randomUUID(),
        revision: room.revision,
      };
      c.ws.send(JSON.stringify(message));
      await c.next(
        (m) => m.type === "ack" && m.requestId === message.requestId,
      );
      room = server.app.store.get(id)!;
    }
    const startMessage = {
      type: "start",
      requestId: randomUUID(),
      revision: room.revision,
    };
    a.ws.send(JSON.stringify(startMessage));
    await a.next(
      (m) => m.type === "ack" && m.requestId === startMessage.requestId,
    );
    room = server.app.store.get(id)!;
    expect(room.game).not.toBeNull();
    const privateState = await a.next(
      (m) => m.type === "state" && m.room.game !== null,
    );
    expect(
      privateState.room.game.players.some(
        (p: Record<string, unknown>) => "tokenHash" in p || "ready" in p,
      ),
    ).toBe(false);
    const startRevision = room.revision;
    a.ws.send(JSON.stringify(startMessage));
    await a.next(
      (m) => m.type === "ack" && m.requestId === startMessage.requestId,
    );
    expect(server.app.store.get(id)!.revision).toBe(startRevision);
    a.ws.send(
      JSON.stringify({
        type: "command",
        requestId: randomUUID(),
        revision: 0,
        command: { type: "choose", optionId: "invalid" },
      }),
    );
    expect((await a.next((m) => m.type === "error")).message).toContain(
      "最新状态",
    );
    const publicRoom = await (
      await fetch(`${server.url}/api/rooms/${id}`)
    ).json();
    expect(publicRoom.game).toBeNull();
    expect(JSON.stringify(publicRoom)).not.toContain("tokenHash");
    expect(
      (await post(`${server.url}/api/rooms/${id}/join`, { name: "迟到" }))
        .status,
    ).toBe(409);
  });
  it("无效席位凭证无法恢复私人状态", async () => {
    const server = await start();
    const room = await post(`${server.url}/api/rooms`, { name: "A" });
    const ws = await client(server.ws, room.body.room.id, "invalid");
    const error = await ws.next((m) => m.type === "error");
    expect(error.fatal).toBe(true);
    expect(error.message).toContain("凭证");
  });
  it("跨站 WebSocket 请求被拒绝", async () => {
    const server = await start();
    const ws = new WebSocket(server.ws, {
      origin: "https://untrusted.example",
    });
    const status = await new Promise<number>((resolve, reject) => {
      ws.on("unexpected-response", (_req, res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      ws.on("open", () => reject(new Error("Cross-site request allowed")));
      ws.on("error", () => {});
    });
    expect(status).toBe(403);
    ws.terminate();
  });
  it("数据库重启保留席位、完整决策和指令回执", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nomad-test-"));
    const database = join(directory, "state.sqlite");
    const first = await start(database);
    const created = await post(`${first.url}/api/rooms`, { name: "A" });
    const id = created.body.room.id;
    const c = await client(first.ws, id, created.body.token);
    await c.next((m) => m.type === "state");
    const message = {
      type: "ready",
      ready: true,
      requestId: randomUUID(),
      revision: 0,
    };
    c.ws.send(JSON.stringify(message));
    await c.next((m) => m.type === "ack");
    const joined = await post(`${first.url}/api/rooms/${id}/join`, {
      name: "B",
    });
    const persisted = first.app.store.get(id)!;
    persisted.game = createGame(persisted.seats, { seed: 17 });
    first.app.store.save(persisted);
    const pending = structuredClone(persisted.game);
    await first.app.close();
    running.splice(running.indexOf(first.app), 1);
    const second = await start(database);
    const restored = await client(second.ws, id, created.body.token);
    const state = await restored.next((m) => m.type === "state");
    expect(state.room.seats[0].ready).toBe(true);
    restored.ws.send(JSON.stringify(message));
    const ack = await restored.next((m) => m.type === "ack");
    expect(ack.revision).toBe(1);
    expect(second.app.store.get(id)!.revision).toBe(persisted.revision);
    expect(second.app.store.get(id)!.game).toEqual(pending);
    const actor = pending.decision!.playerId;
    expect(actor).toBe(persisted.hostId);
    const command = {
      type: "choose" as const,
      optionId: pending.decision!.options[0].id,
    };
    const expected = applyCommand(pending, actor, command);
    const resumedId = randomUUID();
    restored.ws.send(
      JSON.stringify({
        type: "command",
        requestId: resumedId,
        revision: persisted.revision,
        command,
      }),
    );
    await restored.next((m) => m.type === "ack" && m.requestId === resumedId);
    expect(second.app.store.get(id)!.game).toEqual(expected);
    const backup = await second.app.store.backup(join(directory, "backups"));
    expect(backup.endsWith(".sqlite")).toBe(true);
    const backedUp = new RoomStore(backup);
    try {
      expect(backedUp.get(id)!.game).toEqual(expected);
    } finally {
      backedUp.close();
    }
    expect(joined.status).toBe(201);
  });
});
