import { test as base, type Browser } from "@playwright/test";
export * from "@playwright/test";

// Focused game tests dismiss the first-visit recommendation in every browser context.
// entry-audio.spec.ts uses Playwright directly to exercise the actual prompt.
export const test = base.extend<{}, { browser: Browser }>({
  browser: [
    async ({ browser }, use) => {
      const original = browser.newContext;
      browser.newContext = async (options) => {
        const context = await original.call(browser, options);
        await context.addInitScript(() => {
          sessionStorage.setItem("nomad:fullscreen-prompt:1", "1");
        });
        return context;
      };
      try {
        await use(browser);
      } finally {
        browser.newContext = original;
      }
    },
    { scope: "worker" },
  ],
});
