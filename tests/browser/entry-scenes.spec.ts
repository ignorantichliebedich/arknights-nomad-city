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
  for (const label of ["开始拓荒", "实操演习", "拓荒指南"])
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
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const phases: { phase: string; at: number }[] = [];
    (window as any).__entryPhases = phases;
    new MutationObserver(() => {
      const phase = document
        .querySelector(".entry-bootstrap")
        ?.getAttribute("data-boot-phase");
      if (phase && phases.at(-1)?.phase !== phase)
        phases.push({ phase, at: performance.now() });
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-boot-phase"],
    });
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
  const loadingBox = (await page.locator(".entry-bootstrap").boundingBox())!;
  expect(loadingBox.x).toBe(0);
  expect(loadingBox.y).toBe(0);
  expect(loadingBox.width).toBe(page.viewportSize()!.width);
  expect(await page.evaluate(() => (window as any).__musicStarts)).toBe(0);
  await page.screenshot({ path: info.outputPath("entry-loading.png") });
  release();
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  await expect(
    page.getByRole("button", { name: "窗口进入", exact: true }),
  ).toBeFocused();
  const phases = await page.evaluate(
    () => (window as any).__entryPhases as { phase: string; at: number }[],
  );
  expect(phases.map((value) => value.phase)).toEqual([
    "loading",
    "settling",
    "choice",
  ]);
  expect(phases[1].at - phases[0].at).toBeGreaterThanOrEqual(1750);
  expect(phases[2].at - phases[1].at).toBeGreaterThanOrEqual(150);
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
  await page.getByRole("button", { name: "开始拓荒", exact: true }).click();
  await expect(page.getByLabel("企业家昵称")).toBeFocused();
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

test("首页入场与双向回弹切换完整播放，运动期间锁定表单并在落位后交还焦点", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.getByRole("button", { name: "窗口进入", exact: true }).click();
  const content = page.locator(".entry-content");
  await expect(content).toHaveAttribute("inert", "");
  await expect(page.locator(".home-hero")).toHaveAttribute(
    "data-motion",
    "arriving",
  );
  await expect(content).not.toHaveAttribute("inert", "");
  const stage = page.locator(".departure-stage");
  await page.getByRole("button", { name: "开始拓荒", exact: true }).click();
  const hero = page.locator(".home-hero"),
    lobby = page.locator(".home-lobby");
  await expect(hero).toHaveAttribute("data-motion", "leaving");
  await expect(lobby).toHaveAttribute("data-motion", "entering");
  await expect(hero).toHaveAttribute("inert", "");
  await expect(lobby).toHaveAttribute("inert", "");
  const before = await lobby.evaluate((el) => getComputedStyle(el).transform);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest(".home-scene")),
  ).toBe(false);
  await page.waitForTimeout(260);
  expect(await lobby.evaluate((el) => getComputedStyle(el).transform)).not.toBe(
    before,
  );
  await page.screenshot({ path: info.outputPath("home-switch-motion.png") });
  await expect(stage).not.toHaveClass(/is-changing/);
  await expect(page.getByLabel("企业家昵称")).toBeFocused();
  await page.getByLabel("企业家昵称").fill("回弹之后继续拓荒");
  await page.getByRole("button", { name: "返回主视觉", exact: false }).click();
  await expect(hero).toHaveAttribute("data-motion", "entering");
  expect(
    await hero.evaluate(
      (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
    ),
  ).toBeLessThan(0);
  await expect(stage).not.toHaveClass(/is-changing/);
  await expect(
    page.getByRole("button", { name: "开始拓荒", exact: true }),
  ).toBeFocused();
  await openHomeLobby(page);
  await expect(page.getByLabel("企业家昵称")).toHaveValue("回弹之后继续拓荒");
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
  await openHomeLobby(page);
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
