/** Documentation captures use a disposable in-memory server and synthetic seats. */
import { chromium, expect, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";
import { createGameServer } from "../apps/server/src/server.ts";
import {
  createGame,
  applyCommand,
  projectView,
} from "../packages/rules/src/engine.ts";
import { chooseBotCommand } from "../packages/rules/src/bot.ts";
import { createPractice, PRACTICE_KEY } from "../apps/web/src/practice.ts";

process.env.NO_PROXY = "127.0.0.1,localhost";
const output = resolve("docs/media");
mkdirSync(output, { recursive: true });
const app = createGameServer({ database: ":memory:" });
await new Promise<void>((done) => app.http.listen(0, "127.0.0.1", done));
const address = app.http.address();
if (!address || typeof address === "string")
  throw new Error("No capture server port");
const base = `http://127.0.0.1:${address.port}`;
const chrome = resolve(".data/browsers/chrome-win64/chrome.exe");
const browser = await chromium.launch(
  existsSync(chrome) ? { executablePath: chrome } : {},
);
const errors: string[] = [];
const peers: WebSocket[] = [];
const screenshots: { file: string; sha256: string; bytes: number }[] = [];
async function capture(page: Page, name: string, keepPointer = false) {
  if (!keepPointer) await page.mouse.move(1590, 890);
  await page.waitForTimeout(350);
  const bytes = await page.screenshot({
    path: resolve(output, name),
    type: "jpeg",
    quality: 84,
    animations: "disabled",
  });
  screenshots.push({
    file: name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
}
async function settle(page: Page) {
  await expect(page.locator(".entry-bootstrap")).toHaveCount(0);
  await expect(page.locator(".scene-transition")).toHaveCount(0);
  await expect(page.locator(".turn-announcement")).toHaveCount(0);
  await page.waitForTimeout(350);
}
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    if (location.protocol !== "http:") return;
    sessionStorage.setItem("nomad:fullscreen-prompt:1", "1");
    localStorage.setItem(
      "nomad:audio:1",
      JSON.stringify({ muted: true, music: false, voices: false }),
    );
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await settle(page);
  await capture(page, "home.jpg");

  const names = ["林间来客", "远行旅人", "荒野信使", "星火"];
  const tokens = names.map(() => randomUUID());
  const seats = names.map((name, i) => ({
    id: `showcase-${i}`,
    name,
    ready: true,
    tokenHash: createHash("sha256").update(tokens[i]).digest("hex"),
  }));
  let game = createGame(seats, { expansion: true, seed: 52 });
  for (let i = 0; i < 200 && game.parallel?.kind !== "select-role"; i++) {
    const actor = game.decision?.playerId ?? game.players[game.active].id;
    const command = chooseBotCommand(projectView(game, actor));
    if (!command) throw new Error("Cannot prepare the demonstration table");
    game = applyCommand(game, actor, command);
  }
  if (game.parallel?.kind !== "select-role") throw new Error("No role phase");
  const id = "DEMO26";
  const now = new Date().toISOString();
  app.store.save({
    id,
    hostId: seats[0].id,
    expansion: true,
    revision: 1,
    seats,
    game,
    createdAt: now,
    updatedAt: now,
  });
  for (const token of tokens.slice(1)) {
    const socket = new WebSocket(base.replace("http:", "ws:") + "/ws");
    peers.push(socket);
    await new Promise<void>((done, reject) => {
      socket.on("open", () =>
        socket.send(JSON.stringify({ type: "hello", roomId: id, token })),
      );
      socket.once("message", () => done());
      socket.once("error", reject);
    });
  }
  await page.evaluate(
    ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
    { id, token: tokens[0] },
  );
  await page.goto(`${base}/room/${id}`);
  await settle(page);
  await expect(page.locator(".connection")).toContainText("已连接");
  await page.locator(".fan-toggle").hover();
  await expect(page.locator(".fan-hand")).toHaveClass(/is-expanded/);
  await capture(page, "table.jpg", true);
  await page.getByRole("button", { name: "合作企业", exact: true }).click();
  await expect(page.locator(".enterprise-showcase")).toBeVisible();
  await capture(page, "enterprises.jpg");
  await page.keyboard.press("Escape");
  await page.goto(base);
  await settle(page);
  await page.evaluate(
    ({ key, snapshot }) => localStorage.setItem(key, JSON.stringify(snapshot)),
    { key: PRACTICE_KEY, snapshot: createPractice(1) },
  );
  await page.goto("about:blank");
  await page.goto(`${base}/#practice`);
  await settle(page);
  await expect(page.locator(".practice-guide")).toBeVisible();
  await page.locator(".deployment-slot").first().click();
  await capture(page, "practice.jpg");

  const infection = createGame(seats, {
    oripathy: true,
    expert: true,
    seed: 42,
  });
  const infectionId = "DEMO28";
  app.store.save({
    id: infectionId,
    hostId: seats[0].id,
    expansion: true,
    oripathy: true,
    expert: true,
    revision: 1,
    seats,
    game: infection,
    createdAt: now,
    updatedAt: now,
  });
  const actor = infection.decision?.playerId;
  const seat = Math.max(
    0,
    seats.findIndex((value) => value.id === actor),
  );
  await page.evaluate(
    ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
    { id: infectionId, token: tokens[seat] },
  );
  await page.goto(`${base}/room/${infectionId}`);
  await settle(page);
  await expect(page.locator(".entrepreneur-choices")).toBeVisible();
  await capture(page, "oripathy.jpg");
  await context.close();
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    resolve(output, "manifest.json"),
    JSON.stringify(
      {
        source:
          "Local production UI; disposable synthetic rooms; no player data",
        viewport: { width: 1600, height: 900 },
        screenshots,
      },
      null,
      2,
    ) + "\n",
  );
  console.info(JSON.stringify(screenshots, null, 2));
} finally {
  for (const peer of peers) peer.close();
  await browser.close();
  await app.close();
}
