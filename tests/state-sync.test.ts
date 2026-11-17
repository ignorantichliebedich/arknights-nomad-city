import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { StateReceiver, StateSender } from "../packages/shared/state-sync.ts";
import {
  applyCommand,
  createGame,
  projectView,
} from "../packages/rules/src/engine.ts";
import { chooseBotAction } from "../packages/rules/src/bot.ts";

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function transfer<T extends object>(
  sender: StateSender,
  receiver: StateReceiver<T>,
  value: T,
) {
  const frame = sender.encode(value);
  return { frame, received: frame ? receiver.receive(json(frame)) : null };
}

describe("玩家视图增量传输", () => {
  it("首次完整同步、嵌套更新删除和数组追加均保留原视图与未变化引用", () => {
    const sender = new StateSender(),
      receiver = new StateReceiver<any>();
    const initial = {
      revision: 0,
      static: { board: "map".repeat(500) },
      players: [{ wallet: { cash: 1 }, temporary: ["a"] }],
      log: ["initial"],
      optional: undefined,
    };
    const first = transfer(sender, receiver, initial);
    expect(first.frame?.type).toBe("state");
    const snapshot = first.received;
    const next = {
      revision: 1,
      static: initial.static,
      players: [{ wallet: { cash: 3 } }],
      log: ["initial", "new"],
    };
    const second = transfer(sender, receiver, next);
    expect(second.frame?.type).toBe("state-delta");
    expect(second.received).toEqual(next);
    expect(snapshot).toEqual(json(initial));
    expect(second.received.static).toBe(snapshot.static);
    expect(second.received.players).not.toBe(snapshot.players);
  });

  it("同版本上下线也独立排序，相同状态不占序号，大幅变化回退完整快照", () => {
    const sender = new StateSender(),
      receiver = new StateReceiver<any>();
    const initial = {
      revision: 7,
      connected: false,
      padding: "stable".repeat(100),
    };
    transfer(sender, receiver, initial);
    const next = { ...initial, connected: true };
    expect(transfer(sender, receiver, next).frame).toMatchObject({
      type: "state-delta",
      base: 1,
      sequence: 2,
    });
    expect(sender.encode(next)).toBeNull();
    expect(
      transfer(sender, receiver, { ...next, revision: 8 }).frame,
    ).toMatchObject({ base: 2, sequence: 3 });
    const changed = transfer(sender, receiver, { message: "replacement" });
    expect(changed.frame?.type).toBe("state");
    expect(changed.received).toEqual({ message: "replacement" });
  });

  it("旧服务完整 JSON 可用；增量漏包或乱序必须重新同步", () => {
    const sender = new StateSender(),
      receiver = new StateReceiver<any>();
    const value = { revision: 0, board: "fixed".repeat(100) };
    transfer(sender, receiver, value);
    sender.encode({ ...value, revision: 1 });
    const skipped = sender.encode({ ...value, revision: 2 })!;
    expect(() => receiver.receive(skipped)).toThrow("sequence mismatch");
    const restarted = new StateReceiver<any>();
    expect(
      restarted.receive({ type: "state", room: { ...value, revision: 2 } }),
    ).toEqual({ ...value, revision: 2 });
    expect(() => restarted.receive(skipped)).toThrow();
    expect(restarted.receive({ type: "ack", revision: 2 })).toBeNull();
  });

  it("拒绝危险路径与错误追加长度，失败不污染已接收的状态", () => {
    const receiver = new StateReceiver<any>();
    const initial = { revision: 0, log: ["first"] };
    receiver.receive({
      type: "state",
      room: initial,
      sync: { version: 1, sequence: 1 },
    });
    for (const changes of [
      [
        ["set", ["revision"], 1],
        ["set", ["__proto__", "polluted"], true],
      ],
      [["append", ["log"], 0, ["wrong"]]],
      [["remove", ["log", 0]]],
    ])
      expect(() =>
        receiver.receive({
          type: "state-delta",
          base: 1,
          sequence: 2,
          changes,
        }),
      ).toThrow();
    expect(initial).toEqual({ revision: 0, log: ["first"] });
    expect(({} as any).polluted).toBeUndefined();
    expect(
      receiver.receive({
        type: "state-delta",
        base: 1,
        sequence: 2,
        changes: [["append", ["log"], 1, ["good"]]],
      }),
    ).toEqual({ revision: 0, log: ["first", "good"] });
  });

  it("千条历史日志仅首次发送，后续变化的压缩字节不随历史长度增长", () => {
    const sender = new StateSender(),
      receiver = new StateReceiver<any>();
    const before = {
      id: "SYNTHETIC",
      revision: 1,
      log: Array.from({ length: 1500 }, (_, i) => ({
        seq: i + 1,
        text: `测试玩家采集资源并在第 ${i + 1} 次行动支付费用。`,
      })),
    };
    transfer(sender, receiver, before);
    const after = {
      ...before,
      revision: 2,
      log: [...before.log, { seq: 1501, text: "本次行动完成" }],
    };
    const { frame, received } = transfer(sender, receiver, after);
    expect(frame?.type).toBe("state-delta");
    expect(received).toEqual(after);
    const compressed = (value: object) =>
      deflateRawSync(JSON.stringify(value), { level: 3, memLevel: 7 }).length;
    expect(compressed(frame!)).toBeLessThan(
      compressed({ type: "state", room: after }) * 0.05,
    );
    expect(JSON.stringify(frame)).not.toContain("第 100 次行动");
  });

  it.each([
    { count: 2, expansion: false, oripathy: false, expert: false },
    { count: 3, expansion: true, oripathy: false, expert: false },
    { count: 4, expansion: true, oripathy: true, expert: true },
  ])(
    "$count 人企业 $expansion 感染者 $oripathy：完整八回合恢复每席相同视图",
    (config) => {
      let game = createGame(
        Array.from({ length: config.count }, (_, i) => ({
          id: `p${i}`,
          name: `测试${i}`,
        })),
        { ...config, seed: 52 },
      );
      const streams = game.players.map(() => ({
        sender: new StateSender(),
        receiver: new StateReceiver<object>(),
      }));
      for (let n = 0; ; n++) {
        expect(n).toBeLessThan(2000);
        const views = game.players.map((p) => projectView(game, p.id));
        views.forEach((view, i) => {
          const { sender, receiver } = streams[i];
          expect(transfer(sender, receiver, view).received).toEqual(json(view));
          if (n % 80 === 0) {
            streams[i] = {
              sender: new StateSender(),
              receiver: new StateReceiver<object>(),
            };
            expect(
              transfer(streams[i].sender, streams[i].receiver, view).received,
            ).toEqual(json(view));
          }
        });
        if (game.phase === "finished") break;
        const actor = views.find((view) => view.actions.length)!;
        game = applyCommand(game, actor.me, chooseBotAction(actor)!.command);
      }
      expect(game.round).toBe(8);
    },
    120000,
  );
});
