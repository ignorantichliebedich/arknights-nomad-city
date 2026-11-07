import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Matchmaker,
  digest,
  lobbyFilters,
} from "../apps/server/src/matchmaking.ts";
import { RoomStore, type Room } from "../apps/server/src/store.ts";
import type {
  GameMode,
  MatchStatus,
  PlayerCount,
} from "../packages/shared/lobby.ts";
const stores: RoomStore[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const s of stores.splice(0)) s.close();
});
const token = (n: number) => n.toString(16).padStart(64, "0");
function fixture(path = ":memory:", limits = {}) {
  const store = new RoomStore(path);
  stores.push(store);
  let now = 1_000_000;
  const online = new Set<string>(),
    changes: string[] = [];
  const matcher = new Matchmaker(store, {
    online: (r, p) => online.has(`${r}:${p}`),
    changed: (r) => changes.push(r),
    maxRooms: 1000,
    maxMatching: 1000,
    matchingPerIp: 8,
    now: () => now,
    ...limits,
  });
  function register(
    n: number,
    players: PlayerCount = null,
    mode: GameMode = "base",
    name = `玩家${n}`,
  ) {
    return matcher.register(token(n), "test-ip", name, { mode, players });
  }
  function room(
    id = "ABC123",
    isPublic = true,
    targetPlayers: PlayerCount = null,
  ) {
    const room: Room = {
      id,
      isPublic,
      targetPlayers,
      hostId: "host",
      expansion: false,
      revision: 0,
      game: null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      seats: [
        {
          id: "host",
          name: "房主",
          ready: true,
          tokenHash: digest("host-credential"),
        },
      ],
    };
    store.save(room);
    online.add(`${id}:host`);
    return room;
  }
  return {
    store,
    matcher,
    online,
    changes,
    register,
    room,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function matched(v: MatchStatus) {
  expect(v.state).toBe("matched");
  return v as Extract<MatchStatus, { state: "matched" }>;
}
describe("公开匹配分配与恢复", () => {
  it("未登记取消记录有总量限制，已有请求仍可取消", () => {
    const f = fixture(":memory:", { maxMatching: 1 });
    f.register(3, 4);
    f.matcher.cancel(token(1));
    expect(() => f.matcher.cancel(token(2))).toThrow("取消请求较多");
    expect(f.matcher.cancel(token(3)).state).toBe("cancelled");
  });
  it.each([2, 3, 4] as const)(
    "%i 人凑齐后只创建一桌，重复请求、轮询不会重复入座",
    (count) => {
      const f = fixture();
      for (let i = 1; i < count; i++)
        expect(f.register(i, count).state).toBe("waiting");
      const result = matched(f.register(count, count));
      for (let i = 1; i <= count; i++) {
        expect(matched(f.matcher.poll(token(i))).roomId).toBe(result.roomId);
        expect(matched(f.register(i, count)).roomId).toBe(result.roomId);
      }
      const room = f.store.get(result.roomId)!;
      expect(room).toMatchObject({
        targetPlayers: count,
        isPublic: true,
        game: null,
      });
      expect(room.seats).toHaveLength(count);
      expect(new Set(room.seats.map((s) => s.id)).size).toBe(count);
      expect(room.seats.every((s) => !s.ready)).toBe(true);
      expect(f.store.count()).toBe(1);
      expect(JSON.stringify(room)).not.toContain(token(1));
    },
  );
  it("默认人数不限可组成二人局，且能补足指定三人局；不同玩法与人数不混排", () => {
    const f = fixture();
    f.register(1, 3);
    f.register(2, 4, "expert");
    f.register(3, 2);
    f.register(4, null);
    expect(f.matcher.poll(token(1)).state).toBe("waiting");
    expect(matched(f.matcher.poll(token(3))).roomId).toBe(
      matched(f.matcher.poll(token(4))).roomId,
    );
    f.register(5, null);
    f.register(6, null);
    expect(f.matcher.poll(token(1)).state).toBe("matched");
    expect(f.matcher.poll(token(2)).state).toBe("waiting");
    expect(f.store.count()).toBe(2);
    const g = fixture();
    g.register(10);
    expect(matched(g.register(11)).roomId).toBeTruthy();
  });
  it("短暂会合窗口优先组成新桌，队列不足时补入在线公开房间并确定人数", () => {
    const f = fixture();
    const publicRoom = f.room();
    f.register(1, 3);
    expect(f.store.get(publicRoom.id)!.seats).toHaveLength(1);
    f.register(2, 3);
    f.register(3, 3);
    expect(matched(f.matcher.poll(token(1))).roomId).not.toBe(publicRoom.id);
    f.register(4, 3);
    f.advance(1001);
    expect(matched(f.matcher.poll(token(4))).roomId).toBe(publicRoom.id);
    expect(f.store.get(publicRoom.id)).toMatchObject({
      targetPlayers: 3,
      seats: [{ ready: false }, { ready: false }],
    });
  });
  it("私密、满员、非同玩法和房主离线的房间不会被补入或展示", () => {
    const f = fixture();
    f.room("AAA111", false);
    f.room("BBB222");
    f.online.delete("BBB222:host");
    const full = f.room("CCC333", true, 2);
    full.seats.push({ ...full.seats[0], id: "friend", name: "朋友" });
    f.store.save(full);
    const other = f.room("DDD444");
    other.expansion = true;
    f.store.save(other);
    expect(f.matcher.rooms({ mode: "base", players: null })).toEqual([]);
    f.register(1, 4);
    f.advance(1001);
    expect(f.matcher.poll(token(1)).state).toBe("waiting");
    expect(f.store.get("AAA111")!.seats).toHaveLength(1);
  });
  it("取消先于迟到的登记请求时留下取消记录；旧请求不能重新入队", () => {
    const f = fixture();
    expect(f.matcher.cancel(token(1)).state).toBe("cancelled");
    expect(f.register(1, 2).state).toBe("cancelled");
    expect(f.register(2, 2).state).toBe("waiting");
    expect(f.store.count()).toBe(0);
  });
  it("取消刚分配的离线席位会释放空位并转交房主，不产生重复席位", () => {
    const f = fixture();
    f.register(1, 2);
    const id = matched(f.register(2, 2)).roomId;
    const previousHost = f.store.get(id)!.hostId;
    expect(f.matcher.cancel(token(1)).state).toBe("cancelled");
    expect(f.store.get(id)!.seats).toHaveLength(1);
    expect(f.store.get(id)!.hostId).not.toBe(previousHost);
    expect(f.register(1, 2).state).toBe("cancelled");
  });
  it("已验证入座后取消旧匹配不会移除席位；断线等待和未到达席位分别过期", () => {
    const f = fixture();
    f.register(1, 2);
    const result = matched(f.register(2, 2));
    const seat = matched(f.matcher.poll(token(1)));
    f.matcher.claim(token(1), seat.roomId, seat.playerId);
    expect(f.matcher.cancel(token(1)).state).toBe("matched");
    f.advance(60_001);
    f.matcher.pump();
    expect(f.store.get(result.roomId)!.seats.map((s) => s.id)).toEqual([
      seat.playerId,
    ]);
    expect(f.matcher.poll(token(2)).state).toBe("expired");
    f.register(3, 4);
    f.advance(90_001);
    expect(f.matcher.poll(token(3)).state).toBe("expired");
    expect(f.register(3, 4).state).toBe("expired");
  });
  it("同名昵称在自动组桌时使用区分后缀，避免两人占用同名席位", () => {
    const f = fixture();
    f.register(1, 2, "base", "旅人");
    const result = matched(f.register(2, 2, "base", "旅人"));
    expect(f.store.get(result.roomId)!.seats.map((s) => s.name)).toEqual([
      "旅人",
      "旅人·2",
    ]);
  });
  it("服务重启后恢复等待队列及已分配凭证，公开目录也仍存在", () => {
    const path = join(
      mkdtempSync(join(tmpdir(), "nomad-match-")),
      "rooms.sqlite",
    );
    const first = fixture(path);
    first.room();
    first.register(1, 2);
    stores.splice(stores.indexOf(first.store), 1);
    first.store.close();
    const second = fixture(path);
    second.online.add("ABC123:host");
    const result = matched(second.register(2, 2));
    expect(matched(second.matcher.poll(token(1))).roomId).toBe(result.roomId);
    expect(second.store.openRooms().some((r) => r.id === "ABC123")).toBe(true);
  });
  it("任何建房写入失败时，席位和整组队列分配一起回滚", () => {
    const f = fixture();
    f.register(1, 2);
    const spy = vi.spyOn(f.store, "save").mockImplementation(() => {
      throw new Error("disk failure");
    });
    expect(() => f.register(2, 2)).toThrow("disk failure");
    spy.mockRestore();
    expect(f.store.count()).toBe(0);
    expect(f.matcher.poll(token(1)).state).toBe("waiting");
    expect(f.matcher.poll(token(2)).state).toBe("expired");
  });
  it("队列数量、网络名额与筛选值受服务端限制", () => {
    const f = fixture(":memory:", { matchingPerIp: 1 });
    f.register(1, 4);
    expect(() => f.register(2, 4)).toThrow("匹配席位较多");
    expect(() => lobbyFilters({ players: 5 })).toThrow();
    expect(() => lobbyFilters({ mode: "custom" })).toThrow();
    expect(lobbyFilters({})).toEqual({ mode: "base", players: null });
  });
});
