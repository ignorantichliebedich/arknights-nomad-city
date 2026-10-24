import type { CSSProperties } from "react";
import {
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
} from "../../../../packages/rules/src/data.ts";
import type { RoomView } from "../network.ts";

export function RoomLobby({
  room,
  busy,
  status,
  onReady,
  onStart,
  onInvite,
}: {
  room: RoomView;
  busy: boolean;
  status: "connecting" | "online" | "offline" | "replaced";
  onReady: () => void;
  onStart: () => void;
  onInvite: () => void;
}) {
  const mine = room.seats.find((s) => s.id === room.me);
  const isHost = room.me === room.hostId;
  const readyCount = room.seats.filter((s) => s.ready && s.connected).length;
  const allReady = room.seats.length >= 2 && readyCount === room.seats.length;
  const waiting =
    status === "replaced"
      ? "席位已在另一个页面打开"
      : status !== "online"
        ? "正在恢复连接，请稍候"
        : room.seats.some((s) => !s.connected)
          ? "等待离线的企业家重新连接"
          : room.seats.length < 2
            ? "邀请朋友或添加人机，即可准备出发"
            : !allReady
              ? "等待所有企业家确认准备"
              : isHost
                ? "全员就绪，由你开启这场拓荒"
                : "全员就绪，等待房主开始";
  return (
    <main className="assembly-lobby">
      <section className="assembly-table" aria-labelledby="assembly-title">
        <div className="assembly-heading">
          <div>
            <span className="departure-kicker">
              <i /> PIONEER ASSEMBLY / 企业家集结
            </span>
            <h1 id="assembly-title">企业家正在集结。</h1>
            <p>一人一座移动城市。下一片荒野，等你们共同启程。</p>
          </div>
          <div className="assembly-count">
            <strong>{String(room.seats.length).padStart(2, "0")}</strong>
            <span>
              / 04
              <br />
              已入座
            </span>
          </div>
        </div>
        <div className="assembly-seats" aria-label="企业家席位">
          {Array.from({ length: 4 }, (_, i) => {
            const seat = room.seats[i];
            return (
              <article
                key={seat?.id ?? `empty-${i}`}
                className={`seat assembly-seat ${seat ? "occupied" : "empty"} ${seat?.id === room.me ? "is-mine" : ""} ${seat && !seat.connected ? "is-offline" : ""}`}
                style={
                  {
                    "--seat-color": PLAYER_COLORS[i],
                    "--seat-index": i,
                  } as CSSProperties
                }
                data-ready={!!seat?.ready}
                aria-label={`席位 ${i + 1}${seat ? ` · ${seat.name}` : " · 空席位"}`}
              >
                <div className="assembly-seat-top">
                  <span>
                    <b>{PLAYER_SYMBOLS[i]}</b> SEAT 0{i + 1}
                  </span>
                  <span>
                    {seat?.id === room.hostId
                      ? "房主"
                      : seat?.bot
                        ? "人机"
                        : seat
                          ? "企业家"
                          : "待入座"}
                    {seat?.id === room.me && <em>你</em>}
                  </span>
                </div>
                {seat ? (
                  <>
                    <div className="assembly-portrait">
                      <img
                        src={`/assets/entrepreneur-${i}.webp`}
                        alt={`第 ${i + 1} 席企业家立绘`}
                        draggable={false}
                      />
                      <div className="assembly-portrait-shade" />
                      <span
                        className={`assembly-signal ${seat.connected ? "connected" : ""}`}
                      >
                        <i />
                        {seat.bot
                          ? "人机 · 自动行动"
                          : seat.connected
                            ? "在线"
                            : "离线 · 保留席位"}
                      </span>
                      {seat.ready && (
                        <span className="assembly-ready-stamp" key="ready">
                          {seat.bot ? "自动准备" : "已准备"}
                          <small>READY TO DEPART</small>
                        </span>
                      )}
                    </div>
                    <div className="assembly-nameplate">
                      <img
                        src={`/assets/city-model-${i}.svg`}
                        alt=""
                        draggable={false}
                      />
                      <div>
                        <strong title={seat.name}>{seat.name}</strong>
                        <small>
                          {!seat.connected
                            ? "等待重新连接"
                            : seat.ready
                              ? "行装就绪，等待启程"
                              : "正在整备城市"}
                        </small>
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    className="assembly-open-seat"
                    onClick={onInvite}
                    aria-label={`邀请朋友入座 ${i + 1}`}
                  >
                    <span className="empty-seat-crosshair" aria-hidden="true">
                      <img
                        src={`/assets/city-model-${i}.svg`}
                        alt=""
                        draggable={false}
                      />
                    </span>
                    <strong>等待企业家</strong>
                    <span>空席位 · 点击邀请</span>
                    <b aria-hidden="true">＋</b>
                  </button>
                )}
              </article>
            );
          })}
        </div>
        <div className={`assembly-departure ${allReady ? "all-ready" : ""}`}>
          <div
            className="assembly-readiness"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="assembly-ready-track" aria-hidden="true">
              {room.seats.map((seat, i) => (
                <i
                  key={seat.id}
                  className={seat.ready && seat.connected ? "ready" : ""}
                  style={{ "--seat-color": PLAYER_COLORS[i] } as CSSProperties}
                />
              ))}
            </div>
            <strong>{waiting}</strong>
            <span>
              <b>
                {readyCount} / {room.seats.length}
              </b>{" "}
              位企业家已准备
            </span>
          </div>
          <div className="assembly-actions">
            <button
              className={`secondary-button ${mine?.ready ? "is-ready" : ""}`}
              disabled={busy || status !== "online"}
              onClick={onReady}
              aria-busy={busy}
            >
              {mine?.ready ? "取消准备" : "准备出发"}
              <span
                className={busy ? "button-activity" : ""}
                aria-hidden="true"
              >
                {busy ? "◌" : mine?.ready ? "✓" : "◇"}
              </span>
            </button>
            {isHost && (
              <button
                className="primary-button"
                disabled={busy || status !== "online" || !allReady}
                onClick={onStart}
              >
                开始拓荒 <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </div>
        <ol className="assembly-journey" aria-label="启程流程">
          <li aria-current="step">
            <b>01</b> 集结准备
          </li>
          <li>
            <b>02</b> 开局部署
          </li>
          <li>
            <b>03</b> 八回合拓荒
          </li>
        </ol>
      </section>
      <aside className="assembly-dossier" aria-labelledby="dossier-title">
        <div className="dossier-heading">
          <span className="eyebrow">EXPEDITION FILE</span>
          <h2 id="dossier-title">本次拓荒档案</h2>
          <span aria-hidden="true">105</span>
        </div>
        <div className="dossier-map">
          <img
            src={
              room.seats.length === 4
                ? "/assets/board-4.webp"
                : "/assets/board-3.webp"
            }
            alt="拓荒区棋盘预览"
          />
          <span>第 105 号拓荒区</span>
          <i aria-hidden="true" />
        </div>
        <dl className="dossier-facts">
          <div>
            <dt>桌游版本</dt>
            <dd>
              {room.oripathy
                ? `感染者${room.expert ? " · 企业家抉择" : " · 常规玩法"}`
                : room.expansion
                  ? "铸基者 + 企业扩展"
                  : "铸基者 · 基础版"}
            </dd>
          </div>
          <div>
            <dt>拓荒周期</dt>
            <dd>8 回合</dd>
          </div>
          <div>
            <dt>同行席位</dt>
            <dd>2–4 人 · 私人邀请</dd>
          </div>
        </dl>
        <div className="dossier-invitation">
          <span>邀请房间码</span>
          <strong>{room.id}</strong>
          <button className="secondary-button" onClick={onInvite}>
            邀请朋友 <span aria-hidden="true">↗</span>
          </button>
          <small>分享地址或房间码，即可入座。</small>
        </div>
        <div className="dossier-note">
          <img src="/assets/resource-score.webp" alt="" />
          <p>
            控制航道，经营城市。
            <br />
            让你的名字留在这片荒野。
          </p>
        </div>
      </aside>
    </main>
  );
}
