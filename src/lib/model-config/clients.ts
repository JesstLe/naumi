import "server-only";
import {markManagedModelClient} from "./client-identity";
export {isManagedModelClient} from "./client-identity";
import OpenAI from "openai";
import {currentExecutionBundle,currentModelExecution,type ModelExecutionScope} from "./context";
import {executionFetch} from "./execution-fetch";
export {executionFetch} from "./execution-fetch";
import type {ValidationOptions} from "./schema";
import {ModelConfigError} from "./types";
import {appendImageGatewayFields,currentImageOperationId,withImageOperation} from "../image-gateway";
import {supplierCostFetch} from "../supplier-cost/collect";
import {chatCompletionResponseFetch} from "./chat-completion-response";

export function executionOpenAI(scope: ModelExecutionScope, options: ValidationOptions = {}) {
  const { connection } = scope;
  const timeout = scope.supplierRouting ? Math.min(600000, scope.supplierRouting.targets.reduce((sum, t)=>sum+t.scope.connection.timeoutMs, 10000)) : connection.timeoutMs;
  return new OpenAI({ apiKey: connection.apiKey, baseURL: connection.baseUrl, timeout, maxRetries: 0, fetch: executionFetch(scope, options) });
}

export async function managedImageEditFetch(baseUrl: string, apiKey: string, form: FormData, signal: AbortSignal) {
  const scope = currentModelExecution("image");
  const connection = scope?.connection;
  const transport = scope ? executionFetch(scope, { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) }) : supplierCostFetch(fetch,{providerId:"legacy-image",apiKey,baseUrl,protocol:"openai-images"});
  if (connection?.protocol === "router-images") appendImageGatewayFields(form, scope!.frozen.publicModelId);
  const {observeModelCall, modelExecutionTelemetry} = await import("@/lib/bi/model-calls");
  return observeModelCall(connection?.wireModel || String(form.get("model") || "unrecorded"), () => transport(`${(connection?.baseUrl || baseUrl).replace(/\/$/, "")}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${connection?.apiKey || apiKey}` }, body: form, signal }), modelExecutionTelemetry(scope) || null);
}

const toolImageCalls = new WeakMap<object, number>();
/** Toolbox routes call the SDK directly, without the operation context that
 * editImage/imagegen establish. Managed image channels (APIMart, Jimeng, Router)
 * need a stable unit for their supplier ledger and channel pin: derive it from
 * the enclosing billing operation, one index per image call. Without a billing
 * operation the call is unchanged. */
async function withToolImageOperation<T>(model: string, run: () => Promise<T>): Promise<T> {
  const { currentSynchronousBilling } = await import("../billing/synchronous-operation");
  const billing = currentSynchronousBilling();
  if (!billing?.id || currentImageOperationId()) return run();
  const index = toolImageCalls.get(billing) ?? 0;
  toolImageCalls.set(billing, index + 1);
  return withImageOperation(model, { id: `${billing.id}:tool-image:${index}` }, run);
}

export function modelAwareOpenAI(options: ConstructorParameters<typeof OpenAI>[0], managed = true): OpenAI {
  const legacy = new OpenAI({ ...options, maxRetries:0,fetch: chatCompletionResponseFetch(supplierCostFetch(options?.fetch || fetch, { providerId: managed ? "legacy-openai" : "byok", apiKey: typeof options?.apiKey==='string' ? options.apiKey : undefined, baseUrl: options?.baseURL || "https://api.openai.com/v1", protocol: "openai-compatible" })) });
  if (!managed) return legacy;
  markManagedModelClient(legacy);
  const clients = new WeakMap<ModelExecutionScope, OpenAI>();
  const bodyUsesVision = (body: any) => Array.isArray(body?.messages) && body.messages.some((message: any) => Array.isArray(message.content) && message.content.some((part: any) => part?.type === "image_url" || part?.type === "input_image"));
  for (const [resource, method, role] of [[legacy.images, "generate", "image"], [legacy.images, "edit", "image"], [legacy.chat.completions, "create", "text"]] as const) {
    const object = resource as unknown as Record<string, (...args: any[]) => any>;
    const original = object[method].bind(resource);
    object[method] = (...args: any[]) => {
      const needsVision = role === "text" && bodyUsesVision(args[0]);
      const scope = currentModelExecution(needsVision ? "vision" : role);
      if (!scope) {
        if (currentModelExecution() || currentExecutionBundle()) throw new ModelConfigError("MODEL_INCOMPATIBLE", needsVision ? "当前视觉用途未绑定可处理图片的模型" : "当前操作没有可用的对应模态绑定", 400);
        return original(...args);
      }
      let client = clients.get(scope);
      if (!client) { client = executionOpenAI(scope, { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) }); clients.set(scope, client); }
      const target = role === "image" ? client.images : client.chat.completions;
      // Older cutout callers omit SDK quality. Its newly exposed user selection
      // still comes from the frozen operation, never a fresh global preference.
      if(role==="image"&&scope.frozen.feature==="tool.cutout"&&args[0]?.quality===undefined){
        const quality=scope.frozen.requestedParameters?.quality||scope.frozen.facts?.quality;
        if(quality)args[0]={...args[0],quality};
      }
      const call = () => (target as unknown as Record<string, (...values: any[]) => any>)[method](...args);
      return role === "image" && !currentImageOperationId() ? withToolImageOperation(scope.frozen.publicModelId, call) : call();
    };
  }
  return legacy;
}
