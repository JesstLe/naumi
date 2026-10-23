import "server-only";
import { randomUUID } from "node:crypto";
import { dbEnabled, getPool } from "../db";
import { currentSynchronousBilling } from "../billing/synchronous";
import { currentImageOperationId } from "../image-gateway";
import type { ModelExecutionScope } from "./context";
import { procurementCny } from "./business";
import { ModelConfigError } from "./types";
import type { Pool } from "pg";
import { stageCost } from "./stage-cost";
const ready = new WeakMap<Pool, Promise<unknown>>();
export async function ensureExecutionAuditSchema(pool: Pool) {
  let p = ready.get(pool);
  if (!p) {
    p = pool.query(`CREATE TABLE IF NOT EXISTS app_model_execution_stages(
      id uuid PRIMARY KEY,operation_id text NOT NULL,feature text NOT NULL,public_model_id text NOT NULL,
      model_version bigint NOT NULL,billing_version bigint NOT NULL,provider_id text NOT NULL,wire_model text NOT NULL,
      matched_rule_id text,phase text NOT NULL,state text NOT NULL,attempt int NOT NULL,status int,
      estimated_cost_cny_micros numeric(30,0),cost_source text,usage jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS app_model_execution_stages_operation ON app_model_execution_stages(operation_id,created_at);
      ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS procurement jsonb;
      ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS cost_cny_micros numeric(30,0);
      ALTER TABLE app_model_execution_stages ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'unknown';`).catch(e => { ready.delete(pool); throw e; });
    ready.set(pool, p);
  }
  await p;
}
export async function beginExecutionStage(scope: ModelExecutionScope, attempt: number, ruleId?: string) {
  const id = randomUUID();
  if (!dbEnabled) return id;
  const pool = getPool(); await ensureExecutionAuditSchema(pool);
  const { currentBiOperationId } = await import("../bi/model-observer");
  const operation = currentSynchronousBilling()?.id || currentBiOperationId() || currentImageOperationId() || id;
  const cost = procurementCny(scope.procurement);
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`naumi-stage-budget:${operation}`]);
    if (scope.routing) {
      const previous = (await tx.query("SELECT COALESCE(sum(estimated_cost_cny_micros),0)::text AS total,count(*)::int AS attempts FROM app_model_execution_stages WHERE operation_id=$1 AND state<>'not-submitted'", [operation])).rows[0];
      if (previous.attempts >= scope.routing.policy.maxAttempts) throw new ModelConfigError("ROUTE_EXHAUSTED", "本任务调用次数达到上限", 409);
      const sum = previous.total;
      if (!cost?.amountMicros || BigInt(sum) + BigInt(cost.amountMicros) > BigInt(scope.routing.policy.costCapCnyMicros)) throw new ModelConfigError("ROUTE_BUDGET", "本任务供应商成本达到上限，已停止后续调用", 409);
    }
    await tx.query("INSERT INTO app_model_execution_stages(id,operation_id,feature,public_model_id,model_version,billing_version,provider_id,wire_model,matched_rule_id,phase,state,attempt,estimated_cost_cny_micros,cost_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$13,'submitted',$10,$11,$12)", [id,operation,scope.frozen.feature || scope.frozen.binding,scope.frozen.publicModelId,scope.frozen.modelVersion,scope.frozen.billingVersion,scope.connection.providerId,scope.connection.wireModel,ruleId || null,attempt,cost?.basis !== "tokens" ? cost?.amountMicros ?? null : null,cost ? `${cost.source};${cost.updatedAt}` : "unknown",scope.frozen.modality === "text" ? "text" : scope.frozen.binding === "image.edit" ? "edit" : "generation"]);
    await tx.query("UPDATE app_model_execution_stages SET procurement=$2::jsonb WHERE id=$1", [id, scope.procurement ? JSON.stringify(scope.procurement) : null]);
    await tx.query("COMMIT"); return id;
  } catch (e) { await tx.query("ROLLBACK"); throw e; } finally { tx.release(); }
}
export async function finishExecutionStage(id: string, state: string, status?: number, usage?: unknown) {
  if (!dbEnabled) return;
  const pool=getPool(),row=(await pool.query("SELECT procurement FROM app_model_execution_stages WHERE id=$1",[id])).rows[0];
  const cost=stageCost(row?.procurement,state,usage);
  await pool.query("UPDATE app_model_execution_stages SET state=$2,status=$3,usage=$4::jsonb,cost_cny_micros=$5,cost_status=$6,updated_at=now() WHERE id=$1", [id,state,status || null,usage ? JSON.stringify(usage) : null,cost.amount,cost.status]);
}
