import { test, expect, type Page } from "./fixtures/test.ts";
import { openHomeLobby } from "./fixtures/rooms.ts";
async function open(page: Page, name: string, tab = "匹配同行者") {
  await page.goto("/");
  await openHomeLobby(page);
  await page.getByLabel("企业家昵称").fill(name);
  await page.getByRole("button", { name: new RegExp(tab) }).click();
  await expect(
    page.getByRole("dialog", { name: "拓荒招募大厅" }),
  ).toBeVisible();
}
test("取消请求断线时窗口保持可见，重试成功后退出", async ({ page }) => {
  await open(page, "取消重试的旅人");
  await page.getByLabel("招募人数").selectOption("4");
  await page.getByRole("button", { name: "开始匹配" }).click();
  await expect(page.getByRole("button", { name: "取消匹配" })).toBeVisible();
  let failed = false;
  await page.route("**/api/matchmaking", async (route) => {
    if (!failed && route.request().method() === "DELETE") {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.keyboard.press("Escape");
  const modal = page.getByRole("dialog", { name: "拓荒招募大厅" });
  await expect(modal.getByRole("alert")).toBeVisible();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "取消匹配" }).click();
  await expect(modal.getByRole("button", { name: "开始匹配" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});
test("排队时打开指定邀请，保留受邀入口而不跳转到匹配页", async ({ page }) => {
  await open(page, "正在排队的旅人");
  await page.getByLabel("招募人数").selectOption("4");
  await page.getByRole("button", { name: "开始匹配" }).click();
  await expect(page.getByRole("button", { name: "取消匹配" })).toBeVisible();
  const pending = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("nomad:match:v1")!).token as string,
  );
  const response = await page.request.post("/api/rooms", {
    data: { name: "邀请房主" },
  });
  const { room } = await response.json();
  await page.goto(`/room/${room.id}`);
  await page.request.delete("/api/matchmaking", {
    headers: { Authorization: `Bearer ${pending}` },
  });
  await expect(
    page.getByRole("heading", { name: "赴一场拓荒之约" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "拓荒招募大厅" })).toHaveCount(
    0,
  );
});
for (const players of [2, 3, 4])
  test(`${players} 位企业家从匹配进入同一房间，刷新后保留席位`, async ({
    browser,
  }, info) => {
    test.setTimeout(90000);
    const contexts = await Promise.all(
      Array.from({ length: players }, () =>
        browser.newContext({
          viewport: info.project.use.viewport,
          isMobile: info.project.use.isMobile,
          hasTouch: info.project.use.hasTouch,
          userAgent: info.project.use.userAgent,
        }),
      ),
    );
    try {
      const pages = await Promise.all(contexts.map((c) => c.newPage()));
      await Promise.all(pages.map((p, i) => open(p, `${players}人匹配${i}`)));
      for (const p of pages) {
        await expect(p.getByLabel("招募人数")).toHaveValue("");
        await p.getByLabel("招募人数").selectOption(String(players));
        await p.getByLabel("招募玩法").selectOption("expert");
      }
      await pages[0]
        .getByRole("button", { name: "开始匹配", exact: false })
        .click();
      await expect(
        pages[0].getByRole("button", { name: "取消匹配", exact: false }),
      ).toBeVisible();
      await pages[0].reload();
      await expect(
        pages[0].getByRole("dialog", { name: "拓荒招募大厅" }),
      ).toBeVisible();
      await Promise.all(
        pages
          .slice(1)
          .map((p) =>
            p.getByRole("button", { name: "开始匹配", exact: false }).click(),
          ),
      );
      for (const p of pages) await expect(p).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
      expect(new Set(pages.map((p) => p.url())).size).toBe(1);
      await expect(pages[0].locator(".assembly-seat.occupied")).toHaveCount(
        players,
      );
      await expect(
        pages[0].getByRole("region", { name: "本桌招募设置" }),
      ).toContainText(`${players} 人局`);
      await pages[0].reload();
      await expect(
        pages[0].getByRole("button", { name: "准备出发" }),
      ).toBeVisible();
    } finally {
      for (const c of contexts) await c.close();
    }
  });
for (const viaMatch of [false, true])
  test(`公开招募支持${viaMatch ? "匹配补入" : "大厅选房"}，离座释放席位`, async ({
    page,
    browser,
  }, info) => {
    await page.goto("/");
    await openHomeLobby(page);
    await page.getByLabel("企业家昵称").fill("大厅招募房主");
    await page.getByLabel("公开招募同行者").check();
    await page.getByLabel("本桌人数").selectOption("3");
    await page.getByRole("button", { name: "创建新房间" }).click();
    await expect(page.locator(".connection")).toContainText("已连接");
    const address = page.url();
    const friendContext = await browser.newContext({
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
      userAgent: info.project.use.userAgent,
    });
    try {
      const friend = await friendContext.newPage();
      await open(friend, "大厅同行者", "找房间");
      await friend.getByLabel("招募人数").selectOption("2");
      await expect(
        friend
          .locator(".public-room-ticket")
          .filter({ hasText: "大厅招募房主" }),
      ).toHaveCount(0);
      await friend.getByLabel("招募人数").selectOption("3");
      const ticket = friend
        .locator(".public-room-ticket")
        .filter({ hasText: "大厅招募房主" });
      await expect(ticket).toBeVisible();
      await friend.screenshot({
        path: `test-results/${info.project.name}-recruitment-lobby.png`,
      });
      if (viaMatch) {
        await friend.getByRole("button", { name: /自动匹配/ }).click();
        await friend
          .getByRole("button", { name: "开始匹配", exact: false })
          .click();
      } else await ticket.getByRole("button", { name: "加入这场拓荒" }).click();
      await expect(friend).toHaveURL(address);
      await expect(page.locator(".assembly-seat.occupied")).toHaveCount(2);
      await friend
        .getByRole("button", { name: "离开席位", exact: true })
        .click();
      await expect(friend).toHaveURL(/\?view=lobby$/);
      await expect(page.locator(".assembly-seat.occupied")).toHaveCount(1);
    } finally {
      await friendContext.close();
    }
  });
test("取消与键盘退出匹配不会自动入座，招募窗口在手机与桌面可操作", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "取消匹配测试");
  await page.getByLabel("招募人数").selectOption("4");
  await page.getByRole("button", { name: "开始匹配", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "取消匹配", exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "拓荒招募大厅" })).toHaveCount(
    0,
  );
  expect(new URL(page.url()).pathname).toBe("/");
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: /匹配同行者/ }).click();
    const modal = page.getByRole("dialog", { name: "拓荒招募大厅" });
    await expect(modal).toBeVisible();
    await expect(page.getByLabel("招募人数")).toHaveValue("");
    await page.getByLabel("招募人数").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await modal.locator(".recruit-banner").click();
    const box = (await modal.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${info.project.name}-recruitment-${viewport.width}.png`,
    });
    await modal
      .getByRole("button", { name: "开始匹配" })
      .scrollIntoViewIfNeeded();
    await expect(modal.getByRole("button", { name: "开始匹配" })).toBeVisible();
    await modal.getByRole("button", { name: "返回上一级" }).click();
    await expect(modal).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
