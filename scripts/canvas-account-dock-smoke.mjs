import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const canvas = read("src/components/canvas/canvas-client.tsx");
const rail = read("src/components/app-rail.tsx");
const dock = read("src/components/account/account-dock-menu.tsx");
const globals = read("src/app/globals.css");

assert.equal(
  canvas.match(/data-testid="canvas-account-dock-trigger"/g)?.length,
  2,
  "项目列表页和项目编辑页都必须使用统一账户 Dock"
);
assert.match(canvas, /<AccountDockMenu/);
assert.doesNotMatch(canvas, /onClick=\{\(\) => openModal\("account"\)\}/);
assert.match(canvas, /accountDockOpen \|\|\s*modalTop/);
assert.match(rail, /<AccountDockMenu/);
assert.match(rail, /data-testid="app-account-dock-trigger"/);
assert.match(dock, /data-testid="account-dock"/);
assert.match(dock, /role="menu"/);
assert.match(dock, /href="\/account\?tab=credits"/);
assert.match(dock, /href="\/account\/security"/);
assert.match(dock, /href="\/account\/image-provider"/);
assert.match(globals, /\.account-dock-theme-light/);

console.log("CANVAS_ACCOUNT_DOCK_RESULT=PASS checks=12 entries=2");
