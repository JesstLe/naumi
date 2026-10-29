import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import sharp from "sharp";
import type { ImagegenRequest, ImagegenResult } from "../src/lib/imagegen/types";

// This fixture uses the real plan/child/route/SDK/persistence/billing path. Only
// the supplier and media HTTP endpoints are replaced by an owned loopback server.
const arg = (name: string) => { const n = process.argv.indexOf(name); return n < 0 ? undefined : process.argv[n + 1]; };
const root = resolve(arg("--source-root") || process.cwd());
const baseline = process.argv.includes("--baseline");
const load = (name: string): Promise<any> => import(pathToFileURL(join(root, name)).href);
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1", "isolated fixture opt-in required");
  assert.equal(new URL(process.env.DATABASE_URL || "http://invalid").hostname, "127.0.0.1");
  for (const [name, modulePath] of [["--runtime-file", "src/lib/model-config/image-plan-runtime.ts"], ["--adapter-file", "src/lib/model-config/apimart-preset.ts"]]) {
    const adapterFile = arg(name); if (!adapterFile) continue;
    // Load the exact saved adapter at its original module identity. All other
    // product modules stay real; no source file is overwritten for a baseline.
    const filename = join(root, modulePath);
    const entry = new (Module as any)(filename);
    entry.filename = filename; entry.paths = (Module as any)._nodeModulePaths(dirname(filename));
    createRequire(join(root, "package.json")).cache[filename] = entry;
    entry._compile(ts.transpileModule(await readFile(resolve(adapterFile), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText, filename);
    entry.loaded = true;
  }

  process.env.MEDIA_DIR = await mkdtemp(join(tmpdir(), "naumi-mapping-single-pass-"));
  process.env.STORAGE_DRIVER = "local";
  const png = await sharp({ create: { width: 2048, height: 2048, channels: 3, background: "#ddd6fe" } }).png().toBuffer();
  const wireModel = "fixture-apimart-mapping";
  const posts: Record<string, any>[] = [], taskGets: string[] = [];
  const tasks = new Map<string, { model: string; complete: boolean }>();
  const reservationSnapshots: { reserved: number; quoted: number[]; qualities: string[]; resolutions: string[] }[] = [];
  let db: typeof import("../src/lib/db") | undefined, owner = "", origin = "", blockedNetwork = 0;
  const { createModelFixture } = await load("scripts/model-config-fixture.ts");
  const fixture = await createModelFixture(async (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    try {
      const url = new URL(req.url || "/", origin);
      res.setHeader("content-type", "application/json");
      if (url.pathname.startsWith("/media/")) {
        assert.equal(req.headers.authorization, undefined);
        res.setHeader("content-type", "image/png"); res.end(png); return;
      }
      if (url.pathname.startsWith("/v1/tasks/")) {
        const id = decodeURIComponent(url.pathname.split("/").at(-1)!); taskGets.push(id);
        const task = tasks.get(id); assert.ok(task, "poll must use saved supplier task ID");
        res.end(JSON.stringify({ data: { id, model: task.model, status: task.complete ? "completed" : "processing", cost: "0.01",
          ...(task.complete ? { result: { images: [{ url: [origin + "/media/" + id + ".png"] }] } } : {}) } })); return;
      }
      assert.equal(url.pathname, "/v1/images/generations"); assert.equal(req.method, "POST");
      assert.ok(req.headers["idempotency-key"]); assert.equal(req.headers["x-apimart-response-version"], "2026-07-27");
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); assert.equal(body.model, wireModel); posts.push(body);
      const rows = (await db!.getPool().query("SELECT reserved_credits,quote FROM app_billing_operations WHERE email=$1 AND feature IN ('canvas.image','image.generate') AND state='reserved'", [owner])).rows;
      reservationSnapshots.push({ reserved: rows.reduce((n, r) => n + r.reserved_credits, 0), quoted: rows.map(r => r.quote.requestedCredits),
        qualities: rows.map(r => r.quote.facts.quality), resolutions: rows.map(r => r.quote.facts.resolution) });
      const id = "mapping-task-" + posts.length; tasks.set(id, { model: body.model, complete: false });
      res.end(JSON.stringify({ data: [{ task_id: id }] }));
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
  });
  origin = fixture.origin;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin) { blockedNetwork++; throw new Error("Fixture blocked external request: " + url.origin); }
    return nativeFetch(input, init);
  };
  process.env.PGOPTIONS = `-c search_path=${fixture.schemaName}`;
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", NAUMI_ROUTER_MANAGEMENT_URL: origin,
    NAUMI_ROUTER_MANAGEMENT_TOKEN: "single-pass-isolated-router-token", MODEL_CONFIG_ENVELOPE_SECRET: "single-pass-isolated-envelope-secret",
    MODEL_CONFIG_TRUSTED_ORIGINS: origin, OPENAI_API_KEY: "single-pass-fixture-only" });
  fixture.config.providers[0].protocol = "apimart-images";
  const source = fixture.config.upstreamModels[0]; source.model = wireModel;
  source.parameterMap = {
    qualityPolicy: { mode: "map", choices: [{ id: "high", label: "高", value: "medium" }, { id: "medium", label: "标准", value: "low" }] },
    resolutionPolicy: { mode: "map", field: "resolution", ratioField: "size", values: { "1K": "1k", "2K": "2k", "4K": "2k" } },
    apimartImages: { schemaVersion: 1, ratios: ["1:1"], maxOutputs: 1, supportsMask: false, outputDimensions: { "2K:1:1": { width: 2048, height: 2048 } } },
  };
  fixture.config.publicModels[0].displayResolutions = ["1K", "2K", "4K"];
  let checks = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };
  const waitFor = async (predicate: () => Promise<boolean>, message: string) => {
    for (let n = 0; n < 400; n++) { if (await predicate()) return; await pause(100); }
    throw new Error(message);
  };
  try {
    await fixture.repo.current();
    db = await load("src/lib/db.ts"); await db!.ensureSchema();
    owner = `single-pass-${randomUUID()}@example.test`; await db!.getOrCreateUser(owner, "Single-pass fixture");
    const { getModelAdministration } = await load("src/lib/model-config/server.ts"), admin = await getModelAdministration();
    const initialBilling = await admin.billing.current(), billingConfig = structuredClone(initialBilling.config);
    billingConfig.switches.metering = "on";
    for (const feature of ["canvas.image", "image.generate"] as const) {
      billingConfig.features[feature].enabled = true;
      billingConfig.features[feature].pricing = { mode: "quality-resolution", quality: { low: 1, medium: 2, high: 6, xhigh: 8, max: 10, auto: 2 }, resolutionExtra: { "1K": 0, "2K": 2, "4K": 6, "5K": 10 } };
      billingConfig.features[feature].rules = [];
      billingConfig.features[feature].settlement.qualityBasis = "requested";
    }
    // A fixture-only versioned tariff makes high/4K=12 distinct from the wire
    // medium/2K=4. This does not alter a live account or production pricing.
    await admin.billing.publish({ id: randomUUID(), actor: "single-pass-fixture", reason: "isolated raw-tier pricing contrast", expectedVersion: initialBilling.version, config: billingConfig });
    const { createBillingService, withBillingTransaction } = await load("src/lib/billing/service.ts");
    await withBillingTransaction(db!.getPool(), (tx: any) => createBillingService().grantTx(tx, { id: randomUUID(), email: owner, amount: 100,
      source: "admin", reason: "isolated mapping fixture", expiry: { unit: "years", value: 1 }, ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture" }));
    const { imagegenRequestSchema } = await load("src/lib/imagegen/schema.ts");
    const { planImagegen, imagegenFingerprint } = await load("src/lib/imagegen/plan.ts");
    const { submitImagegen, getImagegenResult } = await load("src/lib/imagegen/dispatch.ts");
    const requests: ImagegenRequest[] = [], receipts: ImagegenResult[] = [];
    for (const quality of (baseline ? ["high"] : ["high", "medium"]) as ("high" | "medium")[]) {
      const before = posts.length, requestedCredits = quality === "high" ? 12 : 8;
      const request = imagegenRequestSchema.parse({ version: 1, operationId: randomUUID(), entry: "canvas", mode: "generate", modelId: "image-a",
        prompt: "single pass purple bottle " + quality, parameters: { quality, resolution: "4K", ratio: "1:1" } });
      const original = JSON.stringify(request), plan = await planImagegen(request, owner);
      eq(JSON.stringify(request), original, "planning retains raw input"); eq(plan.fingerprint, imagegenFingerprint(request), "fingerprint remains raw");
      eq(plan.totalCredits, requestedCredits, "selected tier price");
      const quoted = plan.steps[0].billingQuote!, savedQuote = JSON.stringify(quoted);
      eq(quoted.facts.quality, quality, "price uses semantic quality"); eq(quoted.facts.resolution, "4K", "price uses requested 4K");
      eq(quoted.requestedCredits, requestedCredits, "original quote amount"); eq(quoted.reserveCredits, requestedCredits, "original reserve amount");
      eq(quoted.imageParameterPlans!.u1.wire.quality, quality === "high" ? "medium" : "low", "frozen map translates once");
      eq(quoted.imageParameterPlans!.u1.wire.resolution, "2k", "frozen wire is 2K");
      let receipt: ImagegenResult = await submitImagegen(request, owner, { billingVersion: plan.billingVersion, modelVersion: plan.modelVersion, credits: requestedCredits, confirmed: true });
      await waitFor(async () => { receipt = await getImagegenResult(request.operationId, owner); return posts.length > before || ["failed", "needs_attention"].includes(receipt.status); }, "child did not reach actual supplier adapter");
      if (posts.length !== before + 1) {
        console.error("FIXTURE_CHILD_FAILURE", JSON.stringify((await db!.getPool().query("SELECT snapshot->>'error' AS error,snapshot->'failureDiagnostic' AS diagnostic,snapshot->'paidOperations' AS paid,payload->'p'->>'quality' AS quality,payload->'billingQuote'->'facts' AS quote_facts FROM app_image_jobs WHERE kind='generate' AND email=$1",[owner])).rows));
      }
      eq(posts.length, before + 1, "one supplier POST per new child: " + JSON.stringify(receipt));
      const expectedWire = baseline && quality === "high" ? "low" : quality === "high" ? "medium" : "low";
      eq(posts[before].quality, expectedWire, "actual SDK request quality"); eq(posts[before].resolution, "2k", "actual SDK request resolution");
      eq(reservationSnapshots[before], { reserved: requestedCredits, quoted: [requestedCredits], qualities: [quality], resolutions: ["4K"] }, "real reserved ledger before supplier completion");
      tasks.get("mapping-task-" + posts.length)!.complete = true;
      await waitFor(async () => { receipt = await getImagegenResult(request.operationId, owner); return ["succeeded", "failed", "needs_attention"].includes(receipt.status); }, "parent did not finish");
      eq(receipt.status, "succeeded", JSON.stringify(receipt)); eq(receipt.chargedCredits, requestedCredits, "final raw-tier settlement");
      eq([receipt.artifacts[0].width, receipt.artifacts[0].height], [2048, 2048], "actual persisted output pixels");
      const { readCanvasOutput } = await load("src/lib/canvas-image-input.ts"), stored = await readCanvasOutput(receipt.artifacts[0].url, "http://internal", owner);
      const meta = await sharp(stored.buffer).metadata(); eq([meta.width, meta.height], [2048, 2048], "saved bytes decode");
      const supplier = (await db!.getPool().query("SELECT task_id,parameters FROM app_supplier_calls WHERE task_id=$1", ["mapping-task-" + posts.length])).rows[0];
      eq(supplier.parameters.acceptedOutputs, 1, "supplier result accepted once"); eq(supplier.parameters.upstream.quality, expectedWire, "durable wire audit");
      const auditPlan = supplier.parameters.parameterPlan;
      assert.ok(auditPlan, "actual supplier ledger records the parameter plan");
      if (!baseline) { eq(auditPlan.requested.quality, quality, "supplier plan audit retains semantic quality"); eq(auditPlan.wire.quality, expectedWire, "supplier plan audit agrees with actual wire"); }

      const replay = await submitImagegen(request, owner); await getImagegenResult(request.operationId, owner);
      eq(replay.jobId, receipt.jobId, "repeat uses original parent ID"); eq(posts.length, before + 1, "repeat creates no additional POST");
      eq(JSON.stringify(quoted), savedQuote, "accepted quote object stays unchanged");
      requests.push(request); receipts.push(receipt);
    }
    const settled = (await db!.getPool().query("SELECT state,charged_credits,reserved_credits,quote FROM app_billing_operations WHERE email=$1 AND feature IN ('canvas.image','image.generate') ORDER BY charged_credits DESC", [owner])).rows;
    eq(settled.map(r => ({ state: r.state, charged: r.charged_credits, reserved: r.reserved_credits })), baseline ? [{ state: "settled", charged: 12, reserved: 0 }] : [{ state: "settled", charged: 12, reserved: 0 }, { state: "settled", charged: 8, reserved: 0 }], "independent final settlements");
    eq(Number((await db!.getPool().query("SELECT COALESCE(sum(-delta),0) AS total FROM app_ledger WHERE email=$1 AND kind='consume'", [owner])).rows[0].total), baseline ? 12 : 20, "no double debit");
    eq(Number((await db!.getPool().query("SELECT count(*) AS n FROM app_gen_reservations WHERE email=$1", [owner])).rows[0].n), 0, "owned reservations released");
    eq(blockedNetwork, 0, "no external request attempted"); assert.ok(taskGets.length >= (baseline ? 1 : 2));
    console.log(`${baseline ? "BASELINE=REPRODUCED" : "MODIFIED=PASS"} APIMART_SINGLE_PASS_PG CHECKS=${checks} HIGH_WIRE=${posts[0].quality} MEDIUM_WIRE=${posts[1]?.quality ?? "NOT_RUN"} RAW=high/4K QUOTE=12 RESERVED=12 SETTLED=12 ACTUAL=2048x2048 SECOND_QUOTE=${baseline ? "NOT_RUN" : 8} SECOND_SETTLED=${baseline ? "NOT_RUN" : 8} SUPPLIER_PLAN_AUDIT=${baseline ? "OBSERVED" : "MATCHES_WIRE"} PLAN_CHILD_SDK_STORAGE_LEDGER=PASS ORIGINAL_ID_REPLAY_POSTS=0 LOOPBACK_POSTS=${posts.length} EXTERNAL_CALLS=0`);
  } finally {
    globalThis.fetch = nativeFetch;
    for (const task of tasks.values()) task.complete = true;
    if (db) await db.getPool().end();
    await fixture.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
