import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect as baseExpect } from "@playwright/test";

async function main() {
  const live = Boolean(process.env.MODEL_MANAGEMENT_BROWSER_COOKIE_FILE);
  if (!live && process.env.NAUMI_VERIFY_ISOLATED_DB !== "1") throw Error("Requires isolated fixture or protected staging session");
  const origin = live ? "http://120.27.162.85" : (process.env.NAUMI_MODEL_UI_BASE_URL||"http://127.0.0.1:54989");
  const out = `output/colleague-integration-20261010/${live ? "live" : "local"}`;
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const expect = baseExpect.configure({ timeout: 45000 });
  try {
    if (live) await context.addCookies(JSON.parse(await readFile(process.env.MODEL_MANAGEMENT_BROWSER_COOKIE_FILE!, "utf8")));
    else assert.equal((await context.request.post(origin + "/api/admin/login", { data: { password: "MvpFixture2026!" } })).status(), 200);
    const get = async (path: string) => { const r = await context.request.get(origin + path); assert.equal(r.status(), 200, path); return r.json(); };
    const before = await get("/api/admin/bi/model-config");
    const pricesResponse = await context.request.get(origin + "/api/admin/billing/image25-prices");
    assert.equal(pricesResponse.status(), 200);
    assert.match(pricesResponse.headers()["cache-control"], /private.*no-store/);
    const prices = await pricesResponse.json();
    assert.equal(prices.rows.length, 45); assert.equal(prices.liveBillingChanged, false);
    const anonymous = await browser.newContext();
    try {
      for (const cookie of ["", "nv_admin=forged", "nv_user=forged"]) {
        assert.equal((await anonymous.request.get(origin + "/api/admin/billing/image25-prices", { headers: { cookie } })).status(), 404);
        const denied = await anonymous.request.get(origin + "/admin/billing/price-table", { headers: { cookie }, maxRedirects: 0 });
        assert.equal(denied.status(), 307);
        assert.ok(denied.headers().location.endsWith("/admin?next=%2Fadmin%2Fbilling%2Fprice-table"));
      }
      for (const path of ["/plans", "/pricing"])
        assert.equal((await anonymous.request.get(origin + path)).status(), 404, "Public research pricing remains closed");
    } finally { await anonymous.close(); }
    assert.equal((await context.request.post(origin + "/api/admin/billing/image25-prices", { data: {} })).status(), 405);
    const page = await context.newPage(), errors: string[] = [];
    let writes = 0;
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/**", route => {
      if (route.request().method() === "GET") return route.continue();
      writes++; return route.fulfill({ status: 409, json: { error: "Read-only acceptance" } });
    });
    await page.goto(origin + "/admin/billing/price-table");
    const rows = page.locator('tbody tr[data-testid^="price-row-"]');
    await expect(rows).toHaveCount(45);
    await expect(page.getByLabel("显示币种", { exact: true })).toHaveValue("CNY");
    await page.getByLabel("实际模型", { exact: true }).selectOption("gpt-image-2.5-sunburst");
    await page.getByLabel("参考价格档", { exact: true }).selectOption("platinum");
    await page.getByLabel("分辨率", { exact: true }).selectOption("4k");
    await page.getByLabel("比例", { exact: true }).selectOption("1:1");
    await page.getByLabel("原生质量", { exact: true }).selectOption("medium");
    await expect(rows).toHaveCount(1);
    const cell = prices.rows.find((r: any) => r.resolution === "4k" && r.ratio === "1:1").prices.medium.platinum;
    await expect(rows).toContainText("¥" + cell.saleCny);
    await page.getByLabel("显示币种", { exact: true }).selectOption("USD");
    await expect(rows).toContainText("$0.1014372");
    await page.getByRole("button", { name: "刷新价格表", exact: true }).click();
    await expect(rows).toHaveCount(1); await expect(rows).toContainText("$0.1014372");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载价格明细", exact: true }).click();
    const file = out + "/prices.json"; await (await downloaded).saveAs(file);
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.equal(saved.rows.length, 1); assert.equal(saved.selectedModel, "gpt-image-2.5-sunburst");
    assert.equal(saved.selectedTier, "platinum"); assert.equal(saved.liveBillingChanged, false);
    await page.screenshot({ path: out + "/price-table-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: out + "/price-table-mobile.png" });
    assert.deepEqual(await get("/api/admin/bi/model-config"), before);
    assert.equal(writes, 0); assert.deepEqual(errors, []);
    const version = await get("/api/version");
    await writeFile(out + "/result.json", JSON.stringify({ pass: true, version, configUnchanged: true, paidCalls: 0, publicPricingClosed: true }, null, 2));
    console.log("COLLEAGUE_PRICE_UI=PASS AUTH=200_404 WRITE=405 FILTERS_CURRENCY_REFRESH_DOWNLOAD_MOBILE=PASS PUBLIC_PRICING=CLOSED CONFIG_UNCHANGED=1 PAID_CALLS=0");
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
