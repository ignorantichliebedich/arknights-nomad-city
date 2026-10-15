import { fileURLToPath } from "node:url";
import { prepareRelease, type ReleaseKind } from "./release-version.ts";

const args = process.argv.slice(2);
let kind: ReleaseKind = "patch";
const notes: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--type" && ["patch", "minor", "major"].includes(args[i + 1]))
    kind = args[++i] as ReleaseKind;
  else if (args[i] === "--note" && args[i + 1]) notes.push(args[++i]);
  else
    throw new Error(
      "Usage: pnpm release:prepare [--type patch|minor|major] --note '更新说明'",
    );
}
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const version = prepareRelease(
  fileURLToPath(new URL("../", import.meta.url)),
  kind,
  notes,
  date,
);
console.info(
  `Prepared v${version}. Verify locally and push GitHub; cloud deployment requires the user's later approval.`,
);
