import { useEffect, useState } from "react";
import {
  MODE_NAMES,
  type LobbyFilters,
} from "../../../../packages/shared/lobby.ts";
import { listRooms, type RoomListing } from "../lobby-api.ts";
export function PublicRooms({
  filters,
  name,
  onJoin,
  onMatch,
}: {
  filters: LobbyFilters;
  name: string;
  onJoin: (id: string, filters: LobbyFilters) => Promise<void>;
  onMatch: () => void;
}) {
  const [data, setData] = useState<RoomListing | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState("");
  useEffect(() => {
    setOffset(0);
    setData(null);
  }, [filters.mode, filters.players]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      try {
        const result = await listRooms(
          filters,
          offset,
          AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        );
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
        if (!result.rooms.length && offset > 0) setOffset(0);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "大厅连接中断，请重试");
      }
      if (!controller.signal.aborted) timer = setTimeout(update, 5000);
    }
    void update();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [filters.mode, filters.players, offset, refresh]);
  async function join(id: string) {
    setJoining(id);
    setError("");
    try {
      await onJoin(id, filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加入失败，请刷新大厅");
      setRefresh((n) => n + 1);
    } finally {
      setJoining("");
    }
  }
  return (
    <section className="public-room-board" aria-label="公开房间">
      <div className="recruit-board-heading">
        <span>OPEN EXPEDITIONS / 招募公告</span>
        <button onClick={() => setRefresh((n) => n + 1)} disabled={!!joining}>
          刷新大厅 ↻
        </button>
      </div>
      {error && (
        <p className="recruit-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <div className="recruit-loading" role="status">
          正在整理拓荒许可…
        </div>
      ) : !data.rooms.length ? (
        <div className="recruit-empty">
          <img src="/assets/city-model-0.svg" alt="" />
          <h3>这片荒野，还在等待同行者。</h3>
          <p>此筛选下暂无在线公开房间。发起匹配，等待下一位企业家。</p>
          <button className="primary-button" onClick={onMatch}>
            去匹配同行者 →
          </button>
        </div>
      ) : (
        <div className="public-room-grid">
          {data.rooms.map((room, i) => (
            <article className="public-room-ticket" key={room.id}>
              <div className="public-room-serial">
                <span>NO. {room.id}</span>
                <span>公开招募</span>
              </div>
              <div className="public-room-title">
                <img src={`/assets/city-model-${i % 4}.svg`} alt="" />
                <div>
                  <h3>{room.hostName}的拓荒邀约</h3>
                  <p>{MODE_NAMES[room.mode]}</p>
                </div>
              </div>
              <div
                className="public-room-seats"
                aria-label={`${room.seated} 人已入座，${room.capacity} 席`}
              >
                {Array.from({ length: room.capacity }, (_, n) => (
                  <i key={n} data-occupied={n < room.seated} aria-hidden="true">
                    {n < room.seated ? "◆" : "+"}
                  </i>
                ))}
                <span>
                  {room.seated} / {room.capacity}{" "}
                  <small>
                    {room.targetPlayers
                      ? `${room.targetPlayers} 人局`
                      : "人数不限"}
                  </small>
                </span>
              </div>
              <button
                className="secondary-button"
                disabled={!name.trim() || !!joining || !!error}
                onClick={() => void join(room.id)}
              >
                {joining === room.id ? "正在入座…" : "加入这场拓荒"}
                <span aria-hidden="true">↗</span>
              </button>
            </article>
          ))}
        </div>
      )}
      {data && (offset > 0 || data.nextOffset !== null) && (
        <nav className="recruit-pagination" aria-label="房间分页">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            上一页
          </button>
          <span>
            {Math.floor(offset / 20) + 1} · 共 {data.total} 桌
          </span>
          <button
            disabled={data.nextOffset === null}
            onClick={() => setOffset(data.nextOffset!)}
          >
            下一页
          </button>
        </nav>
      )}
    </section>
  );
}
