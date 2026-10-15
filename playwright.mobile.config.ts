import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import desktop from "./playwright.config.ts";
const chrome = existsSync(resolve(".data/browsers/chrome-win64/chrome.exe"))
  ? { executablePath: resolve(".data/browsers/chrome-win64/chrome.exe") }
  : {};
const webkitRoot = resolve(".data/playwright-mobile-browsers");
const webkitFolder = existsSync(webkitRoot)
  ? readdirSync(webkitRoot)
      .filter((name) => name.startsWith("webkit-"))
      .sort()
      .at(-1)
  : undefined;
const webkit = webkitFolder
  ? { executablePath: resolve(webkitRoot, webkitFolder, "Playwright.exe") }
  : {};
export default defineConfig({
  ...desktop,
  use: { ...desktop.use, actionTimeout: 10000 },
  testIgnore: [],
  testMatch: ["mobile.spec.ts", "music.spec.ts", "quick-actions.spec.ts"],
  projects: [
    {
      name: "android-small-portrait",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 320, height: 568 },
        launchOptions: chrome,
      },
    },
    {
      name: "android-portrait",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        launchOptions: chrome,
      },
    },
    {
      name: "android-landscape",
      use: {
        ...devices["Pixel 7 landscape"],
        viewport: { width: 844, height: 390 },
        launchOptions: chrome,
      },
    },
    {
      name: "android-small",
      use: {
        ...devices["Pixel 7 landscape"],
        viewport: { width: 568, height: 320 },
        launchOptions: chrome,
      },
    },
    {
      name: "iphone-portrait",
      use: { ...devices["iPhone 13"], launchOptions: webkit },
    },
    {
      name: "iphone-landscape",
      use: { ...devices["iPhone 13 landscape"], launchOptions: webkit },
    },
  ],
});
