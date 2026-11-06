/** Polling load in a real browser: the actual useVideoTasks hook (Playwright clock)
 * and the actual CollaborationClient against the collaboration HTTP fixture.
 * Proves: idle video task lists poll every 30s instead of 4s, active work polls
 * every 4s and a submit wakes the loop, hidden pages send nothing and catch up on
 * return; member events are coalesced (not one full reload per presence flip) and
 * window switching no longer posts presence each time.
 * Run: node scripts/verify-polling-load.mjs [--source-root <dir>] */
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { startFixture } from "./verify-enterprise-collaboration-ui.http.mjs";

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const root = path.resolve(arg("--source-root") || "."), src = path.join(root, "src");
const bundle = async contents => (await build({ stdin: { contents, loader: "tsx", resolveDir: root }, bundle: true, write: false, format: "iife", jsx: "automatic",
  platform: "browser", define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": src }, logLevel: "silent" })).outputFiles[0].text;
const visibility = `window.__setHidden = hidden => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};`;

let browser; try { browser = await chromium.launch({ headless: true }); } catch { browser = await chromium.launch({ channel: "msedge", headless: true }); }
const results = {}; let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

try {
  // ---------- video task list (useVideoTasks) ----------
  const hook = await bundle(`
    import { createRoot } from "react-dom/client";
    import { useVideoTasks } from ${JSON.stringify(path.join(src, "components/canvas/video/use-video-tasks.ts").replaceAll("\\", "/"))};
    window.__calls = []; window.__tasks = [];
    const request = async url => { window.__calls.push(Date.now()); const tasks = window.__tasks; return { ok: true, status: 200, json: async () => ({ tasks }) }; };
    function App() { const store = useVideoTasks({ email: "a@b.c", projectKey: "P", readOnly: true, request, onCompleted: async () => {} }); window.__refresh = store.refresh; return null; }
    ${visibility}
    createRoot(document.getElementById("root")).render(<App />);`);
  const context = await browser.newContext(), page = await context.newPage();
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await page.route("http://poll.fixture/**", route => route.request().url().endsWith("/app.js")
    ? route.fulfill({ contentType: "application/javascript", body: hook })
    : route.fulfill({ contentType: "text/html", body: `<!doctype html><div id="root"></div><script src="/app.js"></script>` }));
  await page.goto("http://poll.fixture/");
  const calls = () => page.evaluate(() => window.__calls.length);
  // Step in 1s slices so each poll's promise chain settles before the next timer is due.
  const advance = async ms => { for (let t = 0; t < ms; t += 1000) await page.clock.runFor(Math.min(1000, ms - t)); };
  await page.waitForFunction(() => window.__calls.length >= 1);
  await advance(120_000);
  results.idleTwoMinutes = await calls() - 1;
  await page.evaluate(() => { window.__tasks = [{ id: "t1", status: "processing" }]; return window.__refresh(); });
  const woke = await calls();
  await advance(20_000);
  results.activeTwentySeconds = await calls() - woke;
  await page.evaluate(() => { window.__tasks = [{ id: "t1", status: "completed" }]; });
  await advance(4_500);
  const settled = await calls();
  await advance(60_000);
  results.afterCompletionMinute = await calls() - settled;
  await page.evaluate(() => window.__setHidden(true));
  const hiddenStart = await calls();
  await advance(600_000);
  results.hiddenTenMinutes = await calls() - hiddenStart;
  await page.evaluate(() => window.__setHidden(false));
  await page.clock.runFor(100);
  results.onReturn = await calls() - hiddenStart;
  await context.close();

  // ---------- collaboration members / presence (CollaborationClient) ----------
  const client = await bundle(`
    import { CollaborationClient } from ${JSON.stringify(path.join(src, "components/collaboration/collaboration-client.ts").replaceAll("\\", "/"))};
    ${visibility}
    window.__client = new CollaborationClient(async () => ({ authorization: "Bearer a@fixture.test" }));
    window.__client.setAccount("a@fixture.test");`);
  const assets = new Map([["/", { type: "text/html", body: `<!doctype html><script src="/client.js"></script>` }], ["/client.js", { type: "application/javascript", body: client }]]);
  const fixture = await startFixture(assets);
  try {
    const tab = await (await browser.newContext()).newPage();
    await tab.goto(fixture.origin + "/");
    await tab.waitForFunction(() => window.__client.snapshot().connected);
    await new Promise(resolve => setTimeout(resolve, 500));
    const count = (pathname, method = "GET") => fixture.calls.filter(c => c.actor === "a@fixture.test" && c.path === pathname && c.method === method).length;
    const members0 = count("/api/collaboration/members");
    for (let i = 0; i < 10; i++) { fixture.emit(["members"]); await new Promise(resolve => setTimeout(resolve, 300)); }
    await new Promise(resolve => setTimeout(resolve, 3_500));
    results.memberReloadsForTenFlips = count("/api/collaboration/members") - members0;
    const members1 = count("/api/collaboration/members");
    fixture.emit(["members"]); await new Promise(resolve => setTimeout(resolve, 300));
    await tab.evaluate(() => window.__client.open({ section: "members" }));
    await new Promise(resolve => setTimeout(resolve, 3_000));
    results.panelOpenReload = count("/api/collaboration/members") - members1;
    const presence0 = count("/api/collaboration/presence", "POST");
    for (let i = 0; i < 5; i++) { await tab.evaluate(() => window.__setHidden(true)); await new Promise(r => setTimeout(r, 100)); await tab.evaluate(() => window.__setHidden(false)); await new Promise(r => setTimeout(r, 100)); }
    await new Promise(resolve => setTimeout(resolve, 500));
    results.presencePostsForFiveSwitches = count("/api/collaboration/presence", "POST") - presence0;
  } finally { fixture.closeStreams?.(); await fixture.close?.(); }

  console.log(JSON.stringify(results));
  // Old loop: 30 idle polls in 2 minutes; now 4 (every 30s).
  ok(results.idleTwoMinutes <= 5, `idle polls in 2 min: ${results.idleTwoMinutes}`);
  ok(results.activeTwentySeconds >= 4 && results.activeTwentySeconds <= 6, `active polls in 20s: ${results.activeTwentySeconds}`);
  ok(results.afterCompletionMinute <= 3, `polls in the minute after completion: ${results.afterCompletionMinute}`);
  ok(results.hiddenTenMinutes === 0, `hidden polls: ${results.hiddenTenMinutes}`);
  ok(results.onReturn === 1, `catch-up on return: ${results.onReturn}`);
  ok(results.memberReloadsForTenFlips === 1, `member reloads for 10 events: ${results.memberReloadsForTenFlips}`);
  ok(results.panelOpenReload === 1, `open members panel refreshes a stale list: ${results.panelOpenReload}`);
  ok(results.presencePostsForFiveSwitches === 0, `presence posts for 5 quick window switches: ${results.presencePostsForFiveSwitches}`);
  console.log(`POLLING_LOAD=PASS CHECKS=${checks}`);
} finally { await browser.close(); }
