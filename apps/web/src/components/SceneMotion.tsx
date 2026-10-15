import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { RoomView } from "../network.ts";

const pressed = new WeakMap<HTMLElement, Animation>();
export function buttonFeedback(event: MouseEvent<HTMLElement>) {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    "button.primary-button, button.secondary-button, button.subtle-button, button.fan-toggle, .map-dock button, .guide-mode-tabs button, .lesson-index button, .guide-categories button",
  );
  if (
    !button ||
    button.disabled ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  pressed.get(button)?.cancel();
  const motion = button.animate(
    [
      { scale: "0.965", filter: "brightness(1.15)" },
      { scale: "1.018", filter: "brightness(1.05)", offset: 0.6 },
      { scale: "1", filter: "brightness(1)" },
    ],
    { duration: 260, easing: "cubic-bezier(.2,.7,.3,1)" },
  );
  motion.id = "nomad-button-press";
  pressed.set(button, motion);
}

type Scene = { key: string; kind: "room" | "game"; room: RoomView };
export function SceneMotion({
  room,
  entered,
}: {
  room: RoomView | null;
  entered: boolean;
}) {
  const previous = useRef<string | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const stage = !entered
    ? "entry"
    : !room
      ? "connecting"
      : `${room.id}:${room.game ? "game" : "room"}`;
  useEffect(() => {
    if (stage === "connecting") return;
    const old = previous.current;
    previous.current = stage;
    if (!room || !entered) {
      setScene(null);
      return;
    }
    // Actual server state drives the cut. Refreshes/reconnects do not replay it.
    if (old && old !== stage)
      setScene({ key: stage, kind: room.game ? "game" : "room", room });
  }, [stage, entered]);
  return scene ? (
    <SceneCurtain key={scene.key} scene={scene} onDone={() => setScene(null)} />
  ) : null;
}

function SceneCurtain({ scene, onDone }: { scene: Scene; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement;
    dialog.showModal();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const timer = setTimeout(
      () => done.current(),
      reduced.matches ? 160 : scene.kind === "game" ? 1350 : 1000,
    );
    const shorten = () => {
      if (reduced.matches) done.current();
    };
    reduced.addEventListener("change", shorten);
    return () => {
      clearTimeout(timer);
      reduced.removeEventListener("change", shorten);
      dialog.close();
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        opener !== document.body
      )
        opener.focus({ preventScroll: true });
    };
  }, []);
  const mine = Math.max(
    0,
    scene.room.seats.findIndex((s) => s.id === scene.room.me),
  );
  return (
    <dialog
      ref={ref}
      className={`scene-transition scene-${scene.kind}`}
      aria-labelledby="scene-heading"
      onCancel={(e) => {
        e.preventDefault();
        onDone();
      }}
    >
      <div className="scene-shutter shutter-top" aria-hidden="true" />
      <div className="scene-shutter shutter-bottom" aria-hidden="true" />
      <div className="scene-arrival">
        <span className="eyebrow">NOMAD CITY / DISTRICT 105</span>
        <div className="scene-city" aria-hidden="true">
          <i />
          <img src={`/assets/city-model-${mine}.svg`} alt="" />
        </div>
        <h2 id="scene-heading">
          {scene.kind === "game" ? "移动城市，启程。" : "欢迎入座，企业家。"}
        </h2>
        <p>
          {scene.kind === "game"
            ? "全员就绪 · 进入开局部署"
            : `拓荒区 ${scene.room.id} · 席位已确认`}
        </p>
        <div className="scene-party" aria-hidden="true">
          {scene.room.seats.map((seat, i) => (
            <img
              key={seat.id}
              src={`/assets/avatar-${i}.webp?v=founders`}
              alt=""
            />
          ))}
        </div>
        <div className="scene-travel-line" aria-hidden="true">
          <i />
        </div>
      </div>
      <button className="scene-skip" onClick={onDone}>
        跳过动画 <span>Esc</span>
      </button>
    </dialog>
  );
}
