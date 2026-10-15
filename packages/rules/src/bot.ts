import { FACILITY_BY_ID, PATTERN_BY_ID, ROLE_BY_ID } from "./data.ts";
import type { Command, LegalAction, PlayerView, Resource } from "./types.ts";

const value: Record<Resource, number> = {
  rock: 1.1,
  ore: 1.5,
  iron: 1.7,
  cash: 0.4,
  prime: 6,
  score: 7,
};
const resourceNames: Record<string, Resource> = {
  源岩: "rock",
  源石: "ore",
  异铁: "iron",
  金券: "cash",
  至纯源石: "prime",
  分: "score",
};
const roleValue: Record<string, number> = {
  texas: 8,
  elysium: 7,
  liskarm: 6,
  tinman: 7,
  mountain: 7,
  mlynar: 9,
  cannott: 5,
};

function income(text: string) {
  let result = 0;
  for (const m of text.matchAll(
    /(获得|支付|失去)?\s*(\d+) (至纯源石|源岩|源石|异铁|金券|分)/g,
  ))
    result +=
      Number(m[2]) *
      value[resourceNames[m[3]]] *
      (["支付", "失去"].includes(m[1]) ? -1 : 1);
  return result;
}
function siteValue(view: PlayerView, target: string | undefined) {
  if (!target) return 0;
  const site = view.sites[target];
  const region = [...view.board.nodes, ...view.board.roads].find(
    (s) => s.id === target,
  )?.region;
  const me = view.players.find((p) => p.id === view.me)!;
  const counts = view.players.map((p) =>
    [...view.board.nodes, ...view.board.roads]
      .filter((s) => s.region === region)
      .reduce(
        (n, s) =>
          n +
          view.sites[s.id].slots.filter((id) => id === p.id).length +
          (p.city === s.id ? 2 : 0),
        0,
      ),
  );
  const mine = counts[me.seat];
  const strongest = Math.max(...counts.filter((_, i) => i !== me.seat));
  const control =
    mine <= strongest && mine + 1 >= strongest
      ? 4
      : mine > strongest + 1
        ? 0
        : 1;
  return (
    control +
    (site?.resource ? site.amount * value[site.resource] : 0) -
    (site?.slots.includes(view.me) ? 2 : 0)
  );
}

/** A deterministic heuristic that reads only this seat's normal player view. */
export function chooseBotAction(view: PlayerView): LegalAction | null {
  const me = view.players.find((p) => p.id === view.me)!;
  const kind = view.decision?.kind;
  const options = view.decision?.options ?? [];
  const score = (action: LegalAction) => {
    const id = action.command.optionId ?? action.id;
    const option = options.find((o) => o.id === id);
    if (kind === "harvest") {
      if (id === "done") return 0;
      if (id.startsWith("unselect:") || id === "reset") return -1000;
      const done = options.find((o) => o.id === "done");
      const previousCost =
        done?.preview?.tolls?.reduce((n, t) => n + t.amount, 0) ?? 0;
      const cost = Number(/总路费 (\d+)/.exec(action.label)?.[1] ?? 0);
      const site = view.sites[action.target!];
      return site?.resource
        ? site.amount * value[site.resource] -
            (cost - previousCost) * value.cash
        : -10;
    }
    if (
      [
        "sell",
        "security",
        "recall",
        "conditional",
        "rhine-structural-downgrade",
      ].includes(kind ?? "") &&
      ["done", "skip", "no"].includes(id)
    )
      return 1;
    if (
      ["select-role", "trim", "operative-draw", "operative-retire"].includes(
        kind ?? "",
      )
    ) {
      const role = ROLE_BY_ID[id];
      const worth = role
        ? (roleValue[id] ?? 5) +
          (view.expansion && ["mlynar", "mountain"].includes(id) ? 4 : 0)
        : 0;
      return ["trim", "operative-retire"].includes(kind!) ? -worth : worth;
    }
    if (kind === "place" || kind === "shift-to")
      return siteValue(view, action.target);
    if (kind === "shift-from") return -siteValue(view, action.target);
    if (kind === "city" || kind === "explore" || kind === "starting-city")
      return (
        siteValue(view, action.target) +
        (!view.sites[action.target!]?.resource ? 5 : 0) -
        Number(/路费 (\d+)/.exec(action.label)?.[1] ?? 0) * value.cash
      );
    if (kind === "build") {
      const card = FACILITY_BY_ID[id.split("@")[0]];
      const cell = Number(id.split(":")[1]);
      const builtNeighbors = Object.keys(me.built).filter(
        (c) =>
          Math.abs(Number(c) - cell) === 3 ||
          (Math.abs(Number(c) - cell) === 1 &&
            Math.floor(Number(c) / 3) === Math.floor(cell / 3)),
      ).length;
      const cost = [
        ...action.label.matchAll(/(\d+) (源岩|源石|异铁|金券|至纯源石)/g),
      ].reduce((n, m) => n + Number(m[1]) * value[resourceNames[m[2]]], 0);
      return card
        ? card.points * 6 +
            (card.effect === "none" ? 0 : 5) +
            builtNeighbors * 1.5 -
            cost
        : 0;
    }
    if (kind === "pattern")
      return PATTERN_BY_ID[option?.preview?.patternId ?? ""]?.score ?? 1;
    if (
      [
        "enterprise",
        "upgrade",
        "upgrade-trigger",
        "trigger",
        "trigger-all-company",
      ].includes(kind ?? "")
    ) {
      const company = id.split(":")[0];
      return (
        (me.enterprise[company] ?? 0) * 2 +
        ({ bank: 7, heide: 6, rhine: 6, rhodes: 6, raythean: 5, mama: 5 }[
          company
        ] ?? 4)
      );
    }
    if (kind === "toll")
      return id === view.me
        ? 20
        : -view.players.find((p) => p.id === id)!.wallet.score;
    if (
      kind === "event" ||
      kind === "allocate" ||
      kind === "rhine-defense" ||
      kind === "commercial"
    )
      return income(action.label);
    if (
      ["remove", "replace", "opponent", "forced-loss", "forced-take"].includes(
        kind ?? "",
      )
    ) {
      const owner = action.target
        ? view.sites[action.target]?.slots[Number(id.split(":").at(-1))]
        : null;
      return (owner && owner !== view.me ? 6 : -3) + income(action.label);
    }
    if (action.command.type === "declare")
      return 80 + (PATTERN_BY_ID[action.command.patternId!]?.score ?? 0);
    if (action.command.type === "role")
      return action.command.mode === "strategy"
        ? 65
        : action.command.mode === "strategy-tactic"
          ? 64
          : 60;
    if (action.command.type === "main") {
      const ranks: Record<string, number> = {
        build: 45 + (Object.keys(me.built).length < 9 ? 5 : -15),
        explore: view.round <= 4 ? 50 : 35,
        deploy: me.availableMarkers > 4 ? 42 : 22,
        city: me.wallet.ore >= 6 ? 31 : 18,
        shift: 20,
      };
      return ranks[action.command.action!] ?? 0;
    }
    if (action.command.type === "special") return 46;
    if (action.command.type === "end") return -100;
    if (["done", "skip", "no", "cancel"].includes(id)) return 0;
    return income(action.label);
  };
  return (
    view.actions
      .map((action, index) => ({ action, index, score: score(action) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.action ?? null
  );
}

export function chooseBotCommand(view: PlayerView): Command | null {
  return chooseBotAction(view)?.command ?? null;
}
