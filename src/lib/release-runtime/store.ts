import { Pool, type PoolClient } from "pg";
import process from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { accountKey, releaseIdentity, releaseProcessRegistry, ReleaseRuntimeError } from "./identity";

const poolKey = Symbol.for("naumi.release.pg.v1");
export const OBSERVED_BACKGROUND_SCOPES = ["durable-image", "reference-text", "reference-sync", "imagegen-batch", "imagegen-child", "canvas-image", "media-job", "media-mirror", "media-variant", "supplier-scan", "video-poll", "video-workflow", "app-worker-scan"] as const;
const holder = process as typeof process & { [poolKey]?: { pool: Pool; ready?: Promise<void> } };
export function releasePool(): Pool {
  if (!process.env.DATABASE_URL) throw new ReleaseRuntimeError("RELEASE_DATABASE_UNCONFIGURED");
  return (holder[poolKey] ||= { pool: new Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 15000, connectionTimeoutMillis: 5000, statement_timeout: 8000 }) }).pool;
}
export async function ensureReleaseSchema(): Promise<void> {
  const pool = releasePool(), state = holder[poolKey]!;
  if (!state.ready) state.ready = (async () => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN"); await db.query("SELECT pg_advisory_xact_lock(17448521, 1)");
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_release_boots (
          instance_id text NOT NULL, boot_id uuid NOT NULL, commit_sha text NOT NULL,
          started_at timestamptz NOT NULL, last_seen timestamptz NOT NULL DEFAULT now(),
          admission text NOT NULL CHECK(admission IN ('open','draining')), revision integer NOT NULL DEFAULT 1,
          PRIMARY KEY(instance_id,boot_id)
        );
        CREATE TABLE IF NOT EXISTS app_release_controls (
          instance_id text NOT NULL, boot_id uuid NOT NULL, operation_id uuid NOT NULL,
          payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(instance_id,boot_id,operation_id)
        );
        CREATE TABLE IF NOT EXISTS app_release_session_owners (
          account_key text NOT NULL, session_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('workbench','canvas')),
          instance_id text NOT NULL, boot_id uuid NOT NULL, runtime_id uuid NOT NULL,
          run_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('running','idle','unknown')),
          updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_key,session_id,kind)
        );
        CREATE TABLE IF NOT EXISTS app_release_activities (
          id uuid PRIMARY KEY, instance_id text NOT NULL, boot_id uuid NOT NULL, runtime_id uuid NOT NULL,
          activity_kind text NOT NULL CHECK(activity_kind IN ('request','agent-run','accepted-work')),
          account_key text, session_id text, session_kind text, state text NOT NULL CHECK(state IN ('active','finished','unknown')),
          started_at timestamptz NOT NULL DEFAULT now(), heartbeat_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
          outcome text, detail text NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS app_release_activities_active ON app_release_activities(instance_id,boot_id,state,activity_kind);
        ALTER TABLE app_release_activities ADD COLUMN IF NOT EXISTS work_scope text;
        ALTER TABLE app_release_activities ADD COLUMN IF NOT EXISTS work_key text;
        ALTER TABLE app_release_activities ADD COLUMN IF NOT EXISTS claim_token text;
        ALTER TABLE app_release_activities ADD COLUMN IF NOT EXISTS admission_key text;
        ALTER TABLE app_release_activities ADD COLUMN IF NOT EXISTS parent_id uuid;
        CREATE INDEX IF NOT EXISTS app_release_background_lookup ON app_release_activities(work_scope,work_key) WHERE activity_kind='accepted-work';
        CREATE INDEX IF NOT EXISTS app_release_activities_finished ON app_release_activities(finished_at) WHERE state='finished';
        CREATE TABLE IF NOT EXISTS app_release_forward_receipts (
          target_boot uuid NOT NULL, nonce uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(target_boot,nonce)
        );
        CREATE INDEX IF NOT EXISTS app_release_forward_expiry ON app_release_forward_receipts(created_at);
        CREATE TABLE IF NOT EXISTS app_release_agent_continuations (
          nonce uuid PRIMARY KEY, run_id uuid NOT NULL, target_boot uuid NOT NULL,
          payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_release_agent_continuations_expiry ON app_release_agent_continuations(created_at);
      `);
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK").catch(() => undefined); throw e; } finally { db.release(); }
  })().catch((e) => { state.ready = undefined; throw e; });
  return state.ready;
}
async function transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  await ensureReleaseSchema(); const db = await releasePool().connect();
  try { await db.query("BEGIN"); const result = await fn(db); await db.query("COMMIT"); return result; }
  catch (e) { await db.query("ROLLBACK").catch(() => undefined); throw e; } finally { db.release(); }
}
type BootRow = { instance_id: string; boot_id: string; commit_sha: string; admission: "open" | "draining"; revision: number; started_at: Date; last_seen: Date };
async function register(db: PoolClient, identity = releaseIdentity()): Promise<BootRow> {
  const mode = process.env.NAUMI_RELEASE_ADMISSION_START;
  if (mode !== "open" && mode !== "draining") throw new ReleaseRuntimeError("RELEASE_ADMISSION_START_REQUIRED");
  await db.query(`INSERT INTO app_release_boots(instance_id,boot_id,commit_sha,started_at,admission) VALUES($1,$2,$3,$4,$5) ON CONFLICT(instance_id,boot_id) DO NOTHING`, [identity.instanceId, identity.bootId, identity.commit, identity.startedAt, mode]);
  const { rows } = await db.query<BootRow>("SELECT * FROM app_release_boots WHERE instance_id=$1 AND boot_id=$2 FOR UPDATE", [identity.instanceId, identity.bootId]);
  if (rows[0].commit_sha !== identity.commit) throw new ReleaseRuntimeError("RELEASE_BOOT_COMMIT_CONFLICT", 409);
  if (rows[0].started_at.toISOString() !== identity.startedAt) throw new ReleaseRuntimeError("RELEASE_BOOT_REUSED", 409);
  await db.query("UPDATE app_release_boots SET last_seen=now() WHERE instance_id=$1 AND boot_id=$2", [identity.instanceId, identity.bootId]);
  return rows[0];
}
export async function checkAdmission(): Promise<void> {
  await transaction(async (db) => { const boot = await register(db); if (boot.admission !== "open") throw new ReleaseRuntimeError("RELEASE_DRAINING", 503); });
}
export async function controlAdmission(input: unknown) {
  const body = input as Record<string, unknown>, identity = releaseIdentity();
  if (!body || body.instanceId !== identity.instanceId || body.bootId !== identity.bootId || !Number.isInteger(body.expectedRevision) || !/^[a-f0-9-]{36}$/i.test(String(body.operationId || "")) || !["drain", "resume"].includes(String(body.action))) throw new ReleaseRuntimeError("RELEASE_CONTROL_INVALID", 400);
  const hash = createHash("sha256").update(JSON.stringify([body.instanceId, body.bootId, body.expectedRevision, body.operationId, body.action])).digest("hex");
  return transaction(async (db) => {
    const boot = await register(db);
    const prior = await db.query("SELECT payload_hash,result FROM app_release_controls WHERE instance_id=$1 AND boot_id=$2 AND operation_id=$3", [identity.instanceId, identity.bootId, body.operationId]);
    if (prior.rows.length) { if (prior.rows[0].payload_hash !== hash) throw new ReleaseRuntimeError("RELEASE_OPERATION_CONFLICT", 409); return prior.rows[0].result; }
    if (boot.revision !== body.expectedRevision) throw new ReleaseRuntimeError("RELEASE_REVISION_CONFLICT", 409);
    const mode = body.action === "drain" ? "draining" : "open";
    const result = { identity, admission: { mode, revision: boot.revision + 1 }, operationId: body.operationId };
    await db.query("UPDATE app_release_boots SET admission=$3,revision=revision+1,last_seen=now() WHERE instance_id=$1 AND boot_id=$2", [identity.instanceId, identity.bootId, mode]);
    await db.query("INSERT INTO app_release_controls(instance_id,boot_id,operation_id,payload_hash,result) VALUES($1,$2,$3,$4,$5)", [identity.instanceId, identity.bootId, body.operationId, hash, JSON.stringify(result)]);
    return result;
  });
}
export type SessionOwner = { account_key: string; session_id: string; kind: "workbench" | "canvas"; instance_id: string; boot_id: string; runtime_id: string; run_id: string; state: "running" | "idle" | "unknown"; updated_at: Date };
export async function sessionOwner(email: string, sessionId: string, kind: "workbench" | "canvas"): Promise<SessionOwner | null> {
  await ensureReleaseSchema();
  const { rows } = await releasePool().query<SessionOwner>("SELECT * FROM app_release_session_owners WHERE account_key=$1 AND session_id=$2 AND kind=$3", [accountKey(email), sessionId, kind]);
  return rows[0] || null;
}
export async function beginAgentActivity(email: string, sessionId: string, kind: "workbench" | "canvas", id = randomUUID()): Promise<string> {
  const identity = releaseIdentity(), runtimeId = releaseProcessRegistry().runtimeId, account = accountKey(email);
  await transaction(async (db) => {
    const boot = await register(db);
    if (boot.admission !== "open") throw new ReleaseRuntimeError("RELEASE_DRAINING", 503);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${account}:${kind}:${sessionId}`]);
    const owner = (await db.query<SessionOwner>("SELECT * FROM app_release_session_owners WHERE account_key=$1 AND session_id=$2 AND kind=$3 FOR UPDATE", [account, sessionId, kind])).rows[0];
    if (owner && owner.state !== "idle") throw new ReleaseRuntimeError(owner.state === "unknown" ? "AGENT_OWNER_UNKNOWN" : "AGENT_RUN_ALREADY_ACCEPTED", 409);
    await db.query(`INSERT INTO app_release_session_owners(account_key,session_id,kind,instance_id,boot_id,runtime_id,run_id,state) VALUES($1,$2,$3,$4,$5,$6,$7,'running') ON CONFLICT(account_key,session_id,kind) DO UPDATE SET instance_id=excluded.instance_id,boot_id=excluded.boot_id,runtime_id=excluded.runtime_id,run_id=excluded.run_id,state='running',updated_at=now()`, [account, sessionId, kind, identity.instanceId, identity.bootId, runtimeId, id]);
    await db.query(`INSERT INTO app_release_activities(id,instance_id,boot_id,runtime_id,activity_kind,account_key,session_id,session_kind,state) VALUES($1,$2,$3,$4,'agent-run',$5,$6,$7,'active')`, [id, identity.instanceId, identity.bootId, runtimeId, account, sessionId, kind]);
  });
  return id;
}
export async function beginObservedActivity(kind: "request" | "accepted-work", detail: string): Promise<string> {
  const identity = releaseIdentity(), id = randomUUID();
  await transaction(async (db) => {
    await register(db);
    await db.query(`INSERT INTO app_release_activities(id,instance_id,boot_id,runtime_id,activity_kind,state,detail) VALUES($1,$2,$3,$4,$5,'active',$6)`, [id, identity.instanceId, identity.bootId, releaseProcessRegistry().runtimeId, kind, detail.slice(0, 200)]);
  }); return id;
}
/**
 * Work accepted for one account without a resident session (agent gateway calls). Admission must be
 * open; the row is tracked as accepted work, can parent signed continuations, and has no session owner.
 */
export async function beginAccountWork(email: string, detail: string): Promise<string> {
  const identity = releaseIdentity(), id = randomUUID();
  await transaction(async (db) => {
    const boot = await register(db);
    if (boot.admission !== "open") throw new ReleaseRuntimeError("RELEASE_DRAINING", 503);
    await db.query(`INSERT INTO app_release_activities(id,instance_id,boot_id,runtime_id,activity_kind,account_key,state,detail) VALUES($1,$2,$3,$4,'accepted-work',$5,'active',$6)`, [id, identity.instanceId, identity.bootId, releaseProcessRegistry().runtimeId, accountKey(email), detail.slice(0, 200)]);
  });
  return id;
}
export type AcceptedParent = { id: string; account: string | null; instanceId: string; bootId: string };
export async function activeAcceptedParent(parent: AcceptedParent): Promise<boolean> {
  await ensureReleaseSchema();
  const result = await releasePool().query("SELECT 1 FROM app_release_activities WHERE id=$1 AND instance_id=$2 AND boot_id=$3 AND account_key IS NOT DISTINCT FROM $4 AND activity_kind IN ('agent-run','accepted-work') AND state='active' AND heartbeat_at>now()-interval '45 seconds'", [parent.id,parent.instanceId,parent.bootId,parent.account]);
  return result.rowCount === 1;
}
export async function consumeAgentContinuation(nonce: string, runId: string, payloadHash: string): Promise<void> {
  await ensureReleaseSchema();
  const inserted=await releasePool().query("INSERT INTO app_release_agent_continuations(nonce,run_id,target_boot,payload_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[nonce,runId,releaseIdentity().bootId,payloadHash]);
  if(!inserted.rowCount)throw new ReleaseRuntimeError("AGENT_CONTINUATION_REPLAY",409);
  await releasePool().query("DELETE FROM app_release_agent_continuations WHERE nonce IN(SELECT nonce FROM app_release_agent_continuations WHERE created_at<now()-interval '2 minutes' ORDER BY created_at LIMIT 100)");
}
export async function beginBackgroundActivity(scope: string, workKey: string, admission: "claim" | "continuation", parent?: AcceptedParent): Promise<string | null> {
  const identity = releaseIdentity(), id = randomUUID();
  return transaction(async (db) => {
    const boot = await register(db);
    if (admission === "claim" && boot.admission !== "open") {
      if(!parent)return null;
      const accepted=await db.query("SELECT 1 FROM app_release_activities WHERE id=$1 AND instance_id=$2 AND boot_id=$3 AND account_key IS NOT DISTINCT FROM $4 AND activity_kind IN ('agent-run','accepted-work') AND state='active' AND heartbeat_at>now()-interval '45 seconds' FOR SHARE",[parent.id,parent.instanceId,parent.bootId,parent.account]);
      if(!accepted.rowCount)return null;
    }
    if (admission === "claim") {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`release-background:${scope}:${workKey}`]);
      const existing = await db.query("SELECT 1 FROM app_release_activities WHERE activity_kind='accepted-work' AND work_scope=$1 AND admission_key=$2 AND state IN ('active','unknown') LIMIT 1", [scope, workKey.slice(0, 300)]);
      // A previous detached promise or orphan is not evidence that retrying a
      // new paid submission is harmless. The business recovery path may still
      // perform explicit GET-only continuation under a different scope.
      if (existing.rowCount) return null;
    }
    await db.query(`INSERT INTO app_release_activities(id,instance_id,boot_id,runtime_id,activity_kind,state,detail,work_scope,work_key,admission_key,parent_id) VALUES($1,$2,$3,$4,'accepted-work','active',$5,$6,$7,$7,$8)`, [id, identity.instanceId, identity.bootId, releaseProcessRegistry().runtimeId, `${scope}:${admission}`, scope, workKey.slice(0, 300),parent?.id||null]);
    return id;
  });
}
export async function bindBackgroundActivity(id: string, workKey: string, token?: string): Promise<void> {
  const identity = releaseIdentity(); await ensureReleaseSchema();
  const changed = await releasePool().query("UPDATE app_release_activities SET work_key=$4,claim_token=$5,heartbeat_at=now() WHERE id=$1 AND instance_id=$2 AND boot_id=$3 AND state='active' AND activity_kind='accepted-work'", [id, identity.instanceId, identity.bootId, workKey.slice(0, 300), token?.slice(0, 200) || null]);
  if (changed.rowCount !== 1) throw new ReleaseRuntimeError("RELEASE_BACKGROUND_CLAIM_UNBOUND", 409);
}
export async function heartbeatActivity(id: string): Promise<void> {
  const identity = releaseIdentity();
  await ensureReleaseSchema();
  const result = await releasePool().query("UPDATE app_release_activities SET heartbeat_at=now() WHERE id=$1 AND instance_id=$2 AND boot_id=$3 AND state='active'", [id, identity.instanceId, identity.bootId]);
  if (result.rowCount !== 1) throw new ReleaseRuntimeError("RELEASE_ACTIVITY_LEASE_LOST", 409);
}
export async function finishActivity(id: string, outcome = "completed"): Promise<void> {
  const identity = releaseIdentity();
  await transaction(async (db) => {
    const updated = await db.query("UPDATE app_release_activities SET state='finished',finished_at=now(),heartbeat_at=now(),outcome=$4 WHERE id=$1 AND instance_id=$2 AND boot_id=$3 AND state='active' RETURNING id", [id, identity.instanceId, identity.bootId, outcome]);
    if (!updated.rowCount) throw new ReleaseRuntimeError("RELEASE_ACTIVITY_FINISH_CONFLICT", 409);
    await db.query("UPDATE app_release_session_owners SET state='idle',updated_at=now() WHERE run_id=$1 AND instance_id=$2 AND boot_id=$3 AND state='running'", [id, identity.instanceId, identity.bootId]);
  });
  // Completion is durable before optional retention work. A failed cleanup is
  // not uncertainty about an already completed promise and must not roll its
  // receipt back to active/unknown, blocking the original job's next wake.
  try {
    // Bounded housekeeping only for already finished request observations. Never
    // expires active/unknown work or deletes the durable owner/run uncertainty.
    // Bound each retention window before merging. An OR over the finished_at
    // index otherwise walks every recent accepted-work row to find no expired
    // request observations on an otherwise idle server.
    await releasePool().query(`DELETE FROM app_release_activities WHERE id IN (
      SELECT id FROM (
        (SELECT id,finished_at FROM app_release_activities
          WHERE state='finished' AND activity_kind='request' AND finished_at<now()-interval '15 minutes'
          ORDER BY finished_at LIMIT 100)
        UNION ALL
        (SELECT id,finished_at FROM app_release_activities
          WHERE state='finished' AND activity_kind='accepted-work' AND finished_at<now()-interval '7 days'
          ORDER BY finished_at LIMIT 100)
      ) expired ORDER BY finished_at LIMIT 100
    )`);
  } catch { console.warn("[release-runtime] finished-activity-cleanup-deferred"); }
}
export async function unknownActivity(id: string, reason: string): Promise<void> {
  const identity = releaseIdentity(); await ensureReleaseSchema();
  await transaction(async (db) => {
    await db.query("UPDATE app_release_activities SET state='unknown',outcome=$4,heartbeat_at=now() WHERE id=$1 AND instance_id=$2 AND boot_id=$3 AND state='active'", [id, identity.instanceId, identity.bootId, reason.slice(0, 120)]);
    await db.query("UPDATE app_release_session_owners SET state='unknown',updated_at=now() WHERE run_id=$1 AND instance_id=$2 AND boot_id=$3 AND state='running'", [id, identity.instanceId, identity.bootId]);
  });
}
export async function consumeForwardNonce(nonce: string): Promise<void> {
  await ensureReleaseSchema();
  const result = await releasePool().query("INSERT INTO app_release_forward_receipts(target_boot,nonce) VALUES($1,$2) ON CONFLICT DO NOTHING", [releaseIdentity().bootId, nonce]);
  if (!result.rowCount) throw new ReleaseRuntimeError("RELEASE_FORWARD_REPLAY", 409);
  // HMAC claims are accepted for only 30 seconds. Two-minute receipt retention
  // stays replay-safe without unbounded growth from frequent remote polling.
  await releasePool().query("DELETE FROM app_release_forward_receipts WHERE (target_boot,nonce) IN (SELECT target_boot,nonce FROM app_release_forward_receipts WHERE created_at<now()-interval '2 minutes' ORDER BY created_at LIMIT 100)");
}
export async function releaseStatus() {
  const identity = releaseIdentity();
  return transaction(async (db) => {
    const boot = await register(db);
    const { rows } = await db.query<{ activity_kind: string; state: string; count: string; stale: string; other_boot: boolean }>(`SELECT activity_kind,state,count(*)::text, count(*) FILTER(WHERE heartbeat_at<now()-interval '45 seconds')::text AS stale,boot_id<>$2::uuid AS other_boot FROM app_release_activities WHERE instance_id=$1 AND state<>'finished' GROUP BY activity_kind,state,other_boot`, [identity.instanceId, identity.bootId]);
    const active = (kind: string) => rows.filter((r) => r.activity_kind === kind && !r.other_boot && r.state === "active").reduce((n, r) => n + Number(r.count), 0);
    const unknown = rows.filter((r) => r.other_boot || r.state === "unknown").reduce((n, r) => n + Number(r.count), 0) + rows.filter((r) => !r.other_boot && r.state === "active").reduce((n, r) => n + Number(r.stale), 0);
    const background = (await db.query(`SELECT work_scope AS scope,count(*) FILTER(WHERE state='active' AND boot_id=$2)::int AS active,count(*) FILTER(WHERE state='unknown' OR boot_id<>$2 OR heartbeat_at<now()-interval '45 seconds')::int AS unknown FROM app_release_activities WHERE instance_id=$1 AND activity_kind='accepted-work' AND state<>'finished' GROUP BY work_scope`, [identity.instanceId, identity.bootId])).rows;
    return {
      schemaVersion: 1, observedAt: new Date().toISOString(), identity, admission: { mode: boot.admission, revision: boot.revision },
      observations: { activeRequests: null, acceptedTasks: null, trackedRequests: active("request"), trackedAcceptedWork: active("accepted-work"), agentRuns: active("agent-run"), unknownLeases: unknown, agentSessions: null },
      coverage: { level: "partial", allApplicationRequests: false, allBackgroundAcceptedWork: false, allAgentExecutions: false, admissionScope: "agent-new-turns-and-instrumented-background-claims", allApplicationAdmissions: false, trackedBackgroundScopes:OBSERVED_BACKGROUND_SCOPES, backgroundObservation:"local-promise-lifetime-only", trackedAgentEntrypoints: ["/api/agent", "/api/canvas/assistant?mode=agent", "/api/canvas/assistant/control"], source: "postgres-leases-not-module-map", bootstrapRequiredForLegacy: true },
      diagnostics: { pid: process.pid, runtimeId: releaseProcessRegistry().runtimeId, bootSource: identity.bootSource },
      background,
    };
  });
}
