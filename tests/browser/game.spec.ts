import { test, expect } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import {
  applyCommand,
  createGame,
  projectView,
} from "../../packages/rules/src/engine.ts";
import type { RoomView } from "../../apps/web/src/network.ts";
import { ROLE_BY_ID } from "../../packages/rules/src/data.ts";
test.beforeEach(() => test.setTimeout(90000));

import { clickRoomButton, roomRequest } from "./fixtures/rooms.ts";

test("秘密企业选择可以先查看完整效果，预览不提交行动", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("企业家昵称").fill("企业预览测试");
  await clickRoomButton(page, "创建新房间");
  await expect(page.locator(".room-toolbar")).toBeVisible();
  const roomId = page.url().split("/").at(-1)!;
  await roomRequest(page, `/api/rooms/${roomId}/join`, "企业预览朋友");
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(roomId)!;
    room.expansion = true;
    room.game = createGame(room.seats, { expansion: true, seed: 1 });
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".decision-title")).toContainText("初始合作企业");
  const revision = await page
    .locator(".room-toolbar")
    .getAttribute("data-revision");
  await expect(page.locator(".enterprise-offer")).toHaveCount(4);
  const brand = page.locator(".enterprise-offer-art").first();
  await expect(brand.locator("img")).toHaveJSProperty("naturalWidth", 650);
  expect(
    await brand.evaluate(
      (el) =>
        el.querySelector("img")!.getBoundingClientRect().width /
        el.getBoundingClientRect().width,
    ),
  ).toBeGreaterThan(0.95);
  await page.screenshot({
    path: `test-results/${info.project.name}-enterprise-offers.png`,
    animations: "disabled",
  });
  await page.locator(".choice-detail-button").first().click();
  await expect(page.getByRole("dialog").last()).toContainText("级");
  await expect(page.getByRole("dialog").last()).toContainText("本次选择");
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await page.keyboard.press("Escape");
  await page.locator(".action-list .action-button").first().click();
  await expect(page.locator(".enterprise-offer-insight li")).toHaveCount(5);
  await page
    .locator(".enterprise-offer")
    .nth(1)
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.locator('.enterprise-offer-select[aria-pressed="true"]'),
  ).toHaveCount(1);
  const choice = await page
    .locator('.enterprise-offer-select[aria-pressed="true"]')
    .getAttribute("aria-label");
  await expect(page.locator(".commit-tray > strong")).toHaveText(choice!);
  await page
    .locator(".enterprise-offer.is-picked .choice-detail-button")
    .click();
  await expect(page.getByRole("dialog").last()).toContainText(choice!);
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".enterprise-offer.is-picked .choice-detail-button"),
  ).toBeFocused();
  await expect(page.locator(".commit-tray > strong")).toHaveText(choice!);
  await page.screenshot({
    path: `test-results/${info.project.name}-enterprise-offer-selected.png`,
    animations: "disabled",
  });
  const confirmBox = await page
    .getByRole("button", { name: "确认选择" })
    .boundingBox();
  expect(confirmBox!.y + confirmBox!.height).toBeLessThan(
    page.viewportSize()!.height,
  );
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    revision!,
  );
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".room-toolbar")).not.toHaveAttribute(
    "data-revision",
    revision!,
  );
});
test("持续角色、暂存设施和可用标记在刷新后可见，城市展示十二格", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("企业家昵称").fill("持续效果测试");
  await clickRoomButton(page, "创建新房间");
  await expect(page.locator(".room-toolbar")).toBeVisible();
  const roomId = page.url().split("/").at(-1)!;
  await roomRequest(page, `/api/rooms/${roomId}/join`, "持续效果朋友");
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  let markers = 0;
  let hiddenRoleNames: string[] = [];
  try {
    const room = store.get(roomId)!;
    let game = createGame(room.seats, { expansion: true, seed: 52 });
    while (game.phase !== "actions") {
      const decision = game.decision!;
      game = applyCommand(game, decision.playerId, {
        type: "choose",
        optionId: decision.options[0].id,
      });
    }
    const host = game.players[0];
    const stash = game.market.splice(0, 2);
    while (game.market.length < 6 && game.facilityDeck.length)
      game.market.push(game.facilityDeck.shift()!);
    host.persistent = [
      { roleId: "dorothy", markers: 3, stash: [] },
      { roleId: "passenger", markers: 2, stash: [] },
      { roleId: "closure", markers: 0, stash },
      { roleId: "mudrock", markers: 0, stash: [] },
    ];
    host.removed.push("w");
    hiddenRoleNames = host.privateRemoved.map((id) => ROLE_BY_ID[id].name);
    game.operativeDeck = game.operativeDeck.filter(
      (role) => role !== "w" && !host.persistent.some((p) => p.roleId === role),
    );
    room.expansion = true;
    room.game = game;
    room.revision++;
    store.save(room);
    markers = projectView(game, host.id).players[0].availableMarkers;
  } finally {
    store.close();
  }
  await page.reload();
  await page
    .getByRole("button", { name: "设施供应与城市样式", exact: true })
    .click();
  await expect(page.locator(".supply-cards .supply-card")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(page.locator(".player-row").first()).toContainText(
    `可用标记 ${markers}`,
  );
  await page.getByRole("button", { name: "我的城市", exact: true }).click();
  const persistent = page.getByRole("region", {
    name: "持续效果测试的持续角色",
  });
  await expect(persistent).toBeVisible();
  await expect(persistent.locator(".persistent-effect")).toHaveCount(4);
  await expect(persistent).toContainText("标记 3 / 4");
  await expect(persistent).toContainText("标记 2 / 5");
  await expect(persistent).toContainText("待建设施 2 张");
  await expect(persistent.locator(".stashed-facilities button")).toHaveCount(2);
  await persistent.getByRole("button", { name: "多萝西" }).click();
  await expect(
    page.getByRole("dialog", { name: "多萝西", exact: true }),
  ).toContainText("自己的影响力被移除");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog").locator(".city-grid .city-cell"),
  ).toHaveCount(12);
  await expect(
    page.getByRole("dialog").locator(".persistent-effect"),
  ).toHaveCount(4);
  const retired = page.getByRole("region", { name: "已退役角色" });
  await expect(retired.getByRole("button")).toHaveCount(1);
  for (const hidden of hiddenRoleNames)
    await expect(retired).not.toContainText(hidden);
  await retired.getByRole("button", { name: "W", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "W", exact: true }),
  ).toContainText("策略：");
  await expect(
    page.getByRole("dialog", { name: "W", exact: true }),
  ).toContainText("计谋：");
  await page.keyboard.press("Escape");
  await expect(retired).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${info.project.name}-persistent.png`,
    fullPage: true,
  });
});
test("入口、两人房间、真实棋盘、准备开局、秘密选牌和刷新恢复", async ({
  browser,
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // This long flow checks commands and recovery; guide-motion covers live animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "明日方舟 游城拓荒" }),
  ).toBeVisible();
  await page.getByLabel("企业家昵称").fill("测试房主");
  await clickRoomButton(page, "创建新房间");
  await expect(
    page.getByRole("heading", { name: "企业家正在集结。" }),
  ).toBeVisible();
  const roomId = page.url().split("/").at(-1)!;
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    reducedMotion: "reduce",
  });
  const friend = await context.newPage();
  friend.on("pageerror", (e) => errors.push(e.message));
  await friend.goto(`/room/${roomId}`);
  await friend.getByLabel("企业家昵称").fill("测试朋友");
  await clickRoomButton(friend, "加入这场拓荒");
  await expect(
    friend.getByRole("heading", { name: "企业家正在集结。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "准备出发" }).click();
  await friend.getByRole("button", { name: "准备出发" }).click();
  await expect(page.getByRole("button", { name: "开始拓荒" })).toBeEnabled();
  await page.getByRole("button", { name: "开始拓荒" }).click();
  await expect(
    page.getByRole("group", { name: "第 105 号拓荒区棋盘" }),
  ).toBeVisible();
  for (let i = 0; i < 25; i++) {
    for (const tab of [page, friend])
      if (await tab.locator(".receipt-window").isVisible())
        await tab.getByRole("button", { name: "继续拓荒" }).click();
    if (
      await page
        .locator(".board-toolbar")
        .textContent()
        .then((v) => v?.includes("第 1 轮主要行动"))
    )
      break;
    let acted = false;
    for (const tab of [page, friend]) {
      const canAct = tab.getByRole("button", { name: /^(进行行动|处理事件)$/ });
      if (
        !(await tab
          .locator(".interaction-window, .event-window")
          .isVisible()) &&
        (await canAct.isVisible()) &&
        (await canAct.isEnabled())
      )
        await canAct.click();
      const choice = tab
        .locator(
          ".action-list .action-button, .hand-card.playable, .event-window .event-option",
        )
        .first();
      if ((await choice.isVisible()) && (await choice.isEnabled())) {
        const revision = await tab
          .locator(".room-toolbar")
          .getAttribute("data-revision");
        const isHand = await choice.evaluate((el) =>
          el.classList.contains("hand-card"),
        );
        if (isHand) {
          await choice.focus();
          await tab.keyboard.press("Enter");
        } else await choice.click();
        await tab
          .getByRole("button", { name: isHand ? "确认盖放" : "确认选择" })
          .click();
        await expect(tab.locator(".room-toolbar")).not.toHaveAttribute(
          "data-revision",
          revision!,
        );
        acted = true;
        break;
      }
    }
    if (!acted) await page.waitForTimeout(100);
  }
  await expect(page.locator(".board-toolbar")).toContainText("第 1 轮主要行动");
  await page
    .getByRole("button", { name: "设施供应与城市样式", exact: true })
    .click();
  await expect(page.locator(".supply-cards .supply-card")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(page.locator(".player-row")).toHaveCount(2);
  await page.screenshot({
    animations: "disabled",
    path: `test-results/${info.project.name}-game.png`,
    fullPage: true,
  });
  await page.locator(".deployment-slot").first().click();
  await expect(page.locator(".placement-panel")).toBeVisible();
  await page
    .getByRole("button", { name: /^确认放置/ })
    .click({ timeout: 10000 });
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "结束本轮行动" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "结束本轮行动" }),
  ).toBeVisible();
  await expect(page.locator(".connection")).toContainText("已连接");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^角色手牌 / }).click();
  await expect(page.locator(".hand-card img").first()).toBeVisible();
  expect(
    await page
      .locator(".hand-card img")
      .evaluateAll((imgs) =>
        imgs.every(
          (img) =>
            (img as HTMLImageElement).complete &&
            (img as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await expect(page.locator("body")).not.toHaveJSProperty("scrollWidth", 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});
test("规则弹窗的键盘关闭与入房错误", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "规则速览" }).click();
  await expect(page.getByRole("dialog")).toContainText("全局 8 回合");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("企业家昵称").fill("测试");
  await page.getByLabel("房间码").fill("ZZZZZZ");
  await clickRoomButton(page, "加入", 404);
  await expect(page.getByRole("alert")).toContainText("房间不存在");
});

test("两个独立浏览器完成八回合，所有席位都能查看最终得分", async ({
  browser,
  page,
}) => {
  test.setTimeout(90000);
  function observeSocket() {
    const NativeSocket = window.WebSocket;
    class ObservedSocket extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).__gameSocket = this;
        this.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          if (message.type === "state")
            (window as any).__gameRoom = message.room;
        });
      }
    }
    window.WebSocket = ObservedSocket;
  }
  await page.addInitScript(observeSocket);
  await page.goto("/");
  await page.getByLabel("企业家昵称").fill("整局房主");
  await clickRoomButton(page, "创建新房间");
  await expect(page.locator(".room-toolbar")).toBeVisible();
  const context = await browser.newContext();
  const friend = await context.newPage();
  await friend.addInitScript(observeSocket);
  await friend.goto(page.url());
  await friend.getByLabel("企业家昵称").fill("整局朋友");
  await clickRoomButton(friend, "加入这场拓荒");
  await page.getByRole("button", { name: "准备出发" }).click();
  await friend.getByRole("button", { name: "准备出发" }).click();
  await expect(page.getByRole("button", { name: "开始拓荒" })).toBeEnabled();
  await page.getByRole("button", { name: "开始拓荒" }).click();
  await expect(page.locator(".board-surface")).toBeVisible();
  const tabs = [page, friend];
  const seats = await Promise.all(
    tabs.map((tab) =>
      tab.evaluate(() => (window as any).__gameRoom.me as string),
    ),
  );
  let current: RoomView = await page.evaluate(() => (window as any).__gameRoom);
  for (let i = 0; current.game!.phase !== "finished"; i++) {
    expect(i).toBeLessThan(1200);
    const game = current.game!;
    const actor = game.parallel
      ? game.parallel.participants.find(
          (id) => !game.parallel!.ready.includes(id),
        )!
      : (game.decision?.playerId ?? game.players[game.active].id);
    const tab = tabs[seats.indexOf(actor)];
    await tab.waitForFunction(
      (revision) => (window as any).__gameRoom?.revision >= revision,
      current.revision,
    );
    const view: RoomView = await tab.evaluate(() => (window as any).__gameRoom);
    const actions = view.game!.actions;
    const choice = view.game!.decision;
    const action = choice
      ? choice.kind === "sell" || choice.kind === "harvest"
        ? actions.find((a) => a.id === "done")
        : actions[0]
      : (actions.find((a) => a.id === "deploy") ??
        actions.find((a) => a.id === "shift") ??
        actions.find((a) => a.id === "end"));
    expect(action, `缺少合法行动：${game.phase}`).toBeDefined();
    current = await tab.evaluate(
      ({ command, revision }) =>
        new Promise<RoomView>((resolve, reject) => {
          const ws: WebSocket = (window as any).__gameSocket;
          const timer = setTimeout(() => {
            ws.removeEventListener("message", receive);
            reject(new Error("整局状态同步超时"));
          }, 10000);
          function receive(event: MessageEvent) {
            const message = JSON.parse(event.data);
            if (message.type === "error") {
              clearTimeout(timer);
              ws.removeEventListener("message", receive);
              reject(new Error(message.message));
            }
            if (message.type === "state" && message.room.revision > revision) {
              clearTimeout(timer);
              ws.removeEventListener("message", receive);
              resolve(message.room);
            }
          }
          ws.addEventListener("message", receive);
          ws.send(
            JSON.stringify({
              type: "command",
              command,
              revision,
              requestId: crypto.randomUUID(),
            }),
          );
        }),
      { command: action!.command, revision: view.revision },
    );
  }
  for (const tab of tabs) {
    await expect(tab.locator(".final-summary")).toBeVisible();
    await expect(tab.locator(".final-summary > div")).toHaveCount(2);
  }
  await page.reload();
  await expect(page.locator(".final-summary")).toBeVisible();
  await context.close();
});
