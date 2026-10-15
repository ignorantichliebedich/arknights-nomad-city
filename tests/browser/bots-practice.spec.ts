import { test, expect, type Page } from "./fixtures/test.ts";
import { DatabaseSync } from "node:sqlite";
import type { Room } from "../../apps/server/src/store.ts";
import { projectView } from "../../packages/rules/src/engine.ts";
import {
  PRACTICE_KEY,
  practiceView,
  type PracticeSnapshot,
} from "../../apps/web/src/practice.ts";
import { fixture, clickHandCard } from "./fixtures/table.ts";
import { clickRoomButton } from "./fixtures/rooms.ts";
test.use({ actionTimeout: 10000 });

function readRoom(id: string) {
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!, {
    readOnly: true,
  });
  try {
    return JSON.parse(
      (
        db.prepare("SELECT body FROM rooms WHERE id=?").get(id) as {
          body: string;
        }
      ).body,
    ) as Room;
  } finally {
    db.close();
  }
}
async function practice(page: Page): Promise<PracticeSnapshot> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    PRACTICE_KEY,
  );
}
async function center(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("大厅添加移除人机，单人开局后人机独立准备并执行回合", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("企业家昵称").fill("一个人也能拓荒");
  await clickRoomButton(page, "创建新房间");
  await page
    .locator(".room-toolbar")
    .getByRole("button", { name: /邀请朋友/ })
    .click();
  const invitation = page.getByRole("dialog", {
    name: "邀请朋友加入",
    exact: true,
  });
  await invitation
    .getByRole("button", { name: "人机同行", exact: false })
    .click();
  await page.getByRole("button", { name: /添加人机/ }).click();
  await expect(page.locator(".assembly-seat.occupied")).toHaveCount(2);
  await expect(page.locator(".assembly-seat").nth(1)).toContainText("自动准备");
  await page.getByRole("button", { name: /添加人机/ }).click();
  await expect(page.locator(".assembly-seat.occupied")).toHaveCount(3);
  await page
    .getByRole("button", { name: "移除人机企业家 2", exact: true })
    .click();
  await expect(page.locator(".assembly-seat.occupied")).toHaveCount(2);
  await page.screenshot({
    path: `test-results/${info.project.name}-bot-invitation.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".assembly-bot-controls")).toHaveCount(0);
  await page
    .getByRole("button", { name: "邀请朋友入座 3", exact: true })
    .click();
  await expect(invitation).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `test-results/${info.project.name}-bot-lobby.png`,
    animations: "disabled",
  });
  const id = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "准备出发", exact: true }).click();
  await page.getByRole("button", { name: "开始拓荒" }).click();
  await expect(page.locator(".game-layout")).toBeVisible();
  for (let n = 0; n < 20; n++) {
    if (await page.getByRole("button", { name: "继续拓荒" }).isVisible())
      await page.getByRole("button", { name: "继续拓荒" }).click();
    const room = readRoom(id);
    const view = projectView(room.game!, room.hostId);
    if (view.decision?.kind === "select-role") {
      await expect(page.locator(".hand-card.playable").first()).toBeVisible();
      break;
    }
    if (!view.actions.length) {
      await page.waitForTimeout(700);
      continue;
    }
    if (
      !(await page
        .locator(".interaction-window, .event-window")
        .first()
        .isVisible())
    )
      await page
        .getByRole("button", {
          name: view.decision?.kind === "event" ? "处理事件" : "进行行动",
          exact: true,
        })
        .click();
    await page.locator(".action-list .action-button").first().click();
    await page.getByRole("button", { name: "确认选择" }).click();
    await expect(page.locator(".room-toolbar")).not.toHaveAttribute(
      "data-revision",
      String(room.revision),
    );
  }
  await expect(page.locator(".hand-card.playable").first()).toBeVisible();
  if (await page.getByRole("button", { name: "继续拓荒" }).isVisible())
    await page.getByRole("button", { name: "继续拓荒" }).click();
  const card = page.locator(".hand-card.playable").first();
  await clickHandCard(page, card);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "确认盖放" }).click();
  await expect.poll(() => readRoom(id).game!.phase).toBe("actions");
  await page.locator(".deployment-slot").first().click();
  await page.getByRole("button", { name: "确认放置" }).click();
  await expect.poll(() => readRoom(id).game!.mainDone).toBe(true);
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.getByRole("button", { name: "结束本轮行动", exact: true }).click();
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".map-prompt")).toContainText("人机企业家");
  await page.screenshot({
    path: `test-results/${info.project.name}-bot-turn.png`,
    animations: "disabled",
  });
  await expect
    .poll(
      () => {
        const game = readRoom(id).game!;
        return game.active === 0 && game.lap === 2;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("七课实操使用真实棋桌，刷新继续练习，退出返回原房间且不改联机状态", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { id } = await fixture(page);
  const original = readRoom(id);
  await page.getByRole("button", { name: "新手教程", exact: true }).click();
  await page.getByRole("button", { name: "进入实操教程" }).click();
  await expect(page).toHaveURL(/#practice$/);
  const guide = page.getByRole("complementary", { name: "实操教程任务" });
  const finish = async () => {
    await expect(guide).toHaveClass(/is-complete/);
  };
  const next = async () => {
    await guide.getByRole("button", { name: "下一课" }).click();
    await expect(guide).not.toHaveClass(/is-complete/);
  };
  await clickHandCard(page, page.locator(".hand-card.playable").first());
  await page.getByRole("button", { name: "确认盖放" }).click();
  await finish();
  await next();
  await page.locator(".deployment-slot").first().click();
  await guide.getByRole("button", { name: "重练本课" }).click();
  await expect(page.locator(".placement-panel")).toHaveCount(0);
  await page.locator(".deployment-slot").first().click();
  await page.getByRole("button", { name: "确认放置" }).click();
  await finish();
  const placed = (await practice(page)).game;
  await page.reload();
  await expect(guide).toHaveClass(/is-complete/);
  expect((await practice(page)).game).toEqual(placed);
  await next();
  const destination = practiceView(await practice(page)).cityDestinations![0];
  await page
    .locator(
      ".city-drag-handle[data-player='practice-learner'] .city-grab-area",
    )
    .hover();
  await page.mouse.down();
  const to = await center(
    page,
    `.board-hit[data-site-id="${destination.target}"]`,
  );
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("button", { name: "确认移动" }).click();
  await expect(guide).toContainText("城市已抵达");
  await page.locator(".deployment-slot").first().click();
  await page.getByRole("button", { name: "确认放置" }).click();
  await finish();
  await next();
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.getByRole("button", { name: "探索 · 支付路费并结算事件" }).click();
  await page.getByRole("button", { name: "执行行动" }).click();
  await expect(page.locator(".route-panel")).toContainText("探索路线");
  const target = practiceView(await practice(page)).actions[0].target!;
  await page
    .locator(`.board-hit[data-site-id="${target}"]`)
    .click({ position: { x: 8, y: 8 } });
  await page.getByRole("button", { name: "确认路费并探索" }).click();
  await expect(page.locator(".event-art img")).toHaveAttribute(
    "alt",
    "清理虫巢",
  );
  await page.getByRole("button", { name: "获得 7 金券", exact: true }).click();
  await page.getByRole("button", { name: "确认选择" }).click();
  await page.locator(".deployment-slot").first().click();
  await page.getByRole("button", { name: "确认放置" }).click();
  await finish();
  await next();
  await page
    .getByRole("button", { name: "设施供应与城市样式", exact: true })
    .click();
  await page
    .locator(".supply-card")
    .first()
    .getByRole("button", { name: "筹建这座设施" })
    .click();
  await page.getByRole("button", { name: "执行行动" }).click();
  await page.locator(".build-city-grid button:not(:disabled)").first().click();
  await page.locator(".payment-options button").first().click();
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.getByRole("dialog", { name: "设施已落位" })).toBeVisible();
  await page.getByRole("button", { name: "继续拓荒" }).click();
  await finish();
  await next();
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.getByRole("button", { name: "角色策略", exact: true }).click();
  await page.getByRole("button", { name: "执行行动" }).click();
  await page.locator(".action-list .action-button").first().click();
  await page.getByRole("button", { name: "确认选择" }).click();
  await finish();
  await next();
  await page.screenshot({
    path: `test-results/${info.project.name}-practice-harvest.png`,
    animations: "disabled",
  });
  await page
    .locator(".board-hit.legal")
    .first()
    .click({ position: { x: 8, y: 8 } });
  await page.getByRole("button", { name: "核对路费与采集" }).click();
  await page.getByRole("button", { name: "确认采集方案" }).click();
  // A selected route may require choosing the legal recipient before locking.
  for (
    let n = 0;
    !(await guide.getAttribute("class"))!.includes("is-complete") && n < 4;
    n++
  ) {
    if (await page.locator(".toll-recipients button").first().isVisible()) {
      await page.locator(".toll-recipients button").first().click();
      await page.getByRole("button", { name: "确认收款人" }).click();
    } else await page.waitForTimeout(600);
  }
  await finish();
  await expect(guide).toContainText("七项实操已完成");
  await page.screenshot({
    path: `test-results/${info.project.name}-practice-complete.png`,
    animations: "disabled",
  });
  expect((await practice(page)).completed).toHaveLength(7);
  await page.getByRole("button", { name: "退出练习", exact: true }).click();
  await expect(page.locator(".room-code")).toHaveText(id);
  expect(readRoom(id).game).toEqual(original.game);
  expect(readRoom(id).revision).toBe(original.revision);
  expect(errors).toEqual([]);
});
