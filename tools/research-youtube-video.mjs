// Read publicly offered video quality and physical-product frames. No account state.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const id = process.argv[2];
if (!/^[A-Za-z0-9_-]{11}$/.test(id ?? "")) throw new Error("Expected public video ID");
const times = (process.argv[3] ?? "30,90,150,210,270,330,390,450,510,570,610").split(",").map(Number);
if (times.some((time) => !Number.isFinite(time) || time < 0)) throw new Error("Invalid frame time");
const root = resolve(`.data/sources/public-video/youtube-${id}`);
mkdirSync(root, { recursive: true });
const source = `https://www.youtube.com/watch?v=${id}&t=${Math.floor(times[0])}s`;
const browser = await chromium.launch({ executablePath: resolve(".data/browsers/chrome-win64/chrome.exe"), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(source, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, null, { timeout: 30000 });
  if (!(await page.locator("video").first().evaluate((element) => element.paused)))
    await page.locator(".ytp-play-button").click();
  await page.locator(".ytp-settings-button").click();
  const quality = page.locator(".ytp-menuitem").filter({ hasText: /画质|畫質|Quality/ });
  await quality.first().click();
  const qualityLabels = await page.locator(".ytp-menuitem").allTextContents();
  const available = page.locator(".ytp-menuitem").filter({ hasText: /1080p/ }).filter({ hasNotText: /Premium|增强|更高比特率|高级会员/ });
  const selectedHD = await available.count() > 0;
  if (await available.count()) await available.first().click();
  else await page.keyboard.press("Escape");
  // Wait for the player's quality transition before seeking its replacement stream.
  await page.waitForTimeout(1500);
  if (selectedHD) await page.waitForFunction(() => {
    const element = document.querySelector("video");
    return element && element.readyState >= 2 && element.videoHeight >= 720;
  }, null, { timeout: 30000 });
  const frameFailures = [];
  const video = page.locator("video").first();
  const duration = await video.evaluate((element) => element.duration);
  for (const seconds of times) {
    // Seek through the player's normal timeline so its DASH audio/video tracks stay together.
    if (seconds !== times[0]) {
      await page.mouse.move(500, 400);
      const timeline = await page.locator(".ytp-progress-bar").boundingBox();
      if (!timeline) throw new Error("Public player timeline unavailable");
      await page.mouse.click(timeline.x + timeline.width * seconds / duration, timeline.y + timeline.height / 2);
    }
    if (seconds !== times[0] && await video.evaluate((element) => element.paused)) await page.locator(".ytp-play-button").click();
    try {
      await page.waitForFunction((time) => {
        const element = document.querySelector("video");
        return element && !element.seeking && element.readyState >= 2 && Math.abs(element.currentTime - time) < 10;
      }, seconds, { timeout: 30000 });
      if (!(await video.evaluate((element) => element.paused))) await page.locator(".ytp-play-button").click();
      await page.mouse.move(1850, 1000);
      await page.waitForTimeout(300);
      const nativeFrame = await video.evaluate((element) => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = element.videoWidth; canvas.height = element.videoHeight;
          canvas.getContext("2d").drawImage(element, 0, 0);
          return canvas.toDataURL("image/png");
        } catch { return null; }
      });
      if (nativeFrame) writeFileSync(resolve(root, `frame-${seconds}.png`), Buffer.from(nativeFrame.split(",")[1], "base64"));
      else await video.screenshot({ path: resolve(root, `frame-${seconds}.png`) });
      writeFileSync(resolve(root, `frame-${seconds}.json`), JSON.stringify({ source, requestedSeconds: seconds, nativeFrame: !!nativeFrame, ...await video.evaluate((element) => ({ currentTime: element.currentTime, width: element.videoWidth, height: element.videoHeight })) }, null, 2) + "\n");
      console.log(`Public reference ${id}: ${seconds}s`);
    } catch { frameFailures.push(seconds); await page.screenshot({ path: resolve(root, "stream-status.png") }); console.log(`Public reference ${id}: ${seconds}s unavailable`); }
  }
  const result = { source, title: await page.title(), qualityLabels, video: await video.evaluate((element) => ({ width: element.videoWidth, height: element.videoHeight, duration: element.duration, currentTime: element.currentTime, error: element.error ? { code: element.error.code, message: element.error.message } : null })), frameFailures };
  writeFileSync(resolve(root, "public-player.json"), JSON.stringify(result, null, 2) + "\n");
  writeFileSync(resolve(root, `public-player-${times.join("-")}.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
