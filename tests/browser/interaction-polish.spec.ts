import { test, expect, type Page } from "./fixtures/test.ts";
import { fixture, clickHandCard } from "./fixtures/table.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand, createGame } from "../../packages/rules/src/engine.ts";
import { ROLE_BY_ID } from "../../packages/rules/src/data.ts";

function read(id: string) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    return store.get(id)!;
  } finally {
    store.close();
  }
}
async function setup(page: Page, kind: "initial-node" | "trim" | "allocate") {
  const { id } = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!;
    let s =
      kind === "allocate"
        ? room.game!
        : createGame(room.seats, {
            expansion: kind !== "initial-node",
            oripathy: kind === "trim",
            expert: false,
            seed: 52,
          });
    if (kind !== "allocate") {
      for (let n = 0; s.decision?.kind !== kind; n++) {
        expect(n).toBeLessThan(100);
        s = applyCommand(s, s.decision!.playerId, {
          type: "choose",
          optionId: s.decision!.options[0].id,
        });
      }
    } else {
      s.queue = [];
      s.phase = "actions";
      s.decision = {
        kind: "test",
        playerId: s.players[0].id,
        title: "资源选择",
        options: [
          {
            id: "go",
            label: "选择资源",
            steps: [
              { kind: "allocate", actor: s.players[0].id, data: { count: 3 } },
            ],
          },
        ],
      };
      s = applyCommand(s, s.players[0].id, { type: "choose", optionId: "go" });
    }
    room.game = s;
    room.expansion = s.expansion;
    room.oripathy = !!s.oripathy;
    room.expert = false;
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".connection")).toContainText("已连接");
  return { id, before: read(id) };
}
async function double(page: Page, selector: string, touch: boolean) {
  const el = page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  if (touch) {
    const box = (await el.boundingBox())!,
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  } else await el.dblclick({ delay: 85 });
}

test("起始城市单击预选、双击落城一次，落地先于事件窗口", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { id, before } = await setup(page, "initial-node");
  const target = before.game!.decision!.options[0].id;
  const selector = `.board-hit[data-site-id="${target}"]`;
  await page.locator(selector).click();
  await expect(page.locator(".interaction-window")).toHaveCount(0);
  expect(read(id).game!.revision).toBe(before.game!.revision);
  await page.evaluate(() => {
    (window as any).__landing = {};
    new MutationObserver(() => {
      const t = (window as any).__landing;
      if (document.querySelector(".city-arrival") && !t.city)
        t.city = performance.now();
      if (document.querySelector(".event-window[open]") && !t.event)
        t.event = performance.now();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  });
  await double(page, selector, !!info.project.use.hasTouch);
  await expect.poll(() => read(id).game!.players[0].city).toBe(target);
  expect(read(id).game!.revision).toBe(before.game!.revision + 1);
  await expect(page.locator(".city-arrival")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("city-touchdown.png") });
  await expect(page.locator(".event-window")).toBeVisible();
  const timing = await page.evaluate(() => (window as any).__landing);
  expect(timing.event - timing.city).toBeGreaterThan(650);
  await expect(page.locator(".city-arrival")).toHaveCount(0);
});

test("三张退回手牌可多选撤选，确认前不改变存档，确认只提交一次", async ({
  page,
}, info) => {
  const { id, before } = await setup(page, "trim");
  const ids = before.game!.decision!.options.slice(0, 3).map((o) => o.id);
  const cardElement = (id: string) =>
    page.getByRole("button", {
      name: `选择角色 ${ROLE_BY_ID[id].name}`,
      exact: true,
    });
  const commit = page.getByRole("button", {
    name: "确认放回 3 张",
    exact: true,
  });
  const pick = (id: string) =>
    clickHandCard(page, cardElement(id), 1, !!info.project.use.hasTouch);
  await expect(commit).toBeDisabled();
  for (const card of ids) await pick(card);
  await expect(page.locator(".hand-card[aria-pressed=true]")).toHaveCount(3);
  await expect(commit).toBeEnabled();
  expect(read(id).game).toEqual(before.game);
  await pick(ids[1]);
  await expect(commit).toBeDisabled();
  await pick(ids[1]);
  await expect(commit).toBeEnabled();
  await page.screenshot({ path: info.outputPath("batch-hand.png") });
  await commit.click();
  await expect.poll(() => read(id).game!.players[0].hand.length).toBe(5);
  expect(read(id).revision).toBe(before.revision + 1);
  expect(read(id).game!.revision).toBe(before.game!.revision + 1);
  expect(read(id).game!.players[0].privateRemoved.sort()).toEqual(ids.sort());
  await page.reload();
  await expect(page.locator(".hand-card")).toHaveCount(5);
});

test("重复资源一次搭配提交，关闭窗口后保留未提交选择", async ({
  page,
}, info) => {
  const { id, before } = await setup(page, "allocate");
  const modal = page.getByRole("dialog", { name: "行动安排", exact: true });
  const commit = modal.getByRole("button", {
    name: "确认分配资源 →",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await modal
    .getByRole("button", { name: "增加 1 源岩", exact: true })
    .click({ clickCount: 2, delay: 90 });
  await modal.getByRole("button", { name: "增加 1 异铁", exact: true }).click();
  await expect(commit).toBeEnabled();
  expect(read(id).game).toEqual(before.game);
  await modal.getByRole("button", { name: "返回上一级", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await expect(modal.locator(".batch-confirm [role=status]")).toContainText(
    "已选 3 / 3",
  );
  await page.screenshot({ path: info.outputPath("batch-resources.png") });
  await commit.click();
  await expect.poll(() => read(id).revision).toBe(before.revision + 1);
  expect(read(id).game!.players[0].wallet.rock).toBe(
    before.game!.players[0].wallet.rock + 2,
  );
  expect(read(id).game!.players[0].wallet.iron).toBe(
    before.game!.players[0].wallet.iron + 1,
  );
});

test("棋桌、房间、联机大厅逐级返回并恢复原席位与对局", async ({
  page,
}, info) => {
  const { id } = await fixture(page),
    before = read(id);
  const back = page.getByRole("button", { name: "返回房间大厅", exact: true });
  const backBox = (await back.boundingBox())!;
  const tableBox = (await page.locator(".game-layout").boundingBox())!;
  expect(backBox.x).toBeGreaterThanOrEqual(0);
  expect(backBox.y).toBeGreaterThanOrEqual(0);
  expect(backBox.x + backBox.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(backBox.y + backBox.height).toBeLessThanOrEqual(tableBox.y + 1);
  await page.getByRole("button", { name: "拓荒日志", exact: true }).click();
  const journal = page.getByRole("dialog", { name: "拓荒日志", exact: true });
  await expect(journal).toHaveAttribute("data-window-motion", "enter");
  await journal
    .getByRole("button", { name: "返回上一级", exact: true })
    .click();
  await expect(journal).toHaveCount(0);
  await page.getByRole("button", { name: "返回房间大厅", exact: true }).click();
  await expect(page.locator(".assembly-lobby")).toBeVisible();
  await expect(page.getByRole("button", { name: "返回棋桌" })).toBeVisible();
  await page.reload();
  await expect(page.locator(".assembly-lobby")).toBeVisible();
  await page.screenshot({ path: info.outputPath("room-overview.png") });
  await page.getByRole("button", { name: "返回联机大厅", exact: true }).click();
  await expect(page.locator(".departure-stage")).toHaveAttribute(
    "data-scene",
    "lobby",
  );
  await expect(page.locator("#room-code")).toHaveValue(id);
  await expect(page.locator(".departure-stage")).not.toHaveClass(/is-arriving/);
  await page.locator("#nickname").fill(before.seats[0].name);
  await page.getByRole("button", { name: "加入", exact: false }).click();
  await expect(page.locator(".game-layout")).toBeVisible();
  expect(read(id).seats.map((s) => s.id)).toEqual(
    before.seats.map((s) => s.id),
  );
  expect(read(id).game).toEqual(before.game);
});
