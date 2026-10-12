import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const baseline = process.argv.includes("--baseline");
const output = path.resolve("output/canvas-help-20261012");
await mkdir(output, { recursive: true });
const configPath = path.resolve("tsconfig.json");
const originalConfig = await readFile(configPath);
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const base = `http://127.0.0.1:${port}`;
const appLog = [];
const errors = [];
let browser;
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
  env: { ...process.env, DATABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NAUMI_MULTI_USER: "0", NAUMI_PUBLIC_COMMERCE: "0", NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: "output/canvas-help-20261012/.next-dev" },
  stdio: ["ignore", "pipe", "pipe"],
});
app.stdout.on("data", value => appLog.push(value.toString()));
app.stderr.on("data", value => appLog.push(value.toString()));
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    if (i === 119) throw new Error("Local app did not start");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const platform of baseline ? ["windows"] : ["windows", "mac"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
    await context.addInitScript(value => Object.defineProperty(navigator, "platform", { value }), platform === "mac" ? "MacIntel" : "Win32");
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(({ email }) => {
      const stamp = new Date().toISOString();
      const id = "text-help-fixture";
      localStorage.setItem("naumi:last-email", email);
      localStorage.setItem(`naumi:user:${email}`, JSON.stringify({ name: "Help fixture", email, plan: "starter", creditsTotal: 1000, creditsUsed: 0, joinedAt: stamp, renewsAt: stamp, invoices: [] }));
      localStorage.setItem("nv:canvas:last", `tree:${id}`);
      localStorage.setItem(`naumi:canvas-text-nodes:${email}`, JSON.stringify([{ id, projectKey: `tree:${id}`, title: "帮助验收节点", prompt: "", content: "", status: "idle", canvasX: 120, canvasY: 120, createdAt: stamp, updatedAt: stamp, width: 380, height: 240, sourceIds: [], targetIds: [], productIds: [] }]));
    }, { email: `help-${platform}@local.test` });
    await page.goto(`${base}/canvas`);
    await expect(page.locator(".react-flow__pane")).toBeVisible({ timeout: 90000 });
    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(1, { timeout: 30000 });
    await nodes.first().click({ position: { x: 30, y: 25 } });
    await expect(nodes.first()).toHaveClass(/selected/);
    await page.locator('[data-tool="more"]').click();
    await page.getByRole("menuitem", { name: "快捷键与帮助", exact: true }).click();
    if (baseline) {
      await expect(page.getByRole("heading", { name: "快捷键与帮助" })).toBeVisible();
      const bullets = page.locator(".fixed.inset-0").filter({ has: page.getByRole("heading", { name: "快捷键与帮助" }) }).locator("li");
      await expect(bullets).toHaveCount(7);
      await page.screenshot({ animations: "disabled", path: path.join(output, "baseline.png") });
      pass("baseline seven legacy help bullets visible");
      await context.close();
      continue;
    }
    const dialog = page.getByRole("dialog", { name: "快捷键与帮助" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-shortcut]")).toHaveCount(18);
    await expect(dialog.getByRole("button", { name: platform === "mac" ? "macOS" : "Windows", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.locator('[data-shortcut="undo"] kbd').first()).toHaveText(platform === "mac" ? "⌘" : "Ctrl");
    pass(`${platform} platform labels and 18 shortcuts`);
    const search = dialog.getByRole("textbox");
    await expect(search).toBeFocused();
    await search.fill("撤销");
    await expect(dialog.locator("[data-shortcut]")).toHaveCount(1);
    await search.fill("none-no-match");
    await expect(dialog.getByRole("status")).toHaveText("未找到相关操作");
    await search.fill("");
    await dialog.getByRole("button", { name: platform === "mac" ? "Windows" : "macOS", exact: true }).click();
    await expect(dialog.locator('[data-shortcut="undo"] kbd').first()).toHaveText(platform === "mac" ? "Ctrl" : "⌘");
    await expect(dialog.getByRole("button", { name: platform === "mac" ? "Windows" : "macOS", exact: true })).toHaveAttribute("aria-pressed", "true");
    pass(`${platform} search, empty state and manual platform switch`);
    await page.screenshot({ animations: "disabled", path: path.join(output, `desktop-${platform}.png`) });
    const nodeIds = await nodes.evaluateAll(items => items.map(item => item.dataset.id));
    assert.equal(nodeIds.length, 1, "Mutation checks require a real selected node");
    await dialog.getByRole("button", { name: "Windows", exact: true }).focus();
    for (const key of ["Delete", "Backspace", "Control+z", "Shift+t"]) await page.keyboard.press(key);
    assert.deepEqual(await nodes.evaluateAll(items => items.map(item => item.dataset.id)), nodeIds);
    await expect(dialog).toBeVisible();
    await expect(nodes.first()).toHaveClass(/selected/);
    pass(`${platform} help blocks canvas mutations`);
    const close = dialog.getByRole("button", { name: "关闭帮助" });
    const last = dialog.getByRole("button", { name: "macOS", exact: true });
    await last.focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(last).toBeFocused();
    pass(`${platform} Tab and Shift+Tab wrap at both dialog boundaries`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-tool="more"]')).toBeFocused();
    pass(`${platform} Escape closes and restores trigger focus`);
    await page.locator('[data-tool="more"]').click();
    await page.getByRole("menuitem", { name: "快捷键与帮助", exact: true }).click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 720 });
      const box = await dialog.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 720);
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ animations: "disabled", path: path.join(output, `mobile-${platform}-${width}.png`) });
    }
    pass(`${platform} 390px/320px bounds and no horizontal overflow`);
    await page.locator('[data-testid="canvas-help-content"]').evaluate(el => el.scrollTop = el.scrollHeight);
    await expect(dialog.getByRole("heading", { name: "生成进度" })).toBeVisible();
    await page.getByTestId("canvas-help-overlay").click({ position: { x: 1, y: 1 } });
    await expect(dialog).toBeHidden();
    pass(`${platform} scrollable content and backdrop close`);
    if (platform === "windows") {
      await page.setViewportSize({ width: 1440, height: 900 });
      await context.addCookies([{ name: "naumi_locale", value: "en", url: base }]);
      await page.goto(`${base}/canvas`);
      await expect(page.locator(".react-flow__pane")).toBeVisible({ timeout: 30000 });
      await page.locator('[data-tool="more"]').click();
      await page.getByRole("menuitem", { name: "Shortcuts & help", exact: true }).click();
      const englishDialog = page.getByRole("dialog", { name: "Shortcuts & help" });
      await expect(englishDialog).toBeVisible();
      await expect(englishDialog.locator("[data-shortcut]")).toHaveCount(18);
      await expect(englishDialog.locator('[data-shortcut="undo"]')).toContainText("Undo");
      await page.screenshot({ animations: "disabled", path: path.join(output, "english-desktop.png") });
      await page.keyboard.press("Escape");
      await expect(englishDialog).toBeHidden();
      pass("English help renders translated labels and shortcuts");
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`CANVAS_HELP_${baseline ? "BASELINE" : "BROWSER"}=PASS checks=${checks}`);
} finally {
  await writeFile(path.join(output, baseline ? "baseline-next.log" : "next.log"), appLog.join(""));
  await browser?.close();
  if (app.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" }); } catch {} }
    else app.kill("SIGTERM");
  }
  await writeFile(configPath, originalConfig);
}
