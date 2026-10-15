import { useEffect, useState, useSyncExternalStore } from "react";
import { gameAudio } from "../audio.ts";
import type { MusicTrack } from "../audio-config.ts";
import { MusicDeck } from "./MusicDeck.tsx";
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
      <section className="audio-channel effects-channel">
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
      <section className="audio-channel music-channel">
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
            <MusicDeck tracks={tracks} prefs={prefs} playback={playback} />
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
      <section className="audio-channel voice-channel">
        <div>
          <label className="audio-switch">
            <input
              type="checkbox"
              checked={prefs.voices}
              onChange={(event) =>
                gameAudio.update({ voices: event.target.checked })
              }
            />
            <strong>角色语音</strong>
          </label>
          <small>中 / 日双语</small>
        </div>
        <label className="audio-track">
          语音语言
          <select
            value={prefs.voiceLanguage}
            onChange={(event) =>
              gameAudio.update({
                voiceLanguage: event.target.value === "ja" ? "ja" : "zh",
              })
            }
          >
            <option value="zh">中文 · 普通话</option>
            <option value="ja">日本語 · 日语</option>
          </select>
        </label>
        <label className="audio-slider">
          <span>
            语音音量 <b>{Math.round(prefs.voiceVolume * 100)}%</b>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            disabled={!prefs.voices}
            value={Math.round(prefs.voiceVolume * 100)}
            onChange={(event) =>
              gameAudio.update({
                voiceVolume: Number(event.target.value) / 100,
              })
            }
          />
        </label>
        <p>盖放时回应选中，策略与计谋使用对应作战语音。坎诺特使用交易音效。</p>
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
