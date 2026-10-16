import type { CSSProperties } from "react";
import { useSceneCurtain } from "../useSceneCurtain.ts";

export type PracticeScene = {
  key: string;
  kind: "practice-enter" | "practice-exit";
  lesson: string;
  returning: string;
};

export function PracticeCurtain({
  scene,
  onDone,
}: {
  scene: PracticeScene;
  onDone: () => void;
}) {
  const entering = scene.kind === "practice-enter";
  const duration = entering ? 1350 : 1100;
  const ref = useSceneCurtain(
    onDone,
    duration,
    entering
      ? ".practice-guide-heading"
      : ".shortcut-practice, .topbar .guide-entry",
  );
  return (
    <dialog
      ref={ref}
      className={`scene-transition practice-curtain ${scene.kind}`}
      style={{ "--practice-cut-ms": `${duration}ms` } as CSSProperties}
      aria-labelledby="practice-cut-heading"
      onCancel={(event) => {
        event.preventDefault();
        onDone();
      }}
    >
      <div className="practice-cut-rails" aria-hidden="true">
        <span>COLUMBIA / DISTRICT 105</span>
        <span>FIELD TRAINING</span>
      </div>
      <div className="practice-cut-band" aria-hidden="true" />
      <div className="practice-cut-sheet">
        <div className="practice-cut-registration" aria-hidden="true">
          <span>拓荒发展运动</span>
          <span>105 / TRAINING DIVISION</span>
        </div>
        <div className="practice-cut-city" aria-hidden="true">
          <i />
          <img src="/assets/city-model-0.svg" alt="" />
          <span className="practice-cut-stamp">
            {entering ? "实操许可" : "记录封存"}
          </span>
        </div>
        <span className="practice-cut-eyebrow" aria-hidden="true">
          {entering ? "LEARN BY EXPLORING" : "UNTIL THE NEXT EXPEDITION"}
        </span>
        <h2 id="practice-cut-heading">{entering ? "实操推演" : "演习收卷"}</h2>
        <p>{entering ? scene.lesson : `练习进度已保存 · ${scene.returning}`}</p>
        <div className="practice-cut-route" aria-hidden="true">
          <span>启程</span>
          <i />
          <span>亲自落子</span>
        </div>
        <span className="practice-cut-corner" aria-hidden="true" />
      </div>
      <button className="scene-skip" onClick={onDone}>
        跳过动画 <span>Esc</span>
      </button>
    </dialog>
  );
}
