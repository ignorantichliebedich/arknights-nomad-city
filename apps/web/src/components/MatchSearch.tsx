import {
  MODE_NAMES,
  type LobbyFilters,
} from "../../../../packages/shared/lobby.ts";
import type { Matchmaking } from "../useMatchmaking.ts";
export function MatchSearch({
  match,
  filters,
  name,
}: {
  match: Matchmaking;
  filters: LobbyFilters;
  name: string;
}) {
  const queued = match.status?.state === "waiting" ? match.status.queued : 1;
  return (
    <section
      className={`match-search ${match.active ? "is-searching" : ""}`}
      aria-label="自动匹配"
    >
      <div className="match-compass" aria-hidden="true">
        <i />
        <span>105</span>
        <b>◆</b>
      </div>
      <div
        className="match-search-copy"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="eyebrow">FIND YOUR FELLOW PIONEERS</span>
        <h3>
          {match.active ? "正在寻找同行的企业家" : "同一片荒野，下一位同行者。"}
        </h3>
        <p>
          {MODE_NAMES[filters.mode]} ·{" "}
          {filters.players ? `${filters.players} 人局` : "人数不限 · 2–4 人"}
        </p>
        {match.active ? (
          <p className="match-count">
            <strong>{queued.toString().padStart(2, "0")}</strong>{" "}
            位企业家正在相容队列中
            <br />
            <small>优先凑齐新桌，也会寻找符合条件的公开空席。</small>
          </p>
        ) : (
          <p className="match-intro">
            选择人数与玩法，等候同行者。凑齐队列后自动建房；也可以补入符合筛选的公开房间。
          </p>
        )}
      </div>
      {match.error && (
        <p className="recruit-error" role="alert">
          {match.error}
        </p>
      )}
      <button
        className={match.active ? "secondary-button" : "primary-button"}
        disabled={match.cancelling || (!match.active && !name.trim())}
        onClick={() =>
          match.active ? void match.cancel() : match.start(name, filters)
        }
      >
        {match.cancelling
          ? "正在取消…"
          : match.active
            ? "取消匹配"
            : "开始匹配"}
        <span aria-hidden="true">{match.active ? "×" : "↗"}</span>
      </button>
      <small className="match-footnote">
        成功后进入房间，准备完毕再由房主启程。刷新页面会接续本次匹配。
      </small>
    </section>
  );
}
