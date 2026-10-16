import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;

const tracks = JSON.parse(
  readFileSync("apps/web/public/audio/music.json", "utf8"),
).tracks as { id: string; title: string; src: string }[];
const expected = JSON.parse(
  readFileSync("assets/music-manifest.json", "utf8"),
) as { id: string; durationSeconds: number }[];
test.skip(
  !tracks.every((track) =>
    existsSync(resolve("apps/web/public", "." + track.src)),
  ),
  "真实曲目检查需要本地音乐原件：先执行 pnpm music:import 与 pnpm build",
);
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.getAttribute("src")?.startsWith("/audio/music/"))
        (window as any).__music = this;
      return play.call(this);
    };
  });
});
async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "窗口进入", exact: true }).click();
  await page.getByRole("button", { name: "声音设置" }).click();
  await page.locator(".music-catalog summary").click();
  await expect(page.getByLabel("播放曲目")).toBeVisible();
}
async function playing(page: Page, src: string) {
  await expect
    .poll(
      () =>
        page.evaluate((source) => {
          const audio = (window as any).__music as HTMLAudioElement | undefined;
          return (
            !!audio &&
            audio.getAttribute("src") === source &&
            !audio.paused &&
            audio.readyState >= 2 &&
            audio.currentTime > 0
          );
        }, src),
      { timeout: 15000 },
    )
    .toBe(true);
}

test("五首原始音乐可真实播放，切歌与循环控制适配当前屏幕", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openSettings(page);
  const select = page.getByLabel("播放曲目");
  await expect(select.locator("option")).toHaveCount(5);
  await playing(page, tracks.find((t) => t.id === "speed-of-light")!.src);
  await expect(page.locator(".record-label img")).toBeVisible();
  await page.getByRole("checkbox", { name: "背景音乐", exact: true }).check();
  for (const track of tracks) {
    await select.selectOption(track.id);
    await playing(page, track.src);
    const duration = await page.evaluate(
      () => (window as any).__music.duration as number,
    );
    expect(
      Math.abs(
        duration - expected.find((row) => row.id === track.id)!.durationSeconds,
      ),
    ).toBeLessThan(1);
  }
  await page.getByRole("button", { name: "下一首", exact: true }).click();
  await expect(select).toHaveValue(tracks[0].id);
  await playing(page, tracks[0].src);
  await page.getByRole("button", { name: "上一首", exact: true }).click();
  await expect(select).toHaveValue(tracks.at(-1)!.id);
  await playing(page, tracks.at(-1)!.src);
  await page.getByLabel("循环方式").selectOption("repeat");
  expect(await page.evaluate(() => (window as any).__music.loop)).toBe(true);
  await expect(page.locator(".audio-version")).toHaveText(
    "游城拓荒 v" + version,
  );
  await page
    .getByRole("button", { name: "下一首", exact: true })
    .scrollIntoViewIfNeeded();
  const box = (await page
    .getByRole("button", { name: "下一首", exact: true })
    .boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("music-controls.png"),
    animations: "disabled",
    scale: "css",
  });
  await page.reload();
  await page.getByRole("button", { name: "声音设置" }).click();
  await page.locator(".music-catalog summary").click();
  await expect(select).toHaveValue(tracks.at(-1)!.id);
  await expect(page.getByLabel("循环方式")).toHaveValue("repeat");
  await playing(page, tracks.at(-1)!.src);
  expect(errors).toEqual([]);
});

test("结束后自动接续，后台暂停并恢复，静音和音乐开关独立", async ({ page }) => {
  await openSettings(page);
  const music = page.getByRole("checkbox", { name: "背景音乐", exact: true });
  await music.check();
  await page.getByLabel("播放曲目").selectOption(tracks[0].id);
  await playing(page, tracks[0].src);
  await page.evaluate(() => {
    const audio = (window as any).__music as HTMLAudioElement;
    audio.currentTime = audio.duration - 0.15;
  });
  await expect(page.getByLabel("播放曲目")).toHaveValue(tracks[1].id, {
    timeout: 15000,
  });
  await playing(page, tracks[1].src);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__music.paused))
    .toBe(true);
  await page.evaluate(() => {
    delete (document as any).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await playing(page, tracks[1].src);
  await page.getByRole("button", { name: /全部静音/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__music.paused))
    .toBe(true);
  await expect(music).toBeChecked();
  await page.getByRole("button", { name: /开启声音/ }).click();
  await playing(page, tracks[1].src);
  await music.uncheck();
  await expect
    .poll(() => page.evaluate(() => (window as any).__music.paused))
    .toBe(true);
});

test("音乐加载失败可重试恢复，不影响声音窗口及其他曲目", async ({ page }) => {
  // Windows WebKit's native media network bypasses Playwright routing. Use a
  // genuinely missing static file and restore only this test's unique file.
  const missing = `/audio/music/test-recovery-${randomUUID()}.mp3`;
  const webRoot = resolve(process.env.E2E_WEB_ROOT ?? "apps/web/dist");
  const temporary = resolve(webRoot, "." + missing);
  expect(existsSync(temporary)).toBe(false);
  await page.route("**/audio/music.json", (route) =>
    route.fulfill({
      json: { tracks: [{ ...tracks[0], src: missing }, ...tracks.slice(1)] },
    }),
  );
  let created = false;
  try {
    await openSettings(page);
    await page.getByLabel("播放曲目").selectOption(tracks[0].id);
    await page.getByRole("checkbox", { name: "背景音乐", exact: true }).check();
    await expect(page.getByRole("alert")).toContainText("暂时无法播放");
    copyFileSync(resolve(webRoot, "." + tracks[0].src), temporary);
    created = true;
    await page.getByRole("button", { name: /重试播放/ }).click();
    await playing(page, missing);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "下一首", exact: true }).click();
    await playing(page, tracks[1].src);
  } finally {
    if (created) unlinkSync(temporary);
  }
});
