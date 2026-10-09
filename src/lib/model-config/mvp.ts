import type { ModelConfig, ModelSnapshot } from "./types";
import { ModelConfigError } from "./types";
import { FEATURE_BINDINGS } from "./business";
import { MODEL_BINDINGS } from "./bindings";
import { compactImageModelOptions, imageModelDisplayId } from "../image-model-routing";

export const MVP_PROTOCOLS = ["openai-images", "new-api-flow", "apimart-images", "openai-chat", "openai-videos"] as const;
export const featureNames: Record<string, string> = {
  "image.generate": "自由生图", "image.suite": "组图", "image.aplus": "A+ 页面",
  "canvas.image": "画布生图", "canvas.expand": "画布扩图", "canvas.text-edit": "画布改字", "canvas.annotate": "画布标注",
  "canvas.text-generate": "画布文字", "canvas.assistant": "画布助手", "canvas.ocr": "画布 OCR",
  "competitor.action": "竞品操作", "video.generate": "视频生成", "tool.cutout": "抠图", "tool.ipcheck": "侵权检查",
  "tool.garment": "服装", "tool.avatar": "模特", "tool.dewrinkle": "去褶皱", "tool.dewatermark": "去水印",
  "tool.style": "风格", "tool.tryon": "试穿", "tool.retouch": "精修", "tool.recolor": "改色", "tool.replicate": "复刻",
  "tool.inpaint": "局部重绘", "tool.extract": "提取", "tool.garment3d": "服装 3D", "tool.packaging3d": "包装 3D",
};
export type MvpRow = {
  id: string; label: string; alias: string; modality: string; publicIds: string[];
  features: { id: string; label: string }[];
  routes: { upstreamId: string; model: string; providerId: string; provider: string; kind: string; enabled: boolean }[];
  preset: boolean; conditional: boolean; candidateIds: string[];
};
export type MvpCandidate = { id: string; model: string; label: string; providerId: string; provider: string; modality: string; verified: boolean };
export type MvpState = {
  version: number; managed: boolean; rows: MvpRow[]; candidates: MvpCandidate[];
  providers: { id: string; name: string; baseUrl: string; protocol: string; enabled: boolean; configured: boolean }[];
};

export function mvpCandidates(config: ModelConfig): MvpCandidate[] {
  return config.upstreamModels.filter(u => u.enabled && config.providers.some(p => p.id === u.providerId && p.enabled && p.credentialRef))
    .map(u => ({ id: u.id, model: u.model, label: u.label, modality: u.modality, verified: u.capabilities.verified, providerId: u.providerId, provider: config.providers.find(p => p.id === u.providerId)!.name }));
}

/** Receives the same public catalogs consumed by the frontend, after selection policy. */
export function mvpRows(snapshot: ModelSnapshot, catalogs: { feature: string; defaultModelId?: string; models: { id: string; label: string; modality: string }[] }[]): MvpRow[] {
  const config = snapshot.config, rows = new Map<string, MvpRow>();
  for (const catalog of catalogs) {
    const displayed = catalog.models.some(m => m.modality === "image") ? compactImageModelOptions(catalog.models, [catalog.defaultModelId || ""]) : catalog.models;
    for (const shown of displayed) {
      const key = shown.modality === "image" ? imageModelDisplayId(shown.id) : shown.id;
      let row = rows.get(key);
      if (!row) {
        const publicIds = config.publicModels.filter(m => m.enabled && m.visible && m.modality === shown.modality && (shown.modality === "image" ? imageModelDisplayId(m.id) === key : m.id === key)).map(m => m.id);
        row = { id: key, label: shown.label, alias: config.publicModels.find(m => m.id === shown.id)!.label, modality: shown.modality, publicIds, features: [], routes: [], preset: false, conditional: false, candidateIds: [] };
        rows.set(key, row);
      }
      row.features.push({ id: catalog.feature, label: featureNames[catalog.feature] || catalog.feature });
    }
  }
  for (const row of Array.from(rows.values())) {
    const add = (id: string, kind: string) => {
      const u = config.upstreamModels.find(u => u.id === id), p = config.providers.find(p => p.id === u?.providerId);
      if (u && p && !row.routes.some(r => r.upstreamId === id && r.kind === kind)) row.routes.push({ upstreamId: id, model: u.model, providerId: p.id, provider: p.name, kind, enabled: u.enabled && p.enabled });
    };
    row.preset = !!config.defaultImagePreset?.enabled && row.publicIds.some(id => config.defaultImagePreset!.aliases.some(a => a.id === id));
    for (const id of row.publicIds) {
      const m = config.publicModels.find(m => m.id === id)!;
      if (row.preset) add(config.defaultImagePreset!.upstreamId!, "默认预设");
      else if (m.target.type === "upstream") add(m.target.id, row.publicIds.length > 1 ? "按比例选择" : "默认调用");
      else { row.conditional = true; for (const u of config.pools.find(p => p.id === m.target.id)!.candidates) add(u, "路由池候选"); }
    }
    for (const { id: feature } of row.features) for (const o of config.business?.[feature as keyof NonNullable<ModelConfig["business"]>]?.options || []) {
      if (!row.publicIds.includes(o.modelId) || !o.enabled || !o.routing?.enabled || row.preset) continue;
      row.conditional = true; add(o.routing.defaultUpstreamId, "路由默认");
      for (const r of o.routing.rules) add(r.targetUpstreamId, r.stage === "failure" ? "失败回退" : "条件调用");
    }
    row.candidateIds = mvpCandidates(config).filter(c => {
      try { assertMvpTarget(config, row, c.id); return true; } catch { return false; }
    }).map(c => c.id);
  }
  return Array.from(rows.values());
}

/** A simple switch is global to the public alias/family, and preserves every price and binding. */
export function switchMvpModel(source: ModelConfig, row: MvpRow, upstreamId: string): ModelConfig {
  assertMvpTarget(source, row, upstreamId);
  const config = structuredClone(source);
  if (row.preset) return config;
  for (const id of row.publicIds) {
    config.publicModels.find(m => m.id === id)!.target = { type: "upstream", id: upstreamId };
    for (const f of Object.values(config.business || {})) for (const o of f?.options || []) if (o.modelId === id && o.routing) o.routing.enabled = false;
  }
  return config;
}
function assertMvpTarget(config: ModelConfig, row: MvpRow, upstreamId: string) {
  const u = config.upstreamModels.find(u => u.id === upstreamId), p = config.providers.find(p => p.id === u?.providerId);
  if (!u?.enabled || !p?.enabled || !p.credentialRef || u.modality !== row.modality)
    throw new ModelConfigError("MODEL_INCOMPATIBLE", "请选择已启用、已接入且类型一致的上游模型");
  if (row.preset && upstreamId !== config.defaultImagePreset?.upstreamId)
    throw new ModelConfigError("PRESET_REVIEW_REQUIRED", "该模型使用专用定价预设；更换实际模型前，请在模型配置中心核验新模型的能力、参数和采购价格");
  if (row.preset) return;
  for (const feature of row.features) {
    const binding = FEATURE_BINDINGS[feature.id as keyof typeof FEATURE_BINDINGS];
    if (binding && !u.capabilities[MODEL_BINDINGS[binding].capability]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "新模型不支持当前使用功能的输入或输出");
    if (feature.id === "canvas.assistant" && !u.capabilities.vision) throw new ModelConfigError("MODEL_INCOMPATIBLE", "画布助手需要支持图片理解的文字模型");
  }
  for (const old of row.publicIds) {
    for (const [binding, modelId] of Object.entries(config.bindings)) if (modelId === old && !u.capabilities[MODEL_BINDINGS[binding as keyof typeof MODEL_BINDINGS].capability]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "新模型不满足用途绑定的能力");
    for (const [feature, f] of Object.entries(config.business || {})) for (const o of f?.options || []) if (o.modelId === old) {
      const purpose = FEATURE_BINDINGS[feature as keyof typeof FEATURE_BINDINGS];
      if (o.enabled && purpose && !u.capabilities[MODEL_BINDINGS[purpose].capability]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "新模型不满足使用功能的能力");
      if (o.parameters?.qualities?.some(q => !u.capabilities.qualities.includes(q)) || o.parameters?.resolutions?.some(r => !u.capabilities.nativeResolutions.includes(r))) throw new ModelConfigError("MODEL_INCOMPATIBLE", "新模型不满足功能明确配置的质量或尺寸规格");
      if (o.parameters?.inputTypes?.includes("image") && u.modality === "text" && !u.capabilities.vision) throw new ModelConfigError("MODEL_INCOMPATIBLE", "新模型不支持当前图片输入");
      if (o.parameters?.inputTypes?.includes("mask") && p.protocol !== "openai-images") throw new ModelConfigError("MODEL_INCOMPATIBLE", "新协议不支持现有蒙版输入");
    }
  }
}

