import { stageRoutingFetch } from "./stage-routing";
import { apimartPresetFetch } from "./apimart-preset";
import "server-only";
import OpenAI from "openai";
import { currentExecutionBundle, currentModelExecution, type ModelExecutionScope } from "./context";
import { modelEndpointFetch } from "./transport";
import type { ValidationOptions } from "./schema";
import { ModelConfigError } from "./types";
import { appendImageGatewayFields } from "../image-gateway";
import { supplierCostFetch } from "../supplier-cost/collect";
const managedClients = new WeakSet<OpenAI>();
export const isManagedModelClient = (client: OpenAI) => managedClients.has(client);

export function executionFetch(scope: ModelExecutionScope, options: ValidationOptions = {}): typeof fetch {
  if (scope.businessOption && !scope.audited) return stageRoutingFetch(scope, options);
  const { connection, frozen, parameterMap } = scope;
  if (scope.imagePreset && connection.protocol === "apimart-images") {
    const adapter=apimartPresetFetch(scope,options);
    return async(input,init)=>{try{return await adapter(input,init);}catch(error){
      // The SDK otherwise hides our definite parameter/output rejection inside
      // a connection error. Unknown paid acceptance remains Pending, not 4xx.
      if(error instanceof ModelConfigError && ["INVALID_REQUEST","MODEL_INCOMPATIBLE","OPERATION_CONFLICT"].includes(error.code))return Response.json({error:{message:error.message,type:"naumi_preset_rejection",code:error.code}},{status:error.status});
      throw error;
    }};
  }
  if (connection.protocol === "new-api-flow") return flowImageFetch(scope, options);
  if (!["openai-images", "openai-chat", "router-images"].includes(connection.protocol)) throw new ModelConfigError("UNSUPPORTED_PROTOCOL", "该模型需使用其协议适配器", 400);
  const transport = modelEndpointFetch(connection.baseUrl, options, { ...connection, costScope: scope });
  const mappedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST" || !/\/(?:images\/(?:generations|edits)|chat\/completions)$/.test(new URL(request.url).pathname)) return transport(request);
    const map = (body: Record<string, any>) => {
      body.model = connection.wireModel;
      if ((scope.businessOption?.pricing?.mode === "usage" || scope.procurement?.basis === "tokens") && body.stream && connection.protocol === "openai-chat") body.stream_options = { ...body.stream_options, include_usage: true };
      if (connection.protocol !== "router-images") {
        if (typeof body.quality === "string" && parameterMap.quality?.[body.quality as keyof typeof parameterMap.quality]) body.quality = parameterMap.quality[body.quality as keyof typeof parameterMap.quality];
        const resolution = frozen.facts?.resolution as keyof NonNullable<typeof parameterMap.resolution>;
        if (resolution && parameterMap.resolution?.[resolution]) body.size = parameterMap.resolution[resolution];
      }
      return body;
    };
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData(); const fields = map(Object.fromEntries(Array.from(form.entries()).filter(([, value]) => typeof value === "string")));
      for (const [key, value] of Object.entries(fields)) if (typeof value === "string") form.set(key, value);
      const headers = new Headers(request.headers); headers.delete("content-type"); headers.delete("content-length");
      return transport(request.url, { method: request.method, headers, body: form, signal: request.signal });
    }
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = map(await request.json()); const headers = new Headers(request.headers); headers.delete("content-length");
      return transport(request.url, { method: request.method, headers, body: JSON.stringify(body), signal: request.signal });
    }
    throw new ModelConfigError("INVALID_REQUEST", "模型请求编码无效");
  };
  return async (input, init) => {
    try { return await mappedFetch(input, init); }
    catch (error) {
      // SDKs otherwise turn this local pre-submission rejection into an unknown connection failure.
      if (error instanceof ModelConfigError && error.code === "PROVIDER_BUSY") return Response.json({ error: { message: error.message, type: "naumi_capacity", billing_status: "not_charged", code: error.code } }, { status: 429 });
      throw error;
    }
  };
}

/** Translate the image SDK contract once; Flow submits exactly one chat-based paid call. */
function flowImageFetch(scope: ModelExecutionScope, options: ValidationOptions): typeof fetch {
  const submit: typeof fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== new URL(scope.connection.baseUrl).origin || request.method !== "POST" || !/\/images\/(generations|edits)$/.test(url.pathname)) throw new ModelConfigError("UNSUPPORTED_PROTOCOL", "Flow 仅支持图片生成和参考图编辑", 400);
    const editing = url.pathname.endsWith("/edits"), images: { buffer: Buffer; mimeType: string }[] = [];
    let body: Record<string, unknown>;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.has("mask")) throw new ModelConfigError("MODEL_INCOMPATIBLE", "Flow 不支持蒙版编辑", 400);
      body = Object.fromEntries(Array.from(form.entries()).filter(([, value]) => typeof value === "string"));
      for (const [key, value] of Array.from(form.entries())) if (/^image(?:\[\])?$/.test(key)) {
        if (typeof value === "string" || !value.type.startsWith("image/")) throw new ModelConfigError("INVALID_REQUEST", "Flow 参考图需要上传图片文件", 400);
        images.push({ buffer: Buffer.from(await value.arrayBuffer()), mimeType: value.type });
      }
    } else if (request.headers.get("content-type")?.includes("application/json")) body = await request.json();
    else throw new ModelConfigError("INVALID_REQUEST", "模型请求编码无效", 400);
    if (body.mask) throw new ModelConfigError("MODEL_INCOMPATIBLE", "Flow 不支持蒙版编辑", 400);
    if (body.n !== undefined && Number(body.n) !== 1) throw new ModelConfigError("MODEL_INCOMPATIBLE", "Flow 每次提交仅支持单张生成", 400);
    if (!scope.capabilities[editing ? "edit" : "generate"] || editing && !images.length || images.length > scope.capabilities.maxReferenceImages) throw new ModelConfigError("MODEL_INCOMPATIBLE", "当前 Flow 模型不满足图片编辑或参考图要求", 400);
    if (typeof body.prompt !== "string" || !body.prompt.trim()) throw new ModelConfigError("INVALID_REQUEST", "图片提示词不能为空", 400);
    const { generateNewApiImage } = await import("../new-api-image");
    const image = await generateNewApiImage({ model: scope.connection.wireModel, prompt: body.prompt, images, settings: scope.connection, execution: scope, signal: request.signal, trustedOrigins: options.trustedOrigins });
    return Response.json({ created: Math.floor(Date.now() / 1000), data: [{ b64_json: image.buffer.toString("base64") }] });
  };
  return async (input, init) => {
    try { return await submit(input, init); }
    catch (error) {
      if (error instanceof ModelConfigError && ["MODEL_INCOMPATIBLE", "INVALID_REQUEST", "PROVIDER_BUSY"].includes(error.code)) return Response.json({ error: { message: error.message, type: "naumi_pre_submission", billing_status: "not_charged", code: error.code } }, { status: error.status });
      throw error;
    }
  };
}
export function executionOpenAI(scope: ModelExecutionScope, options: ValidationOptions = {}) {
  const { connection } = scope;
  return new OpenAI({ apiKey: connection.apiKey, baseURL: connection.baseUrl, timeout: connection.timeoutMs, maxRetries: 0, fetch: executionFetch(scope, options) });
}

/** Some compatible suppliers require native multipart; it shares the SDK's frozen mapping and transport. */
export async function managedImageEditFetch(baseUrl: string, apiKey: string, form: FormData, signal: AbortSignal) {
  const scope = currentModelExecution("image");
  const connection = scope?.connection;
  const transport = scope ? executionFetch(scope, { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) }) : supplierCostFetch(fetch,{providerId:"legacy-image",apiKey,baseUrl,protocol:"openai-images"});
  if (connection?.protocol === "router-images") appendImageGatewayFields(form, scope!.frozen.publicModelId);
  const { observeModelCall, modelExecutionTelemetry } = await import("../bi/model-observer");
  return observeModelCall(connection?.wireModel || String(form.get("model") || "unrecorded"), () => transport(`${(connection?.baseUrl || baseUrl).replace(/\/$/, "")}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${connection?.apiKey || apiKey}` }, body: form, signal }), modelExecutionTelemetry(scope) || null);
}

/** The explicit factory redirects each resource to its frozen modality; legacy/BYOK callers retain their own connection. */
export function modelAwareOpenAI(options: ConstructorParameters<typeof OpenAI>[0], managed = true): OpenAI {
  const legacy = new OpenAI({ ...options, maxRetries:0,fetch: supplierCostFetch(options?.fetch || fetch, { providerId: managed ? "legacy-openai" : "byok", apiKey: typeof options?.apiKey==='string' ? options.apiKey : undefined, baseUrl: options?.baseURL || "https://api.openai.com/v1", protocol: "openai-compatible" }) });
  if (!managed) return legacy;
  managedClients.add(legacy);
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
      return (target as unknown as Record<string, (...values: any[]) => any>)[method](...args);
    };
  }
  return legacy;
}
