import { test, expect, type Page } from "@playwright/test";
import { openHomeLobby, roomRequest } from "./fixtures/rooms.ts";

async function finishIntro(page: Page) {
  await page.getByRole("button", { name: "窗口进入", exact: true }).click();
  await expect(page.locator(".entry-bootstrap")).toHaveCount(0);
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  for (const label of ["开始拓荒", "加入好友"])
    if (
      await page
        .getByRole("button", { name: label, exact: label === "开始拓荒" })
        .isVisible()
    ) {
      const box = (await page
        .getByRole("button", { name: label, exact: label === "开始拓荒" })
        .boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(box.y + box.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
    }
}

test("实际资源解码推进加载，选择窗口后播放音乐，双场景保留输入并正确转移焦点", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    (window as any).__musicStarts = 0;
    HTMLMediaElement.prototype.play = function () {
      if (this.getAttribute("src")?.includes("/audio/music/"))
        (window as any).__musicStarts++;
      return play.call(this);
    };
  });
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/entrepreneur-3.webp", async (route) => {
    await delayed;
    await route.continue();
  });
  // The resource is deliberately held open; Firefox includes it in `load`.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const progress = page.getByRole("progressbar", { name: "首屏资源加载" });
  await expect
    .poll(async () => Number(await progress.getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  expect(Number(await progress.getAttribute("aria-valuenow"))).toBeLessThan(
    100,
  );
  await expect(page.locator(".fullscreen-welcome")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__musicStarts)).toBe(0);
  await page.screenshot({ path: info.outputPath("entry-loading.png") });
  release();
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  await expect(
    page.getByRole("button", { name: "窗口进入", exact: true }),
  ).toBeFocused();
  await finishIntro(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).__musicStarts))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "明日方舟 游城拓荒" }),
  ).toBeVisible();
  await expect(page.locator(".poster-jitter img")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "创建新房间" })).toHaveCount(0);
  await fits(page);
  await page.screenshot({
    path: info.outputPath("entry-poster.png"),
    animations: "disabled",
  });
  await openHomeLobby(page);
  await expect(page.getByLabel("企业家昵称")).toBeFocused();
  await page.getByLabel("企业家昵称").fill("一起拓荒");
  await page.getByLabel("房间码").fill("ABC123");
  await page.getByRole("checkbox", { name: "创建房间时启用企业扩展" }).check();
  await page.getByRole("button", { name: "返回主视觉", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "开始拓荒", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".entry-bootstrap")).toHaveCount(0);
  await page.getByRole("button", { name: "加入好友", exact: false }).click();
  await expect(page.getByLabel("房间码")).toBeFocused();
  await expect(page.getByLabel("企业家昵称")).toHaveValue("一起拓荒");
  await expect(page.getByLabel("房间码")).toHaveValue("ABC123");
  await expect(
    page.getByRole("checkbox", { name: "创建房间时启用企业扩展" }),
  ).toBeChecked();
  await page.screenshot({
    path: info.outputPath("entry-permit.png"),
    animations: "disabled",
  });
  await fits(page);
  expect(errors).toEqual([]);
});

test("图片失败可重试或直接进入，矢量标题提供文字替代，刷新不会重复全屏提示", async ({
  page,
}) => {
  const failedArtwork =
    /\/assets\/(title-glyph-660e\.svg|official-nomad-logo\.webp)$/;
  await page.route(failedArtwork, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".boot-resource-error")).toContainText("2 项图片");
  expect(
    Number(await page.getByRole("progressbar").getAttribute("aria-valuenow")),
  ).toBeLessThan(100);
  await page.unroute(failedArtwork);
  await page.getByRole("button", { name: /重试 2 项图片/ }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await finishIntro(page);
  await page.route(failedArtwork, (route) => route.abort());
  await page.reload();
  await expect(page.locator(".fullscreen-welcome")).toHaveCount(0);
  await page.getByRole("button", { name: "继续进入", exact: false }).click();
  await expect(page.locator(".poster-fallback").first()).toBeVisible();
  await expect(page.locator(".official-wordmark > span")).toBeVisible();
  await expect(page.locator(".official-wordmark img")).toBeHidden();
  await openHomeLobby(page);
  await expect(page.getByLabel("企业家昵称")).toBeEditable();
});

test("邀请直达大厅，减少动态保留错落构图，横竖屏切换保持填写内容", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("nomad:fullscreen-prompt:1", "1"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { room } = await roomRequest(page, "/api/rooms", "场景切换邀请人");
  await page.goto(`/room/${room.id}`);
  await expect(page.locator(".departure-stage")).toHaveAttribute(
    "data-scene",
    "lobby",
  );
  await expect(page.locator(".permit-invitation")).toContainText(room.id);
  await page.getByLabel("企业家昵称").fill("受邀的同行者");
  const original = page.viewportSize()!;
  await page.setViewportSize({
    width: original.height,
    height: original.width,
  });
  await expect(page.getByLabel("企业家昵称")).toHaveValue("受邀的同行者");
  await page.setViewportSize(original);
  await page.getByRole("button", { name: "返回主视觉", exact: false }).click();
  await expect(page.locator(".departure-stage")).toHaveAttribute(
    "data-scene",
    "hero",
  );
  expect(
    await page
      .locator(".poster-wave")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".poster-tile")
      .first()
      .evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe("none");
  await fits(page);
  await page.getByRole("button", { name: "开始拓荒", exact: true }).dblclick();
  await expect(page.getByLabel("企业家昵称")).toBeFocused();
  await expect(page.locator(".departure-stage")).not.toHaveClass(/is-changing/);
});
