import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fixture } from "./fixtures/table.ts";

test("启程提示可取消，键盘可关闭，同一标签刷新不重复弹出", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "全屏体验更佳" });
  await expect(welcome).toBeVisible();
  await expect(
    welcome.getByRole("button", { name: "取消", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() =>
      welcome
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("fullscreen-welcome.png"),
    animations: "disabled",
  });
  const box = await welcome.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press("Escape");
  await expect(welcome).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("企业家昵称")).toBeVisible();
  await expect(welcome).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("全屏由按钮触发，浏览器拒绝时可继续窗口模式", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "全屏体验", exact: false }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(page.locator(".fullscreen-welcome")).toHaveCount(0);
  await page.evaluate(() => document.exitFullscreen());
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.evaluate(() =>
    sessionStorage.removeItem("nomad:fullscreen-prompt:1"),
  );
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Denied"));
  });
  await page.reload();
  await page.getByRole("button", { name: "全屏体验", exact: false }).click();
  await expect(page.getByRole("status")).toContainText(
    "浏览器暂时无法进入全屏",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("企业家昵称")).toBeVisible();
});

test("真实音效在交互后解码播放，静音与音量设置刷新保留", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    (window as any).__soundStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      start.apply(this, args);
      (window as any).__soundStarts++;
    };
  });
  const starts = () =>
    page.evaluate(() => (window as any).__soundStarts as number);
  await page.goto("/");
  await expect(page.locator(".fullscreen-welcome")).toBeVisible();
  expect(await starts()).toBe(0);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect.poll(starts).toBeGreaterThan(0);
  await page.getByRole("button", { name: "声音设置" }).click();
  const settings = page.getByRole("dialog", { name: "声音与音乐" });
  await expect(settings).toBeVisible();
  await expect(settings.locator(".modal-heading")).toHaveCSS(
    "background-color",
    "rgb(48, 39, 29)",
  );
  await expect(
    settings.getByRole("checkbox", { name: "背景音乐", exact: true }),
  ).toBeDisabled();
  const volume = settings.getByRole("slider", { name: /总音量/ });
  await volume.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(volume).toHaveValue("99");
  await page.waitForTimeout(80);
  const before = await starts();
  await settings.getByRole("button", { name: "试听" }).click();
  await expect.poll(starts).toBeGreaterThan(before);
  await settings.getByRole("button", { name: /全部静音/ }).click();
  const muted = await starts();
  await expect(
    settings.getByRole("button", { name: /开启声音/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(settings.getByRole("button", { name: "试听" })).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("audio-settings.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  expect(await starts()).toBe(muted);
  await page.reload();
  await page.getByRole("button", { name: "声音设置" }).click();
  await expect(
    settings.getByRole("button", { name: /开启声音/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(volume).toHaveValue("99");
  expect(await starts()).toBe(0);
});

test("预留音乐清单接入真实音频并可独立开关", async ({ page }) => {
  const clip = readFileSync("apps/web/public/audio/sfx/confirm.mp3");
  await page.route("**/audio/music.json", (route) =>
    route.fulfill({
      json: {
        tracks: [
          { id: "sample", title: "测试曲目", src: "/audio/music/sample.mp3" },
        ],
      },
    }),
  );
  await page.route("**/audio/music/sample.mp3", (route) =>
    route.fulfill({ body: clip, contentType: "audio/mpeg" }),
  );
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      (window as any).__music = this;
      return play.call(this);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "声音设置" }).click();
  await expect(page.getByLabel("播放曲目")).toContainText("测试曲目");
  const music = page.getByRole("checkbox", { name: "背景音乐", exact: true });
  await music.check();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const audio = (window as any).__music as HTMLMediaElement | undefined;
        return !!audio && !audio.paused && audio.readyState >= 2;
      }),
    )
    .toBe(true);
  await music.uncheck();
  await expect
    .poll(() => page.evaluate(() => (window as any).__music.paused))
    .toBe(true);
});

test("棋桌信息栏为声音入口留出空间，对局中可直接静音", async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("nomad:fullscreen-prompt:1", "1"),
  );
  await fixture(page);
  const sound = page.getByRole("button", { name: "声音设置" });
  await expect(sound).toBeVisible();
  const button = await sound.boundingBox();
  const toolbar = await page.locator(".room-toolbar.in-game").boundingBox();
  expect(toolbar!.x + toolbar!.width).toBeLessThan(button!.x);
  await sound.click();
  const settings = page.getByRole("dialog", { name: "声音与音乐" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: /全部静音/ }).click();
  await expect(
    settings.getByRole("button", { name: /开启声音/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
});
