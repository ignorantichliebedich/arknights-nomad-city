import { test, expect, type Page, type Locator } from "@playwright/test";
import { fixture } from "./fixtures/table.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand } from "../../packages/rules/src/engine.ts";

async function skipWelcome(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("nomad:fullscreen-prompt:1", "1"),
  );
}
function read(id: string) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    return store.get(id)!;
  } finally {
    store.close();
  }
}
async function fits(page: Page, element: Locator) {
  await element.evaluate(async (node) => {
    node.getBoundingClientRect();
    await Promise.all(
      node
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const box = (await element.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
async function tapCard(page: Page, card: Locator) {
  await page.locator(".hand-cards").evaluate(async (node) => {
    node.getBoundingClientRect();
    await Promise.all(
      node
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const point = await card.evaluate((element) => {
    const b = element.getBoundingClientRect();
    for (
      let y = Math.max(0, b.top) + 8;
      y < Math.min(innerHeight, b.bottom) - 8;
      y += 8
    )
      for (
        let x = Math.max(0, b.left) + 8;
        x < Math.min(innerWidth, b.right) - 8;
        x += 8
      )
        if (document.elementFromPoint(x, y)?.closest(".hand-card") === element)
          return { x, y };
    return null;
  });
  expect(point).toBeTruthy();
  await page.touchscreen.tap(point!.x, point!.y);
}
test("手机启程提示和表单适配竖屏与横屏，取消后可直接建房", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".phone-layout")).toBeVisible();
  const welcome = page.getByRole("dialog", { name: "全屏体验更佳" });
  await fits(page, welcome);
  const enter = welcome.getByRole("button", { name: /全屏体验/ });
  await enter.scrollIntoViewIfNeeded();
  await fits(page, enter);
  await page.screenshot({
    path: info.outputPath("phone-welcome.png"),
    animations: "disabled",
  });
  await welcome.getByRole("button", { name: "取消", exact: true }).tap();
  await page.getByLabel("企业家昵称").fill("手机上的企业家");
  await expect(page.getByLabel("企业家昵称")).toHaveCSS("font-size", "16px");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "创建新房间", exact: true }).tap();
  await expect(page.locator(".assembly-seat.is-mine")).toContainText(
    "手机上的企业家",
  );
  await page.screenshot({
    path: info.outputPath("phone-lobby.png"),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("全屏授权后才申请横屏，旋转保留输入，退出释放方向", async ({ page }) => {
  await page.addInitScript(() => {
    let full = false;
    (window as any).__displayCalls = [];
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => (full ? document.documentElement : null),
    });
    Element.prototype.requestFullscreen = async () => {
      (window as any).__displayCalls.push("fullscreen");
      full = true;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    document.exitFullscreen = async () => {
      full = false;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    Object.defineProperty(screen, "orientation", {
      configurable: true,
      value: {
        lock: async (direction: string) => {
          (window as any).__displayCalls.push(direction);
        },
        unlock: () => {
          (window as any).__displayCalls.push("unlock");
        },
      },
    });
  });
  await page.goto("/");
  expect(await page.evaluate(() => (window as any).__displayCalls)).toEqual([]);
  await page.getByRole("button", { name: /全屏体验/ }).tap();
  await expect(page.locator(".fullscreen-welcome")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__displayCalls)).toEqual([
    "fullscreen",
    "landscape",
  ]);
  await page.getByLabel("企业家昵称").fill("旋转保留名字");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByLabel("企业家昵称")).toHaveValue("旋转保留名字");
  await expect(page.locator(".phone-rotate-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "退出全屏", exact: true }).tap();
  expect(await page.evaluate(() => (window as any).__displayCalls)).toEqual([
    "fullscreen",
    "landscape",
    "unlock",
  ]);
});

for (const denied of ["lock", "fullscreen"] as const)
  test(denied + " 被拒绝时继续游戏，横放后自动适配", async ({ page }) => {
    await page.addInitScript((denied) => {
      let full = false;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => (full ? document.documentElement : null),
      });
      Element.prototype.requestFullscreen = async () => {
        if (denied === "fullscreen")
          throw new DOMException("Not supported", "NotSupportedError");
        full = true;
        document.dispatchEvent(new Event("fullscreenchange"));
      };
      Object.defineProperty(screen, "orientation", {
        configurable: true,
        value: {
          lock: async () => {
            throw new DOMException("Denied", "NotSupportedError");
          },
          unlock: () => {},
        },
      });
    }, denied);
    await page.goto("/");
    await page.getByRole("button", { name: /全屏体验/ }).tap();
    await expect(page.locator(".fullscreen-welcome")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".phone-rotate-hint")).toContainText("横放手机");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator(".phone-rotate-hint")).toHaveCount(0);
    await expect(page.getByLabel("企业家昵称")).toBeVisible();
  });

test("触控棋桌占满视野，配件盘查看城市后可直接部署", async ({ page }, info) => {
  await skipWelcome(page);
  const { id } = await fixture(page);
  const before = read(id);
  await fits(page, page.locator(".game-layout"));
  await fits(page, page.locator(".board-viewport"));
  expect(
    (await page.locator(".board-viewport").boundingBox())!.height,
  ).toBeGreaterThan(150);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    ),
  ).toBeLessThanOrEqual(1);
  await expect(page.locator(".game-sidebar")).toBeHidden();
  await expect(page.locator(".board-toolbar")).toBeHidden();
  await page.getByRole("button", { name: "调整棋盘视野" }).tap();
  await expect(page.locator(".board-toolbar")).toBeVisible();
  await page.getByRole("button", { name: "放大棋盘" }).tap();
  await expect(page.locator(".board-viewport")).toHaveClass(/can-pan/);
  await page.getByRole("button", { name: "复位", exact: true }).tap();
  await page.getByRole("button", { name: "调整棋盘视野" }).tap();
  await expect(page.locator(".phone-resource-hud [data-resource]")).toHaveCount(
    6,
  );
  await page.getByRole("button", { name: "查看资源、玩家与城市" }).tap();
  await expect(page.locator(".game-sidebar")).toBeVisible();
  await fits(page, page.locator(".game-sidebar"));
  await page.getByRole("button", { name: "我的城市", exact: true }).tap();
  const city = page.locator(".city-window");
  await expect(city).toBeVisible();
  await fits(page, city);
  await city.getByRole("button", { name: "关闭弹窗" }).tap();
  if (await page.locator(".game-sidebar").isVisible())
    await page.getByRole("button", { name: "关闭配件盘" }).tap();
  await page.locator(".deployment-slot").first().tap();
  await expect(page.locator(".placement-panel")).toBeVisible();
  expect(read(id).revision).toBe(before.revision);
  await fits(page, page.getByRole("button", { name: /确认放置/ }));
  await page.screenshot({
    path: info.outputPath("phone-deployment.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: /确认放置/ }).tap();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(before.revision + 2),
  );
  await page.getByRole("button", { name: "声音设置" }).tap();
  const audio = page.getByRole("dialog", { name: "声音与音乐" });
  await fits(page, audio);
  await audio.getByRole("button", { name: "关闭弹窗" }).tap();
});

test("手指选牌、收放扇面与确认盖放，旋转刷新不丢席位", async ({
  page,
}, info) => {
  await skipWelcome(page);
  const { id } = await fixture(page, "select");
  await expect(page.locator(".fan-hand")).toHaveClass(/is-expanded/);
  const card = page.locator(".hand-card.playable").first();
  const initial = read(id);
  await tapCard(page, card);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  expect(read(id).revision).toBe(initial.revision);
  await fits(page, page.getByRole("button", { name: "确认盖放", exact: true }));
  await page.screenshot({
    path: info.outputPath("phone-role-hand.png"),
    animations: "disabled",
  });
  await page.locator(".fan-toggle").tap();
  await expect(page.locator(".fan-hand")).toHaveClass(/is-folded/);
  await page.locator(".fan-toggle").tap();
  await page.getByRole("button", { name: "确认盖放", exact: true }).tap();
  await expect(page.locator(".room-toolbar")).not.toHaveAttribute(
    "data-revision",
    String(initial.revision),
  );
  const covered = read(id).game!.players[0].selected;
  expect(covered).toBeTruthy();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await expect(page.locator(".connection")).toContainText("已连接");
  expect(read(id).game!.players[0].selected).toBe(covered);
  await expect(page.locator(".selected-role")).toBeVisible();
});

test("双指缩放仅移动镜头，结束手势不误放棋子", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native multi-touch injection is provided by Chromium CDP",
  );
  await skipWelcome(page);
  const { id } = await fixture(page);
  const before = read(id);
  const rect = (await page.locator(".board-viewport").boundingBox())!;
  const cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2;
  const session = await page.context().newCDPSession(page);
  const points = (gap: number) => [
    { x: cx - gap, y: cy, id: 0 },
    { x: cx + gap, y: cy, id: 1 },
  ];
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(24),
  });
  for (const gap of [32, 44, 56])
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(gap),
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".board-viewport")).toHaveClass(/can-pan/);
  await expect(page.locator(".zoom-controls > span")).toContainText("233%");
  expect(read(id).revision).toBe(before.revision);
  await expect(
    page.locator(
      ".placement-panel, .influence-preview, .route-panel, dialog[open]",
    ),
  ).toHaveCount(0);
});

test("手机事件卡、结果按钮与合作企业长内容可查看和关闭", async ({
  page,
}, info) => {
  await skipWelcome(page);
  const { id } = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!,
      game = room.game!;
    const actor = game.players[0].id;
    const node = game.board.nodes.find(
      (node) => node.tier === "green" && !game.sites[node.id].resource,
    )!;
    game.expansion = room.expansion = true;
    game.activeEnterprises = ["bank", "heide"];
    for (const player of game.players)
      player.enterprise = { bank: 0, heide: 0 };
    game.eventDecks.green = [
      "green-1",
      ...game.eventDecks.green.filter((id) => id !== "green-1"),
    ];
    game.queue = [];
    game.decision = {
      playerId: actor,
      kind: "fixture",
      title: "手机探索准备",
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
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  const event = page.getByRole("dialog", { name: "探索事件", exact: true });
  await expect(event).toBeVisible();
  await fits(page, event);
  await event.locator(".event-option").first().tap();
  const confirm = event.getByRole("button", { name: /确认选择/ });
  await confirm.scrollIntoViewIfNeeded();
  await fits(page, confirm);
  await page.screenshot({
    path: info.outputPath("phone-event.png"),
    animations: "disabled",
    scale: "css",
  });
  await confirm.tap();
  await expect(event).toHaveCount(0);
  await page.getByRole("button", { name: "查看资源、玩家与城市" }).tap();
  await page.getByRole("button", { name: "合作企业", exact: true }).tap();
  const companies = page.locator(".enterprise-window");
  await expect(companies).toBeVisible();
  await fits(page, companies);
  expect(
    await companies.evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(2);
  await companies.getByRole("button", { name: "关闭弹窗" }).tap();
});
