import { ROLE_BY_ID, ROLES } from "../../../packages/rules/src/data.ts";
import type { PlayerView } from "../../../packages/rules/src/types.ts";
import type { AudioPreferences, AudioCue } from "./audio-config.ts";
import { readVoiceCatalog, type VoiceClip } from "./voice-catalog.ts";
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
  const added = next.log.filter((e) => e.seq > (before.log.at(-1)?.seq ?? -1));
  const old = before.players.find((p) => p.id === next.me),
    me = next.players.find((p) => p.id === next.me);
  // Cover speech is private: require this viewer's actual hand-to-table action.
  // A reveal, resync or another seat's public cover log cannot trigger it.
  if (
    me?.selected &&
    me.selected !== old?.selected &&
    (old?.hand.includes(me.selected) ||
      (before.decision?.kind === "o:hellagur-cover" &&
        old?.discard.includes(me.selected))) &&
    !me.hand.includes(me.selected) &&
    !me.discard.includes(me.selected) &&
    added.some(
      (e) =>
        e.actor === next.me &&
        (e.text === "盖放了一张角色牌" ||
          (before.decision?.playerId === next.me &&
            before.decision.kind === "o:hellagur-cover" &&
            e.text === ROLE_BY_ID[me.selected!]?.name)),
    )
  )
    result.push({ roleId: me.selected, kind: "cover" });
  for (const event of added) {
    // A public use log is authoritative even if the effect transfers the card
    // or leaves a different card covered (Ceobe, Hellagur, and Flow cards).
    if (!next.players.some((p) => p.id === event.actor)) continue;
    const role = ROLES.find((r) => event.text.startsWith(`使用 ${r.name} · `));
    if (!role) continue;
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

export class RoleVoicePlayer {
  private clips: VoiceClip[] = [];
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
        if (text.length > 131072) return;
        this.clips = readVoiceCatalog(JSON.parse(text));
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
