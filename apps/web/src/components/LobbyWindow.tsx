import { useState } from "react";
import {
  MODE_NAMES,
  type GameMode,
  type LobbyFilters,
  type PlayerCount,
} from "../../../../packages/shared/lobby.ts";
import type { Matchmaking } from "../useMatchmaking.ts";
import { Modal } from "./Modal.tsx";
import { MatchSearch } from "./MatchSearch.tsx";
import { PublicRooms } from "./PublicRooms.tsx";
export function LobbyWindow({
  initialTab,
  mode,
  name,
  onName,
  match,
  onJoin,
  onClose,
}: {
  initialTab: "match" | "rooms";
  mode: GameMode;
  name: string;
  onName: (name: string) => void;
  match: Matchmaking;
  onJoin: (id: string, filters: LobbyFilters) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [filters, setFilters] = useState<LobbyFilters>(
    match.ticket?.filters ?? { mode, players: null },
  );
  const active = match.ticket?.filters ?? filters;
  return (
    <Modal
      title="拓荒招募大厅"
      className="dossier-window recruiting-window"
      onClose={onClose}
      beforeClose={match.cancel}
    >
      <div className="recruit-banner">
        <div>
          <span>DISTRICT 105 / RECRUITMENT OFFICE</span>
          <p>签一张邀约，遇见你的下一位同行者。</p>
        </div>
        <b aria-hidden="true">105</b>
      </div>
      <div className="recruit-tabs" role="group" aria-label="招募方式">
        <button
          aria-pressed={tab === "match"}
          disabled={match.active || match.cancelling}
          onClick={() => setTab("match")}
        >
          自动匹配 <small>MATCHMAKING</small>
        </button>
        <button
          aria-pressed={tab === "rooms"}
          disabled={match.active || match.cancelling}
          onClick={() => setTab("rooms")}
        >
          找房间 <small>OPEN EXPEDITIONS</small>
        </button>
      </div>
      <div className="recruit-filters">
        <label>
          企业家昵称
          <input
            aria-label="招募昵称"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder="签下你的名字"
            disabled={match.active}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
        <label>
          玩法
          <select
            aria-label="招募玩法"
            value={active.mode}
            disabled={match.active}
            onChange={(e) =>
              setFilters({ ...filters, mode: e.target.value as GameMode })
            }
          >
            {Object.entries(MODE_NAMES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          人数
          <select
            aria-label="招募人数"
            value={active.players ?? ""}
            disabled={match.active}
            onChange={(e) =>
              setFilters({
                ...filters,
                players: e.target.value
                  ? (Number(e.target.value) as PlayerCount)
                  : null,
              })
            }
          >
            <option value="">不限人数</option>
            <option value="2">二人局</option>
            <option value="3">三人局</option>
            <option value="4">四人局</option>
          </select>
        </label>
      </div>
      {tab === "match" ? (
        <MatchSearch match={match} filters={active} name={name} />
      ) : (
        <PublicRooms
          filters={filters}
          name={name}
          onJoin={onJoin}
          onMatch={() => setTab("match")}
        />
      )}
    </Modal>
  );
}
