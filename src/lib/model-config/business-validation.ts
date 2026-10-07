import type { ModelConfig } from "./types";
import { ModelConfigError } from "./types";
import { compatiblePublicModels, FEATURE_BINDINGS, procurementCny } from "./business";
import { MODEL_BINDINGS } from "./bindings";
import { cnyCredits } from "../billing/money";

export function validateBusinessConfig(config: ModelConfig) {
  const fail = (message: string, field: string): never => { throw new ModelConfigError("INVALID_CONFIG", message, 400, [field]); };
  if (new Set(config.fixedMonthlyCosts?.map(c => c.id)).size !== (config.fixedMonthlyCosts?.length || 0)) fail("固定月费编号重复", "fixedMonthlyCosts");
  for (const u of config.upstreamModels) {
    const p = u.procurement;
    if (!p) continue;
    if (p.confirmed !== true && (p.amountMicros === "0" || p.basis === "tokens" && [p.inputMicrosPerMillion,p.outputMicrosPerMillion,p.cachedInputMicrosPerMillion,p.imageInputMicrosPerMillion].some(v => v === "0"))) fail("零采购成本需要管理员明确确认，未知成本不得按零处理", `upstreamModels.${u.id}.procurement`);
    if (p.basis === "tokens" ? p.inputMicrosPerMillion === undefined || p.outputMicrosPerMillion === undefined || p.amountMicros !== undefined : p.amountMicros === undefined || [p.inputMicrosPerMillion, p.outputMicrosPerMillion, p.cachedInputMicrosPerMillion, p.imageInputMicrosPerMillion].some(v => v !== undefined))
      fail("采购成本单位不完整；按张包价与 token 计费不得叠加", `upstreamModels.${u.id}.procurement`);
  }
  for (const [feature, f] of Object.entries(config.business || {})) {
    const field = `business.${feature}`, binding = FEATURE_BINDINGS[feature as keyof typeof FEATURE_BINDINGS];
    if (!binding) fail("该功能使用独立处理器，尚未接入可选供应商模型", field);
    const compatible = compatiblePublicModels(config, binding!);
    if (new Set(f!.options.map(o => o.modelId)).size !== f!.options.length) fail("功能中的模型 ID 重复", field);
    if (!f!.options.some(o => o.enabled && o.modelId === f!.defaultModelId)) fail("默认模型必须是启用的选项", field);
    for (const o of f!.options) {
      const model = config.publicModels.find(m => m.id === o.modelId);
      if (!model || o.enabled && !compatible.some(m => m.id === model.id)) fail("功能模型能力不兼容或未启用", field);
      if(config.defaultImagePreset?.enabled && config.defaultImagePreset.aliases.some(a=>a.id===o.modelId)) continue;
      if (model!.target.type === "pool") fail("功能模型请指定真实上游，再开启阶段路由；旧混合池单独维护，避免关闭路由后仍分流", field);
      const p = o.pricing;
      if (o.enabled && !p) fail("启用的功能模型必须设置明确用户售价", field);
      if (MODEL_BINDINGS[binding!].modality === "text" && o.unit === "image") fail("文字操作的收费单位应为任务或结果，不是图片", field);
      if (p?.mode === "cny-fixed" || p?.mode === "usage") {
        try { for (const amount of p.mode === "usage" ? [p.authorizationCnyMicros] : [p.amountMicros,...(p.variants || []).map(v=>v.amountMicros)]) cnyCredits(amount,p); } catch { fail("价格与兑换率对应的积分金额超出范围",field); }
      }
      if (p?.mode === "cny-fixed" && new Set(p.variants?.map(v=>`${v.quality||"*"}:${v.resolution||"*"}`)).size !== (p.variants?.length || 0)) fail("相同规格的价格重复",field);
      if (o.enabled && feature === "canvas.assistant" && !(model!.target.type === "upstream" && config.upstreamModels.find(u => u.id === model!.target.id)?.capabilities.vision)) fail("画布助手必须选用已声明图片输入能力的模型", field);
      const targetIds = model!.target.type === "upstream" ? [model!.target.id] : config.pools.find(p => p.id === model!.target.id)!.candidates;
      for (const id of targetIds) {
        const u = config.upstreamModels.find(u => u.id === id)!;
        if (o.enabled && !u.capabilities.verified) fail("功能模型必须先核验真实供应商能力，未核验目录只保留旧用途兼容", field);
        if (o.parameters?.qualities?.some(q => !u.capabilities.qualities.includes(q)) || o.parameters?.resolutions?.some(r => !u.capabilities.nativeResolutions.includes(r))) fail("配置的质量/尺寸超出模型真实声明能力", field);
        if (o.parameters?.inputTypes?.includes("mask") && config.providers.find(p => p.id === u.providerId)?.protocol !== "openai-images") fail("所选协议不支持蒙版输入", field);
        if (o.parameters?.inputTypes?.includes("image") && u.modality === "text" && !u.capabilities.vision) fail("文字模型不支持图片输入", field);
      }
      if (p && !["cny-fixed", "usage"].includes(p.mode)) fail("业务模型售价必须明确使用人民币固定或用量价格", field);
      if (p?.mode === "usage" && (MODEL_BINDINGS[binding!].modality !== "text" || o.unit !== "task")) fail("首版实际用量结算仅开放有 usage 回执的文字任务", field);
      const policy = o.routing;
      if (policy?.enabled) {
        if (model!.target.type !== "upstream" || MODEL_BINDINGS[binding!].modality === "video") fail("阶段路由需要直连图片/文字模型；视频及外部混合池保持原执行协议", field);
        const targets = [policy.defaultUpstreamId, ...policy.rules.map(r => r.targetUpstreamId)];
        if (new Set(policy.rules.map(r => r.id)).size !== policy.rules.length) fail("路由规则编号重复", field);
        if (new Set(policy.rules.map(r => `${r.stage}:${r.priority}`)).size !== policy.rules.length) fail("同阶段规则优先级重复", field);
        for (const r of policy.rules) if (r.stage === "request" && ((r.when.minReferences || 0) > (r.when.maxReferences ?? 32) || (r.when.minInputLength || 0) > (r.when.maxInputLength ?? 1000000))) fail("路由条件范围无效", field);
        const base = config.upstreamModels.find(u => u.id === model!.target.id)!;
        for (const id of targets) {
          const u = config.upstreamModels.find(u => u.id === id), supplier = config.providers.find(s => s.id === u?.providerId);
          if (!u?.enabled || !supplier?.enabled || !u.capabilities.verified || u.modality !== model!.modality || !u.capabilities[MODEL_BINDINGS[binding!].capability] || !["openai-images", "openai-chat", "new-api-flow"].includes(supplier.protocol)) fail("阶段路由目标能力未核验或协议尚未接通", field);
          const caps = u!.capabilities, promised = base.capabilities;
          if (caps.qualityRank < promised.qualityRank || promised.edit && !caps.edit || promised.vision && !caps.vision || promised.transparent && !caps.transparent || promised.preserveIdentity && !caps.preserveIdentity || promised.textAccuracy && !caps.textAccuracy || caps.maxReferenceImages < promised.maxReferenceImages || promised.nativeResolutions.some(n => !caps.nativeResolutions.includes(n)) || promised.qualities.some(q => !caps.qualities.includes(q))) fail("路由目标低于公开模型承诺的能力或规格", field);
          if (!procurementCny(u!.procurement) || u!.procurement?.basis === "tokens") fail("阶段路由预算需要明确的按张/按次人民币采购成本（含 USD 折算）", field);
          if (BigInt(procurementCny(u!.procurement)!.amountMicros!) > BigInt(policy.costCapCnyMicros)) fail("单次采购成本超过路由上限", field);
        }
      }
      if (o.postprocess?.enabled) {
        if (o.postprocess.failure === "keep-base") fail("底图未达到约定像素时须保留待恢复，不得按完整交付结算", field);
        if (MODEL_BINDINGS[binding!].modality !== "image") fail("只有图片操作可以配置后处理", field);
        if (o.postprocess.kind === "ai-upscale") fail("AI 超分处理器尚未接通独立任务回执，当前只开放普通缩放和原生校验", field);
        if (o.postprocess.processor !== (o.postprocess.kind === "resize" ? "sharp-lanczos3" : "none")) fail("后处理类型与处理器不匹配", field);
        if (!["image.generate", "canvas.image"].includes(feature)) fail("该功能的持久后处理尚未接入，当前开放普通生图及画布改字", field);
      }
    }
  }
}
