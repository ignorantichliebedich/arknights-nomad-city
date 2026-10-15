import { test, expect, type Page } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import {
  applyCommand,
  createGame,
  projectView,
} from "../../packages/rules/src/engine.ts";

import { fixture, clickHandCard } from "./fixtures/table.ts";

async function revision(page: Page) {
  return (await page.locator(".room-toolbar").getAttribute("data-revision"))!;
}

test("手牌亲自选择、可撤回预览、确认后才秘密盖放", async ({ page }, info) => {
  await fixture(page, "select");
  const before = await revision(page);
  const handCount = await page.locator(".hand-card").count();
  const card = page.locator(".hand-card.playable").first();
  await clickHandCard(page, card);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".action-explanation")).toContainText("策略：");
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before,
  );
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认盖放" })).toBeDisabled();
  await card.focus();
  await page.keyboard.press("Enter");
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${info.project.name}-manual-role.png`,
  });
  await page.getByRole("button", { name: "确认盖放" }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(Number(before) + 1),
  );
  await expect(
    page.getByRole("dialog", { name: "角色手牌", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^角色手牌 / }).click();
  await expect(page.locator(".selected-role")).toBeVisible();
  await expect(page.locator(".hand-card")).toHaveCount(handCount - 1);
  await page.reload();
  await page.getByRole("button", { name: /^角色手牌 / }).click();
  await expect(page.locator(".selected-role")).toBeVisible();
});

test("棋盘点选显示落子预览，确认后产生影响力并给出反馈", async ({
  page,
}, info) => {
  await fixture(page);
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.getByRole("button", { name: "部署 · 放置一次影响力" }).click();
  await page.getByRole("button", { name: "执行行动" }).click();
  await expect(page.locator(".map-decision-title")).toContainText(
    "放置影响力 · 剩",
  );
  const before = await revision(page);
  await page.locator(".deployment-slot").first().click();
  await expect(page.locator(".placement-panel")).toBeVisible();
  await expect(page.locator(".placement-preview")).toBeVisible();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before,
  );
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${info.project.name}-manual-board.png`,
  });
  await page.getByRole("button", { name: "确认放置" }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(Number(before) + 1),
  );
  await expect(page.locator(".table-feedback")).toContainText("放置影响力");
  await expect(page.locator(".placement-preview")).toHaveCount(0);
});

test("建设依次选择设施、城市格和费用，换牌不会沿用旧付款", async ({
  page,
}, info) => {
  await fixture(page);
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.getByRole("button", { name: "建设 · 购买并放置设施" }).click();
  await page.getByRole("button", { name: "执行行动" }).click();
  await expect(page.locator(".build-picker")).toBeVisible();
  const before = await revision(page);
  await page
    .getByRole("button", { name: /^选择设施 / })
    .first()
    .click();
  await page.locator(".build-city-grid button:not(:disabled)").first().click();
  await page.locator(".payment-options button").first().click();
  await expect(page.getByRole("button", { name: "确认选择" })).toBeEnabled();
  await page
    .getByRole("button", { name: /^选择设施 / })
    .last()
    .click();
  await expect(page.getByRole("button", { name: "确认选择" })).toBeDisabled();
  await expect(page.locator(".payment-options")).toHaveCount(0);
  const cell = page.locator(".build-city-grid button:not(:disabled)").first();
  const cellLabel = await cell.getAttribute("aria-label");
  await cell.click();
  await page.locator(".payment-options button").first().click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before,
  );
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${info.project.name}-manual-build.png`,
  });
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(Number(before) + 1),
  );
  await expect(page.getByRole("dialog", { name: "设施已落位" })).toBeVisible();
  await page.getByRole("button", { name: "继续拓荒" }).click();
  await page.getByRole("button", { name: "我的城市", exact: true }).click();
  const index = Number(/城市 (\d+)/.exec(cellLabel!)![1]) - 1;
  await expect(
    page.locator(".city-grid .city-cell").nth(index).locator("img"),
  ).toBeVisible();
});

test("棋桌占满窗口，原图、放大、拖动与牌面全文可用", async ({ page }, info) => {
  await fixture(page);
  const viewport = page.viewportSize()!;
  const board = (await page.locator(".board-surface").boundingBox())!;
  expect(board.width).toBeGreaterThan(viewport.height < 900 ? 610 : 900);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(viewport.height + 1);
  const art = await page.locator(".board-art").getAttribute("src");
  expect(art).toMatch(/-hd.webp$/);
  const size = await page.evaluate(
    (src) =>
      new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth);
        img.src = src!;
      }),
    art,
  );
  expect(size).toBe(5000);
  await page.getByRole("button", { name: "放大棋盘", exact: true }).click();
  await page.getByRole("button", { name: "放大棋盘", exact: true }).click();
  await expect(page.locator(".zoom-controls")).toContainText("150%");
  const bounds = (await page.locator(".board-viewport").boundingBox())!;
  // Empty map margin pans the viewport without selecting a game target.
  await page.mouse.move(bounds.x + bounds.width - 25, bounds.y + 150);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 25, bounds.y + 70, {
    steps: 4,
  });
  await page.mouse.up();
  expect(
    await page.locator(".board-viewport").evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "复位", exact: true }).click();
  await page.getByRole("button", { name: "全屏棋桌", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.className))
    .toBe("game-layout");
  await page.getByRole("button", { name: "我的城市", exact: true }).click();
  await expect(page.locator(".city-grid .city-cell")).toHaveCount(12);
  await expect(page.locator(".city-grid")).toBeVisible();
  // Firefox reserves Escape for leaving fullscreen before closing a dialog.
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.getByRole("button", { name: "退出全屏", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await page.getByRole("button", { name: /^角色手牌 / }).click();
  await page.keyboard.press("Tab");
  await expect(page.locator(".hand-card").first()).toBeFocused();
  await page.locator(".hand-detail").first().click();
  await expect(page.locator(".card-detail")).toContainText("策略：");
  await expect(page.locator(".card-detail")).toContainText("计谋：");
  expect(
    await page
      .locator(".card-artwork img")
      .evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBe(1200);
  await page.getByRole("button", { name: "放大牌面", exact: true }).click();
  await expect(page.locator(".card-artwork")).toHaveClass(/enlarged/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${info.project.name}-large-table.png`,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport.width);
});

test("关窗保留待选步骤，刷新后仍需亲自落子确认", async ({ page }) => {
  await fixture(page);
  await expect(page.locator(".action-panel, .hand-area")).toHaveCount(0);
  const initial = await revision(page);
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.getByRole("button", { name: "部署 · 放置一次影响力" }).click();
  await page.getByRole("button", { name: "执行行动" }).click();
  await expect(page.locator(".interaction-window")).toHaveCount(0);
  // Closing the composer is local; wait for the acknowledged main action before
  // capturing the version against which read-only previews will be compared.
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(Number(initial) + 1),
  );
  await expect(page.locator(".map-decision-title")).toContainText("放置影响力");
  const before = await revision(page);
  await page.locator(".deployment-slot").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".placement-panel")).toBeVisible();
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "行动安排" })).toBeVisible();
  if (!(await page.getByRole("button", { name: "确认选择" }).isEnabled()))
    await page.locator(".action-list .action-button").first().click();
  const selection = await page.locator(".commit-tray > strong").textContent();
  await page.keyboard.press("Escape");
  await expect(page.locator(".interaction-window")).toHaveCount(0);
  await expect(page.locator(".placement-preview")).toBeVisible();
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await expect(page.locator(".commit-tray > strong")).toHaveText(selection!);
  await page.reload();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before,
  );
  await expect(page.locator(".interaction-window")).toHaveCount(0);
  await expect(page.locator(".map-decision-title")).toContainText("放置影响力");
  await page.getByRole("button", { name: "目标列表" }).click();
  await expect(page.getByRole("button", { name: "确认选择" })).toBeDisabled();
  await page.getByRole("button", { name: "返回地图选择位置" }).click();
  const node = page.locator('.board-hit.legal[data-site-id*="-0"]').first();
  const siteId = (await node.getAttribute("data-site-id"))!;
  await node.click({ position: { x: 8, y: 8 } });
  await page.getByRole("button", { name: "确认放置" }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(Number(before) + 1),
  );
  await expect(page.locator(".piece-influence").first()).toBeVisible();
  const piece = page
    .locator(`.board-hit[data-site-id="${siteId}"]`)
    .locator("..")
    .locator('.piece-influence[data-seat="0"]')
    .first();
  const bounds = (await piece.boundingBox())!;
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await expect(
    page.getByRole("dialog", { name: siteId, exact: true }),
  ).toBeVisible();
});

test("事件独立弹窗、关窗与刷新不代选，确认后更新资源盘", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  let label = "";
  let wallet: Record<string, number> = {};
  try {
    const room = store.get(id)!;
    let game = applyCommand(room.game!, room.seats[0].id, {
      type: "main",
      action: "explore",
    });
    for (let i = 0; i < 12 && game.decision?.kind !== "event"; i++) {
      if (!game.decision)
        throw new Error("Exploration must reach an event choice");
      game = applyCommand(game, game.decision.playerId, {
        type: "choose",
        optionId: game.decision.options[0].id,
      });
    }
    expect(game.decision?.kind).toBe("event");
    const actor = game.decision!.playerId;
    const choice = projectView(game, actor).actions[0];
    label = choice.label;
    wallet = applyCommand(game, actor, choice.command).players[0].wallet;
    room.game = game;
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  const event = page.getByRole("dialog", { name: "探索事件", exact: true });
  await expect(event).toBeVisible();
  await expect(event.locator(".event-art img")).toBeVisible();
  const before = await revision(page);
  await page.keyboard.press("Escape");
  await expect(event).toHaveCount(0);
  await expect(page.locator(".board-hit.legal")).toHaveCount(0);
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before,
  );
  await page.getByRole("button", { name: "处理事件", exact: true }).click();
  await expect(event).toBeVisible();
  await page
    .getByRole("button", { name: "查看事件完整牌面", exact: true })
    .click();
  await expect(page.locator(".card-artwork img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(event).toBeVisible();
  await page.reload();
  await expect(event).toBeVisible();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before,
  );
  await event
    .locator(".action-list .action-button")
    .filter({ hasText: label })
    .click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before,
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-event-window.png`,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(Number(before) + 1),
  );
  for (const [type, amount] of Object.entries(wallet))
    await expect(page.locator(`.stock-${type} strong`)).toHaveText(
      String(amount),
    );
  await expect(page.locator(".entrepreneur-portrait img")).toHaveCount(4);
  await expect(page.locator(".board-surface .piece-city")).toHaveCount(4);
  expect(
    await page
      .locator(".stock-cash strong")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(27);
});

test("朋友行动时扇形手牌保持展开，剩余手牌与席位同步", async ({
  page,
  browser,
}, info) => {
  const { id, friendToken } = await fixture(page, "select");
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  try {
    await context.addInitScript(
      ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
      { id, token: friendToken },
    );
    const friend = await context.newPage();
    await friend.goto(`/room/${id}`);
    await expect(friend.locator(".connection")).toContainText("已连接");
    await clickHandCard(page, page.locator(".hand-card.playable").first());
    await expect(page.locator(".hand-card.playable").first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "确认盖放" }).click();
    await expect(page.locator(".interaction-window")).toHaveCount(0);
    await page.getByRole("button", { name: /^角色手牌 / }).click();
    const cards = await page.locator(".hand-card").count();
    const before = await revision(page);
    await clickHandCard(friend, friend.locator(".hand-card.playable").first());
    await expect(friend.locator(".hand-card.playable").first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await friend.getByRole("button", { name: "确认盖放" }).click();
    await expect(page.locator(".room-toolbar")).not.toHaveAttribute(
      "data-revision",
      before,
    );
    await expect(page.locator(".fan-hand.is-expanded")).toBeVisible();
    await expect(page.locator(".hand-card")).toHaveCount(cards);
    await expect(page.locator(".hand-card.playable")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".player-row").nth(1)).toContainText("手牌 4");
  } finally {
    await context.close();
  }
});
