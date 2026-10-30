import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const audit = fileURLToPath(
  new URL("../tools/check-public-repo.ts", import.meta.url),
);
const temporary: string[] = [];

function fixture(files: Record<string, string>) {
  const cwd = mkdtempSync(resolve(tmpdir(), "nomad-public-audit-"));
  temporary.push(cwd);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: resolve(cwd, "empty-git-config"),
  };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ])
    delete env[name as keyof typeof env];
  function git(...args: string[]) {
    const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(result.stderr || String(result.error));
  }
  function write(file: string, content: string) {
    const path = resolve(cwd, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  git("init", "--quiet");
  for (const [file, content] of Object.entries(files)) write(file, content);
  git("add", "--force", "--", ...Object.keys(files));
  return {
    git,
    write,
    run: () =>
      spawnSync(process.execPath, [audit], { cwd, env, encoding: "utf8" }),
  };
}

afterEach(() => {
  for (const cwd of temporary.splice(0))
    rmSync(cwd, { recursive: true, force: true });
});

describe("公开仓库内容边界", () => {
  it("允许玩家、贡献、规则和素材来源文档，以及 Actions 配置", () => {
    const repo = fixture({
      "README.md": "游戏介绍",
      "CONTRIBUTING.md": "本地 AGENTS.md 不进入公开仓库",
      "docs/rules-evidence.md": "规则来源",
      "assets/entry-art-direction.md": "素材出处",
      ".github/workflows/check.yml": "name: checks",
    });
    expect(repo.run().status).toBe(0);
  });

  it("即使强制暂存也拒绝大小写变体、嵌套助手指令和内部笔记", () => {
    const files = [
      "AGENTS.md",
      "apps/web/agent.MD",
      "Claude.md",
      "GEMINI.md",
      ".agents/rules.md",
      ".codex/notes.md",
      ".claude/config.json",
      "docs/acceptance.md",
      "docs/cloud-server.md",
      "docs/releases/v0.7.1.md",
    ];
    const repo = fixture(
      Object.fromEntries(files.map((file) => [file, "内部记录"])),
    );
    const result = repo.run();
    expect(result.status).not.toBe(0);
    for (const file of files)
      expect(result.stderr).toContain(
        `Forbidden runtime/private file: ${file}`,
      );
  });

  it("仍拒绝数据库、环境配置与原始运行素材", () => {
    const files = [
      ".env",
      "backups/game.sqlite",
      "apps/web/public/audio/music/song.mp3",
    ];
    const repo = fixture(
      Object.fromEntries(files.map((file) => [file, "private"])),
    );
    const result = repo.run();
    expect(result.status).not.toBe(0);
    for (const file of files) expect(result.stderr).toContain(file);
  });

  it("只审计暂存版本，暂存凭证后拒绝发布", () => {
    const repo = fixture({ "README.md": "公开说明" });
    repo.write("README.md", "ghp_" + "x".repeat(36));
    expect(repo.run().status).toBe(0);
    repo.git("add", "README.md");
    const result = repo.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Potential credential in: README.md");
  });
});
