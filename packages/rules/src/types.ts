export type Resource = "rock" | "ore" | "iron" | "prime" | "cash" | "score";
export type Wallet = Record<Resource, number>;
export type Reward = Partial<Wallet>;
export type Color = "red" | "blue" | "yellow" | "wild";
export type Step = {
  kind: string;
  actor: string;
  data?: Record<string, unknown>;
};
export type Option = {
  id: string;
  label: string;
  steps: Step[];
  target?: string;
  image?: string;
};
export type Decision = {
  playerId: string;
  title: string;
  options: Option[];
  private?: boolean;
  kind: string;
  /** Public geometry of the acting player's unconfirmed collection plan. */
  map?: { roads: string[]; selected: string[]; free: boolean };
};
/** Private, persisted choices. Only readiness and the viewer's decision are sent. */
export type ParallelPhase = {
  id: string;
  kind: "select-role" | "harvest";
  order: string[];
  players: Record<
    string,
    {
      revision: number;
      ready: boolean;
      decision: Decision | null;
      queue: Step[];
      effects: Step[];
    }
  >;
};
export type ChoicePreview = {
  roads?: string[];
  selected?: string[];
  tolls?: { road: string; amount: number; recipients: string[] }[];
  cells?: string[];
  patternId?: string;
};
export type Facility = {
  id: string;
  name: string;
  color: Color;
  cost: Reward;
  cashCost: number;
  points: number;
  unique?: boolean;
  image: string;
  effect: string;
  copies: number;
  expansion?: boolean;
  index: number;
  oripathy?: boolean;
};
export type Role = {
  id: string;
  name: string;
  image: string;
  strategy: string;
  tactic: string;
  expansion?: boolean;
  operative?: boolean;
  oripathy?: boolean;
};
export type NodeDef = {
  id: string;
  region: string;
  tier: "green" | "yellow" | "red";
  x: number;
  y: number;
  slots: number;
};
export type RoadDef = {
  id: string;
  region: string;
  nodes: string[];
  x: number;
  y: number;
  slots: number;
};
export type BoardDef = { nodes: NodeDef[]; roads: RoadDef[]; image: string };
export type Site = {
  resource: Resource | null;
  amount: number;
  slots: (string | null)[];
  publicRoad?: boolean;
};
export type Built = { cardId: string; used: boolean; layers?: Built[] };
export type PatternClaim = {
  patternId: string;
  cooldown: number;
  uses: number;
};
export type Persistent = {
  roleId: string;
  markers: number;
  stash: string[];
  once?: boolean;
  owners?: string[];
  node?: string;
  cell?: string;
  mortgageCardId?: string;
};
export type Player = {
  id: string;
  name: string;
  seat: number;
  wallet: Wallet;
  city: string | null;
  hand: string[];
  discard: string[];
  selected: string | null;
  revealed: boolean;
  built: Record<string, Built>;
  claims: PatternClaim[];
  enterprise: Record<string, number>;
  /** Legacy preview field; original departments are shared through GameState.activeLab. */
  lab: number;
  persistent: Persistent[];
  removed: string[];
  privateRemoved: string[];
  tokenLimit: number;
  roleUsedThisTurn: boolean;
  coveredFlows?: string[];
  oripathy?: {
    entrepreneur: string | null;
    dilemmas: {
      round: number;
      side: "A" | "B";
      used: boolean;
      marker: boolean;
    }[];
    markers: number;
    gangSlots: string[];
    awards: string[];
    blueprint: string[];
    turnBlocked?: boolean;
  };
};
export type GameEvent = {
  seq: number;
  round: number;
  actor: string | null;
  text: string;
  visibility?: string[];
};
export type ScoreLine = {
  playerId: string;
  ongoing: number;
  expert?: Record<string, number>;
  regions: Record<string, number>;
  resources: Reward;
  total: number;
};
export type GameState = {
  rulesVersion: string;
  expansion: boolean;
  oripathy?: {
    expert: boolean;
    entrepreneurs: string[];
    security: string[];
    contracts: string[];
    awards: string[];
    flows: string[];
    lock: { owner: string; turn: number; region: string } | null;
    gavial: { owner: string; node: string } | null;
    turn: number;
    marketUnder: Record<string, string[]>;
  };
  revision: number;
  phase: "setup" | "select" | "actions" | "harvest" | "cleanup" | "finished";
  round: number;
  lap: number;
  first: number;
  active: number;
  mainDone: boolean;
  mainRemaining: number;
  extraOnly: boolean;
  roleBlocked: boolean;
  roleDualThisTurn: boolean;
  players: Player[];
  board: BoardDef;
  sites: Record<string, Site>;
  market: string[];
  facilityDeck: string[];
  extensions: string[];
  eventDecks: Record<string, string[]>;
  activeEnterprises: string[];
  /** Optional for existing preview saves; null when Rhine Lab is not in the game. */
  activeLab?: number | null;
  enterpriseDeck: string[];
  operativeDeck: string[];
  patterns: string[];
  randomState: number;
  queue: Step[];
  scheduled: { at: string; step: Step }[];
  decision: Decision | null;
  /** Absent in older saves. Independent choices share one completion barrier. */
  parallel?: ParallelPhase | null;
  log: GameEvent[];
  firstOverride: number | null;
  finalScores: ScoreLine[];
  winners: string[];
};
export type Command = {
  type:
    | "choose"
    | "choose-many"
    | "main"
    | "role"
    | "declare"
    | "special"
    | "ability"
    | "end";
  optionId?: string;
  optionIds?: string[];
  action?: string;
  mode?: string;
  patternId?: string;
};
export type LegalAction = {
  id: string;
  label: string;
  group: string;
  command: Command;
  target?: string;
  hint?: string;
};
export type InfluencePlacement = {
  target: string;
  optionId: string;
  label: string;
};
export type BatchChoice = {
  count: number;
  label: string;
  limits: Record<string, number>;
};
export type PlayerView = Omit<
  GameState,
  | "queue"
  | "scheduled"
  | "decision"
  | "randomState"
  | "facilityDeck"
  | "eventDecks"
  | "enterpriseDeck"
  | "operativeDeck"
  | "players"
  | "parallel"
> & {
  parallel?: {
    id: string;
    kind: ParallelPhase["kind"];
    participants: string[];
    ready: string[];
    /** Scoped to this player's pending choice, unchanged by other submissions. */
    choiceToken: string | null;
  } | null;
  players: (Omit<Player, "hand" | "selected" | "privateRemoved" | "lab"> & {
    hand: string[];
    handCount: number;
    selected: string | null;
    availableMarkers: number;
  })[];
  decision:
    | (Omit<Decision, "options"> & {
        batch?: BatchChoice;
        options: (Omit<Option, "steps"> & { preview?: ChoicePreview })[];
      })
    | null;
  me: string;
  actions: LegalAction[];
  deckCounts: { facility: number; operatives: number };
  /** Reachable destinations for a drag preview before starting the city action. */
  cityDestinations?: {
    target: string;
    road: string;
    optionId: string;
    label: string;
  }[];
  /** Legal influence transfers for this seat's current action, without effects. */
  influenceMoves?: { from: string; owner: string; destinations: string[] }[];
  /** Legal slots before choosing deployment as this seat's main action. */
  influencePlacements?: InfluencePlacement[];
  /** Legal exploration choices before starting the current seat's main action. */
  explorationTargets?: { target: string; optionId: string; label: string }[];
};
