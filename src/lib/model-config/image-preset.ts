import { z } from "zod";
import type { ModelConfig } from "./types";
import { ModelConfigError } from "./types";
import { procurementSchema } from "./business-schema";
import { FEATURE_BINDINGS, featureDefaultModel } from "./feature-model-policy";
import type { FeatureId } from "../billing/types";
import type { ConfigSnapshot } from "../billing/types";
import type { ModelBinding } from "./bindings";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
const micros = z.string().regex(/^(0|[1-9]\d{0,14})$/);
const ratio = z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/);
export const imagePresetSchema = z.strictObject({
  schemaVersion: z.literal(1), enabled: z.boolean(), upstreamId: id.optional(),
  aliases: z.array(z.strictObject({ id, label: z.string().trim().min(1).max(100) })).min(1).max(10),
  defaultModelIds: z.array(id).max(200), qualityCap: z.literal("medium"),
  qualityParameter: z.enum(["quality", "omit"]), supportsMask: z.boolean(),
  versionParameter: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/).optional(),
  outputDimensions: z.record(z.string().max(30),z.strictObject({width:z.number().int().min(256).max(8192),height:z.number().int().min(256).max(8192)})).optional(),
  resolutions: z.array(z.enum(["1K", "2K", "4K"])).max(3), ratios: z.array(ratio).max(30),
  resolutionMap: z.partialRecord(z.enum(["1K", "2K", "4K"]), z.string().regex(/^[124][kK]$/)),
  ratioMap: z.record(ratio, z.string().regex(/^[1-9]\d{0,2}:[1-9]\d{0,2}$/)),
  // Capability proof names the exact wire ID. Discovery alone is not proof.
  evidence: z.strictObject({ actualModel: z.string().max(160), source: z.string().max(1000), checkedAt: z.iso.datetime(), confirmed: z.boolean() }).optional(),
  costSource: z.literal("task-total-then-usage"), factorBps: z.number().int().min(10000).max(100000),
  fx: z.strictObject({ rateMicros: micros.refine(v => BigInt(v) > BigInt(0)), basis: z.enum(["recharge", "admin-rate", "budget"]), evidence: z.string().min(1).max(300), updatedAt: z.iso.datetime() }).optional(),
  creditsPerCnyMicros: micros, rounding: z.enum(["ceil", "floor", "nearest"]),
  authorizationCnyMicros: micros,
  prices: z.array(z.strictObject({ quality: z.enum(["low", "medium"]), resolution: z.enum(["1K", "2K", "4K"]), procurement: procurementSchema,
    estimatedUsage: z.strictObject({ inputTokens: z.number().int().nonnegative().max(1000000), outputTokens: z.number().int().nonnegative().max(1000000), cachedInputTokens: z.number().int().nonnegative().optional(), imageInputTokens: z.number().int().nonnegative().optional() }).optional() })).max(6),
});
export type ImagePreset = z.infer<typeof imagePresetSchema>;
export type ImageParameters = { quality: string; resolution: string; ratio: string };
export const DISPLAY_QUALITIES = ["low", "medium", "high", "xhigh", "max", "auto"] as const;

/** Draft only. Never selects a similar model, fabricates costs, or overwrites an existing preset. */
export function initializeImagePreset(config: ModelConfig, billing?: ConfigSnapshot): ImagePreset {
  if (config.defaultImagePreset) return structuredClone(config.defaultImagePreset);
  return { schemaVersion: 1, enabled: false, aliases: [{ id: "gpt-image2.5", label: "灵动2.5" }],
    defaultModelIds: Array.from(new Set([config.bindings["image.generate"], config.bindings["image.edit"], ...Object.entries(config.business || {}).filter(([f]) => isDefaultImageFeature(f)).map(([, f]) => f!.defaultModelId)].filter(Boolean))),
    qualityCap: "medium", qualityParameter: "omit", supportsMask: false, resolutions: [], ratios: [], resolutionMap: {}, ratioMap: {}, costSource: "task-total-then-usage", factorBps: 15000,
    creditsPerCnyMicros: existingCreditConversion(billing), rounding: "ceil", authorizationCnyMicros: "0", prices: [] };
}
export function existingCreditConversion(billing?: ConfigSnapshot): string {
  const rates=new Set(Object.values(billing?.config.features||{}).flatMap(f=>"creditsPerCnyMicros" in f.pricing?[f.pricing.creditsPerCnyMicros]:[]));
  if(rates.size===1)return Array.from(rates)[0];
  if(rates.size>1)return "0";
  const products=Object.values(billing?.config.products||{}).filter(p=>p.available&&p.kind==="pack"&&p.amountFen>0&&p.baseCredits>0);
  for(const p of products){const n=BigInt(p.baseCredits)*BigInt(100000000);if(n%BigInt(p.amountFen))return "0";rates.add((n/BigInt(p.amountFen)).toString());}
  return rates.size===1?Array.from(rates)[0]:"0";
}
export function isDefaultImageFeature(feature?: string, binding?: string) {
  const b = binding || FEATURE_BINDINGS[feature as FeatureId];
  return b === "image.generate" || b === "image.edit";
}
export function selectedImagePreset(config: ModelConfig, feature?: string, selected?: string, binding?: string): ImagePreset | undefined {
  const p = config.defaultImagePreset;
  if (!p?.enabled || !isDefaultImageFeature(feature, binding)) return undefined;
  const chosen = selected || featureDefaultModel(config, feature, (binding || FEATURE_BINDINGS[feature as FeatureId]) as ModelBinding);
  return !chosen || p.defaultModelIds.includes(chosen) || p.aliases.some(a => a.id === chosen || a.label === chosen) ? p : undefined;
}
export function presetPublicId(p: ImagePreset, selected?: string) { return p.aliases.find(a => a.id === selected || a.label === selected)?.id || p.aliases[0].id; }
export function effectiveImageParameters(p: ImagePreset, requested: ImageParameters) {
  const q = requested.quality.trim().toLowerCase();
  const effective = { ...requested, quality: q === "low" ? "low" : "medium" };
  const supportedResolution = p.resolutions.includes(requested.resolution as any), supportedRatio=p.ratios.includes(requested.ratio);
  const unsupportedCombination=supportedResolution && supportedRatio && !p.outputDimensions?.[`${requested.resolution}:${requested.ratio}`];
  const nativeResolution = supportedResolution && !unsupportedCombination;
  const nativeRatio = supportedRatio && !unsupportedCombination;
  return { requested: { ...requested }, effective, upstream: {
    ...(p.qualityParameter === "quality" ? { quality: effective.quality } : {}),
    ...(nativeResolution ? { resolution: p.resolutionMap[requested.resolution as "1K"] } : {}),
    ...(nativeRatio ? { size: p.ratioMap[requested.ratio] } : {}),
  }, nativeResolution, nativeRatio,
  promptConstraints: [!nativeResolution ? `请按${requested.resolution}目标清晰度生成；该规格仅作为提示词约束，不保证原生像素。` : "", !nativeRatio ? `画面比例为${requested.ratio}。` : ""].filter(Boolean) };
}
export function validateImagePreset(config: ModelConfig) {
  const p = config.defaultImagePreset;
  if (!p?.enabled) return;
  const fail = (s: string): never => { throw new ModelConfigError("INVALID_CONFIG", s, 400, ["defaultImagePreset"]); };
  const u = config.upstreamModels.find(u => u.id === p.upstreamId), provider = config.providers.find(v => v.id === u?.providerId);
  if(BigInt(p.creditsPerCnyMicros)<=BigInt(0)||BigInt(p.authorizationCnyMicros)<=BigInt(0)) fail("请核实积分兑换规则并配置用户确认的售价上限，不能使用未知或零兑换率");
  if (!u?.enabled || !provider?.enabled || provider.protocol !== "apimart-images" || !u.capabilities.verified || !u.capabilities.generate || !u.capabilities.edit) fail("预设需要已核验、启用且支持生成/编辑的 APIMart 实际模型");
  if (!p.evidence?.confirmed || p.evidence.actualModel !== u!.model || !p.evidence.source.trim()) fail("请先核实当前默认实际模型 ID 与能力，填写核验来源");
  if (p.qualityParameter === "quality" && !["low", "medium"].every(q => u!.capabilities.qualities.includes(q as any))) fail("当前模型尚未核实 low/medium quality 参数");
  if (p.resolutions.some(r => !u!.capabilities.nativeResolutions.includes(r) || !p.resolutionMap[r]) || p.ratios.some(r => !p.ratioMap[r])) fail("支持尺寸和比例必须提供真实参数映射");
  if (p.resolutions.some(r=>!p.ratios.some(a=>p.outputDimensions?.[`${r}:${a}`])) || p.ratios.some(a=>!p.resolutions.some(r=>p.outputDimensions?.[`${r}:${a}`]))) fail("原生尺寸/比例至少需要一个已核验的像素组合；矩阵缺失的组合只使用提示词约束，4K档不等于4096边长");
  if (new Set(p.aliases.map(a => a.id)).size !== p.aliases.length || new Set(p.prices.map(v => `${v.quality}:${v.resolution}`)).size !== p.prices.length) fail("预设别名或有效规格价格重复");
  for (const quality of ["low", "medium"] as const) for (const resolution of ["1K", "2K", "4K"] as const) {
    const v = p.prices.find(v => v.quality === quality && v.resolution === resolution), cost = v?.procurement;
    if (!cost || cost.confirmed !== true || cost.currency === "USD" && !p.fx) fail("每个有效规格需要完整 API 成本估算及明确折算；未知不视为零");
    if (cost!.basis === "tokens" ? !v?.estimatedUsage || cost!.amountMicros !== undefined || cost!.inputMicrosPerMillion === undefined || cost!.outputMicrosPerMillion === undefined || cost!.imageInputMicrosPerMillion === undefined : cost!.amountMicros === undefined || [cost!.inputMicrosPerMillion,cost!.outputMicrosPerMillion,cost!.cachedInputMicrosPerMillion,cost!.imageInputMicrosPerMillion].some(x => x !== undefined)) fail("按次/按张完整包价与输入输出 token 估算不能叠加；图片输入费需明确");
  }
  for (const a of p.aliases) {
    const old = config.publicModels.find(m => m.id === a.id);
    if (old && (old.modality !== "image" || old.target.type !== "upstream" || old.target.id !== p.upstreamId) && !p.defaultModelIds.includes(a.id)) fail("展示 ID 已用于其他模型，请使用独立 ID");
  }
}
export function installImagePresetAliases(config: ModelConfig) {
  const p = config.defaultImagePreset;
  if (!p) return;
  if (!p.enabled) {
    // Leave original bindings and business prices intact. Added aliases are
    // virtual preset options, not legacy fixed-price options when disabled.
    const referenced=new Set([...Object.values(config.bindings),...Object.values(config.business||{}).flatMap(f=>f?.options.map(o=>o.modelId)||[])]);
    config.publicModels = config.publicModels.filter(m => !p.aliases.some(a => a.id === m.id) || referenced.has(m.id) || p.defaultModelIds.includes(m.id));
    return;
  }
  validateImagePreset(config);
  for (const a of p.aliases) {
    const existing = config.publicModels.find(m => m.id === a.id);
    const model = { ...a, ...(existing?.previousIds ? {previousIds:existing.previousIds} : {}), ...(existing?.displayResolutions ? {displayResolutions:existing.displayResolutions} : {}), ...(existing?.toolScope ? {toolScope:existing.toolScope} : {}), modality: "image" as const, enabled: true, visible: true, target: { type: "upstream" as const, id: p.upstreamId! } };
    const i = config.publicModels.findIndex(m => m.id === a.id);
    if (i < 0) config.publicModels.push(model); else config.publicModels[i] = model;
  }
}
