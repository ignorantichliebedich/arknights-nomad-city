import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { createResourcePack } from "../../tools/resource-pack.ts";
import {
  RESOURCE_PACK_MANIFEST,
  type ResourcePack,
} from "../../packages/shared/resource-pack.ts";

test("资源包窗口可以选择外部下载来源并返回导入页面", async ({
  page,
  baseURL,
  isMobile,
  browserName,
}, info) => {
  test.setTimeout(75000);
  const root = resolve(process.env.E2E_WEB_ROOT ?? "apps/web/dist");
  const release: ResourcePack | null = JSON.parse(
    readFileSync(root + RESOURCE_PACK_MANIFEST, "utf8"),
  );
  const generated = createResourcePack(resolve("apps/web/public"));
  test.skip(!release || !generated, "需要带运行素材的构建");
  if (!release || !generated) return;
  expect(generated.version).toBe(release.version);
  const archive = generated.archive;
  const downloads = {
    github: {
      url: "https://github.com/example/assets/releases/download/resources/pack.zip",
    },
    baidu: { url: "https://pan.baidu.com/s/sample-share", code: "123a" },
    quark: { url: "https://pan.quark.cn/s/sample-share" },
  };
  let latest: ResourcePack = { ...release, downloads };
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
  await page
    .context()
    .route(downloads.github.url, (route) =>
      route.fulfill({
        contentType: "text/plain",
        body: "GitHub download fixture",
      }),
    );
  await page.goto("/");
  const pack = page.getByRole("heading", { name: "游戏资源包" });
  await expect(pack).toBeFocused();
  await expect(page.getByText("本机还未安装资源包")).toBeVisible();
  const pick = page.getByRole("button", { name: /下载资源包/ });
  await pick.press("Enter");
  const chooser = page.getByRole("dialog", { name: "资源包下载" });
  await expect(chooser).toBeVisible();
  for (const [name, { url }] of [
    ["GitHub", downloads.github],
    ["百度网盘", downloads.baidu],
    ["夸克网盘", downloads.quark],
  ] as const) {
    const link = chooser.getByRole("link", { name: new RegExp(name) });
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
  }
  await expect(chooser.getByText("提取码 123a")).toBeVisible();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    chooser.getByRole("link", { name: "GitHub" }).click(),
  ]);
  await expect(popup).toHaveURL(downloads.github.url);
  await popup.close();
  await page.screenshot({ path: info.outputPath("resource-pack-sources.png") });
  await page.keyboard.press("Escape");
  await expect(pick).toBeFocused();
  expect(
    (await page.request.head("/resource-packs/" + generated.filename)).status(),
  ).toBe(404);
  expect(networkMedia).toEqual([]);

  if (isMobile && browserName === "webkit") return;

  const input = page.locator('input[type="file"]');
  const damaged = Buffer.from(archive);
  damaged[42] ^= 1;
  const damagedPath = info.outputPath("damaged.zip");
  writeFileSync(damagedPath, damaged);
  await input.setInputFiles(damagedPath);
  await expect(page.getByRole("alert")).toContainText("校验失败");
  await page.getByRole("button", { name: "重新检查" }).click();
  await expect(page.getByText("本机还未安装资源包")).toBeVisible();
  const originalPath = info.outputPath("original.zip");
  writeFileSync(originalPath, archive);
  await input.setInputFiles(originalPath);
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
    downloads: { ...downloads, baidu: { url: "/resource-packs/test-new.zip" } },
  };
  await page.reload();
  await expect(page.getByText("本机资源包需要更新")).toBeVisible();
  await pick.click();
  await expect(chooser.getByText("链接待配置")).toHaveCount(1);
  await expect(chooser.getByRole("link", { name: /百度网盘/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(chooser).toHaveCount(0);
  const updatedPath = info.outputPath("updated.zip");
  writeFileSync(updatedPath, updated);
  await input.setInputFiles(updatedPath);
  await expect(founders).toBeVisible({ timeout: 20000 });
  expect(networkMedia).toEqual([]);
  expect(errors).toEqual([]);
});
