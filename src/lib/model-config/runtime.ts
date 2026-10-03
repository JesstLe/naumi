import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ConfigSnapshot } from "../billing/types";
import type { createCredentialStore } from "./credentials";
import type { RouterControl } from "./router-client";
import { compileRouterProjection, modelCostRate, monetaryCost, type RouterProjection } from "./projection";
import { ensureModelRuntimeSchema } from "./runtime-schema";
import { canonicalConfig } from "./repository";
import { validateModelConfig, type ValidationOptions } from "./schema";
import { ModelConfigError, type ModelConfig, type ModelConfigRepository, type ModelFacts, type ModelPublication, type ModelSnapshot, type Modality, type RestoreInput, type StageInput } from "./types";

export type RoutingSimulation = { eligible: { upstreamId: string; providerId: string; rank: number }[]; excluded: { upstreamId: string; codes: string[] }[]; modelVersion: number; billingVersion: number };
type Dependencies = ValidationOptions & { pool: Pool; repo: ModelConfigRepository; credentials: ReturnType<typeof createCredentialStore>; router: RouterControl; billing: () => Promise<ConfigSnapshot>; billingByVersion?: (version: number) => Promise<ConfigSnapshot> };

export function publicModelCatalog(snapshot: ModelSnapshot, modality: Modality) {
  const config = snapshot.config;
  const models = config.publicModels.filter(m => m.enabled && m.visible && m.modality === modality).map(m => {
    const ids = m.target.type === "upstream" ? [m.target.id] : config.pools.find(p => p.id === m.target.id)!.candidates;
    const upstreams = config.upstreamModels.filter(u => ids.includes(u.id) && u.enabled && config.providers.some(p => p.id === u.providerId && p.enabled));
    return { id: m.id, label: m.label, modality: m.modality, supportsEdit: upstreams.some(u => u.capabilities.edit), supportsVision: upstreams.some(u => u.capabilities.vision), qualities: Array.from(new Set(upstreams.flatMap(u => u.capabilities.qualities))), nativeResolutions: Array.from(new Set(upstreams.flatMap(u => u.capabilities.nativeResolutions))), qualitySupported: upstreams.some(u => u.capabilities.qualities.length > 0) };
  });
  const visible = new Set(models.map(m => m.id));
  return { version: snapshot.version, models, bindings: Object.fromEntries(Object.entries(config.bindings).filter(([, id]) => visible.has(id))) };
}
function rankFor(quality: string) { return ({ low: 1, medium: 2, high: 3, xhigh: 4, max: 5 } as Record<string,number>)[quality] || 1; }
function matchesRule(when: ModelConfig["pools"][number]["rules"][number]["when"], f: ModelFacts) {
  return (!when.task || when.task.includes(f.task)) && (!when.quality || (when.quality as string[]).includes(f.quality)) && (!when.resolution || (when.resolution as string[]).includes(f.resolution)) && (["needsEdit", "needsText", "preserveIdentity", "nativeResolution"] as const).every(key => when[key] === undefined || when[key] === f[key]);
}
export function simulateModel(snapshot: ModelSnapshot, billing: ConfigSnapshot, publicModelId: string, facts: ModelFacts, options: ValidationOptions = {}): RoutingSimulation {
  facts = { ...facts, needsText: facts.needsText || facts.task === "layout" };
  if (!Number.isInteger(facts.quantity ?? 1) || (facts.quantity ?? 1) < 1 || (facts.quantity ?? 1) > 4) throw new ModelConfigError("INVALID_REQUEST", "模拟图片数量必须为 1 至 4");
  const config = validateModelConfig(snapshot.config, options);
  const model = config.publicModels.find(m => m.id === publicModelId && m.enabled && m.modality === "image");
  if (!model) throw new ModelConfigError("MODEL_UNAVAILABLE", "图片模型不可用", 400);
  const pool = model.target.type === "pool" ? config.pools.find(p => p.id === model.target.id)! : null;
  const ids = pool ? pool.candidates : [model.target.id];
  const rule = pool?.rules.filter(r => matchesRule(r.when, facts)).sort((a,b) => b.priority - a.priority)[0];
  const eligible: RoutingSimulation["eligible"] = [], excluded: RoutingSimulation["excluded"] = [];
  const costs = new Map<string, ReturnType<typeof monetaryCost>>();
  for (const id of ids) {
    const u = config.upstreamModels.find(u => u.id === id)!, p = config.providers.find(p => p.id === u.providerId)!, c = u.capabilities;
    const codes: string[] = [];
    if (!u.enabled || !p.enabled) codes.push("DISABLED");
    if (pool?.rules.length && !rule) codes.push("RULE_UNMATCHED");
    const rank = Math.max(rankFor(facts.quality), facts.task === "draft" ? 1 : 2, rule?.require.minQualityRank || 1);
    if (c.verified && c.qualityRank < rank) codes.push("QUALITY_RANK");
    if (c.verified && c.qualities.length && !c.qualities.includes(facts.quality as any)) codes.push("QUALITY_UNSUPPORTED");
    if ((facts.needsEdit || rule?.require.edit) && !c.edit) codes.push("EDIT_UNSUPPORTED");
    if (facts.needsMask && (p.protocol !== "openai-images" || !c.edit)) codes.push("MASK_UNSUPPORTED");
    if (c.verified && (facts.preserveIdentity || rule?.require.preserveIdentity) && !c.preserveIdentity) codes.push("IDENTITY_UNSUPPORTED");
    if (c.verified && (facts.needsText || rule?.require.textAccuracy) && !c.textAccuracy) codes.push("TEXT_UNSUPPORTED");
    if ((facts.nativeResolution || rule?.require.nativeResolution) && !c.nativeResolutions.includes(facts.resolution as any)) codes.push("NATIVE_RESOLUTION");
    const maxPixels = c.nativeResolutions.includes("4K") ? 4096 * 4096 : c.nativeResolutions.includes("2K") ? 2048 * 2048 : 1536 * 1024;
    const requestedPixels = facts.resolution === "4K" ? 3840 * 2160 : facts.resolution === "2K" ? 2048 * 2048 : 1024 * 1024;
    if (pool && requestedPixels > maxPixels) codes.push("PIXEL_LIMIT");
    if (c.verified && facts.references > c.maxReferenceImages) codes.push("REFERENCE_LIMIT");
    const money = monetaryCost(modelCostRate(billing, u, facts.quality, facts.resolution, facts.needsEdit ? "edit" : "generate"));
    costs.set(id, money ? { ...money, amountMicros: (BigInt(money.amountMicros) * BigInt(money.unit === "task" ? 1 : facts.quantity ?? 1)).toString() } : null);
    if (pool?.strategy === "lowest-cost" && !money) codes.push("COST_UNRECORDED");
    if (codes.length) excluded.push({ upstreamId: id, codes }); else eligible.push({ upstreamId: id, providerId: p.id, rank: c.qualityRank });
  }
  if (pool?.strategy === "lowest-cost") {
    const currencies = new Set(eligible.map(u => costs.get(u.upstreamId)!.currency));
    if (currencies.size > 1) { for (const u of eligible.splice(0)) excluded.push({ upstreamId: u.upstreamId, codes: ["COST_CURRENCY"] }); }
  }
  eligible.sort((a,b) => {
    if (pool?.strategy === "lowest-cost") { const x = BigInt(costs.get(a.upstreamId)!.amountMicros), y = BigInt(costs.get(b.upstreamId)!.amountMicros); if (x !== y) return x < y ? -1 : 1; }
    if (pool?.strategy === "latency") { const x = config.upstreamModels.find(u => u.id === a.upstreamId)!.capabilities.expectedLatencyMs, y = config.upstreamModels.find(u => u.id === b.upstreamId)!.capabilities.expectedLatencyMs; if (x !== y) return x - y; }
    if (!pool || pool.strategy === "priority") return ids.indexOf(a.upstreamId) - ids.indexOf(b.upstreamId);
    return a.upstreamId < b.upstreamId ? -1 : a.upstreamId > b.upstreamId ? 1 : 0;
  });
  return { eligible, excluded, modelVersion: snapshot.version, billingVersion: billing.version };
}

export function createModelRuntime(deps: Dependencies) {
  const ready = async () => ensureModelRuntimeSchema(deps.pool);
  const billingVersion = async (version: number) => { const current = await deps.billing(); if (current.version === version) return current; if (deps.billingByVersion) return deps.billingByVersion(version); throw new ModelConfigError("CONFIG_UNAVAILABLE", "需要恢复原计费版本后核对发布", 503); };
  const prepareExecution = async (input: { snapshot: ModelSnapshot; billing: ConfigSnapshot }): Promise<RouterProjection> => {
    await ready();
    const key = [input.snapshot.version, input.billing.version];
    const read = async () => (await deps.pool.query("SELECT * FROM app_model_router_projections WHERE model_version=$1 AND billing_version=$2", key)).rows[0];
    const cached = await read();
    const projection = compileRouterProjection(input.snapshot, input.billing, deps);
    if (cached?.phase === "prepared") {
      const { digest, ...payload } = cached.payload || {};
      if (digest !== cached.digest || digest !== projection.digest || createHash("sha256").update(canonicalConfig(payload)).digest("hex") !== digest) throw new ModelConfigError("CONFIG_UNAVAILABLE", "已准备的执行配置摘要不一致", 503);
      return projection;
    }
    await deps.pool.query("INSERT INTO app_model_router_projections(model_version,billing_version,digest,phase,payload) VALUES($1,$2,$3,'staged',$4::jsonb) ON CONFLICT(model_version,billing_version) DO NOTHING", [...key,projection.digest,JSON.stringify(projection.payload)]);
    const lease = randomUUID();
    const deadline = Date.now() + 11000;
    while (true) {
      const row = await read();
      if (!row || row.digest !== projection.digest) throw new ModelConfigError("CONFIG_CONFLICT", "同一模型与计费版本的执行摘要不一致", 409);
      if (row.phase === "prepared") return projection;
      const claimed = await deps.pool.query("UPDATE app_model_router_projections SET phase='preparing',lease_id=$3,lease_until=now()+interval '30 seconds' WHERE model_version=$1 AND billing_version=$2 AND phase<>'prepared' AND (lease_until IS NULL OR lease_until<now()) RETURNING digest", [...key,lease]);
      if (claimed.rowCount) break;
      if (Date.now() >= deadline) throw new ModelConfigError("CONFIG_PREPARING", "执行配置正在准备，请稍后重试", 503);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    try {
      const credentials = await Promise.all(projection.payload.config.providers.map(async p => deps.router.seal(p.credentialRef, p.id, await deps.credentials.read(p.credentialRef, p.id))));
      await deps.router.prepare(projection.payload, credentials);
      const changed = await deps.pool.query("UPDATE app_model_router_projections SET phase='prepared',lease_id=NULL,lease_until=NULL WHERE model_version=$1 AND billing_version=$2 AND lease_id=$3", [...key,lease]);
      if (!changed.rowCount) throw new ModelConfigError("CONFIG_UNAVAILABLE", "执行配置准备结果待核对", 503);
      return projection;
    } catch (error) {
      await deps.pool.query("UPDATE app_model_router_projections SET phase='unknown',lease_id=NULL,lease_until=NULL WHERE model_version=$1 AND billing_version=$2 AND lease_id=$3", [...key,lease]);
      throw error;
    }
  };
  const apply = async (publication: ModelPublication): Promise<ModelPublication> => {
    if (publication.phase === "applied" || publication.phase === "failed") return publication;
    await ready();
    let meta = (await deps.pool.query("SELECT billing_version,router_digest,expected_router_digest FROM app_model_publications WHERE id=$1", [publication.id])).rows[0];
    let activationMayHaveStarted = false;
    try {
      if (!meta.billing_version) {
        const billing = await deps.billing();
        await deps.pool.query("UPDATE app_model_publications SET billing_version=$2 WHERE id=$1 AND billing_version IS NULL", [publication.id,billing.version]);
        meta = (await deps.pool.query("SELECT billing_version,router_digest,expected_router_digest FROM app_model_publications WHERE id=$1", [publication.id])).rows[0];
      }
      await deps.repo.setPhase(publication.id, "preparing");
      const snapshot = await deps.repo.byVersion(publication.version);
      const prepared = await prepareExecution({ snapshot, billing: await billingVersion(Number(meta.billing_version)) });
      await deps.pool.query("UPDATE app_model_publications SET router_digest=$2 WHERE id=$1 AND (router_digest IS NULL OR router_digest=$2)", [publication.id,prepared.digest]);
      const existing = await deps.router.status(publication.id);
      if (existing) {
        activationMayHaveStarted = true;
        if (existing.digest !== prepared.digest) throw new ModelConfigError("ROUTER_CONFLICT", "发布编号对应的执行摘要不一致", 409);
      } else {
        if (meta.expected_router_digest === null) {
          const expected = await deps.router.state();
          await deps.pool.query("UPDATE app_model_publications SET expected_router_digest=$2 WHERE id=$1 AND expected_router_digest IS NULL", [publication.id,expected]);
          meta = (await deps.pool.query("SELECT expected_router_digest FROM app_model_publications WHERE id=$1", [publication.id])).rows[0];
        }
        await deps.repo.setPhase(publication.id, "activating");
        activationMayHaveStarted = true;
        await deps.router.activate(publication.id, meta.expected_router_digest, prepared.digest);
      }
      await deps.repo.markApplied(publication.id, publication.digest);
      return deps.repo.publication(publication.id);
    } catch (error) {
      // Only an explicit preparation rejection proves that the version did not activate.
      // All activation/commit ambiguities retain the publication for same-ID reconciliation.
      const rejectedBeforeActivation = !activationMayHaveStarted && error instanceof ModelConfigError && ["INVALID_PROJECTION", "INVALID_COST", "UNSUPPORTED_POOL_PROTOCOL", "INVALID_CONFIG", "INVALID_ENDPOINT"].includes(error.code);
      const phase = rejectedBeforeActivation ? "failed" : "unknown";
      return deps.repo.setPhase(publication.id, phase, error instanceof ModelConfigError ? error.code : "CONFIG_COMMIT_UNKNOWN");
    }
  };
  return {
    current: () => deps.repo.current(), byVersion: (version: number) => deps.repo.byVersion(version),
    publicCatalog: async (modality: Modality) => publicModelCatalog(await deps.repo.current(), modality),
    prepareExecution,
    async validateExecutionProjection(input: { modelVersion: number; billingVersion: number; digest: string }) {
      await ready();
      const row = (await deps.pool.query("SELECT digest,phase,payload FROM app_model_router_projections WHERE model_version=$1 AND billing_version=$2", [input.modelVersion,input.billingVersion])).rows[0];
      const { digest, ...payload } = row?.payload || {};
      if (row?.phase !== "prepared" || row.digest !== input.digest || digest !== input.digest || createHash("sha256").update(canonicalConfig(payload)).digest("hex") !== digest) throw new ModelConfigError("EXECUTION_MISMATCH", "任务路由组合与原版本不一致", 503);
    },
    publish: async (input: StageInput) => apply(await deps.repo.stage(input)),
    restore: async (input: RestoreInput) => apply(await deps.repo.stageRestore(input)),
    async simulate(input: { draftId: string; actor: string; facts: ModelFacts; publicModelId: string }) {
      const draft = await deps.repo.draft(input.actor); if (draft.id !== input.draftId) throw new ModelConfigError("DRAFT_UNAVAILABLE", "草稿不可用", 404);
      return simulateModel({ version: draft.basedOnVersion, digest: "", config: draft.config }, await deps.billing(), input.publicModelId, input.facts, deps);
    },
  };
}
export type ModelRuntime = ReturnType<typeof createModelRuntime>;
