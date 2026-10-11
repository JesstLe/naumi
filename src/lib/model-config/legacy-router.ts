import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { createCredentialStore } from "./credentials";
import type { RouterControl } from "./router-client";
import { ModelConfigError, type ModelConfig } from "./types";

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const legacySchema = z.object({
  providers: z.array(z.object({ id: identifier, protocol: z.enum(["openai-images", "apimart-images", "fal-images"]), baseUrl: z.string().max(1024), credentialRef: z.string().regex(/^[a-f0-9-]{36}$/), timeoutMs: z.number().int().min(1000).max(900000), maxConcurrent: z.number().int().min(1).max(256) })).max(100),
  routes: z.array(z.object({ id: identifier, provider: identifier, upstream_model: z.string().max(160), enabled: z.boolean(), healthy: z.boolean(), quality_rank: z.number().int().min(1).max(5), expected_latency_ms: z.number().int().min(0).max(900000), supports_edit: z.boolean(), text_accuracy: z.boolean(), native_4k: z.boolean(), max_reference_images: z.number().int().min(0).max(32).optional(), preserves_identity: z.boolean().optional(), native_resolutions: z.array(z.enum(["1K", "2K", "4K"])).optional(), supported_qualities: z.array(z.enum(["low", "medium", "high", "xhigh", "max", "auto"])).optional(), quality_map: z.record(z.string(), z.string()).optional(), upstream_version: z.string().optional() })).max(600),
  aliases: z.array(z.object({ id: identifier, candidates: z.array(identifier).min(1).max(50), strategy: z.enum(["priority", "lowest-cost", "latency"]), minQualityRank: z.number().int().min(1).max(5).optional() })).max(200),
});
const importedId = (kind: string, id: string) => `router-${kind}:${createHash("sha256").update(id).digest("hex").slice(0, 24)}`;

/** Legacy declarations are imported for review; the existing public aliases retain their original execution path. */
export async function importLegacyRouter(input: { exported: Awaited<ReturnType<RouterControl["legacy"]>>; control: RouterControl; credentials: ReturnType<typeof createCredentialStore>; tx: PoolClient }): Promise<ModelConfig> {
  const parsed = legacySchema.safeParse(input.exported.config);
  if (!parsed.success) throw new ModelConfigError("ROUTER_UNAVAILABLE", "现行 Router 配置无法核对", 503);
  const source = parsed.data;
  const config: ModelConfig = { schemaVersion: 1, providers: [], upstreamModels: [], pools: [], publicModels: [], bindings: {} };
  for (const p of source.providers) {
    const sealed = input.exported.credentials.filter(c => c.providerID === p.id && c.ref === p.credentialRef);
    if (sealed.length !== 1) throw new ModelConfigError("CREDENTIAL_UNAVAILABLE", "现行 Router 供应商凭据不完整", 503);
    const id = importedId("provider", p.id);
    const local = await input.credentials.importPlain({ providerId: id, plain: input.control.open(sealed[0]), actor: "system" }, input.tx);
    config.providers.push({ id, name: `现行 Router · ${p.id}`.slice(0, 100), protocol: p.protocol, baseUrl: p.baseUrl, credentialRef: local.id, timeoutMs: p.timeoutMs, maxConcurrent: p.maxConcurrent, enabled: true });
  }
  for (const route of source.routes) {
    const provider = config.providers.find(p => p.id === importedId("provider", route.provider));
    if (!provider) throw new ModelConfigError("ROUTER_UNAVAILABLE", "现行 Router 模型缺少供应商", 503);
    config.upstreamModels.push({ id: importedId("upstream", route.id), providerId: provider.id, model: route.upstream_model, label: route.id, modality: "image", enabled: route.enabled && route.healthy,
      capabilities: { verified: false, generate: true, edit: route.supports_edit, vision: false, transparent: false, preserveIdentity: !!route.preserves_identity, textAccuracy: route.text_accuracy, qualityRank: route.quality_rank, qualities: route.supported_qualities || [], nativeResolutions: route.native_resolutions || (route.native_4k ? ["4K"] : []), maxReferenceImages: route.max_reference_images || 0, expectedLatencyMs: route.expected_latency_ms },
      parameterMap: { ...(route.quality_map ? { quality: route.quality_map } : {}), ...(route.upstream_version ? { version: route.upstream_version } : {}) }, costRef: `${route.provider}:${route.upstream_model}` });
  }
  for (const alias of source.aliases) {
    const candidates = alias.candidates.map(id => importedId("upstream", id));
    if (candidates.some(id => !config.upstreamModels.some(u => u.id === id))) throw new ModelConfigError("ROUTER_UNAVAILABLE", "现行 Router 路由候选不完整", 503);
    const pool = importedId("pool", alias.id);
    config.pools.push({ id: pool, modality: "image", strategy: alias.strategy, candidates, rules: alias.minQualityRank ? [{ id: "legacy-minimum", priority: 0, when: {}, require: { minQualityRank: alias.minQualityRank } }] : [] });
    config.publicModels.push({ id: importedId("review", alias.id), label: `待核验 · ${alias.id}`.slice(0, 100), modality: "image", enabled: false, visible: false, target: { type: "pool", id: pool } });
  }
  return config;
}
