import { describe, expect, it } from "vitest";
import {
  audioPreferences,
  DEFAULT_AUDIO,
  musicTracks,
  adjacentTrack,
} from "../apps/web/src/audio-config.ts";
import { soundForTransition } from "../apps/web/src/components/GameSoundFeedback.tsx";
import { voicesForTransition } from "../apps/web/src/role-voices.ts";
import { roleCardBack } from "../apps/web/src/card-backs.ts";
import {
  createPractice,
  applyPractice,
  practiceView,
  LEARNER,
} from "../apps/web/src/practice.ts";
describe("声音偏好与曲目接口", () => {
  it("新访客默认播放 Speed of Light；保留明确关闭偏好，中日语音与卡背独立", () => {
    expect(audioPreferences({})).toMatchObject({
      music: true,
      track: "speed-of-light",
      voices: true,
      voiceLanguage: "zh",
    });
    expect(
      audioPreferences({ music: false, voiceLanguage: "ja" }),
    ).toMatchObject({ music: false, voiceLanguage: "ja" });
    expect(
      audioPreferences({ voiceLanguage: "x", voiceVolume: 9 }),
    ).toMatchObject({ voiceLanguage: "zh", voiceVolume: 1 });
    expect(
      new Set([0, 1, 2, 3].map((s) => roleCardBack(s, "texas"))).size,
    ).toBe(4);
    expect(roleCardBack(0, "w")).toBe(roleCardBack(3, "w"));
  });
  it("盖牌只在本人的私有视图播放；公开能力依据新增日志触发且重播视图静默", () => {
    const before = practiceView(createPractice(0)),
      next = structuredClone(before);
    next.revision++;
    const me = next.players.find((p) => p.id === next.me)!;
    me.selected = "texas";
    me.revealed = false;
    expect(voicesForTransition(before, next)).toEqual([
      { roleId: "texas", kind: "cover" },
    ]);
    const lastCover = structuredClone(next);
    lastCover.players.find((p) => p.id === lastCover.me)!.revealed = true;
    expect(voicesForTransition(before, lastCover)).toEqual([
      { roleId: "texas", kind: "cover" },
    ]);
    const stranger = structuredClone(before);
    stranger.revision++;
    stranger.players.find((p) => p.id !== next.me)!.selected = "w";
    expect(voicesForTransition(before, stranger)).toEqual([]);
    const active = structuredClone(next);
    active.revision++;
    active.players.find((p) => p.id === next.me)!.revealed = true;
    active.log.push({
      seq: (next.log.at(-1)?.seq ?? 0) + 1,
      actor: next.me,
      text: "使用 德克萨斯 · 计谋后策略",
      round: active.round,
    });
    expect(voicesForTransition(next, active)).toEqual([
      { roleId: "texas", kind: "tactic" },
      { roleId: "texas", kind: "strategy" },
    ]);
    expect(voicesForTransition(active, structuredClone(active))).toEqual([]);
    expect(voicesForTransition({ ...next, me: "other" }, active)).toEqual([]);
  });
  it("顺序播放在末尾回到第一首，上一首可从开头回到末尾", () => {
    const tracks = [
      { id: "a", title: "A", src: "/audio/music/a.mp3" },
      { id: "b", title: "B", src: "/audio/music/b.mp3" },
    ];
    expect(adjacentTrack(tracks, "b", 1)?.id).toBe("a");
    expect(adjacentTrack(tracks, "a", -1)?.id).toBe("b");
    expect(adjacentTrack(tracks, "removed", 1)?.id).toBe("b");
    expect(adjacentTrack([], "a", 1)).toBeUndefined();
    expect(
      audioPreferences({ musicMode: "repeat", music: false }).musicMode,
    ).toBe("repeat");
    expect(audioPreferences({ musicMode: "invalid" }).musicMode).toBe(
      "sequence",
    );
  });
  it("损坏偏好回退，音量受限，字符串不能改变开关", () => {
    expect(audioPreferences(null)).toEqual(DEFAULT_AUDIO);
    expect(
      audioPreferences({
        volume: Infinity,
        effectsVolume: -2,
        musicVolume: 3,
        muted: "false",
        effects: false,
        track: "javascript:bad",
      }),
    ).toEqual({
      ...DEFAULT_AUDIO,
      effects: false,
      effectsVolume: 0,
      musicVolume: 1,
    });
  });
  it("曲目仅接受同源音乐目录，去重并排除越界和脚本地址", () => {
    const origin = "https://friends.example";
    expect(
      musicTracks(
        {
          tracks: [
            { id: "nomad", title: "  荒野  ", src: "/audio/music/nomad.mp3" },
            { id: "nomad", title: "重复", src: "/audio/music/duplicate.mp3" },
            {
              id: "outside",
              title: "外站",
              src: "https://attacker.example/audio/music/a.mp3",
            },
            { id: "path", title: "越界", src: "/audio/music/../sfx/click.mp3" },
            { id: "script", title: "脚本", src: "javascript:alert(1)" },
            {
              id: "token",
              title: "参数",
              src: "/audio/music/song.mp3?token=secret",
            },
          ],
        },
        origin,
      ),
    ).toEqual([{ id: "nomad", title: "荒野", src: "/audio/music/nomad.mp3" }]);
  });
  it("真实部署仅在确认落子后产生放置回响，重复视图静默", () => {
    let snapshot = createPractice(1);
    const before = practiceView(snapshot);
    snapshot = applyPractice(
      snapshot,
      LEARNER,
      before.actions.find((action) => action.command.type === "main")!.command,
    );
    const choosing = practiceView(snapshot);
    expect(soundForTransition(before, choosing)).toBeNull();
    snapshot = applyPractice(snapshot, LEARNER, choosing.actions[0].command);
    const placed = practiceView(snapshot);
    expect(soundForTransition(choosing, placed)).toBe("place");
    expect(soundForTransition(placed, structuredClone(placed))).toBeNull();
  });
  it("城市实际移动与跨玩家视图分别处理", () => {
    let snapshot = createPractice(2);
    const before = practiceView(snapshot);
    snapshot = applyPractice(
      snapshot,
      LEARNER,
      before.actions.find((action) => action.command.type === "main")!.command,
    );
    const destinations = practiceView(snapshot);
    snapshot = applyPractice(
      snapshot,
      LEARNER,
      destinations.actions[0].command,
    );
    const moved = practiceView(snapshot);
    expect(soundForTransition(destinations, moved)).toBe("move");
    expect(
      soundForTransition({ ...destinations, me: "different-seat" }, moved),
    ).toBeNull();
  });
});
