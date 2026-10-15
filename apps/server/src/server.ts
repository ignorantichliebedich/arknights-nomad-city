import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mediaRange } from "./media-range.ts";
import { resolve, sep, extname } from "node:path";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  applyCommand,
  getParallelChoiceToken,
  createGame,
  projectView,
  RuleError,
} from "../../../packages/rules/src/engine.ts";
import { RULES_VERSION } from "../../../packages/rules/src/data.ts";
import { chooseBotCommand } from "../../../packages/rules/src/bot.ts";
import type { Command } from "../../../packages/rules/src/types.ts";
import { RoomStore } from "./store.ts";
import type { Room, Seat } from "./store.ts";
import {
  SecurityGate,
  SecurityRejection,
  SECURITY_HEADERS,
  type SecurityLimits,
} from "./security.ts";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function validToken(token: string, stored: string) {
  const candidate = hash(token);
  return timingSafeEqual(
    Buffer.from(candidate, "hex"),
    Buffer.from(stored, "hex"),
  );
}
function nickname(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 20 ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new RuleError("昵称需要 1–20 个可见字符");
  return value.trim();
}
function credential(name: string): { seat: Seat; token: string } {
  const token = randomBytes(32).toString("base64url");
  return {
    seat: { id: randomUUID(), name, ready: false, tokenHash: hash(token) },
    token,
  };
}
type Client = { roomId: string; playerId: string; alive: boolean };
export type ServerOptions = {
  database?: string;
  webRoot?: string;
  allowedOrigins?: string[];
  backupDirectory?: string;
  backupIntervalMs?: number;
  /** Enable only when this server is reachable exclusively through a trusted proxy. */
  trustProxy?: boolean;
  /** Decision pacing; tests use a short interval with the same rule policy. */
  botDelayMs?: number;
  securityLimits?: Partial<SecurityLimits>;
  backupRetention?: number;
};

export function createGameServer(options: ServerOptions = {}) {
  const gate = new SecurityGate(options.securityLimits);
  if (
    options.backupRetention !== undefined &&
    (!Number.isSafeInteger(options.backupRetention) ||
      options.backupRetention < 1)
  )
    throw new Error("Invalid backup retention");
  const store = new RoomStore(
    options.database ?? resolve(".data/state/nomad-city.sqlite"),
  );
  const root = resolve(options.webRoot ?? "apps/web/dist");
  const clients = new Map<WebSocket, Client>();
  const queues = new Map<string, Promise<void>>();
  const queued = new Map<string, number>();
  const botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let closing = false;
  function clientAddress(req: IncomingMessage) {
    const forwarded = req.headers["x-forwarded-for"];
    // A single trusted proxy replaces or appends the directly connected client IP.
    // The rightmost address cannot be chosen by the original browser.
    const address =
      options.trustProxy && typeof forwarded === "string"
        ? forwarded.split(",").at(-1)?.trim()
        : undefined;
    const ip =
      address && isIP(address)
        ? address
        : (req.socket.remoteAddress ?? "unknown");
    return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4
      ? ip.slice(7)
      : ip;
  }
  function serial(room: string, work: () => void | Promise<void>) {
    if ((queued.get(room) ?? 0) >= gate.limits.maxQueuedPerRoom) return false;
    queued.set(room, (queued.get(room) ?? 0) + 1);
    const last = queues.get(room) ?? Promise.resolve();
    const next = last.then(work).catch((err) =>
      console.error(
        JSON.stringify({
          event: "room-command-failed",
          room,
          message: err instanceof Error ? err.message : String(err),
        }),
      ),
    );
    queues.set(room, next);
    void next.finally(() => {
      const remaining = (queued.get(room) ?? 1) - 1;
      if (remaining) queued.set(room, remaining);
      else queued.delete(room);
      if (queues.get(room) === next) queues.delete(room);
    });
    return true;
  }
  function originAllowed(origin: string | undefined, host: string | undefined) {
    if (!origin) return true;
    try {
      if (options.allowedOrigins?.length)
        return options.allowedOrigins.includes(origin);
      return (
        options.allowedOrigins?.includes(origin) ||
        new URL(origin).hostname === new URL(`http://${host}`).hostname
      );
    } catch {
      return false;
    }
  }
  function json(
    res: import("node:http").ServerResponse,
    status: number,
    value: unknown,
  ) {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (status === 429) res.setHeader("Retry-After", "60");
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  }
  function online(roomId: string, playerId: string) {
    return [...clients].some(
      ([ws, c]) =>
        ws.readyState === WebSocket.OPEN &&
        c.roomId === roomId &&
        c.playerId === playerId,
    );
  }
  function view(room: Room, playerId?: string) {
    return {
      id: room.id,
      hostId: room.hostId,
      expansion: room.expansion,
      revision: room.revision,
      phase: room.game?.phase ?? "lobby",
      rulesVersion: RULES_VERSION,
      seats: room.seats.map(({ tokenHash, ...seat }) => ({
        ...seat,
        connected: seat.bot === true || online(room.id, seat.id),
      })),
      game: room.game && playerId ? projectView(room.game, playerId) : null,
      me: playerId ?? null,
    };
  }
  function send(ws: WebSocket, value: unknown) {
    if (ws.bufferedAmount > gate.limits.maxBufferedBytes) {
      ws.terminate();
      return;
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
  }
  function broadcast(roomId: string) {
    const room = store.get(roomId);
    if (room)
      for (const [ws, c] of clients)
        if (c.roomId === roomId)
          send(ws, { type: "state", room: view(room, c.playerId) });
    scheduleBot(roomId);
  }
  function scheduleBot(roomId: string) {
    if (closing || botTimers.has(roomId)) return;
    const room = store.get(roomId);
    if (
      !room?.game ||
      room.game.phase === "finished" ||
      !room.seats.some((s) => !s.bot && online(roomId, s.id))
    )
      return;
    const actor = room.seats.find(
      (seat) => seat.bot && projectView(room.game!, seat.id).actions.length,
    );
    if (!actor) return;
    const timer = setTimeout(() => {
      botTimers.delete(roomId);
      const accepted = serial(roomId, () => {
        const current = store.get(roomId);
        if (
          closing ||
          !current?.game ||
          !current.seats.some((s) => !s.bot && online(roomId, s.id))
        )
          return;
        const bot = current.seats.find(
          (seat) =>
            seat.bot && projectView(current.game!, seat.id).actions.length,
        );
        if (!bot) return;
        const command = chooseBotCommand(projectView(current.game, bot.id));
        if (!command) return;
        const commandId = `bot-${current.game.revision}-${bot.id}`;
        current.game = applyCommand(current.game, bot.id, command);
        current.revision++;
        current.updatedAt = new Date().toISOString();
        store.save(current, {
          playerId: bot.id,
          id: commandId,
          response: {
            type: "ack",
            requestId: commandId,
            revision: current.revision,
          },
        });
        broadcast(roomId);
      });
      if (!accepted) scheduleBot(roomId);
    }, options.botDelayMs ?? 650);
    timer.unref();
    botTimers.set(roomId, timer);
  }
  function rate(key: string, limit: number) {
    gate.rate(key, limit);
  }
  function audit(req: IncomingMessage, reason: string, status: number) {
    try {
      gate.rate("audit:" + clientAddress(req), 4);
    } catch {
      return;
    }
    console.warn(
      JSON.stringify({
        event: "security-rejection",
        ip: clientAddress(req),
        path: req.url?.split("?")[0].slice(0, 200),
        reason,
        status,
      }),
    );
  }
  const http = createServer(
    {
      maxHeaderSize: 8192,
      headersTimeout: 10000,
      requestTimeout: 15000,
      keepAliveTimeout: 5000,
      connectionsCheckingInterval: 1000,
    },
    async (req, res) => {
      for (const [key, value] of Object.entries(SECURITY_HEADERS))
        res.setHeader(key, value);
      try {
        if ((req.url?.length ?? 0) > 2048) {
          json(res, 414, { error: "请求地址过长" });
          return;
        }
        if (!originAllowed(req.headers.origin, req.headers.host)) {
          json(res, 403, { error: "请求来源不受信任" });
          return;
        }
        const url = new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`,
        );
        if (url.pathname.startsWith("/api/"))
          rate("api:" + clientAddress(req), gate.limits.apiPerMinute);
        if (url.pathname === "/api/health") {
          json(res, 200, {
            status: "ok",
            rulesVersion: RULES_VERSION,
            rooms: store.count(),
            uptime: Math.floor(process.uptime()),
          });
          return;
        }
        if (
          req.method === "POST" &&
          /^\/api\/rooms(?:\/[A-Z0-9]{6}\/join)?$/.test(url.pathname)
        ) {
          rate(`http:${clientAddress(req)}`, 60);
          if (
            !/^application\/json(?:\s*;|$)/i.test(
              req.headers["content-type"] ?? "",
            )
          ) {
            json(res, 415, { error: "请使用 JSON 提交请求" });
            return;
          }
          if (req.headers["sec-fetch-site"] === "cross-site") {
            json(res, 403, { error: "请求来源不受信任" });
            return;
          }
          if (Number(req.headers["content-length"] ?? 0) > 16384) {
            json(res, 413, { error: "请求太大" });
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const part of req) {
            size += part.length;
            if (size > 16384) {
              json(res, 413, { error: "请求太大" });
              return;
            }
            chunks.push(Buffer.from(part));
          }
          let input: Record<string, unknown>;
          try {
            input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!input || Array.isArray(input) || typeof input !== "object")
              throw new Error("Invalid body");
          } catch {
            json(res, 400, { error: "请求需要有效 JSON" });
            return;
          }
          const name = nickname(input.name);
          const { seat, token } = credential(name);
          if (url.pathname === "/api/rooms") {
            rate("create:" + clientAddress(req), gate.limits.roomsPerMinute);
            if (store.count() >= gate.limits.maxRooms)
              throw new SecurityRejection(
                503,
                "房间容量已达上限，请联系管理员",
              );
            let id: string;
            do {
              id = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
            } while (store.get(id));
            const date = new Date().toISOString();
            const room: Room = {
              id,
              hostId: seat.id,
              expansion: input.expansion === true,
              revision: 0,
              seats: [seat],
              game: null,
              createdAt: date,
              updatedAt: date,
            };
            store.save(room);
            json(res, 201, { room: view(room, seat.id), token });
            return;
          }
          const id = url.pathname.split("/")[3];
          const accepted = serial(id, () => {
            try {
              const room = store.get(id);
              if (!room) {
                json(res, 404, { error: "房间不存在" });
                return;
              }
              if (room.game) {
                json(res, 409, { error: "对局已开始，席位已锁定" });
                return;
              }
              if (room.seats.length >= 4) {
                json(res, 409, { error: "房间已经满员" });
                return;
              }
              if (room.seats.some((s) => s.name === name)) {
                json(res, 409, { error: "房间内已有同名玩家" });
                return;
              }
              room.seats.push(seat);
              room.revision++;
              room.updatedAt = new Date().toISOString();
              store.save(room);
              json(res, 201, { room: view(room, seat.id), token });
              broadcast(id);
            } catch (error) {
              json(res, 400, {
                error: error instanceof Error ? error.message : "加入房间失败",
              });
            }
          });
          if (!accepted) json(res, 429, { error: "房间操作较多，请稍后重试" });
          return;
        }
        if (
          req.method === "GET" &&
          /^\/api\/rooms\/[A-Z0-9]{6}$/.test(url.pathname)
        ) {
          const room = store.get(url.pathname.split("/")[3]);
          if (!room) {
            json(res, 404, { error: "房间不存在" });
            return;
          }
          json(res, 200, view(room));
          return;
        }
        if (url.pathname.startsWith("/api/")) {
          json(res, 404, { error: "接口不存在" });
          return;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
          json(res, 405, { error: "请求方法不支持" });
          return;
        }
        let path: string;
        try {
          if (
            decodeURIComponent(url.pathname)
              .split("/")
              .some((segment) => segment.startsWith("."))
          ) {
            json(res, 404, { error: "文件不存在" });
            return;
          }
          path = resolve(root, "." + decodeURIComponent(url.pathname));
        } catch {
          json(res, 400, { error: "文件地址无效" });
          return;
        }
        if (path !== root && !path.startsWith(root + sep)) {
          json(res, 403, { error: "文件地址无效" });
          return;
        }
        if (!existsSync(path) || !statSync(path).isFile()) {
          if (
            url.pathname !== "/" &&
            !/^\/room\/[A-Z0-9]{6}$/i.test(url.pathname)
          ) {
            json(res, 404, { error: "文件不存在" });
            return;
          }
          path = resolve(root, "index.html");
        }
        if (!existsSync(path)) {
          json(res, 503, { error: "请先运行 pnpm build，或使用 pnpm dev" });
          return;
        }
        const mime: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".png": "image/png",
          ".webp": "image/webp",
          ".svg": "image/svg+xml",
          ".json": "application/json; charset=utf-8",
          ".ico": "image/x-icon",
          ".woff2": "font/woff2",
          ".mp3": "audio/mpeg",
          ".ogg": "audio/ogg",
          ".wav": "audio/wav",
          ".m4a": "audio/mp4",
        };
        const size = statSync(path).size;
        const type = mime[extname(path)] ?? "application/octet-stream";
        const audio = type.startsWith("audio/");
        const range =
          audio && req.method === "GET" && !req.headers["if-range"]
            ? mediaRange(req.headers.range, size)
            : null;
        if (range === "unsatisfiable") {
          res.writeHead(416, {
            ...SECURITY_HEADERS,
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${size}`,
            "Content-Length": 0,
          });
          res.end();
          return;
        }
        res.writeHead(range ? 206 : 200, {
          ...SECURITY_HEADERS,
          ...(audio ? { "Accept-Ranges": "bytes" } : {}),
          ...(range
            ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` }
            : {}),
          "Content-Length": range ? range.end - range.start + 1 : size,
          "Content-Type": type,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control":
            extname(path) === ".html" ? "no-cache" : "public, max-age=3600",
        });
        if (req.method === "HEAD") res.end();
        else {
          const stream = createReadStream(path, range ?? undefined);
          res.once("close", () => stream.destroy());
          stream.on("error", () => res.destroy()).pipe(res);
        }
      } catch (error) {
        json(
          res,
          error instanceof SecurityRejection
            ? error.status
            : error instanceof RuleError
              ? 400
              : 500,
          {
            error:
              error instanceof RuleError || error instanceof SecurityRejection
                ? error.message
                : "服务处理失败",
          },
        );
        if (error instanceof SecurityRejection)
          audit(req, error.message, error.status);
        else if (!(error instanceof RuleError)) console.error(error);
      }
    },
  );
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  http.maxHeadersCount = 64;
  http.maxConnections = 256;
  http.on("upgrade", (req, socket, head) => {
    try {
      if (
        new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
          .pathname !== "/ws" ||
        !originAllowed(req.headers.origin, req.headers.host)
      ) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      rate("connect:" + clientAddress(req), gate.limits.connectionsPerMinute);
      const release = gate.reserve(clientAddress(req));
      socket.once("close", release);
      wsServer.handleUpgrade(req, socket, head, (ws) =>
        wsServer.emit("connection", ws, req),
      );
    } catch (error) {
      if (error instanceof SecurityRejection) {
        audit(req, error.message, error.status);
        socket.write(
          "HTTP/1.1 " +
            error.status +
            " Too Many Requests\r\nConnection: close\r\nRetry-After: 60\r\n\r\n",
        );
      }
      socket.destroy();
    }
  });
  wsServer.on("connection", (ws, req) => {
    let malformed = 0;
    function rejectSocket(code: number, reason: string) {
      ws.close(code, reason);
      const timer = setTimeout(() => ws.terminate(), 2000);
      timer.unref();
      ws.once("close", () => clearTimeout(timer));
    }
    const authTimer = setTimeout(() => {
      if (!clients.has(ws)) rejectSocket(1008, "Authentication required");
    }, 10000);
    authTimer.unref();
    ws.on("pong", () => {
      const c = clients.get(ws);
      if (c) c.alive = true;
    });
    ws.on("message", (raw, binary) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (binary) {
        rejectSocket(1003, "Text JSON messages required");
        return;
      }
      try {
        rate("messages:" + clientAddress(req), gate.limits.messagesPerMinute);
      } catch {
        audit(req, "websocket-message-rate", 429);
        rejectSocket(1008, "Too many messages");
        return;
      }
      let message: Record<string, any>;
      try {
        message = JSON.parse(raw.toString());
        if (
          !message ||
          Array.isArray(message) ||
          typeof message.type !== "string"
        )
          throw new Error();
      } catch {
        audit(req, "malformed-websocket-message", 400);
        send(ws, { type: "error", message: "消息格式无效" });
        if (++malformed >= 3) rejectSocket(1008, "Malformed messages");
        return;
      }
      if (message.type === "hello") {
        try {
          if (clients.has(ws)) throw new RuleError("此连接已经验证身份");
          rate(`ws-auth:${clientAddress(req)}`, 120);
          if (
            typeof message.roomId !== "string" ||
            typeof message.token !== "string" ||
            message.token.length > 256
          )
            throw new RuleError("席位凭证无效");
          const room = store.get(message.roomId);
          if (!room) throw new RuleError("房间不存在");
          const seat = room.seats.find(
            (s) => !s.bot && validToken(message.token, s.tokenHash),
          );
          if (!seat) throw new RuleError("席位凭证无效");
          for (const [other, c] of clients)
            if (
              other !== ws &&
              c.roomId === room.id &&
              c.playerId === seat.id
            ) {
              clients.delete(other);
              other.close(4001, "Seat opened in another tab");
            }
          clients.set(ws, { roomId: room.id, playerId: seat.id, alive: true });
          clearTimeout(authTimer);
          broadcast(room.id);
        } catch (error) {
          send(ws, {
            type: "error",
            message: error instanceof Error ? error.message : "身份验证失败",
            fatal: true,
          });
          rejectSocket(1008, "Authentication failed");
        }
        return;
      }
      const client = clients.get(ws);
      if (!client) {
        send(ws, { type: "error", message: "请先验证席位" });
        return;
      }
      const accepted = serial(client.roomId, () => {
        try {
          rate(`seat:${client.playerId}`, 600);
          if (
            typeof message.requestId !== "string" ||
            !/^[\w-]{8,80}$/.test(message.requestId)
          )
            throw new RuleError("指令编号无效");
          const room = store.get(client.roomId);
          if (!room) throw new RuleError("房间不存在");
          const replay = store.replay(
            room.id,
            client.playerId,
            message.requestId,
          );
          if (replay) {
            send(ws, replay);
            send(ws, { type: "state", room: view(room, client.playerId) });
            return;
          }
          if (store.countCommands(room.id) >= gate.limits.maxRoomCommands)
            throw new SecurityRejection(
              429,
              "对局指令记录已达安全上限，请联系管理员",
            );
          const choiceToken =
            message.type === "command" && room.game
              ? getParallelChoiceToken(room.game, client.playerId)
              : null;
          const sameChoice =
            choiceToken !== null && message.choiceToken === choiceToken;
          // A friend's submission may advance the room while this seat's plan is
          // unchanged. Never reuse a token after this seat changes its own plan,
          // confirms, or enters another phase, even at the latest room revision.
          if (
            (message.choiceToken !== undefined && !sameChoice) ||
            (message.revision !== room.revision &&
              !(
                sameChoice &&
                Number.isSafeInteger(message.revision) &&
                message.revision >= 0 &&
                message.revision < room.revision
              ))
          )
            throw new RuleError("房间状态已更新，请使用最新状态重试");
          if (message.type === "ready") {
            if (room.game) throw new RuleError("对局已经开始");
            if (typeof message.ready !== "boolean")
              throw new RuleError("准备状态无效");
            room.seats.find((s) => s.id === client.playerId)!.ready =
              message.ready;
          } else if (
            message.type === "add-bot" ||
            message.type === "remove-bot"
          ) {
            if (client.playerId !== room.hostId)
              throw new RuleError("只有房主可以安排人机席位");
            if (room.game) throw new RuleError("开局后不能变更人机席位");
            if (message.type === "add-bot") {
              if (room.seats.length >= 4) throw new RuleError("房间已经满员");
              let number = 1;
              while (room.seats.some((s) => s.name === `人机企业家 ${number}`))
                number++;
              const { seat } = credential(`人机企业家 ${number}`);
              room.seats.push({ ...seat, bot: true, ready: true });
            } else {
              const seat = room.seats.find(
                (s) => s.id === message.playerId && s.bot,
              );
              if (!seat) throw new RuleError("只能移除人机席位");
              room.seats = room.seats.filter((s) => s.id !== seat.id);
            }
          } else if (message.type === "start") {
            if (client.playerId !== room.hostId)
              throw new RuleError("只有房主可以开始");
            if (room.game) throw new RuleError("对局已经开始");
            if (
              room.seats.length < 2 ||
              !room.seats.every(
                (s) => s.ready && (s.bot || online(room.id, s.id)),
              )
            )
              throw new RuleError("需要至少两位玩家，且全部在线并已准备");
            room.game = createGame(room.seats, {
              expansion: room.expansion,
              seed: randomBytes(4).readUInt32LE(),
            });
          } else if (message.type === "command") {
            if (!room.game) throw new RuleError("对局尚未开始");
            if (room.game.rulesVersion !== RULES_VERSION)
              throw new RuleError(
                "此存档使用其他规则版本，请使用对应版本的服务继续对局",
              );
            if (!message.command || typeof message.command !== "object")
              throw new RuleError("行动指令无效");
            room.game = applyCommand(
              room.game,
              client.playerId,
              message.command as Command,
            );
          } else throw new RuleError("未知房间操作");
          room.revision++;
          room.updatedAt = new Date().toISOString();
          const response = {
            type: "ack",
            requestId: message.requestId,
            revision: room.revision,
          };
          store.save(room, {
            playerId: client.playerId,
            id: message.requestId,
            response,
          });
          send(ws, response);
          broadcast(room.id);
        } catch (error) {
          send(ws, {
            type: "error",
            requestId: message.requestId,
            message: error instanceof Error ? error.message : "行动处理失败",
          });
          const room = store.get(client.roomId);
          if (room)
            send(ws, { type: "state", room: view(room, client.playerId) });
          if (error instanceof SecurityRejection)
            audit(req, error.message, error.status);
          else if (!(error instanceof RuleError))
            console.error(
              JSON.stringify({
                event: "command-error",
                room: client.roomId,
                requestId: message.requestId,
                error: String(error),
              }),
            );
        }
      });
      if (!accepted)
        send(ws, {
          type: "error",
          requestId: message.requestId,
          message: "房间操作较多，请稍后重试",
        });
    });
    ws.on("close", () => {
      clearTimeout(authTimer);
      const client = clients.get(ws);
      clients.delete(ws);
      if (client) broadcast(client.roomId);
    });
    ws.on("error", () => ws.terminate());
  });
  const heartbeat = setInterval(() => {
    for (const [ws, c] of clients) {
      if (!c.alive) {
        ws.terminate();
        continue;
      }
      c.alive = false;
      ws.ping();
    }
  }, 30000);
  heartbeat.unref();
  let backupTask: Promise<void> | null = null;
  const backupTimer = options.backupDirectory
    ? setInterval(() => {
        if (closing || backupTask) return;
        backupTask = store
          .backup(options.backupDirectory!, {
            automatic: true,
            keep: options.backupRetention ?? 7,
          })
          .then((path) =>
            console.info(JSON.stringify({ event: "backup", path })),
          )
          .catch((error) =>
            console.error(
              JSON.stringify({ event: "backup-error", message: String(error) }),
            ),
          )
          .finally(() => {
            backupTask = null;
          });
      }, options.backupIntervalMs ?? 86400000)
    : null;
  backupTimer?.unref();
  return {
    http,
    store,
    wsServer,
    async close() {
      closing = true;
      for (const timer of botTimers.values()) clearTimeout(timer);
      botTimers.clear();
      clearInterval(heartbeat);
      if (backupTimer) clearInterval(backupTimer);
      for (const ws of wsServer.clients) ws.terminate();
      await new Promise<void>((resolve) => wsServer.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
      await Promise.all(queues.values());
      await backupTask;
      store.close();
    },
  };
}
