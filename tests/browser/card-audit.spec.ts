import { test, expect, type Page } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand } from "../../packages/rules/src/engine.ts";
import { fixture } from "./fixtures/table.ts";

function read(id: string) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    return store.get(id)!.game!;
  } finally {
    store.close();
  }
}
async function entering(page: Page, card: "camp" | "mercenary") {
  const { id } = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!;
    const game = room.game!;
    const actor = game.players[0].id;
    game.market = [`${card}@audit`, "quarry-red@next"];
    game.facilityDeck = [];
    game.sites["D-1"].slots[0] = game.players[1].id;
    let next = applyCommand(game, actor, { type: "main", action: "build" });
    next = applyCommand(next, actor, {
      type: "choose",
      optionId: `${card}@audit:0:cash`,
    });
    room.game = next;
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".decision-title")).toBeVisible();
  return id;
}

test("简陋工程营的后续建设显示付款选择，确认后按原价扣款", async ({ page }) => {
  const id = await entering(page, "camp");
  await expect(page.locator(".decision-title")).toContainText("支付方式");
  await page
    .getByRole("button", { name: "选择设施 固源岩提纯厂", exact: true })
    .click();
  await page.getByRole("button", { name: "城市 2，空地", exact: true }).click();
  await expect(page.locator(".payment-options")).not.toContainText("免费建设");
  await page
    .locator(".payment-options")
    .getByRole("button", { name: /支付金券/ })
    .click();
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect
    .poll(() => read(id).players[0].built["1"]?.cardId)
    .toBe("quarry-red");
  expect(read(id).players[0].wallet.cash).toBe(82);
});

test("佣兵指挥部展示二选一，选择放置后只增加一枚影响力", async ({ page }) => {
  const id = await entering(page, "mercenary");
  const before = read(id);
  const actor = before.players[0].id;
  const count = (game: typeof before) =>
    Object.values(game.sites).reduce(
      (n, site) => n + site.slots.filter((v) => v === actor).length,
      0,
    );
  await expect(page.locator(".decision-title")).toContainText("替换或放置");
  await expect(
    page.getByRole("button", { name: "替换一个影响力", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "放置一个影响力", exact: true })
    .click();
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect.poll(() => read(id).decision?.kind).toBe("place");
  if (!(await page.locator(".decision-title").isVisible()))
    await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.locator(".action-list .action-button").first().click();
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect.poll(() => read(id).decision).toBeNull();
  expect(count(read(id))).toBe(count(before) + 1);
});
