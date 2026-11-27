import { ROLES } from "../../../packages/rules/src/data.ts";

/** Summons and the unvoiced trader use table sounds, never another person's voice. */
export const UNVOICED_ROLES = new Set([
  "cannott",
  "o-flow-a",
  "o-flow-b",
  "o-flow-c",
]);
export const VOICED_ROLES = ROLES.filter(
  (role) => !UNVOICED_ROLES.has(role.id),
);
export const VOICE_CUES = [
  "battle-1",
  "battle-2",
  "battle-3",
  "battle-4",
  "select-1",
  "select-2",
] as const;
export const VOICE_LANGUAGES = ["zh", "ja"] as const;
export type VoiceClip = {
  roleId: string;
  language: "zh" | "ja";
  cue: string;
  src: string;
};
export const MAX_VOICE_CLIPS =
  VOICED_ROLES.length * VOICE_LANGUAGES.length * VOICE_CUES.length;

/** A bounded same-origin catalog; reject malformed rows and duplicate cues. */
export function readVoiceCatalog(value: unknown): VoiceClip[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { voices?: unknown }).voices)
  )
    return [];
  const ids = new Set(VOICED_ROLES.map((role) => role.id));
  const seen = new Set<string>();
  return (value as { voices: unknown[] }).voices
    .slice(0, MAX_VOICE_CLIPS * 2)
    .filter((value): value is VoiceClip => {
      if (!value || typeof value !== "object") return false;
      const row = value as VoiceClip;
      const key = `${row.roleId}/${row.language}/${row.cue}`;
      if (
        !ids.has(row.roleId) ||
        !VOICE_LANGUAGES.includes(row.language) ||
        !(VOICE_CUES as readonly string[]).includes(row.cue) ||
        row.src !==
          `/audio/voices/${row.language}/${row.roleId}/${row.cue}.mp3` ||
        seen.has(key)
      )
        return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_VOICE_CLIPS);
}
