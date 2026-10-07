import type { ModelConfig, ModelFacts } from "./types";
import { ModelConfigError } from "./types";
import type { FeatureId } from "../billing/rules/registry";
import type { BusinessOption, BusinessRouting, Procurement } from "./business-schema";
import { MODEL_BINDINGS, type ModelBinding } from "./bindings";

export const FEATURE_BINDINGS: Partial<Record<FeatureId, ModelBinding>> = {
  "image.generate": "image.generate", "image.suite": "image.generate", "image.aplus": "image.generate",
  "tool.cutout": "image.cutout", "tool.ipcheck": "text.competitor", "competitor.action": "image.edit",
  "canvas.text-generate": "text.generate", "canvas.assistant": "text.generate", "canvas.ocr": "vision.ocr",
  ...Object.fromEntries(["tool.garment", "tool.avatar", "tool.dewrinkle", "tool.dewatermark", "tool.style", "tool.tryon", "tool.retouch", "tool.recolor", "tool.replicate", "tool.inpaint", "tool.extract", "tool.garment3d", "tool.packaging3d", "canvas.image", "canvas.expand", "canvas.text-edit", "canvas.annotate"].map(id => [id, "image.edit"])),
  "video.generate": "video.generate",
};
export function selectedBusinessOption(config: ModelConfig, feature?: string, selected?: string): BusinessOption | undefined {
  const f = feature ? config.business?.[feature as FeatureId] : undefined;
  if (!f) return undefined;
  if (!f.enabled) throw new ModelConfigError("FEATURE_DISABLED", "该功能已停用", 409);
  const option = f.options.find(o => o.modelId === (selected || f.defaultModelId) && o.enabled);
  if (!option) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该模型未在当前功能的已生效列表中", 400);
  return option;
}
export function requestRuleMatches(when: Extract<BusinessRouting["rules"][number], { stage: "request" }>["when"], f: ModelFacts) {
  return (!when.task || when.task.includes(f.task)) && (!when.quality || when.quality.includes(f.quality)) && (!when.resolution || (when.resolution as string[]).includes(f.resolution)) &&
    (when.minReferences === undefined || f.references >= when.minReferences) && (when.maxReferences === undefined || f.references <= when.maxReferences) &&
    (when.minInputLength === undefined || (f.inputLength || 0) >= when.minInputLength) && (when.maxInputLength === undefined || (f.inputLength || 0) <= when.maxInputLength);
}
export function businessRoutePlan(config: ModelConfig, option: BusinessOption | undefined, facts?: ModelFacts) {
  const policy = option?.routing;
  if (!policy?.enabled) return undefined;
  const rules = [...policy.rules].sort((a, b) => b.priority - a.priority);
  const match = facts ? rules.find(r => r.stage === "request" && requestRuleMatches(r.when, facts)) : undefined;
  const initialId = match?.targetUpstreamId || policy.defaultUpstreamId;
  return { initialId, matchedRuleId: match?.id, policy, targets: Array.from(new Set([initialId, ...rules.filter(r => r.stage === "failure").map(r => r.targetUpstreamId)])), config };
}
export function procurementCny(p?: Procurement): Procurement | undefined {
  if (!p || p.confirmed === false) return undefined;
  if (p.currency === "CNY") return p;
  if (!p.cnyPerUnitMicros) return undefined;
  const out = { ...p, currency: "CNY" as const };
  for (const key of ["amountMicros", "inputMicrosPerMillion", "outputMicrosPerMillion", "cachedInputMicrosPerMillion", "imageInputMicrosPerMillion"] as const)
    if (p[key] !== undefined) out[key] = ((BigInt(p[key]!) * BigInt(p.cnyPerUnitMicros) + BigInt(999999)) / BigInt(1000000)).toString();
  return out;
}
export function compatiblePublicModels(config: ModelConfig, binding: ModelBinding) {
  const purpose = MODEL_BINDINGS[binding];
  return config.publicModels.filter(m => m.enabled && m.visible && m.modality === purpose.modality &&
    (m.target.type === "upstream" ? [m.target.id] : config.pools.find(p => p.id === m.target.id)?.candidates || []).some(id => {
      const u = config.upstreamModels.find(u => u.id === id);
      return u?.enabled && u.capabilities[purpose.capability] && config.providers.some(p => p.id === u.providerId && p.enabled);
    }));
}
