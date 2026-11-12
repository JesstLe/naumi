import {publishedImagegenCapabilities} from "../imagegen/capabilities";
import type { ModelConfig, PublicModel, UpstreamModel } from "./types";
import type { BusinessOption } from "./business-schema";
import {compileImageParameterPlan} from "./image-parameter-plan";
import {qualityPresentation} from "./quality-policy";
import { ModelConfigError } from "./types";
import { procurementCny } from "./business";
import { compatiblePublicModels, FEATURE_BINDINGS, upstreamSupportsFeature } from "./feature-model-policy";
import { MODEL_BINDINGS } from "./bindings";
import { cnyCredits } from "../billing/money";

function configuredImageSpecs(u:UpstreamModel,option:BusinessOption,model:PublicModel){
  return {qualities:option.parameters?.qualities||qualityPresentation([u])?.qualities||(u.capabilities.qualities.length?u.capabilities.qualities:["medium"]),
    resolutions:option.parameters?.resolutions||model.displayResolutions||(u.parameterMap.resolutionPolicy?.mode==="map"?Object.keys(u.parameterMap.resolutionPolicy.values):u.capabilities.nativeResolutions.length?u.capabilities.nativeResolutions:["1K"]),
    ratios:option.parameters?.ratios||u.parameterMap.apimartImages?.ratios||["1:1"]};
}

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
    const compatible = compatiblePublicModels(config, binding!, feature);
    if (new Set(f!.options.map(o => o.modelId)).size !== f!.options.length) fail("功能中的模型 ID 重复", field);
    if (!f!.options.some(o => o.enabled && o.modelId === f!.defaultModelId) && !(f!.inheritExisting&&compatible.some(m=>m.id===f!.defaultModelId)&&!f!.options.some(o=>o.modelId===f!.defaultModelId&&!o.enabled))) fail("默认模型必须是启用的选项", field);
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
      const targetIds = model!.target.type === "upstream" ? [model!.target.id] : config.pools.find(p => p.id === model!.target.id)!.candidates;
      for (const id of targetIds) {
        const u = config.upstreamModels.find(u => u.id === id)!;
        if(u.modality==="image"&&o.parameters){
          const specs=configuredImageSpecs(u,o,model!),supplier=config.providers.find(p=>p.id===u.providerId)!;
          for(const quality of specs.qualities)for(const resolution of specs.resolutions)for(const ratio of specs.ratios)
            try{compileImageParameterPlan(u,{quality,resolution,ratio},{publicModelId:model!.id,protocol:supplier.protocol,modelVersion:0,adapter:supplier.options?.imageAdapter});}
            catch(error){fail(error instanceof Error?error.message:"图片参数映射无效",field);}
        }
        if (o.parameters?.inputTypes?.includes("mask") && config.providers.find(p => p.id === u.providerId)?.protocol !== "openai-images") fail("所选协议不支持蒙版输入", field);
        if (o.parameters?.inputTypes?.includes("image") && u.modality === "text" && !u.capabilities.vision) fail("文字模型不支持图片输入", field);
      }
      if (p && !["cny-fixed", "usage", "fixed", "matrix"].includes(p.mode)) fail("业务模型售价需要明确的积分、规格矩阵或人民币价格", field);
      if(p?.mode==='matrix'&&o.enabled){
        for(const id of targetIds){const u=config.upstreamModels.find(u=>u.id===id)!;
          const specs=configuredImageSpecs(u,o,model!);
          for(const q of specs.qualities)for(const r of specs.resolutions)
            if(p.prices[q as keyof typeof p.prices]?.[r as keyof typeof p.prices.low]===null||p.prices[q as keyof typeof p.prices]?.[r as keyof typeof p.prices.low]===undefined)fail('请设置全部可用规格的积分售价',field);
        }
      }
      if (p?.mode === "usage" && (MODEL_BINDINGS[binding!].modality !== "text" || o.unit !== "task")) fail("首版实际用量结算仅开放有 usage 回执的文字任务", field);
      const policy = o.routing;
      if (policy?.enabled) {
        if (model!.target.type !== "upstream" || !["image", "text"].includes(MODEL_BINDINGS[binding!].modality)) fail("阶段路由需要直连图片/文字模型；视频、音频及外部混合池保持原执行协议", field);
        const targets = [policy.defaultUpstreamId, ...policy.rules.map(r => r.targetUpstreamId)];
        if (new Set(policy.rules.map(r => r.id)).size !== policy.rules.length) fail("路由规则编号重复", field);
        if (new Set(policy.rules.map(r => `${r.stage}:${r.priority}`)).size !== policy.rules.length) fail("同阶段规则优先级重复", field);
        for (const r of policy.rules) if (r.stage === "request" && ((r.when.minReferences || 0) > (r.when.maxReferences ?? 32) || (r.when.minInputLength || 0) > (r.when.maxInputLength ?? 1000000))) fail("路由条件范围无效", field);
        const base = config.upstreamModels.find(u => u.id === model!.target.id)!;
        for (const id of targets) {
          const u = config.upstreamModels.find(u => u.id === id), supplier = config.providers.find(s => s.id === u?.providerId);
          if (!u?.enabled || !supplier?.enabled || u.modality !== model!.modality || !upstreamSupportsFeature(u.capabilities, binding!, feature) || !["openai-images", "openai-chat", "new-api-flow"].includes(supplier.protocol)) fail("阶段路由目标未启用、能力不兼容或协议尚未接通", field);
          const caps = u!.capabilities, promised = base.capabilities;
          const targetImage=publishedImagegenCapabilities(caps),promisedImage=publishedImagegenCapabilities(promised);
          const editMissing=u!.modality==="image" ? promisedImage.edit?.state==="supported" && targetImage.edit?.state!=="supported" : promised.edit && !caps.edit;
          const transparencyMissing=u!.modality==="image" ? promisedImage.transparent?.state==="supported" && targetImage.transparent?.state!=="supported" : promised.transparent && !caps.transparent;
          if (editMissing || promised.vision && !caps.vision || transparencyMissing || caps.maxReferenceImages < promised.maxReferenceImages) fail("路由目标低于公开模型承诺的输入或透明能力", field);
          if(u!.modality==="image"){
            const specs=configuredImageSpecs(base,o,model!);
            for(const quality of specs.qualities)for(const resolution of specs.resolutions)for(const ratio of specs.ratios)
              try{compileImageParameterPlan(u!,{quality,resolution,ratio},{publicModelId:model!.id,protocol:supplier!.protocol,modelVersion:0,adapter:supplier!.options?.imageAdapter});}
              catch(error){fail(error instanceof Error?error.message:"路由目标参数映射不完整",field);}
          }
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
