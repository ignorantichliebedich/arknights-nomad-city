import { useEffect, useRef, useState } from "react";
import { gameAudio } from "../audio.ts";
export const FULLSCREEN_PROMPT_KEY = "nomad:fullscreen-prompt:1";
export function FullscreenWelcome() {
  const [open, setOpen] = useState(() => {
    try {
      return (
        !sessionStorage.getItem(FULLSCREEN_PROMPT_KEY) &&
        !document.fullscreenElement
      );
    } catch {
      return !document.fullscreenElement;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [open]);
  function close() {
    try {
      sessionStorage.setItem(FULLSCREEN_PROMPT_KEY, "1");
    } catch {
      /* This visit still proceeds. */
    }
    setOpen(false);
  }
  async function fullscreen() {
    void gameAudio.unlock();
    setBusy(true);
    try {
      if (!document.documentElement.requestFullscreen)
        throw new Error("unsupported");
      await document.documentElement.requestFullscreen();
      close();
    } catch {
      setError("浏览器暂时无法进入全屏。你可以取消提示，继续使用窗口模式。");
    } finally {
      setBusy(false);
    }
  }
  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      className="fullscreen-welcome"
      aria-labelledby="fullscreen-welcome-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="welcome-registration">
        <span>EXPEDITION PERMIT / 105</span>
        <span>启程须知</span>
      </div>
      <div className="welcome-scene" aria-hidden="true">
        <span className="welcome-viewfinder" />
        <img src="/assets/city-model-0.svg" alt="" />
        <span>THE FRONTIER AWAITS</span>
      </div>
      <div className="welcome-copy">
        <span className="eyebrow">展开你的拓荒桌</span>
        <h2 id="fullscreen-welcome-title">全屏体验更佳</h2>
        <p>让地图、手牌与城市完整铺开，和同行者一起探索荒野。</p>
        <small>随时按 Esc 退出全屏，也可以在棋桌上重新开启。</small>
      </div>
      {error && (
        <p className="welcome-error" role="status">
          {error}
        </p>
      )}
      <div className="welcome-actions">
        <button
          className="secondary-button"
          onClick={close}
          disabled={busy}
          autoFocus
        >
          取消
        </button>
        <button
          className="primary-button"
          onClick={() => void fullscreen()}
          disabled={busy}
        >
          {busy ? "正在展开…" : "全屏体验"} <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="welcome-footer">
        <i aria-hidden="true" />
        <span>一人一座城市，共赴下一片荒野。</span>
      </div>
    </dialog>
  );
}
