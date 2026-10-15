import { test, expect, type Page } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand } from "../../packages/rules/src/engine.ts";
import type { Wallet } from "../../packages/rules/src/types.ts";
import { fixture } from "./fixtures/table.ts";

/** Draw a known printed event through the real discovery handler. */
async function revealEvent(
  page: Page,
  roomId: string,
  eventId: string,
  expansion = false,
  cash = 100,
) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  let revision = 0;
  try {
    const room = store.get(roomId)!;
    const game = room.game!;
    const actor = game.players[0].id;
    const tier = eventId.split("-")[0];
    const node = game.board.nodes.find(
      (n) => n.tier === tier && !game.sites[n.id].resource,
    )!;
    game.expansion = room.expansion = expansion;
    game.players[0].wallet.cash = cash;
    game.players[0].wallet.score = 10;
    game.activeEnterprises = expansion ? ["bank", "heide"] : [];
    for (const player of game.players)
      player.enterprise = Object.fromEntries(
        game.activeEnterprises.map((company) => [company, 0]),
      );
    game.sites[node.id].slots[0] = game.players[1].id;
    game.eventDecks[tier] = [
      eventId,
      ...game.eventDecks[tier].filter((id) => id !== eventId),
    ];
    game.queue = [];
    game.decision = {
      playerId: actor,
      kind: "fixture",
      title: "受控探索准备",
      options: [
        {
          id: "reveal",
          label: "探索事件",
          steps: [{ kind: "discover", actor, data: { node: node.id } }],
        },
      ],
    };
    room.game = applyCommand(game, actor, {
      type: "choose",
      optionId: "reveal",
    });
    expect(room.game.decision?.kind).toBe("event");
    room.revision++;
    revision = room.revision;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "探索事件", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(revision),
  );
  return revision;
}

function wallet(roomId: string): Wallet {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    return store.get(roomId)!.game!.players[0].wallet;
  } finally {
    store.close();
  }
}

async function checkCardLayout(page: Page) {
  const dialog = page.locator(".event-card-window");
  await dialog.locator(".event-art img").evaluate(async (img) => {
    await (img as HTMLImageElement).decode();
    await Promise.all(
      img
        .closest(".event-encounter")!
        .getAnimations()
        .map((a) => a.finished),
    );
  });
  const card = (await dialog.locator(".event-art img").boundingBox())!;
  const buttons = (await dialog.locator(".event-options").boundingBox())!;
  const bounds = (await dialog.boundingBox())!;
  const confirmation = (await dialog
    .locator(".event-resolution")
    .boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(card.width).toBeGreaterThan(600);
  expect(card.width / card.height).toBeCloseTo(600 / 424, 1);
  expect(buttons.y).toBeGreaterThanOrEqual(card.y + card.height);
  expect(bounds.y).toBeGreaterThanOrEqual(11);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 10);
  expect(
    Math.abs(confirmation.y + confirmation.height - bounds.y - bounds.height),
  ).toBeLessThan(2);
  expect(
    Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2),
  ).toBeLessThan(3);
  expect(
    await dialog.evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(1);
  await expect(
    dialog.locator(".event-option .stock-token").first(),
  ).toBeVisible();
  const icons = await dialog
    .locator(".event-option .stock-token")
    .evaluateAll((imgs) =>
      imgs.every(
        (img) =>
          (img as HTMLImageElement).complete &&
          (img as HTMLImageElement).naturalWidth > 0,
      ),
    );
  expect(icons).toBe(true);
}

test("原事件卡居中放大，按钮选择与取消不结算，键盘确认才领取资源", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  const before = await revealEvent(page, id, "green-1");
  const initial = wallet(id);
  const event = page.locator(".event-card-window");
  await expect(event.locator(".event-art img")).toHaveAttribute(
    "alt",
    "清理虫巢",
  );
  await expect(event.locator(".event-option")).toHaveCount(2);
  await checkCardLayout(page);
  const ore = event.getByRole("button", { name: "获得 3 源石", exact: true });
  await ore.focus();
  await page.keyboard.press("Enter");
  await expect(ore).toHaveAttribute("aria-pressed", "true");
  await event.getByRole("button", { name: "查看事件完整牌面" }).click();
  await expect(page.locator(".card-artwork img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ore).toHaveAttribute("aria-pressed", "true");
  await event.getByRole("button", { name: "取消选择" }).click();
  await expect(event.getByRole("button", { name: "确认选择" })).toBeDisabled();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(before),
  );
  expect(wallet(id)).toEqual(initial);
  await ore.click();
  await page.screenshot({
    path: `test-results/${info.project.name}-event-card-green.png`,
    animations: "disabled",
  });
  await event.getByRole("button", { name: "确认选择" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(before + 1),
  );
  expect(wallet(id)).toEqual({ ...initial, ore: initial.ore + 3 });
  await expect(event).toHaveCount(0);
});

test("三个结果完整排列，费用不足不展示非法按钮，支付后接续地图选择", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  await revealEvent(page, id, "yellow-3", false, 0);
  const event = page.locator(".event-card-window");
  await expect(event.locator(".event-option")).toHaveCount(2);
  await expect(event.getByRole("button", { name: /支付 4 金券/ })).toHaveCount(
    0,
  );
  const before = await revealEvent(page, id, "yellow-3");
  await expect(event.locator(".event-option")).toHaveCount(3);
  await checkCardLayout(page);
  const cash = wallet(id).cash;
  await event.getByRole("button", { name: /支付 4 金券/ }).click();
  expect(wallet(id).cash).toBe(cash);
  await page.screenshot({
    path: `test-results/${info.project.name}-event-card-yellow.png`,
    animations: "disabled",
  });
  await event.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(before + 1),
  );
  expect(wallet(id).cash).toBe(cash - 4);
  await expect(event).toHaveCount(0);
  await expect(page.locator(".map-decision-title")).toContainText("移除影响力");
});

test("企业扩展事件展示替换原卡，第三选项和扣分升级均接续企业选择", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  for (const scenario of [
    {
      id: "yellow-1",
      art: "/assets/cards-167/11.webp",
      choice: "支付 1 异铁，提升一家企业",
      cost: "iron" as const,
    },
    {
      id: "red-2",
      art: "/assets/cards-156/6.webp",
      choice: "失去 1 分，提升同一家企业两级",
      cost: "score" as const,
    },
  ]) {
    const before = await revealEvent(page, id, scenario.id, true);
    const initial = wallet(id);
    const event = page.locator(".event-card-window");
    await expect(event.locator(".event-art img")).toHaveAttribute(
      "src",
      scenario.art,
    );
    await expect(event.locator(".event-option")).toHaveCount(3);
    await checkCardLayout(page);
    await event
      .getByRole("button", { name: scenario.choice, exact: true })
      .click();
    expect(wallet(id)).toEqual(initial);
    await page.screenshot({
      path: `test-results/${info.project.name}-event-card-${scenario.id}.png`,
      animations: "disabled",
    });
    await event.getByRole("button", { name: "确认选择" }).click();
    await expect(page.locator(".room-toolbar")).toHaveAttribute(
      "data-revision",
      String(before + 1),
    );
    expect(wallet(id)[scenario.cost]).toBe(initial[scenario.cost] - 1);
    await expect(event).toHaveCount(0);
    await expect(page.locator(".enterprise-choice-grid")).toBeVisible();
  }
});
