import { test, expect, type Page, type Locator } from "./test.ts";
import { roomRequest } from "./rooms.ts";
import { RoomStore } from "../../../apps/server/src/store.ts";
import {
  applyCommand,
  createGame,
} from "../../../packages/rules/src/engine.ts";

/** Rotated cards overlap: aim at a visible part of the actual card, then its raised face. */
export async function clickHandCard(page: Page, card: Locator, clicks = 1) {
  await page.locator(".fan-toggle").hover();
  if (
    (await page.locator(".fan-toggle").getAttribute("aria-expanded")) !== "true"
  )
    await page.locator(".fan-toggle").click();
  await expect(page.locator(".fan-hand")).toHaveClass(/is-expanded/);
  await page.locator(".hand-cards").evaluate(async (el) => {
    getComputedStyle(el).bottom;
    await Promise.all(
      el.getAnimations().map((a) => a.finished.catch(() => {})),
    );
  });
  const visiblePoint = () =>
    card.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const visible: { x: number; y: number }[] = [];
      for (
        let y = Math.max(0, box.top) + 10;
        y < Math.min(innerHeight, box.bottom) - 10;
        y += 10
      )
        for (
          let x = Math.max(0, box.left) + 10;
          x < Math.min(innerWidth, box.right) - 10;
          x += 10
        )
          if (document.elementFromPoint(x, y)?.closest(".hand-card") === el)
            visible.push({ x, y });
      const center = visible.reduce(
        (sum, p) => ({
          x: sum.x + p.x / visible.length,
          y: sum.y + p.y / visible.length,
        }),
        { x: 0, y: 0 },
      );
      return visible.sort(
        (a, b) =>
          Math.hypot(a.x - center.x, a.y - center.y) -
          Math.hypot(b.x - center.x, b.y - center.y),
      )[0];
    });
  const point = await visiblePoint();
  expect(point).toBeTruthy();
  await page.mouse.move(point.x, point.y);
  await card.evaluate(async (el) => {
    getComputedStyle(el.parentElement!).transform;
    await Promise.all(
      el.parentElement!.getAnimations().map((a) => a.finished.catch(() => {})),
    );
  });
  const raised = await visiblePoint();
  expect(raised).toBeTruthy();
  await page.mouse.click(raised.x, raised.y, { clickCount: clicks, delay: 90 });
}

export async function fixture(
  page: Page,
  phase: "select" | "actions" = "actions",
  playerCount = 4,
) {
  test.setTimeout(90000);
  const host = await roomRequest(page, "/api/rooms", "亲自落子的企业家");
  const id: string = host.room.id;
  await page.addInitScript(
    ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
    { id, token: host.token },
  );
  let friendToken = "";
  const seatTokens = [host.token as string];
  for (let i = 1; i < playerCount; i++) {
    const result = await roomRequest(
      page,
      `/api/rooms/${id}/join`,
      `拓荒朋友 ${i}`,
    );
    if (i === 1) friendToken = result.token;
    seatTokens.push(result.token);
  }
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!;
    let game = createGame(room.seats, { expansion: false, seed: 52 });
    while (
      phase === "actions"
        ? game.phase !== "actions"
        : game.decision?.kind !== "select-role"
    )
      game = applyCommand(game, game.decision!.playerId, {
        type: "choose",
        optionId: game.decision!.options[0].id,
      });
    game.players[0].wallet = {
      rock: 20,
      ore: 20,
      iron: 20,
      prime: 2,
      cash: 100,
      score: 0,
    };
    room.game = game;
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.goto(`/room/${id}`);
  await expect(page.locator(".connection")).toContainText("已连接");
  return { id, friendToken, seatTokens };
}
