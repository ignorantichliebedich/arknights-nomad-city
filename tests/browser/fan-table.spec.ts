import { test, expect, type Page } from "./fixtures/test.ts";
import { DatabaseSync } from "node:sqlite";
import { RoomStore } from "../../apps/server/src/store.ts";
import {
  applyCommand,
  createGame,
  projectView,
} from "../../packages/rules/src/engine.ts";
import type { GameState } from "../../packages/rules/src/types.ts";
import { fixture } from "./fixtures/table.ts";
import { slotPoint } from "../../apps/web/src/board-layout.ts";

function read(id: string) {
  // Poll a read-only WAL snapshot; opening RoomStore here initializes schema and
  // can contend with the very command whose acknowledgement we are awaiting.
  const database = new DatabaseSync(process.env.E2E_DATABASE_PATH!, {
    readOnly: true,
  });
  try {
    const row = database
      .prepare("SELECT body FROM rooms WHERE id = ?")
      .get(id) as { body: string };
    return (JSON.parse(row.body) as { game: GameState }).game;
  } finally {
    database.close();
  }
}
async function change(page: Page, id: string, fn: (g: GameState) => GameState) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!;
    room.game = fn(room.game!);
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".connection")).toContainText("已连接");
}
async function at(page: Page, x: number, y: number) {
  return page.locator(".board-surface > svg").evaluate(
    (el, p) => {
      const svg = el as SVGSVGElement,
        pt = svg.createSVGPoint();
      pt.x = p.x;
      pt.y = p.y;
      const result = pt.matrixTransform(svg.getScreenCTM()!);
      return { x: result.x, y: result.y };
    },
    { x, y },
  );
}
function point(g: GameState, slot: string) {
  return slotPoint(g, slot);
}
test("影响力拖动先预览，取消和无效落点不提交，确认完成连续调度并可恢复", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  await change(page, id, (g) => {
    g.sites[g.players[0].city!].slots[0] = g.players[0].id;
    return g;
  });
  const g = read(id),
    me = g.players[0].id,
    move = projectView(g, me).influenceMoves![0];
  const to = move.destinations.find(
    (slot) => slot.split(":")[0] !== move.from.split(":")[0],
  )!;
  expect(to).toBeTruthy();
  const startMap = point(g, move.from),
    endMap = point(g, to);
  const start = await at(page, startMap.x, startMap.y),
    end = await at(page, endMap.x, endMap.y);
  const before = g.revision;
  const drag = async () => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
  };
  await drag();
  await expect(page.locator(".drag-influence")).toBeVisible();
  await expect(page.locator(".influence-landing.focused")).toHaveCount(1);
  await page.screenshot({
    path: `test-results/${info.project.name}-influence-drag.png`,
    animations: "disabled",
  });
  await page.mouse.move(120, 90);
  await page.mouse.up();
  expect(read(id).revision).toBe(before);
  await expect(page.locator(".influence-preview")).toHaveCount(0);
  await drag();
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "确认移动影响力" }),
  ).toBeVisible();
  expect(read(id).revision).toBe(before);
  await page.getByRole("button", { name: "取消移动", exact: true }).click();
  expect(read(id).revision).toBe(before);
  await drag();
  await page.mouse.up();
  await page.getByRole("button", { name: "确认移动影响力" }).click();
  await expect.poll(() => read(id).revision).toBe(before + 3);
  const moved = read(id),
    [site, i] = move.from.split(":"),
    [dest, j] = to.split(":");
  expect(moved.sites[site].slots[Number(i)]).toBeNull();
  expect(moved.sites[dest].slots[Number(j)]).toBe(me);
  expect(moved.decision!.kind).toBe("shift-from");
  await page.reload();
  await expect(page.locator(`[data-influence-from="${to}"]`)).toBeVisible();
  expect(read(id).revision).toBe(before + 3);
  // A restored source selection can also be completed by dragging; it is not limited to the first main action.
  const next = projectView(moved, me).influenceMoves!.find(
    (m) => m.from === to,
  )!;
  // Let Playwright wait for the restored grab handle to settle before taking
  // screen coordinates; the board resizes once after reconnecting.
  await page.locator(`[data-influence-from="${to}"]`).hover();
  await page.mouse.down();
  await expect(page.locator(".drag-influence")).toBeVisible();
  const q = point(moved, next.destinations[0]);
  const b = await at(page, q.x, q.y);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await page.getByRole("button", { name: "确认移动影响力" }).click();
  await expect.poll(() => read(id).revision).toBe(before + 5);
});

test("罗德岛手牌进入扇面，键盘选牌与秘密盖放，顶部和角色提示避开地图", async ({
  page,
}, info) => {
  const { id } = await fixture(page, "select");
  await change(page, id, (g) => {
    const me = g.players[0];
    me.hand.push("kaltsit", "closure", "w");
    // Rebuild this seat's decision after adding cards to the controlled fixture.
    // Keep the other seats' pending choices and their phase barrier.
    const parallel = g.parallel;
    g.parallel = null;
    const continuation = g.queue;
    g.queue = [];
    g.decision = {
      playerId: me.id,
      title: "发牌",
      kind: "fixture",
      options: [
        {
          id: "start",
          label: "开始",
          steps: [{ kind: "select-role", actor: me.id }],
        },
      ],
    };
    const next = applyCommand(g, me.id, { type: "choose", optionId: "start" });
    next.queue = continuation;
    next.parallel = parallel;
    next.parallel!.players[me.id].decision = next.decision;
    return next;
  });
  await expect(page.locator(".fan-hand")).toHaveClass(/is-expanded/);
  await expect(page.locator(".hand-card")).toHaveCount(8);
  const before = read(id).revision;
  await page
    .getByRole("button", { name: "选择角色 凯尔希", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".hand-card.picked")).toContainText("罗德岛合作");
  await page.locator(".fan-hand").evaluate(async (el) => {
    getComputedStyle(el.querySelector(".hand-cards")!).bottom;
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  const liveBoard = (await page.locator(".board-surface").boundingBox())!;
  expect(liveBoard.y).toBeGreaterThanOrEqual(38);
  const lastCard = (await page.locator(".hand-card").last().boundingBox())!;
  const confirmation = (await page.locator(".fan-confirm").boundingBox())!;
  expect(lastCard.x + lastCard.width).toBeLessThan(confirmation.x);
  expect(read(id).revision).toBe(before);
  await page.screenshot({
    path: `test-results/${info.project.name}-fan-rhodes.png`,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "确认盖放", exact: true }).click();
  await expect.poll(() => read(id).revision).toBe(before + 1);
  await expect(page.locator(".selected-role img")).toHaveAttribute(
    "src",
    "/assets/role-back-rhodes.webp",
  );
  expect(
    projectView(read(id), read(id).players[1].id).players[0].selected,
  ).toBeNull();
  await page.reload();
  await expect(page.locator(".selected-role")).toContainText("凯尔希");
  await expect(page.locator(".hand-card")).toHaveCount(7);
  const prompt = (await page.locator(".map-prompt").boundingBox())!,
    portrait = (await page.locator(".entrepreneur-bust").boundingBox())!;
  expect(prompt.y + prompt.height).toBeLessThanOrEqual(portrait.y);
  const board = (await page.locator(".board-surface").boundingBox())!;
  expect(board.height).toBeGreaterThan(page.viewportSize()!.height - 100);
  const header = (await page.locator(".topbar").boundingBox())!;
  expect(header.height).toBeLessThanOrEqual(40);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("三人地图裁边为完整矩形，补绘、官网背景和立体大总统正常加载", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  await change(page, id, (g) => {
    let next = createGame(g.players.slice(0, 3), {
      seed: 52,
      expansion: false,
    });
    while (next.phase !== "actions")
      next = applyCommand(next, next.decision!.playerId, {
        type: "choose",
        optionId: next.decision!.options[0].id,
      });
    next.active = 0;
    next.first = 0;
    return next;
  });
  await expect(page.locator(".board-art")).toHaveClass(/board-3/);
  await expect(page.locator(".board-terrain")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".board-terrain")
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(1000);
  const president = (await page
    .locator(".active-entrepreneur .president-model")
    .boundingBox())!;
  expect(president.height).toBeGreaterThan(110);
  await expect(page.locator(".president-depth img")).toHaveCount(7);
  await expect(
    page.locator(".map-resource-token image").first(),
  ).toHaveAttribute("href", /resource-.*\.webp/);
  await expect(page.locator(".turn-announcement")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-table-fan-3.png`,
    animations: "disabled",
  });
});
