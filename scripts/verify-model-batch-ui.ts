import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { batchFeatureAvailability } from "../src/lib/model-config/batch";
import { FEATURE_LABELS } from "../src/lib/billing/labels";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1") throw Error("isolated DB required");
  const origin = "http://127.0.0.1:54980", f = JSON.parse(await readFile("output/model-ui-fixture.json", "utf8"));
  await mkdir("output/model-batch-20261007", { recursive: true });
  const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined, headless: true });
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), member = await browser.newContext();
  try {
    await admin.addCookies([{ name: "naumi_locale", value: "zh", domain: "127.0.0.1", path: "/" }]);
    assert.equal((await admin.request.post(origin + "/api/admin/login", { data: { password: "ModelUiFixture2026!" } })).status(), 200);
    const read = async () => (await admin.request.get(origin + "/api/admin/bi/model-config")).json();
    const initial = await read(), available = batchFeatureAvailability(initial.draft.config, "u1").filter(a => a.compatible).map(a => a.feature);
    assert.ok(available.includes("canvas.image") && available.includes("tool.garment"));
    const page = await admin.newPage(), errors: string[] = []; page.setDefaultTimeout(45000); page.on("pageerror", e => errors.push(e.message));
    await page.goto(origin + "/admin/billing"); await page.getByTestId("model-batch-editor").waitFor();
    await page.getByLabel("实际供应商 / 上游模型", { exact: true }).selectOption("u1");
    await page.getByLabel("前端公开模型 ID", { exact: true }).fill("batch-ext25");
    await page.getByLabel("前端展示名称", { exact: true }).fill("灵动批量 2.5");
    await page.getByLabel("基础售价（人民币元 / 成功单位）", { exact: true }).fill("0.65");
    await expect(page.getByTestId("batch-price-example")).toContainText("65 积分");
    await page.getByRole("button", { name: "全选兼容功能", exact: true }).click();
    assert.equal(await page.getByTestId("model-batch-editor").locator('input[type="checkbox"]:checked').count(), available.length + 1);
    await expect(page.getByLabel(FEATURE_LABELS["tool.upscale"], { exact: false })).toBeDisabled();
    await page.getByRole("button", { name: "预览批量变更", exact: true }).click();
    await page.getByRole("button", { name: "确认批量修改草稿", exact: true }).click();
    assert.equal((await read()).snapshot.version, initial.snapshot.version, "draft edit cannot activate");
    const publish = async (reason: string) => {
      await page.getByRole("button", { name: "校验并预览发布差异", exact: true }).click(); await page.getByRole("dialog").waitFor();
      await page.getByLabel("发布 / 恢复原因", { exact: true }).fill(reason);
      await page.getByRole("button", { name: "确认发布此草稿", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
      await expect(page.getByRole("status").filter({ hasText: "已确认生效" })).toBeVisible();
    };
    await publish("isolated model batch / real Go Router acceptance");
    const first = await read(); assert.equal(first.snapshot.version, initial.snapshot.version + 1);
    for (const id of available) { const b = first.snapshot.config.business[id]; assert.equal(b.defaultModelId, "batch-ext25"); assert.equal(b.options.find((o: any) => o.modelId === "batch-ext25").pricing.amountMicros, "650000"); }
    assert.deepEqual(first.snapshot.config.bindings, initial.snapshot.config.bindings);
    await page.reload(); await page.getByTestId("model-batch-editor").waitFor();
    await page.getByRole("button", { name: "功能计费与路由", exact: true }).click();
    await page.getByLabel("选择工具 / 画布操作").selectOption("tool.garment");
    await page.getByLabel("用户售价（人民币元 / 成功单位）", { exact: true }).fill("0.9");
    await publish("isolated garment price exception");
    await page.getByRole("button", { name: "模型批量配置", exact: true }).click();
    await page.getByLabel("配置方式").selectOption("existing"); await page.getByLabel("复用公开模型", { exact: true }).selectOption("batch-ext25");
    await page.getByLabel("前端展示名称", { exact: true }).fill("灵动批量 2.5 更新");
    await page.getByRole("button", { name: "全选兼容功能", exact: true }).click(); await page.getByRole("button", { name: "预览批量变更", exact: true }).click();
    await expect(page.getByText("保留此模型原价格", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: "output/model-batch-20261007/batch-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "output/model-batch-20261007/batch-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "确认批量修改草稿", exact: true }).click(); await publish("isolated batch preserves price exception");
    const final = await read(); assert.equal(final.snapshot.config.business["tool.garment"].options[0].pricing.amountMicros, "900000");
    await member.addCookies([{ name: "nv_user", value: f.userCookie, domain: "127.0.0.1", path: "/" }, { name: "naumi_locale", value: "zh", domain: "127.0.0.1", path: "/" }]);
    for (const feature of ["tool.garment", "canvas.image", "canvas.expand", "image.generate"]) {
      const response = await member.request.get(origin + "/api/models?feature=" + feature); assert.equal(response.status(), 200);
      const catalog = await response.json(); assert.equal(catalog.defaultModelId, "batch-ext25"); assert.equal(catalog.models[0].label, "灵动批量 2.5 更新"); assert.equal(catalog.models[0].id, "batch-ext25"); assert.ok(!JSON.stringify(catalog).includes("wire-image-one"));
    }
    for (const [feature, credits] of [["image.generate", 65], ["tool.garment", 90]] as const) {
      const q = await member.request.post(origin + "/api/billing/quote", { data: { feature, modelId: "batch-ext25", quantity: 1 } }); assert.equal(q.status(), 200); assert.equal((await q.json()).credits, credits);
    }
    const user = await member.newPage(); await user.goto(origin + "/garment"); await expect(user.getByLabel("tool.garment 模型", { exact: true })).toContainText("灵动批量 2.5 更新");
    assert.equal((await member.request.put(origin + "/api/admin/bi/model-config/draft", { data: {} })).status(), 404);
    assert.equal((await member.request.post(origin + "/api/admin/bi/model-config", { data: {} })).status(), 404);
    const metrics = await (await fetch(f.controlOrigin + "/fixture/metrics")).json(); assert.equal(metrics.generationRequests, 0); assert.ok(metrics.activations >= 3);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(`BATCH_BROWSER=PASS COMPATIBLE_FEATURES=${available.length} DRAFT_ONLY=PASS REAL_GO_ROUTER=PASS EXCEPTION_PRICE=90 BASE_PRICE=65 RELOAD=PASS TOOL_SELECTOR=PASS CANVAS_CATALOG=PASS MOBILE=PASS NON_ADMIN=404 PAID_POSTS=0`);
  } finally { await admin.close(); await member.close(); await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
