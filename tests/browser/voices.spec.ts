import { test, expect } from "./fixtures/test.ts";
import { fixture, clickHandCard } from "./fixtures/table.ts";

test("多窗口盖牌只有本人播放选中语音，最后一人提交与刷新保持隐私", async ({
  page,
  browser,
}, info) => {
  test.skip(!!info.project.use.hasTouch, "多窗口语音检查在桌面执行");
  const track = () => {
    (window as any).__privateVoices = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const src = this.getAttribute("src") ?? "";
      if (/\/audio\/voices\/.+\/select-[12]\.mp3$/.test(src))
        (window as any).__privateVoices.push(src);
      return play.call(this);
    };
  };
  await page.addInitScript(track);
  const { id, seatTokens } = await fixture(page, "select", 2);
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    await context.addInitScript(track);
    await context.addInitScript(
      ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
      { id, token: seatTokens[1] },
    );
    const friend = await context.newPage();
    await friend.goto(`/room/${id}`);
    await expect(friend.locator(".connection")).toContainText("已连接");
    for (const tab of [page, friend]) {
      await tab.getByRole("button", { name: "声音设置" }).click();
      await tab.getByRole("button", { name: "关闭弹窗" }).click();
    }
    await clickHandCard(page, page.locator(".hand-card.playable").first(), 2);
    await expect
      .poll(() => page.evaluate(() => (window as any).__privateVoices.length))
      .toBe(1);
    await expect(friend.locator(".parallel-progress")).toContainText("1 / 2");
    expect(
      await friend.evaluate(() => (window as any).__privateVoices),
    ).toEqual([]);
    await clickHandCard(
      friend,
      friend.locator(".hand-card.playable").last(),
      2,
    );
    await expect
      .poll(() => friend.evaluate(() => (window as any).__privateVoices.length))
      .toBe(1);
    await expect(page.locator(".parallel-progress")).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as any).__privateVoices.length),
    ).toBe(1);
    for (const tab of [page, friend]) {
      await tab.reload();
      await expect(tab.locator(".connection")).toContainText("已连接");
      expect(await tab.evaluate(() => (window as any).__privateVoices)).toEqual(
        [],
      );
    }
  } finally {
    await context.close();
  }
});
test("中日盖牌语音真实播放、降低音乐音量，静音立即停止且刷新不重播", async ({
  page,
}, info) => {
  test.skip(!!info.project.use.hasTouch, "桌面检查实际媒体，触屏操作另有覆盖");
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    (window as any).__voicePlays = 0;
    HTMLMediaElement.prototype.play = function () {
      const src = this.getAttribute("src") ?? "";
      if (src.startsWith("/audio/voices/")) {
        (window as any).__voice = this;
        (window as any).__voicePlays++;
      }
      if (src.startsWith("/audio/music/")) (window as any).__music = this;
      return play.call(this);
    };
  });
  for (const language of ["zh", "ja"]) {
    await fixture(page, "select");
    await page.getByRole("button", { name: "声音设置" }).click();
    await page.getByLabel("语音语言").selectOption(language);
    await page.getByRole("button", { name: "关闭弹窗" }).click();
    await clickHandCard(page, page.locator(".hand-card.playable").first(), 2);
    await expect
      .poll(
        () =>
          page.evaluate((lang) => {
            const a = (window as any).__voice;
            return (
              !!a &&
              a.getAttribute("src").startsWith(`/audio/voices/${lang}/`) &&
              !a.paused &&
              a.readyState >= 2 &&
              a.currentTime > 0
            );
          }, language),
        { timeout: 12000 },
      )
      .toBe(true);
    const volumes = await page.evaluate(() => ({
      voice: (window as any).__voice.volume,
      music: (window as any).__music.volume,
    }));
    expect(volumes.music).toBeCloseTo(0.7 * 0.35 * 0.28, 4);
    expect(volumes.voice).toBeCloseTo(0.7 * 0.8, 4);
    await page.getByRole("button", { name: "声音设置" }).click();
    await page.getByRole("button", { name: /全部静音/ }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__voice.paused))
      .toBe(true);
    await page.getByRole("button", { name: /开启声音/ }).click();
    await page.getByRole("button", { name: "关闭弹窗" }).click();
  }
  await page.reload();
  await expect(page.locator(".connection")).toContainText("已连接");
  expect(await page.evaluate(() => (window as any).__voicePlays)).toBe(0);
});
