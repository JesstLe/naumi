import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const TICK_HEADERS = {
  tickId: "x-naumi-worker-tick-id", workerInstanceId: "x-naumi-worker-instance-id",
  workerBootId: "x-naumi-worker-boot-id", workerCommit: "x-naumi-worker-commit",
  targetWebInstanceId: "x-naumi-worker-target-instance-id",
} as const;
export type TickIdentity = { tickId: string; workerInstanceId: string; workerBootId: string; workerCommit: string; targetWebInstanceId: string };
export type TickWebIdentity = { instanceId: string; bootId: string; commit: string; bootSource?: "preload" | "process-fallback" };
export type WorkerTickReceipt = {
  schemaVersion: 1; tickId: string; worker: { instanceId: string; bootId: string; commit: string };
  web: TickWebIdentity; phase: "running" | "completed" | "unknown";
  acceptedAt: string; completedAt: string | null; result: Record<string, unknown> | null;
};
export class WorkerTickReceiptError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const instance = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
const commit = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
function requireValue(value: unknown, code: string, status = 400): asserts value { if (!value) throw new WorkerTickReceiptError(code, status); }

/** Any partial controlled header set is invalid, never silently downgraded to legacy scanning. */
export function tickIdentity(request: Request): TickIdentity | null {
  const values = Object.fromEntries(Object.entries(TICK_HEADERS).map(([key, header]) => [key, request.headers.get(header)]));
  if (Object.values(values).every(value => value === null)) return null;
  requireValue(uuid(values.tickId) && instance(values.workerInstanceId) && uuid(values.workerBootId) && commit(values.workerCommit) && instance(values.targetWebInstanceId), "INVALID_WORKER_TICK_IDENTITY");
  return values as TickIdentity;
}
const processBootId = randomUUID();
export function workerTickWebIdentity(): TickWebIdentity {
  requireValue(instance(process.env.NAUMI_INSTANCE_ID) && commit(process.env.SOURCE_COMMIT), "FIXED_WEB_IDENTITY_REQUIRED", 503);
  const preload=process.env.NAUMI_RELEASE_BOOT_SOURCE==="preload";
  if(preload) requireValue(uuid(process.env.NAUMI_RELEASE_BOOT_ID),"WORKER_TICK_PRELOAD_BOOT_INVALID",503);
  return { instanceId: process.env.NAUMI_INSTANCE_ID!, commit: process.env.SOURCE_COMMIT!,
    bootId: preload?process.env.NAUMI_RELEASE_BOOT_ID!:processBootId,bootSource:preload?"preload":"process-fallback" };
}
function checkTarget(input: TickIdentity, web: TickWebIdentity) {
  requireValue(web.instanceId === input.targetWebInstanceId && web.commit === input.workerCommit && uuid(web.bootId), "WORKER_TICK_WEB_IDENTITY_MISMATCH", 409);
}
function fromRow(row: any): WorkerTickReceipt {
  return { schemaVersion: 1, tickId: row.tick_id, worker: { instanceId: row.worker_instance_id, bootId: row.worker_boot_id, commit: row.worker_commit },
    web: { instanceId: row.web_instance_id, bootId: row.web_boot_id, commit: row.web_commit }, phase: row.phase,
    acceptedAt: new Date(row.accepted_at).toISOString(), completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null, result: row.result };
}
function checkOwner(row: any, input: TickIdentity) {
  requireValue(row.worker_instance_id === input.workerInstanceId && row.worker_boot_id === input.workerBootId && row.worker_commit === input.workerCommit && row.web_instance_id === input.targetWebInstanceId && row.web_commit === input.workerCommit, "WORKER_TICK_IDENTITY_CONFLICT", 409);
}
/** Dedicated additive table: no core migrations, business locks, task claiming or lease expiry retries. */
export function createWorkerTickReceiptStore(pool: Pool) {
  let ready: Promise<void> | undefined;
  async function bounded<T>(run: (client: PoolClient) => Promise<T>) {
    let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
    const pending=pool.connect();
    const client=await Promise.race([pending.then(client=>{if(expired){client.release();throw new WorkerTickReceiptError("WORKER_TICK_DATABASE_TIMEOUT",503);}return client;}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new WorkerTickReceiptError("WORKER_TICK_DATABASE_TIMEOUT",503));},3000);})]).finally(()=>clearTimeout(timer));
    try {
      await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      const result = await run(client); await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }
  async function schema() {
    ready ||= bounded(async client => { await client.query(`CREATE TABLE IF NOT EXISTS app_worker_tick_receipts (
      tick_id uuid PRIMARY KEY, worker_instance_id text NOT NULL, worker_boot_id uuid NOT NULL, worker_commit text NOT NULL,
      web_instance_id text NOT NULL, web_boot_id uuid NOT NULL, web_commit text NOT NULL,
      phase text NOT NULL CHECK(phase IN ('running','completed','unknown')), accepted_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz, result jsonb,
      CHECK ((phase='completed' AND completed_at IS NOT NULL AND result IS NOT NULL) OR (phase<>'completed' AND completed_at IS NULL))
    )`); }).catch(error => { ready = undefined; throw error; });
    await ready;
  }
  return {
    async accept(input: TickIdentity, web: TickWebIdentity) {
      checkTarget(input, web); await schema();
      return bounded(async client => {
        const known=(await client.query("SELECT * FROM app_worker_tick_receipts WHERE tick_id=$1",[input.tickId])).rows[0];
        if(known){checkOwner(known,input);return {accepted:false,receipt:fromRow(known)};}
        const inserted = await client.query(`INSERT INTO app_worker_tick_receipts(tick_id,worker_instance_id,worker_boot_id,worker_commit,web_instance_id,web_boot_id,web_commit,phase)
          VALUES($1,$2,$3,$4,$5,$6,$7,'running') ON CONFLICT(tick_id) DO NOTHING RETURNING *`, [input.tickId,input.workerInstanceId,input.workerBootId,input.workerCommit,web.instanceId,web.bootId,web.commit]);
        const row = inserted.rows[0] || (await client.query("SELECT * FROM app_worker_tick_receipts WHERE tick_id=$1", [input.tickId])).rows[0];
        requireValue(row, "WORKER_TICK_RECEIPT_MISSING", 503); checkOwner(row,input);
        return { accepted: !!inserted.rowCount, receipt: fromRow(row) };
      });
    },
    async complete(input: TickIdentity, web: TickWebIdentity, result: Record<string, unknown>) {
      checkTarget(input,web); await schema();
      requireValue(result.ok === true && JSON.stringify(result).length <= 8192, "INVALID_WORKER_TICK_RESULT", 503);
      return bounded(async client => {
        const row = (await client.query(`UPDATE app_worker_tick_receipts SET phase='completed',completed_at=now(),result=$8 WHERE tick_id=$1 AND worker_instance_id=$2 AND worker_boot_id=$3 AND worker_commit=$4 AND web_instance_id=$5 AND web_boot_id=$6 AND web_commit=$7 AND phase='running' RETURNING *`, [input.tickId,input.workerInstanceId,input.workerBootId,input.workerCommit,web.instanceId,web.bootId,web.commit,JSON.stringify(result)])).rows[0];
        requireValue(row,"WORKER_TICK_COMPLETION_CONFLICT",409); return fromRow(row);
      });
    },
    async unknown(input: TickIdentity, web: TickWebIdentity) {
      await schema();
      await bounded(async client => { await client.query("UPDATE app_worker_tick_receipts SET phase='unknown' WHERE tick_id=$1 AND worker_instance_id=$2 AND worker_boot_id=$3 AND web_boot_id=$4 AND phase='running'",[input.tickId,input.workerInstanceId,input.workerBootId,web.bootId]); });
    },
    async read(input: TickIdentity, web: TickWebIdentity) {
      // GET is strictly observational. A missing table is unavailable, never implicitly created here.
      checkTarget(input,web);
      return bounded(async client => {
        const row=(await client.query("SELECT * FROM app_worker_tick_receipts WHERE tick_id=$1",[input.tickId])).rows[0];
        requireValue(row,"WORKER_TICK_RECEIPT_NOT_FOUND",404); checkOwner(row,input); return fromRow(row);
      });
    },
  };
}

export type WorkerTickReceiptStore = ReturnType<typeof createWorkerTickReceiptStore>;
/** Exactly one scanner invocation per persisted UUID, even if a caller repeats POST after losing the response. */
export async function runReceiptedWorkerTick(store: WorkerTickReceiptStore, input: TickIdentity, web: TickWebIdentity, scan: () => Promise<Record<string, unknown>>) {
  const accepted = await store.accept(input,web);
  if (!accepted.accepted) return { duplicate:true, receipt:accepted.receipt };
  try { const result = await scan(); const receipt = await store.complete(input,web,result); return { duplicate:false, receipt }; }
  catch(error) { await store.unknown(input,web).catch(()=>undefined); throw error; }
}
