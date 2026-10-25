import {resolveImageResolution, resolutionFacts, upstreamAcceptsResolution} from "./resolution-fallback";
import { applicationAPIMartImages } from "./apimart-image-policy";
import "server-only";
import { frontendModelSelection } from "./frontend-selection";
import {missingImagegenCapabilities,publishedImagegenCapabilities} from "../imagegen/capabilities";
import { requestedFeatureModel } from "./selection-policy";
import type { ConfigSnapshot } from "../billing/types";
import type { createCredentialStore } from "./credentials";
import type { ModelRuntime } from "./runtime";
import {simulateModel} from "@/lib/model-config/simulation";
import { MODEL_BINDINGS, type ModelBinding } from "./bindings";
import { validateModelConfig, type ValidationOptions } from "./schema";
import { ModelConfigError, type ModelFacts, type ModelSnapshot, type Modality, type ModelProvider } from "./types";
import { runModelExecution, runExecutionBundle, type ExecutionBundle, type ResolvedExecutionBundle, type ModelExecutionScope } from "./context";
import { executionOpenAI } from "./clients";
import { businessRoutePlan, selectedBusinessOption } from "./business";
import { selectedImagePreset, effectiveImageParameters } from "./image-preset";
import {selectFeatureModel} from "./model-selection";
import {validatePreparedImage,type PreparedImageOperation} from "./prepared-image-contract";
import {freezeManagedVideoCapability} from "../video/frozen-capability";
import {type FrozenVideoCapability} from "../video/frozen-capability-schema";

export type ExecutionModel = { imageUpstreamIds?: string[]; video?: FrozenVideoCapability; requestedParameters?: import("./image-preset").ImageParameters; feature?: string; modelVersion: number; billingVersion: number; modelDigest: string; publicModelId: string; binding: string; modality: Modality; target: { type: "upstream" | "pool"; id: string }; credentialRef?: string; routerDigest?: string; facts?: ModelFacts };
export type ExecutionConnection = { providerId: string; protocol: string; baseUrl: string; apiKey: string; wireModel: string; timeoutMs: number; credentialRef?: string; maxConcurrent?: number; options?: ModelProvider["options"] };
type Dependencies = ValidationOptions & { runtime: Pick<ModelRuntime, "byVersion" | "prepareExecution"> & Partial<Pick<ModelRuntime, "validateExecutionProjection">>; credentials: Pick<ReturnType<typeof createCredentialStore>,"read">; billingByVersion?:(version:number)=>Promise<ConfigSnapshot>; gateway: () => { baseUrl: string; apiKey: string } };
import {executionSchema,imageUpstreamIdsSchema} from "./execution-contract";
export function createModelExecutor(deps: Dependencies) {
  const describe = async (raw: ExecutionModel): Promise<ModelExecutionScope> => {
    const parsed = executionSchema.safeParse(raw);
    if (!parsed.success) throw new ModelConfigError("EXECUTION_MISMATCH", "任务执行配置无效，需要核查原记录", 503);
    const frozen = parsed.data;
    const snapshot = await deps.runtime.byVersion(frozen.modelVersion);
    const frontendModel = frontendModelSelection(snapshot, frozen.modality, frozen.publicModelId);
    const publicModel = snapshot.config.publicModels.find(m => m.id === frozen.publicModelId && m.enabled && m.modality === frozen.modality);
    const purpose = MODEL_BINDINGS[frozen.binding as ModelBinding];
    const businessOption = selectedBusinessOption(snapshot.config, frozen.feature, frozen.publicModelId);
    const plan = businessRoutePlan(snapshot.config, businessOption, frozen.facts);
    if (snapshot.digest !== frozen.modelDigest || !publicModel || (plan ? frozen.target.type !== "upstream" || frozen.target.id !== plan.initialId : publicModel.target.type !== frozen.target.type || publicModel.target.id !== frozen.target.id) || !purpose || purpose.modality !== frozen.modality) throw new ModelConfigError("EXECUTION_MISMATCH", "任务与原模型版本不一致", 503);
    const upstream = frozen.target.type === "upstream" ? snapshot.config.upstreamModels.find(u => u.id === frozen.target.id)! : undefined;
    const provider = upstream ? snapshot.config.providers.find(p => p.id === upstream.providerId)! : undefined;
    const preset = selectedImagePreset(snapshot.config,frozen.feature,frozen.publicModelId,frozen.binding);
    const routed = !preset && (frozen.target.type === "pool" || provider && ["apimart-images", "fal-images"].includes(provider.protocol) && !applicationAPIMartImages(provider.protocol,upstream?.parameterMap));
    if (provider?.credentialRef !== frozen.credentialRef || routed !== !!frozen.routerDigest) throw new ModelConfigError("EXECUTION_MISMATCH", "任务凭据或路由版本不一致", 503);
    if (routed) {
      if (!deps.runtime.validateExecutionProjection) throw new ModelConfigError("CONFIG_UNAVAILABLE", "执行路由版本无法核对", 503);
      await deps.runtime.validateExecutionProjection({ modelVersion: frozen.modelVersion, billingVersion: frozen.billingVersion, digest: frozen.routerDigest! });
      const gateway = deps.gateway();
      if (!gateway.apiKey || !gateway.baseUrl) throw new ModelConfigError("ROUTER_UNAVAILABLE", "未配置私有生成连接", 503);
      const pool = frozen.target.type === "pool" ? snapshot.config.pools.find(p => p.id === frozen.target.id) : undefined;
      const candidates = snapshot.config.upstreamModels.filter(u => pool ? pool.candidates.includes(u.id) : u.id === upstream!.id);
      if(frozen.facts?.imagegenRequirements&&candidates.some(u=>missingImagegenCapabilities(frozen.facts!.imagegenRequirements!,publishedImagegenCapabilities(u.capabilities)).length))throw new ModelConfigError("MODEL_INCOMPATIBLE","外部路由包含不满足必要图像参数的候选，不能静默回退",400);
      const capabilities = { ...candidates[0].capabilities, qualities: Array.from(new Set(candidates.flatMap(u => u.capabilities.qualities))), nativeResolutions: Array.from(new Set(candidates.flatMap(u => u.capabilities.nativeResolutions))), edit: candidates.some(u => u.capabilities.edit), maxReferenceImages: Math.max(...candidates.map(u => u.capabilities.maxReferenceImages)) };
      return { frozen, frontendModel, connection: { ...gateway, protocol: "router-images", providerId: "managed-router", wireModel: frozen.publicModelId, timeoutMs: 280000 }, capabilities, parameterMap: {}, businessOption, audited: true };
    }
    const connectionFor = async (id: string) => {
      const u = snapshot.config.upstreamModels.find(u => u.id === id)!, p = snapshot.config.providers.find(p => p.id === u.providerId)!;
      return { providerId: p.id, protocol: p.protocol, baseUrl: p.baseUrl, apiKey: await deps.credentials.read(p.credentialRef!, p.id), credentialRef: p.credentialRef, wireModel: u.model, timeoutMs: p.timeoutMs, maxConcurrent: p.maxConcurrent, options: { ...p.options, ...(frozen.video?.profile ? {videoProfile:frozen.video.profile} : u.parameterMap.videoProfile ? {videoProfile:u.parameterMap.videoProfile} : {}) } };
    };
    let scope:ModelExecutionScope;
    if(publicModel.supplierRouting){
      if(!deps.billingByVersion)throw new ModelConfigError("CONFIG_UNAVAILABLE","供应通道无法读取冻结计费版本",503);
      const eligible=frozen.modality==="image"&&frozen.facts?new Set(simulateModel(snapshot,await deps.billingByVersion(frozen.billingVersion),publicModel.id,frozen.facts,deps).eligible.map(u=>u.upstreamId)):new Set(publicModel.supplierRouting.channels.filter(c=>c.enabled&&snapshot.config.upstreamModels.some(u=>u.id===c.upstreamId&&u.enabled&&u.capabilities[purpose.capability]&&(!(frozen.feature==="canvas.assistant"&&frozen.facts?.references)||u.capabilities.vision)&&snapshot.config.providers.some(p=>p.id===u.providerId&&p.enabled))).map(c=>c.upstreamId));
      if(frozen.modality==="image" && frozen.requestedParameters && frozen.facts) for(const id of eligible) {
        const u=snapshot.config.upstreamModels.find(u=>u.id===id)!;
        if(!upstreamAcceptsResolution(u,frozen.facts.requestedResolution||frozen.facts.resolution,frozen.facts.ratio))eligible.delete(id);
      }
      // New plans freeze the admitted set, including adapter-only restrictions
      // that the generic simulator cannot reconstruct. Never widen it on resume.
      // The absent field preserves the interpretation of historical paid tasks.
      if(frozen.imageUpstreamIds)for(const id of eligible)if(!frozen.imageUpstreamIds.includes(id))eligible.delete(id);
      const targets=await Promise.all(publicModel.supplierRouting.channels.filter(c=>c.enabled&&eligible.has(c.upstreamId)).map(async c=>{const u=snapshot.config.upstreamModels.find(u=>u.id===c.upstreamId)!;return {...c,scope:{frozen,frontendModel,channelGuard:{upstreamId:u.id},connection:await connectionFor(u.id),capabilities:u.capabilities,parameterMap:u.parameterMap,procurement:u.procurement,businessOption,audited:true}};}));
      if(!targets.length)throw new ModelConfigError("MODEL_INCOMPATIBLE","没有符合本次参数的供应通道",400);
      // Resolve only eligible targets. A disabled/incompatible first entry must
      // not require its credentials or dictate the healthy targets' transport.
      scope={...targets[0].scope,supplierRouting:{policy:publicModel.supplierRouting,targets},connection:{...targets[0].scope.connection,protocol:"supplier-channels",wireModel:frozen.publicModelId}};
      scope.capabilities={...targets[0].scope.capabilities,vision:targets.some(c=>c.scope.capabilities.vision),edit:targets.some(c=>c.scope.capabilities.edit),generate:targets.some(c=>c.scope.capabilities.generate),maxReferenceImages:Math.max(...targets.map(c=>c.scope.capabilities.maxReferenceImages))};
    }else scope={frozen,frontendModel,...(!plan&&!preset&&upstream&&frozen.modality!=="video"?{channelGuard:{upstreamId:upstream.id}}:{}),connection:await connectionFor(upstream!.id),capabilities:frozen.video?{...upstream!.capabilities,video:frozen.video.definition}:upstream!.capabilities,parameterMap:upstream!.parameterMap,businessOption,procurement:upstream!.procurement};
    if (preset) Object.assign(scope,{ imagePreset: structuredClone(preset), audited:true });
    if (plan) {
      const targets = Object.fromEntries(await Promise.all(plan.targets.map(async id => {
        const u = snapshot.config.upstreamModels.find(u => u.id === id)!;
        return [id, { connection: await connectionFor(id), capabilities: u.capabilities, parameterMap: u.parameterMap, procurement: u.procurement! }];
      })));
      scope.routing = { policy: plan.policy, matchedRuleId: plan.matchedRuleId, targets, spentMicros: BigInt(0) };
    }
    return scope;
  };
  return {
    async resolve(input: { preparedImage?:PreparedImageOperation; imageUpstreamIds?:string[]; allowResolutionFallback?:boolean; requestedParameters?:import("./image-preset").ImageParameters; scopeSystem?:"canvas"; feature?: string; binding: string; requestedModelId?: string; snapshot: ModelSnapshot; billing: ConfigSnapshot; facts?: ModelFacts }): Promise<ExecutionModel> {
      const prepared=input.preparedImage?validatePreparedImage(input.preparedImage,input.snapshot,input.billing,input.feature,input.binding):undefined;
      if(prepared)input={...input,requestedModelId:prepared.modelId,facts:prepared.facts,requestedParameters:prepared.requestedParameters,imageUpstreamIds:prepared.eligibleUpstreamIds,allowResolutionFallback:false};
      input = { ...input, requestedModelId: requestedFeatureModel(input.feature, input.requestedModelId) };
      const purpose = MODEL_BINDINGS[input.binding as ModelBinding];
      if (!purpose) throw new ModelConfigError("INVALID_REQUEST", "未知模型用途");
      const config = validateModelConfig(input.snapshot.config, deps);
      const preset = selectedImagePreset(config,input.feature,input.requestedModelId,input.binding);
      let requestedParameters = input.requestedParameters || (preset && input.facts ? {quality:input.facts.quality,resolution:input.facts.resolution,ratio:input.facts.ratio||"1:1"} : undefined);
      if (preset && input.facts && !prepared) {
        const parameters = effectiveImageParameters(preset,{quality:input.facts.quality,resolution:input.facts.requestedResolution||input.facts.resolution,ratio:input.facts.ratio||"1:1"});
        input = {...input,facts:{...input.facts,...parameters.effective,nativeResolution:parameters.nativeResolution && input.facts.resolution !== "1K"}};
      }
      const selection=selectFeatureModel(config,{feature:input.feature,binding:input.binding,requestedModelId:input.requestedModelId,scopeSystem:input.scopeSystem})!;
      const {model,option}=selection;
      if(prepared&&model.id!==prepared.modelId)throw new ModelConfigError("EXECUTION_MISMATCH","准备模型与执行用途不一致",503);
      let imageUpstreamIds = input.imageUpstreamIds === undefined ? undefined : imageUpstreamIdsSchema.parse(input.imageUpstreamIds);
      if(imageUpstreamIds && (purpose.modality!=="image" || !model.supplierRouting && model.target.type==="upstream" && !imageUpstreamIds.includes(model.target.id)))throw new ModelConfigError("MODEL_INCOMPATIBLE","本次图片候选与模型配置不一致",400);
      if (purpose.modality === "image" && input.facts && input.allowResolutionFallback !== false) {
        const requested = input.facts.requestedResolution || input.facts.resolution;
        const choice = resolveImageResolution(config, model.id, requested, input.feature, input.facts.ratio,{snapshot:input.snapshot,billing:input.billing,facts:input.facts,options:deps});
        if (choice.supported.length) {
          requestedParameters ||= {quality:input.facts.quality,resolution:requested,ratio:input.facts.ratio||"1:1"};
          if(choice.changed) input = {...input,facts:resolutionFacts(input.facts,choice.effective)};
        }
      }

      const plan = businessRoutePlan(config, option, input.facts);
      const target = plan ? { type: "upstream" as const, id: plan.initialId } : model.target;
      const upstream = target.type === "upstream" ? config.upstreamModels.find(u => u.id === target.id)! : undefined;
      const provider = upstream ? config.providers.find(p => p.id === upstream.providerId)! : undefined;
      if (upstream && !model.supplierRouting && (!upstream.capabilities[purpose.capability] || input.feature==="canvas.assistant"&&!!input.facts?.references&&!upstream.capabilities.vision)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不支持当前操作", 400);
      if (purpose.modality === "image" && input.facts) {
        const result = simulateModel(input.snapshot, input.billing, model.id, input.facts, deps);
        const admitted=imageUpstreamIds;
        if(admitted)result.eligible=result.eligible.filter(c=>admitted.includes(c.upstreamId));
        if(model.supplierRouting && input.facts.nativeResolution && input.facts.resolution!=="1K"){
          const tier=input.facts.resolution as "2K"|"4K";
          result.eligible=result.eligible.filter(c=>{
            const u=config.upstreamModels.find(u=>u.id===c.upstreamId)!,p=config.providers.find(p=>p.id===u.providerId)!;
            if(p.protocol!=="openai-images")return true;
            const map=u.parameterMap.resolutionPolicy;
            return map ? map.mode==="map"&&!!map.values[tier]&&(p.options?.imageAdapter!=="reverse-hub"||map.field==="resolution") : !!u.parameterMap.resolution?.[tier];
          });
          imageUpstreamIds=result.eligible.map(c=>c.upstreamId);
        }
        if (!result.eligible.length) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不满足图片质量、尺寸或参考要求", 400);
        if (plan) for (const id of plan.targets) {
          const alternative = structuredClone(input.snapshot);
          alternative.config.publicModels.find(m => m.id === model.id)!.target = { type: "upstream", id };
          if (!simulateModel(alternative, input.billing, model.id, input.facts, deps).eligible.length) throw new ModelConfigError("MODEL_INCOMPATIBLE", "路由目标不满足本次请求的图片能力", 400);
          const u = config.upstreamModels.find(u => u.id === id)!, p = config.providers.find(p => p.id === u.providerId)!;
          if (p.protocol === "openai-images" && input.facts.nativeResolution && input.facts.resolution !== "1K" && !(u.parameterMap.resolutionPolicy ? u.parameterMap.resolutionPolicy.mode==="map"&&u.parameterMap.resolutionPolicy.field===(p.options?.imageAdapter==="reverse-hub"?"resolution":"size")&&u.parameterMap.resolutionPolicy.values[input.facts.resolution as "2K"|"4K"] : u.parameterMap.resolution?.[input.facts.resolution as "2K"|"4K"])) throw new ModelConfigError("MODEL_INCOMPATIBLE", "路由目标缺少原生尺寸参数映射", 400);
        }
        if (!model.supplierRouting && provider?.protocol === "openai-images" && input.facts.nativeResolution && input.facts.resolution !== "1K" && !(upstream!.parameterMap.resolutionPolicy ? upstream!.parameterMap.resolutionPolicy.mode==="map"&&upstream!.parameterMap.resolutionPolicy.field===(provider.options?.imageAdapter==="reverse-hub"?"resolution":"size")&&upstream!.parameterMap.resolutionPolicy.values[input.facts.resolution as "2K"|"4K"] : upstream!.parameterMap.resolution?.[input.facts.resolution as "2K"|"4K"])) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该原生尺寸缺少已核验的接口参数映射", 400);
      }
      const routed = !preset && (model.target.type === "pool" || provider && ["apimart-images", "fal-images"].includes(provider.protocol) && !applicationAPIMartImages(provider.protocol,upstream?.parameterMap));
      if(routed&&input.facts?.imagegenRequirements){
        const ids=model.target.type==="pool"?config.pools.find(p=>p.id===model.target.id)!.candidates:[upstream!.id];
        if(config.upstreamModels.filter(u=>ids.includes(u.id)).some(u=>missingImagegenCapabilities(input.facts!.imagegenRequirements!,publishedImagegenCapabilities(u.capabilities)).length))throw new ModelConfigError("MODEL_INCOMPATIBLE","外部路由无法保证所有回退候选满足必要图像参数",400);
      }
      const projection = routed ? await deps.runtime.prepareExecution({ snapshot: input.snapshot, billing: input.billing }) : undefined;
      const video = purpose.modality === "video" && upstream && provider ? await freezeManagedVideoCapability(input.snapshot,upstream,provider) : undefined;
      return { ...(imageUpstreamIds ? {imageUpstreamIds:[...imageUpstreamIds]} : {}), ...(video ? {video} : {}), ...(requestedParameters ? {requestedParameters} : {}), ...(input.feature ? { feature: input.feature } : {}), modelVersion: input.snapshot.version, billingVersion: input.billing.version, modelDigest: input.snapshot.digest, publicModelId: model.id, binding: input.binding, modality: model.modality, target: structuredClone(target), ...(provider?.credentialRef ? { credentialRef: provider.credentialRef } : {}), ...(projection ? { routerDigest: projection.digest } : {}), ...(input.facts ? { facts: structuredClone(input.facts) } : {}) };
    },
    describe,
    async clientFor(model: ExecutionModel) { const scope = await describe(model); return { client: executionOpenAI(scope, deps), wireModel: scope.connection.wireModel }; },
    async run<T>(model: ExecutionModel, action: () => Promise<T>) { return runModelExecution(await describe(model), action); },
    async runBundle<T>(frozen: ExecutionBundle, billing: ConfigSnapshot, action: () => Promise<T>, models?:ModelSnapshot) {
      const resolved: ResolvedExecutionBundle = { frozen, billing,...(models?{models}:{} ) };
      if(models&&models.version!==frozen.modelVersion)throw new ModelConfigError("EXECUTION_MISMATCH","准备模型快照版本不一致",503);
      if (billing.version !== frozen.billingVersion) throw new ModelConfigError("EXECUTION_MISMATCH", "任务计费快照版本不一致", 503);
      for (const role of ["image", "text", "vision", "video"] as const) if (frozen[role]) {
        if (frozen[role]!.modelVersion !== frozen.modelVersion || frozen[role]!.billingVersion !== frozen.billingVersion) throw new ModelConfigError("EXECUTION_MISMATCH", "任务模型与计费组合不一致", 503);
        resolved[role] = await describe(frozen[role]!);
      }
      const primary = resolved[frozen.primary || "image"] || resolved.text || resolved.vision || resolved.video;
      return runExecutionBundle(resolved, () => primary ? runModelExecution(primary, action) : action());
    },
  };
}

export async function getModelExecutor() {
  const {getModelExecutionServices}=await import("./execution-services");
  const services=getModelExecutionServices();
  return createModelExecutor({ runtime:services.runtime,billingByVersion:services.billing.byVersion,credentials:services.credentials,trustedOrigins:services.trustedOrigins,
    gateway: () => ({ baseUrl: process.env.NAUMI_ROUTER_GENERATION_URL || "", apiKey: process.env.NAUMI_ROUTER_GENERATION_TOKEN || "" }) });
}
export async function withExecutionModel<T>(model: ExecutionModel, run: () => Promise<T>) { return (await getModelExecutor()).run(model, run); }
export async function withFrozenExecutionBundle<T>(bundle: ExecutionBundle, run: () => Promise<T>) {
  const {readFrozenBillingSnapshot}=await import("../billing/frozen-config");
  return (await getModelExecutor()).runBundle(bundle,await readFrozenBillingSnapshot(bundle.billingVersion),run);
}
