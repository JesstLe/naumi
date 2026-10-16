import { createHash } from "node:crypto";
import type { ModelConfig, ModelProvider, UpstreamModel } from "../model-config/types";
import type { ModelExecutionScope } from "../model-config/context";

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
export function healthTargetKey(input: Pick<ModelExecutionScope, "connection" | "parameterMap" | "capabilities" | "imagePreset">) {
  const c = input.connection;
  // No key material. Rotation, protocol/endpoint and execution parameter changes invalidate evidence.
  return createHash("sha256").update(JSON.stringify(canonical([c.providerId, c.baseUrl.replace(/\/$/, ""), c.protocol, c.credentialRef || null, c.wireModel, c.options || {}, input.parameterMap, input.capabilities, input.imagePreset || null]))).digest("hex");
}
export type HealthTarget = { key: string; upstreamIds: string[]; provider: ModelProvider; upstream: UpstreamModel; supported: boolean; imagePreset?: ModelConfig["defaultImagePreset"] };
export function configuredHealthTargets(config: ModelConfig): HealthTarget[] {
  const targets = new Map<string, HealthTarget>();
  // Deliberately not the supplier catalog, discovery API, draft, or guessed model family.
  for (const u of config.upstreamModels) {
    const p = config.providers.find(p => p.id === u.providerId);
    if (!u.enabled || !p?.enabled || !p.credentialRef) continue;
    const preset = config.defaultImagePreset?.enabled && config.defaultImagePreset.upstreamId === u.id ? config.defaultImagePreset : undefined;
    const supported = u.capabilities.generate && u.modality === "image" && (["openai-images", "new-api-flow"].includes(p.protocol) || p.protocol === "apimart-images" && !!preset);
    const key = healthTargetKey({ connection: { ...p, apiKey: "", providerId: p.id, wireModel: u.model }, capabilities: u.capabilities, parameterMap: u.parameterMap,imagePreset:preset });
    const old = targets.get(key);
    if (old) old.upstreamIds.push(u.id);
    else targets.set(key, { key, upstreamIds: [u.id], provider: p, upstream: u, supported, imagePreset: preset });
  }
  return [...targets.values()];
}
