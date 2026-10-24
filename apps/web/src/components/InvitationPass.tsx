import { useRef, useState } from "react";
import type { RoomView } from "../network.ts";

export function InvitationPass({
  room,
  disabled,
  onAddBot,
  onRemoveBot,
}: {
  room: RoomView;
  disabled: boolean;
  onAddBot: () => void;
  onRemoveBot: (id: string) => void;
}) {
  const [mode, setMode] = useState<"friends" | "bots">("friends");
  const canArrange = room.me === room.hostId && !room.game;
  const arranging = mode === "bots" && canArrange;
  const bots = room.seats.filter((s) => s.bot);
  const address = `${location.origin}/room/${room.id}`;
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "manual">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied("done");
    } catch {
      field.current?.focus();
      field.current?.select();
      setCopied("manual");
    }
  };
  return (
    <div className="invitation-pass">
      <div className="invitation-pass-heading">
        <span>PRIVATE EXPEDITION / 105</span>
        <span>{arranging ? "人机同行档案" : "好友通行凭证"}</span>
      </div>
      <div className="invitation-pass-code">
        <img src="/assets/city-model-0.svg" alt="" />
        <div>
          <small>拓荒区编号</small>
          <strong>{room.id}</strong>
          <span>
            {room.oripathy
              ? `感染者 · ${room.expert ? "企业家抉择" : "常规玩法"}`
              : room.expansion
                ? "铸基者 + 企业扩展"
                : "铸基者 · 基础版"}
          </span>
        </div>
      </div>
      <div className="invitation-seats">
        <span>
          {room.game
            ? "已启程 · 原玩家可返回"
            : room.seats.length === 4
              ? "四席已满"
              : `已入座 ${room.seats.length} / 4 · 余 ${4 - room.seats.length} 席`}
        </span>
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={room.seats[i] ? "occupied" : ""}>
              {room.seats[i] ? (
                <img src={`/assets/avatar-${i}.webp?v=founders`} alt="" />
              ) : (
                "＋"
              )}
            </span>
          ))}
        </div>
      </div>
      {canArrange && (
        <div
          className="invitation-mode-tabs"
          role="group"
          aria-label="邀请同行者方式"
        >
          <button aria-pressed={!arranging} onClick={() => setMode("friends")}>
            邀请朋友 <span>分享通行凭证</span>
          </button>
          <button aria-pressed={arranging} onClick={() => setMode("bots")}>
            人机同行 <span>安排自动席位</span>
          </button>
        </div>
      )}
      {arranging ? (
        <section className="invitation-bots" aria-label="安排人机同行者">
          <p>
            人机自动准备、选牌、行动和采集，可与朋友混合入座。每位企业家独立持有资源并计分。
          </p>
          <div className="invitation-bot-list">
            {bots.map((bot) => {
              const index = room.seats.findIndex((s) => s.id === bot.id);
              return (
                <div className="invitation-bot-seat" key={bot.id}>
                  <img src={`/assets/avatar-${index}.webp?v=founders`} alt="" />
                  <div>
                    <strong>{bot.name}</strong>
                    <small>第 {index + 1} 席 · 自动准备</small>
                  </div>
                  <button
                    disabled={disabled}
                    onClick={() => onRemoveBot(bot.id)}
                    aria-label={`移除${bot.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <button
            className="invitation-add-bot"
            disabled={disabled || room.seats.length >= 4}
            onClick={onAddBot}
          >
            <img
              src={`/assets/city-model-${Math.min(room.seats.length, 3)}.svg`}
              alt=""
            />
            <span>
              <strong>
                {room.seats.length >= 4 ? "四席已满" : "＋ 添加人机"}
              </strong>
              <small>
                {room.seats.length >= 4
                  ? "移除一位人机后可重新安排"
                  : `余 ${4 - room.seats.length} 席 · 自动操作自己的城市`}
              </small>
            </span>
          </button>
          <small className="invitation-network-note">
            安排完毕后关闭凭证，在大厅准备并开始拓荒。
          </small>
        </section>
      ) : (
        <>
          <p>
            {room.game
              ? "开局后锁定席位，原玩家可用原浏览器打开地址继续。"
              : "把通行凭证分享给朋友。输入房间码，或打开下方地址，即可加入。"}
          </p>
          <label htmlFor="invitation-address">邀请地址</label>
          <input
            ref={field}
            id="invitation-address"
            className="invite-url"
            readOnly
            value={address}
            onFocus={(e) => e.target.select()}
          />
          <button className="primary-button full" onClick={() => void copy()}>
            {copied === "done" ? "已复制邀请地址 ✓" : "复制邀请地址"}
            <span aria-hidden="true">↗</span>
          </button>
          <p className="invitation-copy-status" role="status">
            {copied === "done"
              ? "地址已复制，可以发送给同行的朋友。"
              : copied === "manual"
                ? "地址已选中，请按 Ctrl+C 复制。"
                : "也可直接把上方六位房间码发给朋友。"}
          </p>
          <small className="invitation-network-note">
            局域网朋友请使用房主电脑的局域网 IP 地址访问游戏。
          </small>
        </>
      )}
    </div>
  );
}
