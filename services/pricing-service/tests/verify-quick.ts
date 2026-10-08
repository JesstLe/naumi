import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { PricingStore } from "../store";
import { createPricingServer } from "../server";
import { prepareQuickPreset, initialConfig, type Catalog } from "../core";

async function main() {
  const catalogPath = resolve("services/pricing-service/catalog.json"), catalog: Catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const config = initialConfig(catalog), dir = mkdtempSync(join(tmpdir(), "naumi-quick-")), db = join(dir, "pricing.sqlite");
  const preset = { publicId: "mvp-image", label: "MVP 生图", supplier: "apimart", actualModel: "gpt-image-2.5-flare", spec: { resolution: "4K", ratio: "1:1", quality: "medium" } };
  const prepared = prepareQuickPreset(config, catalog, preset);
  assert.equal(prepared.preview.costCny, "0.249144000");
  assert.equal(prepared.preview.suggestedSaleCny, "0.747432000");
  assert.equal(prepared.preview.costScope, "output-only");
  assert.equal(prepared.preview.productionApplied, false);
  assert.equal(prepared.preview.credits, null);
  assert.equal(config.aliases.length, 4, "preview must not mutate live config");
  for (const model of catalog.native.models) for (const row of catalog.native.output_reference_matrix) for (const quality of ["low", "medium", "high", "xhigh", "max"]) {
    const r = prepareQuickPreset(config, catalog, { ...preset, actualModel: model, spec: { resolution: row.resolution.toUpperCase(), ratio: row.size, quality } });
    assert.equal(r.preview.suggestedSaleCny, r.preview.saleCny);
    assert.equal(r.preview.actualModel, model);
  }
  assert.throws(() => prepareQuickPreset(config, catalog, { ...preset, supplier: "unverified" }));
  assert.throws(() => prepareQuickPreset(config, catalog, { ...preset, actualModel: "similar-guessed-id" }));
  assert.throws(() => prepareQuickPreset(config, catalog, { ...preset, spec: { ...preset.spec, ratio: "7:5" } }));
  assert.throws(() => prepareQuickPreset(config, catalog, { ...preset, saleCny: "-1" }));
  assert.throws(() => prepareQuickPreset(config, catalog, { ...preset, upstreamVersion: "flare" }));
  const ext = { ...preset, actualModel: "gpt-image-2.5-ext", upstreamVersion: "sunburst" };
  const e = prepareQuickPreset(config, catalog, ext);
  assert.equal(e.preview.effective.quality, undefined); assert.equal(e.preview.saleCny, "0.441000000");
  assert.equal(e.preview.costScope, "full-call-estimate");
  assert.equal(prepareQuickPreset(config, catalog, { ...preset, saleCny: "0" }).preview.saleCny, "0.000000000");
  const points = prepareQuickPreset(config, catalog, { ...preset, saleCny: "0.75", creditsPerCny: "10", rounding: "ceil" });
  assert.equal(points.preview.credits, "8"); assert.equal(points.config.creditConversion?.creditsPerCny, "10");
  assert.equal(points.preview.creditsUnrounded, "7.500000000");assert.equal(points.preview.cnyPerCredit, "0.100000000");
  const custom = prepareQuickPreset(config, catalog, { ...preset, saleCny: "0.75", creditsPerCny: "20", rounding: "ceil" });
  assert.equal(custom.preview.credits, "15");assert.equal(custom.preview.cnyPerCredit, "0.050000000");
  assert.equal(prepareQuickPreset(config, catalog, { ...preset, saleCny: "0.75", creditsPerCny: "10", rounding: "floor" }).preview.credits, "7");
  assert.equal(prepareQuickPreset(config, catalog, { ...preset, saleCny: "0.75", creditsPerCny: "10", rounding: "nearest" }).preview.credits, "8");
  assert.equal(prepareQuickPreset(config, catalog, { ...preset, saleCny: "0.123456", creditsPerCny: "12.5", rounding: "ceil" }).preview.creditsUnrounded, "1.543200000");
  for (const creditsPerCny of ["0", "-1", "", "NaN", "0.0000001"]) assert.throws(() => prepareQuickPreset(config, catalog, { ...preset, creditsPerCny }));
  assert.throws(() => prepareQuickPreset(config, catalog, { ...preset, rounding: "floor" }));
  assert.equal(prepareQuickPreset(config, catalog, { ...preset, saleCny: "0", creditsPerCny: "10" }).preview.credits, "0");
  const cap = prepareQuickPreset({ ...config, qualityPolicy: "cap-medium" }, catalog, { ...preset, saleCny: "0.75", creditsPerCny: "10", spec: { ...preset.spec, quality: "max" } });
  assert.equal(cap.preview.effective.quality, "medium");assert.equal(cap.preview.saleCny, "0.750000000");

  let store = new PricingStore(db, catalogPath);
  const token = "test-local-token-1234567890", server = createPricingServer(store, token);
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (path: string, body?: unknown, key?: string) => {
    const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await fetch(base + "/v1/mvp/catalog")).status, 401);
    assert.equal((await fetch(base + "/v1/mvp/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
    const c = await call("/v1/mvp/catalog"); assert.equal(c.status, 200); assert.equal(c.data.suppliers[0].models.length, 4);
    assert.equal(c.data.accountAvailabilityVerified, false);assert.equal(c.data.checkedDate, catalog.checked_date);
    const preview = await call("/v1/mvp/preview", preset);assert.equal(preview.status, 200);assert.equal(store.snapshot().version, 1);
    const bad = await call("/v1/mvp/apply", { expectedVersion: 1, expectedRevision: 1, preset: { ...preset, actualModel: "fake" } });assert.equal(bad.status, 400);assert.equal(store.snapshot().version, 1);assert.equal(store.upstreamState().version, 1);
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
    const faultDb = new DatabaseSync(db);
    faultDb.exec("CREATE TRIGGER reject_ack BEFORE INSERT ON simulated_upstream BEGIN SELECT RAISE(ABORT, 'fixture ACK rejected'); END;");
    assert.equal((await call("/v1/mvp/apply", { expectedVersion: 1, expectedRevision: 1, preset })).status, 400);
    assert.equal(store.snapshot().version, 1);assert.equal(store.draft().revision, 1);assert.equal(store.history().length, 1);assert.equal(store.upstreamState().version, 1);
    faultDb.exec("DROP TRIGGER reject_ack;");faultDb.close();
    const result = await call("/v1/mvp/apply", { expectedVersion: 1, expectedRevision: 1, preset: { ...preset, saleCny: "0.9", creditsPerCny: "10", rounding: "ceil" } });
    assert.equal(result.status, 200);assert.equal(result.data.current.version, 2);assert.equal(result.data.upstream.version, 2);
    assert.equal(result.data.upstream.digest, result.data.current.digest);assert.equal(result.data.upstream.realUpstreamApplied, false);
    const req = { publicId: preset.publicId, expectedVersion: 2 };
    const sim = await call("/v1/mvp/simulate", req, "same-request");assert.equal(sim.status, 200);
    assert.equal(sim.data.quote.saleCny, "0.900000000");assert.equal(sim.data.quote.credits, "9");assert.equal(sim.data.payload.model, preset.actualModel);assert.equal(sim.data.payload.resolution, "4k");assert.equal(sim.data.payload.size, "1:1");assert.equal(sim.data.payload.quality, "medium");assert.equal(sim.data.realApiCalled, false);
    const replay = await call("/v1/mvp/simulate", req, "same-request");assert.equal(replay.data.quote.id, sim.data.quote.id);assert.equal(replay.data.quote.replayed, true);
    assert.equal((await call("/v1/mvp/apply", { expectedVersion: 1, expectedRevision: 1, preset })).status, 409);
    assert.equal((await call("/v1/mvp/simulate", { ...req, expectedVersion: 1 }, "stale")).status, 409);
    assert.equal((await call("/v1/mvp/simulate", req)).status, 400);
    const d = store.draft();store.saveDraft({ ...d.config, multiplier: "4" }, d.revision, "fixture");
    assert.equal((await call("/v1/mvp/apply", { expectedVersion: 2, expectedRevision: store.draft().revision, preset })).status, 409, "quick apply must preserve unpublished draft");
    assert.equal(store.snapshot().version, 2);
    const rolled = store.rollback(2, 2, "discard draft fixture", "fixture");assert.equal(rolled.version, 3);assert.equal(store.upstreamState().version, 3);
    const change = await call("/v1/mvp/apply", { expectedVersion: 3, expectedRevision: store.draft().revision, preset: { ...ext, creditsPerCny: "20", rounding: "ceil" } });assert.equal(change.status, 200);
    const newSim = await call("/v1/mvp/simulate", { ...req, expectedVersion: 4 }, "ext-request");assert.equal(newSim.data.payload.version, "sunburst");assert.equal(newSim.data.payload.quality, undefined);assert.equal(newSim.data.quote.saleCny, "0.441000000");
    assert.equal(store.getQuote(sim.data.quote.id).saleCny, "0.900000000");assert.equal(store.getQuote(sim.data.quote.id).configVersion, 2);
    assert.equal(newSim.data.quote.credits, "9");assert.equal(newSim.data.quote.creditConversion.creditsPerCny, "20");
    assert.equal(store.getQuote(sim.data.quote.id).creditConversion.creditsPerCny, "10");assert.equal(store.getQuote(sim.data.quote.id).credits, "9");
    const rest = store.rollback(2, 4, "restore native fixture", "fixture");assert.equal(rest.version, 5);assert.equal(store.upstreamState().digest, rest.digest);
  } finally { await new Promise<void>(r => server.close(() => r()));store.close(); }
  store = new PricingStore(db, catalogPath);
  assert.equal(store.snapshot().version, 5);assert.equal(store.upstreamState().version, 5);assert.equal(store.snapshot().config.aliases.find(a => a.publicId === preset.publicId)?.supplier, "apimart");
  assert.equal(store.snapshot().config.fixedSales["mvp-image|4K|1:1|medium"], "0.9");
  assert.equal(store.snapshot().config.creditConversion?.creditsPerCny, "10");assert.equal(store.snapshot().config.creditConversion?.rounding, "ceil");store.close();
  assert.ok(resolve(dir).startsWith(resolve(tmpdir())) && dir.split(/[\\/]/).pop()!.startsWith("naumi-quick-"));rmSync(dir, { recursive: true, force: true });
  console.log("QUICK_MVP_PASS: 450 native previews; custom 10/20/12.5 credits-per-CNY; 0.75 CNY => 8/15 credits; ceil/floor/nearest; exact unrounded credits; zero/invalid rates; atomic apply; version freeze; persistence; rollback; no paid calls");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
