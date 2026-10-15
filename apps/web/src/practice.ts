import {
  applyCommand,
  createGame,
  projectView,
  routeTo,
} from "../../../packages/rules/src/engine.ts";
import { chooseBotCommand } from "../../../packages/rules/src/bot.ts";
import {
  RULES_VERSION,
  RESOURCE_NAMES,
} from "../../../packages/rules/src/data.ts";
import type {
  Command,
  GameState,
  PlayerView,
  Wallet,
} from "../../../packages/rules/src/types.ts";

export const LEARNER = "practice-learner";
export const COACH = "practice-coach";
export const PRACTICE_KEY = "nomad:practice:1";
export const PRACTICE_LESSONS = [
  {
    key: "role",
    title: "选牌与秘密盖放",
    goal: "展开下方手牌，选一张角色牌，再确认盖放。",
    tip: "选中只是预览；你和人机教练都确认后，一起进入行动。",
  },
  {
    key: "deploy",
    title: "亲自放置影响力",
    goal: "点击地图上的高亮空格或“＋”，再确认放置。",
    tip: "确认前可以改选或取消。部署消耗一次主要行动和一枚影响力标记。",
  },
  {
    key: "city",
    title: "移动你的城市",
    goal: "拖起红色城市，沿虚线选择停靠点，确认移动。",
    tip: "本课准备了已探索停靠点。正常移动支付 3 源石，松手后先核对落点。",
  },
  {
    key: "explore",
    title: "探索与事件",
    goal: "选择“探索”，点未知资源点，核对路费，再亲自选择事件结果。",
    tip: "事件结束后完成影响力落子。这次练习会翻开“清理虫巢”事件。",
  },
  {
    key: "build",
    title: "建设一座设施",
    goal: "打开设施供应，先练习建设“城邦工业区”：选择城市空格和付款方式，再确认。",
    tip: "本课备有建材。结果窗口中点“继续拓荒”后，可以查看自己的城市。",
  },
  {
    key: "ability",
    title: "使用角色策略",
    goal: "打开行动窗口，使用极境的“角色策略”，选择补给资源。",
    tip: "角色能力独立于主要行动。本课只练习策略，选择后会按牌文领取资源。",
  },
  {
    key: "harvest",
    title: "规划路线与采集",
    goal: "点击高亮资源点规划采集，核对路费，确认你的采集方案。",
    tip: "至少选一个资源点；你和人机教练都完成后，系统统一收付和领取资源。",
  },
] as const;
export type PracticeSnapshot = {
  version: 1;
  lesson: number;
  game: GameState;
  completed: number[];
  openingWallet: Wallet;
};

function rolePlanning() {
  let game = createGame(
    [
      { id: LEARNER, name: "你 · 拓荒学员" },
      { id: COACH, name: "人机教练" },
    ],
    { seed: 52, expansion: false },
  );
  for (let n = 0; game.parallel?.kind !== "select-role" && n < 100; n++) {
    const id = game.decision!.playerId;
    game = applyCommand(game, id, chooseBotCommand(projectView(game, id))!);
  }
  if (game.parallel?.kind !== "select-role")
    throw new Error("练习场景准备失败");
  return game;
}
export function createPractice(
  lesson = 0,
  completed: number[] = [],
): PracticeSnapshot {
  let game = rolePlanning();
  if (lesson > 0) {
    for (const p of game.players)
      game = applyCommand(
        game,
        p.id,
        chooseBotCommand(projectView(game, p.id))!,
      );
    const me = game.players[0];
    me.wallet = { rock: 12, ore: 12, iron: 12, cash: 40, prime: 1, score: 0 };
    if (PRACTICE_LESSONS[lesson].key === "city")
      for (const node of game.board.nodes.filter((n) => n.tier === "green")) {
        if (!game.sites[node.id].resource) {
          game.sites[node.id].resource = "rock";
          game.sites[node.id].amount = 1;
        }
      }
    if (PRACTICE_LESSONS[lesson].key === "explore")
      game.eventDecks.green = [
        "green-1",
        ...game.eventDecks.green.filter((id) => id !== "green-1"),
      ];
    if (PRACTICE_LESSONS[lesson].key === "ability") {
      me.selected = "elysium";
      me.hand = me.hand.filter((id) => id !== "elysium");
    }
    if (PRACTICE_LESSONS[lesson].key === "build") {
      const instance = [...game.market, ...game.facilityDeck].find((id) =>
        id.startsWith("industrial@"),
      )!;
      if (game.market.includes(instance))
        game.market = [
          instance,
          ...game.market.filter((id) => id !== instance),
        ];
      else {
        game.facilityDeck = game.facilityDeck.filter((id) => id !== instance);
        game.facilityDeck.push(game.market.shift()!);
        game.market.unshift(instance);
      }
    }
    if (PRACTICE_LESSONS[lesson].key === "harvest") {
      me.city = "B-03";
      for (const id of ["B-03", "A-03"]) {
        game.sites[id].resource = "rock";
        game.sites[id].amount = 2;
      }
      game.sites["A-03"].slots[0] = me.id;
      const road = routeTo(game, me.id, "A-03").roads[0];
      game.sites[road].slots[0] = COACH;
      game.players[1].wallet.cash = 20;
      game.active = 1;
      game.lap = 2;
      game.mainDone = true;
      game.mainRemaining = 0;
      game = applyCommand(game, COACH, { type: "end" });
    }
  }
  return {
    version: 1,
    lesson,
    game,
    completed,
    openingWallet: { ...game.players[0].wallet },
  };
}
export function lessonComplete(snapshot: PracticeSnapshot) {
  const game = snapshot.game;
  const key = PRACTICE_LESSONS[snapshot.lesson].key;
  if (key === "role") return game.phase === "actions";
  if (key === "harvest") return game.phase !== "harvest";
  if (key === "ability")
    return (
      game.players[0].roleUsedThisTurn &&
      game.players[0].selected === null &&
      !game.decision
    );
  return game.mainDone && !game.decision && !game.parallel;
}
export function practiceView(snapshot: PracticeSnapshot): PlayerView {
  const view = projectView(snapshot.game, LEARNER);
  const key = PRACTICE_LESSONS[snapshot.lesson].key;
  if (lessonComplete(snapshot)) {
    view.actions = [];
    view.decision = null;
    view.parallel = null;
  } else if (!view.decision)
    view.actions = view.actions.filter((a) =>
      key === "ability"
        ? a.command.type === "role" && a.command.mode === "strategy"
        : a.command.type === "main" && a.command.action === key,
    );
  if (key !== "deploy") view.influencePlacements = [];
  if (key !== "city") view.cityDestinations = [];
  else {
    view.cityDestinations = view.cityDestinations?.filter(
      (choice) => view.sites[choice.target].resource,
    );
    if (view.decision?.kind === "city")
      view.actions = view.actions.filter(
        (a) => a.target && view.sites[a.target].resource,
      );
  }
  if (key === "explore" && view.decision?.kind === "explore")
    view.actions = view.actions.filter(
      (a) =>
        view.board.nodes.find((node) => node.id === a.target)?.tier === "green",
    );
  if (view.decision)
    view.decision.options = view.decision.options.filter((o) =>
      view.actions.some((a) => a.command.optionId === o.id),
    );
  view.influenceMoves = [];
  return view;
}
export function applyPractice(
  snapshot: PracticeSnapshot,
  actor: string,
  command: Command,
): PracticeSnapshot {
  if (lessonComplete(snapshot))
    throw new Error("本课已完成，可以继续下一课或重练。");
  if (
    actor === LEARNER &&
    !practiceView(snapshot).actions.some(
      (a) => JSON.stringify(a.command) === JSON.stringify(command),
    )
  )
    throw new Error("请按本课提示选择操作。");
  if (
    actor === LEARNER &&
    snapshot.game.parallel?.kind === "harvest" &&
    command.optionId === "done" &&
    !projectView(snapshot.game, LEARNER).decision?.map?.selected.length
  )
    throw new Error("先选择至少一个资源点，再确认采集方案。");
  const next = {
    ...snapshot,
    game: applyCommand(snapshot.game, actor, command),
  };
  if (lessonComplete(next))
    next.completed = [...new Set([...next.completed, next.lesson])];
  return next;
}
export function restorePractice(value: string | null): PracticeSnapshot | null {
  try {
    const parsed: PracticeSnapshot = JSON.parse(value ?? "null");
    if (
      parsed?.version !== 1 ||
      !Number.isInteger(parsed.lesson) ||
      parsed.lesson < 0 ||
      parsed.lesson >= PRACTICE_LESSONS.length ||
      parsed.game.rulesVersion !== RULES_VERSION ||
      !Array.isArray(parsed.completed) ||
      !parsed.completed.every(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < PRACTICE_LESSONS.length,
      ) ||
      !Object.keys(RESOURCE_NAMES).every((key) =>
        Number.isSafeInteger(parsed.openingWallet?.[key as keyof Wallet]),
      ) ||
      parsed.game.players.length !== 2 ||
      parsed.game.players[0]?.id !== LEARNER ||
      parsed.game.players[1]?.id !== COACH
    )
      return null;
    practiceView(parsed);
    return parsed;
  } catch {
    return null;
  }
}
