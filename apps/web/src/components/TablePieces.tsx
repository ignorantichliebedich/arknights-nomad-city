import {
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
} from "../../../../packages/rules/src/data.ts";
import type { Resource } from "../../../../packages/rules/src/types.ts";

type Point = readonly [number, number, number];
type Face = { vertices: Point[]; light: number };
// Shared solid geometry, projected isometrically. Only the seat material changes.
// X/Y form the table plane; Z is height. Footprints remain inside each map site.
function box(
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
): Face[] {
  return [
    {
      vertices: [
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      light: 0.24,
    },
    {
      vertices: [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      light: -0.2,
    },
    {
      vertices: [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h],
      ],
      light: -0.4,
    },
  ];
}
const markerFaces = [
  ...box(-6, -6, 0, 12, 12, 3),
  ...box(-5, -5, 3, 10, 10, 2),
  ...box(-4, -4, 5, 8, 8, 7),
  ...box(-5, -5, 12, 10, 10, 2),
];
function tint(hex: string, light: number) {
  return `rgb(${[1, 3, 5]
    .map((start) => {
      const n = parseInt(hex.slice(start, start + 2), 16);
      return Math.round(light > 0 ? n + (255 - n) * light : n * (1 + light));
    })
    .join(",")})`;
}
function points(vertices: Point[]) {
  return vertices
    .map(
      ([x, y, z]) =>
        `${((x - y) * 0.86).toFixed(2)},${((x + y) * 0.43 - z).toFixed(2)}`,
    )
    .join(" ");
}
export function TablePiece({
  kind,
  seat,
  x = 0,
  y = 0,
  ghost = false,
  variant,
}: {
  kind: "city" | "influence";
  seat: number;
  x?: number;
  y?: number;
  ghost?: boolean;
  variant?: "gang";
}) {
  const city = kind === "city";
  const color = variant === "gang" ? "#9663b8" : PLAYER_COLORS[seat];
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`table-piece piece-${kind} ${ghost ? "ghost-piece" : ""}`}
      pointerEvents="none"
      data-seat={seat}
    >
      <ellipse
        cx="1"
        cy="3"
        rx={city ? 31 : 11}
        ry={city ? 14 : 6}
        fill="#111c1b"
        opacity=".4"
      />
      {city && (
        <image
          href={`/assets/city-model-${seat}.svg`}
          x="-40"
          y="-48"
          width="80"
          height="55"
        />
      )}
      {(!city ? markerFaces : []).map((face, i) => (
        <polygon
          key={i}
          points={points(face.vertices)}
          fill={tint(color, face.light)}
          stroke={tint(color, -0.6)}
          strokeWidth=".7"
          strokeLinejoin="round"
        />
      ))}
      {!city && (
        <>
          {variant === "gang" && (
            <path
              d="M-12 -3 L-12 -20 L-4 -24 L-4 -7 Z"
              fill={PLAYER_COLORS[seat]}
              stroke="#fce8b9"
              strokeWidth="1"
            />
          )}
          <path
            d="M-8.6 -14 L0 -18.3 L8.6 -14 L0 -9.7 Z"
            fill={tint(color, 0.65)}
            stroke="#fff3cd"
            strokeWidth=".65"
          />
          <path
            d="M0 -9.7 V-2.5 M-8.6 -14 V-7 M8.6 -14 V-7"
            fill="none"
            stroke={tint(color, 0.6)}
            strokeWidth=".8"
          />
          <path
            d="M-10.3 0 L0 5.2 L10.3 0"
            fill="none"
            stroke="#d8bf84"
            strokeWidth="1.2"
          />
        </>
      )}
      <text
        x="0"
        y={city ? 1 : -10.5}
        className="piece-symbol"
        textAnchor="middle"
        fill="#fff8df"
        fontSize={city ? 12 : 9}
        fontWeight="800"
        stroke="#1a2425"
        strokeWidth="2"
        paintOrder="stroke"
      >
        {PLAYER_SYMBOLS[seat]}
      </text>
    </g>
  );
}

export function ResourceToken({ type }: { type: Resource }) {
  return (
    <img
      className={`stock-token token-${type}`}
      src={`/assets/resource-${type}.webp`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
