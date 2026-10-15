import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
  redZoneOpensAt,
} from "../../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";

export function FlipNumber({ value }: { value: number }) {
  const previous = useRef(value);
  const [change, setChange] = useState<{ from: number; delta: number } | null>(
    null,
  );
  useEffect(() => {
    if (previous.current === value) return;
    setChange({ from: previous.current, delta: value - previous.current });
    previous.current = value;
    const timer = setTimeout(() => setChange(null), 900);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <span
      className={`flip-number ${change ? (change.delta > 0 ? "number-up" : "number-down") : ""}`}
    >
      {change && (
        <span className="flip-before" aria-hidden="true" key={`old:${value}`}>
          {change.from}
        </span>
      )}
      <strong key={value}>{value}</strong>
      {change && (
        <em className="number-delta" aria-hidden="true" key={`delta:${value}`}>
          {change.delta > 0 ? "+" : ""}
          {change.delta}
        </em>
      )}
    </span>
  );
}

export function PresidentBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`president-badge ${compact ? "compact" : ""}`}
      title="大总统 · 本回合起始玩家"
    >
      <span className="president-model">
        {!compact && (
          <span className="president-depth" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <img
                src="/assets/president.webp"
                alt=""
                key={i}
                style={{ transform: `translateZ(${-i}px)` }}
              />
            ))}
          </span>
        )}
        <img
          className="president-face"
          src="/assets/president.webp"
          alt="大总统"
        />
        {!compact && <span className="president-plinth" aria-hidden="true" />}
      </span>
      {!compact && <b>大总统</b>}
    </span>
  );
}

export function ActiveEntrepreneur({
  game,
  activeId,
  children,
}: {
  game: PlayerView;
  activeId?: string;
  children?: ReactNode;
}) {
  const player = game.players.find((p) => p.id === activeId);
  if (!player) return null;
  return (
    <div
      className="entrepreneur-station"
      style={{ "--seat-color": PLAYER_COLORS[player.seat] } as CSSProperties}
    >
      {children}
      <div className="active-entrepreneur">
        <img
          className="entrepreneur-bust"
          key={player.id}
          src={`/assets/entrepreneur-bust-${player.seat}.webp`}
          alt={`当班企业家：${player.name}`}
        />
        {game.players[game.first]?.id === player.id && <PresidentBadge />}
        <div className="active-entrepreneur-caption">
          <small>{game.phase === "finished" ? "拓荒结束" : "当班企业家"}</small>
          <strong>
            {PLAYER_SYMBOLS[player.seat]} {player.name}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function TurnAnnouncement({ game }: { game: PlayerView }) {
  const actor = game.parallel
    ? game.players.find((p) => p.id === game.me)
    : game.phase === "actions"
      ? game.players[game.active]
      : (game.players.find((p) => p.id === game.decision?.playerId) ??
        game.players[game.active]);
  const key =
    game.parallel?.id ?? `${game.round}:${game.phase}:${game.lap}:${actor?.id}`;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (game.phase === "finished") {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2100);
    return () => clearTimeout(timer);
  }, [key]);
  if (!visible || !actor) return null;
  return (
    <div
      className="turn-announcement"
      key={key}
      role="status"
      aria-live="polite"
      style={{ "--seat-color": PLAYER_COLORS[actor.seat] } as CSSProperties}
    >
      <span>
        第 {game.round} 回合
        {game.phase === "actions"
          ? ` · 第 ${game.lap} 轮行动`
          : game.phase === "harvest"
            ? " · 采集阶段"
            : ""}
      </span>
      <strong>
        {game.parallel
          ? game.parallel.ready.includes(game.me)
            ? "等待全员确认"
            : game.parallel.kind === "select-role"
              ? "同时盖放角色"
              : "同时规划采集"
          : actor.id === game.me
            ? "你的回合"
            : `${actor.name} 的回合`}
      </strong>
      <small>
        {game.parallel
          ? "所有玩家确认后，一起进入下一阶段"
          : game.players[game.first]?.id === actor.id
            ? "大总统领衔拓荒"
            : "筹划城市的下一步"}
      </small>
    </div>
  );
}

export function BoardEdgeHints({
  game,
  expanded = false,
}: {
  game: PlayerView;
  expanded?: boolean;
}) {
  const [pinned, setPinned] = useState(false);
  return (
    <div className={`board-edge-hints ${pinned || expanded ? "pinned" : ""}`}>
      {!expanded && (
        <button
          aria-expanded={pinned}
          aria-controls="board-edge-reference"
          onClick={() => setPinned(!pinned)}
        >
          回合与终局计分 ▾
        </button>
      )}
      <div className="edge-hint-sheet" id="board-edge-reference">
        <div className="round-track" aria-label={`第 ${game.round} 回合`}>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={game.round === i + 1 ? "current" : ""}>
              {i + 1}
            </span>
          ))}
          <span className={game.phase === "finished" ? "current" : ""}>
            FINAL
          </span>
        </div>
        <img
          src={`/assets/board-hint-${game.players.length === 4 ? 4 : 3}.webp`}
          alt="官方地图上的终局区域分数、资源兑换与回合提示"
        />
        <p>
          {game.players.length === 2 ? "双人变体：" : ""}第{" "}
          {redZoneOpensAt(game.players.length)} 回合起可探索红区或移动城市进入。
          {game.players.length === 2 &&
            "双人规则覆盖三人地图上印刷的第 5 回合提示。"}
          终局按区域控制与剩余资源追加计分。
        </p>
      </div>
    </div>
  );
}

export function ScoreTrack({
  game,
  bounds,
}: {
  game: PlayerView;
  bounds: { x: number; y: number; w: number; h: number };
}) {
  const { x, y, w, h } = bounds;
  const playerScore = (id: string) =>
    game.phase === "finished"
      ? (game.finalScores.find((s) => s.playerId === id)?.total ??
        game.players.find((p) => p.id === id)!.wallet.score)
      : game.players.find((p) => p.id === id)!.wallet.score;
  const trackValue = (score: number) =>
    score > 50 ? ((score - 1) % 50) + 1 : Math.max(-2, score);
  const point = (score: number) => {
    const n = Math.max(-2, Math.min(50, score));
    return n <= 23
      ? { x: x + 22 + ((n + 2) / 25) * (w - 38), y: y + h - 10 }
      : { x: x + w - 11, y: y + h - 34 - ((n - 24) / 26) * (h - 50) };
  };
  return (
    <g className="score-track" aria-label="实时得分轨道">
      <path
        d={`M${x} ${y + h - 23}H${x + w - 25}V${y}H${x + w}V${y + h}H${x}Z`}
        fill="#192724"
        opacity=".96"
      />
      {Array.from({ length: 53 }, (_, i) => i - 2).map((n) => {
        const p = point(n);
        return (
          <text
            key={n}
            x={p.x}
            y={p.y + 3}
            textAnchor="middle"
            className="score-tick"
          >
            {n}
          </text>
        );
      })}
      {game.players.map((p) => {
        const score = playerScore(p.id);
        const value = trackValue(score);
        const pos = point(value);
        const peers = game.players.filter(
          (v) => trackValue(playerScore(v.id)) === value,
        );
        const offset =
          (Math.max(
            0,
            peers.findIndex((v) => v.id === p.id),
          ) -
            (peers.length - 1) / 2) *
          11;
        return (
          <g
            key={p.id}
            className="score-token"
            data-player={p.id}
            data-score={score}
            style={{
              transform: `translate(${pos.x + (value <= 23 ? offset : 0)}px,${pos.y + (value <= 23 ? -9 : offset)}px)`,
            }}
          >
            <title>
              {p.name}：{score} 分
            </title>
            <circle
              r="9"
              fill={PLAYER_COLORS[p.seat]}
              stroke="#fff5cb"
              strokeWidth="1.5"
            />
            <text
              y="3.5"
              textAnchor="middle"
              fill="#122021"
              fontSize="10"
              fontWeight="900"
            >
              {PLAYER_SYMBOLS[p.seat]}
            </text>
            {score > 50 && (
              <text y="-14" textAnchor="middle" className="score-lap">
                {score}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
