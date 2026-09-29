import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const removed = (process.argv[2] || "").trim().toLowerCase();
assert.ok(removed, "usage: node scripts/removed-identifier-smoke.mjs <removed-identifier>");

const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean);
const pathMatches = tracked.filter((file) => file.toLowerCase().includes(removed));
const contentMatches = [];

for (const file of tracked) {
  const content = readFileSync(file);
  if (content.includes(0)) continue;
  if (content.toString("utf8").toLowerCase().includes(removed)) contentMatches.push(file);
}

assert.deepEqual(pathMatches, [], `tracked path matches: ${pathMatches.join(", ")}`);
assert.deepEqual(contentMatches, [], `tracked content matches: ${contentMatches.join(", ")}`);

console.log(
  `REMOVED_IDENTIFIER_RESULT=PASS tracked=${tracked.length} path_matches=0 content_matches=0`
);
