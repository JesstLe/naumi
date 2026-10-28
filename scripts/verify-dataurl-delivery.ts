/** Real routes, repository, PG, storage and recovery; a loopback supplier only.
 * Fault injection is confined to createModelFixture's disposable schema. */
import assert from "node:assert/strict";
import {randomUUID, createHash} from "node:crypto";
import {createServer} from "node:http";
import {mkdir, writeFile, readFile} from "node:fs/promises";
import {resolve, join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => { const i = args.indexOf(name); assert.ok(i >= 0 && args[i + 1], `${name} required`); return resolve(args[i + 1]); };
  const out = option("--output-root"), pngFile = option("--png");
  await mkdir(out, {recursive: true});
  const reportFile = join(out, "RESULT.json");
  await assert.rejects(readFile(reportFile), (e: NodeJS.ErrnoException) => e.code === "ENOENT", "Use a new output root");
  // Repository imports may initialize storage transitively. Freeze fixture I/O
  // configuration before createModelFixture imports any application module.
  Object.assign(process.env, {STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: join(out, "media"),
    NAUMI_NAS_DEFER_UPLOAD: "0", NAUMI_RELEASE_RUNTIME: "0", NAUMI_VIDEO_WORKER: "0",
    VIDEO_WORKER_SECRET: "fixture-dataurl-worker-independent-key-20261028"});
  const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  const large = await readFile(pngFile), metadata = await sharp(large).metadata();
  assert.equal(metadata.width, 1536); assert.equal(metadata.height, 2048);
  assert.ok(large.toString("base64").length > 6_500_000);
  const references = await Promise.all(["#63a871", "#eaa453"].map(background =>
    sharp({create: {width: 80, height: 96, channels: 3, background}}).png().toBuffer()));
  let calls = 0, externalAttempts = 0;
  const requests: {path: string; references: number}[] = [], checks: string[] = [];
  const originalFetch = globalThis.fetch, allowed = new Set<string>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!allowed.has(url.origin)) { externalAttempts++; throw Error("External network forbidden in delivery fixture"); }
    return originalFetch(input, init);
  };
  const f = await createModelFixture(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks); res.setHeader("content-type", "application/json");
      if (req.url?.includes("/images/")) {
        calls++; let references = 0;
        if (req.headers["content-type"]?.includes("multipart")) {
          const form = await new Request(f.origin + req.url, {method: "POST", headers: {"content-type": req.headers["content-type"]}, body}).formData();
          references = form.getAll("image[]").length || form.getAll("image").length;
        }
        requests.push({path: req.url, references});
        return res.end(JSON.stringify({data: [{b64_json: large.toString("base64")}]}));
      }
      res.statusCode = 404; res.end("{}");
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({error: String(error)})); }
  });
  allowed.add(f.origin);
  Object.assign(process.env, {PGOPTIONS: `-c search_path=${f.schemaName}`, NAUMI_MULTI_USER: "1",
    NAUMI_ROUTER_MANAGEMENT_URL: f.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-dataurl-router-token-independent-20261028",
    MODEL_CONFIG_ENVELOPE_SECRET: "fixture-dataurl-envelope-key-independent-20261028", MODEL_CONFIG_TRUSTED_ORIGINS: f.origin,
    OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: f.origin + "/v1", STORAGE_DRIVER: "local",
    MEDIA_PRIVATE: "1", MEDIA_DIR: join(out, "media"), NAUMI_NAS_DEFER_UPLOAD: "0",
    NAUMI_RELEASE_RUNTIME: "0", NAUMI_VIDEO_WORKER: "0"});
  f.config.upstreamModels[0].model = "gpt-image-2";
  f.config.upstreamModels[0].parameterMap.resolution = {};
  f.config.upstreamModels[0].capabilities.nativeResolutions = [];
  f.config.upstreamModels[0].capabilities.preserveIdentity = true;
  await f.repo.current();
  const db = await import("../src/lib/db");
  const gen = await import("../src/app/api/generate-image/route");
  const imagegen = await import("../src/app/api/imagegen/route");
  const plans = await import("../src/app/api/imagegen/plan/route");
  const recover = await import("../src/app/api/imagegen/recover-delivery/route");
  const {USER_COOKIE, signUserSession} = await import("../src/lib/native-auth");
  const {readManagedObject, MEDIA_DIR, privateMedia} = await import("../src/lib/storage");
  assert.equal(MEDIA_DIR, join(out, "media")); assert.equal(privateMedia, true);
  let origin = "";
  const app = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c));
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
      const request = new Request(new URL(req.url!, origin), {method: req.method, headers, ...(req.method === "POST" ? {body: Buffer.concat(chunks)} : {})});
      const handler = req.url?.startsWith("/api/imagegen/recover-delivery") ? recover.POST
        : req.url?.startsWith("/api/imagegen/plan") ? plans.POST
        : req.url?.startsWith("/api/generate-image") ? (req.method === "POST" ? gen.POST : gen.GET)
        : req.method === "POST" ? imagegen.POST : imagegen.GET;
      const response = await handler(request); res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({error: String(error)})); }
  });
  await new Promise<void>(r => app.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(app.address() as {port: number}).port}`; allowed.add(origin);
  process.env.INTERNAL_APP_ORIGIN = origin;
  const owner = `dataurl-${randomUUID()}@example.test`, other = `other-${randomUUID()}@example.test`;
  const check = (name: string, action: () => unknown) => { action(); checks.push(name); };
  const json = async (path: string, body?: unknown, actor = owner, expected = 200): Promise<any> => {
    const response = await fetch(origin + path, {method: body === undefined ? "GET" : "POST",
      headers: {origin, cookie: `${USER_COOKIE}=${signUserSession(actor, Date.now())}`,
        ...(body === undefined ? {} : {"content-type": "application/json"})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
  };
  const billing = async () => ({
    operations: (await db.getPool().query("SELECT row_to_json(b) row FROM app_billing_operations b WHERE email=$1 ORDER BY id", [owner])).rows,
    ledger: (await db.getPool().query("SELECT row_to_json(l) row FROM app_ledger l WHERE email=$1 ORDER BY id", [owner])).rows,
  });
  const loaded = await Promise.all(["src/lib/storage.ts", "src/lib/canvas-image-input.ts", "src/lib/imagegen/stored-delivery.ts",
    "src/lib/durable-image-jobs.ts", "src/lib/image-job-repository.ts", "src/lib/imagegen/dispatch.ts",
    "src/app/api/generate-image/route.ts", "src/app/api/imagegen/route.ts", "src/app/api/imagegen/recover-delivery/route.ts",
  ].map(async path => ({path: resolve(path), sha256: sha(await readFile(path))})));
  const report: Record<string, unknown> = {status: "FAIL", checks, loaded, requests, schema: f.schemaName,
    fixture: {path: pngFile, sha256: sha(large), bytes: large.length, width: 1536, height: 2048},
    faultInjection: "Only this disposable schema: remove output artwork and put its paid inline bytes in terminal child checkpoint"};
  try {
    await db.getOrCreateUser(owner, "Fixture"); await db.getOrCreateUser(other, "Other fixture");
    const {createBillingService, withBillingTransaction} = await import("../src/lib/billing/service");
    await withBillingTransaction(db.getPool(), tx => createBillingService().grantTx(tx, {id: randomUUID(), email: owner,
      amount: 500, source: "admin", reason: "isolated dataurl fixture", expiry: {unit: "years", value: 1},
      ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture"}));
    const refs = [randomUUID(), randomUUID()];
    for (const [index, id] of refs.entries()) await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','fixture','completed',$3,'','canvas')", [id, owner, `data:image/png;base64,${references[index].toString("base64")}`]);
    const request = {version: 1, operationId: randomUUID(), entry: "canvas", mode: "edit", modelId: "image-a",
      prompt: "Use both reference pictures for a local delivery fixture", inputs: [
        {artworkId: refs[0], role: "edit-target"}, {artworkId: refs[1], role: "reference"}],
      parameters: {quality: "medium", resolution: "2K", ratio: "3:4"}, variants: 1};
    const plan = await json("/api/imagegen/plan", request);
    const accepted = await json("/api/imagegen", {...request, confirmation: {billingVersion: plan.billingVersion,
      modelVersion: plan.modelVersion, credits: plan.totalCredits, confirmed: true}});
    let result: any;
    for (let i = 0; i < 600; i++) {
      result = await json("/api/imagegen?operationId=" + request.operationId);
      if (["succeeded", "failed", "needs_attention"].includes(result.status)) break;
      await new Promise(r => setTimeout(r, 50));
    }
    check("initial-delivery-succeeded", () => { assert.equal(result.status, "succeeded", JSON.stringify(result)); assert.equal(result.artifacts.length, 1); });
    check("one-supplier-post-two-references", () => { assert.equal(calls, 1); assert.equal(requests[0].references, 2); assert.ok(requests[0].path.endsWith("/images/edits")); });
    const saved = (await readManagedObject(result.artifacts[0].url, 64 * 1024 * 1024)).bytes;
    check("original-png-sha-and-2k-shape", () => { assert.equal(sha(saved), sha(large)); assert.equal(result.artifacts[0].width, 1536); assert.equal(result.artifacts[0].height, 2048); });
    let rows: any[] = [];
    for (let i = 0; i < 200; i++) {
      rows = (await db.getPool().query("SELECT * FROM app_image_jobs WHERE email=$1 ORDER BY kind", [owner])).rows;
      if (rows.length === 2 && rows.every(row => !row.lease_token && !row.lease_until)) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const child = rows.find(row => row.kind === "generate"), parent = rows.find(row => row.kind === "imagegen");
    check("parent-child-done-released", () => { assert.equal(rows.length, 2); for (const row of rows) { assert.equal(row.snapshot.status, "done"); assert.equal(row.lease_token, null); assert.equal(row.lease_until, null); } });
    const before = await billing();
    report.billingBefore = before.operations.map(({row}) => ({id: row.id, feature: row.feature, state: row.state, chargedCredits: row.charged_credits}));
    check("one-settlement-and-ledger", () => {
      // User welcome/admin grants are also operations; count generation and
      // all positive charges, not the fixture's credit funding records.
      const generation = before.operations.filter(({row}) => ["canvas.image", "image.generate"].includes(row.feature));
      assert.equal(child.billing_settled, true); assert.equal(generation.length, 1);
      assert.equal(generation[0].row.id, child.id); assert.equal(generation[0].row.state, "settled");
      assert.equal(generation[0].row.charged_credits, result.chargedCredits);
      assert.equal(before.operations.filter(({row}) => row.charged_credits > 0).length, 1);
      assert.ok(result.chargedCredits > 0); const debits = before.ledger.filter(x => x.row.delta < 0);
      assert.equal(debits.length, 1); assert.equal(-debits[0].row.delta, result.chargedCredits);
    });
    // Force recovery to read the large inline checkpoint, not an existing artwork URL.
    await f.sql.query("DELETE FROM app_artworks WHERE id=$1 AND email=$2", [result.artifacts[0].artworkId, owner]);
    await f.sql.query("UPDATE app_image_jobs SET snapshot=(snapshot-'deliveryRecovery') || $2::jsonb WHERE id=$1", [child.id,
      JSON.stringify({status: "error", error: "INJECTED_DELIVERY_INTERRUPTION", images: [{url: "data:image/png;base64," + large.toString("base64")} ]})]);
    await f.sql.query("UPDATE app_image_jobs SET snapshot=snapshot || $2::jsonb WHERE id=$1", [parent.id,
      JSON.stringify({status: "error", result: {...result, status: "failed", artifacts: [], error: {code: "INJECTED_DELIVERY_INTERRUPTION", message: "fixture"}}})]);
    const injected = (await f.sql.query("SELECT snapshot FROM app_image_jobs WHERE id=$1", [child.id])).rows[0].snapshot;
    const existing = (await f.sql.query("SELECT id FROM app_artworks WHERE id=$1", [result.artifacts[0].artworkId])).rows;
    check("checkpoint-inline-no-existing-artwork", () => {
      assert.equal(parent.id, accepted.jobId); assert.equal(existing.length, 0); assert.equal(injected.status, "error");
      assert.equal(injected.images[0].url, "data:image/png;base64," + large.toString("base64"));
    });
    await json("/api/imagegen/recover-delivery", {operationId: request.operationId}, other, 409);
    checks.push("other-owner-recovery-denied");
    const recovery = await json("/api/imagegen/recover-delivery", {operationId: request.operationId});
    check("stored-delivery-complete", () => { assert.equal(recovery.ok, true); assert.equal(recovery.complete, true); assert.deepEqual(recovery.artworkIds, [result.artifacts[0].artworkId]); });
    const recovered = await json("/api/imagegen?operationId=" + request.operationId);
    check("receipt-reopened", () => { assert.equal(recovered.status, "succeeded"); assert.equal(recovered.chargedCredits, result.chargedCredits); assert.equal(recovered.artifacts.length, 1); });
    const recoveredBytes = (await readManagedObject(recovered.artifacts[0].url, 64 * 1024 * 1024)).bytes;
    check("recovered-png-sha", () => assert.equal(sha(recoveredBytes), sha(large)));
    const repeat = await json("/api/imagegen/recover-delivery", {operationId: request.operationId});
    check("recovery-idempotent", () => assert.deepEqual(repeat, recovery));
    const after = await billing();
    check("billing-byte-equivalent", () => assert.deepEqual(after, before));
    check("recovery-no-supplier-post", () => assert.equal(calls, 1));
    check("no-external-network", () => assert.equal(externalAttempts, 0));
    report.status = "PASS"; report.chargedCredits = result.chargedCredits; report.parentId = parent.id;
    report.childId = child.id; report.recoveredSha256 = sha(recoveredBytes);
  } catch (error) { report.error = String(error); throw error; }
  finally {
    report.supplierFixturePosts = calls; report.externalNetworkAttempts = externalAttempts;
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    app.closeAllConnections(); await new Promise<void>(r => app.close(() => r()));
    await (await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();
    await db.getPool().end(); await f.cleanup(); globalThis.fetch = originalFetch;
  }
  console.log(`DATAURL_DELIVERY=PASS CHECKS=${checks.length} REFERENCES=2 LOOPBACK_POSTS=${calls} RECOVERY_POSTS=0 EXTERNAL_NETWORK=${externalAttempts} EXIT=0`);
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
