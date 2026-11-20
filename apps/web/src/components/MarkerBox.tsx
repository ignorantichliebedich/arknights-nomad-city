import { useId, useLayoutEffect, useRef, useState } from "react";
import { PLAYER_COLORS } from "../../../../packages/rules/src/data.ts";

function cubePosition(index: number) {
  const layer = Math.floor(index / 12);
  const column = index % 4;
  const row = Math.floor((index % 12) / 4);
  return `translate(${31 + column * 8 - row * 8} ${21 + (column + row) * 3 - layer * 7})`;
}

export function MarkerBox({ count, seat }: { count: number; seat: number }) {
  const cube = useId();
  const previous = useRef(count);
  const [withdrawn, setWithdrawn] = useState<number[]>([]);
  useLayoutEffect(() => {
    const spent = previous.current - count;
    previous.current = count;
    if (spent <= 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWithdrawn([]);
      return;
    }
    setWithdrawn(Array.from({ length: spent }, (_, i) => count + i));
    const timer = window.setTimeout(() => setWithdrawn([]), 590);
    return () => window.clearTimeout(timer);
  }, [count]);
  return (
    <span className="marker-box" aria-label={`可用标记 ${count}`}>
      <svg
        viewBox="0 -6 78 58"
        aria-hidden="true"
        style={{ color: PLAYER_COLORS[seat] }}
      >
        <defs>
          <g
            id={cube}
            stroke="#432e21"
            strokeWidth=".65"
            strokeLinejoin="round"
          >
            <path
              d="M-8 0 0-3.3 8 0 0 3.4Z"
              fill="color-mix(in srgb,currentColor 52%,#fff0d0)"
            />
            <path d="m-8 0 8 3.4v7l-8-3.5Z" fill="currentColor" />
            <path
              d="m8 0-8 3.4v7l8-3.5Z"
              fill="color-mix(in srgb,currentColor 58%,#352c28)"
            />
            <path
              d="m-6.6 .2 6.5 2.6 6.4-2.6"
              fill="none"
              stroke="#f4dfb5"
              strokeWidth=".55"
            />
          </g>
        </defs>
        <ellipse cx="38" cy="42" rx="32" ry="6" fill="#171410" opacity=".42" />
        <path
          d="m3 30 28-13 42 15-28 14Z"
          fill="#584632"
          stroke="#cca571"
          strokeWidth="2.5"
        />
        <path d="m8 30 23-10 36 12-23 10Z" fill="#302b23" />
        {Array.from({ length: count }, (_, i) => (
          <use key={i} href={`#${cube}`} transform={cubePosition(i)} />
        ))}
        <path
          d="m3 30 41 14 29-12v6L44 51 3 36Z"
          fill="#865c3e"
          stroke="#3b3026"
        />
        <path
          d="m3 30 41 14 29-12"
          fill="none"
          stroke="#dec094"
          strokeWidth="2"
        />
        <path
          d="m8 33 4 1.4v4L8 37Zm29 10 4 1.4v4l-4-1.4Zm28-6 4-1.6v4l-4 1.6Z"
          fill="#c29a60"
        />
        {withdrawn.map((i) => (
          <g key={i} transform={cubePosition(i)}>
            <use className="marker-withdraw" href={`#${cube}`} />
          </g>
        ))}
      </svg>
      <span>
        <span className="marker-box-name">可用标记 </span>
        <b>{count}</b>
      </span>
    </span>
  );
}
