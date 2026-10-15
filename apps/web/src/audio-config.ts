export const AUDIO_CUES = {
  click: { file: "click", gain: 0.48 },
  select: { file: "select", gain: 0.5 },
  confirm: { file: "confirm", gain: 0.58 },
  back: { file: "back", gain: 0.46 },
  open: { file: "open", gain: 0.42 },
  cover: { file: "card", gain: 0.48 },
  lift: { file: "lift", gain: 0.34 },
  place: { file: "select", gain: 0.52 },
  move: { file: "move", gain: 0.55 },
  build: { file: "confirm", gain: 0.65 },
  event: { file: "open", gain: 0.6 },
  notice: { file: "move", gain: 0.65 },
  reward: { file: "reward", gain: 0.5 },
  error: { file: "back", gain: 0.7 },
  finish: { file: "confirm", gain: 0.75 },
} as const;
export type AudioCue = keyof typeof AUDIO_CUES;
export const AUDIO_STORAGE_KEY = "nomad:audio:1";
export type AudioPreferences = {
  muted: boolean;
  effects: boolean;
  volume: number;
  effectsVolume: number;
  music: boolean;
  musicVolume: number;
  track: string;
  musicMode: "sequence" | "repeat";
};
export const DEFAULT_AUDIO: AudioPreferences = {
  muted: false,
  effects: true,
  volume: 0.7,
  effectsVolume: 0.55,
  music: false,
  musicVolume: 0.35,
  track: "",
  musicMode: "sequence",
};
export function audioPreferences(value: unknown): AudioPreferences {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const unit = (key: "volume" | "effectsVolume" | "musicVolume") =>
    typeof input[key] === "number" && Number.isFinite(input[key])
      ? Math.min(1, Math.max(0, input[key] as number))
      : DEFAULT_AUDIO[key];
  const flag = (key: "muted" | "effects" | "music") =>
    typeof input[key] === "boolean"
      ? (input[key] as boolean)
      : DEFAULT_AUDIO[key];
  return {
    muted: flag("muted"),
    effects: flag("effects"),
    music: flag("music"),
    musicMode: input.musicMode === "repeat" ? "repeat" : "sequence",
    volume: unit("volume"),
    effectsVolume: unit("effectsVolume"),
    musicVolume: unit("musicVolume"),
    track:
      typeof input.track === "string" &&
      /^[a-zA-Z0-9_-]{1,60}$/.test(input.track)
        ? input.track
        : "",
  };
}
export type MusicTrack = { id: string; title: string; src: string };
export function adjacentTrack(
  tracks: MusicTrack[],
  selected: string,
  direction: -1 | 1,
) {
  if (!tracks.length) return undefined;
  const index = Math.max(
    0,
    tracks.findIndex((track) => track.id === selected),
  );
  return tracks[(index + direction + tracks.length) % tracks.length];
}
export function musicTracks(value: unknown, origin: string): MusicTrack[] {
  const rows =
    value &&
    typeof value === "object" &&
    "tracks" in value &&
    Array.isArray(value.tracks)
      ? value.tracks
      : [];
  const ids = new Set<string>();
  return rows.slice(0, 30).flatMap((row): MusicTrack[] => {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      !/^[\w-]{1,60}$/.test(row.id) ||
      ids.has(row.id) ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      typeof row.src !== "string"
    )
      return [];
    try {
      const url = new URL(row.src, origin);
      if (
        url.origin !== origin ||
        !url.pathname.startsWith("/audio/music/") ||
        !/\.(mp3|ogg|wav|m4a)$/i.test(url.pathname) ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      )
        return [];
      ids.add(row.id);
      return [
        { id: row.id, title: row.title.trim().slice(0, 80), src: url.pathname },
      ];
    } catch {
      return [];
    }
  });
}
