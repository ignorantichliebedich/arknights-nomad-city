import { test, expect } from "./fixtures/test.ts";
import { fixture, clickHandCard } from "./fixtures/table.ts";
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
