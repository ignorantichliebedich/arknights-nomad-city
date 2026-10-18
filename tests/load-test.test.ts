import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { RoomStore } from "../apps/server/src/store.ts";
import { createServer } from "node:http";

describe("隔离承压工具", () => {
  it("目标端口未提供隔离身份时拒绝施压，即使控制端口有效", async () => {
    let resets = 0,
      targetRequests = 0;
    const target = createServer((_req, res) => {
      targetRequests++;
      res.end('{"status":"ok"}');
    });
    const control = createServer((req, res) => {
      if (req.url === "/identity")
        res.end(
          JSON.stringify({
            kind: "nomad-isolated-load-test",
            instanceId: "synthetic-isolation-id",
            version: "test",
          }),
        );
      else {
        resets++;
        res.end("[]");
      }
    });
    await Promise.all(
      [target, control].map(
        (server) => new Promise<void>((r) => server.listen(0, "127.0.0.1", r)),
      ),
    );
    const address = (server: typeof target) =>
      `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      await expect(
        promisify(execFile)(
          process.execPath,
          [
            "tools/load-test.ts",
            "client",
            "--target",
            address(target),
            "--control",
            address(control),
          ],
          { timeout: 5000 },
        ),
      ).rejects.toThrow("same isolated load-test instance");
      expect(resets).toBe(0);
      expect(targetRequests).toBe(1);
    } finally {
      await Promise.all(
        [target, control].map(
          (server) =>
            new Promise<void>((r) => {
              server.closeAllConnections();
              server.close(() => r());
            }),
        ),
      );
    }
  });

  it("完成两档真实同步、统计回执一致，忽略外部生产数据库环境变量", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "nomad-load-tool-test-"));
    const protectedDatabase = resolve(directory, "protected.sqlite");
    const store = new RoomStore(protectedDatabase);
    store.save(
      {
        id: "KEEP01",
        hostId: "keep",
        revision: 7,
        expansion: false,
        seats: [
          {
            id: "keep",
            name: "保留玩家",
            ready: false,
            tokenHash: "synthetic-only",
          },
        ],
        game: null,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "keep-receipt",
        playerId: "keep",
        response: { type: "ack", revision: 7 },
      },
    );
    store.close();
    const before = readFileSync(protectedDatabase);
    const output = resolve(directory, "report.json");
    await promisify(execFile)(
      process.execPath,
      [
        "tools/load-test.ts",
        "run",
        "--tables",
        "1,2",
        "--seconds",
        "5",
        "--interval-ms",
        "1000",
        "--output",
        output,
      ],
      {
        cwd: resolve("."),
        timeout: 35000,
        env: { ...process.env, DATABASE_PATH: protectedDatabase },
      },
    );
    const report = JSON.parse(readFileSync(output, "utf8"));
    expect(report.results).toHaveLength(2);
    for (const tier of report.results) {
      expect(tier.commands).toBeGreaterThanOrEqual(5 * tier.tables);
      expect(tier.completedSyncs).toBe(tier.commands);
      expect(tier.server.receipts).toBe(tier.commands);
      expect(tier.server.integrity).toBe("ok");
      expect(tier.failures).toEqual([]);
      expect(tier.receivedMiB).toBeGreaterThan(0);
      expect(tier.allPlayersP95Ms).toBeGreaterThan(0);
    }
    expect(readFileSync(protectedDatabase)).toEqual(before);
  }, 40000);
});
