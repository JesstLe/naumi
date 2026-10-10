import "server-only";
import { requestedFeatureModel } from "./selection-policy";
import { z } from "zod";
import type { ConfigSnapshot } from "../billing/types";
import type { createCredentialStore } from "./credentials";
import type { ModelRuntime } from "./runtime";
import { simulateModel } from "./runtime";
import { MODEL_BINDINGS, type ModelBinding } from "./bindings";
import { validateModelConfig, type ValidationOptions } from "./schema";
import { ModelConfigError, type ModelFacts, type ModelSnapshot, type Modality, type ModelProvider } from "./types";
import { runModelExecution, runExecutionBundle, type ExecutionBundle, type ResolvedExecutionBundle, type ModelExecutionScope } from "./context";
import { executionOpenAI } from "./clients";
import { businessRoutePlan, selectedBusinessOption } from "./business";
import { selectedImagePreset, presetPublicId, effectiveImageParameters } from "./image-preset";
import { assertToolScope, featureDefaultModel } from "./tool-scope";

export type ExecutionModel = { requestedParameters?: import("./image-preset").ImageParameters; feature?: string; modelVersion: number; billingVersion: number; modelDigest: string; publicModelId: string; binding: string; modality: Modality; target: { type: "upstream" | "pool"; id: string }; credentialRef?: string; routerDigest?: string; facts?: ModelFacts };
export type ExecutionConnection = { providerId: string; protocol: string; baseUrl: string; apiKey: string; wireModel: string; timeoutMs: number; credentialRef?: string; maxConcurrent?: number; options?: ModelProvider["options"] };
type Dependencies = ValidationOptions & { runtime: Pick<ModelRuntime, "byVersion" | "prepareExecution"> & Partial<Pick<ModelRuntime, "validateExecutionProjection">>; credentials: ReturnType<typeof createCredentialStore>; billingByVersion?:(version:number)=>Promise<ConfigSnapshot>; gateway: () => { baseUrl: string; apiKey: string } };
const factsSchema = z.strictObject({ task: z.enum(["draft", "product", "detail", "layout"]), quality: z.string().max(10), resolution: z.enum(["1K", "2K", "4K"]), ratio: z.string().max(20).optional(), needsEdit: z.boolean(), needsMask: z.boolean().optional(), preserveIdentity: z.boolean(), needsText: z.boolean(), nativeResolution: z.boolean(), references: z.number().int().min(0).max(32), quantity: z.number().int().min(1).max(4).optional(), inputLength: z.number().int().min(0).max(1000000).optional() });
const executionSchema = z.strictObject({ requestedParameters: z.strictObject({quality:z.string().max(20),resolution:z.string().max(20),ratio:z.string().max(20)}).optional(), feature: z.string().max(100).optional(), modelVersion: z.number().int().positive(), billingVersion: z.number().int().positive(), modelDigest: z.string().regex(/^[a-f0-9]{64}$/), publicModelId: z.string().max(100), binding: z.string().max(100), modality: z.enum(["image", "text", "video"]), target: z.strictObject({ type: z.enum(["upstream", "pool"]), id: z.string().max(100) }), credentialRef: z.uuid().optional(), routerDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), facts: factsSchema.optional() });
export function createModelExecutor(deps: Dependencies) {
  const describe = async (raw: ExecutionModel): Promise<ModelExecutionScope> => {
    const parsed = executionSchema.safeParse(raw);
    if (!parsed.success) throw new ModelConfigError("EXECUTION_MISMATCH", "任务执行配置无效，需要核查原记录", 503);
    const frozen = parsed.data;
    const snapshot = await deps.runtime.byVersion(frozen.modelVersion);
    const publicModel = snapshot.config.publicModels.find(m => m.id === frozen.publicModelId && m.enabled && m.modality === frozen.modality);
    const purpose = MODEL_BINDINGS[frozen.binding as ModelBinding];
    const businessOption = selectedBusinessOption(snapshot.config, frozen.feature, frozen.publicModelId);
    const plan = businessRoutePlan(snapshot.config, businessOption, frozen.facts);
    if (snapshot.digest !== frozen.modelDigest || !publicModel || (plan ? frozen.target.type !== "upstream" || frozen.target.id !== plan.initialId : publicModel.target.type !== frozen.target.type || publicModel.target.id !== frozen.target.id) || !purpose || purpose.modality !== frozen.modality) throw new ModelConfigError("EXECUTION_MISMATCH", "任务与原模型版本不一致", 503);
    const upstream = frozen.target.type === "upstream" ? snapshot.config.upstreamModels.find(u => u.id === frozen.target.id)! : undefined;
    const provider = upstream ? snapshot.config.providers.find(p => p.id === upstream.providerId)! : undefined;
    const preset = selectedImagePreset(snapshot.config,frozen.feature,frozen.publicModelId,frozen.binding);
    const routed = !preset && (frozen.target.type === "pool" || provider && ["apimart-images", "fal-images"].includes(provider.protocol));
    if (provider?.credentialRef !== frozen.credentialRef || routed !== !!frozen.routerDigest) throw new ModelConfigError("EXECUTION_MISMATCH", "任务凭据或路由版本不一致", 503);
    if (routed) {
      if (!deps.runtime.validateExecutionProjection) throw new ModelConfigError("CONFIG_UNAVAILABLE", "执行路由版本无法核对", 503);
      await deps.runtime.validateExecutionProjection({ modelVersion: frozen.modelVersion, billingVersion: frozen.billingVersion, digest: frozen.routerDigest! });
      const gateway = deps.gateway();
      if (!gateway.apiKey || !gateway.baseUrl) throw new ModelConfigError("ROUTER_UNAVAILABLE", "未配置私有生成连接", 503);
      const pool = frozen.target.type === "pool" ? snapshot.config.pools.find(p => p.id === frozen.target.id) : undefined;
      const candidates = snapshot.config.upstreamModels.filter(u => pool ? pool.candidates.includes(u.id) : u.id === upstream!.id);
      const capabilities = { ...candidates[0].capabilities, qualities: Array.from(new Set(candidates.flatMap(u => u.capabilities.qualities))), nativeResolutions: Array.from(new Set(candidates.flatMap(u => u.capabilities.nativeResolutions))), edit: candidates.some(u => u.capabilities.edit), maxReferenceImages: Math.max(...candidates.map(u => u.capabilities.maxReferenceImages)) };
      return { frozen, connection: { ...gateway, protocol: "router-images", providerId: "managed-router", wireModel: frozen.publicModelId, timeoutMs: 280000 }, capabilities, parameterMap: {}, businessOption, audited: true };
    }
    const connectionFor = async (id: string) => {
      const u = snapshot.config.upstreamModels.find(u => u.id === id)!, p = snapshot.config.providers.find(p => p.id === u.providerId)!;
      return { providerId: p.id, protocol: p.protocol, baseUrl: p.baseUrl, apiKey: await deps.credentials.read(p.credentialRef!, p.id), credentialRef: p.credentialRef, wireModel: u.model, timeoutMs: p.timeoutMs, maxConcurrent: p.maxConcurrent, options: p.options };
    };
    const scope: ModelExecutionScope = { frozen, connection: await connectionFor(publicModel.supplierRouting?.channels.find(c=>c.enabled)?.upstreamId || upstream!.id), capabilities: upstream!.capabilities, parameterMap: upstream!.parameterMap, businessOption, procurement: upstream!.procurement };
    if(publicModel.supplierRouting){
      if(!deps.billingByVersion)throw new ModelConfigError("CONFIG_UNAVAILABLE","供应通道无法读取冻结计费版本",503);
      const eligible=frozen.facts?new Set(simulateModel(snapshot,await deps.billingByVersion(frozen.billingVersion),publicModel.id,frozen.facts,deps).eligible.map(u=>u.upstreamId)):new Set(publicModel.supplierRouting.channels.filter(c=>c.enabled).map(c=>c.upstreamId));
      const targets=await Promise.all(publicModel.supplierRouting.channels.filter(c=>c.enabled&&eligible.has(c.upstreamId)).map(async c=>{const u=snapshot.config.upstreamModels.find(u=>u.id===c.upstreamId)!;return {...c,scope:{frozen,connection:await connectionFor(u.id),capabilities:u.capabilities,parameterMap:u.parameterMap,procurement:u.procurement,audited:true}};}));
      if(!targets.length)throw new ModelConfigError("MODEL_INCOMPATIBLE","没有符合本次参数的供应通道",400);
      scope.supplierRouting={policy:publicModel.supplierRouting,targets};scope.connection={...scope.connection,protocol:"supplier-channels",wireModel:frozen.publicModelId};
      scope.capabilities={...targets[0].scope.capabilities,edit:targets.some(c=>c.scope.capabilities.edit),generate:targets.some(c=>c.scope.capabilities.generate),maxReferenceImages:Math.max(...targets.map(c=>c.scope.capabilities.maxReferenceImages))};
    }
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
    async resolve(input: { scopeSystem?:"canvas"; feature?: string; binding: string; requestedModelId?: string; snapshot: ModelSnapshot; billing: ConfigSnapshot; facts?: ModelFacts }): Promise<ExecutionModel> {
      input = { ...input, requestedModelId: requestedFeatureModel(input.feature, input.requestedModelId) };
      const purpose = MODEL_BINDINGS[input.binding as ModelBinding];
      if (!purpose) throw new ModelConfigError("INVALID_REQUEST", "未知模型用途");
      const config = validateModelConfig(input.snapshot.config, deps);
      const preset = selectedImagePreset(config,input.feature,input.requestedModelId,input.binding);
      const requestedParameters = preset && input.facts ? {quality:input.facts.quality,resolution:input.facts.resolution,ratio:input.facts.ratio||"1:1"} : undefined;
      if (preset && input.facts) {
        const parameters = effectiveImageParameters(preset,requestedParameters!);
        input = {...input,facts:{...input.facts,...parameters.effective,nativeResolution:parameters.nativeResolution && input.facts.resolution !== "1K"}};
      }
      const option = selectedBusinessOption(config, input.feature, input.requestedModelId);
      const id = preset ? presetPublicId(preset,input.requestedModelId) : option?.modelId || input.requestedModelId || featureDefaultModel(config,input.feature,input.binding as ModelBinding);
      const model = config.publicModels.find(m => m.id === id && m.enabled && m.modality === purpose.modality && (!input.requestedModelId || m.visible));
      if (!model) throw new ModelConfigError("MODEL_UNAVAILABLE", "所选模型不可用，请刷新模型列表后重试", 409);
      assertToolScope(config,input.feature,model.id,input.scopeSystem);
      const plan = businessRoutePlan(config, option, input.facts);
      const target = plan ? { type: "upstream" as const, id: plan.initialId } : model.target;
      const upstream = target.type === "upstream" ? config.upstreamModels.find(u => u.id === target.id)! : undefined;
      const provider = upstream ? config.providers.find(p => p.id === upstream.providerId)! : undefined;
      if (upstream && !model.supplierRouting && !upstream.capabilities[input.feature==="canvas.assistant"?"vision":purpose.capability]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不支持当前操作", 400);
      if (purpose.modality === "image" && input.facts) {
        const result = simulateModel(input.snapshot, input.billing, model.id, input.facts, deps);
        if (!result.eligible.length) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不满足图片质量、尺寸或参考要求", 400);
        if (plan) for (const id of plan.targets) {
          const alternative = structuredClone(input.snapshot);
          alternative.config.publicModels.find(m => m.id === model.id)!.target = { type: "upstream", id };
          if (!simulateModel(alternative, input.billing, model.id, input.facts, deps).eligible.length) throw new ModelConfigError("MODEL_INCOMPATIBLE", "路由目标不满足本次请求的图片能力", 400);
          const u = config.upstreamModels.find(u => u.id === id)!, p = config.providers.find(p => p.id === u.providerId)!;
          if (p.protocol === "openai-images" && input.facts.nativeResolution && input.facts.resolution !== "1K" && !u.parameterMap.resolution?.[input.facts.resolution as "2K"|"4K"]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "路由目标缺少原生尺寸参数映射", 400);
        }
        if (provider?.protocol === "openai-images" && input.facts.nativeResolution && input.facts.resolution !== "1K" && !upstream!.parameterMap.resolution?.[input.facts.resolution as "2K" | "4K"]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该原生尺寸缺少已核验的接口参数映射", 400);
      }
      const routed = !preset && (model.target.type === "pool" || provider && ["apimart-images", "fal-images"].includes(provider.protocol));
      const projection = routed ? await deps.runtime.prepareExecution({ snapshot: input.snapshot, billing: input.billing }) : undefined;
      return { ...(requestedParameters ? {requestedParameters} : {}), ...(input.feature ? { feature: input.feature } : {}), modelVersion: input.snapshot.version, billingVersion: input.billing.version, modelDigest: input.snapshot.digest, publicModelId: model.id, binding: input.binding, modality: model.modality, target: structuredClone(target), ...(provider?.credentialRef ? { credentialRef: provider.credentialRef } : {}), ...(projection ? { routerDigest: projection.digest } : {}), ...(input.facts ? { facts: structuredClone(input.facts) } : {}) };
    },
    describe,
    async clientFor(model: ExecutionModel) { const scope = await describe(model); return { client: executionOpenAI(scope, deps), wireModel: scope.connection.wireModel }; },
    async run<T>(model: ExecutionModel, action: () => Promise<T>) { return runModelExecution(await describe(model), action); },
    async runBundle<T>(frozen: ExecutionBundle, billing: ConfigSnapshot, action: () => Promise<T>) {
      const resolved: ResolvedExecutionBundle = { frozen, billing };
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
  const { getModelAdministration } = await import("./server");
  const admin = await getModelAdministration();
  return createModelExecutor({ runtime: admin.runtime,billingByVersion:version=>admin.billing.byVersion(version), credentials: admin.credentials, trustedOrigins: admin.trustedOrigins,
    gateway: () => ({ baseUrl: process.env.NAUMI_ROUTER_GENERATION_URL || "", apiKey: process.env.NAUMI_ROUTER_GENERATION_TOKEN || "" }) });
}
export async function withExecutionModel<T>(model: ExecutionModel, run: () => Promise<T>) { return (await getModelExecutor()).run(model, run); }
export async function withFrozenExecutionBundle<T>(bundle: ExecutionBundle, run: () => Promise<T>) {
  const { getBillingRuntime } = await import("../billing/server");
  return (await getModelExecutor()).runBundle(bundle, await (await getBillingRuntime()).config.byVersion(bundle.billingVersion), run);
}
