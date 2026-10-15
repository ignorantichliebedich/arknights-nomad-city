import evidence from "../../../assets/original-labs.json" with { type: "json" };
import type { Reward } from "./types.ts";

export type OriginalLabReward = {
  gain?: Reward;
  cost?: Reward;
  effect?: string;
  free?: boolean;
  maximumCashPrice?: number;
  count?: number;
  chooseOne?: { effect: string; count: number }[];
};
export type OriginalLab = {
  id: string;
  name: string;
  rewardEvidenceComplete: boolean;
  rewards: Record<string, OriginalLabReward>;
};

// The same evidence file drives implementation and the component catalogue.
// Release requires all three original departments, not a reduced department pool.
export const RHINE_DEPARTMENTS = evidence.departments as OriginalLab[];
export const COMPLETE_RHINE_RULES =
  evidence.packEnabled &&
  RHINE_DEPARTMENTS.length === 3 &&
  RHINE_DEPARTMENTS.every(
    (lab) =>
      lab.rewardEvidenceComplete &&
      [2, 3, 4, 5].every((level) => lab.rewards[String(level)]),
  );
