import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { projectView } from "../../packages/rules/src/engine.ts";
import { harvestPlanning } from "../fixtures/parallel.ts";
import { fixture } from "./fixtures/table.ts";

function read(id: string) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    return store.get(id)!;
  } finally {
    store.close();
  }
}
async function seat(browser: Browser, page: Page, id: string, token: string) {
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  await context.addInitScript(
    ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
    { id, token },
  );
  const tab = await context.newPage();
  await tab.goto(`/room/${id}`);
  await expect(tab.locator(".connection")).toContainText("已连接");
  return { context, tab };
}
async function pickRole(page: Page) {
  await page.locator(".hand-card.playable").first().focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "确认盖放", exact: true }),
  ).toBeEnabled();
}
async function emptyHarvest(page: Page) {
  await page.getByRole("button", { name: "核对路费与采集" }).click();
  await page.getByRole("button", { name: "确认采集方案" }).click();
}

test("四个浏览器同时盖放，朋友提交保留抬牌预览，离线最后一席恢复后才进入行动", async ({
  page,
  browser,
}, info) => {
  const { id, seatTokens } = await fixture(page, "select");
  const contexts: BrowserContext[] = [];
  const tabs = [page];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    for (const token of seatTokens.slice(1)) {
      const joined = await seat(browser, page, id, token);
      contexts.push(joined.context);
      tabs.push(joined.tab);
      joined.tab.on("pageerror", (e) => errors.push(e.message));
    }
    await Promise.all(tabs.map(pickRole));
    const before = read(id).revision;
    await tabs[1]
      .getByRole("button", { name: "确认盖放", exact: true })
      .click();
    await expect(page.locator(".parallel-progress")).toHaveText("1 / 4 已确认");
    await expect(page.locator(".hand-card.picked")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "确认盖放", exact: true }),
    ).toBeEnabled();
    expect(read(id).revision).toBe(before + 1);
    const submitted = read(id).game!;
    expect(
      projectView(submitted, submitted.players[0].id).players[1].selected,
    ).toBeNull();
    await tabs[1].reload();
    await expect(tabs[1].locator(".hand-card.playable")).toHaveCount(0);
    await expect(tabs[1].locator(".map-prompt")).toContainText("角色已盖放");
    await contexts[2].close();
    await expect(page.locator(".player-row").nth(3)).toContainText(
      "离线 · 等待返回",
    );
    await Promise.all(
      [tabs[0], tabs[2]].map((tab) =>
        tab.getByRole("button", { name: "确认盖放", exact: true }).click(),
      ),
    );
    await expect(page.locator(".parallel-progress")).toHaveText("3 / 4 已确认");
    expect(read(id).game!.phase).toBe("select");
    await expect(page.locator(".map-prompt")).toContainText("拓荒朋友 3");
    await page.screenshot({
      path: `test-results/${info.project.name}-parallel-roles.png`,
      animations: "disabled",
    });
    const last = await seat(browser, page, id, seatTokens[3]);
    contexts.push(last.context);
    await pickRole(last.tab);
    await last.tab
      .getByRole("button", { name: "确认盖放", exact: true })
      .click();
    await expect(page.locator(".board-toolbar")).toContainText(
      "第 1 轮主要行动",
    );
    await expect(page.locator(".parallel-progress")).toHaveCount(0);
    expect(
      read(id).game!.players.every((p) => p.selected && p.hand.length === 4),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test("四人并行采集保留路线与收款人预览，最后确认统一支付，刷新不提前结算", async ({
  page,
  browser,
}, info) => {
  const { id, seatTokens } = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!;
    room.game = harvestPlanning(4, room.seats);
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".route-panel")).toBeVisible();
  const contexts: BrowserContext[] = [];
  const tabs = [page];
  try {
    for (const token of seatTokens.slice(1)) {
      const joined = await seat(browser, page, id, token);
      contexts.push(joined.context);
      tabs.push(joined.tab);
    }
    const initial = read(id).game!;
    const wallets = initial.players.map((p) => ({ ...p.wallet }));
    await page.locator('.board-hit[data-site-id="A-02"]').click();
    await expect(page.locator(".harvest-check")).toHaveCount(1);
    await page.getByRole("button", { name: "核对路费与采集" }).click();
    await emptyHarvest(tabs[1]);
    await expect(page.locator(".parallel-progress")).toHaveText("1 / 4 已确认");
    await expect(
      page.getByRole("button", { name: "确认采集方案" }),
    ).toBeEnabled();
    expect(read(id).game!.players.map((p) => p.wallet)).toEqual(wallets);
    await page.reload();
    await expect(page.locator(".harvest-check")).toHaveCount(1);
    await page.getByRole("button", { name: "核对路费与采集" }).click();
    await page.screenshot({
      path: `test-results/${info.project.name}-parallel-routes.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "确认采集方案" }).click();
    await expect(page.locator(".toll-recipients button")).toHaveCount(2);
    await page.locator(".toll-recipients button").first().click();
    await emptyHarvest(tabs[2]);
    await expect(page.locator(".parallel-progress")).toHaveText("2 / 4 已确认");
    await expect(page.locator(".toll-recipients .picked")).toHaveCount(1);
    await page.getByRole("button", { name: "确认收款人" }).click();
    await expect(page.locator(".parallel-progress")).toHaveText("3 / 4 已确认");
    await page.reload();
    await expect(page.locator(".map-prompt")).toContainText("采集方案已确认");
    expect(read(id).game!.players.map((p) => p.wallet)).toEqual(wallets);
    await emptyHarvest(tabs[3]);
    await expect(page.locator(".stock-rock strong")).toHaveText(
      String(wallets[0].rock + 2),
    );
    await expect(page.locator(".stock-cash strong")).toHaveText(
      String(wallets[0].cash - 2),
    );
    await expect(tabs[1].locator(".stock-cash strong")).toHaveText(
      String(wallets[1].cash + 2),
    );
    expect(read(id).game!.round).toBe(2);
    expect(
      read(id).game!.log.filter((e) =>
        e.text.includes("所有玩家已确认采集方案"),
      ),
    ).toHaveLength(1);
  } finally {
    for (const context of contexts) await context.close();
  }
});
