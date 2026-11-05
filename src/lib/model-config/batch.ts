import type { ModelConfig } from "./types";
import type { BusinessOption } from "./business-schema";
import { businessOptionSchema } from "./business-schema";
import { FEATURE_IDS, type FeatureId } from "../billing/rules/registry";
import { FEATURE_BINDINGS, compatiblePublicModels, upstreamSupportsFeature } from "./feature-model-policy";
import { MODEL_BINDINGS } from "./bindings";
import { cnyCredits } from "../billing/money";

export type BatchInput = {
  mode: "new" | "existing"; modelId: string; label: string; upstreamId: string;
  features: FeatureId[]; pricing: NonNullable<BusinessOption["pricing"]>; unit: BusinessOption["unit"];
  overwritePrice: boolean; direct: boolean; setDefault: boolean;
};
/** Browser-safe planner. The existing server draft/publish validators remain authoritative. */
export function batchFeatureAvailability(config: ModelConfig, upstreamId: string) {
  const u = config.upstreamModels.find(m => m.id === upstreamId);
  return FEATURE_IDS.map(feature => {
    const binding = FEATURE_BINDINGS[feature];
    let reason = "";
    if (!binding) reason = "使用独立处理器";
    else if (!u?.enabled || !config.providers.some(p => p.id === u.providerId && p.enabled)) reason = "上游或供应商未启用";
    else if (!u.capabilities.verified) reason = "上游能力尚未核验";
    else if (u.modality !== MODEL_BINDINGS[binding].modality || !upstreamSupportsFeature(u.capabilities, binding, feature)) reason = "模型能力不兼容";
    else if (config.business?.[feature]?.enabled === false) reason = "功能已停用，请先在单功能配置中启用";
    return { feature, compatible: !reason, reason };
  });
}
export function planModelBatch(config: ModelConfig, input: BatchInput) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(input.modelId)) throw Error("公开模型 ID 格式无效");
  const label = input.label.trim();
  if (!label || label.length > 100) throw Error("请填写前端展示名称（最多 100 字）");
  const upstream = config.upstreamModels.find(u => u.id === input.upstreamId);
  if (!upstream) throw Error("请选择实际上游模型");
  const existing = config.publicModels.find(m => m.id === input.modelId);
  if (input.mode === "new" && existing) throw Error("公开模型 ID 已存在，请选择复用模型");
  if (input.mode === "existing" && (!existing || !existing.enabled || !existing.visible || existing.target.type !== "upstream" || existing.target.id !== upstream.id)) throw Error("复用模型必须是启用、公开且指向所选上游的直连模型");
  const parsed = businessOptionSchema.parse({ modelId: input.modelId, enabled: true, sort: 0, unit: input.unit, pricing: input.pricing });
  if (parsed.pricing?.mode !== "cny-fixed" && parsed.pricing?.mode !== "usage") throw Error("请使用人民币固定或用量价格");
  if (upstream.modality === "text" && input.unit === "image") throw Error("文字操作不能按图片结算");
  if (parsed.pricing.mode === "usage" && (upstream.modality !== "text" || input.unit !== "task")) throw Error("用量价格只支持具有用量回执的文字任务");
  const p = parsed.pricing;
  for (const amount of p.mode === "usage" ? [p.authorizationCnyMicros] : [p.amountMicros, ...(p.variants || []).map(v => v.amountMicros)]) cnyCredits(amount, p);
  const targets = Array.from(new Set(input.features));
  if (!targets.length) throw Error("请至少勾选一个兼容功能");
  const availability = batchFeatureAvailability(config, upstream.id);
  for (const target of targets) {
    const a = availability.find(a => a.feature === target);
    if (!a?.compatible) throw Error(`${target}：${a?.reason || "未知功能"}`);
  }
  const next = structuredClone(config);
  if (existing) next.publicModels.find(m => m.id === existing.id)!.label = label;
  else next.publicModels.push({ id: input.modelId, label, enabled: true, visible: true, modality: upstream.modality, target: { type: "upstream", id: upstream.id } });
  const changes: { feature: FeatureId; beforeDefault: string; afterDefault: string; price: string; route: string }[] = [];
  next.business ||= {};
  for (const feature of targets) {
    if (!compatiblePublicModels(next, FEATURE_BINDINGS[feature]!, feature).some(m => m.id === input.modelId)) throw Error(`${feature}：模型能力不兼容`);
    const old = config.business?.[feature];
    const f = next.business[feature] ||= { enabled: true, defaultModelId: input.modelId, options: [] };
    const option = f.options.find(o => o.modelId === input.modelId);
    if (!option) f.options.push({ ...structuredClone(parsed), sort: f.options.length ? Math.max(...f.options.map(o => o.sort)) + 1 : 0 });
    else {
      option.enabled = true;
      if (input.overwritePrice) { option.pricing = structuredClone(input.pricing); option.unit = input.unit; }
      if (input.direct && option.routing) option.routing.enabled = false;
    }
    if (input.setDefault) f.defaultModelId = input.modelId;
    changes.push({ feature, beforeDefault: old?.defaultModelId || config.bindings[FEATURE_BINDINGS[feature]!] || "未配置", afterDefault: f.defaultModelId,
      price: !option ? "新增基础价格" : input.overwritePrice ? "覆盖此模型价格与收费单位" : "保留此模型原价格",
      route: !option ? "新增选项直接调用" : input.direct ? "关闭此模型路由" : "保留此模型原路由" });
  }
  // Do not mutate purpose bindings: they can be shared by unselected features.
  const sharedLabelFeatures = Object.entries(config.business || {}).filter(([, f]) => f?.options.some(o => o.modelId === input.modelId)).map(([feature]) => feature);
  return { config: next, changes, sharedLabelFeatures, changed: JSON.stringify(next) !== JSON.stringify(config) };
}
