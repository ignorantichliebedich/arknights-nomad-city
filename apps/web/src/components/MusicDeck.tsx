import { gameAudio } from "../audio.ts";
import type { AudioPreferences, MusicTrack } from "../audio-config.ts";

export function MusicDeck({
  tracks,
  prefs,
  playback,
}: {
  tracks: MusicTrack[];
  prefs: AudioPreferences;
  playback: string;
}) {
  const index = Math.max(
      0,
      tracks.findIndex((track) => track.id === prefs.track),
    ),
    track = tracks[index];
  const playing = prefs.music && !prefs.muted && playback === "playing";
  return (
    <div className={`music-deck ${playing ? "is-playing" : ""}`}>
      <div className="music-sleeve" aria-label={`${track.title} 音乐封面`}>
        <div className="record-platter">
          <div className="record-grooves" />
          <div className="record-label">
            {track.cover ? (
              <img
                key={track.id}
                src={track.cover}
                alt={`${track.title} 的音乐封面`}
              />
            ) : (
              <b>NC</b>
            )}
            <i />
          </div>
        </div>
        <span className="record-arm" aria-hidden="true" />
        <small>ARKNIGHTS / FRONTIER RECORDS</small>
      </div>
      <div className="record-caption">
        <small>
          TRACK {String(index + 1).padStart(2, "0")} /{" "}
          {String(tracks.length).padStart(2, "0")}
        </small>
        <h4 className="music-deck-title">{track.title}</h4>
      </div>
      <div className="music-transport" aria-label="背景音乐播放控制">
        <button
          className="secondary-button"
          aria-label="上一首"
          onClick={() => gameAudio.stepMusic(-1)}
        >
          ‹ 上一首
        </button>
        <button
          className="record-play"
          aria-label={prefs.music ? "暂停背景音乐" : "播放背景音乐"}
          onClick={() => {
            void gameAudio.unlock();
            gameAudio.update({ music: !prefs.music });
          }}
        >
          {prefs.music ? "Ⅱ" : "▶"}
        </button>
        <button
          className="secondary-button"
          aria-label="下一首"
          onClick={() => gameAudio.stepMusic(1)}
        >
          下一首 ›
        </button>
      </div>
      <span className="music-status" role="status">
        {!prefs.music
          ? "唱针已抬起"
          : prefs.muted
            ? "已静音"
            : playback === "playing"
              ? "正在播放"
              : playback === "loading"
                ? "正在载入…"
                : playback === "error"
                  ? "播放受阻"
                  : "已暂停"}
      </span>
      <details className="music-catalog">
        <summary>浏览唱片 · {tracks.length} 首</summary>
        <label className="audio-track">
          播放曲目
          <select
            value={track.id}
            onChange={(event) =>
              gameAudio.update({ track: event.target.value })
            }
          >
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.title}
              </option>
            ))}
          </select>
        </label>
      </details>
    </div>
  );
}
