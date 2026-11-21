// Public entry point for local game variants and bot strategies.
export { createGame, projectView, applyCommand } from "../rules/src/engine.ts";
export { chooseBotCommand } from "../rules/src/bot.ts";
export type {
  PlayerView,
  Command,
  GameState,
  LegalAction,
} from "../rules/src/types.ts";
