/** Repeated focus/minute refreshes in a real browser (Playwright clock, loopback routes):
 * the actual SiteVersion (+AnnouncementButton) and the actual browser model catalog.
 * Proves release notes download once per published version (not on every version
 * check/focus) and model catalogs reload on window return at most once a minute,
 * while a new version or an explicit refresh still reloads.
 * Run: node scripts/verify-refresh-throttle.mjs [--source-root <dir>] */
import path from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const root = path.resolve(arg("--source-root") || "."), src = path.join(root, "src");
const stubs = {
  "next/navigation": `export const usePathname = () => "/canvas"; export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });`,
  "auth-context": `export const useAuth = () => ({ user: { email: "a@b.c" }, ready: true });`,
  "supabase": `export const authHeader = async () => ({});`,
};
const stubPlugin = { name: "stubs", setup(b) {
  b.onResolve({ filter: /^next\/navigation$|(^|\/)auth-context$|(^|\/)supabase$/ }, args => ({ path: Object.keys(stubs).find(k => args.path.endsWith(k)), namespace: "stub" }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "js" }));
  // Class names are irrelevant to request counting.
  b.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: "css" }));
  b.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "export default new Proxy({}, { get: (_, key) => String(key) });", loader: "js" }));
} };
const bundle = async contents => (await build({ stdin: { contents, loader: "tsx", resolveDir: root }, bundle: true, write: false, format: "iife", jsx: "automatic",
  platform: "browser", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_BUILD_VERSION": '"1793974025"', "process.env": "{}" }, alias: { "@": src }, plugins: [stubPlugin], logLevel: "silent" }))
  .outputFiles[0].text;
const p = rel => JSON.stringify(path.join(src, rel).replaceAll("\\", "/"));

let browser; try { browser = await chromium.launch({ headless: true }); } catch { browser = await chromium.launch({ channel: "msedge", headless: true }); }
const results = {}; let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
async function open(script, api) {
  const context = await browser.newContext(), page = await context.newPage(), hits = {};
  page.on("pageerror", error => console.error("PAGE_ERROR", String(error)));
  await page.clock.install({ time: new Date("2026-11-07T08:00:00Z") });
  await page.route("http://refresh.fixture/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/app.js") return route.fulfill({ contentType: "application/javascript", body: script });
    if (url.pathname.startsWith("/api/")) { hits[url.pathname] = (hits[url.pathname] || 0) + 1; return route.fulfill({ json: api(url) }); }
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="zh-CN"><div id="root"></div><script src="/app.js"></script></html>` });
  });
  await page.goto("http://refresh.fixture/");
  const advance = async ms => { for (let t = 0; t < ms; t += 1000) await page.clock.runFor(Math.min(1000, ms - t)); };
  const focus = () => page.evaluate(() => window.dispatchEvent(new Event("focus")));
  return { context, page, hits, advance, focus };
}

try {
  // ---------- SiteVersion: release notes per version ----------
  let published = "1793974025";
  const site = await open(await bundle(`
    import { createRoot } from "react-dom/client";
    import { LocaleProvider } from ${p("lib/i18n/locale-context.tsx")};
    import { SiteVersion } from ${p("components/site-version.tsx")};
    createRoot(document.getElementById("root")).render(<LocaleProvider initialLocale="zh"><SiteVersion /></LocaleProvider>);`),
    url => url.pathname === "/api/version" ? { version: published } : { version: url.searchParams.get("version"), entries: [] });
  await site.advance(2_000);
  for (let minute = 0; minute < 5; minute++) { await site.focus(); await site.advance(60_000); }
  results.versionChecks = site.hits["/api/version"] || 0;
  results.notesSameVersion = site.hits["/api/release-notes"] || 0;
  published = "1793974099";
  await site.advance(61_000);
  results.notesAfterNewVersion = (site.hits["/api/release-notes"] || 0) - results.notesSameVersion;
  await site.context.close();

  // ---------- browser model catalog: focus reloads ----------
  const catalog = await open(await bundle(`
    import { activeFeatureCatalog, activateFeatureCatalogIdentity } from ${p("lib/model-config/feature-catalog-browser.ts")};
    activeFeatureCatalog().subscribe("image.generate", () => {});
    // The real AuthProvider path: an identity transition reloads every subscribed catalog.
    activateFeatureCatalogIdentity("a@b.c");`),
    () => ({ feature: "image.generate", managed: true, version: 1, models: [], defaultModelId: null }));
  await catalog.advance(1_000);
  const first = catalog.hits["/api/models"] || 0;
  for (let i = 0; i < 10; i++) { await catalog.focus(); await catalog.advance(3_000); }
  results.modelReloadsTenFocusIn30s = (catalog.hits["/api/models"] || 0) - first;
  await catalog.advance(60_000); await catalog.focus(); await catalog.advance(500);
  results.modelReloadAfterMinute = (catalog.hits["/api/models"] || 0) - first - results.modelReloadsTenFocusIn30s;
  await catalog.context.close();

  console.log(JSON.stringify(results));
  ok(results.versionChecks >= 6, `version still checked each minute/focus: ${results.versionChecks}`);
  ok(results.notesSameVersion === 1, `release notes for one version: ${results.notesSameVersion}`);
  ok(results.notesAfterNewVersion === 1, `new version downloads its notes: ${results.notesAfterNewVersion}`);
  ok(results.modelReloadsTenFocusIn30s === 0, `model reloads for 10 focus events in 30s: ${results.modelReloadsTenFocusIn30s}`);
  ok(results.modelReloadAfterMinute === 1, `reload on return after a minute: ${results.modelReloadAfterMinute}`);
  console.log(`REFRESH_THROTTLE=PASS CHECKS=${checks}`);
} finally { await browser.close(); }
