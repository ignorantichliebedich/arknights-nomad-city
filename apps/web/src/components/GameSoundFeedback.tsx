import { useEffect, useRef } from "react";
import type { PlayerView } from "../../../../packages/rules/src/types.ts";
import { RESOURCES } from "../../../../packages/rules/src/data.ts";
import type { AudioCue } from "../audio-config.ts";
import { gameAudio } from "../audio.ts";
import { voicesForTransition } from "../role-voices.ts";

export function soundForTransition(
  before: PlayerView,
  next: PlayerView,
): AudioCue | null {
  if (before.me !== next.me || before.revision >= next.revision) return null;
  if (next.phase === "finished" && before.phase !== "finished") return "finish";
  if (
    next.decision?.kind === "event" &&
    (before.decision?.kind !== "event" ||
      before.decision.title !== next.decision.title)
  )
    return "event";
  if (
    (next.parallel?.id && next.parallel.id !== before.parallel?.id) ||
    (next.phase === "actions" &&
      next.players[next.active]?.id === next.me &&
      (before.phase !== "actions" ||
        before.active !== next.active ||
        before.round !== next.round ||
        before.lap !== next.lap))
  )
    return "notice";
  const old = before.players.find((player) => player.id === next.me),
    me = next.players.find((player) => player.id === next.me);
  if (!old || !me) return null;
  if (old.city !== me.city) return "move";
  if (
    Object.keys(me.built).some(
      (slot) => me.built[slot].cardId !== old.built[slot]?.cardId,
    )
  )
    return "build";
  const ownLog = next.log.some(
    (event) =>
      event.seq > (before.log.at(-1)?.seq ?? -1) && event.actor === next.me,
  );
  if (ownLog) {
    const oldSlots = Object.entries(before.sites).flatMap(([site, value]) =>
      value.slots.flatMap((owner, index) =>
        owner === next.me ? [site + ":" + index] : [],
      ),
    );
    const newSlots = Object.entries(next.sites).flatMap(([site, value]) =>
      value.slots.flatMap((owner, index) =>
        owner === next.me ? [site + ":" + index] : [],
      ),
    );
    if (newSlots.some((slot) => !oldSlots.includes(slot)))
      return newSlots.length > oldSlots.length ? "place" : "move";
  }
  if (RESOURCES.some((resource) => me.wallet[resource] > old.wallet[resource]))
    return "reward";
  return null;
}
export function GameSoundFeedback({
  game,
  error,
}: {
  game: PlayerView;
  error: string;
}) {
  const previous = useRef(game);
  useEffect(() => {
    const cue = soundForTransition(previous.current, game);
    const voices = voicesForTransition(previous.current, game);
    previous.current = game;
    if (cue) void gameAudio.play(cue);
    if (voices.length) void gameAudio.playRoleVoices(voices);
  }, [game]);
  useEffect(() => {
    if (error) void gameAudio.play("error");
  }, [error]);
  return null;
}
