import { openHomeLobby } from "./fixtures/rooms.ts";
import { test, expect } from "./fixtures/test.ts";
import { RoomStore } from "../../apps/server/src/store.ts";
import { applyCommand, createGame } from "../../packages/rules/src/engine.ts";
import { RHINE_DEPARTMENTS } from "../../packages/rules/src/original-labs.ts";

for (const count of [2, 3, 4])
  test(`${count} 人受控科室场景：公开合作等级、只读预览和共享恢复`, async ({
    page,
  }, info) => {
    await page.goto("/");
    await openHomeLobby(page);
    await page.getByLabel("企业家昵称").fill("科室界面测试");
    await page.getByRole("button", { name: "创建新房间" }).click();
    await expect(page.locator(".room-toolbar")).toBeVisible();
    const roomId = page.url().split("/").at(-1)!;
    const join = await page.request.post(`/api/rooms/${roomId}/join`, {
      data: { name: "共享科室朋友" },
    });
    expect(join.status()).toBe(201);
    const credential = await join.json();
    for (let i = 2; i < count; i++) {
      const seat = await page.request.post(`/api/rooms/${roomId}/join`, {
        data: { name: `合作等级对照的第${i + 1}位拓荒企业家` },
      });
      expect(seat.status()).toBe(201);
    }
    const store = new RoomStore(process.env.E2E_DATABASE_PATH!);
    try {
      const room = store.get(roomId)!;
      let game = createGame(room.seats, { expansion: true, seed: 52 });
      while (game.phase !== "actions")
        game = applyCommand(game, game.decision!.playerId, {
          type: "choose",
          optionId: game.decision!.options[0].id,
        });
      game.activeEnterprises = ["rhine", "bank", "rhodes", "heide"];
      game.activeLab = 0;
      game.players[0].enterprise = { rhine: 2, bank: 1, rhodes: 3, heide: 5 };
      game.players[1].enterprise = { rhine: 4, bank: 5, rhodes: 1, heide: 2 };
      for (let i = 2; i < count; i++)
        game.players[i].enterprise = {
          rhine: i === 2 ? 1 : 5,
          bank: 0,
          rhodes: 2,
          heide: 3,
        };
      // A controlled midgame fixture checks all player columns and restored decisions.
      // Natural room setup and complete games are covered separately.
      game.decision = {
        playerId: game.players[0].id,
        kind: "lab",
        title: "选择莱茵生命科室",
        options: [
          {
            id: "1",
            label: RHINE_DEPARTMENTS[1].name,
            steps: [
              {
                kind: "set-lab",
                actor: game.players[0].id,
                data: { lab: 1 },
              },
            ],
          },
        ],
      };
      room.expansion = true;
      room.game = game;
      room.revision++;
      store.save(room);
    } finally {
      store.close();
    }
    await page.reload();
    await expect(page.locator(".connection")).toContainText("已连接");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "合作企业", exact: true }).click();
    await page.locator(".enterprise-comparison > summary").click();
    const table = page.getByRole("table", { name: "企业合作等级" });
    await expect(table.getByRole("columnheader")).toHaveCount(count + 1);
    await expect(table).toContainText("共享科室朋友");
    const rhine = table.locator("tbody tr").filter({ hasText: "莱茵生命" });
    await expect(rhine.getByRole("cell")).toHaveText(
      ["2级", "4级", "1级", "5级"].slice(0, count),
    );
    await expect(
      page.getByRole("region", { name: "莱茵生命共享科室" }),
    ).toContainText("工程科");
    const revision = await page
      .locator(".room-toolbar")
      .getAttribute("data-revision");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "进行行动", exact: true }).click();
    await page.getByRole("button", { name: "查看防卫科的牌面" }).click();
    await expect(
      page.getByRole("dialog", { name: "莱茵生命 · 防卫科", exact: true }),
    ).toContainText("支付 12 金券");
    await expect(
      page.getByRole("dialog", { name: "莱茵生命 · 防卫科", exact: true }),
    ).toContainText("替换 1 次影响力");
    await expect(
      page.getByRole("dialog", { name: "莱茵生命 · 防卫科", exact: true }),
    ).toContainText("获得 3 至纯源石");
    await expect(page.locator(".room-toolbar")).toHaveAttribute(
      "data-revision",
      revision!,
    );
    await page.keyboard.press("Escape");
    await page.locator(".action-list .action-button").click();
    await expect(page.locator(".room-toolbar")).toHaveAttribute(
      "data-revision",
      revision!,
    );
    await page.getByRole("button", { name: "确认选择" }).click();
    await expect(page.locator(".room-toolbar")).not.toHaveAttribute(
      "data-revision",
      revision!,
    );
    await page.getByRole("button", { name: "合作企业", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "莱茵生命共享科室" }),
    ).toContainText("防卫科");
    await page.getByRole("button", { name: "科室详情" }).click();
    await expect(
      page.getByRole("dialog", { name: "莱茵生命 · 防卫科", exact: true }),
    ).toContainText("所有玩家共用激活科室");
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "合作企业", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "莱茵生命共享科室" }),
    ).toContainText("防卫科");

    const otherContext = await page
      .context()
      .browser()!
      .newContext({ viewport: page.viewportSize()! });
    try {
      await otherContext.addInitScript(
        ({ roomId, token }) =>
          localStorage.setItem(`nomad:seat:${roomId}`, token),
        { roomId, token: credential.token },
      );
      const other = await otherContext.newPage();
      await other.goto(`/room/${roomId}`);
      await other
        .getByRole("button", { name: "合作企业", exact: true })
        .click();
      await expect(
        other.getByRole("region", { name: "莱茵生命共享科室" }),
      ).toContainText("防卫科");
      await other.locator(".enterprise-comparison > summary").click();
      await expect(
        other.getByRole("table", { name: "企业合作等级" }),
      ).toContainText("共享科室朋友（你）");
      const otherRhine = other
        .locator(".enterprise-levels tbody tr")
        .filter({ hasText: "莱茵生命" });
      await expect(otherRhine.getByRole("cell")).toHaveText(
        ["2级", "4级", "1级", "5级"].slice(0, count),
      );
    } finally {
      await otherContext.close();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      animations: "disabled",
      path: `test-results/${info.project.name}-known-departments-${count}.png`,
      fullPage: true,
    });
  });
