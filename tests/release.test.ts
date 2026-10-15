import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  nextVersion,
  compareVersions,
  prepareRelease,
} from "../tools/release-version.ts";

describe("交付版本", () => {
  it("按数字递增，跨两位数版本比较，并清零下级版本", () => {
    expect(nextVersion("0.2.9", "patch")).toBe("0.2.10");
    expect(nextVersion("0.2.9", "minor")).toBe("0.3.0");
    expect(nextVersion("0.2.9", "major")).toBe("1.0.0");
    expect(compareVersions("0.2.10", "0.2.9")).toBe(1);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.9", "1.0.0")).toBe(-1);
    expect(() => nextVersion("0.02.0", "patch")).toThrow();
  });
  it("一次生成版本及新记录，历史记录保留，坏说明不会改文件", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "nomad-release-"));
    try {
      const path = resolve(dir, "package.json");
      writeFileSync(
        path,
        JSON.stringify({ version: "0.1.0", scripts: { check: "tsc" } }),
      );
      writeFileSync(
        resolve(dir, "CHANGELOG.md"),
        "# 更新记录\n\n## [0.1.0] - 2026-10-14\n\n- 旧记录\n",
      );
      expect(prepareRelease(dir, "minor", ["加入背景音乐"], "2026-10-15")).toBe(
        "0.2.0",
      );
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
        version: "0.2.0",
        scripts: { check: "tsc" },
      });
      const log = readFileSync(resolve(dir, "CHANGELOG.md"), "utf8");
      expect(log.indexOf("[0.2.0]")).toBeLessThan(log.indexOf("[0.1.0]"));
      expect(log).toContain("旧记录");
      expect(() => prepareRelease(dir, "patch", [""], "2026-10-15")).toThrow();
      expect(JSON.parse(readFileSync(path, "utf8")).version).toBe("0.2.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
