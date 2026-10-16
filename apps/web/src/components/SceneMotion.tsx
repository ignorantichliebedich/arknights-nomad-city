import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import type { RoomView } from "../network.ts";
import { useSceneCurtain } from "../useSceneCurtain.ts";
import { PracticeCurtain, type PracticeScene } from "./PracticeCurtain.tsx";

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
  practice,
  lesson,
}: {
  room: RoomView | null;
  entered: boolean;
  practice: boolean;
  lesson: string;
}) {
  const previous = useRef<{ stage: string; practice: boolean } | null>(null);
  const [scene, setScene] = useState<Scene | PracticeScene | null>(null);
  const stage = !entered
    ? "entry"
    : !room
      ? "connecting"
      : `${room.id}:${room.game ? "game" : "room"}`;
  useLayoutEffect(() => {
    const old = previous.current;
    if (stage === "connecting" && !practice && !old?.practice) {
      // Remember the initial page so practice can start while a room reconnects.
      previous.current ??= { stage, practice };
      return;
    }
    previous.current = { stage, practice };
    if (old && old.practice !== practice) {
      const kind = practice ? "practice-enter" : "practice-exit";
      setScene({
        key: kind,
        kind,
        lesson,
        returning: entered ? "返回原拓荒区" : "返回启程首页",
      });
      return;
    }
    // Track the live room behind the practice table without playing a second cut.
    if (practice) return;
    if (!room || !entered) {
      setScene(null);
      return;
    }
    // Actual server state drives the cut. Refreshes/reconnects do not replay it.
    if (old && old.stage !== stage && old.stage !== "connecting")
      setScene((current) =>
        current && !("room" in current)
          ? current
          : { key: stage, kind: room.game ? "game" : "room", room },
      );
  }, [stage, entered, practice, lesson]);
  return scene ? (
    "room" in scene ? (
      <SceneCurtain
        key={scene.key}
        scene={scene}
        onDone={() => setScene(null)}
      />
    ) : (
      <PracticeCurtain
        key={scene.key}
        scene={scene}
        onDone={() => setScene(null)}
      />
    )
  ) : null;
}

function SceneCurtain({ scene, onDone }: { scene: Scene; onDone: () => void }) {
  const ref = useSceneCurtain(onDone, scene.kind === "game" ? 1350 : 1000);
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
