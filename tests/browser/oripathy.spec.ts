import { test, expect, type Page, type Locator } from "./fixtures/test.ts";
import { openHomeLobby, clickRoomButton } from "./fixtures/rooms.ts";
import { fixture } from "./fixtures/table.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand, createGame } from "../../packages/rules/src/engine.ts";
import { ENTREPRENEURS } from "../../packages/rules/src/oripathy-data.ts";

test("五位企业家完整展示，第五号可确认，已选身份保留在名册中", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const { id, seatTokens } = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  let names: string[] = [];
  try {
    const room = store.get(id)!;
    room.game = createGame(room.seats, {
      oripathy: true,
      expert: true,
      seed: 42,
    });
    names = room.seats.map((s) => s.name);
    room.oripathy = true;
    room.expert = true;
    room.expansion = true;
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.addInitScript(
    ({ id, token }) => localStorage.setItem("nomad:seat:" + id, token),
    { id, token: seatTokens[3] },
  );
  await page.reload();
  const modal = page.getByRole("dialog", { name: "行动安排", exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.locator(".entrepreneur-choices article")).toHaveCount(5);
  await expect(modal.locator(".oripathy-choice-art:enabled")).toHaveCount(5);
  await expect(modal.locator(".identity-offer-summary")).toContainText(
    "剩余 5 位可选",
  );
  const pioneer = modal.locator(
    '[data-identity="pioneer"] .oripathy-choice-art',
  );
  await pioneer.scrollIntoViewIfNeeded();
  await pioneer.click();
  await expect(pioneer).toHaveAttribute("aria-pressed", "true");
  await fits(page, modal);
  await page.screenshot({
    path: `test-results/${info.project.name}-entrepreneur-all-five.png`,
    animations: "disabled",
  });
  await modal.getByRole("button", { name: "确认选择 →", exact: true }).click();
  await expect(
    page.locator(".player-row").nth(3).locator(".entrepreneur-image"),
  ).toHaveAttribute("data-entrepreneur", "pioneer");
  await page.addInitScript(
    ({ id, token }) => localStorage.setItem("nomad:seat:" + id, token),
    { id, token: seatTokens[2] },
  );
  await page.reload();
  await expect(modal).toBeVisible();
  await expect(modal.locator(".entrepreneur-choices article")).toHaveCount(5);
  await expect(modal.locator(".oripathy-choice-art:enabled")).toHaveCount(4);
  await expect(modal.locator('[data-identity="pioneer"]')).toContainText(
    names[3] + "已选",
  );
  await expect(
    modal.locator('[data-identity="pioneer"] .oripathy-choice-art'),
  ).toBeDisabled();
  await expect(modal.locator(".identity-offer-summary")).toContainText(
    "剩余 4 位可选",
  );
});

test("五种身份的侧栏、半身图、手机回合条与档案保持一致", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { id } = await infectionFixture(page);
  const indices: Record<string, number> = {
    thiago: 0,
    martin: 1,
    paul: 2,
    agnes: 3,
  };
  for (const [index, who] of ENTREPRENEURS.entries()) {
    const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
    try {
      const room = store.get(id)!,
        s = room.game!;
      s.players.forEach(
        (p, i) =>
          (p.oripathy!.entrepreneur = ENTREPRENEURS[(index + i) % 5].id),
      );
      s.active = 0;
      s.first = 0;
      s.parallel = null;
      s.decision = null;
      s.queue = [];
      s.phase = "actions";
      room.revision++;
      store.save(room);
    } finally {
      store.close();
    }
    await page.reload();
    await expect(page.locator(".entrepreneur-bust")).toHaveAttribute(
      "data-entrepreneur",
      who.id,
    );
    const portrait = page
      .locator(".player-row")
      .first()
      .locator(".entrepreneur-image");
    await expect(portrait).toHaveAttribute("data-entrepreneur", who.id);
    if (who.id === "pioneer")
      await expect(portrait.locator("image")).toHaveAttribute(
        "href",
        "/assets/oripathy/1402.webp",
      );
    else
      await expect(portrait).toHaveAttribute(
        "src",
        `/assets/avatar-${indices[who.id]}.webp`,
      );
    await expect(page.locator(".active-entrepreneur-caption")).toContainText(
      who.name,
    );
    if (await page.locator(".phone-phase-bar").count())
      await expect(
        page.locator(".phone-phase-bar .entrepreneur-image"),
      ).toHaveAttribute("data-entrepreneur", who.id);
    await page.getByRole("button", { name: "感染者档案", exact: true }).click();
    const modal = page.getByRole("dialog", {
      name: "感染者 · 企业家档案",
      exact: true,
    });
    await expect(modal.locator("h3")).toContainText(who.name);
    await expect(
      modal.locator(".dossier-identity .oripathy-reference img"),
    ).toHaveAttribute("src", `/assets/oripathy/${who.face}.webp`);
    await modal.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-entrepreneur-pioneer.png`,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

async function fits(page: Page, el: Locator) {
  await el.evaluate(async (node) => {
    node.getBoundingClientRect();
    await Promise.all(
      node
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  const box = (await el.boundingBox())!,
    v = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(v.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(v.height + 1);
}
async function infectionFixture(page: Page, dilemma = false) {
  const result = await fixture(page);
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(result.id)!;
    let game = createGame(room.seats, {
      oripathy: true,
      expert: true,
      seed: 42,
    });
    for (let n = 0; game.phase !== "actions"; n++) {
      expect(n).toBeLessThan(250);
      game = applyCommand(game, game.decision!.playerId, {
        type: "choose",
        optionId: game.decision!.options[0].id,
      });
    }
    const p = game.players[0];
    expect(p.oripathy!.entrepreneur).toBe("martin");
    p.wallet = { cash: 100, rock: 30, ore: 30, iron: 30, prime: 5, score: 0 };
    p.built["0"] = {
      cardId: "administration",
      used: false,
      layers: [{ cardId: "quarry-yellow", used: true }],
    };
    game.activeEnterprises = ["rhodes", "stonehoove", "maylander", "bank"];
    for (const p of game.players)
      p.enterprise = { rhodes: 3, stonehoove: 2, maylander: 4, bank: 1 };
    if (dilemma) {
      game.round = 3;
      game.queue = [];
      game.parallel = null;
      game.decision = {
        playerId: p.id,
        kind: "fixture",
        title: "抉择展示准备",
        options: [
          {
            id: "go",
            label: "准备",
            steps: [{ kind: "o:dilemma", actor: p.id }],
          },
        ],
      };
      game = applyCommand(game, p.id, { type: "choose", optionId: "go" });
    }
    room.game = game;
    room.oripathy = true;
    room.expert = true;
    room.expansion = true;
    room.revision++;
    store.save(room);
  } finally {
    store.close();
  }
  await page.reload();
  await expect(page.locator(".room-toolbar")).toContainText("感染者");
  return result;
}

test("首页感染者选项包含企业扩展，专家开关随建房配置保存", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/");
  await openHomeLobby(page);
  await page.getByLabel("创建房间时启用感染者扩展").check();
  await expect(page.getByLabel("创建房间时启用企业扩展")).toBeChecked();
  await expect(page.locator(".permit-expert")).toBeVisible();
  await expect(page.locator(".permit-expert")).toContainText("企业家与抉择");
  await page.locator(".permit-expert input").uncheck();
  await page.getByLabel("企业家昵称").fill("感染者建房验收");
  await page.screenshot({
    path: `test-results/${info.project.name}-oripathy-permit.png`,
    animations: "disabled",
  });
  await clickRoomButton(page, "创建新房间");
  await expect(page.locator(".room-toolbar")).toContainText(
    "感染者 · 常规玩法",
  );
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    const room = store.get(page.url().split("/").at(-1)!)!;
    expect(room).toMatchObject({
      oripathy: true,
      expert: false,
      expansion: true,
    });
  } finally {
    store.close();
  }
});

test("抉择以完整 A/B 牌展示，查看与预选不提交，确认后保留选择", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { id } = await infectionFixture(page, true);
  const modal = page.getByRole("dialog", { name: "行动安排", exact: true });
  await expect(modal).toBeVisible();
  await expect(page.locator(".dilemma-choices article")).toHaveCount(2);
  await fits(page, modal);
  const before = await page
    .locator(".room-toolbar")
    .getAttribute("data-revision");
  await page.locator(".oripathy-choice-art").nth(1).click();
  await expect(page.locator(".room-toolbar")).toHaveAttribute(
    "data-revision",
    before!,
  );
  await page.locator(".oripathy-face-detail").nth(1).click();
  await expect(
    page.getByRole("dialog").last().locator(".card-artwork"),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "关闭弹窗", exact: true })
    .click();
  await page.screenshot({
    path: `test-results/${info.project.name}-oripathy-dilemma.png`,
    animations: "disabled",
  });
  await modal.getByRole("button", { name: "确认选择 →", exact: true }).click();
  await expect(page.locator(".room-toolbar")).not.toHaveAttribute(
    "data-revision",
    before!,
  );
  const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
  try {
    expect(store.get(id)!.game!.players[0].oripathy!.dilemmas).toContainEqual(
      expect.objectContaining({ round: 3, side: "B" }),
    );
  } finally {
    store.close();
  }
  expect(errors).toEqual([]);
});

test("档案、叠层与新版企业板可查看，桌面和横屏关键按钮可达", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await infectionFixture(page);
  await page.getByRole("button", { name: "感染者档案", exact: true }).click();
  let modal = page.getByRole("dialog", {
    name: "感染者 · 企业家档案",
    exact: true,
  });
  await expect(modal).toContainText("马丁·费舍尔");
  await expect(
    modal.locator(".oripathy-reference-list .oripathy-reference"),
  ).toHaveCount(9);
  await fits(page, modal);
  await page.screenshot({
    path: `test-results/${info.project.name}-oripathy-dossier.png`,
    animations: "disabled",
  });
  await modal.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  const enterprise = page.getByRole("button", {
    name: "合作企业",
    exact: true,
  });
  if (!(await enterprise.isVisible())) {
    await page
      .getByRole("button", { name: "查看资源、玩家与城市", exact: true })
      .click();
  }
  await enterprise.click();
  modal = page.getByRole("dialog", { name: "合作企业", exact: true });
  await expect(modal).toBeVisible();
  await expect(page.locator(".enterprise-original-board img")).toHaveAttribute(
    "src",
    /oripathy\/1072/,
  );
  await expect(page.locator('.enterprise-step[data-level="4"]')).toContainText(
    "从干员牌堆直接选择",
  );
  await fits(page, modal);
  expect(errors).toEqual([]);
});
