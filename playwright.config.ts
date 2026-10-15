import { defineConfig, devices } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost"]
  .filter(Boolean)
  .join(",");
process.env.E2E_DATABASE_PATH ??= resolve(
  mkdtempSync(resolve(tmpdir(), "nomad-e2e-")),
  "rooms.sqlite",
);
export default defineConfig({
  testDir: "tests/browser",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3011",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chrome-1920",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        launchOptions: existsSync(
          resolve(".data/browsers/chrome-win64/chrome.exe"),
        )
          ? {
              executablePath: resolve(".data/browsers/chrome-win64/chrome.exe"),
            }
          : {},
      },
    },
    {
      name: "edge-1366",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "firefox-1920",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1920, height: 1080 },
        launchOptions: existsSync(resolve(".data/browsers/firefox/firefox.exe"))
          ? { executablePath: resolve(".data/browsers/firefox/firefox.exe") }
          : {},
      },
    },
  ],
  webServer: {
    command: "node tools/e2e-server.ts",
    url: "http://127.0.0.1:3011/api/health",
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 20000,
  },
});
