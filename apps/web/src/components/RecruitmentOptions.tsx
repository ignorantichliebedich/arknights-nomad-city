import type { PlayerCount } from "../../../../packages/shared/lobby.ts";
import { useId } from "react";
export function RecruitmentOptions({
  isPublic,
  players,
  disabled,
  onPublic,
  onPlayers,
}: {
  isPublic: boolean;
  players: PlayerCount;
  disabled: boolean;
  onPublic: (value: boolean) => void;
  onPlayers: (value: PlayerCount) => void;
}) {
  const hint = useId();
  return (
    <div className="recruitment-options">
      <label className="recruitment-visibility">
        <input
          type="checkbox"
          aria-label="公开招募同行者"
          aria-describedby={hint}
          checked={isPublic}
          disabled={disabled}
          onChange={(e) => onPublic(e.target.checked)}
        />
        <span>
          <strong>公开招募同行者</strong>
          <small id={hint}>
            {isPublic
              ? "展示在大厅，接受匹配玩家入座"
              : "私人邀约 · 仅通过房间码加入"}
          </small>
        </span>
      </label>
      <label className="recruitment-count">
        本桌人数
        <select
          aria-label="本桌人数"
          value={players ?? ""}
          disabled={disabled}
          onChange={(e) =>
            onPlayers(
              e.target.value ? (Number(e.target.value) as PlayerCount) : null,
            )
          }
        >
          <option value="">不限（2–4 人）</option>
          <option value="2">二人局</option>
          <option value="3">三人局</option>
          <option value="4">四人局</option>
        </select>
      </label>
      {isPublic && players === null && (
        <small className="recruitment-note">
          接受任意人数；指定人数的匹配可将本桌确定为二、三或四人局。
        </small>
      )}
    </div>
  );
}
