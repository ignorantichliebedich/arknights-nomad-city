import { useEffect, useRef, useState } from "react";
import { chooseBotCommand } from "../../../packages/rules/src/bot.ts";
import { projectView } from "../../../packages/rules/src/engine.ts";
import type { Command } from "../../../packages/rules/src/types.ts";
import type { RoomView } from "./network.ts";
import {
  applyPractice,
  COACH,
  createPractice,
  LEARNER,
  lessonComplete,
  PRACTICE_KEY,
  PRACTICE_LESSONS,
  practiceView,
  restorePractice,
  type PracticeSnapshot,
} from "./practice.ts";

function savedPractice() {
  try {
    return restorePractice(localStorage.getItem(PRACTICE_KEY));
  } catch {
    return null;
  }
}
export function usePractice() {
  const [active, setActive] = useState(() => location.hash === "#practice");
  const [snapshot, setSnapshot] = useState(
    () => savedPractice() ?? createPractice(),
  );
  const snapshotRef = useRef(snapshot);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const update = (next: PracticeSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  };
  const complete = lessonComplete(snapshot);
  useEffect(() => {
    const followHash = () => setActive(location.hash === "#practice");
    window.addEventListener("hashchange", followHash);
    window.addEventListener("popstate", followHash);
    return () => {
      window.removeEventListener("hashchange", followHash);
      window.removeEventListener("popstate", followHash);
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    try {
      localStorage.setItem(PRACTICE_KEY, JSON.stringify(snapshot));
    } catch {
      setError("浏览器未能保存练习进度，请保持本页以继续练习。");
    }
  }, [active, snapshot]);
  useEffect(() => {
    if (
      !active ||
      complete ||
      !projectView(snapshot.game, COACH).actions.length
    )
      return;
    const timer = setTimeout(() => {
      try {
        const current = snapshotRef.current;
        const command = chooseBotCommand(projectView(current.game, COACH));
        if (command && !lessonComplete(current))
          update(applyPractice(current, COACH, command));
      } catch (e) {
        setError(e instanceof Error ? e.message : "练习操作失败");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [active, complete, snapshot.game.revision, snapshot.lesson]);
  const room: RoomView = {
    id: "PRACTICE",
    hostId: LEARNER,
    me: LEARNER,
    revision: snapshot.game.revision,
    expansion: false,
    phase: snapshot.game.phase,
    rulesVersion: snapshot.game.rulesVersion,
    seats: [
      { id: LEARNER, name: "你 · 拓荒学员", ready: true, connected: true },
      { id: COACH, name: "人机教练", bot: true, ready: true, connected: true },
    ],
    game: practiceView(snapshot),
  };
  return {
    active,
    attempt,
    snapshot,
    complete,
    start: () => {
      setActive(true);
      setError("");
      history.pushState(
        {},
        "",
        `${location.pathname}${location.search}#practice`,
      );
    },
    exit: () => {
      setActive(false);
      history.replaceState({}, "", `${location.pathname}${location.search}`);
    },
    restart: () => {
      setAttempt((n) => n + 1);
      update(
        createPractice(
          snapshot.lesson,
          snapshot.completed.filter((i) => i !== snapshot.lesson),
        ),
      );
      setError("");
    },
    next: () => {
      if (complete && snapshot.lesson + 1 < PRACTICE_LESSONS.length) {
        update(createPractice(snapshot.lesson + 1, snapshot.completed));
        setError("");
      }
    },
    replay: (lesson: number) => {
      setAttempt((n) => n + 1);
      update(
        createPractice(
          lesson,
          snapshot.completed.filter((i) => i !== lesson),
        ),
      );
      setError("");
    },
    net: {
      room,
      status: "online" as const,
      busy: false,
      error,
      clearError: () => setError(""),
      send: (type: string, extra: Record<string, unknown> = {}) => {
        try {
          if (type !== "command")
            throw new Error("练习桌使用本地场景，无需房间操作。");
          update(
            applyPractice(
              snapshotRef.current,
              LEARNER,
              extra.command as Command,
            ),
          );
          setError("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "练习操作失败");
        }
      },
    },
  };
}
