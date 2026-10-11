import "server-only";
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

export type ExecutionModel = { modelVersion: number; billingVersion: number; modelDigest: string; publicModelId: string; binding: string; modality: Modality; target: { type: "upstream" | "pool"; id: string }; credentialRef?: string; routerDigest?: string; facts?: ModelFacts };
export type ExecutionConnection = { providerId: string; protocol: string; baseUrl: string; apiKey: string; wireModel: string; timeoutMs: number; maxConcurrent?: number; options?: ModelProvider["options"] };
type Dependencies = ValidationOptions & { runtime: Pick<ModelRuntime, "byVersion" | "prepareExecution"> & Partial<Pick<ModelRuntime, "validateExecutionProjection">>; credentials: ReturnType<typeof createCredentialStore>; gateway: () => { baseUrl: string; apiKey: string } };
const factsSchema = z.strictObject({ task: z.enum(["draft", "product", "detail", "layout"]), quality: z.string().max(10), resolution: z.enum(["1K", "2K", "4K"]), needsEdit: z.boolean(), needsMask: z.boolean().optional(), preserveIdentity: z.boolean(), needsText: z.boolean(), nativeResolution: z.boolean(), references: z.number().int().min(0).max(32), quantity: z.number().int().min(1).max(4).optional() });
const executionSchema = z.strictObject({ modelVersion: z.number().int().positive(), billingVersion: z.number().int().positive(), modelDigest: z.string().regex(/^[a-f0-9]{64}$/), publicModelId: z.string().max(100), binding: z.string().max(100), modality: z.enum(["image", "text", "video"]), target: z.strictObject({ type: z.enum(["upstream", "pool"]), id: z.string().max(100) }), credentialRef: z.uuid().optional(), routerDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), facts: factsSchema.optional() });
export function createModelExecutor(deps: Dependencies) {
  const describe = async (raw: ExecutionModel): Promise<ModelExecutionScope> => {
    const parsed = executionSchema.safeParse(raw);
    if (!parsed.success) throw new ModelConfigError("EXECUTION_MISMATCH", "任务执行配置无效，需要核查原记录", 503);
    const frozen = parsed.data;
    const snapshot = await deps.runtime.byVersion(frozen.modelVersion);
    const publicModel = snapshot.config.publicModels.find(m => m.id === frozen.publicModelId && m.enabled && m.modality === frozen.modality);
    const purpose = MODEL_BINDINGS[frozen.binding as ModelBinding];
    if (snapshot.digest !== frozen.modelDigest || !publicModel || publicModel.target.type !== frozen.target.type || publicModel.target.id !== frozen.target.id || !purpose || purpose.modality !== frozen.modality) throw new ModelConfigError("EXECUTION_MISMATCH", "任务与原模型版本不一致", 503);
    const upstream = frozen.target.type === "upstream" ? snapshot.config.upstreamModels.find(u => u.id === frozen.target.id)! : undefined;
    const provider = upstream ? snapshot.config.providers.find(p => p.id === upstream.providerId)! : undefined;
    const routed = frozen.target.type === "pool" || provider && ["apimart-images", "fal-images"].includes(provider.protocol);
    if (provider?.credentialRef !== frozen.credentialRef || routed !== !!frozen.routerDigest) throw new ModelConfigError("EXECUTION_MISMATCH", "任务凭据或路由版本不一致", 503);
    if (routed) {
      if (!deps.runtime.validateExecutionProjection) throw new ModelConfigError("CONFIG_UNAVAILABLE", "执行路由版本无法核对", 503);
      await deps.runtime.validateExecutionProjection({ modelVersion: frozen.modelVersion, billingVersion: frozen.billingVersion, digest: frozen.routerDigest! });
      const gateway = deps.gateway();
      if (!gateway.apiKey || !gateway.baseUrl) throw new ModelConfigError("ROUTER_UNAVAILABLE", "未配置私有生成连接", 503);
      const pool = frozen.target.type === "pool" ? snapshot.config.pools.find(p => p.id === frozen.target.id) : undefined;
      const candidates = snapshot.config.upstreamModels.filter(u => pool ? pool.candidates.includes(u.id) : u.id === upstream!.id);
      const capabilities = { ...candidates[0].capabilities, qualities: Array.from(new Set(candidates.flatMap(u => u.capabilities.qualities))), nativeResolutions: Array.from(new Set(candidates.flatMap(u => u.capabilities.nativeResolutions))), edit: candidates.some(u => u.capabilities.edit), maxReferenceImages: Math.max(...candidates.map(u => u.capabilities.maxReferenceImages)) };
      return { frozen, connection: { ...gateway, protocol: "router-images", providerId: "managed-router", wireModel: frozen.publicModelId, timeoutMs: 280000 }, capabilities, parameterMap: {} };
    }
    return { frozen, connection: { providerId: provider!.id, protocol: provider!.protocol, baseUrl: provider!.baseUrl, apiKey: await deps.credentials.read(frozen.credentialRef!, provider!.id), wireModel: upstream!.model, timeoutMs: provider!.timeoutMs, maxConcurrent: provider!.maxConcurrent, options: provider!.options }, capabilities: upstream!.capabilities, parameterMap: upstream!.parameterMap };
  };
  return {
    async resolve(input: { binding: string; requestedModelId?: string; snapshot: ModelSnapshot; billing: ConfigSnapshot; facts?: ModelFacts }): Promise<ExecutionModel> {
      const purpose = MODEL_BINDINGS[input.binding as ModelBinding];
      if (!purpose) throw new ModelConfigError("INVALID_REQUEST", "未知模型用途");
      const config = validateModelConfig(input.snapshot.config, deps);
      const id = input.requestedModelId || config.bindings[input.binding];
      const model = config.publicModels.find(m => m.id === id && m.enabled && m.modality === purpose.modality && (!input.requestedModelId || m.visible));
      if (!model) throw new ModelConfigError("MODEL_UNAVAILABLE", "所选模型不可用，请刷新模型列表后重试", 409);
      const upstream = model.target.type === "upstream" ? config.upstreamModels.find(u => u.id === model.target.id)! : undefined;
      const provider = upstream ? config.providers.find(p => p.id === upstream.providerId)! : undefined;
      if (upstream && !upstream.capabilities[purpose.capability]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不支持当前操作", 400);
      if (purpose.modality === "image" && input.facts) {
        const result = simulateModel(input.snapshot, input.billing, model.id, input.facts, deps);
        if (!result.eligible.length) throw new ModelConfigError("MODEL_INCOMPATIBLE", "所选模型不满足图片质量、尺寸或参考要求", 400);
        if (provider?.protocol === "openai-images" && input.facts.nativeResolution && input.facts.resolution !== "1K" && !upstream!.parameterMap.resolution?.[input.facts.resolution as "2K" | "4K"]) throw new ModelConfigError("MODEL_INCOMPATIBLE", "该原生尺寸缺少已核验的接口参数映射", 400);
      }
      const routed = model.target.type === "pool" || provider && ["apimart-images", "fal-images"].includes(provider.protocol);
      const projection = routed ? await deps.runtime.prepareExecution({ snapshot: input.snapshot, billing: input.billing }) : undefined;
      return { modelVersion: input.snapshot.version, billingVersion: input.billing.version, modelDigest: input.snapshot.digest, publicModelId: model.id, binding: input.binding, modality: model.modality, target: structuredClone(model.target), ...(provider?.credentialRef ? { credentialRef: provider.credentialRef } : {}), ...(projection ? { routerDigest: projection.digest } : {}), ...(input.facts ? { facts: structuredClone(input.facts) } : {}) };
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
  return createModelExecutor({ runtime: admin.runtime, credentials: admin.credentials, trustedOrigins: admin.trustedOrigins,
    gateway: () => ({ baseUrl: process.env.NAUMI_ROUTER_GENERATION_URL || "", apiKey: process.env.NAUMI_ROUTER_GENERATION_TOKEN || "" }) });
}
export async function withExecutionModel<T>(model: ExecutionModel, run: () => Promise<T>) { return (await getModelExecutor()).run(model, run); }
export async function withFrozenExecutionBundle<T>(bundle: ExecutionBundle, run: () => Promise<T>) {
  const { getBillingRuntime } = await import("../billing/server");
  return (await getModelExecutor()).runBundle(bundle, await (await getBillingRuntime()).config.byVersion(bundle.billingVersion), run);
}
