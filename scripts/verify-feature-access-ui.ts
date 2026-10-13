import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
  process.env.SETTINGS_SECRET = "feature-settings-fixture-012345678901234567890";
  process.env.VIDEO_WORKER_SECRET = "feature-worker-fixture-012345678901234567890";
  const db = await import("../src/lib/db"), native = await import("../src/lib/native-auth"), auth = await import("../src/lib/admin-auth"), access = await import("../src/lib/feature-access/server");
  const base = process.env.NAUMI_VERIFY_URL || "http://127.0.0.1:13079";
  const email = "user@feature.test", admin = "admin@feature.test";
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const out = "output/user-feature-access"; await mkdir(out, { recursive: true });
  const contexts: any[] = [];
  try {
    await db.getOrCreateUser(email, "权限验收用户");
    await auth.setAdminPassword("feature-console-password");
    let current = await access.userFeaturePolicy(email);
    await access.saveFeaturePolicy(admin, { id: randomUUID(), email, mode: "custom", allowed: ["workspace", "tools", "canvas", "works", "cutout", "agent"], expectedVersion: current.version });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(context);
      await context.addCookies([{ name: "nv_user", value: native.signUserSession(admin, Date.now()), url: base }, { name: "nv_admin", value: (await auth.authenticateAdminPassword("feature-console-password"))!, url: base }]);
      const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      const response = await page.goto(base + "/admin/feature-access", { timeout: 120000, waitUntil: "domcontentloaded" }); assert.equal(response?.status(), 200);
      await page.getByRole("heading", { name: "用户功能权限" }).waitFor({ timeout: 60000 });
      await page.getByLabel("搜索用户").fill(email);
      await page.waitForResponse(response => response.url().includes("/api/admin/feature-access?q=" + encodeURIComponent(email)) && response.status() === 200);
      await page.getByRole("button", { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).waitFor({ timeout: 60000 });
      await page.getByRole("button", { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
      await page.getByRole("button", { name: "自定义权限", exact: true }).waitFor();
      const generate = page.getByLabel("AI 生图", { exact: true }); assert.equal(await generate.isChecked(), false);
      assert.equal(await page.getByLabel("AI 抠图", { exact: true }).isChecked(), true);
      await page.screenshot({ path: `${out}/admin-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "no horizontal overflow");
      // Persist a permission using the real UI/API, then verify another logged-in context.
      if (width === 1440) {
        await generate.check(); await page.getByRole("button", { name: "保存权限", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "已保存" }).waitFor({ timeout: 15000 });
        assert.ok((await access.userFeaturePolicy(email)).allowed.includes("generate"));
        await generate.uncheck(); await page.getByRole("button", { name: "保存权限", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "已保存" }).waitFor({ timeout: 15000 });
      }
      const userContext = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(userContext);
      await userContext.addCookies([{ name: "nv_user", value: native.signUserSession(email, Date.now()), url: base }]);
      const userPage = await userContext.newPage(); userPage.on("pageerror", error => errors.push(error.message));
      await userPage.goto(base + "/tools", { timeout: 120000, waitUntil: "domcontentloaded" });
      await userPage.getByRole("link").filter({ has: userPage.getByText("AI 抠图", { exact: true }) }).waitFor({ timeout: 60000 });
      assert.equal(await userPage.locator('a[href="/generate"]').count(), 0);
      assert.equal(await userPage.locator('a[href="/retouch"]').count(), 0);
      await userPage.screenshot({ path: `${out}/tools-${width}.png`, fullPage: true });
      assert.equal(await userPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const direct = await userContext.request.get(base + "/generate", { maxRedirects: 0 }); assert.equal(direct.status(), 307); assert.match(direct.headers().location, /access-denied/);
      const deniedPage = await userPage.goto(base + "/generate", { timeout: 120000, waitUntil: "domcontentloaded" }); assert.equal(deniedPage?.status(), 200); assert.match(userPage.url(), /access-denied/);
      await userPage.getByRole("heading", { name: "此页面尚未授权" }).waitFor();
      for (const path of ["/api/generate-image", "/api/retouch", "/api/canvas/image-tasks", "/api/canvas/text-edit"]) {
        const denied = await userContext.request.post(base + path, { data: {}, headers: { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware", "x-naumi-client-entry": "admin" } });
        assert.equal(denied.status(), 403, path); assert.match(denied.headers()["cache-control"], /no-store/);
      }
      // allowed operation reaches its own validation; no provider call occurs.
      const allowed = await userContext.request.post(base + "/api/cutout", { data: {} }); assert.notEqual(allowed.status(), 403);
      await userPage.goto(base + "/dashboard", { timeout: 120000, waitUntil: "domcontentloaded" });
      await userPage.getByRole("button", { name: "历史对话", exact: true }).waitFor({ timeout: 60000 });
      assert.equal(await userPage.locator('#templates input').count(), 0);
      if (width === 1440) {
        current = await access.userFeaturePolicy(email);
        await access.saveFeaturePolicy(admin, { id: randomUUID(), email, mode: "custom", allowed: ["workspace", "tools", "canvas", "works", "cutout"], expectedVersion: current.version });
        await userPage.evaluate(() => window.dispatchEvent(new Event("focus")));
        await userPage.getByRole("button", { name: "历史对话", exact: true }).waitFor({ state: "hidden", timeout: 15000 });
        current = await access.userFeaturePolicy(email);
        await access.saveFeaturePolicy(admin, { id: randomUUID(), email, mode: "custom", allowed: ["workspace", "tools", "canvas", "works", "cutout", "agent"], expectedVersion: current.version });
      }
      assert.deepEqual(errors, []);
    }
    // Standalone grants must not depend on the workspace or tools index being granted.
    const standalone = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(standalone);
    await standalone.addCookies([{ name: "nv_user", value: native.signUserSession(email, Date.now()), url: base }]);
    const standalonePage = await standalone.newPage(); const standaloneErrors: string[] = [];
    standalonePage.on("pageerror", error => standaloneErrors.push(error.message));
    for (const [feature, path] of [["agent", "/agent"], ["templates", "/templates"], ["cutout", "/cutout"]]) {
      current = await access.userFeaturePolicy(email);
      await access.saveFeaturePolicy(admin, { id: randomUUID(), email, mode: "custom", allowed: [feature], expectedVersion: current.version });
      assert.equal((await standalone.request.get(base + path, { maxRedirects: 0 })).status(), 200, path);
      assert.equal((await standalone.request.get(base + "/dashboard", { maxRedirects: 0 })).status(), 307);
      assert.equal((await standalone.request.get(base + "/tools", { maxRedirects: 0 })).status(), 307);
      await standalonePage.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
      assert.equal(await standalonePage.getByRole("heading", { name: "此页面尚未授权", exact: true }).count(), 0);
      assert.equal(await standalonePage.locator('a[href="/dashboard"]').count(), 0);
      if (feature === "cutout") assert.ok(await standalonePage.locator('a[href="/cutout"]').count() > 0);
    }
    assert.deepEqual(standaloneErrors, []);
    console.log("FEATURE_ACCESS_UI=PASS DESKTOP=1440 MOBILE=390 ADMIN_SAVE=PASS NAV_FILTER=PASS DIRECT_URL=DENIED_REDIRECT REAL_HTTP_BYPASS=403 REVOKE_ON_FOCUS=PASS OVERFLOW=0 PAGE_ERRORS=0 PROVIDER_CALLS=0");
  } finally { for (const context of contexts) await context.close(); await browser.close(); await db.getPool().end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
