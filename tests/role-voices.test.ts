import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readVoiceCatalog,
  VOICED_ROLES,
  VOICE_CUES,
  VOICE_LANGUAGES,
} from "../apps/web/src/voice-catalog.ts";
import { voicesForTransition } from "../apps/web/src/role-voices.ts";
import {
  createGame,
  applyCommand,
  projectView,
} from "../packages/rules/src/engine.ts";
import { ROLE_BY_ID } from "../packages/rules/src/data.ts";
import { ORIPATHY_OPERATIVES } from "../packages/rules/src/oripathy-data.ts";
import { createPractice, practiceView } from "../apps/web/src/practice.ts";

describe("感染者语音与索引", () => {
  it("完整加载 276 段，不截断排在 200 段之后的角色与日语", () => {
    const catalog = JSON.parse(
      readFileSync("apps/web/public/audio/voices.json", "utf8"),
    );
    const clips = readVoiceCatalog(catalog);
    expect(clips).toHaveLength(276);
    for (const role of VOICED_ROLES)
      for (const language of VOICE_LANGUAGES)
        for (const cue of VOICE_CUES)
          expect(clips).toContainEqual({
            roleId: role.id,
            language,
            cue,
            src: `/audio/voices/${language}/${role.id}/${cue}.mp3`,
          });
    expect(clips).toContainEqual(catalog.voices.at(-1));
    expect(VOICED_ROLES.map((r) => r.id)).not.toEqual(
      expect.arrayContaining(["o-flow-a", "o-flow-b", "o-flow-c", "cannott"]),
    );
  });
  it("索引拒绝外链、错配语句、重复条目和冒用声线的召唤物", () => {
    const good = {
      roleId: "o-amiya",
      language: "zh",
      cue: "battle-1",
      src: "/audio/voices/zh/o-amiya/battle-1.mp3",
    };
    expect(
      readVoiceCatalog({
        voices: [
          null,
          {},
          good,
          good,
          { ...good, src: "https://outside.example/a.mp3" },
          { ...good, roleId: "o-flow-a" },
          { ...good, cue: "select-1" },
        ],
      }),
    ).toEqual([good]);
    expect(readVoiceCatalog(null)).toEqual([]);
  });
  it.each(ORIPATHY_OPERATIVES)(
    "$name 的公开能力按策略、计谋执行顺序播放，卡牌转移后仍有语音",
    (role) => {
      const before = practiceView(createPractice(0));
      const next = structuredClone(before);
      next.revision++;
      const p = next.players[0];
      p.selected = null;
      p.revealed = false;
      next.log.push({
        seq: (next.log.at(-1)?.seq ?? 0) + 1,
        actor: p.id,
        round: next.round,
        text: `使用 ${role.name} · 计谋后策略`,
      });
      expect(voicesForTransition(before, next)).toEqual([
        { roleId: role.id, kind: "tactic" },
        { roleId: role.id, kind: "strategy" },
      ]);
      expect(voicesForTransition(next, structuredClone(next))).toEqual([]);
    },
  );
  it.each(["hand", "discard"] as const)(
    "赫拉格从 %s 重新盖牌：只在盖牌者设备播放新角色的选中语音",
    (source) => {
      let game = createGame(
        [
          { id: "p0", name: "甲" },
          { id: "p1", name: "乙" },
        ],
        { oripathy: true, seed: 42 },
      );
      for (let i = 0; game.phase !== "actions"; i++) {
        expect(i).toBeLessThan(250);
        game = applyCommand(game, game.decision!.playerId, {
          type: "choose",
          optionId: game.decision!.options[0].id,
        });
      }
      const p = game.players[0];
      p.selected = "o-hellagur";
      p.hand = source === "hand" ? ["o-silence"] : [];
      p.discard = source === "discard" ? ["o-silence"] : [];
      game.queue = [];
      game.decision = {
        playerId: p.id,
        kind: "fixture",
        title: "准备赫拉格盖牌",
        options: [
          {
            id: "go",
            label: "准备",
            steps: [{ kind: "o:hellagur-cover", actor: p.id }],
          },
        ],
      };
      game = applyCommand(game, p.id, { type: "choose", optionId: "go" });
      const before = game.players.map((p) => projectView(game, p.id));
      game = applyCommand(game, p.id, {
        type: "choose",
        optionId: "o-silence",
      });
      const next = game.players.map((p) => projectView(game, p.id));
      expect(voicesForTransition(before[0], next[0])).toEqual([
        { roleId: "o-silence", kind: "cover" },
      ]);
      expect(voicesForTransition(before[1], next[1])).toEqual([]);
      expect(next[1].players[0].selected).toBeNull();
      expect(next[1].log.at(-1)?.text).not.toBe(ROLE_BY_ID["o-silence"].name);
      expect(voicesForTransition(next[0], structuredClone(next[0]))).toEqual(
        [],
      );
    },
  );
});
