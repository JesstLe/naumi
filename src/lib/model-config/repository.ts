import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { settingsSecret } from "../settings-secret";
import { registerProviderCapacities } from "./capacity";
import { ensureModelSchema, validateModelConfig, type ValidationOptions } from "./schema";
import { ModelConfigError, type ModelConfig, type ModelConfigRepository, type ModelDraft, type ModelPublication, type ModelSnapshot, type PublicationPhase } from "./types";

export function canonicalConfig(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalConfig).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalConfig(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function modelConfigDigest(config: ModelConfig): string { return createHash("sha256").update(canonicalConfig(config)).digest("hex"); }
function requireActor(actor: string) { if (typeof actor !== "string" || !actor.trim() || actor.length > 254) throw new ModelConfigError("INVALID_CONFIG", "操作者无效"); }
function requireUUID(id: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ModelConfigError("INVALID_CONFIG", "操作编号无效"); }
function requireVersion(version: number) { if (!Number.isSafeInteger(version) || version < 1) throw new ModelConfigError("INVALID_CONFIG", "配置版本无效"); }
function publication(row: any): ModelPublication { return { id: row.id, version: Number(row.version), digest: row.digest, phase: row.phase as PublicationPhase, ...(row.error_code ? { errorCode: row.error_code } : {}) }; }

async function checkCredentials(tx: PoolClient, config: ModelConfig) {
  for (const p of config.providers) if (p.credentialRef) {
    const found = await tx.query("SELECT 1 FROM app_model_credentials WHERE id=$1 AND provider_id=$2", [p.credentialRef, p.id]);
    if (!found.rowCount) throw new ModelConfigError("INVALID_CREDENTIAL", "供应商凭据不存在或不属于该供应商", 400, [`providers.${p.id}.credentialRef`]);
  }
}
async function writeDraft(tx: PoolClient, draftId: string, config: ModelConfig) {
  for (const table of ["bindings", "public_models", "rules", "candidates", "pools", "upstreams", "providers"]) await tx.query(`DELETE FROM app_model_${table} WHERE draft_id=$1`, [draftId]);
  for (const [i, p] of Array.from(config.providers.entries())) await tx.query("INSERT INTO app_model_providers(draft_id,id,position,name,protocol,base_url,credential_ref,enabled,timeout_ms,max_concurrent,options) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)", [draftId,p.id,i,p.name,p.protocol,p.baseUrl,p.credentialRef || null,p.enabled,p.timeoutMs,p.maxConcurrent,p.options ? JSON.stringify(p.options) : null]);
  for (const [i, u] of Array.from(config.upstreamModels.entries())) await tx.query("INSERT INTO app_model_upstreams(draft_id,id,position,provider_id,model,label,modality,enabled,capabilities,parameter_map,cost_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)", [draftId,u.id,i,u.providerId,u.model,u.label,u.modality,u.enabled,JSON.stringify(u.capabilities),JSON.stringify(u.parameterMap),u.costRef || null]);
  for (const [i, p] of Array.from(config.pools.entries())) {
    await tx.query("INSERT INTO app_model_pools(draft_id,id,position,modality,strategy) VALUES($1,$2,$3,$4,$5)", [draftId,p.id,i,p.modality,p.strategy]);
    for (const [j, u] of Array.from(p.candidates.entries())) await tx.query("INSERT INTO app_model_candidates(draft_id,pool_id,upstream_id,position) VALUES($1,$2,$3,$4)", [draftId,p.id,u,j]);
    for (const [j, r] of Array.from(p.rules.entries())) await tx.query("INSERT INTO app_model_rules(draft_id,pool_id,id,position,priority,conditions,requirements) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)", [draftId,p.id,r.id,j,r.priority,JSON.stringify(r.when),JSON.stringify(r.require)]);
  }
  for (const [i, m] of Array.from(config.publicModels.entries())) await tx.query("INSERT INTO app_model_public_models(draft_id,id,position,label,modality,enabled,visible,upstream_target,pool_target) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [draftId,m.id,i,m.label,m.modality,m.enabled,m.visible,m.target.type === "upstream" ? m.target.id : null,m.target.type === "pool" ? m.target.id : null]);
  for (const [purpose, model] of Object.entries(config.bindings)) await tx.query("INSERT INTO app_model_bindings(draft_id,id,public_model_id) VALUES($1,$2,$3)", [draftId,purpose,model]);
}
async function readDraft(tx: PoolClient, row: any): Promise<ModelDraft> {
  const read = async (table: string) => (await tx.query(`SELECT * FROM app_model_${table} WHERE draft_id=$1 ORDER BY ${table === "bindings" ? "id" : "position"}`, [row.id])).rows;
  // A single transaction uses one pg connection: preserve sequential reads on that connection.
  const providers = await read("providers"), upstreams = await read("upstreams"), publics = await read("public_models"), pools = await read("pools"), candidates = await read("candidates"), rules = await read("rules"), bindings = await read("bindings");
  const config: ModelConfig = { schemaVersion: 1,
    providers: providers.map(p => ({ id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.base_url, ...(p.credential_ref ? { credentialRef: p.credential_ref } : {}), enabled: p.enabled, timeoutMs: p.timeout_ms, maxConcurrent: p.max_concurrent, ...(p.options ? { options: p.options } : {}) })),
    upstreamModels: upstreams.map(u => ({ id: u.id, providerId: u.provider_id, model: u.model, label: u.label, modality: u.modality, enabled: u.enabled, capabilities: u.capabilities, parameterMap: u.parameter_map, ...(u.cost_ref ? { costRef: u.cost_ref } : {}) })),
    publicModels: publics.map(m => ({ id: m.id, label: m.label, modality: m.modality, enabled: m.enabled, visible: m.visible, target: m.upstream_target ? { type: "upstream", id: m.upstream_target } : { type: "pool", id: m.pool_target } })),
    pools: pools.map(p => ({ id: p.id, modality: p.modality, strategy: p.strategy, candidates: candidates.filter(c => c.pool_id === p.id).map(c => c.upstream_id), rules: rules.filter(r => r.pool_id === p.id).map(r => ({ id: r.id, priority: r.priority, when: r.conditions, require: r.requirements })) })),
    bindings: Object.fromEntries(bindings.map(b => [b.id, b.public_model_id])),
  };
  return { id: row.id, revision: Number(row.revision), basedOnVersion: Number(row.based_on_version), config };
}

export function createModelRepository(deps: ValidationOptions & { pool: Pool; initialize: (tx: PoolClient) => Promise<ModelConfig>; ensureSchema?: () => Promise<void> }): ModelConfigRepository {
  const ensure = async () => { await deps.ensureSchema?.(); await ensureModelSchema(deps.pool); };
  const transaction = async <T>(run: (tx: PoolClient) => Promise<T>, global = false) => {
    const tx = await deps.pool.connect();
    try { await tx.query("BEGIN"); if (global) await tx.query("SELECT pg_advisory_xact_lock(hashtext('naumi-model-config'))"); const result = await run(tx); await tx.query("COMMIT"); return result; }
    catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
  };
  const snapshot = (row: any): ModelSnapshot => {
    if (!row) throw new ModelConfigError("CONFIG_UNAVAILABLE", "模型配置版本不存在", 503);
    const config = validateModelConfig(row.config, deps); const version = Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1 || row.digest !== modelConfigDigest(config)) throw new ModelConfigError("CONFIG_UNAVAILABLE", "模型配置摘要不一致", 503);
    return { version, digest: row.digest, config };
  };
  const selectCurrent = async (sql: Pool | PoolClient) => (await sql.query("SELECT v.* FROM app_model_config_state s JOIN app_model_config_versions v ON v.version=s.active_version WHERE singleton=true")).rows[0];
  const selectPublication = async (sql: Pool | PoolClient, id: string) => (await sql.query("SELECT p.*,v.digest FROM app_model_publications p JOIN app_model_config_versions v ON p.version=v.version WHERE p.id=$1", [id])).rows[0];
  const repo: ModelConfigRepository = {
    async current() {
      try {
        await ensure(); const existing = await selectCurrent(deps.pool); if (existing) return snapshot(existing);
        return await transaction(async tx => {
          const found = await selectCurrent(tx); if (found) return snapshot(found);
          if ((await tx.query("SELECT 1 FROM app_model_config_state WHERE singleton=true")).rowCount) throw new Error("missing active version");
          const config = validateModelConfig(await deps.initialize(tx), deps); await checkCredentials(tx, config);
          const id = randomUUID(), digest = modelConfigDigest(config);
          const row = (await tx.query("INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,'system','现行模型配置导入',$2::jsonb,$3) RETURNING *", [id,JSON.stringify(config),digest])).rows[0];
          await tx.query("INSERT INTO app_model_publications(id,version,expected_version,request_fingerprint,phase) VALUES($1,$2,0,'bootstrap','applied')", [id,row.version]);
          await tx.query("INSERT INTO app_model_config_state(singleton,active_version) VALUES(true,$1)", [row.version]);
          await registerProviderCapacities(tx, config);
          return snapshot(row);
        }, true);
      } catch (error) {
        if (error instanceof ModelConfigError && error.code === "CONFIG_NOT_READY") throw error;
        throw new ModelConfigError("CONFIG_UNAVAILABLE", "模型配置暂时不可用，请稍后重试", 503);
      }
    },
    async byVersion(version) { requireVersion(version); await ensure(); return snapshot((await deps.pool.query("SELECT * FROM app_model_config_versions WHERE version=$1", [version])).rows[0]); },
    async draft(actor) {
      requireActor(actor); const current = await repo.current();
      return transaction(async tx => {
        const row = (await tx.query("INSERT INTO app_model_drafts(id,revision,based_on_version,actor) VALUES($1,1,$2,$3) ON CONFLICT(actor) DO NOTHING RETURNING *", [randomUUID(),current.version,actor])).rows[0];
        if (row) { await writeDraft(tx, row.id, current.config); return { id: row.id, revision: 1, basedOnVersion: current.version, config: current.config }; }
        const existing = (await tx.query("SELECT * FROM app_model_drafts WHERE actor=$1 FOR UPDATE", [actor])).rows[0];
        return readDraft(tx, existing);
      });
    },
    async saveDraft(input) {
      requireUUID(input.id); requireActor(input.actor); requireVersion(input.expectedRevision); const config = validateModelConfig(input.config, deps); await ensure();
      return transaction(async tx => {
        const row = (await tx.query("SELECT * FROM app_model_drafts WHERE id=$1 FOR UPDATE", [input.id])).rows[0];
        if (!row || row.actor !== input.actor) throw new ModelConfigError("DRAFT_UNAVAILABLE", "草稿不可用", 404);
        if (Number(row.revision) !== input.expectedRevision) throw new ModelConfigError("DRAFT_CONFLICT", "草稿已更新，请刷新后重试", 409);
        await checkCredentials(tx, config); await writeDraft(tx, input.id, config);
        const updated = (await tx.query("UPDATE app_model_drafts SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [input.id])).rows[0];
        return { id: row.id, revision: Number(updated.revision), basedOnVersion: Number(row.based_on_version), config };
      });
    },
    async stage(input) {
      requireUUID(input.id); requireUUID(input.draftId); requireActor(input.actor); requireVersion(input.expectedRevision); requireVersion(input.expectedVersion);
      if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 500) throw new ModelConfigError("INVALID_CONFIG", "请填写发布原因");
      const fingerprint = createHmac("sha256", settingsSecret()).update(canonicalConfig(input)).digest("hex");
      await ensure();
      return transaction(async tx => {
        const previous = await selectPublication(tx, input.id);
        if (previous) { if (previous.request_fingerprint !== fingerprint) throw new ModelConfigError("OPERATION_CONFLICT", "操作编号已用于其他发布", 409); return publication(previous); }
        const pending = (await tx.query("SELECT id FROM app_model_publications WHERE phase NOT IN ('applied','failed') LIMIT 1")).rows[0];
        if (pending) throw new ModelConfigError("PUBLICATION_PENDING", "已有发布结果待核对，请先恢复该操作", 409);
        const active = await selectCurrent(tx);
        if (!active || Number(active.version) !== input.expectedVersion) throw new ModelConfigError("CONFIG_CONFLICT", "配置已被更新，请刷新后重新发布", 409);
        const row = (await tx.query("SELECT * FROM app_model_drafts WHERE id=$1 FOR UPDATE", [input.draftId])).rows[0];
        if (!row || row.actor !== input.actor || Number(row.revision) !== input.expectedRevision) throw new ModelConfigError("DRAFT_CONFLICT", "草稿已更新或不可用", 409);
        const config = validateModelConfig((await readDraft(tx, row)).config, deps); await checkCredentials(tx, config); const digest = modelConfigDigest(config);
        const version = (await tx.query("INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING version", [input.id,input.actor,input.reason,JSON.stringify(config),digest])).rows[0].version;
        await tx.query("INSERT INTO app_model_publications(id,version,expected_version,request_fingerprint,phase) VALUES($1,$2,$3,$4,'staged')", [input.id,version,input.expectedVersion,fingerprint]);
        return publication({ id: input.id, version, digest, phase: "staged" });
      }, true);
    },
    async publication(id) { requireUUID(id); await ensure(); const row = await selectPublication(deps.pool, id); if (!row) throw new ModelConfigError("PUBLICATION_UNAVAILABLE", "发布记录不存在", 404); return publication(row); },
    async stageRestore(input) {
      requireUUID(input.id); requireActor(input.actor); requireVersion(input.expectedVersion); requireVersion(input.targetVersion);
      if (typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 500) throw new ModelConfigError("INVALID_CONFIG", "请填写恢复原因");
      const fingerprint = createHmac("sha256", settingsSecret()).update(canonicalConfig({ type: "restore", ...input })).digest("hex");
      await ensure();
      return transaction(async tx => {
        const previous = await selectPublication(tx, input.id);
        if (previous) { if (previous.request_fingerprint !== fingerprint) throw new ModelConfigError("OPERATION_CONFLICT", "操作编号已用于其他发布", 409); return publication(previous); }
        if ((await tx.query("SELECT 1 FROM app_model_publications WHERE phase NOT IN ('applied','failed') LIMIT 1")).rowCount) throw new ModelConfigError("PUBLICATION_PENDING", "已有发布结果待核对", 409);
        const active = await selectCurrent(tx);
        if (!active || Number(active.version) !== input.expectedVersion) throw new ModelConfigError("CONFIG_CONFLICT", "配置已被更新，请刷新后重新恢复", 409);
        const old = snapshot((await tx.query("SELECT * FROM app_model_config_versions WHERE version=$1", [input.targetVersion])).rows[0]);
        await checkCredentials(tx, old.config);
        const row = (await tx.query("INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING version", [input.id,input.actor,input.reason,JSON.stringify(old.config),old.digest])).rows[0];
        await tx.query("INSERT INTO app_model_publications(id,version,expected_version,request_fingerprint,phase) VALUES($1,$2,$3,$4,'staged')", [input.id,row.version,input.expectedVersion,fingerprint]);
        return publication({ id: input.id, version: row.version, digest: old.digest, phase: "staged" });
      }, true);
    },
    async history(limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ModelConfigError("INVALID_CONFIG", "记录数量无效");
      await ensure(); const { rows } = await deps.pool.query("SELECT p.*,v.digest,v.actor,v.reason,v.created_at FROM app_model_publications p JOIN app_model_config_versions v ON p.version=v.version ORDER BY v.version DESC LIMIT $1", [limit]);
      return rows.map(row => ({ ...publication(row), actor: row.actor, reason: row.reason, createdAt: row.created_at.toISOString() }));
    },
    async markApplied(id, digest) {
      requireUUID(id); await ensure();
      return transaction(async tx => {
        const row = await selectPublication(tx, id);
        if (!row || row.digest !== digest) throw new ModelConfigError("DIGEST_MISMATCH", "发布摘要不一致", 409);
        if (row.phase === "applied") return snapshot((await tx.query("SELECT * FROM app_model_config_versions WHERE version=$1", [row.version])).rows[0]);
        if (row.phase === "failed") throw new ModelConfigError("PUBLICATION_FAILED", "该发布已失败，请创建新的操作", 409);
        const changed = await tx.query("UPDATE app_model_config_state SET active_version=$1 WHERE singleton=true AND active_version=$2", [row.version,row.expected_version]);
        if (!changed.rowCount) throw new ModelConfigError("CONFIG_CONFLICT", "配置已被更新，不能覆盖其他发布", 409);
        await tx.query("UPDATE app_model_publications SET phase='applied',error_code=NULL,updated_at=now() WHERE id=$1", [id]);
        const versionRow = (await tx.query("SELECT * FROM app_model_config_versions WHERE version=$1", [row.version])).rows[0];
        await registerProviderCapacities(tx, versionRow.config);
        await tx.query("INSERT INTO app_bi_access_log(id,actor,action,target_email,section) VALUES($1,$2,'model-config-publish','','models')", [`model-publication:${id}`,versionRow.actor]);
        return snapshot(versionRow);
      }, true);
    },
    async setPhase(id, phase, errorCode) {
      requireUUID(id); if (!["staged", "preparing", "activating", "failed", "unknown"].includes(phase) || errorCode && !/^[A-Z0-9_]{1,80}$/.test(errorCode)) throw new ModelConfigError("INVALID_CONFIG", "发布状态无效");
      await ensure();
      await deps.pool.query("UPDATE app_model_publications SET phase=$2,error_code=$3,updated_at=now() WHERE id=$1 AND phase NOT IN ('applied','failed')", [id,phase,errorCode || null]);
      return repo.publication(id);
    },
  };
  return repo;
}
