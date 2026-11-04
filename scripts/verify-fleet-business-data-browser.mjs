/** Real Next/Chromium rendering with finite, explicit retained-snapshot fixtures.
 * Successful synthetic responses do not exercise production business admission.
 * The parent starts an isolated Next server. This runner never starts a server,
 * connects to production, changes balances, or invokes a provider.
 */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const remote = "47105059-0142-4000-8000-000000000047";
const sameEmail = "designer@example.test";
const asOf = "2026-11-04T08:00:00.000Z";
function snapshot(id, query) {
  const local = id === "local", credits = local ? 7 : 42, balance = local ? 93 : 458;
  const user = { email: sameEmail, name: local ? "林岚" : "周亦", role: "user", plan: "pro", banned: false, balance, creditsTotal: balance, creditsUsed: 0, credits, operations: local ? 1 : 6, lastUsedAt: asOf };
  return {
    schemaVersion: 1, view: query.view, asOf: query.asOf, from: new Date(Date.parse(query.asOf) - query.days * 86400_000).toISOString(), observedAt: asOf, timeZone: "Asia/Shanghai", scope: "site", page: query.page, pageSize: 30, total: 1,
    totals: { credits, operations: user.operations, activeUsers: 1, balance, users: 1, artworks: local ? 2 : 18, paidOrders: 1, paidAmount: local ? 1800 : 12800, refundCredits: local ? 0 : 5, administrativeDebits: local ? 0 : 12 },
    users: ["usage", "users", "overview"].includes(query.view) ? [user] : [],
    daily: ["usage", "overview"].includes(query.view) ? [{ date: "2026-11-02", credits: local ? 0 : 12, operations: local ? 0 : 2 }, { date: "2026-11-03", credits: local ? 2 : 20, operations: local ? 1 : 3 }, { date: "2026-11-04", credits: local ? 5 : 10, operations: 1 }] : [],
    orders: query.view === "orders" ? [{ id: "order-" + id, email: sameEmail, title: "积分充值", kind: "credits", credits: local ? 180 : 1280, amount: local ? 1800 : 12800, status: "paid", createdAt: asOf, paidAt: asOf }] : [],
    ledger: query.view === "ledger" ? [{ id: "ledger-" + id, email: sameEmail, kind: "consume", delta: -credits, reason: "图片生成", createdAt: asOf }] : [],
    creations: query.view === "creations" ? [{ id: "artwork-" + id, email: sameEmail, title: local ? "产品白底图" : "商品主图", createdAt: asOf, projectKey: "product-20261104", type: "image", status: "completed" }] : [],
  };
}

async function main(file) {
  const config = JSON.parse(await fs.readFile(file, "utf8")), origin = new URL(config.origin);
  assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname) && origin.protocol === "http:" && origin.port && origin.pathname === "/", "ISOLATED_LOOPBACK_ORIGIN_REQUIRED");
  assert.ok(path.isAbsolute(config.outputDir), "ABSOLUTE_OUTPUT_REQUIRED");
  const output = config.outputDir; await fs.mkdir(output, { recursive: true });
  const record = { layer: "isolated-real-next-browser-finite-retained-snapshot-fixture", publicBusinessAdmission: "not-exercised-finite-response-fixture", result: "RUNNING", screenshots: [], assertions: [], pageErrors: [], requests: [], blockedWrites: [], paidSupplierCalls: 0, SSH: 0, businessDatabaseWrites: 0 };
  const browser = await chromium.launch({ headless: true, ...(config.channel === "chromium" ? {} : { channel: config.channel || "msedge" }) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
    if (config.cookieFile) {
      const raw = (await fs.readFile(config.cookieFile, "utf8")).trim();
      await context.addCookies(raw.split(";").map(value => value.trim()).filter(Boolean).map(value => { const at = value.indexOf("="); assert.ok(at > 0); return { name: value.slice(0, at), value: value.slice(at + 1), url: origin.origin, httpOnly: true, sameSite: "Lax" }; }));
    } else if (config.passwordFile) {
      const password = (await fs.readFile(config.passwordFile, "utf8")).trim();
      const login = await context.request.post(origin.origin + "/api/admin/login", { data: { password } }); assert.equal(login.status(), 200);
    }
    let mode = "pending", lastQuery, requests = 0;
    const sites = [{ id: "local", name: "103 平台", kind: "local", enabled: true, lastSeen: null }, { id: remote, name: "47 企业站", kind: "enterprise", enabled: true, lastSeen: asOf }];
    const make = (query, selection, pending = false) => {
      const selected = sites.filter(site => selection === "all" || site.id === selection);
      return { requestId: "fixture-bound-request", query, sites, sources: selected.map(site => ({ id: site.id, name: site.name, kind: site.kind,
        ...(site.id === remote && mode === "unknown" ? { status: "unknown", error: "数据连接器待更新" } : site.id === remote && pending ? { status: "pending" } : { status: "succeeded", data: snapshot(site.id, query) }) })), complete: !pending && mode !== "unknown" };
    };
    let selection = "all";
    await context.route("**/api/admin/business**", async route => {
      const request = route.request(); requests++;
      if (mode === "denied") return route.fulfill({ status: 403, contentType: "text/plain", body: "denied" });
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        assert.ok(["all", "local", remote].includes(body.site));
        assert.ok(["usage", "users", "orders", "ledger", "creations"].includes(body.view));
        selection = body.site;
        lastQuery = { type: "business.query", view: body.view, days: body.days, asOf, page: body.page, search: body.search, ...(body.email ? { email: body.email } : {}) };
        record.requests.push({ method: "POST", ...body });
      } else { assert.equal(new URL(request.url()).searchParams.get("requestId"), "fixture-bound-request"); record.requests.push({ method: "GET" }); }
      const pending = mode === "pending" && request.method() === "POST";
      if (mode === "pending" && !pending) mode = "complete";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(make(lastQuery, selection, pending)) });
    });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith("/api/admin/business") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) { record.blockedWrites.push({ method: request.method(), path: url.pathname }); return route.abort("blockedbyclient"); }
      return route.fallback();
    });
    const page = await context.newPage(); page.on("pageerror", error => record.pageErrors.push(error.message));
    async function capture(name) {
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const destination = path.join(output, name); await page.screenshot({ path: destination, fullPage: true });
      const bytes = await fs.readFile(destination); assert.ok(bytes.length > 1000); record.screenshots.push({ path: destination, bytes: bytes.length });
    }
    const metric = name => page.locator(`[data-metric="${name}"]`);
    await page.goto(origin.origin + "/admin/usage", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "用户用量", exact: true })).toBeVisible();
    await expect(metric("消费积分")).toHaveText("—"); record.assertions.push("pending_remote_is_not_zero_or_local_total");
    await expect(metric("消费积分")).toHaveText("49", { timeout: 20_000 });
    await expect(metric("退回积分")).toHaveText("5");
    await expect(metric("当前余额")).toHaveText("551");
    await expect(page.locator("[data-account-identity]")).toHaveCount(2);
    const keys = await page.locator("[data-account-identity]").evaluateAll(rows => rows.map(row => row.getAttribute("data-account-identity")));
    assert.equal(new Set(keys).size, 2); record.assertions.push("same_email_keeps_two_site_identities", "complete_consumption_7_plus_42_equals_49", "refund_separate_and_balance_current");
    await expect(page.getByRole("img", { name: "各站点每日实际消费积分" })).toBeVisible();
    await capture("all-sites-desktop.png");
    await page.getByRole("combobox", { name: "数据站点" }).selectOption(remote);
    await expect(metric("消费积分")).toHaveText("42");
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect.poll(() => record.requests.filter(request => request.method === "POST" && request.refresh === true).length).toBeGreaterThan(0);
    record.assertions.push("source_picker_selects_47", "manual_refresh_requests_fresh_asof");
    for (const label of ["用户", "订单", "账务", "作品"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.getByRole("region", { name: label + "明细", exact: true })).toBeVisible();
      await expect(page.locator("tbody[data-source-id]")).toHaveCount(1);
      await expect(page.locator("tbody[data-source-id]")).toContainText(label === "订单" ? "积分充值" : label === "账务" ? "图片生成" : label === "作品" ? "商品主图" : sameEmail);
    }
    record.assertions.push("five_business_views_render_readonly");
    await expect(page.getByRole("button", { name: /调整积分|提交充值|提交退款|停用用户/ })).toHaveCount(0);
    await page.getByRole("button", { name: "积分消耗", exact: true }).click();
    await page.getByRole("combobox", { name: "数据站点" }).selectOption("all");
    await expect(metric("消费积分")).toHaveText("49");
    record.assertions.push("rapid_view_and_source_changes_merge_latest_url");
    mode = "unknown"; await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(metric("消费积分")).toHaveText("—");
    await expect(page.getByRole("status").filter({ hasText: "47 企业站：数据连接器待更新" })).toBeVisible();
    await expect(page.locator('[data-source-id="local"] [data-account-identity]')).toHaveCount(1);
    await expect(page.locator(`[data-source-id="${remote}"] [data-account-identity]`)).toHaveCount(0);
    record.assertions.push("unknown_remote_keeps_global_unknown_and_local_evidence", "unknown_is_not_zero");
    await capture("unknown-source-desktop.png");
    mode = "denied"; await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(page.locator('main[data-fleet-business="true"]').getByRole("alert")).toContainText("当前账号没有跨站数据访问权限");
    await expect(page.locator("[data-account-identity]")).toHaveCount(0); record.assertions.push("permission_failure_clears_previous_authorized_snapshot");
    mode = "complete"; await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(metric("消费积分")).toHaveText("49");
    for (const [section, view, heading] of [["overview", "usage", "运营概览"], ["users", "users", "用户管理"], ["orders", "orders", "充值订单"], ["ledger", "ledger", "积分流水"], ["artworks", "creations", "作品数据"]]) {
      await page.goto(origin.origin + "/admin/center?section=" + section, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.locator("main[data-fleet-business=true]")).toBeVisible();
      await expect.poll(() => record.requests.filter(request => request.method === "POST").at(-1)?.view).toBe(view);
      await expect(page.locator("main[data-fleet-business=true] a[href]").filter({ hasText: section === "users" ? "本站用户管理" : "103 详细分析" })).toHaveAttribute("href", `/admin/center?section=${section}&detail=local`);
      if (section === "users") {
        await page.getByRole("button", { name: "积分消耗", exact: true }).click();
        await expect(metric("消费积分")).toHaveText("49");
        assert.equal(new URL(page.url()).searchParams.get("view"), "usage");
      }
    }
    record.assertions.push("five_existing_center_entries_dispatch_cross_site_views", "native_local_analysis_and_user_management_links_preserved", "initial_user_entry_can_switch_back_to_consumption");
    await page.goto(origin.origin + "/admin/usage", { waitUntil: "domcontentloaded" });
    await expect(metric("消费积分")).toHaveText("49");
    await page.setViewportSize({ width: 390, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await capture("all-sites-mobile.png"); record.assertions.push("390px_document_has_no_horizontal_overflow");
    await page.setViewportSize({ width: 1440, height: 1080 }); await capture("all-sites-desktop-final.png");
    assert.equal(record.pageErrors.length, 0, record.pageErrors.join("\n"));
    record.result = "PASS"; record.requestCount = requests;
    await fs.writeFile(path.join(output, "BROWSER_RESULT.json"), JSON.stringify(record, null, 2) + "\n");
    console.log(`FLEET_BUSINESS_DATA_BROWSER=PASS assertions=${record.assertions.length} UI_SSH=0 BUSINESS_WRITES=0 PAGE_ERRORS=0`);
  } catch (error) {
    record.result = "FAIL"; record.error = error instanceof Error ? error.message : String(error);
    await fs.writeFile(path.join(output, "BROWSER_RESULT.json"), JSON.stringify(record, null, 2) + "\n"); throw error;
  } finally { await browser.close(); }
}

if (!process.argv[2]) { console.error("Usage: node scripts/verify-fleet-business-data-browser.mjs ABS_CONFIG.json"); process.exitCode = 2; }
else main(path.resolve(process.argv[2])).catch(error => { console.error(error.message); process.exitCode = 1; });
