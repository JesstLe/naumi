/** The app/error + app/global-error fallback in a real browser: the actual
 * PageRecovery component bundled with React, loopback page only.
 * Proves: "clear cache and reload" removes only rebuildable caches (drafts,
 * receipts, preferences and user databases survive) and reloads; a stale-asset
 * error reloads once per minute, never in a loop; ordinary errors never auto-reload.
 * Run: node scripts/verify-page-recovery.mjs */
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const root = process.cwd(), origin = "http://recovery.fixture";
const entry = `
import { createRoot } from "react-dom/client";
import { PageRecovery } from ${JSON.stringify(path.join(root, "src/components/page-recovery.tsx").replaceAll("\\", "/"))};
const kind = new URLSearchParams(location.search).get("kind");
const error = kind === "chunk" ? Object.assign(new Error("Loading chunk 4521 failed."), { name: "ChunkLoadError" }) : new TypeError("Cannot read properties of undefined (reading 'toLowerCase')");
window.__loads = Number(sessionStorage.getItem("loads") || 0) + 1; sessionStorage.setItem("loads", String(window.__loads));
createRoot(document.getElementById("root")).render(<PageRecovery error={error} reset={() => { window.__reset = (window.__reset || 0) + 1; }} standalone />);
`;
const bundle = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: root }, bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": path.join(root, "src") }, logLevel: "silent" });
const script = bundle.outputFiles[0].text;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><div id="root"></div><script src="/app.js"></script></body></html>`;

let browser;
try { browser = await chromium.launch({ headless: true }); } catch { browser = await chromium.launch({ channel: "msedge", headless: true }); }
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; }, eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
try {
  const context = await browser.newContext();
  await context.route(`${origin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/app.js") return route.fulfill({ contentType: "application/javascript", body: script });
    return route.fulfill({ contentType: "text/html", body: html });
  });
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  // Ordinary error: no automatic reload, both actions offered.
  await page.goto(origin + "/?kind=render");
  await page.getByRole("alert").waitFor();
  await page.waitForTimeout(300);
  eq(await page.evaluate(() => window.__loads), 1, "ordinary error never auto-reloads");
  ok(await page.getByText("页面没有正常加载").isVisible(), "fallback title");
  await page.getByRole("button", { name: "重试" }).click();
  eq(await page.evaluate(() => window.__reset), 1, "retry calls reset");

  // Seed what a long-lived browser holds, then clear from the fallback.
  const keep = { "naumi:billing-intent:x": "id", "naumi:tool-generation-receipt:v1:input:x": "job-1", "theme": "dark", "naumi:last-email": "a@b.c",
    "naumi:user:a@b.c": "{}", "naumi:packaging-strategy:draft:a": "{}", "naumi-reference:a:gpt-image-pil-workbench-prompts": "{}" };
  const drop = ["naumi:templatesCacheV1", "naumi:cache-account", "naumi:cache-revision:a@b.c", "naumi-image-bytes-v1:account"];
  await page.evaluate(async ([keep, drop]) => {
    for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
    for (const k of drop) localStorage.setItem(k, "x");
    for (const name of ["naumi-image-bytes-v1", "naumi-business-cache-v1", "naumi-studio3d-v1", "naumi-reference-workbench-history-v1-acct"])
      await new Promise(resolve => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore("s"); r.onsuccess = () => { r.result.close(); resolve(); }; });
  }, [keep, drop]);
  const loadsBefore = await page.evaluate(() => window.__loads);
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "清理缓存并刷新" }).click()]);
  await page.getByRole("alert").waitFor();
  eq(await page.evaluate(() => window.__loads), loadsBefore + 1, "page reloaded once");
  const state = await page.evaluate(async keys => ({
    kept: Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)])),
    dropped: ["naumi:templatesCacheV1", "naumi:cache-account", "naumi:cache-revision:a@b.c", "naumi-image-bytes-v1:account"].map(k => localStorage.getItem(k)),
    databases: (await indexedDB.databases()).map(d => d.name).sort(),
  }), Object.keys(keep));
  eq(state.kept, keep, "drafts, receipts, preferences and session copies kept");
  eq(state.dropped, [null, null, null, null], "rebuildable cache keys removed");
  eq(state.databases, ["naumi-reference-workbench-history-v1-acct", "naumi-studio3d-v1"], "only cache databases deleted");

  // Stale asset: exactly one automatic reload, then the manual fallback (no loop).
  await page.evaluate(() => sessionStorage.setItem("loads", "0"));
  await page.goto(origin + "/?kind=chunk");
  await page.waitForTimeout(1500);
  eq(await page.evaluate(() => window.__loads), 2, "one automatic reload for a stale chunk");
  ok(await page.getByRole("button", { name: "刷新页面" }).isVisible(), "after the guarded reload the user gets a reload button");
  await page.waitForTimeout(1000);
  eq(await page.evaluate(() => window.__loads), 2, "no reload loop");
  eq(errors, [], "no page errors");
  console.log(`PAGE_RECOVERY=PASS CHECKS=${checks}`);
} finally { await browser?.close(); }
