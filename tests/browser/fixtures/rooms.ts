import { expect, type Page } from "@playwright/test";

/** Follow the actual two-scene entrance; invitations already open the permit. */
export async function openHomeLobby(page: Page) {
  await expect(page.locator(".departure-stage")).toBeVisible();
  if (
    (await page.locator(".departure-stage").getAttribute("data-scene")) ===
    "hero"
  )
    await page.getByRole("button", { name: "开始拓荒", exact: true }).click();
  await expect(page.locator(".departure-stage")).not.toHaveClass(/is-changing/);
}

export async function roomRequest(page: Page, path: string, name: string) {
  const deadline = Date.now() + 65000;
  do {
    const response = await page.request.post(path, { data: { name } });
    const result = await response.json();
    if (response.status() === 201) return result;
    expect([400, 429]).toContain(response.status());
    expect(result.error).toBe("操作过于频繁，请稍后重试");
    await page.waitForTimeout(2000);
  } while (Date.now() < deadline);
  throw new Error("Room fixture did not recover after the rate limit window");
}

/** Keep natural UI entry under the same real per-IP limit as controlled rooms. */
export async function clickRoomButton(
  page: Page,
  name: string,
  expectedStatus = 201,
) {
  const deadline = Date.now() + 65000;
  do {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/api\/rooms(?:\/[A-Z0-9]+\/join)?$/.test(new URL(r.url()).pathname),
      ),
      page.getByRole("button", { name }).click(),
    ]);
    if (response.status() === expectedStatus) return;
    expect([400, 429]).toContain(response.status());
    expect((await response.json()).error).toBe("操作过于频繁，请稍后重试");
    await page.waitForTimeout(2000);
  } while (Date.now() < deadline);
  throw new Error("UI room entry did not recover after the rate limit window");
}
