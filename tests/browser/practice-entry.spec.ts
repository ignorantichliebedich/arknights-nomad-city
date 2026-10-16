import { test, expect } from "./fixtures/test.ts";

test("主视觉票签可触达，进入与退出实操播放独立过场并保留练习", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const posts: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".entry-bootstrap")).toHaveCount(0);
  await expect(page.locator(".departure-stage")).not.toHaveClass(/is-arriving/);
  const hero = page.locator(".home-hero");
  await expect(hero.getByRole("button", { name: /加入好友/ })).toHaveCount(0);
  await expect(hero).not.toContainText("在荒野落下第一枚棋子");
  await expect(hero).not.toContainText("与朋友建设城市");
  for (const name of ["实操演习", "拓荒指南"]) {
    const button = hero.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const bounds = (await button.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
  }
  await page.screenshot({
    path: info.outputPath("home-tickets.png"),
    animations: "disabled",
  });
  await hero
    .getByRole("button", { name: "拓荒指南", exact: true })
    .press("Enter");
  await expect(page.getByRole("dialog", { name: "拓荒指南" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    hero.getByRole("button", { name: "拓荒指南", exact: true }),
  ).toBeFocused();

  // Keep a short-lived modal deterministic across native 3× WebKit screenshots.
  // The second test exercises the same cuts with real timers.
  const clockStart = new Date("2026-10-16T00:00:00Z");
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 100));
  const historyBefore = await page.evaluate(() => history.length);
  // Repeated input in one event turn must produce just one local practice visit.
  await hero
    .getByRole("button", { name: "实操演习", exact: true })
    .evaluate((el: HTMLButtonElement) => {
      el.click();
      el.click();
    });
  const entering = page.getByRole("dialog", { name: "实操推演", exact: true });
  await expect(entering).toBeVisible();
  await expect(entering).toContainText("选牌与秘密盖放");
  await expect(entering.locator(".practice-cut-sheet")).toHaveCSS(
    "animation-name",
    "practice-sheet-in",
  );
  expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1);
  await page.locator(".brand").evaluate((el: HTMLButtonElement) => el.focus());
  await expect(
    entering.getByRole("button", { name: "跳过动画" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.clock.runFor(20);
  await expect(entering).toHaveCount(0);
  await expect(page.locator(".practice-guide-heading")).toBeFocused();
  const saved = await page.evaluate(() =>
    localStorage.getItem("nomad:practice:1"),
  );
  expect(saved).toBeTruthy();
  await page.getByRole("button", { name: "退出练习", exact: true }).click();
  const leaving = page.getByRole("dialog", { name: "演习收卷", exact: true });
  await expect(leaving).toBeVisible();
  await expect(leaving).toContainText("返回启程首页");
  await expect(leaving.locator(".practice-cut-sheet")).toHaveCSS(
    "animation-name",
    "practice-sheet-out",
  );
  await page.clock.runFor(1200);
  await expect(leaving).toHaveCount(0);
  await expect(
    hero.getByRole("button", { name: "实操演习", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("nomad:practice:1")),
  ).toBe(saved);
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test("实操刷新不重播，浏览器返回和标识退出经过收卷，减少动态不摇晃", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "实操演习", exact: true }).click();
  await expect(page.locator(".practice-curtain")).toHaveCount(0);
  await expect(page).toHaveURL(/#practice$/);
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "实操教程任务" }),
  ).toBeVisible();
  await expect(page.locator(".practice-curtain")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "演习收卷", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".practice-curtain")).toHaveCount(0);
  await page.getByRole("button", { name: "实操演习", exact: true }).click();
  await expect(page.locator(".practice-curtain")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "返回游戏入口", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "演习收卷", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "跳过动画" }).click();
  await expect(page.locator(".practice-curtain")).toHaveCount(0);
  await expect(page).not.toHaveURL(/#practice$/);
  await expect(page.locator(".departure-stage")).not.toHaveClass(/is-arriving/);
});
