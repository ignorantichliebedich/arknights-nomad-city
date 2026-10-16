import { openHomeLobby } from "./fixtures/rooms.ts";
import { test, expect, type Page } from "./fixtures/test.ts";
import { clickRoomButton, roomRequest } from "./fixtures/rooms.ts";

async function fitsViewport(page: Page) {
  // Wait for finite entrance animations, leaving the ambient background running.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - innerWidth,
      height: document.documentElement.scrollHeight - innerHeight,
    })),
  ).toEqual({ width: 0, height: 0 });
}

async function artworkLoaded(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("main img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
}

test("拓荒许可表单支持房间码回车加入，邀请入口保留名字与减少动画设置", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "明日方舟 游城拓荒" }),
  ).toBeVisible();
  await artworkLoaded(page);
  await fitsViewport(page);
  await page.screenshot({
    path: info.outputPath("entry-home.png"),
    animations: "disabled",
  });
  await openHomeLobby(page);
  await expect(page.getByRole("button", { name: "创建新房间" })).toBeDisabled();
  await page.getByLabel("企业家昵称").fill("应邀而来的企业家");
  await page.getByRole("checkbox", { name: "创建房间时启用企业扩展" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".permit-edition")).toContainText(
    "铸基者 + 企业扩展",
  );
  const { room } = await roomRequest(page, "/api/rooms", "远行的朋友");
  await page.getByLabel("房间码").fill(room.id.toLowerCase());
  const request = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith(`/api/rooms/${room.id}/join`),
  );
  await page.getByLabel("房间码").press("Enter");
  expect((await request).status()).toBe(201);
  await expect(page).toHaveURL(`/room/${room.id}`);
  await expect(page.locator(".assembly-seat.is-mine")).toContainText(
    "应邀而来的企业家",
  );
  await expect(page.locator(".dossier-facts")).toContainText("铸基者 · 基础版");
  await expect(page.getByRole("button", { name: "开始拓荒" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".assembly-seat.is-mine")).toContainText(
    "应邀而来的企业家",
  );
  await page.getByRole("button", { name: "返回游戏入口" }).click();
  await expect(page.getByLabel("企业家昵称")).toHaveValue("应邀而来的企业家");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const invitation = await roomRequest(page, "/api/rooms", "另一位朋友");
  await page.goto(`/room/${invitation.room.id}`);
  await expect(page.locator(".permit-invitation")).toContainText(
    invitation.room.id,
  );
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "加入这场拓荒" }),
  ).toBeEnabled();
  await artworkLoaded(page);
  await fitsViewport(page);
  expect(
    await page
      .locator(".expedition-landscape")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".founder-card")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.screenshot({
    path: info.outputPath("entry-invitation.png"),
    animations: "disabled",
  });
  await clickRoomButton(page, "加入这场拓荒");
  await expect(page.locator(".assembly-seat.is-mine")).toContainText(
    "应邀而来的企业家",
  );
  expect(errors).toEqual([]);
});

test("集结桌同步四人入座与准备，断线保留席位并阻止开局，房主确认后进入棋盘", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await openHomeLobby(page);
  await page.getByLabel("企业家昵称").fill("一起向荒野出发的第一位企业家");
  await page.getByRole("checkbox").check();
  await clickRoomButton(page, "创建新房间");
  await expect(page.locator(".assembly-count")).toContainText("01");
  await expect(page.getByRole("button", { name: "开始拓荒" })).toBeDisabled();
  await expect(page.locator(".assembly-readiness")).toContainText(
    "邀请朋友或添加人机",
  );
  // The arrival dialog owns focus until its short cut finishes.
  await expect(page.locator(".scene-transition")).toHaveCount(0);
  await page
    .getByRole("button", { name: "邀请朋友入座 2", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "邀请朋友加入" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "邀请地址" })).toHaveValue(
    page.url(),
  );
  await page.screenshot({
    path: info.outputPath("invitation-pass.png"),
    animations: "disabled",
  });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard unavailable");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "复制邀请地址" }).click();
  await expect(page.locator(".invitation-copy-status")).toContainText("Ctrl+C");
  await expect(page.getByRole("textbox", { name: "邀请地址" })).toBeFocused();
  expect(
    await page
      .locator("#invitation-address")
      .evaluate((el: HTMLInputElement) =>
        el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0),
      ),
  ).toBe(page.url());
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "邀请朋友入座 2", exact: true }),
  ).toBeFocused();
  await artworkLoaded(page);
  await fitsViewport(page);
  await page.screenshot({
    path: info.outputPath("lobby-waiting.png"),
    animations: "disabled",
  });
  const url = page.url();
  const contexts = [];
  const friends: Page[] = [];
  try {
    for (const name of ["红砂城的信使", "长夏与远行", "荒野观察员"]) {
      const context = await browser.newContext({
        viewport: info.project.use.viewport,
      });
      contexts.push(context);
      const friend = await context.newPage();
      friends.push(friend);
      friend.on("pageerror", (e) => errors.push(e.message));
      await friend.goto(url);
      await openHomeLobby(friend);
      await friend.getByLabel("企业家昵称").fill(name);
      await clickRoomButton(friend, "加入这场拓荒");
      await expect(friend.locator(".assembly-seat.is-mine")).toContainText(
        name,
      );
      await friend.getByRole("button", { name: "准备出发" }).click();
      await expect(
        friend.getByRole("button", { name: "取消准备" }),
      ).toBeEnabled();
      await expect(
        friend.getByRole("button", { name: "开始拓荒" }),
      ).toHaveCount(0);
    }
    await expect(page.locator(".assembly-seat.occupied")).toHaveCount(4);
    await expect(page.locator(".assembly-readiness")).toContainText("3 / 4");
    await page.getByRole("button", { name: "准备出发" }).click();
    await expect(page.getByRole("button", { name: "开始拓荒" })).toBeEnabled();
    await expect(page.locator(".assembly-ready-stamp")).toHaveCount(4);
    await expect(page.locator(".game-layout")).toHaveCount(0);
    await artworkLoaded(page);
    await fitsViewport(page);
    await page.screenshot({
      path: info.outputPath("lobby-ready.png"),
      animations: "disabled",
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "取消准备" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "开始拓荒" })).toBeEnabled();
    await friends[0].getByRole("button", { name: "取消准备" }).click();
    await expect(page.getByRole("button", { name: "开始拓荒" })).toBeDisabled();
    await friends[0].getByRole("button", { name: "准备出发" }).click();
    await expect(page.getByRole("button", { name: "开始拓荒" })).toBeEnabled();
    await friends[1].close();
    await expect(page.locator(".assembly-seat.is-offline")).toContainText(
      "长夏与远行",
    );
    await expect(page.locator(".assembly-readiness")).toContainText(
      "等待离线的企业家重新连接",
    );
    await expect(page.locator(".assembly-readiness")).toContainText("3 / 4");
    await expect(page.getByRole("button", { name: "开始拓荒" })).toBeDisabled();
    const restored = await contexts[1].newPage();
    await restored.goto(url);
    await expect(restored.locator(".assembly-seat.is-mine")).toContainText(
      "长夏与远行",
    );
    await expect(page.getByRole("button", { name: "开始拓荒" })).toBeEnabled();
    await page.getByRole("button", { name: "开始拓荒" }).click();
    await expect(
      page.getByRole("group", { name: "第 105 号拓荒区棋盘" }),
    ).toBeVisible();
    await expect(page.locator(".expedition-atmosphere")).toHaveCount(0);
    await expect(page.locator(".topbar.in-game")).toBeVisible();
    await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
    await page.getByRole("button", { name: "返回游戏入口" }).click();
    await expect(page.locator(".topbar.staging-header")).toBeVisible();
    await expect(page.locator(".departure-entry")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
