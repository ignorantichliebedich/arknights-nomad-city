import { useState } from "react";
import { highResolutionArt } from "../art.ts";

/** The image stays uncropped; readable rule text remains beside it. */
export function CardArtwork({ src, title }: { src: string; title: string }) {
  const [large, setLarge] = useState(false);
  return (
    <div className={`card-artwork ${large ? "enlarged" : ""}`}>
      <button
        className="subtle-button"
        onClick={() => setLarge(!large)}
        aria-pressed={large}
      >
        {large ? "适应窗口" : "放大牌面"}
      </button>
      <div className="artwork-viewport">
        <img src={highResolutionArt(src)} alt={title} />
      </div>
    </div>
  );
}
