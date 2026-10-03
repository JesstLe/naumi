import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { createModelRuntime } from "../src/lib/model-config/runtime";
import { createModelExecutor } from "../src/lib/model-config/execution";
import { createRouterControl } from "../src/lib/model-config/router-client";
import { createConfigRuntime } from "../src/lib/billing/catalog";

async function main() {
  const f = await createModelFixture();
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  const db = await import("../src/lib/db");
  const billing = { version: 1, config: fixtureConfig() };
  billing.config.costs["supplier-cost-estimate"] = { currency: "CNY", amountMicros: "290000", unit: "image", source: "manual-estimate" };
  const billingCatalog = createConfigRuntime({ pool: f.sql, ensureSchema: async () => {}, initialize: async () => billing.config });
  f.config.pools.push({ id: "performance-pool", modality: "image", strategy: "lowest-cost", candidates: ["u1"], rules: [] });
  f.config.publicModels[0].target = { type: "pool", id: "performance-pool" };
  const control = createRouterControl({ baseUrl: f.origin, token: "fixture-performance-control-token-independent", envelopeSecret: "fixture-performance-envelope-key-independent", trustedOrigins: [f.origin] });
  let prepares = 0;
  const router = { ...control, prepare: async () => { prepares++; } };
  const runtime = createModelRuntime({ pool: f.sql, repo: f.repo, credentials: f.credentials, router, billing: async () => billing, trustedOrigins: [f.origin] });
  const executor = createModelExecutor({ runtime, credentials: f.credentials, trustedOrigins: [f.origin], gateway: () => ({ baseUrl: f.origin, apiKey: "fixture-performance-never-sent" }) });
  const original = Client.prototype.query;
  let modelCurrentQueries = 0, immutableQueries = 0, totalConfigQueries = 0, billingQueries = 0;
  const facts = { task: "product" as const, quality: "medium", resolution: "1K", needsEdit: false, preserveIdentity: false, needsText: false, nativeResolution: false, references: 0 };
  try {
    const initial = await f.repo.current();
    await db.ensureSchema();
    await billingCatalog.current();
    await runtime.prepareExecution({ snapshot: initial, billing });
    await f.repo.byVersion(initial.version);
    (Client.prototype as any).query = function (...args: any[]) {
      const sql = String(args[0]);
      if (sql.startsWith("SELECT") && /app_model_(config|router)/.test(sql)) totalConfigQueries++;
      if (sql.includes("JOIN app_model_config_versions v ON v.version=s.active_version")) modelCurrentQueries++;
      if (sql.includes("SELECT * FROM app_model_config_versions WHERE version=$1")) immutableQueries++;
      if (sql.startsWith("SELECT") && sql.includes("app_billing_config_versions")) billingQueries++;
      return (original as any).apply(this, args);
    };
    const output = [];
    for (const concurrency of [1,10]) {
      modelCurrentQueries = 0; immutableQueries = 0; totalConfigQueries = 0; billingQueries = 0;
      const timings: number[] = []; let failures = 0, maxPoolWaiting = 0;
      const started = performance.now(), beforePrepare = prepares;
      for (let i = 0; i < 500; i += concurrency) await Promise.all(Array.from({ length: concurrency }, async () => {
        const at = performance.now();
        try {
          const [snapshot, taskBilling] = await Promise.all([runtime.current(),billingCatalog.current()]);
          const frozen = await executor.resolve({ binding: "image.generate", snapshot, billing: taskBilling, facts });
          await executor.runBundle({ modelVersion: snapshot.version, billingVersion: taskBilling.version, image: frozen }, taskBilling, async () => {});
        } catch (error) { failures++; if (failures === 1) console.error(error); }
        timings.push(performance.now() - at);
        maxPoolWaiting = Math.max(maxPoolWaiting,f.sql.waitingCount);
      }));
      timings.sort((a,b) => a-b);
      output.push({ samples: 500, concurrency, p50Ms: timings[250], p95Ms: timings[475], tasksPerSecond: 500000/(performance.now()-started), failures, modelCurrentQueries, billingQueries, immutableQueries, totalConfigQueries, prepares: prepares-beforePrepare, maxPoolWaiting, supplierRequests: 0 });
      assert.equal(failures,0); assert.equal(modelCurrentQueries,500); assert.equal(billingQueries,500); assert.equal(prepares,beforePrepare);
      assert.equal(immutableQueries,0,"Warm immutable versions must not repeatedly query historical configuration for every task");
    }
    await mkdir("output/model-config-20261004",{recursive:true});
    await writeFile("output/model-config-20261004/performance.json",JSON.stringify({ environment: { node: process.version, poolMax: 5, postgres: "isolated PostgreSQL", scope: "registry resolve + frozen Router pair validation", supplier: "none" }, initialPrepareRequests: prepares, output },null,2));
    console.log(JSON.stringify(output));
  } finally { Client.prototype.query = original; await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
