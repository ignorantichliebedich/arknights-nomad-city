import { useEffect, useRef, useState } from "react";
import { gameAudio } from "../audio.ts";
import { displaySnapshot, enterGameFullscreen } from "../display-mode.ts";
export const FULLSCREEN_PROMPT_KEY = "nomad:fullscreen-prompt:1";
export function shouldOfferFullscreen() {
  if (displaySnapshot().fullscreen) return false;
  try {
    return !sessionStorage.getItem(FULLSCREEN_PROMPT_KEY);
  } catch {
    return true;
  }
}

export function FullscreenWelcome({
  phone,
  onDone,
  failedCount,
  onRetry,
}: {
  phone: boolean;
  onDone: () => void;
  failedCount: number;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const finishing = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  function close() {
    if (finishing.current) return;
    finishing.current = true;
    void gameAudio.unlock().then(() => gameAudio.play("confirm"));
    try {
      sessionStorage.setItem(FULLSCREEN_PROMPT_KEY, "1");
    } catch {
      /* This visit can proceed. */
    }
    onDone();
  }
  async function fullscreen() {
    if (busy || finishing.current) return;
    void gameAudio.unlock();
    setBusy(true);
    try {
      await enterGameFullscreen();
      close();
    } catch {
      setError("浏览器暂时无法进入全屏。选择窗口进入即可继续。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="fullscreen-welcome boot-welcome"
      aria-labelledby="fullscreen-welcome-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <span className="eyebrow">THE FRONTIER AWAITS</span>
      <h2 id="fullscreen-welcome-title">全屏体验更佳</h2>
      <p>
        {phone
          ? "展开横屏棋桌，启程前往荒野。"
          : "展开地图与手牌，和朋友共赴下一片荒野。"}
      </p>
      <small>
        {phone
          ? "全屏后尝试横屏，也可以横放手机游玩。"
          : "随时按 Esc 退出全屏。"}
      </small>
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
          窗口进入
        </button>
        <button
          className="primary-button"
          onClick={() => void fullscreen()}
          disabled={busy}
        >
          {busy ? "正在展开…" : "全屏体验"} ↗
        </button>
      </div>
      {failedCount > 0 && (
        <button
          className="subtle-button boot-retry"
          disabled={busy}
          onClick={onRetry}
        >
          重试 {failedCount} 项图片 ↻
        </button>
      )}
    </dialog>
  );
}
