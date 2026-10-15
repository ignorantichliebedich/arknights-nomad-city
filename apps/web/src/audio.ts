import {
  AUDIO_CUES,
  AUDIO_STORAGE_KEY,
  audioPreferences,
  musicTracks,
  type AudioCue,
  type AudioPreferences,
  type MusicTrack,
} from "./audio-config.ts";

class GameAudio {
  private preferences: AudioPreferences;
  private context: AudioContext | null = null;
  private files = new Map<string, Promise<ArrayBuffer | null>>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Set<AudioBufferSourceNode>();
  private listeners = new Set<() => void>();
  private lastSound = 0;
  private unlocked = false;
  private musicElement: HTMLAudioElement | null = null;
  private tracks: MusicTrack[] = [];
  private trackRequest: Promise<void> | null = null;
  constructor() {
    let stored: unknown;
    try {
      stored = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) ?? "null");
    } catch {
      stored = null;
    }
    this.preferences = audioPreferences(stored);
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", () => this.syncMusic());
  }
  snapshot = () => this.preferences;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  update(patch: Partial<AudioPreferences>) {
    this.preferences = audioPreferences({ ...this.preferences, ...patch });
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(this.preferences));
    } catch {
      /* Preferences still work for this visit. */
    }
    if (
      this.preferences.muted ||
      !this.preferences.effects ||
      this.preferences.volume === 0 ||
      this.preferences.effectsVolume === 0
    )
      for (const voice of this.voices) {
        try {
          voice.stop();
        } catch {
          /* Already ended. */
        }
      }
    this.syncMusic();
    this.listeners.forEach((listener) => listener());
  }
  async unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") await this.context.resume();
      this.unlocked = this.context.state === "running";
      this.syncMusic();
    } catch {
      this.unlocked = false;
    }
  }
  preload() {
    for (const file of new Set(
      Object.values(AUDIO_CUES).map((cue) => cue.file),
    ))
      this.file(file);
    void this.loadMusic();
  }
  private file(file: string) {
    if (!this.files.has(file))
      this.files.set(
        file,
        fetch("/audio/sfx/" + file + ".mp3")
          .then((response) => (response.ok ? response.arrayBuffer() : null))
          .catch(() => null),
      );
    return this.files.get(file)!;
  }
  private buffer(file: string) {
    if (!this.buffers.has(file)) {
      const promise = this.file(file)
        .then(async (bytes) => {
          if (!bytes || !this.context) return null;
          return this.context.decodeAudioData(bytes.slice(0));
        })
        .catch(() => null);
      this.buffers.set(file, promise);
    }
    return this.buffers.get(file)!;
  }
  async play(cue: AudioCue) {
    const prefs = this.preferences;
    if (prefs.muted || !prefs.effects || !prefs.volume || !prefs.effectsVolume)
      return;
    if (!this.context || !this.unlocked) return;
    const now = performance.now();
    if (now - this.lastSound < 45) return;
    this.lastSound = now;
    const sound = AUDIO_CUES[cue],
      started = now;
    const buffer = await this.buffer(sound.file);
    if (
      !buffer ||
      !this.context ||
      performance.now() - started > 1200 ||
      this.preferences.muted ||
      !this.preferences.effects ||
      !this.preferences.volume ||
      !this.preferences.effectsVolume ||
      this.context.state !== "running"
    )
      return;
    if (this.voices.size >= 4) return;
    const voice = this.context.createBufferSource(),
      gain = this.context.createGain();
    voice.buffer = buffer;
    gain.gain.value =
      this.preferences.volume * this.preferences.effectsVolume * sound.gain;
    voice.connect(gain);
    gain.connect(this.context.destination);
    this.voices.add(voice);
    voice.onended = () => {
      this.voices.delete(voice);
      voice.disconnect();
      gain.disconnect();
    };
    voice.start();
  }
  handleClick(event: MouseEvent) {
    const element = event.target;
    if (!(element instanceof Element)) return;
    const button = element.closest<HTMLElement>("button, [role=button]");
    if (
      !button ||
      button.matches(":disabled") ||
      button.getAttribute("aria-disabled") === "true" ||
      button.dataset.sound === "none"
    )
      return;
    const explicit = button.dataset.sound;
    const label = button.getAttribute("aria-label") ?? button.textContent ?? "";
    const cue: AudioCue =
      explicit && explicit in AUDIO_CUES
        ? (explicit as AudioCue)
        : /取消|返回|关闭|收起|退出|^×$/.test(label.trim())
          ? "back"
          : /盖放/.test(label)
            ? "cover"
            : /确认|准备|加入|创建|开始|盖放|领取|全屏体验/.test(label)
              ? "confirm"
              : button.matches(".hand-card, .action-button, [aria-pressed]")
                ? "select"
                : "click";
    // Resume from this click's user activation; do not autoplay on page load.
    void this.unlock().then(() => this.play(cue));
  }
  loadMusic() {
    this.trackRequest ??= fetch("/audio/music.json", { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) return;
        const raw = await response.text();
        if (raw.length > 32768) return;
        this.tracks = musicTracks(JSON.parse(raw), location.origin);
        this.syncMusic();
      })
      .catch(() => {});
    return this.trackRequest;
  }
  musicTracks() {
    return this.tracks;
  }
  private syncMusic() {
    const prefs = this.preferences;
    const track =
      this.tracks.find((track) => track.id === prefs.track) ?? this.tracks[0];
    if (
      !track ||
      !this.unlocked ||
      prefs.muted ||
      !prefs.music ||
      document.hidden
    ) {
      this.musicElement?.pause();
      return;
    }
    this.musicElement ??= new Audio();
    const element = this.musicElement;
    if (element.getAttribute("src") !== track.src) {
      element.src = track.src;
      element.loop = true;
      element.preload = "metadata";
    }
    element.volume = prefs.volume * prefs.musicVolume;
    if (element.paused) void element.play().catch(() => {});
  }
}
export const gameAudio = new GameAudio();
