import { describe, expect, it } from "vitest";
import catalog from "../assets/catalog.json" with { type: "json" };

describe("公开规则目录覆盖本体及两种扩展", () => {
  it("按实体与效果分别登记，不漏掉感染者角色或新版企业板", () => {
    expect(catalog.components.base.total).toBe(100);
    expect(catalog.components.enterprise.total).toBe(27);
    expect(catalog.components.oripathy.total).toBe(63);
    expect(catalog.facilities).toHaveLength(33);
    expect(catalog.roles).toHaveLength(27);
    expect(catalog.events).toHaveLength(22);
    expect(catalog.replacementEvents).toHaveLength(2);
    expect(catalog.patterns).toHaveLength(15);
    expect(catalog.enterprises).toHaveLength(11);
    expect(catalog.roles.reduce((n, r) => n + r.copies, 0)).toBe(51);
  });
  it("每张企业板指向正确牌面，并区分新版罗德岛与升级授勋", () => {
    expect(
      catalog.enterprises.every((e) =>
        e.evidence.some(
          (v) =>
            v.kind === "card-face" &&
            "asset" in v &&
            !v.asset?.includes("/-1."),
        ),
      ),
    ).toBe(true);
    const rhodes = catalog.enterprises.filter((e) => e.id === "rhodes");
    expect(rhodes).toHaveLength(2);
    expect(new Set(rhodes.map((e) => e.rulesVersion)).size).toBe(2);
    expect(
      catalog.enterprises.find((e) => e.id === "maylander")!.text,
    ).toContain("4 级升级奖励");
    expect(catalog.roles.find((r) => r.id === "o-silence")!.strategy).toContain(
      "Ⅰ级",
    );
  });
});
