import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "../../../packages/rules/src/types.ts";
export type RoomView = {
  id: string;
  hostId: string;
  revision: number;
  expansion: boolean;
  oripathy?: boolean;
  expert?: boolean;
  phase: string;
  me: string | null;
  rulesVersion: string;
  seats: {
    id: string;
    name: string;
    ready: boolean;
    connected: boolean;
    bot?: true;
  }[];
  game: PlayerView | null;
};
export function readCredential(room: string) {
  try {
    return localStorage.getItem(`nomad:seat:${room}`) ?? "";
  } catch {
    return "";
  }
}
export function saveCredential(room: string, token: string) {
  localStorage.setItem(`nomad:seat:${room}`, token);
}
export function useRoom(roomId: string, token: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "online" | "offline" | "replaced"
  >("connecting");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const pending = useRef<Record<string, unknown> | null>(null);
  const awaitReceipt = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!roomId || !token) return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    let deadline: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setRoom(null);
    setStatus("connecting");
    setError("");
    roomRef.current = null;
    pending.current = null;
    try {
      pending.current = JSON.parse(
        localStorage.getItem(`nomad:pending:${roomId}`) ?? "null",
      );
    } catch {
      pending.current = null;
    }
    setBusy(!!pending.current);
    const isCurrent = (ws: WebSocket) => !disposed && socket.current === ws;
    const recover = (ws: WebSocket) => {
      if (!isCurrent(ws)) return;
      clearTimeout(deadline);
      socket.current = null;
      ws.close();
      setStatus("offline");
      timeout = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 10000));
    };
    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
      );
      socket.current = ws;
      setStatus("connecting");
      // A socket can stay OPEN through a stalled link. Reconnect with the same
      // request ID so the server can replay its receipt without executing twice.
      const armDeadline = () => {
        clearTimeout(deadline);
        deadline = setTimeout(() => {
          if (!isCurrent(ws)) return;
          setError("连接响应较慢，正在重新同步；已提交的操作会自动核对。");
          recover(ws);
        }, 15000);
      };
      awaitReceipt.current = armDeadline;
      armDeadline();
      let initialState = true;
      ws.onopen = () => {
        if (isCurrent(ws))
          ws.send(JSON.stringify({ type: "hello", roomId, token }));
      };
      ws.onmessage = (event) => {
        if (!isCurrent(ws)) return;
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          setRoom(message.room);
          roomRef.current = message.room;
          setStatus("online");
          if (initialState) {
            initialState = false;
            clearTimeout(deadline);
            if (pending.current) {
              ws.send(JSON.stringify(pending.current));
              armDeadline();
            } else {
              attempts = 0;
              setError("");
            }
          }
        }
        if (message.type === "ack" || message.type === "error") {
          if (
            message.requestId &&
            message.requestId === pending.current?.requestId
          ) {
            pending.current = null;
            clearTimeout(deadline);
            attempts = 0;
            localStorage.removeItem(`nomad:pending:${roomId}`);
            setBusy(false);
          }
          if (message.type === "error") setError(message.message);
          else setError("");
        }
      };
      ws.onclose = (event) => {
        if (!isCurrent(ws)) return;
        clearTimeout(deadline);
        if (event.code === 4001) {
          setStatus("replaced");
          setError("此席位已在另一个标签页打开。关闭另一页后刷新即可继续。");
          return;
        }
        setStatus("offline");
        if (event.code === 1008) {
          setError("房间或席位凭证失效，请返回入口重新加入。");
          return;
        }
        recover(ws);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearTimeout(deadline);
      awaitReceipt.current = null;
      socket.current?.close();
      socket.current = null;
    };
  }, [roomId, token]);
  function send(type: string, extra: Record<string, unknown> = {}) {
    if (
      busy ||
      status !== "online" ||
      pending.current ||
      socket.current?.readyState !== WebSocket.OPEN ||
      !roomRef.current
    )
      return;
    const message = {
      type,
      ...extra,
      requestId:
        crypto.randomUUID?.() ??
        Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join(""),
      revision: roomRef.current.revision,
      ...(type === "command" && roomRef.current.game?.parallel?.choiceToken
        ? { choiceToken: roomRef.current.game.parallel.choiceToken }
        : {}),
    };
    pending.current = message;
    localStorage.setItem(`nomad:pending:${roomId}`, JSON.stringify(message));
    setBusy(true);
    setError("");
    socket.current.send(JSON.stringify(message));
    awaitReceipt.current?.();
  }
  return { room, status, error, busy, send, clearError: () => setError("") };
}
