import { useEffect, useState, useSyncExternalStore } from "react";
import { gameAudio } from "../audio.ts";
import type { MusicTrack } from "../audio-config.ts";
export function AudioSettings() {
  const prefs = useSyncExternalStore(gameAudio.subscribe, gameAudio.snapshot);
  const playback = useSyncExternalStore(
    gameAudio.subscribe,
    gameAudio.musicSnapshot,
  );
  const [tracks, setTracks] = useState<MusicTrack[]>(gameAudio.musicTracks());
  useEffect(() => {
    let live = true;
    void gameAudio.loadMusic().then(() => {
      if (live) setTracks([...gameAudio.musicTracks()]);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="audio-settings">
      <div className="audio-heading">
        <span className="eyebrow">SOUND / PREFERENCES</span>
        <h3>为你的拓荒调音</h3>
        <p>行动的回响，与荒野同行的旋律。</p>
      </div>
      <button
        className={"audio-master " + (prefs.muted ? "is-muted" : "")}
        aria-pressed={prefs.muted}
        onClick={() => {
          gameAudio.update({ muted: !prefs.muted });
          if (prefs.muted) void gameAudio.play("confirm");
        }}
        data-sound="none"
      >
        <span aria-hidden="true">{prefs.muted ? "◌" : "◖"}</span>
        <span>
          <strong>{prefs.muted ? "已静音" : "声音已开启"}</strong>
          <small>一键控制所有音效与音乐</small>
        </span>
        <b>{prefs.muted ? "开启声音" : "全部静音"}</b>
      </button>
      <label className="audio-slider">
        <span>
          总音量 <b>{Math.round(prefs.volume * 100)}%</b>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(prefs.volume * 100)}
          onChange={(event) =>
            gameAudio.update({ volume: Number(event.target.value) / 100 })
          }
        />
      </label>
      <section className="audio-channel">
        <div>
          <label className="audio-switch">
            <input
              type="checkbox"
              checked={prefs.effects}
              onChange={(event) =>
                gameAudio.update({ effects: event.target.checked })
              }
            />
            <strong>操作音效</strong>
          </label>
          <button
            className="subtle-button"
            data-sound="none"
            disabled={!prefs.effects || prefs.muted}
            onClick={() => {
              void gameAudio.unlock().then(() => gameAudio.play("confirm"));
            }}
          >
            试听 ↗
          </button>
        </div>
        <p>点选、盖放、移动、建设、结算与你的回合。</p>
        <label className="audio-slider">
          <span>
            音效音量 <b>{Math.round(prefs.effectsVolume * 100)}%</b>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            disabled={!prefs.effects}
            value={Math.round(prefs.effectsVolume * 100)}
            onChange={(event) =>
              gameAudio.update({
                effectsVolume: Number(event.target.value) / 100,
              })
            }
          />
        </label>
      </section>
      <section className="audio-channel">
        <div>
          <label className="audio-switch">
            <input
              type="checkbox"
              checked={prefs.music}
              disabled={!tracks.length}
              onChange={(event) => {
                void gameAudio.unlock();
                gameAudio.update({ music: event.target.checked });
              }}
            />
            <strong>背景音乐</strong>
          </label>
          <small>
            {tracks.length ? tracks.length + " 首曲目" : "暂无曲目"}
          </small>
        </div>
        {tracks.length > 0 && (
          <>
            <label className="audio-track">
              播放曲目
              <select
                value={
                  tracks.some((track) => track.id === prefs.track)
                    ? prefs.track
                    : tracks[0].id
                }
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
            <div className="music-transport" aria-label="背景音乐播放控制">
              <button
                className="secondary-button"
                aria-label="上一首"
                onClick={() => gameAudio.stepMusic(-1)}
              >
                ‹ 上一首
              </button>
              <span role="status">
                {!prefs.music
                  ? "音乐已关闭"
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
              <button
                className="secondary-button"
                aria-label="下一首"
                onClick={() => gameAudio.stepMusic(1)}
              >
                下一首 ›
              </button>
            </div>
            <label className="audio-track">
              循环方式
              <select
                value={prefs.musicMode}
                onChange={(event) =>
                  gameAudio.update({
                    musicMode:
                      event.target.value === "repeat" ? "repeat" : "sequence",
                  })
                }
              >
                <option value="sequence">顺序循环 · 播完切换下一首</option>
                <option value="repeat">单曲循环 · 留在这段旋律</option>
              </select>
            </label>
            {prefs.music && playback === "error" && (
              <p className="music-error" role="alert">
                暂时无法播放，请重试或选择其他曲目。
                <button
                  className="subtle-button"
                  onClick={() => void gameAudio.retryMusic()}
                >
                  重试播放 ↗
                </button>
              </p>
            )}
          </>
        )}
        <label className="audio-slider">
          <span>
            音乐音量 <b>{Math.round(prefs.musicVolume * 100)}%</b>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            disabled={!tracks.length}
            value={Math.round(prefs.musicVolume * 100)}
            onChange={(event) =>
              gameAudio.update({
                musicVolume: Number(event.target.value) / 100,
              })
            }
          />
        </label>
      </section>
      <p className="audio-footnote">
        设置保存在这台设备。离开页面时，音乐会暂停。
        <span className="audio-version">
          游城拓荒 v{import.meta.env.VITE_APP_VERSION}
        </span>
      </p>
    </div>
  );
}
