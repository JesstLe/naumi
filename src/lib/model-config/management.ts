import {channelEditable} from "./channel-policy";
import type { ModelConfig, ModelSnapshot, Modality } from "./types";
import { ModelConfigError } from "./types";
import { FEATURE_BINDINGS } from "./business";
import { MODEL_BINDINGS } from "./bindings";
import { compactImageModelOptions, imageModelDisplayId } from "../image-model-routing";
import { publicModelCatalog } from "./runtime";
import { adminConfiguredFeature } from "./selection-policy";
import { featureDefaultModel } from "./tool-scope";
import type { FeatureId } from "../billing/rules/registry";
import { qualityConfiguration, qualityPolicySchema } from "./quality-policy";

export const MODEL_MANAGEMENT_PROTOCOLS = ["openai-images", "new-api-flow", "apimart-images", "openai-chat", "openai-videos"] as const;
export const featureNames: Record<string, string> = {
  "image.generate": "自由生图", "image.suite": "组图", "image.aplus": "A+ 页面",
  "canvas.image": "画布生图", "canvas.expand": "画布扩图", "canvas.text-edit": "画布改字", "canvas.annotate": "画布标注",
  "canvas.text-generate": "画布文字", "canvas.assistant": "画布助手", "canvas.ocr": "画布 OCR",
  "competitor.action": "竞品操作", "video.generate": "视频生成", "tool.cutout": "抠图", "tool.ipcheck": "侵权检查",
  "tool.garment": "服装", "tool.avatar": "模特", "tool.dewrinkle": "去褶皱", "tool.dewatermark": "去水印",
  "tool.style": "风格", "tool.tryon": "试穿", "tool.retouch": "精修", "tool.recolor": "改色", "tool.replicate": "复刻",
  "tool.inpaint": "局部重绘", "tool.extract": "提取", "tool.garment3d": "服装 3D", "tool.packaging3d": "包装 3D",
};
export type ManagedModelRow = {
  id: string; label: string; alias: string; modality: Modality; supplierRouting?:ModelConfig["publicModels"][number]["supplierRouting"]; channelsEditable?:boolean; displayResolutions?: string[]; publicIds: string[];
  features: { id: string; label: string }[];
  routes: { upstreamId: string; model: string; providerId: string; provider: string; kind: string; enabled: boolean }[];
  preset: boolean; conditional: boolean; candidateIds: string[];
  canvasUnified?:boolean;
  qualityConfig?: ReturnType<typeof qualityConfiguration>;
  scopeOptions: {id:string;label:string;selected:boolean;available:boolean;adminDefault:boolean;reason?:string}[];
  pricing?: {feature:string;label:string;unit:string;credits:number|null;estimated:boolean;override?:import("./credit-overrides").ManagedModelCreditPricing}[];
};
export type ManagedModelCandidate = { id: string; model: string; label: string; providerId: string; provider: string; modality: string; verified: boolean };
export type ManagedModelCreditGrid = {quality:string;resolution:string;credits:number|null;available:boolean;effectiveQuality:string;estimated:boolean}[];
export type ModelManagementState = {
  version: number; managed: boolean; rows: ManagedModelRow[]; candidates: ManagedModelCandidate[];
  billingVersion?:number;channelHealth?:Record<string,{state:string;failures:number;retryAt:string|null;lastStatus:number|null}>;providerCapacity?:Record<string,{maxConcurrent:number;inFlight:number}>;
  providers: { id: string; name: string; baseUrl: string; protocol: string; maxConcurrent:number; enabled: boolean; configured: boolean }[];
};

export function managedModelCandidates(config: ModelConfig): ManagedModelCandidate[] {
  return config.upstreamModels.filter(u => u.enabled && config.providers.some(p => p.id === u.providerId && p.enabled && p.credentialRef))
    .map(u => ({ id: u.id, model: u.model, label: u.label, modality: u.modality, verified: u.capabilities.verified, providerId: u.providerId, provider: config.providers.find(p => p.id === u.providerId)!.name }));
}

/** Receives the same public catalogs consumed by the frontend, after selection policy. */
export function managedModelRows(snapshot: ModelSnapshot, catalogs: { feature: string; defaultModelId?: string; models: { id: string; label: string; modality: string }[] }[]): ManagedModelRow[] {
  const config = snapshot.config, rows = new Map<string, ManagedModelRow>();
  const unrestricted=structuredClone(snapshot);
  for(const model of unrestricted.config.publicModels) delete model.toolScope;
  const eligibleCatalogs=new Map(Object.entries(FEATURE_BINDINGS).map(([feature,binding])=>[feature,new Set(publicModelCatalog(unrestricted,MODEL_BINDINGS[binding!].modality,feature as FeatureId,true).models.map(m=>m.id))]));
  const inventory = config.publicModels.filter(m=>m.enabled && m.visible);
  // Seed the complete inventory in configured order before attaching tool membership.
  // Removing a family from an early tool must not move its management row.
  for (const catalog of [{feature:"",models:inventory},...catalogs]) {
    const displayed = catalog.models.some(m => m.modality === "image") ? compactImageModelOptions(catalog.models, [catalog.defaultModelId || ""]) : catalog.models;
    for (const shown of displayed) {
      const key = shown.modality === "image" ? imageModelDisplayId(shown.id) : shown.id;
      let row = rows.get(key);
      if (!row) {
        const publicIds = config.publicModels.filter(m => m.enabled && m.visible && m.modality === shown.modality && (shown.modality === "image" ? imageModelDisplayId(m.id) === key : m.id === key)).map(m => m.id);
        row = { id: key, label: shown.label, alias: config.publicModels.find(m => m.id === shown.id)!.label, modality: shown.modality as Modality, publicIds, features: [], routes: [], preset: false, conditional: false, candidateIds: [], scopeOptions:[] };
        rows.set(key, row);
      }
      if(catalog.feature) row.features.push({ id: catalog.feature, label: featureNames[catalog.feature] || catalog.feature });
    }
  }
  for (const row of Array.from(rows.values())) {
    const add = (id: string, kind: string, enabled=true) => {
      const u = config.upstreamModels.find(u => u.id === id), p = config.providers.find(p => p.id === u?.providerId);
      if (u && p && !row.routes.some(r => r.upstreamId === id && r.kind === kind)) row.routes.push({ upstreamId: id, model: u.model, providerId: p.id, provider: p.name, kind, enabled: enabled && u.enabled && p.enabled });
    };
    row.supplierRouting=config.publicModels.find(m=>m.id===row.publicIds[0])?.supplierRouting;row.channelsEditable=channelEditable(config,row.publicIds);
    row.displayResolutions = config.publicModels.find(m => m.id === row.publicIds[0])?.displayResolutions;
    row.preset = !!config.defaultImagePreset?.enabled && row.publicIds.some(id => config.defaultImagePreset!.aliases.some(a => a.id === id));
    for (const id of row.publicIds) {
      const m = config.publicModels.find(m => m.id === id)!;
      if (row.preset) add(config.defaultImagePreset!.upstreamId!, "默认预设");
      else if(m.supplierRouting)for(const c of m.supplierRouting.channels)add(c.upstreamId,c.enabled?`供应通道 · 优先级 ${c.priority} · 权重 ${c.weight}`:"停用通道",c.enabled);
      else if (m.target.type === "upstream") add(m.target.id, row.publicIds.length > 1 ? "按比例选择" : "默认调用");
      else { row.conditional = true; for (const u of config.pools.find(p => p.id === m.target.id)!.candidates) add(u, "路由池候选"); }
    }
    for (const { id: feature } of row.features) for (const o of config.business?.[feature as keyof NonNullable<ModelConfig["business"]>]?.options || []) {
      if (!row.publicIds.includes(o.modelId) || !o.enabled || !o.routing?.enabled || row.preset) continue;
      row.conditional = true; add(o.routing.defaultUpstreamId, "路由默认");
      for (const r of o.routing.rules) add(r.targetUpstreamId, r.stage === "failure" ? "失败回退" : "条件调用");
    }
    row.candidateIds = managedModelCandidates(config).filter(c => {
      try { assertManagedTarget(config, row, c.id); return true; } catch { return false; }
    }).map(c => c.id);
    row.scopeOptions = managedModelScopeOptions(row,eligibleCatalogs);
    row.canvasUnified = row.publicIds.every(id=>config.publicModels.find(m=>m.id===id)?.toolScope?.systems?.includes("canvas"));
    if (row.modality === "image") row.qualityConfig = qualityConfiguration(config, [...new Set(row.routes.map(r => r.upstreamId))]);
  }
  return Array.from(rows.values());
}

export function applyModelQualityParameters(source: ModelConfig, row: ManagedModelRow, input: { choices: { id: string; label: string }[]; routes: { upstreamId: string; mode: string; values: Record<string,string>; evidence?: { status: string; source: string; checkedAt: string } }[] } | null) {
  if (row.modality !== "image" || row.preset || !row.qualityConfig?.routes.every(r => r.editable)) throw new ModelConfigError("MODEL_PARAMETERS_ADAPTER", "此模型的外部路由或成本预设需在对应适配器中管理参数，不能覆盖其执行契约", 400);
  const config = structuredClone(source), ids = row.qualityConfig.routes.map(r => r.upstreamId);
  if (input && (new Set(input.routes.map(r => r.upstreamId)).size !== ids.length || input.routes.length !== ids.length || input.routes.some(r => !ids.includes(r.upstreamId)))) throw new ModelConfigError("INVALID_REQUEST", "请配置该家族的全部实际模型来源", 400);
  for (const id of ids) {
    const u = config.upstreamModels.find(u => u.id === id)!;
    if (!input) { delete u.parameterMap.qualityPolicy; continue; }
    const route = input.routes.find(r => r.upstreamId === id)!;
    const policy = qualityPolicySchema.parse({ mode: route.mode, choices: input.choices.map(c => ({ ...c, ...(route.mode === "map" ? {value: route.values[c.id]} : {}) })), evidence: route.evidence });
    u.parameterMap.qualityPolicy = policy;
  }
  return config;
}

/** Read eligibility without the user's scope restrictions, while retaining prices, capability and business policy. */
function managedModelScopeOptions(row:ManagedModelRow,eligibleCatalogs:Map<string,Set<string>>) {
  return Object.entries(FEATURE_BINDINGS).filter(([,binding])=>MODEL_BINDINGS[binding!].modality===row.modality).map(([feature,binding])=>{
    const available=row.publicIds.every(id=>eligibleCatalogs.get(feature)?.has(id));
    return {id:feature,label:featureNames[feature] || feature,available,selected:row.features.some(f=>f.id===feature),adminDefault:adminConfiguredFeature(feature),...(!available ? {reason:"当前模型能力或工具配置未开放此选项"} : {})};
  });
}

/** Scope is independent from prices, supplier targets and full configuration drafts. */
export function applyModelToolScope(source:ModelConfig,row:ManagedModelRow,features:string[],canvas?:boolean):ModelConfig {
  const selected=new Set(features);
  if(selected.size!==features.length || features.some(id=>!row.scopeOptions.some(o=>o.id===id && o.available)))
    throw new ModelConfigError("MODEL_INCOMPATIBLE","请选择该模型支持且已在工具配置中开放的范围");
  if(canvas!==undefined){for(const id of [...selected])if(id.startsWith("canvas."))selected.delete(id);if(canvas)for(const option of row.scopeOptions)if(option.id.startsWith("canvas.")&&option.available)selected.add(option.id);}
  const config=structuredClone(source);
  const family=(id:string)=>row.modality==="image" ? imageModelDisplayId(id)===row.id : id===row.id;
  const scopeFor=(id:string)=>{
    const m=config.publicModels.find(m=>m.id===id)!;
    if(!m.toolScope){
      const base=structuredClone(config);for(const model of base.publicModels) delete model.toolScope;
      m.toolScope={features:Object.entries(FEATURE_BINDINGS).filter(([f,b])=>MODEL_BINDINGS[b!].modality===m.modality && publicModelCatalog({version:1,digest:"",config:base},m.modality,f as FeatureId,true).models.some(x=>x.id===m.id)).map(([f])=>f as FeatureId),defaultFor:[]};
    }
    return m.toolScope;
  };
  const defaults=new Map(Object.entries(FEATURE_BINDINGS).filter(([,b])=>MODEL_BINDINGS[b!].modality===row.modality).map(([f,b])=>[f,publicModelCatalog({version:1,digest:"",config:source},row.modality,f as FeatureId,true).defaultModelId || featureDefaultModel(source,f,b)]));
  for(const model of config.publicModels.filter(m=>m.modality===row.modality && family(m.id)))
    model.toolScope={...(canvas?{systems:["canvas"] as ["canvas"]}:{}),features:[...selected] as FeatureId[],defaultFor:model.toolScope?.defaultFor.filter(f=>selected.has(f)) || []};
  const assignDefault=(feature:string,id:string)=>{
    for(const m of config.publicModels) if(m.toolScope) m.toolScope.defaultFor=m.toolScope.defaultFor.filter(f=>f!==feature);
    scopeFor(id).defaultFor.push(feature as FeatureId);
  };
  for(const option of row.scopeOptions){
    if(source.business?.[option.id as FeatureId]?.enabled===false) continue;
    const old=defaults.get(option.id);
    if(selected.has(option.id) && option.adminDefault) assignDefault(option.id,row.publicIds[0]);
    else if(!selected.has(option.id) && old && family(old)){
      const remaining=publicModelCatalog({version:1,digest:"",config},row.modality,option.id as FeatureId,true).models.filter(m=>!family(m.id));
      if(!remaining.length) throw new ModelConfigError("TOOL_REQUIRES_MODEL",`${option.label}需要保留至少一个可用模型，请先配置替代模型再移除此范围`);
      assignDefault(option.id,remaining[0].id);
    }
  }
  return config;
}

/** Persist family ordering without changing model availability, defaults or pricing. */
export function orderManagedModels(source:ModelConfig,rows:ManagedModelRow[],rowIds:string[]):ModelConfig {
  if(rowIds.length!==rows.length || new Set(rowIds).size!==rows.length || rowIds.some(id=>!rows.some(row=>row.id===id)))
    throw new ModelConfigError("INVALID_MODEL_ORDER","排序必须包含当前全部模型，且不能重复，请刷新后重试");
  const config=structuredClone(source),rank=new Map(rowIds.map((id,index)=>[id,index]));
  const key=(m:ModelConfig["publicModels"][number])=>m.modality==="image"?imageModelDisplayId(m.id):m.id;
  const visible=config.publicModels.filter(m=>m.enabled&&m.visible&&rank.has(key(m))).sort((a,b)=>rank.get(key(a))!-rank.get(key(b))!);
  let index=0;
  config.publicModels=config.publicModels.map(m=>m.enabled&&m.visible&&rank.has(key(m))?visible[index++]:m);
  // Business catalogs have their own option sort values. Keep them in the same
  // published order without changing defaults, availability, routes or prices.
  const publicRank=new Map(config.publicModels.map((m,i)=>[m.id,i]));
  for(const feature of Object.values(config.business || {}))
    [...feature!.options].sort((a,b)=>(publicRank.get(a.modelId)??Infinity)-(publicRank.get(b.modelId)??Infinity)).forEach((option,i)=>{option.sort=i;});
  return config;
}

/** A simple switch is global to the public alias/family, and preserves every price and binding. */
export function switchManagedModel(source: ModelConfig, row: ManagedModelRow, upstreamId: string): ModelConfig {
  assertManagedTarget(source, row, upstreamId);
  const config = structuredClone(source);
  for(const m of config.publicModels.filter(m=>row.publicIds.includes(m.id)))delete m.supplierRouting;
  if (row.preset) return config;
  for (const id of row.publicIds) {
    config.publicModels.find(m => m.id === id)!.target = { type: "upstream", id: upstreamId };
    for (const f of Object.values(config.business || {})) for (const o of f?.options || []) if (o.modelId === id && o.routing) o.routing.enabled = false;
  }
  return config;
}
/** Labels are shared across a family; identifiers, targets and billing stay intact. */
export function renameManagedModel(source: ModelConfig, row: ManagedModelRow, label: string): ModelConfig {
  const name = label.trim();
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new ModelConfigError("INVALID_LABEL", "显示名称需要 1–100 个字符，不能包含换行或控制字符");
  const config = structuredClone(source);
  const ids = new Set(config.publicModels.filter(m => m.modality === row.modality && (row.modality === "image" ? imageModelDisplayId(m.id) === row.id : m.id === row.id)).map(m => m.id));
  for (const model of config.publicModels) if (ids.has(model.id)) model.label = name;
  for (const alias of config.defaultImagePreset?.aliases || []) if (ids.has(alias.id)) alias.label = name;
  return config;
}
function assertManagedTarget(config: ModelConfig, row: ManagedModelRow, upstreamId: string) {
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

