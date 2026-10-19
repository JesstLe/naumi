import { applicationAPIMartImages, queryableImageScope } from "./apimart-image-policy";
import "server-only";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ChannelTarget } from "./channel-scheduler";
import type { ModelExecutionScope } from "./context";
import { ensureModelSchema } from "./schema";
import { ModelConfigError, type ModelConfig } from "./types";
import { currentImageOperationId, ImageOperationPending } from "../image-gateway";

export type ChannelGuard = { upstreamId: string; operationKey?: string };
type LiveChannels = {
  model: ModelConfig["publicModels"][number] | null;
  upstreams: Pick<ModelConfig["upstreamModels"][number], "id" | "enabled" | "providerId" | "model">[];
  providers: (Pick<ModelConfig["providers"][number], "id" | "enabled" | "baseUrl" | "protocol"> & { configured: boolean })[];
};

/** Read the ACTIVE pointer, never the immutable task-version cache. Return only
 * routing identities and switches, not credentials or large capability maps. */
export async function readLiveChannels(sql: Pool | PoolClient, publicId: string, targets: ChannelTarget[]): Promise<LiveChannels> {
  const row = (await sql.query(`SELECT
    (SELECT m FROM jsonb_array_elements(v.config->'publicModels') m WHERE m->>'id'=$1) AS model,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u->>'id','enabled',u->'enabled','providerId',u->>'providerId','model',u->>'model'))
      FROM jsonb_array_elements(v.config->'upstreamModels') u WHERE u->>'id'=ANY($2::text[])), '[]'::jsonb) AS upstreams,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p->>'id','enabled',p->'enabled','baseUrl',p->>'baseUrl','protocol',p->>'protocol','configured',COALESCE(p->>'credentialRef','')<>''))
      FROM jsonb_array_elements(v.config->'providers') p WHERE p->>'id'=ANY($3::text[])), '[]'::jsonb) AS providers
    FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE s.singleton=true`,
  [publicId, targets.map(t => t.upstreamId), targets.map(t => t.scope.connection.providerId)])).rows[0];
  if (!row) throw new ModelConfigError("CONFIG_UNAVAILABLE", "当前供应通道状态待核对，本次尚未提交上游", 503);
  return row;
}

export function channelStillEnabled(live: LiveChannels, target: ChannelTarget) {
  const m = live.model, u = live.upstreams.find(u => u.id === target.upstreamId), c = target.scope.connection;
  const p = live.providers.find(p => p.id === c.providerId);
  const member = m?.supplierRouting ? m.supplierRouting.channels.some(ch => ch.upstreamId === target.upstreamId && ch.enabled)
    : m?.target.type === "upstream" && m.target.id === target.upstreamId;
  // This is a negative switch overlay, NOT a re-resolution. A label, mapping,
  // wire-model, credential or endpoint edit must not silently rewrite the task's
  // frozen request. Reassignment to a different provider removes this candidate.
  return !!(m?.enabled && m.modality === target.scope.frozen.modality && member && u?.enabled && p?.enabled && p.configured &&
    u.providerId === p.id);
}

export function channelOperationKey(scope: ModelExecutionScope, operationId = currentImageOperationId()) {
  const id = scope.frozen.modality === "image" && operationId;
  return id ? createHash("sha256").update(JSON.stringify([scope.frozen.modelVersion, scope.frozen.publicModelId, id])).digest("hex") : undefined;
}

/** Upgrade compatibility: accepted Hub calls or application APIMart markers made by an older App have a
 * durable supplier ledger but no new routing pin yet. Reconstruct only an
 * exact frozen identity; ambiguous/mismatched records must never fail over. */
export async function readChannelOperationPin(sql: Pool | PoolClient, publicId: string, targets: ChannelTarget[], operationKey?: string, operationId = currentImageOperationId()) {
  if (!operationKey) return undefined;
  const existing = (await sql.query("SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1", [operationKey])).rows[0];
  if (existing) return existing as {upstream_id:string};
  const hubs = targets.filter(t => queryableImageScope(t.scope));
  if (!hubs.length || !operationId || !(await sql.query("SELECT to_regclass('app_supplier_calls') AS name")).rows[0].name) return undefined;
  const calls = (await sql.query(`SELECT DISTINCT provider_id,model FROM app_supplier_calls
    WHERE billing_unit_id=$1 AND public_model_id=$2 AND model_version=$3 AND provider_id=ANY($4::text[])
      AND ((provider_id=ANY($5::text[]) AND (task_id IS NOT NULL OR parameters IS NOT NULL) AND state <> 'pre-submission-failed')
        OR (NOT(provider_id=ANY($5::text[])) AND state NOT IN ('rejected','failed','cancelled')))`, [operationId,publicId,hubs[0].scope.frozen.modelVersion,hubs.map(t=>t.scope.connection.providerId),hubs.filter(t=>applicationAPIMartImages(t.scope.connection.protocol,t.scope.parameterMap)).map(t=>t.scope.connection.providerId)])).rows;
  if (!calls.length) return undefined;
  const matched = hubs.filter(t => calls.some(c => c.provider_id===t.scope.connection.providerId && c.model===t.scope.connection.wireModel));
  if (calls.length!==1 || matched.length!==1) throw new ImageOperationPending(operationId,new Error("legacy-original-channel-identity-unconfirmed"));
  return (await sql.query(`INSERT INTO app_model_channel_operations(operation_key,upstream_id) VALUES($1,$2)
    ON CONFLICT(operation_key) DO UPDATE SET operation_key=EXCLUDED.operation_key RETURNING upstream_id`, [operationKey,matched[0].upstreamId])).rows[0] as {upstream_id:string};
}

/** A mixed asynchronous/direct family is replayable ONLY AFTER its operation
 * has a durable pin to a queryable target, never merely because it is a candidate. */
export async function recoverableChannelIdentity(pool: Pool, scope: ModelExecutionScope | null, operationId: string) {
  if (!scope?.supplierRouting) return undefined;
  const key=channelOperationKey(scope,operationId);
  const pin=await readChannelOperationPin(pool,scope.frozen.publicModelId,scope.supplierRouting.targets,key,operationId);
  const target=scope.supplierRouting.targets.find(t=>t.upstreamId===pin?.upstream_id && queryableImageScope(t.scope));
  return target ? "channel:"+createHash("sha256").update(JSON.stringify([key,target.upstreamId,target.scope.connection.providerId,target.scope.connection.baseUrl,target.scope.connection.wireModel])).digest("hex") : undefined;
}

/** Canvas text edits have their own pre-submission checkpoint. Only an exact
 * frozen APIMart marker/task may pass it again; an absent ledger is NOT a retry
 * permit. Keep its quality-suffixed operation ID identical to editImage(). */
export async function recoverableAPIMartImageOperation(pool: Pool, scope: ModelExecutionScope | null, operationId: string) {
  if (!scope) return false;
  if (scope.supplierRouting) {
    const key=channelOperationKey(scope,operationId);
    const pin=await readChannelOperationPin(pool,scope.frozen.publicModelId,scope.supplierRouting.targets,key,operationId);
    return scope.supplierRouting.targets.some(t=>t.upstreamId===pin?.upstream_id && applicationAPIMartImages(t.scope.connection.protocol,t.scope.parameterMap));
  }
  if (!applicationAPIMartImages(scope.connection.protocol,scope.parameterMap)) return false;
  const c=scope.connection;
  const rows=(await pool.query(`SELECT id FROM app_supplier_calls WHERE billing_unit_id=$1 AND public_model_id=$2 AND model_version=$3
    AND provider_id=$4 AND model=$5 AND parameters IS NOT NULL`,[operationId,scope.frozen.publicModelId,scope.frozen.modelVersion,c.providerId,c.wireModel])).rows;
  if (rows.length>1) throw new ImageOperationPending(operationId,new Error("original-apimart-operation-ambiguous"));
  return rows.length===1;
}

/** Final dispatch gate, after request/body preparation and immediately before
 * the supplier POST. GETs retrieving an accepted task never pass this gate. */
export async function guardChannelSubmission(pool: Pool, scope: ModelExecutionScope, dispatch = true) {
  const guard = scope.channelGuard;
  if (!guard) return;
  await ensureModelSchema(pool);
  const target = { upstreamId: guard.upstreamId, enabled: true, priority: 1, weight: 1, scope };
  const pinned = guard.operationKey ? (await pool.query("SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1", [guard.operationKey])).rows[0] : undefined;
  if (pinned && pinned.upstream_id !== guard.upstreamId) throw new ModelConfigError("EXECUTION_MISMATCH", "已提交图片任务的原供应通道不一致", 409);
  let live: LiveChannels;
  try { live=await readLiveChannels(pool,scope.frozen.publicModelId,[target]); }
  catch(error){if(pinned)throw new ImageOperationPending(currentImageOperationId()||guard.operationKey!,error);throw error;}
  if (!channelStillEnabled(live, target)) {
    if (pinned) throw new ImageOperationPending(currentImageOperationId() || guard.operationKey!, new Error("original-channel-disabled-await-reconciliation"));
    throw new ModelConfigError("CHANNEL_DISABLED", "供应通道已关闭，本次尚未提交上游", 422);
  }
  // Only explicitly queryable/idempotent image adapters may keep a recovery pin. It is
  // persisted BEFORE submission so a lost response/process restart cannot route
  // the same paid operation to another supplier.
  if (dispatch && guard.operationKey && queryableImageScope(scope)) {
    const row = (await pool.query(`INSERT INTO app_model_channel_operations(operation_key,upstream_id) VALUES($1,$2)
      ON CONFLICT(operation_key) DO UPDATE SET operation_key=EXCLUDED.operation_key RETURNING upstream_id`, [guard.operationKey, guard.upstreamId])).rows[0];
    if (row.upstream_id !== guard.upstreamId) throw new ModelConfigError("EXECUTION_MISMATCH", "图片任务已绑定原供应通道，不会重复生成", 409);
  }
}
