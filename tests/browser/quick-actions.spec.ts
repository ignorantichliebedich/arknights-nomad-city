import { test, expect, type Page } from "./fixtures/test.ts";
import { fixture, clickHandCard } from "./fixtures/table.ts";
import { DatabaseSync } from "node:sqlite";
import type { Room } from "../../apps/server/src/store.ts";
import { projectView } from "../../packages/rules/src/engine.ts";
function read(id: string) {
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!, {
    readOnly: true,
  });
  try {
    const row = db.prepare("SELECT body FROM rooms WHERE id = ?").get(id) as {
      body: string;
    };
    return (JSON.parse(row.body) as Room).game!;
  } finally {
    db.close();
  }
}
async function double(page: Page, selector: string, touch: boolean) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  if (touch) {
    const b = (await el.boundingBox())!;
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  } else await el.dblclick({ delay: 90 });
}
test("地图双击空位只放一枚，保留单击取消入口", async ({ page }, info) => {
  const { id } = await fixture(page),
    before = read(id),
    choice = projectView(before, before.players[0].id).influencePlacements![0];
  const selector = `[data-placement-slot="${choice.optionId}"]`;
  await double(page, selector, !!info.project.use.hasTouch);
  const [site, index] = choice.optionId.split(":");
  await expect
    .poll(() => read(id).sites[site].slots[Number(index)])
    .toBe(before.players[0].id);
  expect(read(id).revision).toBe(before.revision + 2);
  expect(read(id).mainRemaining).toBe(before.mainRemaining - 1);
  await expect(page.locator(".placement-panel")).toHaveCount(0);
});
test("主要行动双击可探索节点直接结算，待选择保留事件窗口", async ({
  page,
}, info) => {
  const { id } = await fixture(page),
    before = read(id),
    target = projectView(before, before.players[0].id).explorationTargets![0];
  expect(target).toBeTruthy();
  await double(
    page,
    `.board-hit[data-site-id="${target.target}"]`,
    !!info.project.use.hasTouch,
  );
  await expect.poll(() => read(id).decision?.kind).toBe("event");
  expect(read(id).mainRemaining).toBe(before.mainRemaining - 1);
  await expect(page.locator(".event-window")).toBeVisible();
  await expect(page.locator(".route-panel")).toHaveCount(0);
});
test("双击角色直接盖放一次，按玩家颜色使用卡背", async ({ page }, info) => {
  test.skip(!!info.project.use.hasTouch, "手指双击由手机扇面流程测试");
  const { id } = await fixture(page, "select"),
    before = read(id),
    card = page.locator(".hand-card.playable").first();
  await clickHandCard(page, card, 2);
  await expect.poll(() => read(id).players[0].selected).toBeTruthy();
  expect(read(id).revision).toBe(before.revision + 1);
  expect(read(id).players[0].selected).toBe(before.players[0].hand[0]);
  await expect(page.locator(".selected-role img")).toHaveAttribute(
    "src",
    "/assets/role-back-0.webp",
  );
  await page.reload();
  await expect(page.locator(".connection")).toContainText("已连接");
  expect(read(id).players[0].selected).toBe(before.players[0].hand[0]);
});
test("手指在同一张角色牌上连续轻点两次直接盖放", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, "触屏专属");
  await page.addInitScript(() => {
    (window as any).__tapTrace = [];
    for (const name of ["pointerdown", "pointerup"])
      document.addEventListener(
        name,
        (event) => {
          const e = event as PointerEvent;
          (window as any).__tapTrace.push({
            event: name,
            type: e.pointerType,
            primary: e.isPrimary,
            time: performance.now(),
            stamp: e.timeStamp,
            target:
              (e.target as Element).tagName +
              "." +
              (e.target as Element).getAttribute("class"),
            card: (e.target as Element)
              .closest(".hand-card")
              ?.getAttribute("aria-label"),
          });
        },
        true,
      );
  });
  const { id } = await fixture(page, "select"),
    before = read(id),
    card = page.locator(".hand-card.playable").first();
  await page.locator(".hand-cards").evaluate(async (el) => {
    el.getBoundingClientRect();
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  const point = await card.evaluate((el) => {
    const b = el.getBoundingClientRect(),
      points: { x: number; y: number }[] = [];
    for (
      let y = Math.max(0, b.top) + 12;
      y < Math.min(innerHeight, b.bottom) - 12;
      y += 10
    )
      for (
        let x = Math.max(0, b.left) + 12;
        x < Math.min(innerWidth, b.right) - 12;
        x += 10
      )
        if (document.elementFromPoint(x, y)?.closest(".hand-card") === el)
          points.push({ x, y });
    const center = points.reduce(
      (a, p) => ({
        x: a.x + p.x / points.length,
        y: a.y + p.y / points.length,
      }),
      { x: 0, y: 0 },
    );
    return (
      points.sort(
        (a, b) =>
          Math.hypot(a.x - center.x, a.y - center.y) -
          Math.hypot(b.x - center.x, b.y - center.y),
      )[0] ?? null
    );
  });
  expect(point).toBeTruthy();
  await page.touchscreen.tap(point!.x, point!.y);
  await page.touchscreen.tap(point!.x, point!.y);
  await expect
    .poll(() => read(id).players[0].selected, {
      message: JSON.stringify(
        await page.evaluate(() => (window as any).__tapTrace),
      ),
    })
    .toBe(before.players[0].hand[0]);
  expect(read(id).revision).toBe(before.revision + 1);
});
