import { test, expect } from "./fixtures/test.ts";
import { fixture } from "./fixtures/table.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { chooseFor, harvestPlanning } from "../fixtures/parallel.ts";
import { redZoneOpensAt } from "../../packages/rules/src/data.ts";
import { siteLayout } from "../../apps/web/src/board-layout.ts";
import { mkdirSync } from "node:fs";

for (const [count, reduce] of [
  [2, false],
  [3, false],
  [4, false],
  [3, true],
] as const) {
  test(`${count} 人源石尘按实际人数封锁红区，跨回合消散，刷新不重播${reduce ? "（减少动态）" : ""}`, async ({
    page,
  }, info) => {
    if (reduce) await page.emulateMedia({ reducedMotion: "reduce" });
    const { id } = await fixture(page, "actions", count);
    const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
    let points: { x: number; y: number; red: boolean }[];
    try {
      const room = store.get(id)!;
      let game = harvestPlanning(count, room.seats);
      for (const player of game.players.slice(1)) {
        if (!game.parallel!.players[player.id].ready)
          game = chooseFor(game, player.id, "done");
      }
      game.round = redZoneOpensAt(count) - 1;
      points = game.board.nodes.map((n) => {
        const f = siteLayout(game, n.id).frame;
        return { x: f.x + f.w / 2, y: f.y + f.h / 2, red: n.tier === "red" };
      });
      room.game = game;
      room.revision++;
      store.save(room);
    } finally {
      store.close();
    }
    await page.reload();
    const fog = page.locator(".originium-fog");
    await expect(fog).toHaveClass(/is-sealed/);
    await expect(fog).toHaveAttribute(
      "data-opens-at",
      String(redZoneOpensAt(count)),
    );
    expect(await fog.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe(
      "none",
    );
    if (reduce) {
      expect(
        await page
          .locator(".originium-particle")
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe("none");
    }
    expect(
      await page
        .locator(".originium-fog clipPath path")
        .evaluate(
          (el, samples) =>
            samples.every(
              (p) =>
                (el as SVGGeometryElement).isPointInFill(
                  new DOMPoint(p.x, p.y),
                ) === p.red,
            ),
          points!,
        ),
    ).toBe(true);
    if (info.project.name === "chrome-1920" || count === 3) {
      mkdirSync(".data/review-red-zone", { recursive: true });
      await page.screenshot({
        path: `.data/review-red-zone/${info.project.name}-${count}${reduce ? "-reduced" : ""}-sealed.png`,
      });
    }
    const reduced = await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    if (!reduced) {
      await page.evaluate(() => {
        (window as any).__dustCleared = false;
        document.addEventListener("animationstart", (e) => {
          if ((e as AnimationEvent).animationName === "originium-clear")
            (window as any).__dustCleared = true;
        });
      });
    }
    await page.getByRole("button", { name: "核对路费与采集" }).click();
    await page.getByRole("button", { name: "确认采集方案" }).click();
    // Two-player rules remove a market card before opening the new parallel hand phase.
    await expect(page.locator(".room-toolbar")).toContainText(
      `第 ${redZoneOpensAt(count)} / 8 回合`,
    );
    await expect(fog).toHaveCount(0);
    if (!reduced)
      expect(await page.evaluate(() => (window as any).__dustCleared)).toBe(
        true,
      );
    await page.reload();
    await expect(page.locator(".connection")).toContainText("已连接");
    await expect(fog).toHaveCount(0);
  });
}
