import { businessFeaturesSchema, procurementSchema, fixedMonthlyCostsSchema } from "./business-schema";
import { validateBusinessConfig } from "./business-validation";
import { imagePresetSchema, installImagePresetAliases } from "./image-preset";
import { z } from "zod";
import {channelPolicySchema,validateChannelPolicies,publicUpstreamIds} from "./channel-policy";
import type { Pool } from "pg";
import { isIP, BlockList } from "node:net";
import { MODEL_BINDINGS } from "./bindings";
import { ModelConfigError, type ModelConfig } from "./types";
import { FEATURE_IDS } from "../billing/rules/registry";
import { validateToolScopes } from "./tool-scope";
import {resolutionPolicySchema} from "./resolution-policy";
import { qualityPolicySchema } from "./quality-policy";
import { videoDefinitionSchema, videoWireProfileSchema,videoProfileProtocol } from "../video/capability-schema";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const name = z.string().trim().min(1).max(100);
const modality = z.enum(["image", "text", "video"]);
const quality = z.enum(["low", "medium", "high", "xhigh", "max", "auto"]);
const resolution = z.enum(["1K", "2K", "4K"]);
const displayRatios = z.array(z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/)).min(1).max(30).refine(v => new Set(v).size === v.length, "比例不能重复").optional();
export const MODEL_PROTOCOLS = ["openai-images", "new-api-flow", "openai-chat", "apimart-images", "fal-images", "openai-videos", "ark", "kie", "apimart", "gemini", "minimax", "metaso", "tokendance", "tfrouter", "compshare", "comfyui", "autodl", "runninghub"] as const;
const videoOptions = z.strictObject({
  imageAdapter: z.literal("reverse-hub").optional(),
  imageRatios: displayRatios,
  createPath: z.string().regex(/^\/[A-Za-z0-9_./{}:-]*$/).max(200).optional(),
  pollPath: z.string().regex(/^\/[A-Za-z0-9_./{}:-]*$/).max(200).optional(),
  contentPath: z.string().regex(/^\/[A-Za-z0-9_./{}:-]*$/).max(200).optional(),
  rawAuthorization: z.boolean().optional(), workflowId: z.string().max(160).optional(),
  idempotencyStrategy: z.enum(["header", "body", "none"]).optional(),
  idempotencyBodyField: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,60}$/).optional(),
  videoProfile: videoWireProfileSchema.optional(),
});
const providerSchema = z.strictObject({ id, name, protocol: z.enum(MODEL_PROTOCOLS), baseUrl: z.string().max(1024), credentialRef: z.uuid().optional(), enabled: z.boolean(), timeoutMs: z.number().int().min(1000).max(900000), maxConcurrent: z.number().int().min(1).max(256), options: videoOptions.optional() });
const capabilities = z.strictObject({ verified: z.boolean(), generate: z.boolean(), edit: z.boolean(), vision: z.boolean(), transparent: z.boolean(), preserveIdentity: z.boolean(), textAccuracy: z.boolean(), qualityRank: z.number().int().min(1).max(5), qualities: z.array(quality).max(6), nativeResolutions: z.array(resolution).max(3), maxReferenceImages: z.number().int().min(0).max(128), expectedLatencyMs: z.number().int().min(0).max(900000), video: videoDefinitionSchema.optional() });
const mappedValue = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const parameterMap = z.strictObject({ resolutionPolicy:resolutionPolicySchema.optional(), qualityPolicy: qualityPolicySchema.optional(), quality: z.partialRecord(quality, mappedValue).optional(), resolution: z.partialRecord(resolution, mappedValue).optional(), version: mappedValue.optional(), videoProfile: videoWireProfileSchema.optional() });
const upstream = z.strictObject({ id, providerId: id, model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/), label: name, modality, enabled: z.boolean(), capabilities, parameterMap, costRef: z.string().min(1).max(200).optional(), procurement: procurementSchema.optional() });
const rule = z.strictObject({ id, priority: z.number().int().min(0).max(100000), when: z.strictObject({ task: z.array(z.enum(["draft", "product", "detail", "layout"])).min(1).max(4).optional(), quality: z.array(quality).min(1).max(6).optional(), resolution: z.array(resolution).min(1).max(3).optional(), needsEdit: z.boolean().optional(), needsText: z.boolean().optional(), preserveIdentity: z.boolean().optional(), nativeResolution: z.boolean().optional() }), require: z.strictObject({ preserveIdentity: z.boolean().optional(), textAccuracy: z.boolean().optional(), minQualityRank: z.number().int().min(1).max(5).optional(), nativeResolution: z.boolean().optional(), edit: z.boolean().optional() }) });
export const modelConfigSchema = z.strictObject({ schemaVersion: z.literal(1), providers: z.array(providerSchema).max(100), upstreamModels: z.array(upstream).max(600), publicModels: z.array(z.strictObject({ id, label: name, modality, enabled: z.boolean(), visible: z.boolean(), supplierRouting:channelPolicySchema.optional(), displayResolutions: z.array(resolution).min(1).max(3).refine(v => new Set(v).size === v.length, "分辨率不能重复").optional(), toolScope: z.strictObject({systems:z.array(z.literal("canvas")).max(1).optional(),features:z.array(z.enum(FEATURE_IDS)).max(FEATURE_IDS.length),defaultFor:z.array(z.enum(FEATURE_IDS)).max(FEATURE_IDS.length)}).optional(), target: z.discriminatedUnion("type", [z.strictObject({ type: z.literal("upstream"), id }), z.strictObject({ type: z.literal("pool"), id })]) })).max(200), pools: z.array(z.strictObject({ id, modality: z.literal("image"), strategy: z.enum(["priority", "lowest-cost", "latency"]), candidates: z.array(id).min(1).max(50), rules: z.array(rule).max(1000) })).max(100), bindings: z.record(z.string(), id), business: businessFeaturesSchema.optional(), fixedMonthlyCosts: fixedMonthlyCostsSchema.optional(), defaultImagePreset: imagePresetSchema.optional() });
export type ValidationOptions = { trustedOrigins?: readonly string[] };

// Runtime transport also checks DNS answers; this synchronous gate rejects literal private/metadata targets.
const metadataTargets = new BlockList();
metadataTargets.addSubnet("169.254.0.0", 16, "ipv4"); metadataTargets.addAddress("100.100.100.200", "ipv4"); metadataTargets.addAddress("fd00:ec2::254", "ipv6");
export function modelMetadataHost(raw: string) {
  const host = raw.toLowerCase().replace(/^\[|\]$/g, ""); const family = isIP(host);
  return /^metadata\./.test(host) || !!family && metadataTargets.check(host, family === 6 ? "ipv6" : "ipv4");
}
export function privateModelHost(raw: string) {
  const host = raw.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || !host.includes(".") && !isIP(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIP(host) === 6) return !/^2[0-9a-f]{3}:/i.test(host); // only global IPv6, excluding mapped IPv4 and link-local
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19);
  }
  return false;
}
export function validateModelEndpoint(value: string, options: ValidationOptions = {}) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ModelConfigError("INVALID_ENDPOINT", "供应商接口地址无效"); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol) || modelMetadataHost(host)) throw new ModelConfigError("INVALID_ENDPOINT", "接口地址不得携带凭据或指向元数据服务");
  const trusted = options.trustedOrigins?.includes(url.origin);
  if ((!trusted && (privateModelHost(host) || url.protocol !== "https:"))) throw new ModelConfigError("INVALID_ENDPOINT", "内网接口必须在服务端允许列表中");
  return url.toString().replace(/\/$/, "");
}
function fail(message: string, fields: string[] = []): never { throw new ModelConfigError("INVALID_CONFIG", message, 400, fields); }
function unique(values: readonly string[], field: string) { if (new Set(values).size !== values.length) fail("配置标识重复", [field]); }
export function validateModelConfig(input: unknown, options: ValidationOptions = {}): ModelConfig {
  let bytes: number;
  try { bytes = Buffer.byteLength(JSON.stringify(input)); } catch { return fail("配置内容无效"); }
  if (bytes > 512 * 1024) fail("配置超过大小限制");
  const parsed = modelConfigSchema.safeParse(input);
  if (!parsed.success) fail("配置字段无效", parsed.error.issues.map(x => x.path.join(".")).slice(0, 20));
  const config = parsed.data;
  installImagePresetAliases(config);
  if (!config.publicModels.some(m => m.enabled)) fail("至少需要一个有效默认模型");
  for (const group of ["providers", "upstreamModels", "publicModels", "pools"] as const) unique(config[group].map(x => x.id), group);
  for(const upstream of config.upstreamModels){
    if(upstream.modality!=="video"&&upstream.capabilities.maxReferenceImages>32)fail("图片参考上限不能超过32",[`upstreamModels.${upstream.id}.capabilities.maxReferenceImages`]);
    const images=upstream.capabilities.video?.limits?.images;
    if(upstream.modality==="video"&&typeof images==="number"&&images!==upstream.capabilities.maxReferenceImages)
      throw new ModelConfigError("INVALID_CONFIG","视频参考图上限与通用参考图配置不一致",400,[`upstreamModels.${upstream.id}.capabilities.video.limits.images`]);
  }
  if (config.pools.reduce((n, p) => n + p.rules.length, 0) > 1000) fail("规则超过数量限制");
  const providers = new Map(config.providers.map(p => [p.id, p]));
  const upstreams = new Map(config.upstreamModels.map(m => [m.id, m]));
  const pools = new Map(config.pools.map(p => [p.id, p]));
  const publics = new Map(config.publicModels.map(m => [m.id, m]));
  for (const p of config.providers) {
    validateModelEndpoint(p.baseUrl, options);
    if (p.enabled && !p.credentialRef) fail("启用的供应商缺少凭据", [`providers.${p.id}.credentialRef`]);
    if (p.options?.imageAdapter && p.protocol !== "openai-images") fail("Reverse Hub 图片适配器需使用图片协议");
    if (p.options?.idempotencyStrategy === "body" && !p.options.idempotencyBodyField) fail("视频幂等参数缺少字段");
  }
  for (const m of config.upstreamModels) {
    const p = providers.get(m.providerId);
    if (!p) fail("上游供应商不存在", [`upstreamModels.${m.id}.providerId`]);
    const expected = ["openai-images", "new-api-flow", "apimart-images", "fal-images"].includes(p.protocol) ? "image" : p.protocol === "openai-chat" ? "text" : "video";
    if (m.modality !== expected) fail("供应商协议与模态不匹配");
    const profile=m.parameterMap.videoProfile??p.options?.videoProfile;
    if(profile&&(m.modality!=="video"||videoProfileProtocol(profile)!==p.protocol))fail("视频wire profile与供应商协议不一致",[`upstreamModels.${m.id}.parameterMap.videoProfile`]);
    if(m.parameterMap.resolutionPolicy && p.protocol==="openai-images" && (m.parameterMap.resolutionPolicy.field.includes(".")||m.parameterMap.resolutionPolicy.ratioField?.includes(".")))fail("OpenAI 图片分辨率映射需使用平面参数字段");
    unique(m.capabilities.qualities, `upstreamModels.${m.id}.qualities`); unique(m.capabilities.nativeResolutions, `upstreamModels.${m.id}.nativeResolutions`);
    if ((m.parameterMap.qualityPolicy || m.parameterMap.resolutionPolicy) && (!["openai-images","new-api-flow"].includes(p.protocol) || config.defaultImagePreset?.enabled && config.defaultImagePreset.upstreamId === m.id || config.publicModels.some(v=>v.enabled && v.target.type === "pool" && pools.get(v.target.id)?.candidates.includes(m.id)))) fail("此路径的显示参数必须由外部路由或成本预设适配器管理", [`upstreamModels.${m.id}.parameterMap.qualityPolicy`]);
  }
  for (const pool of config.pools) {
    unique(pool.candidates, `pools.${pool.id}.candidates`); unique(pool.rules.map(r => r.id), `pools.${pool.id}.rules`);
    for (const u of pool.candidates) { if (upstreams.get(u)?.modality !== "image") fail("候选图片模型不存在或模态错误"); }
    if (pool.candidates.some(u => !upstreams.get(u)!.capabilities.verified)) {
      // Unverified legacy models may remain direct targets; a new pool must not invent their capabilities.
      if (config.publicModels.some(m => m.enabled && m.target.type === "pool" && m.target.id === pool.id)) fail("混合路由候选能力尚未确认");
    }
  }
  validateChannelPolicies(config);
  const candidates = (m: ModelConfig["publicModels"][number]) => publicUpstreamIds(config,m).map(id=>upstreams.get(id));
  for (const m of config.publicModels) {
    if (m.displayResolutions && m.modality !== "image") fail("只有图片模型可以设置输出分辨率");
    if (m.target.type === "pool" && m.modality !== "image") fail("混合路由仅支持图片");
    const options = candidates(m);
    if (!options?.length || options.some(u => !u || u.modality !== m.modality)) fail("对外模型目标不存在或模态错误");
    if (m.enabled && !options.some(u => u!.enabled && providers.get(u!.providerId)!.enabled)) fail("启用模型没有可用上游");
  }
  for (const [binding, model] of Object.entries(config.bindings)) {
    const purpose = MODEL_BINDINGS[binding as keyof typeof MODEL_BINDINGS]; const m = publics.get(model);
    if (!purpose || !m || !m.enabled || m.modality !== purpose.modality) fail("用途绑定无效或模型模态错误", [`bindings.${binding}`]);
    if (!candidates(m)?.some(u => u!.enabled && providers.get(u!.providerId)!.enabled && u!.capabilities[purpose.capability])) fail("默认用途模型不满足能力要求", [`bindings.${binding}`]);
  }
  for (const [kind, binding] of [["image", "image.generate"], ["text", "agent.text"], ["video", "video.generate"]] as const) {
    if (config.publicModels.some(m => m.enabled && m.modality === kind) && !config.bindings[binding]) fail("缺少有效默认用途模型", [`bindings.${binding}`]);
  }
  validateBusinessConfig(config);
  validateToolScopes(config);
  return config;
}

const schemaReady = new WeakMap<Pool, Promise<void>>();
export async function ensureModelSchema(pool: Pool): Promise<void> {
  let pending = schemaReady.get(pool);
  if (!pending) {
    pending = (async () => {
      const tx = await pool.connect();
      try {
        await tx.query("BEGIN");
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('naumi-model-schema-v1',0))");
        await tx.query(`
      CREATE TABLE IF NOT EXISTS app_model_credentials(id uuid PRIMARY KEY,provider_id text NOT NULL,key_enc text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_provider_budgets(identity text PRIMARY KEY,max_concurrent int NOT NULL CHECK(max_concurrent>0));
      CREATE TABLE IF NOT EXISTS app_model_capacity_accounts(alias text PRIMARY KEY,identity text NOT NULL REFERENCES app_model_provider_budgets(identity));
      CREATE TABLE IF NOT EXISTS app_model_provider_leases(identity text NOT NULL REFERENCES app_model_provider_budgets(identity),token uuid PRIMARY KEY,expires_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS app_model_provider_leases_identity ON app_model_provider_leases(identity,expires_at);
      CREATE TABLE IF NOT EXISTS app_model_config_versions(version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,operation_id uuid UNIQUE NOT NULL,actor text NOT NULL,reason text NOT NULL,config jsonb NOT NULL,digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_config_state(singleton boolean PRIMARY KEY CHECK(singleton),active_version bigint REFERENCES app_model_config_versions(version));
      CREATE TABLE IF NOT EXISTS app_model_publications(id uuid PRIMARY KEY,version bigint NOT NULL REFERENCES app_model_config_versions(version),expected_version bigint NOT NULL,request_fingerprint text NOT NULL,phase text NOT NULL CHECK(phase IN ('staged','preparing','activating','applied','failed','unknown')),error_code text,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_bi_access_log(id text PRIMARY KEY,actor text NOT NULL,action text NOT NULL,target_email text NOT NULL DEFAULT '',section text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_drafts(id uuid PRIMARY KEY,revision bigint NOT NULL,based_on_version bigint NOT NULL REFERENCES app_model_config_versions(version),actor text NOT NULL UNIQUE,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_providers(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,name text NOT NULL,protocol text NOT NULL,base_url text NOT NULL,credential_ref uuid REFERENCES app_model_credentials(id),enabled boolean NOT NULL,timeout_ms int NOT NULL,max_concurrent int NOT NULL,options jsonb,PRIMARY KEY(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_upstreams(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,provider_id text NOT NULL,model text NOT NULL,label text NOT NULL,modality text NOT NULL,enabled boolean NOT NULL,capabilities jsonb NOT NULL,parameter_map jsonb NOT NULL,cost_ref text,PRIMARY KEY(draft_id,id),FOREIGN KEY(draft_id,provider_id) REFERENCES app_model_providers(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_pools(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,modality text NOT NULL CHECK(modality='image'),strategy text NOT NULL,PRIMARY KEY(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_candidates(draft_id uuid NOT NULL,pool_id text NOT NULL,upstream_id text NOT NULL,position int NOT NULL,PRIMARY KEY(draft_id,pool_id,upstream_id),FOREIGN KEY(draft_id,pool_id) REFERENCES app_model_pools(draft_id,id) ON DELETE CASCADE,FOREIGN KEY(draft_id,upstream_id) REFERENCES app_model_upstreams(draft_id,id));
      CREATE TABLE IF NOT EXISTS app_model_rules(draft_id uuid NOT NULL,pool_id text NOT NULL,id text NOT NULL,position int NOT NULL,priority int NOT NULL,conditions jsonb NOT NULL,requirements jsonb NOT NULL,PRIMARY KEY(draft_id,pool_id,id),FOREIGN KEY(draft_id,pool_id) REFERENCES app_model_pools(draft_id,id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS app_model_public_models(draft_id uuid NOT NULL REFERENCES app_model_drafts(id) ON DELETE CASCADE,id text NOT NULL,position int NOT NULL,label text NOT NULL,modality text NOT NULL,enabled boolean NOT NULL,visible boolean NOT NULL,upstream_target text,pool_target text,CHECK((upstream_target IS NULL)<>(pool_target IS NULL)),PRIMARY KEY(draft_id,id),FOREIGN KEY(draft_id,upstream_target) REFERENCES app_model_upstreams(draft_id,id),FOREIGN KEY(draft_id,pool_target) REFERENCES app_model_pools(draft_id,id));
      ALTER TABLE app_model_upstreams ADD COLUMN IF NOT EXISTS procurement jsonb;
      CREATE TABLE IF NOT EXISTS app_model_business(draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,config jsonb NOT NULL);
      ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS tool_scope jsonb;
      ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS display_resolutions jsonb;
      ALTER TABLE app_model_public_models ADD COLUMN IF NOT EXISTS supplier_routing jsonb;
      CREATE TABLE IF NOT EXISTS app_model_channel_balances(schedule_key text NOT NULL,channel_key text NOT NULL,served bigint NOT NULL DEFAULT 0,PRIMARY KEY(schedule_key,channel_key));
      CREATE TABLE IF NOT EXISTS app_model_channel_health(key text PRIMARY KEY,failures int NOT NULL DEFAULT 0,open_until timestamptz,probe_until timestamptz,last_status int,last_success_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_model_image_presets(draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,config jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_model_fixed_costs(draft_id uuid PRIMARY KEY REFERENCES app_model_drafts(id) ON DELETE CASCADE,config jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS app_model_bindings(draft_id uuid NOT NULL,id text NOT NULL,public_model_id text NOT NULL,PRIMARY KEY(draft_id,id),FOREIGN KEY(draft_id,public_model_id) REFERENCES app_model_public_models(draft_id,id) ON DELETE CASCADE);
        `);
        await tx.query("COMMIT");
      } catch (error) { await tx.query("ROLLBACK"); throw error; }
      finally { tx.release(); }
    })().catch(error => { schemaReady.delete(pool); throw error; });
    schemaReady.set(pool, pending);
  }
  return pending;
}
