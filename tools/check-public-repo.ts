import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["ls-files", "--cached", "-z"], {
  encoding: "utf8",
});
if (result.status !== 0)
  throw new Error("Run inside the Git repository after staging source files");
const files = result.stdout.split("\0").filter(Boolean);
const batch = spawnSync("git", ["cat-file", "--batch"], {
  input: files.map((file) => ":" + file).join("\n") + "\n",
  maxBuffer: 20 * 1024 * 1024,
});
if (batch.status !== 0 || batch.error)
  throw new Error("Cannot read staged Git content");
let offset = 0;
const forbidden =
  /(^|\/)(\.data|node_modules|backups|test-results|playwright-report|\.ssh)(\/|$)|(^|\/)\.env(?!\.example$)|\.(sqlite(?:-wal|-shm)?|db|pem|key|zip|7z|tar\.gz)$|^apps\/web\/public\/(assets|audio\/(sfx|music))\//i;
const secrets = [
  /-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED)? ?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /(?:https?|wss?):\/\/[^\s"']+[?&](?:token|access_token)=[A-Za-z0-9_-]{25,}/,
];
const problems: string[] = [];
let bytes = 0;
for (const file of files) {
  if (forbidden.test(file))
    problems.push("Forbidden runtime/private file: " + file);
  const end = batch.stdout.indexOf(10, offset);
  const header = batch.stdout.subarray(offset, end).toString("utf8");
  const size = / blob (\d+)$/.exec(header);
  if (!size) throw new Error("Invalid staged object: " + file);
  const content = batch.stdout.subarray(end + 1, end + 1 + Number(size[1]));
  offset = end + 1 + content.length + 1;
  bytes += content.length;
  if (content.length > 5 * 1024 * 1024)
    problems.push("Review large file: " + file);
  if (content.includes(0)) continue;
  if (secrets.some((pattern) => pattern.test(content.toString("utf8"))))
    problems.push("Potential credential in: " + file);
}
if (problems.length) throw new Error(problems.join("\n"));
console.info(
  "Public source audit passed: " +
    files.length +
    " staged files, " +
    bytes +
    " bytes; no runtime assets, local games, or credential patterns found.",
);
