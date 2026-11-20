import { useEffect, useRef, useState } from "react";
import type {
  LobbyFilters,
  MatchStatus,
} from "../../../packages/shared/lobby.ts";
import { lobbyRequest, LobbyError } from "./lobby-api.ts";
type Ticket = { token: string; name: string; filters: LobbyFilters };
const KEY = "nomad:match:v1";
function saved(): Ticket | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return t &&
      /^[a-f0-9]{64}$/.test(t.token) &&
      typeof t.name === "string" &&
      ["base", "enterprise", "oripathy", "expert"].includes(t.filters?.mode) &&
      [null, 2, 3, 4].includes(t.filters?.players)
      ? t
      : null;
  } catch {
    return null;
  }
}
function persist(t: Ticket | null) {
  try {
    if (t) sessionStorage.setItem(KEY, JSON.stringify(t));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* Keep this tab usable when storage is unavailable. */
  }
}
export function useMatchmaking(
  onMatched: (room: string, token: string) => void,
  enabled = true,
) {
  const [ticket, setTicket] = useState(saved);
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [error, setError] = useState("");
  const [cancelProblem, setCancelProblem] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const delivered = useRef(onMatched);
  delivered.current = onMatched;
  const generation = useRef(0);
  useEffect(() => {
    if (!ticket || !enabled) return;
    const at = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    let registered = false;
    const controller = new AbortController();
    async function tick() {
      let delay = 2500;
      try {
        const next = await lobbyRequest<MatchStatus>("/api/matchmaking", {
          method: registered ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${ticket!.token}`,
            "Content-Type": "application/json",
          },
          ...(registered
            ? {}
            : {
                body: JSON.stringify({
                  name: ticket!.name,
                  ...ticket!.filters,
                }),
              }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (at !== generation.current || controller.signal.aborted) return;
        registered = true;
        setStatus(next);
        setError("");
        if (next.state === "matched") {
          delivered.current(next.roomId, ticket!.token);
          persist(null);
          setTicket(null);
          return;
        }
        if (next.state !== "waiting") {
          setCancelProblem("");
          persist(null);
          setTicket(null);
          if (next.state === "expired")
            setError("匹配已过期，请重新开始；已加入的房间仍可用原凭证进入。");
          return;
        }
      } catch (e) {
        if (at !== generation.current || controller.signal.aborted) return;
        setError(
          e instanceof LobbyError
            ? e.message
            : "连接暂时中断，正在重新寻找同行…",
        );
        delay = e instanceof LobbyError && e.status === 429 ? 60000 : 5000;
      }
      timer = setTimeout(tick, delay);
    }
    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [ticket, enabled]);
  function start(name: string, filters: LobbyFilters) {
    if (ticket || cancelling) return;
    if (!name.trim() || name.trim().length > 20) {
      setError("先填写 1–20 字的企业家昵称");
      return;
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    const next = { token, name: name.trim(), filters };
    persist(next);
    setCancelProblem("");
    setError("");
    setStatus(null);
    setTicket(next);
  }
  async function cancel(): Promise<boolean> {
    if (!ticket) return true;
    if (cancelling) return false;
    setCancelling(true);
    setCancelProblem("");
    generation.current++;
    try {
      const result = await lobbyRequest<MatchStatus>("/api/matchmaking", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ticket.token}` },
      });
      if (result.state === "matched")
        delivered.current(result.roomId, ticket.token);
      persist(null);
      setTicket(null);
      setStatus(null);
      setError("");
      return true;
    } catch (e) {
      setCancelProblem(
        e instanceof LobbyError ? e.message : "连接中断，请重试取消匹配。",
      );
      // Replace the object to restart polling after a failed cancellation.
      setTicket({ ...ticket });
      return false;
    } finally {
      setCancelling(false);
    }
  }
  return {
    ticket,
    status,
    error: cancelProblem || error,
    active: !!ticket,
    cancelling,
    start,
    cancel,
  };
}
export type Matchmaking = ReturnType<typeof useMatchmaking>;
