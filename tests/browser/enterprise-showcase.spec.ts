import { test, expect, type Page } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import {
  ENTERPRISE_IMAGES,
  ENTERPRISE_NAMES,
} from "../../packages/rules/src/data.ts";
import type { GameState } from "../../packages/rules/src/types.ts";
import { fixture } from "./fixtures/table.ts";

function update(id: string, change: (game: GameState) => void) {
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(id)!;
    change(room.game!);
    room.expansion = true;
    room.game!.expansion = true;
    room.revision++;
    store.save(room);
    return room;
  } finally {
    store.close();
  }
}
async function enterpriseFixture(page: Page) {
  const result = await fixture(page);
  const room = update(result.id, (game) => {
    game.activeEnterprises = ["rhine", "bank", "rhodes", "heide"];
    game.activeLab = 0;
    for (const p of game.players)
      p.enterprise = {
        rhine: p.seat + 1,
        bank: p.seat === 1 ? 4 : 0,
        rhodes: p.seat === 0 ? 3 : 1,
        heide: 5,
        raythean: 3,
        mama: 3,
        blacksteel: 2,
        rim: 4,
      };
    game.players[0].enterprise.rhine = 2;
    game.players[3].name = "合作页面里姓名很长的第四位企业家";
  });
  await page.reload();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(room.revision),
  );
  return { ...result, room };
}

test("八家企业原板与等级能力可读，科室和玩家预览不改变游戏状态", async ({
  page,
}, info) => {
  const { id, room } = await enterpriseFixture(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "合作企业", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "合作企业", exact: true });
  const labs = page.getByRole("region", { name: "莱茵生命共享科室" });
  await page.getByRole("button", { name: "预览结构科", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(labs).toContainText("激活科室：工程科");
  await expect(labs.getByRole("status")).toContainText("正在预览结构科");
  await expect(page.locator('.enterprise-step[data-level="5"]')).toContainText(
    "降低 1 级莱茵生命",
  );
  await expect(page.locator('.enterprise-step[data-level="4"]')).toContainText(
    "可支付 3 源石，获得 1 至纯源石",
  );
  await page.getByRole("button", { name: "科室详情", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "莱茵生命 · 结构科", exact: true }),
  ).toContainText("降低后等级的奖励");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "科室详情", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "预览工程科", exact: true }).click();
  await expect(labs.getByRole("status")).toContainText("全体共用");
  await page
    .getByRole("button", { name: "查看拓荒朋友 1的合作进度", exact: true })
    .click();
  await expect(page.locator(".enterprise-current-level")).toHaveAttribute(
    "aria-label",
    "拓荒朋友 1，莱茵生命，当前 2 级",
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-enterprise-rhine.png`,
    animations: "disabled",
  });
  for (const company of room.game!.activeEnterprises) {
    await page
      .getByRole("button", {
        name: `查看${ENTERPRISE_NAMES[company]}企业板`,
        exact: true,
      })
      .click();
    await expect(page.locator(".enterprise-step")).toHaveCount(6);
    const art = page.locator(".enterprise-original-board img");
    await expect(art).toHaveJSProperty("naturalWidth", 650);
    await expect(art).toHaveJSProperty("naturalHeight", 1850);
    await expect(page.locator(".enterprise-level-token")).toHaveCount(4);
    expect(
      await page.locator(".enterprise-level-token").evaluateAll((tokens) =>
        tokens.every((token) => {
          const marker = token.getBoundingClientRect();
          const row = token
            .closest(".enterprise-step")!
            .getBoundingClientRect();
          return marker.top >= row.top && marker.bottom <= row.bottom;
        }),
      ),
    ).toBe(true);
    for (const p of room.game!.players) {
      await expect(
        page
          .locator(`.enterprise-step[data-level="${p.enterprise[company]}"]`)
          .getByRole("img", {
            name: `${p.name} · ${p.enterprise[company]} 级`,
            exact: true,
          }),
      ).toHaveCount(1);
    }
    const last = (await page
      .locator('.enterprise-step[data-level="0"]')
      .boundingBox())!;
    expect(last.y + last.height).toBeLessThan(page.viewportSize()!.height - 12);
  }
  await page
    .getByRole("button", { name: "查看罗德岛企业板", exact: true })
    .click();
  await expect(
    page.locator('.enterprise-step[data-level="3"]'),
  ).toHaveAttribute("data-kind", "reward");
  await expect(page.locator('.enterprise-step[data-level="3"]')).toContainText(
    "抽取干员",
  );
  const scrollBeforeDetail = await modal.evaluate((el) => el.scrollTop);
  await page
    .getByRole("button", { name: "放大罗德岛企业板", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "罗德岛", exact: true })
      .locator(".card-artwork img"),
  ).toHaveJSProperty("naturalWidth", 650);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "放大罗德岛企业板", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() => modal.evaluate((el) => el.scrollTop))
    .toBe(scrollBeforeDetail);
  await page.screenshot({
    path: `test-results/${info.project.name}-enterprise-rhodes.png`,
    animations: "disabled",
  });
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(room.revision),
  );
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  const second = update(id, (game) => {
    game.activeEnterprises = ["raythean", "mama", "blacksteel", "rim"];
  });
  await page.reload();
  await page.getByRole("button", { name: "合作企业", exact: true }).click();
  for (const company of second.game!.activeEnterprises) {
    await page
      .getByRole("button", {
        name: `查看${ENTERPRISE_NAMES[company]}企业板`,
        exact: true,
      })
      .click();
    await expect(
      page.locator(".enterprise-original-board img"),
    ).toHaveJSProperty("naturalWidth", 650);
    await expect(page.locator(".enterprise-step")).toHaveCount(6);
    await expect(
      page.locator('.enterprise-step[data-level="4"]'),
    ).not.toContainText("本级无新增");
  }
  await page
    .getByRole("button", { name: "查看约翰老妈企业板", exact: true })
    .click();
  await expect(
    page.locator('.enterprise-step[data-level="1"]'),
  ).toHaveAttribute("data-kind", "empty");
  await expect(
    page.locator('.enterprise-step[data-level="3"]'),
  ).toHaveAttribute("data-kind", "effect");
  await expect(page.locator('.enterprise-step[data-level="3"]')).toContainText(
    "获得 1 分",
  );
  await page
    .getByRole("button", { name: "查看雷神工业企业板", exact: true })
    .click();
  await expect(
    page.locator('.enterprise-step[data-level="5"]'),
  ).toHaveAttribute("data-kind", "effect");
  await expect(page.locator('.enterprise-step[data-level="5"]')).toContainText(
    "付费建设",
  );
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    String(second.revision),
  );
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    expect(store.get(id)!.game).toEqual(second.game);
  } finally {
    store.close();
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test("企业升级实时移动等级标记，保留正在查看的企业与玩家", async ({
  page,
  browser,
}) => {
  const { id, friendToken } = await enterpriseFixture(page);
  const room = update(id, (game) => {
    const friend = game.players[1];
    game.active = 1;
    game.decision = {
      playerId: friend.id,
      kind: "upgrade",
      title: "选择提升合作等级的企业",
      options: [
        {
          id: "bank",
          label: "富森银行",
          image: ENTERPRISE_IMAGES.bank,
          steps: [
            {
              kind: "upgrade-at",
              actor: friend.id,
              data: { company: "bank", count: 1 },
            },
          ],
        },
      ],
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "合作企业", exact: true }).click();
  await page
    .getByRole("button", { name: "查看富森银行企业板", exact: true })
    .click();
  await page
    .getByRole("button", { name: "查看拓荒朋友 1的合作进度", exact: true })
    .click();
  await expect(
    page.locator('.enterprise-step[data-level="4"] .is-viewer'),
  ).toHaveCount(1);
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    await context.addInitScript(
      ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
      { id, token: friendToken },
    );
    const friend = await context.newPage();
    await friend.goto(`/room/${id}`);
    await expect(friend.locator(".connection")).toContainText("已连接");
    if (!(await friend.locator(".interaction-window").isVisible()))
      await friend
        .getByRole("button", { name: "进行行动", exact: true })
        .click();
    await friend
      .locator(".action-list .action-button")
      .filter({ hasText: "富森银行" })
      .click();
    await friend.getByRole("button", { name: "确认选择" }).click();
    await expect(page.locator(".room-toolbar")).toHaveAttribute(
      "data-revision",
      String(room.revision + 1),
    );
    await expect(
      page.getByRole("button", { name: "查看富森银行企业板", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", {
        name: "查看拓荒朋友 1的合作进度",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".enterprise-current-level")).toContainText(
      "当前满级",
    );
    await expect(
      page.locator('.enterprise-step[data-level="5"] .is-viewer'),
    ).toHaveCount(1);
    await expect(
      page.locator('.enterprise-step[data-level="4"] .is-viewer'),
    ).toHaveCount(0);
    await page.locator(".enterprise-comparison > summary").click();
    const bank = page
      .getByRole("table", { name: "企业合作等级" })
      .locator("tbody tr")
      .filter({ hasText: "富森银行" });
    await expect(bank.getByRole("cell")).toHaveText([
      "0级",
      "5级",
      "0级",
      "0级",
    ]);
    await page.reload();
    await page.getByRole("button", { name: "合作企业", exact: true }).click();
    await page
      .getByRole("button", { name: "查看富森银行企业板", exact: true })
      .click();
    await expect(
      page
        .locator('.enterprise-step[data-level="5"]')
        .getByRole("img", { name: "拓荒朋友 1 · 5 级", exact: true }),
    ).toHaveCount(1);
  } finally {
    await context.close();
  }
});
