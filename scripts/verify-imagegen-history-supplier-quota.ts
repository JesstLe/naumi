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

function isolatedFixtureDatabase(value: string) {
  try {
    const database = new URL(value);
    return ["postgres:", "postgresql:"].includes(database.protocol) && database.hostname === "127.0.0.1" &&
      !!database.port && database.port !== "5432" && /^\/[a-zA-Z0-9_-]+$/.test(database.pathname) &&
      !["/postgres", "/template0", "/template1"].includes(database.pathname) &&
      database.username === "fixture" && database.password === "fixture-local-only" && !database.search && !database.hash;
  } catch { return false; }
}

async function main() {
  const mode = process.argv[2] || "modified";
  assert.ok(["baseline", "modified", "rollback"].includes(mode), "Expected baseline, modified, or rollback");
  const changed = mode === "modified";
  assert.ok(process.env.NAUMI_VERIFY_ISOLATED_DB === "1" && isolatedFixtureDatabase(process.env.DATABASE_URL || ""),
    "Requires NAUMI_VERIFY_ISOLATED_DB=1 and explicit loopback PostgreSQL fixture credentials, non-default port/database, no DSN overrides");
  for (const value of [
    "postgresql://fixture:fixture-local-only@127.0.0.1:65434/history_benchmark",
    "postgres://fixture:fixture-local-only@127.0.0.1:65435/goal",
  ]) assert.equal(isolatedFixtureDatabase(value), true);
  for (const value of [
    "postgresql://fixture:fixture-local-only@production.invalid:65435/goal",
    "postgresql://fixture:fixture-local-only@127.0.0.1:5432/goal",
    "postgresql://production:secret@127.0.0.1:65435/goal",
    "postgresql://fixture:fixture-local-only@127.0.0.1:65435/postgres",
    "postgresql://fixture:fixture-local-only@127.0.0.1:65435/goal?host=production.invalid",
    "http://fixture:fixture-local-only@127.0.0.1:65435/goal", "invalid",
  ]) assert.equal(isolatedFixtureDatabase(value), false);
  console.log(`MODE=${mode.toUpperCase()} ISOLATED_DSN_GUARD=PASS ALLOWED=2 REJECTED=7`);

  const png = await sharp({create: {width: 8, height: 8, channels: 4, background: "white"}}).png().toBuffer();
  let explicitNotCharged = false;
  let counts = {a: 0, b: 0, leasedPosts: 0, unexpected: 0};
  const f = await createModelFixture(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      res.setHeader("content-type", "application/json");
      const text = req.url?.includes("/chat/completions");
      if (req.method !== "POST" || !["/a/v1/images/generations", "/b/v1/images/generations", "/text-a/v1/chat/completions", "/text-b/v1/chat/completions"].includes(req.url || "")) {
        counts.unexpected++;
        res.writeHead(404); res.end("{}"); return;
      }
      const body = JSON.parse(raw);
      const primary = req.url!.startsWith("/a/") || req.url!.startsWith("/text-a/");
      assert.equal(body.model, text ? primary ? "fixture-text-a" : "fixture-text-b" : primary ? "fixture-image-a" : "fixture-image-b");
      if (text) assert.deepEqual(body.messages, [{role: "user", content: "local quota text regression fixture"}]);
      else { assert.equal(body.prompt, "local historical quota benchmark fixture"); assert.equal(body.n, 1); }
      const leases = (await f.sql.query("SELECT count(*)::int AS n FROM app_model_provider_leases")).rows[0].n;
      assert.equal(leases, 1, "A real provider lease must be held at HTTP dispatch");
      counts.leasedPosts++;
      if (primary) {
        counts.a++;
        res.setHeader("retry-after", "600");
        res.writeHead(403);
        res.end(explicitNotCharged ? JSON.stringify({error: {message: quotaMessage, billing_status: "not_charged"}}) : quotaBody);
      } else {
        counts.b++;
        res.end(JSON.stringify(text ? {choices: [{message: {role: "assistant", content: "fixture-text-b result"}}]} : {data: [{b64_json: png.toString("base64")}]}));
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
    for (const suffix of ["a", "b"]) {
      const id = "text-" + suffix;
      const credential = await f.credentials.importPlain({providerId: id, plain: "fixture-text-" + suffix, actor: "fixture"});
      f.config.providers.push({...f.config.providers[0], id, protocol: "openai-chat", baseUrl: f.origin + "/" + id + "/v1", credentialRef: credential.id});
      f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]), id, providerId: id, model: "fixture-" + id, modality: "text", parameterMap: {}, capabilities: {...f.config.upstreamModels[0].capabilities, edit: false, qualities: [], nativeResolutions: []}});
    }
    f.config.publicModels.push({id: "text-fixture", label: "Local text regression", modality: "text", enabled: true, visible: true, target: {type: "upstream", id: "text-a"}, supplierRouting: {mode: "priority", channels: [
      {upstreamId: "text-a", enabled: true, priority: 1, weight: 1}, {upstreamId: "text-b", enabled: true, priority: 2, weight: 1},
    ]}});
    f.config.bindings["text.generate"] = "text-fixture";
    f.config.bindings["agent.text"] = "text-fixture";
    const snapshot = await f.repo.current();
    const billing = {version: 1, digest: "b".repeat(64), config: fixtureConfig()};
    const {createModelExecutor} = await import("../src/lib/model-config/execution");
    const {channelRoutingFetch} = await import("../src/lib/model-config/channel-fetch");
    const {runModelExecution} = await import("../src/lib/model-config/context");
    const {withImageOperation} = await import("../src/lib/image-gateway");
    const {channelHealthKey, channelHealthSummary, claimChannel} = await import("../src/lib/model-config/channel-scheduler");
    const {channelOperationKey} = await import("../src/lib/model-config/channel-availability");
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
    const primary = scope.supplierRouting!.targets[0];
    const health = async () => (await f.sql.query("SELECT failures,last_status,last_failure_kind,open_until>now() AS opened FROM app_model_channel_health WHERE key=$1", [channelHealthKey(primary)])).rows[0];
    const stages = async (id: string) => (await f.sql.query("SELECT provider_id,attempt,status,state FROM app_model_execution_stages WHERE operation_id=$1 ORDER BY attempt", [id])).rows;
    const assertImage = async (response: Response) => {
      assert.equal(response.status, 200);
      const image = await response.json();
      assert.equal(image.data.length, 1);
      assert.deepEqual(Buffer.from(image.data[0].b64_json, "base64"), png);
    };
    const quotaOperation = "quota-fixture-" + randomUUID();
    const quotaPin = channelOperationKey(scope, quotaOperation)!;
    await f.sql.query("INSERT INTO app_model_channel_operations(operation_key,upstream_id) VALUES($1,$2)", [quotaPin, primary.upstreamId]);
    const response = await run(quotaOperation);
    assert.equal(response.status, 403);
    const responseBody = await response.text();
    if (changed) {
      assert.deepEqual(JSON.parse(responseBody), {error: {
        code: "IMAGE_ACCESS_DENIED", message: "生成通道访问被拒绝，请联系管理员处理", type: "naumi_channel_failure",
      }});
      for (const secret of [quotaMessage, "0.008416", "0.040000", "预扣费额度", "billing_status", "not_charged"])
        assert.ok(!responseBody.includes(secret), "A bounded diagnosis is not a supplier billing receipt");
    } else assert.equal(responseBody, quotaBody, "Baseline retains the old raw-body response");
    assert.deepEqual(counts, {a: 1, b: 0, leasedPosts: 1, unexpected: 0});
    assert.equal(await leases(), 0);
    assert.deepEqual(await stages(quotaOperation),
      [{provider_id: "p1", attempt: 1, status: 403, state: "failed-response"}]);
    assert.equal((await f.sql.query("SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1", [quotaPin])).rows[0]?.upstream_id, primary.upstreamId, "A nondefinite 403 never clears the original operation pin");
    const quotaAudit = (await f.sql.query("SELECT usage,cost_status FROM app_model_execution_stages WHERE operation_id=$1", [quotaOperation])).rows[0];
    assert.deepEqual(quotaAudit.usage, {upstreamFailure: {code: "IMAGE_ACCESS_DENIED", status: 403}});
    assert.equal(quotaAudit.cost_status, "unknown", "A customer-safe diagnosis does not prove supplier non-charge");
    if (changed) {
      assert.deepEqual(await health(), {failures: 1, last_status: 403, last_failure_kind: "auth", opened: true});
      const remaining = (await f.sql.query("SELECT extract(epoch FROM (open_until-now()))*1000 AS ms FROM app_model_channel_health WHERE key=$1", [channelHealthKey(primary)])).rows[0].ms;
      assert.ok(Number(remaining) > 590000 && Number(remaining) <= 600000, "Preserve Retry-After when moving the single health write");
      const summary = (await channelHealthSummary(f.sql, snapshot.config)).u1;
      assert.equal(summary.state, "cooldown"); assert.equal(summary.failures, 1); assert.equal(summary.failureKind, "auth");
    } else assert.equal(await health(), undefined, "Baseline misses health on the early-return branch");
    // No customer identity, balance, reservation, or settlement was initialized/called.
    // Supplier-cost/execution audit rows are NOT a customer debit/credit test.
    const accountingTables = async () => (await f.sql.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename=ANY($2::text[])",
      [f.schemaName, ["app_users", "app_credit_batches", "app_transactions", "app_billing_operations", "app_gen_reservations"]])).rows;
    assert.deepEqual(await accountingTables(), []);
    console.log(`QUOTA_CASE=OPEN STATUS=403 DIAGNOSIS=${changed ? "IMAGE_ACCESS_DENIED" : "RAW_BASELINE"} BILLING_PROOF=ABSENT A_POSTS=1 B_POSTS=0 LEASED_POSTS=1 LEASES=0 HEALTH_FAILURES=${changed ? 1 : 0} HEALTH=${changed ? "COOLDOWN" : "UNRECORDED"} ORIGINAL_PIN=RETAINED SUPPLIER_COST=UNKNOWN ACCOUNTING=NOT_EXECUTED CUSTOMER_BALANCE=NOT_VERIFIED SOURCE=SUMMARY_FIXTURE EXACT_REPLAY=0`);

    // A different operation is a NEW request, not fallback/replay of quotaOperation.
    counts = {a: 0, b: 0, leasedPosts: 0, unexpected: 0};
    const nextOperation = "new-request-" + randomUUID();
    assert.notEqual(nextOperation, quotaOperation);
    const nextResponse = await run(nextOperation);
    if (changed) {
      await assertImage(nextResponse);
      assert.deepEqual(counts, {a: 0, b: 1, leasedPosts: 1, unexpected: 0});
      assert.deepEqual(await stages(nextOperation), [{provider_id: "p2", attempt: 1, status: 200, state: "response-received"}]);
      assert.deepEqual(await health(), {failures: 1, last_status: 403, last_failure_kind: "auth", opened: true});
    } else {
      assert.equal(nextResponse.status, 403); assert.equal(await nextResponse.text(), quotaBody);
      assert.deepEqual(counts, {a: 1, b: 0, leasedPosts: 1, unexpected: 0});
      assert.equal(await health(), undefined);
    }
    assert.equal(await leases(), 0);
    assert.deepEqual(await stages(quotaOperation), [{provider_id: "p1", attempt: 1, status: 403, state: "failed-response"}], "The original request never gains a second supplier attempt");
    console.log(`NEW_OPERATION=${changed ? "SKIPS_COOLDOWN" : "RESELECTS_UNRECORDED"} STATUS=${changed ? 200 : 403} A_POSTS=${changed ? 0 : 1} B_POSTS=${changed ? 1 : 0} ORIGINAL_OPERATION_ATTEMPTS=1 LEASES=0`);

    // Synthetic accepted pin: selection/release only, never another paid POST.
    // Its original target must remain pinned despite the new-request cooldown.
    const pinnedKey = "accepted-pin-fixture-" + randomUUID();
    await f.sql.query("INSERT INTO app_model_channel_operations(operation_key,upstream_id) VALUES($1,$2)", [pinnedKey, primary.upstreamId]);
    const beforePin = {...counts};
    const pinned = await claimChannel(f.sql, scope.frozen.publicModelId, scope.supplierRouting!.policy, scope.supplierRouting!.targets, new Set(), pinnedKey);
    try { assert.equal(pinned.target.upstreamId, primary.upstreamId); assert.equal(pinned.recovering, true); }
    finally { await pinned.release(); }
    assert.equal((await f.sql.query("SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1", [pinnedKey])).rows[0].upstream_id, primary.upstreamId);
    assert.deepEqual(counts, beforePin); assert.equal(await leases(), 0);
    console.log("ACCEPTED_PIN=ORIGINAL_TARGET_RETAINED SELECTION_ONLY=1 HTTP_POSTS=0 LEASES=0");

    // Contrast only: synthetic explicit non-charge proof exercises existing fallback.
    // It does not change the OPEN historical case or establish historical non-charge.
    await f.sql.query("DELETE FROM app_model_channel_health");
    explicitNotCharged = true;
    counts = {a: 0, b: 0, leasedPosts: 0, unexpected: 0};
    const controlOperation = "not-charged-control-" + randomUUID();
    await assertImage(await run(controlOperation));
    assert.deepEqual(counts, {a: 1, b: 1, leasedPosts: 2, unexpected: 0});
    assert.equal(await leases(), 0);
    assert.deepEqual(await health(), {failures: 1, last_status: 403, last_failure_kind: "auth", opened: true}, "The moved health write counts a definite rejection exactly once too");
    assert.deepEqual(await stages(controlOperation), [
      {provider_id: "p1", attempt: 1, status: 403, state: "rejected-not-charged"},
      {provider_id: "p2", attempt: 2, status: 200, state: "response-received"},
    ]);
    assert.deepEqual(await accountingTables(), []);
    console.log("NOT_CHARGED_CONTROL=EXPECTED_FALLBACK STATUS=200 A_POSTS=1 B_POSTS=1 LEASED_POSTS=2 LEASES=0 HEALTH_FAILURES=1 ACCOUNTING=NOT_EXECUTED CUSTOMER_BALANCE=NOT_VERIFIED");

    // Text routing retains its existing fallback semantics and one failure count.
    await f.sql.query("DELETE FROM app_model_channel_health");
    explicitNotCharged = false;
    counts = {a: 0, b: 0, leasedPosts: 0, unexpected: 0};
    const textFrozen = await executor.resolve({snapshot, billing, binding: "text.generate", requestedModelId: "text-fixture"});
    const textScope = await executor.describe(textFrozen), textOperation = "text-regression-" + randomUUID();
    const textFetcher = channelRoutingFetch(textScope, {trustedOrigins: [f.origin]});
    const textResponse = await runModelExecution(textScope, () => withImageOperation("text-fixture", {id: textOperation}, () => textFetcher(f.origin + "/text-a/v1/chat/completions", {
      method: "POST", headers: {"content-type": "application/json"}, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({model: "text-fixture", messages: [{role: "user", content: "local quota text regression fixture"}]}),
    })));
    assert.equal(textResponse.status, 200);
    assert.equal((await textResponse.json()).choices[0].message.content, "fixture-text-b result");
    assert.deepEqual(counts, {a: 1, b: 1, leasedPosts: 2, unexpected: 0});
    assert.deepEqual((await f.sql.query("SELECT failures,last_status,last_failure_kind,open_until>now() AS opened FROM app_model_channel_health WHERE key=$1", [channelHealthKey(textScope.supplierRouting!.targets[0])])).rows[0], {failures: 1, last_status: 403, last_failure_kind: "auth", opened: true});
    assert.deepEqual(await stages(textOperation), [
      {provider_id: "text-a", attempt: 1, status: 403, state: "failed-response"},
      {provider_id: "text-b", attempt: 2, status: 200, state: "response-received"},
    ]);
    assert.equal(await leases(), 0); assert.deepEqual(await accountingTables(), []);
    console.log("TEXT_REGRESSION=EXISTING_FALLBACK STATUS=200 A_POSTS=1 B_POSTS=1 HEALTH_FAILURES=1 LEASES=0 ACCOUNTING=NOT_EXECUTED");
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
