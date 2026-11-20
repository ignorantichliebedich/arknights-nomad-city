import { test, expect, type WebSocketRoute } from "./fixtures/test.ts";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "./fixtures/table.ts";

function snapshot(id: string) {
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!, {
    readOnly: true,
  });
  try {
    const row = db.prepare("SELECT body FROM rooms WHERE id = ?").get(id)!;
    const room = JSON.parse(row.body as string);
    const receipts = db
      .prepare("SELECT COUNT(*) AS n FROM commands WHERE room_id = ?")
      .get(id)!.n;
    return { revision: room.revision, receipts };
  } finally {
    db.close();
  }
}

async function pick(page: import("@playwright/test").Page) {
  await page.locator(".hand-card.playable").first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "确认盖放", exact: true }).click();
}

test("等待回执时四席更新不触发重复提交，延迟回执到达后恢复操作", async ({
  page,
  browser,
}) => {
  const commands: string[] = [];
  let release: (() => void) | undefined;
  await page.routeWebSocket("**/ws", (route) => {
    const server = route.connectToServer();
    route.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "command") commands.push(m.requestId);
      server.send(raw);
    });
    server.onMessage((raw) => {
      if (JSON.parse(String(raw)).type === "ack")
        release = () => route.send(raw);
      else route.send(raw);
    });
  });
  const { id, seatTokens } = await fixture(page, "select");
  const contexts = [];
  try {
    for (const token of seatTokens.slice(1)) {
      const context = await browser.newContext();
      contexts.push(context);
      await context.addInitScript(
        ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
        { id, token },
      );
      const tab = await context.newPage();
      await tab.goto(`/room/${id}`);
      await expect(tab.locator(".connection")).toContainText("已连接");
    }
    const before = snapshot(id);
    await page.bringToFront();
    await pick(page);
    await expect.poll(() => !!release).toBe(true);
    for (const context of contexts.slice(0, 2)) {
      const tab = context.pages()[0];
      await tab.bringToFront();
      await pick(tab);
    }
    await expect(page.locator(".parallel-progress")).toHaveText("3 / 4 已确认");
    expect(commands).toHaveLength(1);
    expect(snapshot(id).revision).toBe(before.revision + 3);
    expect(
      await page.evaluate(
        (id) => !!localStorage.getItem(`nomad:pending:${id}`),
        id,
      ),
    ).toBe(true);
    release!();
    await expect
      .poll(() =>
        page.evaluate((id) => localStorage.getItem(`nomad:pending:${id}`), id),
      )
      .toBeNull();
    expect(commands).toHaveLength(1);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

for (const recovery of ["timeout", "reload"] as const) {
  test(`已执行操作的回执丢失后经 ${recovery} 核对恢复，只结算一次`, async ({
    page,
  }) => {
    let connections = 0;
    const commands: string[] = [];
    await page.routeWebSocket("**/ws", (route: WebSocketRoute) => {
      const first = ++connections === 1;
      const server = route.connectToServer();
      let submitted = false;
      route.onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === "command") {
          submitted = true;
          commands.push(m.requestId);
        }
        server.send(raw);
      });
      server.onMessage((raw) => {
        // Keep the socket open but lose the reply and subsequent state, as on a
        // stalled link. A replacement connection can see the persisted receipt.
        if (!first || !submitted) route.send(raw);
      });
    });
    const { id } = await fixture(page, "select");
    const before = snapshot(id);
    await pick(page);
    await expect.poll(() => snapshot(id).revision).toBe(before.revision + 1);
    expect(
      await page.evaluate(
        (id) => !!localStorage.getItem(`nomad:pending:${id}`),
        id,
      ),
    ).toBe(true);
    if (recovery === "reload") await page.reload();
    await expect.poll(() => connections, { timeout: 23000 }).toBe(2);
    await expect
      .poll(() =>
        page.evaluate((id) => localStorage.getItem(`nomad:pending:${id}`), id),
      )
      .toBeNull();
    await expect(page.locator(".connection")).toContainText("已连接");
    await expect(page.locator(".parallel-progress")).toHaveText("1 / 4 已确认");
    expect(commands).toHaveLength(2);
    expect(new Set(commands).size).toBe(1);
    expect(snapshot(id)).toEqual({
      revision: before.revision + 1,
      receipts: Number(before.receipts) + 1,
    });
  });
}

test("回执先到时继续等待状态，增量漏包后重新连接且不重复结算", async ({
  page,
  browser,
}) => {
  let connections = 0;
  let submitted = false;
  let dropped = false;
  let acknowledged = false;
  const commands: string[] = [];
  const frames: string[] = [];
  await page.routeWebSocket("**/ws", (route) => {
    connections++;
    const server = route.connectToServer();
    route.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "command") {
        submitted = true;
        commands.push(message.requestId);
      }
      server.send(raw);
    });
    server.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "ack" && submitted) acknowledged = true;
      if (submitted && !dropped && message.type === "state-delta") {
        dropped = true;
        return;
      }
      frames.push(message.type);
      route.send(raw);
    });
  });
  const { id, friendToken } = await fixture(page, "select");
  const before = snapshot(id);
  await pick(page);
  await expect.poll(() => acknowledged && dropped).toBe(true);
  await expect(
    page.getByRole("button", { name: "进行行动", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      (id) => !!localStorage.getItem(`nomad:pending:${id}`),
      id,
    ),
  ).toBe(true);
  const friend = await browser.newContext();
  try {
    await friend.addInitScript(
      ({ id, token }) => localStorage.setItem(`nomad:seat:${id}`, token),
      { id, token: friendToken },
    );
    await (await friend.newPage()).goto(`/room/${id}`);
    await expect.poll(() => connections).toBe(2);
    await expect(page.locator(".connection")).toContainText("已连接");
    await expect(page.locator(".parallel-progress")).toHaveText("1 / 4 已确认");
    await expect
      .poll(() =>
        page.evaluate((id) => localStorage.getItem(`nomad:pending:${id}`), id),
      )
      .toBeNull();
    expect(commands).toHaveLength(1);
    expect(frames.filter((type) => type === "state")).toHaveLength(2);
    expect(snapshot(id)).toEqual({
      revision: before.revision + 1,
      receipts: Number(before.receipts) + 1,
    });
  } finally {
    await friend.close();
  }
});
