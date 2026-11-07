import { test, expect, type Locator, type Page } from "./fixtures/test.ts";
import { openHomeLobby } from "./fixtures/rooms.ts";

async function dragContent(page: Page, view: Locator, down = false) {
  const box = (await view.boundingBox())!;
  const x = box.x + box.width - 16;
  const start = box.y + box.height * (down ? 0.25 : 0.8);
  const end = box.y + box.height * (down ? 0.8 : 0.25);
  if (page.context().browser()!.browserType().name() !== "chromium") {
    // Mobile WebKit has no swipe/wheel injection in Playwright. Check scroll
    // reachability and taps there; Chromium also verifies native finger input.
    await view.evaluate(
      (el, delta) => el.scrollBy(0, delta),
      (down ? -1 : 1) * box.height * 0.55,
    );
    return;
  }
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: start, id: 1 }],
    });
    for (let i = 1; i <= 10; i++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: start + ((end - start) * i) / 10, id: 1 }],
      });
    }
    // Hold briefly before lifting, so this checks dragging rather than a fling.
    await page.waitForTimeout(120);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

test("拓荒许可可连续滚动，页面保持固定且许可约占半屏", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!isMobile, "Touch layout is exercised by the mobile projects");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openHomeLobby(page);
  const view = page.locator(".permit-folio .phone-page-viewport");
  await expect(view).toBeVisible();
  await expect(view).toHaveCSS("touch-action", "pan-y");
  await expect(view).toHaveCSS("overflow-y", "auto");
  await view.evaluate((el) => el.scrollTo(0, 0));
  await dragContent(page, view);
  await expect
    .poll(() => view.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(30);
  const layout = await page.evaluate(() => {
    const area = document.querySelector(".home-lobby")!.getBoundingClientRect();
    const card = document
      .querySelector(".permit-folio")!
      .getBoundingClientRect();
    const view = document
      .querySelector(".permit-folio .phone-page-viewport")!
      .getBoundingClientRect();
    return {
      portion:
        innerWidth > innerHeight
          ? card.width / area.width
          : card.height / area.height,
      x: scrollX,
      y: scrollY,
      fits:
        view.left >= 0 &&
        view.top >= 0 &&
        view.right <= innerWidth &&
        view.bottom <= innerHeight,
    };
  });
  expect(layout.portion).toBeGreaterThan(0.43);
  expect(layout.portion).toBeLessThan(0.53);
  expect({ x: layout.x, y: layout.y }).toEqual({ x: 0, y: 0 });
  expect(layout.fits).toBe(true);
  await expect(
    page.getByRole("button", { name: "← 返回主视觉" }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: info.outputPath("permit-native-scroll.png"),
    animations: "disabled",
    scale: "css",
  });
  await dragContent(page, view, true);
  await expect.poll(() => view.evaluate((el) => el.scrollTop)).toBeLessThan(30);
});

/** Find a reachable point by actual scrolling; never let locator.tap auto-scroll. */
async function revealWithGesture(page: Page, target: Locator) {
  const view = page.locator(".permit-folio .phone-page-viewport");
  for (let step = 0; step < 24; step++) {
    const point = await target.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const area = el.closest(".phone-page-viewport")!.getBoundingClientRect();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x,
        y,
        visible:
          x > area.left + 4 &&
          x < area.right - 4 &&
          y > area.top + 12 &&
          y < area.bottom - 12 &&
          (hit === el || el.contains(hit)),
        down: y < area.top + 12,
      };
    });
    if (point.visible) return point;
    await dragContent(page, view, point.down);
  }
  throw new Error("Form control remained unreachable after native scrolling");
}

test("半屏许可连续滑动可创建感染者房间，再从卡片底部加入邀约", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!isMobile, "Mobile permit interaction");
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openHomeLobby(page);
  const nickname = page.getByLabel("企业家昵称");
  await revealWithGesture(page, nickname);
  await nickname.fill("手指操作企业家");
  for (const control of [
    page.getByRole("checkbox", { name: "创建房间时启用感染者扩展" }),
    page.locator(".permit-expert input"),
  ]) {
    if (!(await control.isChecked())) {
      const point = await revealWithGesture(page, control);
      await page.touchscreen.tap(point.x, point.y);
    }
    await expect(control).toBeChecked();
  }
  const create = page.getByRole("button", { name: "创建新房间", exact: true });
  const point = await revealWithGesture(page, create);
  await page.screenshot({
    path: info.outputPath("permit-create-reachable.png"),
    animations: "disabled",
    scale: "css",
  });
  const request = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/rooms"),
  );
  await page.touchscreen.tap(point.x, point.y);
  const result = await request;
  expect(result.status()).toBe(201);
  const created = await result.json();
  expect(created.room.oripathy).toBe(true);
  expect(created.room.expert).toBe(true);
  await expect(page.locator(".assembly-seat.is-mine")).toContainText(
    "手指操作企业家",
  );
  await page.getByRole("button", { name: "返回联机大厅", exact: true }).tap();
  const invitation = await page.request.post("/api/rooms", {
    data: { name: "滑动邀约房主" },
  });
  expect(invitation.status()).toBe(201);
  const { room } = await invitation.json();
  const code = page.getByRole("textbox", { name: /^房间码/ });
  await revealWithGesture(page, code);
  await code.fill(room.id);
  const join = page
    .locator(".permit-join")
    .getByRole("button", { name: "加入" });
  const joinPoint = await revealWithGesture(page, join);
  await page.touchscreen.tap(joinPoint.x, joinPoint.y);
  await expect(page).toHaveURL(new RegExp("/room/" + room.id + "$"));
  await expect(page.locator(".assembly-seat.is-mine")).toContainText(
    "手指操作企业家",
  );
});
