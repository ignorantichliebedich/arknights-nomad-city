import { useRef, useState, type FormEvent } from "react";
import {
  feedbackKinds,
  feedbackLimit,
  type FeedbackKind,
} from "../../../../packages/shared/feedback.ts";
import { LobbyError, lobbyRequest } from "../lobby-api.ts";
import { Modal } from "./Modal.tsx";

const prompts: Record<FeedbackKind, string> = {
  suggestion: "你想改动棋桌上的哪一处？希望它怎样运作？",
  bug: "你在哪一步遇到了问题？当时看到什么，原本预期是什么？",
  idea: "给你的点子起个名字，写下玩法，以及玩家会怎样用到它。",
};
const diyGuide =
  "https://github.com/ignorantichliebedich/arknights-nomad-city/blob/codex/oripathy-evidence/docs/diy.md";

export function FeedbackDesk({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>("suggestion");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const requestId = useRef("");
  const sending = useRef(false);

  function edited() {
    requestId.current = "";
    setReceipt("");
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !message.trim()) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      // Preserve the same envelope number when a response is lost. Also works on LAN HTTP.
      requestId.current ||= Array.from(
        crypto.getRandomValues(new Uint8Array(16)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      const response = await lobbyRequest<{ id: string }>("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId.current,
          kind,
          message: message.trim(),
        }),
      });
      if (response.id !== requestId.current) throw new Error("Invalid receipt");
      setReceipt(response.id.slice(0, 8).toUpperCase());
      setMessage("");
      requestId.current = "";
    } catch (cause) {
      setError(
        cause instanceof LobbyError
          ? cause.message
          : "未收到回执，来信仍在这里，可以重新投递。",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <Modal title="拓荒信箱" className="feedback-window" onClose={onClose}>
      <div className="feedback-address">
        <small>收件人</small>
        <strong>游城拓荒制作组</strong>
      </div>
      <form className="feedback-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>来信类别</legend>
          <div className="feedback-kinds">
            {(Object.keys(feedbackKinds) as FeedbackKind[]).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="feedback-kind"
                  checked={kind === value}
                  onChange={() => {
                    edited();
                    setKind(value);
                  }}
                />
                <span>{feedbackKinds[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="feedback-caption">
          <label htmlFor="feedback-body">来信正文</label>
          <small>
            {message.length} / {feedbackLimit}
          </small>
        </div>
        <textarea
          id="feedback-body"
          rows={5}
          maxLength={feedbackLimit}
          required
          value={message}
          disabled={busy}
          placeholder={prompts[kind]}
          onChange={(event) => {
            edited();
            setMessage(event.target.value);
          }}
        />
        <div role="status" className="feedback-receipt">
          {receipt && `来信已收妥 · 回执 ${receipt}`}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="feedback-actions">
          <a href={diyGuide} target="_blank" rel="noreferrer">
            GitHub DIY 开发指南 ↗
          </a>
          <button type="submit" disabled={busy || !message.trim()}>
            {busy ? "投递中…" : "投递来信"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
