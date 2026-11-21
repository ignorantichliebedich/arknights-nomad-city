import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync, zipSync } from "fflate";
import {
  RESOURCE_PACK_MANIFEST,
  type ResourcePack,
} from "../../packages/shared/resource-pack.ts";

test("开场后检查资源包，验证 ZIP，刷新本地复用，更新后要求重新导入", async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(75000);
  const root = resolve("apps/web/dist");
  const release: ResourcePack = JSON.parse(
    readFileSync(root + RESOURCE_PACK_MANIFEST, "utf8"),
  );
  test.skip(!release, "需要带运行素材的构建");
  const archive = readFileSync(root + release.download);
  let latest = release;
  const errors: string[] = [];
  const networkMedia: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.addEventListener(
        "playing",
        () => {
          if (this instanceof HTMLAudioElement)
            document.documentElement.dataset.testAudioSource = this.currentSrc;
        },
        { once: true },
      );
      return play.call(this);
    };
  });
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text()))
      errors.push(message.text());
  });
  page.on("request", (request) => {
    if (!request.url().startsWith(baseURL + "/")) return;
    const path = new URL(request.url()).pathname;
    if (
      /^\/audio\//.test(path) ||
      /^\/assets\/(?!originium-prime-)[^/]+\.(webp|svg|png)$/.test(path)
    )
      networkMedia.push(path);
  });
  await page.route("**" + RESOURCE_PACK_MANIFEST, (route) =>
    route.fulfill({ json: latest }),
  );
  await page.goto("/");
  const pack = page.getByRole("heading", { name: "游戏资源包" });
  await expect(pack).toBeFocused();
  await expect(page.getByText("本机还未安装资源包")).toBeVisible();
  await expect(page.getByRole("link", { name: /下载资源包/ })).toHaveAttribute(
    "href",
    release.download,
  );
  const head = await page.request.head(release.download);
  expect(head.headers()["content-length"]).toBe(String(release.bytes));
  expect(networkMedia).toEqual([]);
  await page.screenshot({ path: info.outputPath("resource-pack.png") });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /下载资源包/ }).click(),
  ]);

  const input = page.locator('input[type="file"]');
  const damaged = Buffer.from(archive);
  damaged[42] ^= 1;
  const damagedPath = info.outputPath("damaged.zip");
  writeFileSync(damagedPath, damaged);
  await input.setInputFiles(damagedPath);
  await expect(page.getByRole("alert")).toContainText("校验失败");
  await page.getByRole("button", { name: "重新检查" }).click();
  await expect(page.getByText("本机还未安装资源包")).toBeVisible();
  await input.setInputFiles(await download.path());
  await page.getByRole("button", { name: "窗口进入" }).click();
  const founders = page.locator(".poster-founders img").first();
  await expect(founders).toHaveAttribute("src", /^blob:/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-test-audio-source",
    /^blob:/,
    { timeout: 15000 },
  );
  await expect
    .poll(() => founders.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  await page.reload();
  await expect(founders).toBeVisible();
  await expect(pack).toHaveCount(0);
  await expect(founders).toHaveAttribute("src", /^blob:/);

  const updated = zipSync(
    {
      ...unzipSync(archive),
      "assets/pack-test.svg": new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ),
    },
    { level: 0 },
  );
  latest = {
    version: createHash("sha256").update(updated).digest("hex"),
    bytes: updated.byteLength,
    download: "/resource-packs/test-new.zip",
  };
  await page.reload();
  await expect(page.getByText("本机资源包需要更新")).toBeVisible();
  const updatedPath = info.outputPath("updated.zip");
  writeFileSync(updatedPath, updated);
  await input.setInputFiles(updatedPath);
  await expect(founders).toBeVisible({ timeout: 20000 });
  expect(networkMedia).toEqual([]);
  expect(errors).toEqual([]);
});
