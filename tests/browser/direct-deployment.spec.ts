import { test, expect, type Page } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand, projectView } from "../../packages/rules/src/engine.ts";
import { fixture } from "./fixtures/table.ts";

function read(id: string) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    return store.get(id)!;
  } finally {
    store.close();
  }
}
async function point(page: Page, target: string) {
  await page
    .locator(`.board-hit[data-site-id="${target}"]`)
    .click({ position: { x: 8, y: 8 } });
}

test("主要行动直接点图预览部署，改选取消不消耗，双击确认也只放一枚", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  const initial = read(id);
  const game = initial.game!;
  const me = game.players[0].id;
  const choices = projectView(game, me).influencePlacements!;
  const first = choices[0];
  const second = choices.find(
    (p) =>
      p.target !== first.target &&
      choices.filter((q) => q.target === p.target).length > 1,
  )!;
  const unavailable = game.board.nodes.find(
    (n) => !choices.some((p) => p.target === n.id),
  )!;
  await expect(page.locator(".map-prompt")).toContainText("点击地图高亮位置");
  await expect(
    page.locator(`.board-hit[data-site-id="${unavailable.id}"]`),
  ).not.toHaveClass(/deployable/);
  await point(page, unavailable.id);
  await expect(
    page.getByRole("dialog", { name: unavailable.id, exact: true }),
  ).toBeVisible();
  expect(read(id).revision).toBe(initial.revision);
  await page.keyboard.press("Escape");
  await page.locator(`[data-placement-slot="${first.optionId}"]`).click();
  await expect(page.locator(".placement-panel")).toContainText(first.target);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".piece-influence.ghost-piece")).toBeVisible();
  await point(page, second.target);
  const slots = choices.filter((p) => p.target === second.target);
  const selected = slots.at(-1)!;
  await page
    .getByRole("button", {
      name: `空位 ${Number(selected.optionId.split(":").at(-1)) + 1}`,
      exact: true,
    })
    .click();
  expect(read(id).game).toEqual(game);
  await page.getByRole("button", { name: "取消放置", exact: true }).click();
  await expect(page.locator(".placement-panel")).toHaveCount(0);
  await expect(page.locator(".piece-influence.ghost-piece")).toHaveCount(0);
  await page.locator(`.board-hit[data-site-id="${second.target}"]`).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".placement-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".placement-panel")).toHaveCount(0);
  expect(read(id).game).toEqual(game);
  await point(page, second.target);
  await page
    .getByRole("button", {
      name: `空位 ${Number(selected.optionId.split(":").at(-1)) + 1}`,
      exact: true,
    })
    .click();
  await page.screenshot({
    path: `test-results/${info.project.name}-direct-deployment.png`,
    animations: "disabled",
  });
  const panel = (await page.locator(".placement-panel").boundingBox())!;
  const portrait = (await page.locator(".active-entrepreneur").boundingBox())!;
  expect(panel.y).toBeGreaterThan(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(portrait.y);
  await page.getByRole("button", { name: "确认放置" }).click({ clickCount: 2 });
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(initial.revision + 2),
  );
  const done = read(id).game!;
  const [site, index] = selected.optionId.split(":");
  expect(done.sites[site].slots[Number(index)]).toBe(me);
  expect(done.mainRemaining).toBe(game.mainRemaining - 1);
  expect(done.players[0].wallet).toEqual(game.players[0].wallet);
  expect(projectView(done, me).players[0].availableMarkers).toBe(
    projectView(game, me).players[0].availableMarkers - 1,
  );
  await expect(page.locator(".board-hit.deployable")).toHaveCount(0);
  await expect(page.locator(".placement-panel, dialog[open]")).toHaveCount(0);
});

test("部署中刷新后仍能直接点图，待放置确认不再消耗主要行动", async ({
  page,
}) => {
  const { id } = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  let initial;
  try {
    const room = store.get(id)!;
    room.game = applyCommand(room.game!, room.seats[0].id, {
      type: "main",
      action: "deploy",
    });
    room.revision++;
    store.save(room);
    initial = room;
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".map-decision-title")).toContainText("放置影响力");
  const choice = initial.game!.decision!.options[0];
  await page.locator(`[data-placement-slot="${choice.id}"]`).click();
  await expect(page.locator(".placement-panel")).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".placement-panel")).toHaveCount(0);
  expect(read(id).game).toEqual(initial.game);
  await page.locator(`[data-placement-slot="${choice.id}"]`).click();
  await page.getByRole("button", { name: "确认放置" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(initial.revision + 1),
  );
  expect(read(id).game!.mainRemaining).toBe(initial.game!.mainRemaining);
});

test("等待他人行动时地图只查看信息，不提供部署预览", async ({
  page,
  browser,
}, info) => {
  const { id, friendToken } = await fixture(page);
  const initial = read(id);
  const target = projectView(initial.game!, initial.seats[0].id)
    .influencePlacements![0].target;
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
    await expect(friend.locator(".board-hit.deployable")).toHaveCount(0);
    await point(friend, target);
    await expect(
      friend.getByRole("dialog", { name: target, exact: true }),
    ).toBeVisible();
    await expect(friend.locator(".placement-panel")).toHaveCount(0);
    expect(read(id).game).toEqual(initial.game);
  } finally {
    await context.close();
  }
});
