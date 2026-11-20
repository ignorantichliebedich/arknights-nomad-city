import { useState } from "react";
import type { PlayerCount } from "../../../../packages/shared/lobby.ts";
import type { RoomView } from "../network.ts";
import { RecruitmentOptions } from "./RecruitmentOptions.tsx";
import { Modal } from "./Modal.tsx";
import { useDisplayMode } from "../display-mode.ts";
export function RoomRecruitment({
  room,
  busy,
  onSettings,
  onLeave,
}: {
  room: RoomView;
  busy: boolean;
  onSettings?: (isPublic: boolean, players: PlayerCount) => void;
  onLeave?: () => Promise<void>;
}) {
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const { phone } = useDisplayMode();
  const options =
    room.me === room.hostId && onSettings ? (
      <RecruitmentOptions
        isPublic={!!room.isPublic}
        players={room.targetPlayers ?? null}
        disabled={busy || leaving}
        onPublic={(enabled) => onSettings(enabled, room.targetPlayers ?? null)}
        onPlayers={(players) => onSettings(!!room.isPublic, players)}
      />
    ) : null;
  async function leave() {
    if (!onLeave) return;
    setLeaving(true);
    setError("");
    try {
      await onLeave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "离座失败，请重试");
      setLeaving(false);
    }
  }
  return (
    <section className="room-recruitment" aria-label="本桌招募设置">
      <div className="room-recruitment-heading">
        <span>
          {room.isPublic ? "公开招募" : "私人邀约"} ·{" "}
          {room.targetPlayers ? `${room.targetPlayers} 人局` : "人数不限"}
        </span>
        {phone && options && (
          <button className="subtle-button" onClick={() => setSettings(true)}>
            招募设置
          </button>
        )}
        {onLeave && (
          <button
            className="subtle-button"
            disabled={busy || leaving}
            onClick={() => void leave()}
          >
            {leaving ? "正在离座…" : "离开席位"}
          </button>
        )}
      </div>
      {!phone && options}
      {phone && settings && (
        <Modal title="本桌招募设置" onClose={() => setSettings(false)}>
          {options}
        </Modal>
      )}
      {error && (
        <p className="recruit-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
