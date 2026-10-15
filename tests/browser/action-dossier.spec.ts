import { test, expect } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand } from "../../packages/rules/src/engine.ts";
import { ENTERPRISE_NAMES } from "../../packages/rules/src/data.ts";
import { fixture } from "./fixtures/table.ts";

test("企业档案保留同企业不同等级的选择，键盘确认只执行所选能力", async ({
  page,
}, info) => {
  const { id } = await fixture(page);
  await page.getByRole("button", { name: "进行行动", exact: true }).click();
  await page.screenshot({
    path: `test-results/${info.project.name}-action-dossier.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "设施供应与城市样式", exact: true })
    .click();
  await page.screenshot({
    path: `test-results/${info.project.name}-supply-dossier.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");

  // Controlled midgame: generate actual trigger / upgrade choices through the rule engine.
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  let cash = 0;
  let before = 0;
  try {
    const room = store.get(id)!;
    const game = room.game!;
    game.expansion = room.expansion = true;
    game.activeEnterprises = Object.keys(ENTERPRISE_NAMES);
    game.activeLab = 0;
    for (const player of game.players)
      player.enterprise = Object.fromEntries(
        game.activeEnterprises.map((company) => [company, 3]),
      );
    cash = game.players[0].wallet.cash;
    game.decision = {
      playerId: game.players[0].id,
      kind: "fixture",
      title: "受控场景准备",
      options: [
        {
          id: "trigger",
          label: "企业特效",
          steps: [{ kind: "trigger", actor: game.players[0].id, data: {} }],
        },
      ],
    };
    room.game = applyCommand(game, game.players[0].id, {
      type: "choose",
      optionId: "trigger",
    });
    room.revision++;
    before = room.revision;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".decision-title")).toContainText(
    "已解锁的企业特效",
  );
  const first = page.getByRole("button", {
    name: "富森银行 · 1 级",
    exact: true,
  });
  const third = page.getByRole("button", {
    name: "富森银行 · 3 级",
    exact: true,
  });
  await expect(first).toContainText("合作 · 1 级");
  await expect(first).toContainText("8 金券");
  await expect(third).toContainText("合作 · 3 级");
  await expect(third).toContainText("20 金券");
  await expect(third).toContainText("其他玩家各获得");
  await third.click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(before),
  );
  await page.getByRole("button", { name: "取消选择", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认选择" })).toBeDisabled();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".commit-tray > strong")).toHaveText(
    "富森银行 · 1 级",
  );
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".stock-cash strong")).toHaveText(String(cash + 8));

  const after = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = after.get(id)!;
    const game = room.game!;
    const actor = game.players[0].id;
    game.decision = {
      playerId: actor,
      kind: "fixture",
      title: "受控升级准备",
      options: [
        {
          id: "upgrade",
          label: "企业升级",
          steps: [{ kind: "upgrade", actor, data: { count: 1 } }],
        },
      ],
    };
    room.game = applyCommand(game, actor, {
      type: "choose",
      optionId: "upgrade",
    });
    room.revision++;
    before = room.revision;
    after.save(room);
  } finally {
    after.close();
  }
  await page.reload();
  await expect(page.locator(".enterprise-offer")).toHaveCount(8);
  await expect(
    page.locator(".enterprise-offer-art img").last(),
  ).toHaveJSProperty("naturalWidth", 650);
  const upgrade = page.getByRole("button", {
    name: "富森银行 · 3 → 4",
    exact: true,
  });
  await expect(upgrade).toContainText("合作 · 3 → 4");
  await expect(upgrade).toContainText("4 级");
  await upgrade.click();
  await page.locator(".composer-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight;
  });
  const lastOffer = page.getByRole("button", {
    name: "雷姆必拓 · 3 → 4",
    exact: true,
  });
  await lastOffer.click();
  await expect(lastOffer).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.locator(".composer-body").evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(0);
  await upgrade.click();
  await page.screenshot({
    path: `test-results/${info.project.name}-enterprise-upgrade-dossier.png`,
    animations: "disabled",
  });
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(before),
  );
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(before + 1),
  );
  const verified = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const game = verified.get(id)!.game!;
    expect(game.players[0].enterprise.bank).toBe(4);
    expect(game.players[0].wallet.cash).toBe(cash + 8);
  } finally {
    verified.close();
  }
});
