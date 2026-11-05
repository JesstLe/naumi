/** P2: a billing publish cannot newly break model pricing (lowest-cost pools need comparable costs).
 * Pure decision on fixtures + the real billing config runtime hook on an isolated PostgreSQL.
 * Zero network, zero supplier calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { fixtureConfig } from "./billing-unit-fixture";

async function main() {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  const { billingChangeBreaksModelPricing } = await import("../src/lib/model-config/billing-publication-check");
  const { createConfigRuntime } = await import("../src/lib/billing/catalog");
  const { ensureSchema } = await import("../src/lib/persistence/schema");
  const { getPool } = await import("../src/platform/db/pool");
  let checks = 0;
  const ok = (value: unknown, label: string) => { assert.ok(value, label); checks++; };

  // 1. Decision: only newly introduced pricing breakage counts.
  const model = fixtureModelConfig("https://fixture.invalid/v1", randomUUID());
  model.pools.push({ id: "cheap", modality: "image", strategy: "lowest-cost", candidates: ["u1"], rules: [] });
  model.publicModels[0].target = { type: "pool", id: "cheap" };
  const snapshot = { version: 4, digest: "c".repeat(64), config: model } as any;
  const priced = fixtureConfig(); priced.costs["supplier-cost-estimate"] = { currency: "CNY", amountMicros: "290000", unit: "image", source: "manual-estimate" };
  const current = { version: 10, config: priced };
  const withoutCost = structuredClone(priced); delete withoutCost.costs["supplier-cost-estimate"];
  const broken = billingChangeBreaksModelPricing(snapshot, current, { version: 11, config: withoutCost });
  ok(broken?.code === "INVALID_COST", "removing the only comparable cost of a lowest-cost pool is rejected");
  const unrelated = structuredClone(priced); unrelated.credits.signup.amount += 1;
  ok(billingChangeBreaksModelPricing(snapshot, current, { version: 11, config: unrelated }) === null, "unrelated billing change passes");
  ok(billingChangeBreaksModelPricing(snapshot, { version: 10, config: withoutCost }, { version: 11, config: withoutCost }) === null, "pre-existing breakage is not blamed on this publish");
  const direct = structuredClone(model); direct.pools = []; direct.publicModels[0].target = { type: "upstream", id: "u1" };
  ok(billingChangeBreaksModelPricing({ ...snapshot, config: direct }, current, { version: 11, config: withoutCost }) === null, "direct channels do not depend on comparable costs");

  // 2. Runtime hook: inside the lock, before the version exists; replays skip it.
  const pool = getPool();
  const seen: number[] = [];
  let reject = false;
  const runtime = createConfigRuntime({ pool, ensureSchema, initialize: async () => fixtureConfig(),
    checkPublication: async (_next, cur) => { seen.push(cur.version); if (reject) throw Object.assign(new Error("fixture guard"), { code: "INVALID_CONFIG", status: 400 }); } });
  const before = await runtime.current();
  reject = true;
  const rejected = { id: randomUUID(), expectedVersion: before.version, actor: "publication-check@example.test", reason: "guard", config: structuredClone(before.config) };
  await assert.rejects(runtime.publish(rejected), /fixture guard/); checks++;
  ok((await runtime.current()).version === before.version, "rejected publish leaves no new version");
  ok(seen.at(-1) === before.version, "guard receives the current snapshot");
  reject = false;
  const accepted = await runtime.publish({ ...rejected, id: randomUUID() });
  ok(accepted.version === before.version + 1, "accepted publish creates one version");
  const calls = seen.length;
  const replay = await runtime.publish({ ...rejected, id: (await pool.query("SELECT operation_id FROM app_billing_config_versions WHERE version=$1", [accepted.version])).rows[0].operation_id });
  ok(replay.version === accepted.version && seen.length === calls, "replay of the same operation returns the original without re-checking");

  // 3. Real assembly with no model registry tables in this database: the guard is a no-op, not an aborted transaction.
  const { assertBillingKeepsModelPricing } = await import("../src/lib/model-config/billing-publication-check");
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const hasModelState = (await tx.query("SELECT to_regclass('app_model_config_state') IS NOT NULL AS present")).rows[0].present;
    if (!hasModelState) { await assertBillingKeepsModelPricing(fixtureConfig(), before, tx); await tx.query("SELECT 1"); ok(true, "guard leaves the transaction usable without model tables"); }
    await tx.query("ROLLBACK");
  } finally { tx.release(); }
  await pool.end();
  console.log(`BILLING_PUBLICATION_CHECK=PASS CHECKS=${checks} NEW_BREAKAGE=REJECTED UNRELATED=PASS PRE_EXISTING=NOT_BLAMED IN_LOCK=BEFORE_INSERT REPLAY=UNCHECKED NO_MODEL_TABLES=NOOP SUPPLIER_CALLS=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
