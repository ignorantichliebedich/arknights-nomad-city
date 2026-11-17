import { constants, deflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  applyCommand,
  createGame,
  projectView,
} from "../packages/rules/src/engine.ts";
import { chooseBotAction } from "../packages/rules/src/bot.ts";
import { StateReceiver, StateSender } from "../packages/shared/state-sync.ts";

// Match the server's independent permessage-deflate messages. These are estimated
// WebSocket frame bytes; real socket byte coverage lives in server.test.ts.
function wireBytes(value: object) {
  const raw = Buffer.from(JSON.stringify(value));
  const bytes =
    raw.length < 1024
      ? raw.length
      : deflateRawSync(raw, {
          level: 3,
          memLevel: 7,
          finishFlush: constants.Z_SYNC_FLUSH,
        }).length - 4;
  return bytes + (bytes < 126 ? 2 : bytes < 65536 ? 4 : 10);
}
function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}
const scenarios = [
  {
    name: "二人本体",
    count: 2,
    expansion: false,
    oripathy: false,
    expert: false,
  },
  {
    name: "四人企业",
    count: 4,
    expansion: true,
    oripathy: false,
    expert: false,
  },
  {
    name: "四人感染者专家",
    count: 4,
    expansion: true,
    oripathy: true,
    expert: true,
  },
];
const reports = scenarios.map((config) => {
  let game = createGame(
    Array.from({ length: config.count }, (_, i) => ({
      id: `test-${i}`,
      name: `合成测试${i + 1}`,
    })),
    { ...config, seed: 52 },
  );
  for (let i = 0; game.round < 6 || game.phase !== "actions"; i++) {
    if (i > 2000) throw new Error("Cannot create benchmark fixture");
    const actor = game.players
      .map((p) => projectView(game, p.id))
      .find((p) => p.actions.length)!;
    game = applyCommand(game, actor.me, chooseBotAction(actor)!.command);
  }
  while (game.log.length < 1300)
    game.log.push({
      seq: game.log.length + 1,
      round: 5,
      actor: null,
      text: `合成历史记录 ${game.log.length + 1}：测试玩家采集资源、支付航道路费并完成城市建设。`,
    });
  const streams = game.players.map(() => ({
    sender: new StateSender(),
    receiver: new StateReceiver<object>(),
  }));
  function sample() {
    let legacy = 0,
      delta = 0;
    const started = performance.now();
    game.players.forEach((p, i) => {
      const view = projectView(game, p.id);
      const room = {
        id: "BENCH1",
        revision: game.revision,
        me: p.id,
        game: view,
      };
      const frame = streams[i].sender.encode(room)!;
      const restored = streams[i].receiver.receive(
        JSON.parse(JSON.stringify(frame)),
      );
      if (!isDeepStrictEqual(restored, JSON.parse(JSON.stringify(room))))
        throw new Error("View mismatch");
      legacy += wireBytes({ type: "state", room });
      delta += wireBytes(frame);
    });
    return { legacy, delta, ms: performance.now() - started };
  }
  const initial = sample();
  const samples: ReturnType<typeof sample>[] = [];
  for (let i = 0; i < 60 && game.phase !== "finished"; i++) {
    const actor = game.players
      .map((p) => projectView(game, p.id))
      .find((p) => p.actions.length)!;
    game = applyCommand(game, actor.me, chooseBotAction(actor)!.command);
    samples.push(sample());
  }
  const legacy = samples.reduce((sum, s) => sum + s.legacy, 0);
  const delta = samples.reduce((sum, s) => sum + s.delta, 0);
  return {
    scenario: config.name,
    players: config.count,
    operations: samples.length,
    firstSyncBytes: initial.delta,
    logCountAtEnd: game.log.length,
    legacyTotalBytes: legacy,
    deltaTotalBytes: delta,
    reductionPercent: Math.round((1 - delta / legacy) * 1000) / 10,
    legacyP95Bytes: p95(samples.map((s) => s.legacy)),
    deltaP95Bytes: p95(samples.map((s) => s.delta)),
    // Shared 3 Mbps, assuming all capacity is available, without image/audio/RTT.
    legacyTotalTransmitMsAt3Mbps: Math.round((legacy * 8) / 3000),
    deltaTotalTransmitMsAt3Mbps: Math.round((delta * 8) / 3000),
  };
});
const output = resolve(".data/network/state-sync-comparison.json");
mkdirSync(resolve(".data/network"), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    { synthetic: true, compressedFramesEstimated: true, reports },
    null,
    2,
  ) + "\n",
);
console.table(reports);
console.info(output);
