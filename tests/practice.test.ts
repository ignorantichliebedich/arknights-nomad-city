import { describe, expect, it } from "vitest";
import { applyCommand, projectView } from "../packages/rules/src/engine.ts";
import { chooseBotAction } from "../packages/rules/src/bot.ts";
import {
  applyPractice,
  COACH,
  createPractice,
  LEARNER,
  lessonComplete,
  PRACTICE_LESSONS,
  practiceView,
  restorePractice,
} from "../apps/web/src/practice.ts";

describe("实操教程使用正式规则与独立场景", () => {
  it.each(
    PRACTICE_LESSONS.map((item, lesson) => ({ title: item.title, lesson })),
  )("$title：完成实际操作，逐步结算与正式规则一致", ({ lesson }) => {
    let snapshot = createPractice(lesson);
    const opening = snapshot.game.players[0].wallet;
    for (let step = 0; !lessonComplete(snapshot); step++) {
      expect(step, snapshot.game.decision?.title).toBeLessThan(80);
      const human = practiceView(snapshot);
      const actor = human.actions.length ? LEARNER : COACH;
      const view =
        actor === LEARNER ? human : projectView(snapshot.game, COACH);
      const action = chooseBotAction(view)!;
      expect(action).toBeDefined();
      const expected = applyCommand(snapshot.game, actor, action.command);
      snapshot = applyPractice(snapshot, actor, action.command);
      expect(snapshot.game).toEqual(expected);
      snapshot = restorePractice(JSON.stringify(snapshot))!;
      expect(snapshot).not.toBeNull();
    }
    expect(snapshot.completed).toContain(lesson);
    expect(practiceView(snapshot).actions).toEqual([]);
    expect(practiceView(snapshot).decision).toBeNull();
    if (lesson === 2)
      expect(snapshot.game.players[0].wallet.ore).toBe(opening.ore - 3);
    if (lesson === 4)
      expect(
        Object.keys(snapshot.game.players[0].built).length,
      ).toBeGreaterThan(1);
    if (lesson === 6)
      expect(snapshot.game.players[0].wallet.rock).toBeGreaterThan(
        opening.rock,
      );
  });
  it("课程目标以外的指令被拒绝，序列化恢复不混入真实席位", () => {
    const snapshot = createPractice(1);
    expect(() =>
      applyPractice(snapshot, LEARNER, { type: "role", mode: "strategy" }),
    ).toThrow("本课提示");
    expect(snapshot.game.mainDone).toBe(false);
    expect(restorePractice("not json")).toBeNull();
    const invalid = structuredClone(snapshot);
    invalid.game.players[0].id = "real-player";
    expect(restorePractice(JSON.stringify(invalid))).toBeNull();
  });
});
