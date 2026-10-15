import { test, expect, type Page } from "./fixtures/test.ts";
import { fixture } from "./fixtures/table.ts";
import { clickRoomButton } from "./fixtures/rooms.ts";

async function roomVersion(page: Page) {
  return page.locator(".room-toolbar").getAttribute("data-revision");
}

test("手牌悬停放大且离开自动收回，保留选牌并连贯移动到确认区", async ({
  page,
}, info) => {
  await fixture(page, "select");
  const before = await roomVersion(page);
  const fan = page.locator(".fan-hand");
  const card = page.locator(".hand-card.playable").last();
  await expect(fan).toHaveClass(/is-expanded/);
  await page.locator(".hand-cards").evaluate(async (el) => {
    getComputedStyle(el).bottom;
    await Promise.all(
      el.getAnimations().map((a) => a.finished.catch(() => {})),
    );
  });
  expect(
    await card.evaluate((el) => parseFloat(getComputedStyle(el).width)),
  ).toBeGreaterThanOrEqual(168);
  await card.hover();
  await expect
    .poll(() =>
      card.evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el.parentElement!).transform);
        return Math.hypot(m.a, m.b);
      }),
    )
    .toBeGreaterThan(1.14);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  const chosen = await card.getAttribute("aria-label");
  await page.screenshot({
    path: info.outputPath("hand-hover-large.png"),
    animations: "disabled",
  });
  await page.mouse.move(600, 110);
  await expect(fan).toHaveClass(/is-folded/);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".fan-confirm")).toHaveCount(0);
  expect(await roomVersion(page)).toBe(before);
  expect(
    await page.evaluate(
      () => !!document.elementFromPoint(600, 110)?.closest(".fan-hand"),
    ),
  ).toBe(false);
  await page.screenshot({
    path: info.outputPath("hand-retracted.png"),
    animations: "disabled",
  });
  // Re-enter an actually visible card head, without synthetic focus or clicks.
  const head = await card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    for (
      let y = Math.max(0, box.top);
      y < Math.min(innerHeight - 8, box.bottom);
      y += 4
    )
      for (
        let x = Math.max(0, box.left);
        x < Math.min(innerWidth, box.right);
        x += 6
      )
        if (document.elementFromPoint(x, y)?.closest(".hand-card") === el)
          return { x, y };
    return null;
  });
  expect(head).toBeTruthy();
  await page.mouse.move(head!.x, head!.y);
  await expect(fan).toHaveClass(/is-expanded/);
  await expect(page.locator(".hand-card.picked")).toHaveAttribute(
    "aria-label",
    chosen!,
  );
  await card.hover();
  const confirmation = page.locator(".fan-confirm");
  const box = (await confirmation.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 24, { steps: 18 });
  await page.waitForTimeout(400); // Longer than the retract delay: the bridge must keep the panel open.
  await expect(fan).toHaveClass(/is-expanded/);
  await page.getByRole("button", { name: "确认盖放", exact: true }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(Number(before) + 1),
  );
  await expect(fan).toHaveClass(/is-folded/);
  // With no confirmation panel, empty space beside the hand belongs to the map.
  await page.getByRole("button", { name: /^角色手牌 / }).click();
  await expect(fan).toHaveClass(/is-expanded/);
  const table = (await page.locator(".table-area").boundingBox())!;
  await page.mouse.move(
    table.x + table.width - 30,
    table.y + table.height - 200,
  );
  await expect(fan).toHaveClass(/is-folded/);
});

test("新手教程可独立练习，查询操作和牌面不提交对局指令", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const posts: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "新手教程", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "拓荒指南" });
  await guide
    .getByRole("navigation", { name: "教程章节" })
    .getByRole("button", { name: /选一张牌/ })
    .click();
  await expect(
    guide.getByRole("button", { name: "确认练习盖放" }),
  ).toBeDisabled();
  await guide
    .getByRole("button", { name: /^练习选牌 / })
    .first()
    .click();
  await guide.getByRole("button", { name: "确认练习盖放" }).click();
  await expect(guide.getByRole("status")).toContainText("盖放完成");
  await expect(
    guide.locator(".lesson-practice-hand .chosen img"),
  ).toHaveAttribute("src", "/assets/role-back.webp");
  await page.screenshot({
    path: info.outputPath("tutorial-role.png"),
    animations: "disabled",
  });
  await guide
    .getByRole("navigation", { name: "教程章节" })
    .getByRole("button", { name: /亲自落子/ })
    .click();
  await guide.getByRole("button", { name: "预览城市移动" }).click();
  await expect(guide.getByRole("status")).toContainText("正式对局还需核对费用");
  await guide
    .getByRole("navigation", { name: "教程章节" })
    .getByRole("button", { name: /一起结算/ })
    .click();
  await guide.getByRole("button", { name: "练习选择采集点 A" }).click();
  await guide.getByRole("button", { name: "练习选择采集点 B" }).click();
  await expect(guide.getByRole("status")).toContainText("已选 2 处");
  await guide.getByRole("button", { name: "练习选择采集点 A" }).click();
  await expect(guide.getByRole("status")).toContainText("已选 1 处");
  await guide.getByRole("button", { name: "确认练习方案" }).click();
  await expect(guide.getByRole("status")).toContainText("等全员完成后统一收付");
  await page.screenshot({
    path: info.outputPath("tutorial-harvest.png"),
    animations: "disabled",
  });
  await guide.getByRole("button", { name: /^功能查询/ }).click();
  await guide.getByRole("searchbox").fill("路费");
  await guide
    .getByRole("navigation", { name: "查询结果" })
    .getByRole("button", { name: /采集、路线与支付路费/ })
    .click();
  await expect(guide.locator(".guide-result")).toContainText(
    "全员确认后统一支付",
  );
  await page.screenshot({
    path: info.outputPath("feature-lookup.png"),
    animations: "disabled",
  });
  await guide.getByRole("searchbox").fill("罗德岛");
  await guide.getByRole("button", { name: "企业", exact: true }).click();
  await expect(
    guide.getByRole("heading", { name: "罗德岛", exact: true }),
  ).toBeVisible();
  await expect(guide.locator(".guide-result-art")).toHaveAttribute(
    "src",
    /-hd.webp$/,
  );
  await guide.getByRole("searchbox").fill("无法命中的abcdefgh");
  await expect(guide.locator(".guide-no-results")).toContainText(
    "没有找到相关条目",
  );
  await guide.getByRole("button", { name: "查看全部操作" }).click();
  await expect(
    guide.getByRole("navigation", { name: "查询结果" }).getByRole("button"),
  ).toHaveCount(15);
  await guide.getByRole("button", { name: /直接点击地图放置影响力/ }).click();
  await expect(guide.locator(".guide-result")).toContainText("确认放置");
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "新手教程", exact: true }),
  ).toBeFocused();
  expect(posts).toEqual([]);
  await fixture(page, "select");
  const before = await roomVersion(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "功能查询", exact: true }).click();
  await guide.getByRole("searchbox").fill("调度");
  await expect(guide.locator(".guide-result")).toContainText(
    "拖起自己的移动城市",
  );
  expect(await roomVersion(page)).toBe(before);
  expect(
    await page.evaluate(() =>
      document.getAnimations().some((a) => a.id === "nomad-button-press"),
    ),
  ).toBe(false);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("加入与开局过场跟随服务器确认，按钮有点击反馈，刷新不会重播过场", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.getByLabel("企业家昵称").fill("启程动画测试");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/rooms", async (route) => {
    requests++;
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "创建新房间" }).click();
  await expect(page.locator(".permit-submit")).toBeDisabled();
  expect(
    await page
      .locator(".permit-submit")
      .evaluate((el) =>
        el.getAnimations().some((a) => a.id === "nomad-button-press"),
      ),
  ).toBe(true);
  await expect(page.locator(".scene-transition")).toHaveCount(0);
  release();
  const roomCut = page.locator("dialog.scene-room");
  await expect(roomCut).toBeVisible();
  await expect(roomCut).toContainText("席位已确认");
  // Assert the animation is attached; a short opacity plateau is not a reliable
  // cross-process polling target on a busy browser.
  await expect(roomCut.locator(".scene-arrival")).toHaveCSS(
    "animation-name",
    "scene-arrives",
  );
  await page.screenshot({ path: info.outputPath("arrival-transition.png") });
  await page.keyboard.press("Escape");
  await expect(roomCut).toHaveCount(0);
  expect(requests).toBe(1);
  await page.unroute("**/api/rooms");
  const url = page.url();
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  try {
    const friend = await context.newPage();
    await friend.goto(url);
    await friend.getByLabel("企业家昵称").fill("一起出发的朋友");
    await clickRoomButton(friend, "加入这场拓荒");
    await expect(friend.locator("dialog.scene-room")).toBeVisible();
    await friend.getByRole("button", { name: "跳过动画" }).press("Enter");
    await friend.getByRole("button", { name: "准备出发" }).click();
    await expect(
      friend.getByRole("button", { name: "取消准备" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "准备出发" }).click();
    await expect(page.getByRole("button", { name: "开始拓荒" })).toBeEnabled();
    await page.getByRole("button", { name: "开始拓荒" }).click();
    await Promise.all([
      expect(page.locator("dialog.scene-game")).toBeVisible(),
      expect(friend.locator("dialog.scene-game")).toBeVisible(),
    ]);
    await page.getByRole("button", { name: "跳过动画" }).press("Enter");
    await expect(page.locator("dialog.scene-game")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "第 105 号拓荒区棋盘" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator(".connection")).toContainText("已连接");
    await expect(page.locator(".scene-transition")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
