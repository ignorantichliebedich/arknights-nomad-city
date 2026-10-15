import { test, expect, type Page } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import {
  applyCommand,
  projectView,
  routeTo,
} from "../../packages/rules/src/engine.ts";
import type { GameState } from "../../packages/rules/src/types.ts";
import { fixture } from "./fixtures/table.ts";

function readGame(id: string) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    return store.get(id)!.game!;
  } finally {
    store.close();
  }
}
async function scenario(
  page: Page,
  id: string,
  change: (g: GameState) => GameState,
) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!;
    room.game = change(room.game!);
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".connection")).toContainText("已连接");
}
async function revision(page: Page) {
  return Number(
    await page.locator(".room-toolbar").getAttribute("data-revision"),
  );
}
async function center(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("城市拖起显示虚线、无效落点不提交，合法落点松手立即移动扣费", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  const game = readGame(id);
  const me = game.players[0];
  const move = projectView(game, me.id).cityDestinations![0];
  expect(move).toBeTruthy();
  const before = await revision(page);
  const origin = await center(
    page,
    `.city-drag-handle[data-player="${me.id}"] .city-grab-area`,
  );
  const end = await center(page, `.board-hit[data-site-id="${move.target}"]`);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x - 15, origin.y + 18, { steps: 3 });
  await expect(page.locator(".drag-city")).toBeVisible();
  await expect(page.locator(".route-line").first()).toBeVisible();
  expect(await page.locator(".board-hit.legal").count()).toBeGreaterThan(0);
  const bounds = (await page.locator(".board-viewport").boundingBox())!;
  await page.mouse.move(bounds.x + 120, bounds.y + 30, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".drag-city")).toHaveCount(0);
  expect(await revision(page)).toBe(before);
  expect(readGame(id).players[0].city).toBe(me.city);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(page.locator(".board-hit.drop-target")).toHaveAttribute(
    "data-site-id",
    move.target,
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-city-drag.png`,
    animations: "disabled",
  });
  await page.mouse.up();
  await expect(
    page.locator(`.city-position[data-player="${me.id}"]`),
  ).toHaveAttribute("data-city", move.target);
  await expect(page.locator(".stock-ore strong")).toHaveText("17");
  expect(await revision(page)).toBe(before + 2);
  if (readGame(id).decision?.kind === "event") {
    await expect(page.locator(".interaction-window")).toHaveCount(0);
    await expect(page.locator(".event-window")).toBeVisible();
  }
});

test("采集在地图勾选、撤回、刷新保留路线，确认后按共用航道收费", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  await scenario(page, id, (g) => {
    for (const s of Object.values(g.sites)) s.slots.fill(null);
    const me = g.players[0];
    me.city = "A-01";
    for (const n of ["A-02", "A-03"]) {
      g.sites[n].resource = "rock";
      g.sites[n].amount = 2;
      g.sites[n].slots[0] = me.id;
    }
    const road = routeTo(g, me.id, "A-02").roads[0];
    g.sites[road].slots[0] = g.players[1].id;
    g.phase = "harvest";
    g.queue = [];
    g.decision = {
      playerId: me.id,
      kind: "fixture",
      title: "采集",
      options: [
        {
          id: "begin",
          label: "开始",
          steps: [{ kind: "harvest", actor: me.id }],
        },
      ],
    };
    return applyCommand(g, me.id, { type: "choose", optionId: "begin" });
  });
  const initial = readGame(id);
  const wallet = { ...initial.players[0].wallet };
  await expect(page.locator(".turn-announcement")).toContainText("你的回合");
  await expect(page.locator(".turn-announcement")).toHaveCount(0, {
    timeout: 4000,
  });
  for (const target of ["A-02", "A-03"]) {
    await page.locator(`.board-hit[data-site-id="${target}"]`).click();
    await expect(page.locator(".route-target-list .picked")).toHaveCount(
      target === "A-02" ? 1 : 2,
    );
  }
  await expect(page.locator(".turn-announcement")).toHaveCount(0);
  await expect(page.locator(".harvest-check")).toHaveCount(2);
  expect(readGame(id).players[0].wallet).toEqual(wallet);
  await page.reload();
  await expect(page.locator(".harvest-check")).toHaveCount(2);
  await page.locator('.board-hit[data-site-id="A-03"]').click();
  await expect(page.locator(".harvest-check")).toHaveCount(1);
  await page.locator('.board-hit[data-site-id="A-03"]').click();
  await expect(page.locator(".harvest-check")).toHaveCount(2);
  const selected = readGame(id);
  const view = projectView(selected, selected.players[0].id);
  const done = view.decision!.options.find((o) => o.id === "done")!;
  const cost = done.preview!.tolls!.reduce((sum, t) => sum + t.amount, 0);
  expect(new Set(done.preview!.roads).size).toBe(done.preview!.roads!.length);
  await page.getByRole("button", { name: "核对路费与采集" }).click();
  expect(readGame(id).players[0].wallet).toEqual(wallet);
  await page.screenshot({
    path: `test-results/${info.project.name}-harvest-routes.png`,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "确认支付并采集" }).click();
  for (let i = 0; i < 10; i++) {
    await expect
      .poll(() => readGame(id).revision)
      .toBeGreaterThan(selected.revision);
    const current = readGame(id);
    if (current.decision?.kind !== "toll") break;
    const old = await revision(page);
    await page.locator(".toll-recipients button").first().click();
    await page.getByRole("button", { name: "确认支付 2 金券" }).click();
    await expect.poll(() => revision(page)).toBeGreaterThan(old);
  }
  await expect(page.locator(".stock-rock strong")).toHaveText(
    String(wallet.rock + 4),
  );
  await expect(page.locator(".stock-cash strong")).toHaveText(
    String(wallet.cash - cost),
  );
  await expect(page.locator(".stock-rock .flip-number")).toHaveClass(
    /number-up/,
  );
  expect(readGame(id).players[1].wallet.cash).toBeGreaterThan(
    initial.players[1].wallet.cash,
  );
});

test("宣告显示原版样式和实际城市格，结果停留且得分标记同步", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  await scenario(page, id, (g) => {
    g.players[0].built = {
      "0": { cardId: "industrial", used: false },
      "3": { cardId: "escort", used: false },
      "4": { cardId: "industrial", used: false },
    };
    if (!g.patterns.includes("composite")) g.patterns.push("composite");
    return g;
  });
  await page
    .getByRole("button", { name: "设施供应与城市样式", exact: true })
    .click();
  await expect(page.locator(".supply-cards .supply-card")).toHaveCount(6);
  const pattern = page
    .locator(".supply-patterns article")
    .filter({ hasText: "复合动力系统" });
  await pattern.getByRole("button", { name: "预览宣告" }).click();
  const before = await revision(page);
  await expect(page.locator(".declare-preview img")).toBeVisible();
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".pattern-picker")).toBeVisible();
  await page.locator(".pattern-combinations button").first().click();
  await expect(page.locator(".pattern-city-grid .matched")).toHaveCount(3);
  await page.screenshot({
    path: `test-results/${info.project.name}-declare-pattern.png`,
    animations: "disabled",
  });
  await expect(page.locator(".stock-score strong")).toHaveText("0");
  await page.getByRole("button", { name: "确认选择" }).click();
  const result = page.getByRole("dialog", { name: "城市样式宣告成功" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("+3");
  await expect(page.locator(".stock-score strong")).toHaveText("3");
  await expect(page.locator(".score-token").first()).toHaveAttribute(
    "data-score",
    "3",
  );
  expect(await revision(page)).toBe(before + 2);
  await page.waitForTimeout(2300);
  await expect(result).toBeVisible();
  await page.getByRole("button", { name: "继续拓荒" }).click();
  await expect(result).toHaveCount(0);
});

test("原版企业家、大总统、边缘说明和新回合动画随公共状态更新", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  await expect(page.locator(".turn-announcement")).toContainText("第 1 回合");
  await expect(
    page.locator(".active-entrepreneur .president-badge"),
  ).toBeVisible();
  expect(
    await page
      .locator(".stock-token")
      .evaluateAll((imgs) =>
        imgs.every((img) =>
          (img as HTMLImageElement).src.includes("/assets/resource-"),
        ),
      ),
  ).toBe(true);
  await expect(page.locator(".edge-hint-sheet")).toBeHidden();
  const tab = page.getByRole("button", { name: "回合与终局计分" });
  await tab.hover();
  await expect(page.locator(".edge-hint-sheet")).toBeVisible();
  await page.mouse.move(3, 3);
  await expect(page.locator(".edge-hint-sheet")).toBeHidden();
  await tab.focus();
  await page.keyboard.press("Enter");
  await expect(tab).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "进行行动", exact: true }).focus();
  await expect(page.locator(".edge-hint-sheet")).toBeHidden();
  await scenario(page, id, (g) => {
    g.first = 1;
    g.active = 1;
    g.round = 2;
    g.lap = 1;
    return g;
  });
  await expect(page.locator(".turn-announcement")).toContainText("第 2 回合");
  await expect(page.locator(".turn-announcement")).toContainText(
    "拓荒朋友 1 的回合",
  );
  await expect(page.locator(".entrepreneur-bust")).toHaveAttribute(
    "src",
    "/assets/entrepreneur-bust-1.webp",
  );
  await expect(
    page.locator(".active-entrepreneur .president-badge"),
  ).toBeVisible();
  await expect(
    page.locator(".player-row").nth(1).locator(".president-badge"),
  ).toBeVisible();
  await expect(
    page.locator(".player-row").first().locator(".president-badge"),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-table-motion.png`,
    animations: "disabled",
  });
});

test("供应区选牌接续建设步骤，新设施补牌结果保留到继续", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  const original = readGame(id);
  const instance = original.market[0];
  await page
    .getByRole("button", { name: "设施供应与城市样式", exact: true })
    .click();
  await page
    .locator(".supply-card")
    .first()
    .getByRole("button", { name: "筹建这座设施" })
    .click();
  await page.getByRole("button", { name: "执行行动" }).click();
  await expect(page.locator(".build-card button.picked")).toHaveCount(1);
  const afterStart = readGame(id);
  expect(afterStart.market).toContain(instance);
  await page.locator(".build-city-grid button:not(:disabled)").first().click();
  await page.locator(".payment-options button").first().click();
  const before = await revision(page);
  await page.getByRole("button", { name: "确认选择" }).click();
  const result = page.getByRole("dialog", { name: "设施已落位" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("供应区补入 1 张设施");
  await expect(page.locator(".receipt-refill img")).toHaveCount(1);
  const after = readGame(id);
  expect(after.market).not.toContain(instance);
  expect(after.market.length).toBe(6);
  expect(await revision(page)).toBe(before + 1);
  await page.screenshot({
    path: `test-results/${info.project.name}-supply-receipt.png`,
    animations: "disabled",
  });
  await page.waitForTimeout(1500);
  await expect(result).toBeVisible();
  await page.getByRole("button", { name: "继续拓荒" }).click();
  await expect(result).toHaveCount(0);
});
