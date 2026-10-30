import {
  createGame,
  applyCommand,
  projectView,
} from "../packages/rules/src/engine.ts";
import { ENTREPRENEURS } from "../packages/rules/src/oripathy-data.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const dir = process.argv[3] || ".data/acceptance/oripathy-audit";
const max = Number(process.argv[2] || 300);
assert(
  Number.isSafeInteger(max) && max >= 1 && max <= 300,
  "检查局数须为 1–300",
);
mkdirSync(dir, { recursive: true });
type Plan = { who: string; count: number; side: number; seed: number };
const plans: Plan[] = ENTREPRENEURS.flatMap((e, identity) =>
  [2, 3, 4].flatMap((count) =>
    Array.from({ length: 16 }, (_, side) => ({
      who: e.id,
      count,
      side,
      seed: 20261027 + identity * 10000 + count * 100 + side,
    })),
  ),
);
plans.push(
  ...Array.from({ length: 60 }, (_, i) => ({
    who: "",
    count: 2 + (i % 3),
    side: i % 16,
    seed: 99 + i * 1999,
  })),
);
let commands = 0,
  probes = 0,
  completed = 0;
const decisions: Record<string, number> = {},
  roles: Record<string, number> = {},
  abilities: Record<string, number> = {};
const failures: {
  plan: Plan;
  turn: number;
  phase: string;
  round: number;
  decision: string | undefined;
  error: string | undefined;
}[] = [];
const started = performance.now();
for (const plan of plans.slice(0, max)) {
  let state = createGame(
    Array.from({ length: plan.count }, (_, i) => ({
      id: "p" + i,
      name: "压力测试" + i,
    })),
    { oripathy: true, expert: !!plan.who, seed: plan.seed },
  );
  let rng = plan.seed,
    turn = 0;
  const random = () => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 0) / 4294967296;
  };
  try {
    for (; state.phase !== "finished"; turn++) {
      assert(turn < 5000, "对局未结束");
      const actor = state.decision?.playerId ?? state.players[state.active].id,
        view = projectView(state, actor);
      decisions[view.decision?.kind ?? view.phase] =
        (decisions[view.decision?.kind ?? view.phase] || 0) + 1;
      assert(view.actions.length, `无可执行指令 ${view.decision?.kind}`);
      let candidates = view.actions;
      if (
        view.decision?.kind === "o:entrepreneur-draft" &&
        state.players.every((p) => !p.oripathy!.entrepreneur)
      )
        candidates = candidates.filter((a) => a.id === plan.who);
      if (view.decision?.kind === "o:dilemma")
        candidates = candidates.filter(
          (a) =>
            a.id ===
            ((plan.side >>
              ((state.round - 1) / 2 +
                state.players.findIndex((p) => p.id === actor))) %
            2
              ? "B"
              : "A"),
        );
      if (!view.decision) {
        const end = candidates.find((a) => a.command.type === "end");
        if (end && random() < 0.65) candidates = [end];
        else {
          const special = candidates.filter((a) =>
            ["ability", "role", "declare", "special"].includes(a.command.type),
          );
          if (special.length && random() < 0.6) candidates = special;
        }
      } else {
        const finish = candidates.find((a) =>
          ["done", "skip", "no", "keep"].includes(a.id),
        );
        if (finish && random() < 0.3) candidates = [finish];
      }
      const action = candidates[Math.floor(random() * candidates.length)];
      assert(action, "空候选");
      if (turn % 40 === 0) {
        for (const a of view.actions
          .filter(
            (_, i, all) => i % Math.max(1, Math.floor(all.length / 16)) === 0,
          )
          .slice(0, 20)) {
          try {
            applyCommand(state, actor, a.command);
            probes++;
          } catch (e) {
            throw new Error(
              "合法动作不可执行 " +
                JSON.stringify(a) +
                " " +
                (e instanceof Error ? e.message : String(e)),
            );
          }
        }
      }
      if (action.command.type === "role") {
        const mode = action.command.mode!,
          flow = mode.startsWith("flow|") ? mode.split("|") : null;
        const key =
          (flow
            ? flow[1]
            : state.players.find((p) => p.id === actor)!.selected) +
          ":" +
          (flow ? flow[2] : mode);
        roles[key] = (roles[key] || 0) + 1;
      }
      if (action.command.type === "ability") {
        const key = action.command.action!;
        abilities[key] = (abilities[key] || 0) + 1;
      }
      const next = applyCommand(state, actor, action.command);
      if (turn % 80 === 0)
        assert.equal(
          JSON.stringify(
            applyCommand(
              JSON.parse(JSON.stringify(state)),
              actor,
              action.command,
            ),
          ),
          JSON.stringify(next),
          "存档重放不一致",
        );
      state = next;
      commands++;
      const entities = [
        ...state.market,
        ...state.facilityDeck,
        ...Object.values(state.oripathy!.marketUnder).flat(),
        ...state.players.flatMap((p) => [
          ...p.oripathy!.blueprint,
          ...p.persistent.flatMap((v) => v.stash),
        ]),
      ];
      assert.equal(new Set(entities).size, entities.length, "设施实体重复");
      assert(state.oripathy!.security.length <= 8, "安保超供应");
      for (const slot of state.oripathy!.security) {
        const i = slot.lastIndexOf(":");
        assert.equal(
          state.sites[slot.slice(0, i)].slots[+slot.slice(i + 1)],
          null,
          "安保与普通标记重叠",
        );
      }
      for (const p of state.players) {
        for (const [r, n] of Object.entries(p.wallet)) {
          assert(Number.isSafeInteger(n), `${r} 非整数`);
          assert(r === "score" || n >= 0, `${r} 负数`);
        }
        assert(p.oripathy!.gangSlots.length <= 4, "帮派超供应");
        for (const slot of p.oripathy!.gangSlots) {
          const i = slot.lastIndexOf(":");
          assert.equal(
            state.sites[slot.slice(0, i)].slots[+slot.slice(i + 1)],
            p.id,
            "帮派标记位置失配",
          );
        }
        if (turn % 20 === 0) {
          const privateView = projectView(state, p.id);
          assert(
            privateView.players.find((v) => v.id === p.id)!.availableMarkers >=
              0,
            "普通标记供应负数",
          );
          for (const other of privateView.players.filter(
            (v) => v.id !== p.id,
          )) {
            assert.equal(other.hand.length, 0, "泄漏对手手牌");
            assert.equal(other.coveredFlows?.length ?? 0, 0, "泄漏额外盖牌");
            if (!other.revealed) assert.equal(other.selected, null, "泄漏盖牌");
          }
        }
        const active = [
          ...p.hand,
          ...p.discard,
          ...(p.selected ? [p.selected] : []),
          ...(p.coveredFlows ?? []),
          ...p.persistent.map((v) => v.roleId),
        ];
        assert.equal(
          new Set(active).size,
          active.length,
          "角色牌重复 " + p.id + " " + active.join(","),
        );
      }
    }
    assert.equal(state.finalScores.length, plan.count);
    completed++;
  } catch (e) {
    const failure = {
      plan,
      turn,
      phase: state.phase,
      round: state.round,
      decision: state.decision?.kind,
      error: e instanceof Error ? e.stack : String(e),
    };
    failures.push(failure);
    writeFileSync(
      dir + "/failure-" + failures.length + ".json",
      JSON.stringify({ failure, state }, null, 2),
    );
    console.log(JSON.stringify(failure));
  }
  if ((completed + failures.length) % 10 === 0)
    console.log(
      JSON.stringify({
        completed,
        failures: failures.length,
        commands,
        probes,
        seconds: Math.round((performance.now() - started) / 1000),
      }),
    );
  if (failures.length >= 12) break;
}
const result = {
  completed,
  failures,
  commands,
  probes,
  decisions,
  roles,
  abilities,
  seconds: Math.round((performance.now() - started) / 1000),
};
writeFileSync(dir + "/stress-results.json", JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    completed,
    failures: failures.length,
    commands,
    probes,
    seconds: result.seconds,
  }),
);
if (failures.length) process.exitCode = 1;
