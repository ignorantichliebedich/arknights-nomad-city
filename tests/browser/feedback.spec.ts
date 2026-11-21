import { test, expect } from "./fixtures/test.ts";

test("演习下方的信箱可投递，断线保留来信，关闭后焦点归位", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const opener = page.getByRole("button", { name: "拓荒信箱" });
  await expect(page.locator(".entry-bootstrap")).toHaveCount(0);
  const practice = (await page
    .getByRole("button", { name: "实操演习" })
    .boundingBox())!;
  const mailbox = (await opener.boundingBox())!;
  expect(Math.abs(practice.x - mailbox.x)).toBeLessThan(2);
  expect(mailbox.y).toBeGreaterThanOrEqual(practice.y + practice.height - 1);
  await expect(opener).toBeInViewport({ ratio: 0.99 });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "拓荒信箱" });
  const submit = dialog.getByRole("button", { name: "投递来信" });
  await expect(submit).toBeDisabled();
  for (const name of ["更新建议", "漏洞反馈", "DIY 灵感"]) {
    await dialog.getByText(name, { exact: true }).click();
    await expect(dialog.getByRole("radio", { name })).toBeChecked();
  }
  const body = dialog.getByLabel("来信正文");
  await body.fill("我想让勘探队优先探索。");
  await page.route("**/api/feedback", (route) => route.abort(), { times: 1 });
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("重新投递");
  await expect(body).toHaveValue("我想让勘探队优先探索。");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await submit.click();
  await expect(dialog.getByText(/来信已收妥 · 回执 [A-F0-9]{8}/)).toBeVisible();
  await expect(body).toHaveValue("");
  await expect(
    dialog.getByRole("link", { name: /DIY 开发指南/ }),
  ).toHaveAttribute("href", /github\.com\/.+\/docs\/diy\.md$/);
  await page.screenshot({ path: info.outputPath("feedback.png") });
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await expect(opener).toBeFocused();
});
