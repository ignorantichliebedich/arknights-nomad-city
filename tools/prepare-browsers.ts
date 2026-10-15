import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { firefox } from "@playwright/test";

// Some Windows Firefox archives omit this external side-by-side assembly.
// Mozilla's original definition: https://searchfox.org/firefox-main/source/mozglue/build/mozglue.dll.manifest
// Use a project-local test copy; leave the installed browser unchanged.
if (process.platform !== "win32") {
  console.log("此平台使用 Playwright 默认浏览器。");
} else {
  const source = dirname(firefox.executablePath());
  if (!existsSync(resolve(source, "firefox.exe")))
    throw new Error("请先运行 pnpm exec playwright install firefox");
  const root = resolve(".data/browsers");
  const target = resolve(root, "firefox");
  if (!target.startsWith(root + sep)) throw new Error("浏览器目录超出项目缓存");
  mkdirSync(root, { recursive: true });
  cpSync(source, target, { recursive: true });
  if (!existsSync(resolve(target, "mozglue.manifest")))
    writeFileSync(
      resolve(target, "mozglue.manifest"),
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">\n<assemblyIdentity version="1.0.0.0" name="mozglue" type="win32"/>\n<file name="mozglue.dll"/>\n</assembly>\n',
    );
  console.log("Windows Firefox 验收副本就绪：.data/browsers/firefox");
}
