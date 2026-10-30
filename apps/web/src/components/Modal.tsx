import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { gameAudio } from "../audio.ts";

export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    void gameAudio.play("open");
    const opener = document.activeElement;
    const parentDialog = opener?.closest("dialog");
    const position = parentDialog && {
      top: parentDialog.scrollTop,
      left: parentDialog.scrollLeft,
    };
    dialog?.showModal();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
      if (parentDialog?.isConnected && position)
        parentDialog.scrollTo(position);
    };
  }, []);
  function back() {
    if (closeTimer.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      closeAction.current();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(() => closeAction.current(), 160);
  }
  return (
    <dialog
      ref={ref}
      className={`modal ${className || "dossier-window"}`}
      aria-labelledby={headingId}
      data-window-motion={closing ? "leave" : "enter"}
      onCancel={(event) => {
        event.preventDefault();
        back();
      }}
      onClick={(event) => {
        if (event.target !== ref.current) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          back();
      }}
    >
      <div className="modal-heading">
        <button className="modal-back" onClick={back} aria-label="返回上一级">
          ← <span>返回</span>
        </button>
        <h2 id={headingId}>{title}</h2>
        <button className="icon-button" onClick={back} aria-label="关闭弹窗">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
