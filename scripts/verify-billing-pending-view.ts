import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { exposeAbandonedBillingOperations } from "../src/lib/billing/synchronous-operation";
import { readPendingOverview, readPendingSummary } from "../src/lib/billing/pending-read";
import { appendManagementLog } from "../src/lib/bi/management-log";
import { providerCapacityDetail, resetProviderBudget } from "../src/lib/model-config/capacity";
import { resetChannelProbes, supplierChannelKey } from "../src/lib/model-config/channel-scheduler";
import type { ModelConfig } from "../src/lib/model-config/types";

/** Isolated-PostgreSQL regression for the pending-review read model: the
 * worker-tick exposure conversion, the four-source aggregation join and the
 * provider capacity detail/reset SQL, against the real module code. */
async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || url.hostname !== "127.0.0.1") throw new Error("Requires isolated local PostgreSQL");
  process.env.SETTINGS_SECRET ||= "billing-pending-fixture-secret-0123456789abcdef";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const schema = `pending_test_${randomUUID().replace(/-/g, "")}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  // Module code calls getPool() from DATABASE_URL; point it at the scratch
  // schema before the first pool is created, so every surface is isolated.
  const scoped = new URL(process.env.DATABASE_URL!);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = scoped.toString();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, max: 5 });
  try {
    await pool.query(`
      CREATE TABLE app_account_creation_policies(email text PRIMARY KEY,policy jsonb NOT NULL);
      CREATE TABLE app_billing_operations(id text PRIMARY KEY,email text NOT NULL,feature text NOT NULL,quote jsonb NOT NULL DEFAULT '{}'::jsonb,request_fingerprint text NOT NULL DEFAULT '',state text NOT NULL,reserved_credits integer NOT NULL DEFAULT 0,charged_credits integer NOT NULL DEFAULT 0,ledger_id text NOT NULL DEFAULT '',result_response jsonb,settlement_result jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE app_image_jobs(id text PRIMARY KEY,email text NOT NULL,kind text NOT NULL,snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,payload jsonb NOT NULL DEFAULT '{}'::jsonb,cost integer NOT NULL DEFAULT 0,reserved_cost integer NOT NULL DEFAULT 0,metered boolean NOT NULL DEFAULT false,billing_settled boolean NOT NULL DEFAULT false,lease_token text,lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE app_canvas_image_tasks(id text PRIMARY KEY,email text NOT NULL,kind text NOT NULL DEFAULT 'text-edit',source_artwork_id text NOT NULL DEFAULT '',parameters jsonb NOT NULL DEFAULT '{}'::jsonb,status text NOT NULL DEFAULT 'queued',progress integer NOT NULL DEFAULT 0,cost integer NOT NULL DEFAULT 0,result_artwork_id text NOT NULL DEFAULT '',error text NOT NULL DEFAULT '',attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,credits_refunded boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
      CREATE TABLE app_video_tasks(id text PRIMARY KEY,email text NOT NULL,upstream_id text NOT NULL DEFAULT '',model text NOT NULL DEFAULT '',prompt text NOT NULL DEFAULT '',size text NOT NULL DEFAULT '',seconds text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'processing',cost integer NOT NULL DEFAULT 0,request_body text NOT NULL DEFAULT '',progress integer NOT NULL DEFAULT 0,artwork_id text NOT NULL DEFAULT '',video_url text NOT NULL DEFAULT '',error text NOT NULL DEFAULT '',poll_lock_until timestamptz,credits_refunded boolean NOT NULL DEFAULT false,last_polled_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),error_code text NOT NULL DEFAULT '');
      CREATE TABLE app_model_capacity_accounts(alias text PRIMARY KEY,identity text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE app_model_provider_budgets(identity text PRIMARY KEY,max_concurrent integer NOT NULL);
      CREATE TABLE app_model_provider_leases(identity text NOT NULL,token text PRIMARY KEY,expires_at timestamptz NOT NULL);
      CREATE TABLE app_model_channel_health(key text PRIMARY KEY,failures int NOT NULL DEFAULT 0,open_until timestamptz,probe_until timestamptz,last_status int,last_success_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE app_model_channel_health ADD COLUMN last_failure_kind text;
      ALTER TABLE app_model_channel_health ADD COLUMN last_failure_at timestamptz;
      ALTER TABLE app_model_channel_health ADD COLUMN probe_token uuid;
    `);
    const insertOp = (id: string, state: string, ageMinutes: number, reserved = 6) =>
      pool.query("INSERT INTO app_billing_operations(id,email,feature,state,reserved_credits,created_at,updated_at) VALUES($1,$2,'tool.cutout',$3,$4,now()-($5*interval '1 minute'),now()-($5*interval '1 minute'))", [id, "user@example.com", state, reserved, ageMinutes]);
    await insertOp("tool-stale-old", "reserved", 40);
    await insertOp("op-canvas", "reserved", 50, 3);
    await insertOp("op-image-job", "reserved", 60, 8);
    await insertOp("op-video", "reserved", 70, 30);
    await insertOp("tool-fresh", "reserved", 2);
    await insertOp("op-unlinked", "reserved", 80);
    await insertOp("op-settled", "settled", 90);
    await pool.query("INSERT INTO app_canvas_image_tasks(id,email,status,cost,error,updated_at) VALUES('op-canvas','canvas@example.com','needs_attention',3,'上游提交未确认',now()-interval '10 minutes')");
    await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,reserved_cost,updated_at) VALUES('op-image-job','job@example.com','generate',JSONB_BUILD_OBJECT('status','needs_attention','error','生成中断','failureDiagnostic','供应商提交后无回执'),8,now()-interval '20 minutes')");
    await pool.query("INSERT INTO app_video_tasks(id,email,status,model,cost,error_code,error,updated_at) VALUES('op-video','video@example.com','needs_attention','video-x',30,'poll_unknown','轮询结果未知',now()-interval '30 minutes')");
    await pool.query("INSERT INTO app_video_tasks(id,email,status,model,cost,error_code,error,updated_at) VALUES('video-plain','video2@example.com','needs_attention','video-y',0,'creation_unknown','停止请求已保留',now()-interval '5 minutes')");

    const projected=await readPendingOverview(pool);
    assert.equal(projected.summary["billing-operation"].count,4,"overview includes the due reservations before the worker");
    assert.equal((await readPendingSummary(pool)).total,4,"the badge still counts only stored operation state and visible tasks");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_billing_operations WHERE state='manual'")).rows[0].n,0,"overview does not write the projected state");
    const exposed = await exposeAbandonedBillingOperations();
    assert.equal(exposed, 4, "expose converts exactly the four linked/stale operations");
    const states = Object.fromEntries((await pool.query("SELECT id,state FROM app_billing_operations")).rows.map(row => [row.id, row.state]));
    assert.equal(states["tool-stale-old"], "manual");
    assert.equal(states["op-canvas"], "manual");
    assert.equal(states["op-image-job"], "manual");
    assert.equal(states["op-video"], "manual");
    assert.equal(states["tool-fresh"], "reserved", "fresh unlinked tool reservation stays reserved");
    assert.equal(states["op-unlinked"], "reserved", "old reservation without task linkage stays reserved");
    assert.equal(states["op-settled"], "settled", "settled operations are never touched");
    console.log("PASS exposure converts stale and task-linked reservations, spares fresh/settled ones");

    const view = await readPendingOverview(pool);
    assert.deepEqual(view.items,projected.items);assert.deepEqual(view.summary,projected.summary);
    assert.equal(view.summary["billing-operation"].count, 4);
    assert.equal(view.summary["image-job"].count, 1);
    assert.equal(view.summary["canvas-task"].count, 1);
    assert.equal(view.summary["video-task"].count, 2);
    assert.equal(view.summary.total, 8);
    assert.equal(view.items.length, 8);
    assert.equal(view.items[0].id, "op-video", "oldest updatedAt sorts first");
    const byId = new Map(view.items.map(item => [item.id, item]));
    assert.equal(byId.get("op-canvas")!.operationState, "manual", "task rows carry linked operation state");
    assert.equal(byId.get("video-plain")!.operationState, null, "unlinked task rows have no operation state");
    assert.equal(byId.get("video-plain")!.errorCode, "creation_unknown");
    assert.equal(byId.get("op-image-job")!.error, "供应商提交后无回执", "failureDiagnostic preferred over error");
    assert.equal(byId.get("tool-stale-old")!.source, "billing-operation");
    assert.equal(byId.get("tool-stale-old")!.reservedCredits, 6);
    assert.ok(!view.items.some(item => item.id === "op-settled"), "settled operations are not listed");
    assert.ok(!view.items.some(item => item.id === "tool-fresh"), "fresh reservations are not listed");
    console.log("PASS pending view aggregates four sources with linkage, ordering and reserved credits");

    const summary = await readPendingSummary(pool);
    assert.equal(summary.total, 8, "badge summary counts the same backlog without item lists or exposure writes");
    const reservedBefore = (await pool.query("SELECT count(*)::int AS n FROM app_billing_operations WHERE state='reserved'")).rows[0].n;
    assert.equal(reservedBefore, 2, "summary view is read-only: no exposure conversion happened");
    console.log("PASS pending summary view exposes badge total without side effects");

    const baseUrl = "https://p1.example.com";
    const logical = createHash("sha256").update(`p1\n${new URL(baseUrl).origin}`).digest("hex");
    await pool.query("INSERT INTO app_model_capacity_accounts(alias,identity) VALUES($1,'merged-1')", [logical]);
    await pool.query("INSERT INTO app_model_provider_budgets(identity,max_concurrent) VALUES('merged-1',2)");
    await pool.query("INSERT INTO app_model_provider_leases(identity,token,expires_at) VALUES('merged-1','lease-live',now()+interval '5 minutes'),('merged-1','lease-dead',now()-interval '1 minute')");
    const config = {
      providers: [{ id: "p1", name: "P1", baseUrl, enabled: true, maxConcurrent: 5, timeoutMs: 30000 }],
      upstreamModels: [{ id: "u1", providerId: "p1", model: "wire-model-1" }],
    } as unknown as ModelConfig;
    const detail = await providerCapacityDetail(pool, config);
    assert.equal(detail.length, 1);
    assert.equal(detail[0].budgetMaxConcurrent, 2);
    assert.equal(detail[0].configuredMaxConcurrent, 5);
    assert.equal(detail[0].inFlight, 1, "expired leases are not in flight");
    assert.equal(detail[0].merged, true, "alias resolution reports merged identity");
    assert.deepEqual(detail[0].leases.map(lease => lease.token), ["lease-live"]);
    console.log("PASS capacity detail exposes budget drift, merged identity and live leases");

    const reset = await resetProviderBudget(pool, "p1", config);
    assert.deepEqual(reset, { providerId: "p1", identity: "merged-1", previous: 2, restored: 5, changed: true });
    const repeat = await resetProviderBudget(pool, "p1", config);
    assert.equal(repeat.changed, false, "second reset is a no-op");
    await assert.rejects(() => resetProviderBudget(pool, "missing", config), error => (error as { code?: string }).code === "PROVIDER_UNAVAILABLE");
    console.log("PASS budget reset restores published limit and rejects unknown providers");

    const healthKey = supplierChannelKey({ providerId: "p1", baseUrl, wireModel: "wire-model-1" });
    await pool.query("INSERT INTO app_model_channel_health(key,failures,open_until,last_status,last_failure_kind,last_failure_at) VALUES($1,3,now()+interval '5 minutes',503,'upstream_5xx',now()-interval '2 minutes')", [healthKey]);
    const probeReset = await resetChannelProbes(pool, "p1", "u1", config);
    assert.equal(probeReset.cleared, true);
    assert.equal(probeReset.wireModel, "wire-model-1");
    assert.equal(probeReset.previous?.failures, 3, "previous facts are returned for the audit record");
    assert.ok(probeReset.previous?.cooldownUntil, "cooldown deadline is part of the previous facts");
    const health = (await pool.query("SELECT failures,open_until,probe_until,probe_token FROM app_model_channel_health WHERE key=$1", [healthKey])).rows[0];
    assert.equal(health.failures, 0);
    assert.equal(health.open_until, null, "open cooldown is cleared so claimChannel considers the channel again");
    assert.equal(health.probe_until, null);
    assert.equal(health.probe_token, null);
    await assert.rejects(() => resetChannelProbes(pool, "p1", "missing-upstream", config), error => (error as { code?: string }).code === "CHANNEL_UNAVAILABLE");
    await assert.rejects(() => resetChannelProbes(pool, "other-provider", "u1", config), error => (error as { code?: string }).code === "CHANNEL_UNAVAILABLE");
    console.log("PASS channel probe reset clears cooldown and failures, rejects channels outside the published config");

    const logId = await appendManagementLog({ actor: "admin@example.com", subject: "provider:p1", action: "channel-budget-reset", reason: "发布并发已恢复", changes: { providerId: "p1", previous: 2, restored: 5, changed: true } });
    // entry.subject persists in the email column (typed subject convention).
    const logRow = (await pool.query("SELECT actor,email,action,reason,changes FROM app_bi_management_log WHERE id=$1", [logId])).rows[0];
    assert.equal(logRow.email, "provider:p1");
    assert.equal(logRow.action, "channel-budget-reset");
    assert.equal(logRow.reason, "发布并发已恢复");
    assert.equal(logRow.changes.restored, 5, "before/after facts persist as jsonb for the management log page");
    console.log("PASS management log records audit entries with typed subject and fact-only changes");
  }
  finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
