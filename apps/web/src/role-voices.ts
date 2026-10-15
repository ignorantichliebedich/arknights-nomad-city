import { ROLE_BY_ID } from "../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../packages/rules/src/types.ts";
import type { AudioPreferences, AudioCue } from "./audio-config.ts";
export type RoleVoice = {
  roleId: string;
  kind: "cover" | "strategy" | "tactic";
};

export function voicesForTransition(
  before: PlayerView,
  next: PlayerView,
): RoleVoice[] {
  if (before.me !== next.me || before.revision >= next.revision) return [];
  const result: RoleVoice[] = [];
  const old = before.players.find((p) => p.id === next.me),
    me = next.players.find((p) => p.id === next.me);
  if (me?.selected && me.selected !== old?.selected)
    result.push({ roleId: me.selected, kind: "cover" });
  for (const event of next.log.filter(
    (e) => e.seq > (before.log.at(-1)?.seq ?? -1),
  )) {
    const actor = next.players.find((p) => p.id === event.actor),
      role = actor?.selected ? ROLE_BY_ID[actor.selected] : undefined;
    if (
      !role ||
      !actor?.revealed ||
      !event.text.startsWith(`使用 ${role.name} · `)
    )
      continue;
    const mode = event.text.slice(`使用 ${role.name} · `.length);
    for (const kind of mode === "策略后计谋"
      ? ["strategy", "tactic"]
      : mode === "计谋后策略"
        ? ["tactic", "strategy"]
        : mode === "策略"
          ? ["strategy"]
          : mode === "计谋"
            ? ["tactic"]
            : [])
      result.push({ roleId: role.id, kind: kind as RoleVoice["kind"] });
  }
  return result;
}

type Clip = { roleId: string; language: "zh" | "ja"; cue: string; src: string };
export class RoleVoicePlayer {
  private clips: Clip[] = [];
  private loading: Promise<void> | null = null;
  private audio: HTMLAudioElement | null = null;
  private generation = 0;
  private cycles = new Map<string, number>();
  private prefs: () => AudioPreferences;
  private activated: () => boolean;
  private duck: (enabled: boolean) => void;
  private cue: (cue: AudioCue) => void;
  constructor(
    prefs: () => AudioPreferences,
    activated: () => boolean,
    duck: (enabled: boolean) => void,
    cue: (cue: AudioCue) => void,
  ) {
    this.prefs = prefs;
    this.activated = activated;
    this.duck = duck;
    this.cue = cue;
  }
  load() {
    this.loading ??= fetch("/audio/voices.json", { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) return;
        const text = await response.text();
        if (text.length > 65536) return;
        const rows = JSON.parse(text).voices;
        if (Array.isArray(rows))
          this.clips = rows
            .slice(0, 200)
            .filter(
              (clip: Clip) =>
                clip &&
                Object.hasOwn(ROLE_BY_ID, clip.roleId) &&
                ["zh", "ja"].includes(clip.language) &&
                new RegExp(
                  `^/audio/voices/${clip.language}/${clip.roleId}/(battle-[1-4]|select-[12])\\.mp3$`,
                ).test(clip.src),
            );
      })
      .catch(() => {});
    return this.loading;
  }
  private allowed() {
    const prefs = this.prefs();
    return (
      this.activated() &&
      prefs.voices &&
      !prefs.muted &&
      prefs.volume > 0 &&
      prefs.voiceVolume > 0 &&
      !document.hidden
    );
  }
  stop() {
    this.generation++;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
    }
    this.duck(false);
  }
  refresh() {
    if (!this.allowed()) this.stop();
    else if (this.audio)
      this.audio.volume = this.prefs().volume * this.prefs().voiceVolume;
  }
  async play(requests: RoleVoice[]) {
    this.stop();
    const generation = this.generation;
    if (!this.allowed()) return;
    await this.load();
    if (generation !== this.generation || !this.allowed()) return;
    const queue = requests.slice(-2);
    const next = () => {
      if (generation !== this.generation || !this.allowed()) return;
      const request = queue.shift();
      if (!request) {
        this.duck(false);
        return;
      }
      const key = request.roleId + request.kind,
        index = this.cycles.get(key) ?? 0;
      this.cycles.set(key, index + 1);
      const cue =
        request.kind === "cover"
          ? `select-${(index % 2) + 1}`
          : `battle-${(index % 2) + (request.kind === "strategy" ? 1 : 3)}`;
      const clip = this.clips.find(
        (c) =>
          c.roleId === request.roleId &&
          c.language === this.prefs().voiceLanguage &&
          c.cue === cue,
      );
      if (!clip) {
        this.cue(
          request.kind === "cover"
            ? "cover"
            : request.kind === "strategy"
              ? "reward"
              : "confirm",
        );
        next();
        return;
      }
      this.audio ??= new Audio();
      const audio = this.audio;
      audio.onended = next;
      audio.onerror = () => {
        this.duck(false);
        next();
      };
      audio.src = clip.src;
      audio.volume = this.prefs().volume * this.prefs().voiceVolume;
      this.duck(true);
      void audio.play().catch(() => {
        if (generation === this.generation) {
          this.duck(false);
          next();
        }
      });
    };
    next();
  }
}
