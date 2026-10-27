import { expandManagedModelConfig } from "./model-mapping-ui-helpers";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect as baseExpect } from "@playwright/test";
import { compactImageModelOptions } from "../src/lib/image-model-routing";

async function main() {
  const live = Boolean(process.env.MODEL_MANAGEMENT_BROWSER_COOKIE_FILE);
  if (!live && process.env.NAUMI_VERIFY_ISOLATED_DB !== "1") throw Error("Requires isolated fixture or protected staging session");
  const origin = live ? "http://120.27.162.85" : (process.env.NAUMI_MODEL_UI_BASE_URL||"http://127.0.0.1:54989");
  const out = `output/stable-model-order-20261009/${live ? "live" : "local"}`;
  await mkdir(out, { recursive: true });
  const fixture = live ? null : JSON.parse(await readFile("output/model-management-fixture/fixture.json", "utf8"));
  const expect = baseExpect.configure({ timeout: 45000 });
  const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let lastPublication: number | undefined, before: any, blocked = 0;
  const errors: string[] = [];
  const get = async (path: string) => { const r = await context.request.get(origin + path); assert.equal(r.status(), 200); return r.json(); };
  try {
    if (live) await context.addCookies(JSON.parse(await readFile(process.env.MODEL_MANAGEMENT_BROWSER_COOKIE_FILE!, "utf8")));
    else {
      assert.equal((await context.request.post(origin + "/api/admin/login", { data: { password: "MvpFixture2026!" } })).status(), 200);
      await context.addCookies([{ name: "nv_user", value: fixture.memberCookie, domain: "127.0.0.1", path: "/" }]);
    }
    await context.addCookies([{ name: "naumi_locale", value: "zh", url: origin }]);
    before = await get("/api/admin/bi/model-config");
    const state = await get("/api/admin/model-management"), labels = state.rows.map((r: any) => r.label);
    const first = state.rows.find((r: any) => r.modality === "image" && r.features.some((f: any) => f.id === "image.generate"));
    assert.ok(first);
    const page = await context.newPage(); page.setDefaultTimeout(45000); page.on("pageerror", e => errors.push(e.message));
    await page.goto(origin + "/admin/model-management");
    const headings = page.locator("article").getByRole("heading");
    await expect(headings).toHaveText(labels);
    const row = page.locator("article").filter({ has: page.getByRole("heading", { name: first.label, exact: true }) });
    const saveScope = async (enabled: boolean) => {
      await expandManagedModelConfig(row);await row.getByRole("button", { name: "编辑范围", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "选择应用工具", exact: true });
      await dialog.getByRole("checkbox", { name: "自由生图", exact: true }).setChecked(enabled);
      const response = page.waitForResponse(r => r.url().endsWith("/api/admin/model-management") && r.request().method() === "POST" && r.request().postDataJSON()?.action === "scope");
      await dialog.getByRole("button", { name: "保存范围并生效", exact: true }).click();
      const r = await response, result = await r.json();
      assert.equal(r.status(), 200); assert.equal(result.publication.phase, "applied"); lastPublication = result.publication.version;
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText(`模型配置 v${lastPublication}`, { exact: true })).toBeVisible();
      await expect(headings).toHaveText(labels);
      assert.deepEqual((await get("/api/admin/model-management")).rows.map((r: any) => r.id), state.rows.map((r: any) => r.id));
    };
    await saveScope(false);
    assert.ok(!(await get("/api/config")).imageModels.some((m: any) => first.publicIds.includes(m.id)));
    await page.screenshot({ path: out + "/scope-off-order.png", animations: "disabled" });
    await page.reload(); await expect(headings).toHaveText(labels);
    await saveScope(true); await page.reload(); await expect(headings).toHaveText(labels);
    await page.screenshot({ path: out + "/scope-on-order.png", animations: "disabled" });

    const config = await get("/api/config"), display = compactImageModelOptions(config.imageModels);
    assert.ok(display.length >= 2);
    const ui = await context.newPage(); ui.setDefaultTimeout(45000); ui.on("pageerror", e => errors.push(e.message));
    await ui.route("**/api/**", async route => {
      if (route.request().method() !== "GET" && /generate|image-tasks/.test(new URL(route.request().url()).pathname)) { blocked++; return route.fulfill({ status: 409, json: { error: "No paid generation during order verification" } }); }
      return route.continue();
    });
    await ui.goto(origin + "/generate"); await ui.waitForLoadState("networkidle");
    const modelButton = ui.getByText("生图模型", { exact: true }).locator("..").getByRole("combobox");
    const menu = ui.getByRole("listbox");
    const menuOrder = async () => { await modelButton.click(); await expect(menu).toBeVisible(); return (await menu.getByRole("option").allInnerTexts()).map(t => t.split("\n")[0].trim()); };
    const expected = display.map(m => m.supportsEdit ? m.label : `${m.label} · 仅文生图`);
    assert.deepEqual(await menuOrder(), expected);
    await menu.getByRole("option").last().click();
    assert.deepEqual(await menuOrder(), expected);
    await ui.screenshot({ path: out + "/selected-menu-order.png", animations: "disabled" });
    await ui.reload(); await ui.waitForLoadState("networkidle");
    assert.deepEqual(await menuOrder(), expected);
    await ui.setViewportSize({ width: 390, height: 844 }); await ui.screenshot({ path: out + "/mobile-order.png", animations: "disabled" });
    assert.equal(errors.length, 0, errors.join("\n")); assert.equal(blocked, 0);
    if (fixture) assert.equal((await (await context.request.get(fixture.control + "/stats")).json()).paid, 0);
  } finally {
    try {
      if (lastPublication !== undefined) {
        const current = await get("/api/admin/bi/model-config");
        assert.equal(current.snapshot.version, lastPublication, "Do not overwrite someone else's later configuration");
        const r = await context.request.post(origin + "/api/admin/bi/model-config/versions", { data: { id: randomUUID(), targetVersion: before.snapshot.version, expectedVersion: lastPublication, reason: "Restore original model configuration after order acceptance" } });
        assert.equal(r.status(), 200); const restored = await r.json(); assert.equal(restored.phase, "applied");
        const after = await get("/api/admin/bi/model-config");
        assert.deepEqual(after.snapshot.config, before.snapshot.config); assert.deepEqual(after.draft, before.draft); assert.deepEqual(after.billingSnapshot, before.billingSnapshot);
        await writeFile(out + "/restored.json", JSON.stringify({ modelVersion: after.snapshot.version, billingVersion: after.billingSnapshot.version, originalConfigRestored: true, draftPreserved: true, realPaidGeneration: 0 }));
        console.log(`RESTORED_MODEL_VERSION=${after.snapshot.version} PRICES_AND_DRAFT_UNCHANGED=PASS`);
      }
    } finally { await browser.close(); }
  }
  console.log("MODEL_ORDER_UI=PASS SCOPE_OFF_ON_RELOAD=PASS SELECTION_AND_CACHE_NO_PROMOTION=PASS MOBILE=PASS REAL_PAID_GENERATION=0");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
