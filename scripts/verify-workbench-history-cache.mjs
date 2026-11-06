/** Workbench local image history in a real browser (Playwright, loopback routes only).
 * Proves: first paint is not gated on downloads, each image is fetched once even when
 * the display path joins, a cached project reopens with zero image requests, the image
 * copy is bounded (oldest first; current project and templates kept), and failures back off.
 * Run: node scripts/verify-workbench-history-cache.mjs */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const root = process.cwd(), origin = "http://wb.fixture";
const read = name => fs.readFile(path.join(root, "services/reference-workbench/static", name), "utf8");
const [environment, history] = await Promise.all([read("workbench-environment.js"), read("workbench-history.js")]);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const page = `<!doctype html><meta charset="utf-8"><script>window.__NAUMI_WORKBENCH__={};</script><script src="/env.js"></script><script src="/history.js"></script>`;

let browser;
try { browser = await chromium.launch({ headless: true }); } catch { browser = await chromium.launch({ channel: "msedge", headless: true }); }
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const requests = new Map(), delays = new Map(), missing = new Set();
const count = name => requests.get(name) || 0;

async function open(context) {
  await context.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: page });
    if (url.pathname === "/env.js") return route.fulfill({ contentType: "application/javascript", body: environment });
    if (url.pathname === "/history.js") return route.fulfill({ contentType: "application/javascript", body: history });
    if (url.pathname === "/api/reference-workbench/auth/status") return route.fulfill({ json: { ok: true, id: "fixture" } });
    if (url.pathname === "/api/reference-workbench/image") {
      const name = url.searchParams.get("path"); requests.set(name, count(name) + 1);
      if (missing.has(name)) return route.fulfill({ status: 404, json: { error: "missing" } });
      const delay = delays.get(name) || 0; if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return route.fulfill({ contentType: "image/png", body: png });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  const tab = await context.newPage(); const errors = [];
  tab.on("pageerror", error => errors.push(String(error)));
  await tab.goto(origin + "/");
  return { tab, errors };
}
const image = name => `/api/reference-workbench/image?path=${encodeURIComponent(name)}`;
const rows = names => [{ ref_path: "ref-a", ref_url: image(names[0]), product_urls: [image(names[1])], versions: names.slice(2).map((name, i) => ({ path: "v" + i, url: image(name), meta: {} })) }];
const remember = (tab, root, data) => tab.evaluate(async ([root, data]) => {
  const started = performance.now(), result = await WorkbenchHistory.remember(root, data);
  return { ms: performance.now() - started, result };
}, [root, data]);

try {
  const context = await browser.newContext();
  const { tab, errors } = await open(context);

  // 1. Slow images: remember returns within the hydrate budget, not after the downloads.
  for (const name of ["slow-1", "slow-2", "slow-3"]) delays.set(name, 4000);
  const first = await remember(tab, "root-1", rows(["slow-1", "slow-2", "slow-3"]));
  ok(first.ms < 3000, `first paint waited ${first.ms}ms`);
  const item = first.result[0];
  ok(item.ref_url.startsWith("/api/reference-workbench/image?path=slow-1"), "missing image keeps the page's own endpoint");
  eq(item.local_cached, false, "not yet cached");
  eq(item.versions[0].local_url, undefined, "no local url before download");

  // 2. The display path (bridge -> localUrl) joins the same download.
  const joined = await tab.evaluate(url => WorkbenchHistory.localUrl(url), image("slow-1"));
  ok(joined.startsWith("blob:"), "display path resolves a local blob");
  await tab.waitForTimeout(500);
  const second = await remember(tab, "root-1", rows(["slow-1", "slow-2", "slow-3"]));
  ok(second.result[0].ref_url.startsWith("blob:") && second.result[0].versions[0].local_url.startsWith("blob:"), "later refresh swaps in local copies");
  eq(second.result[0].local_cached, true, "cached badge once every image is local");
  eq([count("slow-1"), count("slow-2"), count("slow-3")], [1, 1, 1], "each image fetched once");

  // 3. Reopen in a new tab (same profile): zero image requests, blob URLs straight away.
  const reopened = await context.newPage();
  await reopened.goto(origin + "/");
  const before = [...requests.values()].reduce((a, b) => a + b, 0);
  const third = await remember(reopened, "root-1", rows(["slow-1", "slow-2", "slow-3"]));
  ok(third.result[0].ref_url.startsWith("blob:") && third.ms < 1500, `cached reopen ${third.ms}ms`);
  eq([...requests.values()].reduce((a, b) => a + b, 0), before, "no image requests on cached reopen");
  await reopened.close();

  // 4. Failed images back off instead of being re-requested every refresh.
  missing.add("gone");
  await remember(tab, "root-2", rows(["gone", "slow-2", "slow-3"]));
  await remember(tab, "root-2", rows(["gone", "slow-2", "slow-3"]));
  await remember(tab, "root-2", rows(["gone", "slow-2", "slow-3"]));
  eq(count("gone"), 1, "404 image requested once within the retry window");

  // 5. Bound: seed more rows than the row budget; the oldest unprotected rows go,
  //    the current project's images and the local-only templates stay.
  await tab.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open("naumi-reference-workbench-history-v1-fixture", 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(["images", "templates"], "readwrite"), store = tx.objectStore("images");
    for (let i = 0; i < 3010; i++) store.put({ key: `/api/reference-workbench/image?path=old-${i}`, blob: new Blob(["x"], { type: "image/png" }), savedAt: i + 1 });
    tx.objectStore("templates").put({ key: "tpl-1", template: { id: "tpl-1" }, savedAt: 1 });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
  delays.clear();
  await remember(tab, "root-3", rows(["fresh-1", "fresh-2", "fresh-3"]));
  await tab.waitForTimeout(9500);
  const after = await tab.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open("naumi-reference-workbench-history-v1-fixture"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const read = (store, method, arg) => new Promise(resolve => { const r = db.transaction(store).objectStore(store)[method](arg); r.onsuccess = () => resolve(r.result); });
    const result = { count: await read("images", "count"), oldest: !!(await read("images", "get", "/api/reference-workbench/image?path=old-0")),
      newest: !!(await read("images", "get", "/api/reference-workbench/image?path=old-3009")), fresh: !!(await read("images", "get", "/api/reference-workbench/image?path=fresh-1")),
      template: !!(await read("templates", "get", "tpl-1")) };
    db.close(); return result;
  });
  ok(after.count <= 3000, `bounded rows ${after.count}`);
  eq([after.oldest, after.newest, after.fresh, after.template], [false, true, true, true], "evicts oldest, keeps newest, current project and templates");
  eq(errors, [], "no page errors");
  await context.close();
  console.log(`WORKBENCH_HISTORY_CACHE=PASS CHECKS=${checks}`);
} finally { await browser?.close(); }
