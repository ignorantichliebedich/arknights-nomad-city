import { test, expect, type Page } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import {
  FACILITIES,
  FACILITY_BY_ID,
  RESOURCES,
  RESOURCE_NAMES,
} from "../../packages/rules/src/data.ts";
import type { Wallet } from "../../packages/rules/src/types.ts";
import { fixture } from "./fixtures/table.ts";

async function cityFixture(page: Page) {
  const result = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(result.id)!;
    const game = room.game!;
    const me = game.players[0];
    const friend = game.players[1];
    const placements = [
      [0, "industrial"],
      [1, "energy"],
      [2, "camp"],
      [3, "federal"],
      [5, "administration"],
      [
        8,
        FACILITIES.find(
          (f) =>
            f.color === "red" && !f.id.startsWith("extension-") && !f.expansion,
        )!.id,
      ],
    ] as const;
    for (const [cell, id] of placements) {
      const source = game.market.some(
        (instance) => instance.split("@")[0] === id,
      )
        ? game.market
        : game.facilityDeck;
      const index = source.findIndex(
        (instance) => instance.split("@")[0] === id,
      );
      if (index < 0) throw new Error(`Missing facility ${id}`);
      source.splice(index, 1);
      me.built[cell] = { cardId: id, used: cell === 0 };
    }
    me.wallet = { rock: 20, ore: 0, iron: 8, prime: 3, cash: 1000, score: 24 };
    friend.wallet = {
      rock: 0,
      ore: 36,
      iron: 15,
      prime: 1,
      cash: 55,
      score: 7,
    };
    game.players[3].name = "名字稍长的第四位拓荒企业家";
    game.active = 1;
    game.mainDone = false;
    friend.selected = "texas";
    friend.revealed = true;
    room.revision++;
    store.save(room);
    await page.reload();
    await expect(page.locator(".room-toolbar")).toHaveAttribute(
      "data-revision",
      String(room.revision),
    );
    return {
      ...result,
      own: me,
      friend,
      before: JSON.stringify(room.game),
      revision: room.revision,
    };
  } finally {
    store.close();
  }
}

async function expectWallet(page: Page, name: string, wallet: Wallet) {
  const tray = page.getByRole("region", { name: `${name}的资源`, exact: true });
  for (const r of RESOURCES) {
    const cell = tray.locator(`[data-resource="${r}"]`);
    await expect(cell).toHaveAttribute(
      "aria-label",
      `${RESOURCE_NAMES[r]} ${wallet[r]}`,
    );
    await expect(cell.locator(".flip-number > strong")).toHaveText(
      String(wallet[r]),
    );
    await expect(cell.locator("img")).toHaveAttribute(
      "src",
      `/assets/resource-${r}.webp`,
    );
  }
}

test("城市缩略盘保持三列四行，悬停和键盘查看建筑，切换玩家仅查看公开状态", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = await cityFixture(page);
  const walletFits = await page
    .locator(".resource-tray .stock-cell")
    .evaluateAll((cells) =>
      cells.every((cell) => {
        const bounds = cell.getBoundingClientRect();
        const number = cell
          .querySelector(".flip-number > strong")!
          .getBoundingClientRect();
        const icon = cell.querySelector("img")!.getBoundingClientRect();
        return (
          number.left >= icon.right &&
          number.right <= bounds.right &&
          number.left >= bounds.left
        );
      }),
    );
  expect(walletFits).toBe(true);
  await page.getByRole("button", { name: "我的城市", exact: true }).click();
  const modal = page.locator(".city-window");
  const slots = modal.locator(".city-grid .city-cell");
  await expect(slots).toHaveCount(12);
  await expectWallet(page, state.own.name, state.own.wallet);
  const geometry = await slots.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(new Set(geometry.map((r) => Math.round(r.x))).size).toBe(3);
  expect(new Set(geometry.map((r) => Math.round(r.y))).size).toBe(4);
  expect(geometry[11].y + geometry[11].height).toBeLessThan(
    page.viewportSize()!.height - 15,
  );
  expect(geometry[0].height).toBeLessThanOrEqual(100);
  expect(geometry[1].x).toBeGreaterThan(geometry[0].x);
  expect(geometry[3].y).toBeGreaterThan(geometry[0].y);
  await slots.nth(0).hover();
  const preview = page.getByRole("region", { name: "建筑详情", exact: true });
  await expect(preview.getByRole("heading", { level: 3 })).toHaveText(
    FACILITY_BY_ID.industrial.name,
  );
  await expect(preview).toContainText("最多降低 3 源岩");
  await expect(preview).toContainText("已用于样式");
  await expect(preview.locator(".building-preview-art img")).toHaveAttribute(
    "src",
    FACILITY_BY_ID.industrial.image,
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-city-inspector.png`,
    animations: "disabled",
  });
  await slots.nth(4).focus();
  await expect(preview).toContainText("空闲格位");
  await page.keyboard.press("ArrowDown");
  await expect(slots.nth(7)).toBeFocused();
  await expect(preview).toContainText("核心指挥塔");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(slots.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(slots.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "附属能源设施", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  await expect(slots.nth(1)).toBeFocused();
  await page
    .getByRole("button", {
      name: `查看${state.friend.name}的城市`,
      exact: true,
    })
    .click();
  await expectWallet(page, state.friend.name, state.friend.wallet);
  await expect(preview.getByRole("heading", { level: 3 })).toHaveText(
    "核心指挥塔",
  );
  await expect(modal.locator(".number-up, .number-down")).toHaveCount(0);
  await expect(modal.locator(".city-grid .built")).toHaveCount(1);
  await page
    .getByRole("button", { name: `查看${state.own.name}的城市`, exact: true })
    .click();
  await expectWallet(page, state.own.name, state.own.wallet);
  await expect(modal.locator(".city-grid .built")).toHaveCount(7);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "我的城市", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: `test-results/${info.project.name}-public-resources.png`,
    animations: "disabled",
  });
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(state.revision),
  );
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    expect(JSON.stringify(store.get(state.id)!.game)).toBe(state.before);
  } finally {
    store.close();
  }
  expect(errors).toEqual([]);
});

test("朋友资源常驻侧栏，行动后城市窗口实时翻数且保留正在看的建筑", async ({
  page,
  browser,
}) => {
  const state = await cityFixture(page);
  const row = page.getByRole("button", {
    name: `查看${state.friend.name}的城市与资源`,
    exact: true,
  });
  for (const r of RESOURCES.filter((r) => r !== "score")) {
    await expect(row.locator(`[data-resource="${r}"]`)).toHaveAttribute(
      "aria-label",
      `${RESOURCE_NAMES[r]} ${state.friend.wallet[r]}`,
    );
  }
  await row.click();
  await expectWallet(page, state.friend.name, state.friend.wallet);
  await page.locator(".city-grid .city-cell").nth(0).hover();
  await expect(page.locator(".building-empty-preview")).toBeVisible();
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    await context.addInitScript(
      ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
      { id: state.id, token: state.friendToken },
    );
    const friend = await context.newPage();
    await friend.goto(`/room/${state.id}`);
    await expect(friend.locator(".connection")).toContainText("已连接");
    await friend.getByRole("button", { name: "进行行动", exact: true }).click();
    await friend.getByRole("button", { name: "角色策略", exact: true }).click();
    await friend.getByRole("button", { name: "执行行动" }).click();
    await expect(
      page.locator(
        '.city-resource-tray [data-resource="cash"] .flip-number > strong',
      ),
    ).toHaveText("67");
    await expect(
      page.locator('.city-resource-tray [data-resource="cash"] .number-up'),
    ).toHaveCount(1);
    await expect(
      page.locator('.city-resource-tray [data-resource="cash"] .number-delta'),
    ).toHaveText("+12");
    await expect(page.locator(".building-empty-preview")).toBeVisible();
    await expectWallet(page, state.friend.name, {
      ...state.friend.wallet,
      cash: 67,
    });
    await page.keyboard.press("Escape");
    await expect(row.locator('[data-resource="cash"]')).toHaveAttribute(
      "aria-label",
      "金券 67",
    );
    await page.getByRole("button", { name: "我的城市", exact: true }).click();
    await expectWallet(page, state.own.name, state.own.wallet);
    await page.reload();
    await expect(row.locator('[data-resource="cash"]')).toHaveAttribute(
      "aria-label",
      "金券 67",
    );
  } finally {
    await context.close();
  }
});
