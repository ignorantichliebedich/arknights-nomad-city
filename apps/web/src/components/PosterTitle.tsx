import type { CSSProperties } from "react";

export const TITLE_GLYPHS = [..."明日方舟游城拓荒"].map(
  (char) => `/assets/title-glyph-${char.codePointAt(0)!.toString(16)}.svg`,
);

/** Individual vectors keep the printed letterforms identical across platforms. */
export function PosterTitle() {
  return (
    <h1
      id="departure-title"
      className="poster-title"
      aria-label="明日方舟 游城拓荒"
    >
      {["明日方舟", "游城拓荒"].map((line, row) => (
        <span
          className={`poster-line poster-line-${row}`}
          key={line}
          aria-hidden="true"
        >
          {[...line].map((char, index) => (
            <span
              className={`poster-tile tile-${index}`}
              key={char}
              style={{ "--glyph": row * 4 + index } as CSSProperties}
            >
              <span className="poster-wave">
                <span className="poster-jitter">
                  <span className="poster-paper" />
                  <span className="poster-fallback">{char}</span>
                  <img
                    src={TITLE_GLYPHS[row * 4 + index]}
                    alt=""
                    draggable={false}
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                </span>
              </span>
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}
