import { test, expect } from "./fixtures/test.ts";
import type { BrowserContext, Page } from "./fixtures/test.ts";
import type { RoomView } from "../../apps/web/src/network.ts";
import { RULES_VERSION } from "../../packages/rules/src/data.ts";

function observeSocket() {
  const NativeSocket = window.WebSocket;
  class ObservedSocket extends NativeSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      (window as any).__gameSocket = this;
      this.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state") (window as any).__gameRoom = message.room;
      });
    }
  }
  window.WebSocket = ObservedSocket;
}

for (const count of [2, 3, 4])
  test(`${count} 人正式企业扩展：自然建房至八回合结算`, async ({
    browser,
    page,
  }, info) => {
    test.setTimeout(180000);
    const contexts: BrowserContext[] = [];
    const tabs: Page[] = [page];
    try {
      await page.addInitScript(observeSocket);
      await page.goto("/");
      await page.getByLabel("企业家昵称").fill("企业整局房主");
      await page.getByRole("checkbox", { name: /启用企业扩展/ }).check();
      await page.getByRole("button", { name: "创建新房间" }).click();
      await expect(page.locator(".room-toolbar")).toBeVisible();
      for (let i = 1; i < count; i++) {
        const context = await browser.newContext({
          viewport: page.viewportSize()!,
        });
        contexts.push(context);
        const friend = await context.newPage();
        await friend.addInitScript(observeSocket);
        await friend.goto(page.url());
        await friend.getByLabel("企业家昵称").fill(`企业整局朋友${i}`);
        await friend.getByRole("button", { name: "加入这场拓荒" }).click();
        tabs.push(friend);
      }
      for (const tab of tabs)
        await tab.getByRole("button", { name: "准备出发" }).click();
      await expect(
        page.getByRole("button", { name: "开始拓荒" }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "开始拓荒" }).click();
      await expect(page.locator(".board-surface")).toBeVisible();
      const seats = await Promise.all(
        tabs.map((tab) =>
          tab.evaluate(() => (window as any).__gameRoom.me as string),
        ),
      );
      let current: RoomView = await page.evaluate(
        () => (window as any).__gameRoom,
      );
      const observedDepartments = new Set<number>();
      for (let step = 0; current.game!.phase !== "finished"; step++) {
        expect(step).toBeLessThan(2200);
        const actor = current.game!.parallel
          ? current.game!.parallel.participants.find(
              (id) => !current.game!.parallel!.ready.includes(id),
            )!
          : (current.game!.decision?.playerId ??
            current.game!.players[current.game!.active].id);
        const tab = tabs[seats.indexOf(actor)];
        expect(tab).toBeDefined();
        await tab.waitForFunction(
          (revision) => (window as any).__gameRoom?.revision >= revision,
          current.revision,
        );
        const view: RoomView = await tab.evaluate(
          () => (window as any).__gameRoom,
        );
        const game = view.game!;
        expect(game.rulesVersion).toBe(RULES_VERSION);
        if (game.activeLab != null) observedDepartments.add(game.activeLab);
        const actions = game.actions;
        const choice = game.decision;
        let action;
        if (choice) {
          if (choice.kind === "sell" || choice.kind === "harvest")
            action = actions.find((a) => a.id === "done");
          else if (choice.kind === "trim")
            action = actions.find(
              (a) => a.id !== "mountain" && a.id !== "mlynar",
            );
          else if (choice.kind === "select-role")
            action =
              actions.find((a) => a.id === "mlynar") ??
              actions.find((a) => a.id === "mountain");
          else if (choice.kind === "lab")
            action =
              actions.find((a) => a.id === "2") ??
              actions.find((a) => a.id === "0");
          else action = actions.find((a) => a.id === "rhine");
          action ??= actions[0];
        } else {
          action =
            actions.find(
              (a) => a.command.type === "role" && a.command.mode === "strategy",
            ) ??
            actions.find((a) => a.id === "deploy") ??
            actions.find((a) => a.id === "shift") ??
            actions.find((a) => a.group === "main") ??
            actions.find((a) => a.id === "end");
        }
        expect(
          action,
          `缺少合法行动：${game.phase} / ${choice?.kind}`,
        ).toBeDefined();
        current = await tab.evaluate(
          ({ command, revision }) =>
            new Promise<RoomView>((resolve, reject) => {
              const socket: WebSocket = (window as any).__gameSocket;
              const timer = setTimeout(() => {
                socket.removeEventListener("message", receive);
                reject(new Error("企业整局状态同步超时"));
              }, 10000);
              function receive(event: MessageEvent) {
                const message = JSON.parse(event.data);
                if (message.type === "error") {
                  clearTimeout(timer);
                  socket.removeEventListener("message", receive);
                  reject(new Error(message.message));
                }
                if (
                  message.type === "state" &&
                  message.room.revision > revision
                ) {
                  clearTimeout(timer);
                  socket.removeEventListener("message", receive);
                  resolve(message.room);
                }
              }
              socket.addEventListener("message", receive);
              socket.send(
                JSON.stringify({
                  type: "command",
                  command,
                  revision,
                  requestId: crypto.randomUUID(),
                }),
              );
            }),
          { command: action!.command, revision: view.revision },
        );
      }
      if (count !== 3) {
        expect(current.game!.activeEnterprises).toContain("rhine");
        expect(observedDepartments.has(2)).toBe(true);
      }
      for (const tab of tabs) {
        await expect(tab.locator(".final-summary")).toBeVisible();
        await expect(tab.locator(".final-summary > div")).toHaveCount(count);
        const view: RoomView = await tab.evaluate(
          () => (window as any).__gameRoom,
        );
        expect(view.game!.finalScores).toEqual(current.game!.finalScores);
        expect(view.game!.winners).toEqual(current.game!.winners);
        for (const player of view.game!.players) {
          expect(player.wallet.ore).toBeGreaterThanOrEqual(0);
          expect(player.wallet.prime).toBeGreaterThanOrEqual(0);
        }
      }
      await page.reload();
      await expect(page.locator(".final-summary")).toBeVisible();
      await page.screenshot({
        path: `test-results/${info.project.name}-enterprise-finished-${count}.png`,
        fullPage: true,
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
