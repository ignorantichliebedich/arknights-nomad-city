import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { redZoneOpensAt } from "../../../../packages/rules/src/data.ts";
import "../originium-fog.css";

// Trace the dust boundary on the original 5000px map scans, normalized to the
// board's 0–1000 coordinates. Two players use the three-player map (appendix p.23).
const TERRITORY = {
  3: "M46 165H315 C335 193 320 250 380 270 C430 285 473 288 470 330 C468 355 415 395 400 440 L385 575 C385 615 362 632 363 679 C361 742 300 779 222 775 C155 777 104 746 46 719Z",
  4: "M46 196 C125 170 190 158 250 165 C340 155 410 220 448 270 C488 320 505 375 480 420 C450 460 441 496 446 531 L444 588 C440 620 398 644 408 683 C425 733 375 775 317 772 C250 768 219 728 170 742 C120 760 75 760 46 766Z",
};
const PARTICLES = Array.from({ length: 42 }, (_, i) => ({
  x: 62 + ((i * 79) % 416),
  y: 171 + ((i * 137) % 598),
  size: 1.1 + (i % 4) * 0.45,
  delay: `${-(i % 13) * 0.71}s`,
  duration: `${6 + (i % 5)}s`,
}));

export function OriginiumFog({
  playerCount,
  round,
}: {
  playerCount: number;
  round: number;
}) {
  const id = useId().replaceAll(":", ""),
    opensAt = redZoneOpensAt(playerCount),
    open = round >= opensAt;
  const previous = useRef(open);
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    const crossing = open && !previous.current;
    previous.current = open;
    if (!open) setClearing(false);
    if (!crossing) return;
    setClearing(true);
    const timer = setTimeout(() => setClearing(false), 1900);
    return () => clearTimeout(timer);
  }, [open]);
  // Reconnecting to an already open map never replays a historical dust storm.
  if (open && !clearing && previous.current) return null;
  return (
    <g
      className={`originium-fog ${open ? "is-clearing" : "is-sealed"}`}
      data-opens-at={opensAt}
      role="img"
      aria-label={
        open
          ? "源石尘正在消散，红区已开放"
          : `源石尘封锁红区，第 ${opensAt} 回合开放`
      }
      pointerEvents="none"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && open) setClearing(false);
      }}
    >
      <defs>
        <clipPath id={`${id}-territory`}>
          <path d={TERRITORY[playerCount === 4 ? 4 : 3]} />
        </clipPath>
        <radialGradient id={`${id}-cloud`}>
          <stop offset="0" stopColor="#a72e22" stopOpacity="0.68" />
          <stop offset="0.55" stopColor="#642019" stopOpacity="0.44" />
          <stop offset="1" stopColor="#341715" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-haze`} x2="1" y2="0.6">
          <stop stopColor="#271715" stopOpacity="0.72" />
          <stop offset="1" stopColor="#8f3025" stopOpacity="0.34" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-territory)`}>
        <path
          d={TERRITORY[playerCount === 4 ? 4 : 3]}
          fill={`url(#${id}-haze)`}
        />
        <g className="originium-clouds" fill={`url(#${id}-cloud)`}>
          <ellipse cx="185" cy="340" rx="225" ry="185" />
          <ellipse cx="300" cy="530" rx="210" ry="195" />
          <ellipse cx="135" cy="705" rx="205" ry="155" />
        </g>
        <g className="originium-dust">
          {PARTICLES.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <path
                className="originium-particle"
                d={`M0 ${-p.size * 2}L${p.size} 0 0 ${p.size * 2} ${-p.size} 0Z`}
                style={
                  {
                    "--dust-delay": p.delay,
                    "--dust-duration": p.duration,
                  } as CSSProperties
                }
              />
            </g>
          ))}
        </g>
      </g>
      <g
        className="originium-warning"
        transform={
          playerCount === 4 ? "translate(260 465)" : "translate(214 546)"
        }
      >
        <path d="M-60-17H60L66-11V17H-66V-11Z" />
        <text y="-3" textAnchor="middle">
          {open ? "源石尘消散 · 红区开放" : "源石尘 · 红区封锁"}
        </text>
        <text className="originium-opening" y="10" textAnchor="middle">
          {open ? "现在可探索与停靠" : `第 ${opensAt} 回合消散`}
        </text>
      </g>
    </g>
  );
}
