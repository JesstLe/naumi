/** Real precheck/quote/plan + isolated PostgreSQL; no generation or supplier transport. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { transformSync } from "esbuild";
import type { AgentBillingSession } from "../src/lib/billing/agent";
import { createModelFixture } from "./model-config-fixture";

const root = process.cwd();
const option = (key: string) => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const baseline = process.argv.includes("--baseline");
const sourceRoot = path.resolve(option("--source-root") || root);
const projection = ["src/lib/billing/agent.ts", "src/lib/agent/runtime.ts", "src/lib/agent/harness.ts"];

// Only the owned source is projected. Every dependency resolves to the same current
// workspace module, so parent edits are not mistaken for an Agent regression.
function loadProjected(relative: string): Record<string, any> {
  const contents = readFileSync(path.join(sourceRoot, relative), "utf8");
  const code = transformSync(contents, { loader: "ts", format: "cjs", target: "node20" }).code;
  const projected = { exports: {} };
  vm.runInNewContext(code, { module: projected, exports: projected.exports,
    require: createRequire(path.join(root, relative)), Request, Response, Headers, URL,
    Error, Date, console, process, Buffer, AbortController, AbortSignal, setTimeout, clearTimeout,
  }, { filename: path.join(sourceRoot, relative), timeout: 10_000 });
  return projected.exports;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  assert.equal(url.hostname, "127.0.0.1");
  // Fail before creating PostgreSQL/HTTP resources if the tsx child lost this condition.
  createRequire(path.join(root, "package.json"))("server-only");
  let checks = 0, forbiddenRequests = 0, controlRequests = 0, externalRequests = 0, digest = "";
  const observations: Record<string, unknown> = {};
  const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
  const same = (actual: unknown, expected: unknown, message: string) => { assert.equal(actual, expected, message); checks++; };
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", OPENAI_API_KEY: "fixture-no-supplier", SETTINGS_SECRET: "agent-pricing-local-fixture-0123456789abcdef" });
  const publications = new Map<string, unknown>();
  const f = await createModelFixture(async (req, res) => {
    const parts: Buffer[] = []; for await (const part of req) parts.push(Buffer.from(part));
    const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/internal/config/prepare") { controlRequests++; return res.end(JSON.stringify({ digest: body.digest, phase: "prepared" })); }
    if (req.url === "/internal/config/activate") { controlRequests++; assert.equal(body.expectedDigest, digest); digest = body.digest; const receipt = { id: body.id, digest, phase: "applied" }; publications.set(body.id, receipt); return res.end(JSON.stringify(receipt)); }
    if (req.url === "/internal/config/state") { controlRequests++; return res.end(JSON.stringify({ digest })); }
    if (req.url?.startsWith("/internal/config/publications/")) { controlRequests++; const receipt = publications.get(decodeURIComponent(req.url.split("/").at(-1)!)); if (receipt) return res.end(JSON.stringify(receipt)); }
    forbiddenRequests++; res.statusCode = 500; res.end(JSON.stringify({ error: "No generation allowed in Agent precheck fixture" }));
  });
  const oldOptions = process.env.PGOPTIONS, originalFetch = globalThis.fetch;
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, NAUMI_MODEL_CONFIG_ONLY: "1",
    MODEL_CONFIG_TRUSTED_ORIGINS: f.origin, NAUMI_ROUTER_MANAGEMENT_URL: f.origin,
    NAUMI_ROUTER_MANAGEMENT_TOKEN: "agent-pricing-fixture-router-local-only", MODEL_CONFIG_ENVELOPE_SECRET: "agent-pricing-fixture-envelope-local-only",
    OPENAI_BASE_URL: f.origin + "/v1", INTERNAL_APP_ORIGIN: f.origin });
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== f.origin) { externalRequests++; throw new Error("Fixture forbids nonlocal HTTP"); }
    return originalFetch(request);
  };
  let db: typeof import("../src/lib/db") | undefined;
  try {
    await f.repo.current();
    db = await import("../src/lib/db"); await db.ensureSchema();
    const { getBillingRuntime } = await import("../src/lib/billing/server");
    const { createBillingService, withBillingTransaction } = await import("../src/lib/billing/service");
    const { signUserSession } = await import("../src/lib/native-auth");
    const { fingerprint } = await import("../src/lib/billing/fingerprint");
    const { imagegenStepId } = await import("../src/lib/imagegen/generation-core");
    const { imagegenFingerprint } = await import("../src/lib/imagegen/plan");
    const { withFrozenExecutionBundle } = await import("../src/lib/model-config/execution");
    const { getModelAdministration } = await import("../src/lib/model-config/server");
    const { createImageJob } = await import("../src/lib/image-job-repository");
    const { ensureVideoWorkflowSchema } = await import("../src/lib/video/workflow");
    const { videoAgentOperationId } = await import("../src/lib/agent/canvas-video-tools");
    const runtime = await getBillingRuntime(), service = createBillingService();
    const cfg = structuredClone((await runtime.config.current()).config);
    cfg.switches.metering = "on"; cfg.thresholds.agentConfirmCredits = 7;
    cfg.features["image.generate"].pricing = { mode: "fixed", credits: 8 };
    const publish = async (config = cfg) => { const before = await runtime.config.current(); return runtime.config.publish({ id: randomUUID(), expectedVersion: before.version, config, actor: "fixture", reason: "isolated Agent pricing-friction verification" }); };
    await publish();
    const owner = `agent-price-${randomUUID()}@example.test`, poor = `agent-poor-${randomUUID()}@example.test`;
    await db.getOrCreateUser(owner); await db.getOrCreateUser(poor);
    await withBillingTransaction(db.getPool(), async tx => {
      await tx.query("DELETE FROM app_ledger WHERE email=$1", [poor]);
      await tx.query("DELETE FROM app_credit_batches WHERE email=$1", [poor]);
      await tx.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1", [poor]);
    });
    await withBillingTransaction(db.getPool(), tx => service.grantTx(tx, { id: randomUUID(), email: owner, amount: 1000, source: "admin", reason: "fixture", expiry: { unit: "years", value: 1 }, ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture" }));
    const makeSession = (email = owner): AgentBillingSession => ({ id: randomUUID(), email, turnId: "first-turn", cred: { cookie: `nv_user=${signUserSession(email, Date.now())}`, authorization: "", imageQuality: "medium" } });
    const { agentBillingPrecheck: precheck, agentQuote } = loadProjected(projection[0]) as typeof import("../src/lib/billing/agent");
    const harness = loadProjected(projection[2]) as typeof import("../src/lib/agent/harness");
    const args = { prompt: "fixture image", count: 1, ratio: "1:1", resolution: "1K" };
    const quoted = await agentQuote("generate_image", args, owner, makeSession().cred);
    check(quoted?.imagegenPlan && quoted.quote.requestedCredits > 0, "real quote prepares an imagegen plan");
    same(quoted!.quote.requestedCredits, quoted!.imagegenPlan!.totalCredits, "quote and frozen plan agree");
    const originalCredits = quoted!.quote.requestedCredits;
    const s = makeSession(), call = "original-tool-call";
    const first = await precheck(s, "generate_image", args, call);
    same(!!first?.block, baseline, "first high-price call only waits in baseline");
    observations.highPrice = first?.reason || "allowed";
    if (baseline) same(first?.attention, "waiting", "baseline asks for a second user turn");
    else {
      same(s.preparedBilling?.billingCredits, originalCredits, "server credit amount is prepared");
      same(s.preparedBilling?.billingOperationId, fingerprint({ session: s.id, turn: s.turnId, call }), "original tool-call identity remains unchanged");
      same(s.preparedImagegen?.request.operationId, imagegenStepId(s.preparedBilling!.billingOperationId, "agent"), "imagegen operation derives from original call");
      same(s.preparedImagegen?.fingerprint, imagegenFingerprint(s.preparedImagegen!.request), "prepared plan fingerprint matches its frozen request");
      const operation = s.preparedBilling!.billingOperationId;
      same(await precheck(s, "generate_image", args, call), undefined, "same-call precheck remains idempotent");
      same(s.preparedBilling?.billingOperationId, operation, "repeat precheck keeps original operation id");
      same(await precheck(s, "generate_image", { ...args, confirm: false }, call), undefined, "legacy false pricing flag is not user cancellation");
      const later = makeSession(); same(await precheck(later, "generate_image", { ...args, confirm: true }, "another-call"), undefined, "confirm flag is unnecessary");
      same((s as any).pendingQuotes, undefined, "no quote accumulator is allocated");
    }
    // Current publication changes do not invalidate a quote prepared in an accepted bundle.
    const admin = await getModelAdministration(), acceptedModel = await admin.repo.current(), acceptedBilling = await runtime.config.current();
    const cfg2 = structuredClone(cfg); cfg2.features["image.generate"].pricing = { mode: "fixed", credits: 11 };
    await publish(cfg2);
    const frozen = makeSession();
    const frozenResult = await withFrozenExecutionBundle({ modelVersion: acceptedModel.version, billingVersion: acceptedBilling.version }, () => precheck(frozen, "generate_image", args, "accepted-original-call"));
    same(!!frozenResult?.block, baseline, "current publication does not create modified confirmation wait");
    if (!baseline) { same(frozen.preparedBilling?.billingVersion, acceptedBilling.version, "accepted billing version is frozen"); same(frozen.preparedImagegen?.modelVersion, acceptedModel.version, "accepted model version is frozen"); same(frozen.preparedBilling?.billingCredits, originalCredits, "accepted quote retains original price"); }
    // Reproduce the baseline current-price re-confirmation specifically.
    const legacy = makeSession();
    const { stableJson } = await import("../src/lib/billing/fingerprint");
    const key = "generate_image:" + stableJson(args);
    Object.assign(legacy, { userConfirmedQuote: true, turnId: "next-turn", pendingQuotes: new Map([[key, quoted!.quote]]), pendingQuoteTurns: new Map([[key, "previous-turn"]]), pendingQuoteExpires: new Map([[key, Date.now() + 600_000]]), lastPendingQuoteKey: key });
    const changed = await precheck(legacy, "generate_image", { ...args, confirm: true }, "current-change");
    same(!!changed?.block, baseline, "legacy quote state cannot impose a new confirmation");
    if (baseline) check(changed?.reason.includes("价格已更新"), "baseline reproduces current-version reconfirmation");
    else same(legacy.preparedBilling?.billingCredits, 11, "new operation uses a real server quote, not stale client credits");
    const expired = makeSession();
    Object.assign(expired, { pendingQuotes: new Map([[key, quoted!.quote]]), pendingQuoteTurns: new Map([[key, "old-turn"]]), pendingQuoteExpires: new Map([[key, Date.now() - 600_001]]), lastPendingQuoteKey: key });
    same(!!(await precheck(expired, "generate_image", args, "expired-pricing-state"))?.block, baseline, "old ten-minute pricing state does not block modified calls");
    const poorResult = await precheck(makeSession(poor), "generate_image", args, "poor-call");
    same(poorResult?.attention, baseline ? "waiting" : "restricted", "modified path reaches real account balance before any pricing wait");
    if (!baseline) check(poorResult?.reason.includes("余额不足"), "insufficient real balance remains blocked");
    const missingResult = await precheck(makeSession(`missing-${randomUUID()}@example.test`), "generate_image", args, "missing-account");
    same(missingResult?.attention, baseline ? "waiting" : "restricted", "missing account is restricted in modified precheck");
    // Low-price different parameters must not accumulate across otherwise independent turns.
    const low = structuredClone(cfg2); low.thresholds.agentConfirmCredits = 100_000; low.features["image.generate"].pricing = { mode: "fixed", credits: 1 }; await publish(low);
    const many = makeSession(); let allowed = 0, firstBlocked = 0;
    for (let i = 1; i <= 40; i++) { many.turnId = `independent-turn-${i}`; const result = await precheck(many, "generate_image", { ...args, prompt: `low-price-${i}` }, `low-call-${i}`); if (result?.block) { firstBlocked = i; break; } allowed++; }
    same(allowed, baseline ? 32 : 40, "40 low-price distinct quotes do not hit a session quota");
    same(firstBlocked, baseline ? 33 : 0, "baseline accumulator fails precisely on call 33");
    observations.lowPrice = { allowed, firstBlocked };
    // Ownership and frozen A+ recovery use actual stored tasks, not a precheck mock.
    const job = randomUUID(), recoveredQuote = { ...quoted!.quote, requestedCredits: 2, authorizedCredits: 2 };
    await createImageJob(job, owner, "aplus", { status: "review", cost: 2 }, { billingQuote: recoveredQuote }, 2, false);
    const resumed = makeSession(); same(await precheck(resumed, "continue_aplus_generation", { job_id: job }, "original-aplus-call"), undefined, "owned A+ task recovery continues");
    same(resumed.preparedBilling?.billingVersion, recoveredQuote.configVersion, "recovery retains stored original quote");
    const foreign = await precheck(makeSession(poor), "continue_aplus_generation", { job_id: job }, "foreign-aplus"); check(foreign?.block && foreign.reason.includes("无权"), "foreign task ownership is enforced");
    const foreignVideo = await precheck(makeSession(), "generate_video", { node_id: randomUUID() }, "missing-video"); check(foreignVideo?.block && foreignVideo.reason.includes("节点不存在"), "video source-node ownership remains enforced");
    // Accepted video receipt lookup cannot submit again, even for an account with no balance.
    const videoCall = "known-video-call", videoId = randomUUID(), videoOperation = videoAgentOperationId(poor, videoCall, "video-generate");
    await db.createVideoTask({ id: videoId, email: poor, upstreamId: "already-accepted-fixture", model: "fixture-video", prompt: "unknown supplier outcome; do not resubmit", size: "720p", seconds: "5", cost: 0, requestBody: "{}", idempotencyKey: videoOperation });
    const recovery = makeSession(poor); recovery.preparedBilling = { billingVersion: 999, billingCredits: 999, billingOperationId: "stale" };
    same(await precheck(recovery, "generate_video", {}, videoCall), undefined, "original derived video operation recovers known receipt");
    same(recovery.preparedBilling, undefined, "recovery clears previous prepared billing");
    same(await precheck(makeSession(poor), "generate_video", { operation_id: videoOperation }, "different-call"), undefined, "explicit original video operation recovers receipt");
    // Video-stage content approval stays in its own workflow state, not quote-consent text.
    await ensureVideoWorkflowSchema(); const run = randomUUID();
    await db.getPool().query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,public_frozen_nodes) VALUES($1,$2,'fixture-project','{}','fixture',$3::jsonb)", [run, owner, JSON.stringify({ stage: { version: recoveredQuote.configVersion, credits: 0, authorizedCredits: 0 } })]);
    await db.getPool().query("INSERT INTO app_video_workflow_run_nodes(run_id,node_id,status) VALUES($1,'stage','completed')", [run]);
    const completedStage = await precheck(makeSession(), "confirm_video_workflow_stage", { run_id: run, stage_id: "stage" }, "completed-stage"); check(completedStage?.block && completedStage.reason.includes("此阶段无需确认"), "video content stage confirmation status still matters");
    await db.getPool().query("UPDATE app_video_workflow_run_nodes SET status='needs_confirmation' WHERE run_id=$1", [run]);
    same(await precheck(makeSession(), "confirm_video_workflow_stage", { run_id: run, stage_id: "stage" }, "pending-stage"), undefined, "original pending workflow stage remains confirmable");
    // The precheck does not spend money. Settlement retains the original quote and receipt.
    const { quote } = await import("../src/lib/billing/quote");
    const settlementSnapshot = structuredClone(await runtime.config.current()); settlementSnapshot.config.features["image.generate"].pricing = { mode: "fixed", credits: 3 };
    const settlementQuote = quote(settlementSnapshot, { feature: "image.generate", quantity: 1, quality: "medium", resolution: "1K", modelId: "image-a", providerId: "p1", userGroup: "default", byok: false, metered: true, paidFen: 0 });
    const input = { id: randomUUID(), email: owner, quote: settlementQuote, reason: "fixture original-price receipt", ledgerId: randomUUID(), fingerprint: randomUUID() };
    const before = await db.getUser(owner), result = { state: "succeeded" as const, items: [{ id: "fixture-result", state: "succeeded" as const }] };
    await withBillingTransaction(db.getPool(), tx => service.reserveTx(tx, input));
    const settled = await withBillingTransaction(db.getPool(), tx => service.settleTx(tx, input, result));
    const repeated = await withBillingTransaction(db.getPool(), tx => service.settleTx(tx, input, result));
    same(settled.charge, 3, "settlement uses original frozen price"); same(repeated.replayed, true, "duplicate settlement returns receipt");
    const after = await db.getUser(owner); same(before!.creditsTotal - before!.creditsUsed - (after!.creditsTotal - after!.creditsUsed), 3, "receipt charges once only");
    // A real managed fixed override retains preset execution metadata. Its customer
    // price is not a cost-plus cap, including an archived quote with a larger reserve.
    const { freezeImagePresetQuote } = await import("../src/lib/model-config/business-billing");
    const { initializeImagePreset } = await import("../src/lib/model-config/image-preset");
    const presetModels = structuredClone(acceptedModel);
    presetModels.config.defaultImagePreset = { ...initializeImagePreset(presetModels.config, settlementSnapshot), enabled: true };
    const fixedSnapshot = structuredClone(settlementSnapshot);
    fixedSnapshot.config.features["image.generate"].rules = [{ id: "mvp-credit-fixture-fixed", priority: 1000, when: { modelId: ["image-a"] }, pricing: { mode: "fixed", credits: 3 } }];
    const override = freezeImagePresetQuote(fixedSnapshot, presetModels, settlementQuote.facts, quote)!;
    same(override.tariff.pricing.mode, "fixed", "managed customer fixed price remains fixed");
    same(override.requestedCredits, 3, "managed override customer unit price is unchanged");
    check(override.imagePreset, "fixed override keeps execution preset metadata");
    await withBillingTransaction(db.getPool(), tx => service.grantTx(tx, { id: randomUUID(), email: poor, amount: 3, source: "admin", reason: "fixed override exact-balance fixture", expiry: { unit: "years", value: 1 }, ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture" }));
    const presetJob = randomUUID(), plainJob = randomUUID();
    const archivedFixed = { ...override, authorizedCredits: 50, reserveCredits: 50 };
    const { imagePreset: _metadata, ...plainFixed } = archivedFixed;
    await createImageJob(presetJob, poor, "aplus", { status: "review", cost: 3 }, { billingQuote: archivedFixed }, 3, false);
    await createImageJob(plainJob, poor, "aplus", { status: "review", cost: 3 }, { billingQuote: plainFixed }, 3, false);
    const exactPreset = makeSession(poor), exactPlain = makeSession(poor);
    const presetResult = await precheck(exactPreset, "continue_aplus_generation", { job_id: presetJob }, "fixed-preset");
    const plainResult = await precheck(exactPlain, "continue_aplus_generation", { job_id: plainJob }, "fixed-plain");
    same(plainResult, undefined, "plain fixed-price recovery accepts exact requested balance");
    same(!!presetResult?.block, baseline, "preset metadata does not increase fixed-price balance requirement");
    if (!baseline) { same(presetResult, plainResult, "fixed override with or without preset is balance-equivalent"); same(exactPreset.preparedBilling?.billingCredits, 3, "fixed preset uses requested customer price, not archived cap"); }
    // The cost-plus tariff still checks its actual authorization cap without a
    // redundant confirmation wait, including when no preset metadata is present.
    const apiSnapshot = structuredClone(settlementSnapshot);
    apiSnapshot.config.features["image.generate"].pricing = { mode: "api-cost-plus", factorBps: 10000, estimateCnyMicros: "300000", authorizationCnyMicros: "5000000", creditsPerCnyMicros: "10000000", rounding: "ceil" };
    const apiQuote = quote(apiSnapshot, settlementQuote.facts), apiJob = randomUUID();
    same(apiQuote.requestedCredits, 3, "cost-plus estimate fixture is three credits"); same(apiQuote.authorizedCredits, 50, "cost-plus fixture cap is fifty credits");
    await createImageJob(apiJob, poor, "aplus", { status: "review", cost: 3 }, { billingQuote: apiQuote }, 3, false);
    const apiResult = await precheck(makeSession(poor), "continue_aplus_generation", { job_id: apiJob }, "actual-cost-plus");
    same(!!apiResult?.block, !baseline, "real tariff mode, not preset presence, determines cost-plus balance check");
    if (!baseline) same(apiResult?.attention, "restricted", "real cost-plus cap still needs sufficient balance");
    // Generic execution budgets, argument validation, replay and explicit cancellation remain real Harness behavior.
    const h = new harness.AgentHarness(owner, "fixture-agent"), schema = { type: "object", properties: { prompt: { type: "string" }, confirm: { type: "boolean" } }, required: ["prompt"], additionalProperties: false };
    h.configure([{ name: "write", parameters: schema, write: true }]); h.begin("生成原请求", () => undefined);
    const rejectsCode = async (action: () => unknown, code: string) => { let actual = ""; try { await action(); } catch (error) { actual = (error as { code?: string }).code || ""; } same(actual, code, `Harness preserves ${code}`); };
    try {
      await rejectsCode(() => h.check("unknown", {}), "TOOL_DENIED"); await rejectsCode(() => h.check("write", { prompt: 123 }), "ARGUMENT_INVALID");
      const a = { prompt: "unique-write" }; h.permit("write", a, "write-original"); same(await h.execute("write", a, "write-original", undefined, async () => "receipt"), "receipt", "original execution returns receipt");
      await rejectsCode(() => h.execute("write", a, "write-original", undefined, async () => "duplicate"), "REPLAY_BLOCKED");
      h.permit("write", { ...a, confirm: true }, "different-confirm"); await rejectsCode(() => h.execute("write", { ...a, confirm: true }, "different-confirm", undefined, async () => "duplicate"), "REPLAY_BLOCKED");
      for (let i = 1; i < harness.HARNESS_LIMITS.writeCalls; i++) { const a = { prompt: `unique-${i}` }; h.permit("write", a, `write-${i}`); await h.execute("write", a, `write-${i}`, undefined, async () => "receipt"); }
      await rejectsCode(() => h.check("write", { prompt: "over-budget" }), "BUDGET_EXCEEDED");
    } finally { h.finish(); }
    const cancelled = new harness.AgentHarness(owner, "cancelled-agent"); cancelled.configure([{ name: "write", parameters: schema, write: true }]); cancelled.begin("取消前的任务", () => undefined); cancelled.stop();
    try { await rejectsCode(() => cancelled.check("write", { prompt: "cancelled" }), "RUN_INACTIVE"); } finally { cancelled.finish(); }
    const runtimeSource = readFileSync(path.join(sourceRoot, projection[1]), "utf8");
    same(runtimeSource.includes("session.userConfirmedQuote = explicitQuoteConsent(input)"), baseline, "runtime pricing lexical authorization removed only in modified projection");
    check(runtimeSource.includes("session.harness.permit(toolCall.name, args, toolCall.id)"), "runtime still binds original call permit");
    same(forbiddenRequests, 0, "no generation/supplier endpoint was requested"); same(externalRequests, 0, "no external request was attempted");
    observations.checks = checks; observations.sourceHashes = Object.fromEntries(projection.map(file => [file, createHash("sha256").update(readFileSync(path.join(sourceRoot, file))).digest("hex")]));
    if (option("--report")) writeFileSync(path.resolve(option("--report")!), JSON.stringify({ mode: baseline ? "baseline" : "modified", projection: "owned-source-only/current-workspace-dependencies", ...observations, controlRequests, supplierRequests: forbiddenRequests, externalRequests }, null, 2) + "\n");
    console.log(`AGENT_PRICING_${baseline ? "BASELINE" : "MODIFIED"}=PASS CHECKS=${checks} LOW_PRICE_ALLOWED=${allowed} FIRST_BLOCKED=${firstBlocked} HIGH_PRICE=${baseline ? "WAITING" : "ALLOWED"} REAL_PRECHECK=1 REAL_PG=1 OWNED_PROJECTION=1 SUPPLIER_REQUESTS=${forbiddenRequests} EXTERNAL_REQUESTS=${externalRequests} ORIGINAL_PRICE=PASS DUPLICATE_RECEIPT=PASS USER_CANCEL=PASS FIXED_OVERRIDE=${baseline ? "PRESET_BLOCKED" : "BALANCE_EQUIVALENT"} COST_PLUS_CAP=${baseline ? "MISCLASSIFIED" : "ENFORCED"}`);
  } finally {
    globalThis.fetch = originalFetch;
    if (db) await db.getPool().end();
    await f.cleanup();
    if (oldOptions === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = oldOptions;
    console.log("FIXTURE_CLEANUP=PASS APP_POOL_ENDED=1 MODEL_POOLS_ENDED=1 RANDOM_SCHEMA_DROPPED=1 LOCAL_HTTP_CLOSED=1");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
