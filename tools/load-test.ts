import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import { createGameServer } from "../apps/server/src/server.ts";
import {
  createGame,
  applyCommand,
  projectView,
} from "../packages/rules/src/engine.ts";
import { chooseBotCommand } from "../packages/rules/src/bot.ts";
import type { GameState } from "../packages/rules/src/types.ts";

const args = process.argv.slice(2);
const mode = args.shift() ?? "run";
if (mode === "--help" || args.includes("--help")) {
  console.log(`隔离承压测试（只创建合成对局）
pnpm load:test --tables 1,4,8,16,32 --seconds 30 --interval-ms 2000
  --phase actions|select        后期行动／并行盖牌
  --schedule staggered|burst    各桌错峰／同时提交
  --compression native|on|off   原配置／开启／关闭压缩
  --output .data/load-tests/report.json  汇总路径，- 为标准输出
  --stop-p95-ms 2000            超过此延迟后停止升档
server/client 模式仅供独立隔离环境使用，游戏端和控制端必须同属测试实例。`);
  process.exit(0);
}
function option(name: string, fallback: string) {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
}
function integer(name: string, fallback: number, min: number, max: number) {
  const n = Number(option(name, String(fallback)));
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error(`Invalid --${name}`);
  return n;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
).version;
const compression = option("compression", "native");
if (!["native", "on", "off"].includes(compression))
  throw new Error("Invalid compression mode");
const compressionOptions = {
  serverNoContextTakeover: true,
  clientNoContextTakeover: true,
  concurrencyLimit: 2,
  threshold: 1024,
  zlibDeflateOptions: { level: 3, memLevel: 7 },
};
const percentile = (values: number[], p: number) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length
    ? Math.round(ordered[Math.ceil(p * ordered.length) - 1] * 10) / 10
    : null;
};
function throttledMicros() {
  try {
    return Number(
      /throttled_usec (\d+)/.exec(
        readFileSync("/sys/fs/cgroup/cpu.stat", "utf8"),
      )?.[1] ?? 0,
    );
  } catch {
    return 0;
  }
}

/** Only synthetic state is generated. No production database path is accepted. */
function template(phase: "actions" | "select") {
  let game = createGame(
    Array.from({ length: 4 }, (_, i) => ({
      id: `load-seat-${i}`,
      name: `压测玩家${i + 1}`,
    })),
    { expansion: true, seed: 52 },
  );
  for (let n = 0; n < 5000; n++) {
    if (
      game.round >= 6 &&
      (phase === "actions"
        ? game.phase === "actions"
        : game.parallel?.kind === "select-role")
    )
      return game;
    const actor = game.players.find(
      (p) => projectView(game, p.id).actions.length,
    )!;
    const command = actor && chooseBotCommand(projectView(game, actor.id));
    if (!command) throw new Error("Cannot prepare late-game fixture");
    game = applyCommand(game, actor.id, command);
  }
  throw new Error("Fixture exceeded command limit");
}

async function serve() {
  const directory = mkdtempSync(resolve(tmpdir(), "nomad-load-"));
  const app = createGameServer({
    database: resolve(directory, "synthetic.sqlite"),
    trustProxy: true,
  });
  const instanceId = randomUUID();
  app.http.prependListener("request", (_req, res) => {
    res.setHeader("X-Nomad-Load-Test", instanceId);
  });
  const nativeCompression = app.wsServer.options.perMessageDeflate;
  const fixtures = {
    actions: JSON.stringify(template("actions")),
    select: JSON.stringify(template("select")),
  };
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let cpu = process.cpuUsage(),
    started = performance.now(),
    throttled = throttledMicros();
  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 200);
  const metrics = () => {
    const elapsedMs = performance.now() - started;
    const used = process.cpuUsage(cpu);
    return {
      elapsedMs: Math.round(elapsedMs),
      cpuPercentOneCore: Math.round((used.user + used.system) / elapsedMs / 10),
      peakRssMiB: Math.round(peakRss / 1024 / 1024),
      eventLoopP95Ms: Math.round(histogram.percentile(95) / 1e5) / 10,
      eventLoopMaxMs: Math.round(histogram.max / 1e5) / 10,
      throttledMs: Math.round((throttledMicros() - throttled) / 1000),
      receipts: Number(
        app.store.db.prepare("SELECT COUNT(*) AS n FROM commands").get()!.n,
      ),
      integrity: app.store.db.prepare("PRAGMA quick_check").get()!.quick_check,
    };
  };
  const control = createServer((req, res) => {
    try {
      const url = new URL(req.url!, "http://127.0.0.1");
      let value: unknown;
      if (url.pathname === "/identity")
        value = { kind: "nomad-isolated-load-test", version, instanceId };
      else if (req.method === "POST" && url.pathname === "/reset") {
        if (app.wsServer.clients.size)
          throw new Error("Close test clients before resetting fixtures");
        const count = Number(url.searchParams.get("tables"));
        if (!Number.isInteger(count) || count < 1 || count > 32)
          throw new Error("Tables must be 1–32");
        const selected = url.searchParams.get("compression") ?? "native";
        if (!["native", "on", "off"].includes(selected))
          throw new Error("Invalid compression");
        app.wsServer.options.perMessageDeflate =
          selected === "native"
            ? nativeCompression
            : selected === "on"
              ? compressionOptions
              : false;
        // The store was created in a fresh OS temporary directory by this process.
        app.store.db.exec("DELETE FROM commands; DELETE FROM rooms");
        const phase = url.searchParams.get("phase") ?? "actions";
        if (phase !== "actions" && phase !== "select")
          throw new Error("Invalid fixture phase");
        value = Array.from({ length: count }, (_, index) => {
          const id = `T${index.toString(36).padStart(5, "0")}`.toUpperCase();
          const credentials = Array.from({ length: 4 }, (_, seat) => ({
            id: randomUUID(),
            name: `压测玩家${seat + 1}`,
            token: randomUUID(),
          }));
          let body = fixtures[phase];
          credentials.forEach((p, seat) => {
            body = body.replaceAll(`load-seat-${seat}`, p.id);
          });
          const now = new Date().toISOString();
          app.store.save({
            id,
            hostId: credentials[0].id,
            revision: 1,
            expansion: true,
            createdAt: now,
            updatedAt: now,
            game: JSON.parse(body) as GameState,
            seats: credentials.map(({ token, ...p }) => ({
              ...p,
              ready: true,
              tokenHash: createHash("sha256").update(token).digest("hex"),
            })),
          });
          return { id, credentials };
        });
      } else if (req.method === "POST" && url.pathname === "/measure") {
        cpu = process.cpuUsage();
        started = performance.now();
        throttled = throttledMicros();
        peakRss = process.memoryUsage().rss;
        histogram.reset();
        value = { ok: true };
      } else if (url.pathname === "/metrics") value = metrics();
      else {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((r) =>
    app.http.listen(integer("port", 3112, 0, 65535), "0.0.0.0", r),
  );
  await new Promise<void>((r) =>
    control.listen(
      integer("control-port", 3113, 0, 65535),
      option("control-host", "127.0.0.1"),
      r,
    ),
  );
  console.log(
    JSON.stringify({
      event: "load-test-ready",
      version,
      port: (app.http.address() as { port: number }).port,
      controlPort: (control.address() as { port: number }).port,
      round: 6,
      logs: (JSON.parse(fixtures.actions) as GameState).log.length,
    }),
  );
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(sampler);
    histogram.disable();
    await new Promise<void>((r) => control.close(() => r()));
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  setTimeout(() => void stop(), 15 * 60 * 1000).unref();
}

type Seat = { id: string; token: string; name: string };
type FixtureRoom = { id: string; credentials: Seat[] };
class Table extends EventEmitter {
  closed = false;
  clients: { ws: WebSocket; state: any }[] = [];
  pending = new Map<
    string,
    { resolve: (m: any) => void; reject: (e: Error) => void }
  >();
  failures: string[] = [];
  async until(test: () => boolean, timeout = 10000) {
    if (this.closed) throw new Error("table closed");
    if (test()) return;
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.off("state", check);
      };
      const check = () => {
        if (this.closed) {
          done();
          reject(new Error("table closed"));
        } else if (test()) {
          done();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error("state timeout"));
      }, timeout);
      this.on("state", check);
      check();
    });
  }
  async connect(url: string, fixture: FixtureRoom, index: number) {
    await Promise.all(
      fixture.credentials.map(async (p, i) => {
        const ws = new WebSocket(url.replace(/^http/, "ws") + "/ws", {
          headers: { "x-forwarded-for": `198.18.${index}.${i + 1}` },
        });
        const client = { ws, state: null as any };
        this.clients[i] = client;
        ws.on("message", (raw) => {
          const m = JSON.parse(raw.toString());
          if (m.type === "state") {
            client.state = m.room;
            this.emit("state");
          } else if (m.requestId && this.pending.has(m.requestId)) {
            const pending = this.pending.get(m.requestId)!;
            this.pending.delete(m.requestId);
            if (m.type === "ack") pending.resolve(m);
            else pending.reject(new Error(m.message));
          }
        });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.terminate();
            reject(new Error("connect timeout"));
          }, 15000);
          ws.once("open", () => {
            clearTimeout(timer);
            resolve();
          });
          ws.once("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
        });
        ws.on("error", () => {});
        ws.send(
          JSON.stringify({ type: "hello", roomId: fixture.id, token: p.token }),
        );
      }),
    );
    await this.until(
      () =>
        this.clients.every((c) =>
          c.state?.seats.every((s: any) => s.connected),
        ),
      45000,
    );
  }
  wireBytes() {
    return this.clients.reduce(
      (sum, c) =>
        sum +
        (c.ws as unknown as { _socket?: { bytesRead: number } })._socket!
          .bytesRead,
      0,
    );
  }
  async tick(acks: number[], states: number[]) {
    const actors = this.clients.filter((c) => c.state?.game?.actions.length);
    if (!actors.length) {
      this.failures.push("no legal actor");
      return;
    }
    await Promise.all(
      actors.map(async (client) => {
        const command = chooseBotCommand(client.state.game);
        if (!command) throw new Error("no legal command");
        const requestId = randomUUID(),
          started = performance.now();
        const ack = new Promise<any>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(requestId);
            reject(new Error("ack timeout"));
          }, 8000);
          this.pending.set(requestId, {
            resolve: (m) => {
              clearTimeout(timer);
              resolve(m);
            },
            reject: (e) => {
              clearTimeout(timer);
              reject(e);
            },
          });
        });
        client.ws.send(
          JSON.stringify({
            type: "command",
            requestId,
            revision: client.state.revision,
            ...(client.state.game.parallel?.choiceToken
              ? { choiceToken: client.state.game.parallel.choiceToken }
              : {}),
            command,
          }),
        );
        try {
          const receipt = await ack;
          acks.push(performance.now() - started);
          await this.until(() =>
            this.clients.every((c) => c.state.revision >= receipt.revision),
          );
          states.push(performance.now() - started);
        } catch (e) {
          this.failures.push(String(e));
        }
      }),
    );
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values())
      pending.reject(new Error("table closed"));
    this.pending.clear();
    this.emit("state");
    await Promise.all(
      this.clients.map(
        (c) =>
          new Promise<void>((r) => {
            if (c.ws.readyState === WebSocket.CLOSED) return r();
            c.ws.once("close", () => r());
            c.ws.terminate();
          }),
      ),
    );
  }
}

async function extraConnectionStatus(target: string) {
  return await new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(target.replace(/^http/, "ws") + "/ws", {
      headers: { "x-forwarded-for": "198.19.255.1" },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Connection cap probe timed out"));
    }, 5000);
    ws.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      response.resume();
      resolve(response.statusCode ?? 0);
      ws.terminate();
    });
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(101);
      ws.terminate();
    });
    ws.on("error", () => {});
  });
}

function localEndpoint(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("Load tests only connect to an isolated loopback instance");
  return url.origin;
}
async function drive(target: string, control: string) {
  target = localEndpoint(target);
  control = localEndpoint(control);
  const identity = await fetch(control + "/identity").then((r) => r.json());
  if (identity.kind !== "nomad-isolated-load-test")
    throw new Error("Target is not an isolated load-test instance");
  const targetIdentity = await fetch(target + "/api/health");
  await targetIdentity.arrayBuffer();
  if (targetIdentity.headers.get("X-Nomad-Load-Test") !== identity.instanceId)
    throw new Error(
      "Target and control must belong to the same isolated load-test instance",
    );
  const tables = option("tables", "1,4,8,16,32").split(",").map(Number);
  if (
    !tables.length ||
    tables.some((n) => !Number.isInteger(n) || n < 1 || n > 32)
  )
    throw new Error("Invalid tables");
  const seconds = integer("seconds", 30, 5, 180),
    intervalMs = integer("interval-ms", 2000, 250, 15000);
  const results = [];
  const setupFailures: { tables: number; message: string }[] = [];
  const schedule = option("schedule", "staggered");
  const phase = option("phase", "actions");
  if (!["actions", "select"].includes(phase)) throw new Error("Invalid phase");
  if (!["staggered", "burst"].includes(schedule))
    throw new Error("Invalid schedule");
  const guardUrl = option("guard-url", "");
  let guardFailures = 0,
    guardAborted = false;
  const guardSamples: number[] = [];
  const guard = async () => {
    if (!guardUrl) return;
    const at = performance.now();
    try {
      const response = await fetch(guardUrl, {
        signal: AbortSignal.timeout(2000),
      });
      await response.arrayBuffer();
      const ms = performance.now() - at;
      guardSamples.push(ms);
      guardFailures = !response.ok || ms > 1200 ? guardFailures + 1 : 0;
    } catch {
      guardFailures++;
    }
    if (guardFailures >= 2) guardAborted = true;
  };
  await guard();
  for (const count of tables) {
    if (guardAborted) break;
    const response = await fetch(
      control +
        `/reset?tables=${count}&compression=${compression}&phase=${phase}`,
      { method: "POST" },
    );
    if (!response.ok) throw new Error(await response.text());
    const fixtures: FixtureRoom[] = await response.json();
    const rooms: Table[] = [];
    const acks: number[] = [],
      states: number[] = [];
    let skipped = 0;
    const guardTimer = setInterval(
      () =>
        void guard().then(() => {
          if (guardAborted) void Promise.all(rooms.map((r) => r.close()));
        }),
      2500,
    );
    try {
      for (const fixture of fixtures) {
        if (guardAborted) break;
        const room = new Table();
        rooms.push(room);
        await room.connect(target, fixture, rooms.length);
      }
      if (guardAborted) break;
      const admissionStatus =
        count === 32 ? await extraConnectionStatus(target) : undefined;
      if (admissionStatus !== undefined && admissionStatus !== 503)
        throw new Error(
          `Expected 129th connection to be rejected, received ${admissionStatus}`,
        );
      await fetch(control + "/measure", { method: "POST" });
      const cpu = process.cpuUsage(),
        beforeBytes = rooms.reduce((n, r) => n + r.wireBytes(), 0),
        start = performance.now();
      const jobs = rooms.map(async (room, i) => {
        let next =
          start + (schedule === "burst" ? 0 : (i * intervalMs) / count);
        while (next < start + seconds * 1000 && !guardAborted) {
          await sleep(Math.max(0, next - performance.now()));
          if (guardAborted) break;
          await room.tick(acks, states);
          if (room.failures.length) break;
          next += intervalMs;
          while (next < start + seconds * 1000 && next < performance.now()) {
            next += intervalMs;
            skipped++;
          }
        }
      });
      await Promise.all(jobs);
      const durationMs = performance.now() - start;
      const bytes = rooms.reduce((n, r) => n + r.wireBytes(), 0) - beforeBytes;
      const clientCpu = process.cpuUsage(cpu);
      const metrics = await fetch(control + "/metrics").then((r) => r.json());
      const result = {
        tables: count,
        connections: count * 4,
        compression: rooms[0].clients[0].ws.extensions || "none",
        durationMs: Math.round(durationMs),
        commands: acks.length,
        completedSyncs: states.length,
        ackP50Ms: percentile(acks, 0.5),
        ackP95Ms: percentile(acks, 0.95),
        ackMaxMs: percentile(acks, 1),
        allPlayersP50Ms: percentile(states, 0.5),
        allPlayersP95Ms: percentile(states, 0.95),
        allPlayersMaxMs: percentile(states, 1),
        failures: rooms.flatMap((r) => r.failures),
        skippedTicks: skipped,
        receivedMiB: Math.round((bytes / 1024 / 1024) * 100) / 100,
        receivedMbps: Math.round(((bytes * 8) / durationMs / 1000) * 100) / 100,
        driverCpuPercentOneCore: Math.round(
          (clientCpu.user + clientCpu.system) / durationMs / 10,
        ),
        server: metrics,
        guardAborted,
        extraConnectionStatus: admissionStatus,
      };
      results.push(result);
      console.log(JSON.stringify({ event: "load-tier", ...result }));
      if (
        result.failures.length ||
        (result.allPlayersP95Ms ?? 0) > integer("stop-p95-ms", 2000, 100, 60000)
      )
        break;
    } catch (error) {
      const failure = { tables: count, message: String(error) };
      setupFailures.push(failure);
      console.log(
        JSON.stringify({
          event: "load-setup-stopped",
          ...failure,
          guardAborted,
        }),
      );
      if (!guardAborted) process.exitCode = 1;
      break;
    } finally {
      clearInterval(guardTimer);
      await Promise.all(rooms.map((r) => r.close()));
      await sleep(300);
    }
  }
  const report = {
    timestamp: new Date().toISOString(),
    sourceVersion: identity.version,
    seconds,
    intervalMs,
    fixture: `four-player expansion / round 6 / seed 52 / ${phase}`,
    compression,
    schedule,
    setupFailures,
    guardAborted,
    guardP95Ms: percentile(guardSamples, 0.95),
    results,
  };
  const requestedOutput = option(
    "output",
    `.data/load-tests/${Date.now()}.json`,
  );
  if (requestedOutput === "-") {
    console.log(JSON.stringify({ event: "load-report", report }));
    return report;
  }
  const output = resolve(requestedOutput);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      event: "load-report",
      output,
      tiers: results.length,
      guardAborted,
    }),
  );
  return report;
}

if (mode === "server") await serve();
else if (mode === "client")
  await drive(
    option("target", "http://127.0.0.1:3112"),
    option("control", "http://127.0.0.1:3113"),
  );
else if (mode === "run") {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "server",
      "--port",
      "0",
      "--control-port",
      "0",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
  );
  try {
    const ready = await new Promise<{ port: number; controlPort: number }>(
      (resolve, reject) => {
        let buffer = "";
        const timer = setTimeout(
          () => reject(new Error("Load server startup timeout")),
          60000,
        );
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("Load server exited"));
        });
        child.stdout.on("data", (raw) => {
          buffer += raw.toString();
          for (let index; (index = buffer.indexOf("\n")) >= 0;) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            try {
              const item = JSON.parse(line);
              if (item.event === "load-test-ready") {
                clearTimeout(timer);
                resolve(item);
              }
            } catch {}
          }
        });
      },
    );
    await drive(
      `http://127.0.0.1:${ready.port}`,
      `http://127.0.0.1:${ready.controlPort}`,
    );
  } finally {
    child.kill();
  }
} else throw new Error("Mode must be run, server or client");
