import { useState } from "react";
import { RESOURCE_NAMES } from "../../../../packages/rules/src/data.ts";
import type { Resource } from "../../../../packages/rules/src/types.ts";
import { PRACTICE_LESSONS } from "../practice.ts";
import type { usePractice } from "../usePractice.ts";

export function PracticeGuide({
  practice,
}: {
  practice: ReturnType<typeof usePractice>;
}) {
  const [expanded, setExpanded] = useState(true);
  const { snapshot, complete } = practice;
  const lesson = PRACTICE_LESSONS[snapshot.lesson];
  const kind = snapshot.game.decision?.kind;
  const goal =
    kind === "place" && lesson.key === "city"
      ? "城市已抵达。点击出发或到达资源点的空格，再确认放置一枚影响力。"
      : kind === "place" && lesson.key === "explore"
        ? "在刚探索的资源点放置影响力，确认后完成这次探索。"
        : kind === "event" && lesson.key === "explore"
          ? "阅读事件卡，点选一项结果，再确认结算。"
          : kind === "toll" && lesson.key === "harvest"
            ? "选择收取路费的玩家，再确认。所有玩家完成后统一结算。"
            : kind === "least" && lesson.key === "ability"
              ? "选择本次补给的资源，确认领取。"
              : lesson.key === "build" && kind && kind !== "build"
                ? "设施已落位。按牌面完成接下来的入场效果，结算完后进入下一课。"
                : lesson.goal;
  const final = complete && snapshot.lesson === PRACTICE_LESSONS.length - 1;
  const deltas = (Object.keys(RESOURCE_NAMES) as Resource[]).flatMap(
    (resource) => {
      const delta =
        snapshot.game.players[0].wallet[resource] -
        snapshot.openingWallet[resource];
      return delta
        ? [`${RESOURCE_NAMES[resource]} ${delta > 0 ? "+" : ""}${delta}`]
        : [];
    },
  );
  return (
    <aside
      className={`practice-guide ${complete ? "is-complete" : ""}`}
      aria-label="实操教程任务"
    >
      <button
        className="practice-guide-heading"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>
          实操 {snapshot.lesson + 1} / {PRACTICE_LESSONS.length}
        </span>
        <strong>{final ? "完成拓荒入门" : lesson.title}</strong>
        <i aria-hidden="true">{expanded ? "−" : "＋"}</i>
      </button>
      {expanded && (
        <div className="practice-guide-body">
          <div className="practice-progress" aria-label="课程完成进度">
            {PRACTICE_LESSONS.map((item, i) => (
              <span
                key={item.key}
                className={`${snapshot.completed.includes(i) ? "done" : ""} ${snapshot.lesson === i ? "current" : ""}`}
                title={item.title}
              >
                {snapshot.completed.includes(i) ? "✓" : i + 1}
              </span>
            ))}
          </div>
          <p className="practice-goal" aria-live="polite">
            {complete
              ? final
                ? "七项实操已完成，可以进入人机房间独立玩一局。"
                : "本课完成，操作结果已按正式规则结算。"
              : goal}
          </p>
          <p>
            {complete ? deltas.join(" · ") || "棋盘与标记已更新" : lesson.tip}
          </p>
          <small>每课准备独立练习场景 · 本机自动保存</small>
          <div className="practice-guide-actions">
            <button className="secondary-button" onClick={practice.restart}>
              重练本课
            </button>
            {complete && !final && (
              <button className="primary-button" onClick={practice.next}>
                下一课 →
              </button>
            )}
            {final && (
              <button className="primary-button" onClick={practice.exit}>
                退出练习 →
              </button>
            )}
          </div>
          {final && (
            <div className="practice-replay">
              {PRACTICE_LESSONS.map((item, i) => (
                <button key={item.key} onClick={() => practice.replay(i)}>
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
