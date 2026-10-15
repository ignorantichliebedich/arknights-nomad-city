// Inspect public physical-product footage without signing in or changing account state.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const bvid = process.argv[2];
if (bvid && !/^BV[0-9A-Za-z]{10}$/.test(bvid))
  throw new Error("Expected a public BV video identifier");
const requestedTimes = process.argv[3]
  ? process.argv[3].split(",").map(Number)
  : [305, 308, 311, 314, 317, 323];
if (requestedTimes.some((time) => !Number.isFinite(time) || time < 0))
  throw new Error("Frame times must be nonnegative seconds");
const watchPage = process.env.VIDEO_WATCH === "1";
const root = resolve(bvid ? `.data/sources/public-video/${bvid}${watchPage ? "/watch" : ""}` : ".data/sources/official-video");
mkdirSync(root, { recursive: true });
if (watchPage && !bvid) throw new Error("Watch-page inspection needs a BV identifier");
const source = watchPage
  ? `https://www.bilibili.com/video/${bvid}/`
  : bvid
  ? `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0&high_quality=1&p=1`
  : "https://player.bilibili.com/player.html?aid=319942682&autoplay=0&bvid=&high_quality=1&p=2";
const browser = await chromium.launch({
  executablePath: resolve(".data/browsers/chrome-win64/chrome.exe"),
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const failures = [];
  const publicMetadata = [];
  const apiEndpoints = new Set();
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      failures.push({
        endpoint: url.origin + url.pathname,
        status: response.status(),
      });
    }
    const url = new URL(response.url());
    if (
      url.hostname.includes("bilibili") &&
      !url.pathname.endsWith(".js") &&
      !url.pathname.endsWith(".css")
    )
      apiEndpoints.add(url.origin + url.pathname);
    if (url.hostname === "api.bilibili.com" && url.pathname.includes("/view")) {
      void response
        .json()
        .then(({ data }) => {
          const video = data?.View ?? data;
          if (video?.aid && video?.pages)
            publicMetadata.push({
              aid: video.aid,
              bvid: video.bvid,
              title: video.title,
              pages: video.pages.map(({ cid, page, part, duration }) => ({
                cid,
                page,
                part,
                duration,
              })),
            });
        })
        .catch(() => {});
    }
  });
  await page.goto(source, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
    referer: "https://prts.wiki/",
  });
  await page.waitForTimeout(5000);
  if (process.env.VIDEO_STORYBOARD === "1") {
    // The logged-out player initializes its public stream after an ordinary play click.
    if (watchPage) {
      const play = page.locator(".bpx-player-ctrl-play");
      if (await play.count()) await play.first().click();
      else await page.locator("video").first().click();
    } else await page.mouse.click(34, 861);
    await page.waitForFunction(() => {
      const video = document.querySelector("video");
      return video && video.readyState >= 2 && video.videoWidth > 0;
    }, null, { timeout: 30000 });
    // Use the ordinary player control to keep viewer comments off the reference footage.
    if (!watchPage) await page.mouse.click(526, 861);
  }
  const result = {
    source,
    title: await page.title(),
    text: (await page.locator("body").innerText()).slice(0, 1500),
    videos: await page.locator("video").evaluateAll((videos) =>
      videos.map((video) => ({
        duration: Number.isFinite(video.duration) ? video.duration : null,
        readyState: video.readyState,
        width: video.videoWidth,
        height: video.videoHeight,
        controls: video.controls,
      })),
    ),
    failures,
    publicMetadata,
    apiEndpoints: [...apiEndpoints],
  };
  await page.screenshot({ path: resolve(root, "public-player.png") });
  if (process.env.VIDEO_STORYBOARD === "1" && result.videos[0]?.duration) {
    const video = page.locator("video").first();
    result.frameFailures = [];
    for (const seconds of requestedTimes.filter((time) => time < result.videos[0].duration)) {
      await video.evaluate((element, time) => {
        element.pause();
        element.currentTime = time;
      }, seconds);
      try {
        await page.waitForFunction(
        (time) => {
          const video = document.querySelector("video");
          return (
            video &&
            !video.seeking &&
            video.readyState >= 2 &&
            Math.abs(video.currentTime - time) < 1
          );
        },
        seconds,
        { timeout: 30000 },
        );
      } catch {
        result.frameFailures.push({ seconds, reason: "Public stream did not finish seeking" });
        console.log(`Public reference ${bvid ?? "official"}: ${seconds}s unavailable`);
        continue;
      }
      await video.screenshot({ path: resolve(root, `frame-${seconds}.png`) });
      console.log(`Public reference ${bvid ?? "official"}: ${seconds}s`);
    }
  }
  writeFileSync(
    resolve(root, "public-player.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
