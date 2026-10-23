/** Historical supplier-quota benchmark, NOT a fix or an employee-input replay.
 * Only the quota message/status survived in the local report; the JSON envelope
 * and image request below are synthetic. All HTTP/PG endpoints are loopback.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig} from "./billing-unit-fixture";

// snapshot-02.txt LOG_SUMMARY.last: retained message, NOT a retained raw body.
const quotaMessage = "本地用户预扣费额度失败, 本地用户剩余额度: 💰0.008416, 需要预扣费额度: 💰0.040000";
const quotaBody = JSON.stringify({error: {message: quotaMessage}});

async function main() {
  const database = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.ok(process.env.NAUMI_VERIFY_ISOLATED_DB === "1" &&
    ["postgres:", "postgresql:"].includes(database.protocol) &&
    database.hostname === "127.0.0.1" && database.port === "65434" &&
    database.pathname === "/history_benchmark",
  "Requires NAUMI_VERIFY_ISOLATED_DB=1 and loopback :65434/history_benchmark");

  const png = await sharp({create: {width: 8, height: 8, channels: 4, background: "white"}}).png().toBuffer();
  let explicitNotCharged = false;
  let counts = {a: 0, b: 0, leasedPosts: 0, unexpected: 0};
  const f = await createModelFixture(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      res.setHeader("content-type", "application/json");
      if (req.method !== "POST" || !["/a/v1/images/generations", "/b/v1/images/generations"].includes(req.url || "")) {
        counts.unexpected++;
        res.writeHead(404); res.end("{}"); return;
      }
      const body = JSON.parse(raw);
      assert.equal(body.model, req.url!.startsWith("/a/") ? "fixture-image-a" : "fixture-image-b");
      assert.equal(body.prompt, "local historical quota benchmark fixture");
      assert.equal(body.n, 1);
      const leases = (await f.sql.query("SELECT count(*)::int AS n FROM app_model_provider_leases")).rows[0].n;
      assert.equal(leases, 1, "A real provider lease must be held at HTTP dispatch");
      counts.leasedPosts++;
      if (req.url!.startsWith("/a/")) {
        counts.a++;
        res.writeHead(403);
        res.end(explicitNotCharged ? JSON.stringify({error: {message: quotaMessage, billing_status: "not_charged"}}) : quotaBody);
      } else {
        counts.b++;
        res.end(JSON.stringify({data: [{b64_json: png.toString("base64")}]}));
      }
    } catch (error) {
      res.writeHead(500); res.end(JSON.stringify({error: {message: String(error)}}));
    }
  });
  let db: typeof import("../src/lib/db") | undefined;
  try {
    // createModelFixture owns a UUID schema; set this BEFORE the application pool opens.
    Object.assign(process.env, {
      PGOPTIONS: `-c search_path=${f.schemaName}`,
      NAUMI_ROUTER_MANAGEMENT_URL: f.origin,
      MODEL_CONFIG_TRUSTED_ORIGINS: f.origin,
      NAUMI_STAGING_HISTORY_GUARD: "0",
    });
    db = await import("../src/lib/db");
    assert.equal((await db.getPool().query("SELECT current_schema() AS name")).rows[0].name, f.schemaName);
    const credential = await f.credentials.importPlain({providerId: "p2", plain: "fixture-backup-local-only", actor: "fixture"});
    Object.assign(f.config.providers[0], {baseUrl: f.origin + "/a/v1", timeoutMs: 5000, maxConcurrent: 1});
    f.config.providers.push({...f.config.providers[0], id: "p2", baseUrl: f.origin + "/b/v1", credentialRef: credential.id});
    f.config.upstreamModels[0].model = "fixture-image-a";
    f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]), id: "u2", providerId: "p2", model: "fixture-image-b"});
    f.config.publicModels[0].supplierRouting = {mode: "priority", channels: [
      {upstreamId: "u1", enabled: true, priority: 1, weight: 1},
      {upstreamId: "u2", enabled: true, priority: 2, weight: 1},
    ]};
    const snapshot = await f.repo.current();
    const billing = {version: 1, digest: "b".repeat(64), config: fixtureConfig()};
    const {createModelExecutor} = await import("../src/lib/model-config/execution");
    const {channelRoutingFetch} = await import("../src/lib/model-config/channel-fetch");
    const {runModelExecution} = await import("../src/lib/model-config/context");
    const {withImageOperation} = await import("../src/lib/image-gateway");
    const executor = createModelExecutor({
      runtime: {byVersion: version => f.repo.byVersion(version), prepareExecution: async () => {throw Error("No external Router in this fixture");}},
      credentials: f.credentials, billingByVersion: async () => billing,
      trustedOrigins: [f.origin], gateway: () => {throw Error("No gateway in this fixture");},
    });
    const frozen = await executor.resolve({snapshot, billing, feature: "image.generate", binding: "image.generate", requestedModelId: "image-a",
      facts: {task: "draft", quality: "medium", resolution: "1K", ratio: "1:1", needsEdit: false, preserveIdentity: false, needsText: false, nativeResolution: false, references: 0}});
    const scope = await executor.describe(frozen);
    assert.deepEqual(scope.supplierRouting?.targets.map(target => target.upstreamId), ["u1", "u2"]);
    for (const target of scope.supplierRouting!.targets) assert.equal(new URL(target.scope.connection.baseUrl).origin, f.origin);
    const fetcher = channelRoutingFetch(scope, {trustedOrigins: [f.origin]});
    const run = (id: string) => runModelExecution(scope, () => withImageOperation("image-a", {id}, () => fetcher(f.origin + "/a/v1/images/generations", {
      method: "POST", headers: {"content-type": "application/json"}, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({model: "image-a", prompt: "local historical quota benchmark fixture", n: 1}),
    })));
    const leases = async () => (await f.sql.query("SELECT count(*)::int AS n FROM app_model_provider_leases")).rows[0].n;
    const quotaOperation = "quota-fixture-" + randomUUID();
    const response = await run(quotaOperation);
    assert.equal(response.status, 403);
    assert.equal(await response.text(), quotaBody, "Return the fixture 403 body unchanged");
    assert.deepEqual(counts, {a: 1, b: 0, leasedPosts: 1, unexpected: 0});
    assert.equal(await leases(), 0);
    assert.deepEqual((await f.sql.query("SELECT provider_id,attempt,status,state FROM app_model_execution_stages WHERE operation_id=$1 ORDER BY attempt", [quotaOperation])).rows,
      [{provider_id: "p1", attempt: 1, status: 403, state: "failed-response"}]);
    // No customer identity, balance, reservation, or settlement was initialized/called.
    // Supplier-cost/execution audit rows are NOT a customer debit/credit test.
    const accountingTables = async () => (await f.sql.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename=ANY($2::text[])",
      [f.schemaName, ["app_users", "app_credit_batches", "app_transactions", "app_billing_operations", "app_gen_reservations"]])).rows;
    assert.deepEqual(await accountingTables(), []);
    console.log("QUOTA_CASE=OPEN STATUS=403 A_POSTS=1 B_POSTS=0 LEASED_POSTS=1 LEASES=0 ACCOUNTING=NOT_EXECUTED CUSTOMER_BALANCE=NOT_VERIFIED SOURCE=SUMMARY_FIXTURE EXACT_REPLAY=0");

    // Contrast only: synthetic explicit non-charge proof exercises existing fallback.
    // It does not change the OPEN historical case or establish historical non-charge.
    explicitNotCharged = true;
    counts = {a: 0, b: 0, leasedPosts: 0, unexpected: 0};
    const control = await run("not-charged-control-" + randomUUID());
    assert.equal(control.status, 200);
    const image = await control.json();
    assert.equal(image.data.length, 1);
    assert.deepEqual(Buffer.from(image.data[0].b64_json, "base64"), png);
    assert.deepEqual(counts, {a: 1, b: 1, leasedPosts: 2, unexpected: 0});
    assert.equal(await leases(), 0);
    assert.deepEqual(await accountingTables(), []);
    console.log("NOT_CHARGED_CONTROL=EXPECTED_FALLBACK STATUS=200 A_POSTS=1 B_POSTS=1 LEASED_POSTS=2 LEASES=0 ACCOUNTING=NOT_EXECUTED CUSTOMER_BALANCE=NOT_VERIFIED");
  } finally {
    try {if (db) await db.getPool().end();}
    finally {
      await f.cleanup();
      const check = new Pool({connectionString: process.env.DATABASE_URL, ssl: false});
      try {
        assert.equal((await check.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1", [f.schemaName])).rows[0].n, 0);
        console.log("ISOLATED_SCHEMA_CLEANUP=PASS SCHEMA_EXISTS=0");
      } finally {await check.end();}
    }
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
