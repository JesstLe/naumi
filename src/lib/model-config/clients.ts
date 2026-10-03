import "server-only";
import OpenAI from "openai";
import { currentExecutionBundle, currentModelExecution, type ModelExecutionScope } from "./context";
import { modelEndpointFetch } from "./transport";
import type { ValidationOptions } from "./schema";
import { ModelConfigError } from "./types";
import { appendImageGatewayFields } from "../image-gateway";
const managedClients = new WeakSet<OpenAI>();
export const isManagedModelClient = (client: OpenAI) => managedClients.has(client);

export function executionFetch(scope: ModelExecutionScope, options: ValidationOptions = {}): typeof fetch {
  const { connection, frozen, parameterMap } = scope;
  if (!["openai-images", "openai-chat", "router-images"].includes(connection.protocol)) throw new ModelConfigError("UNSUPPORTED_PROTOCOL", "该模型需使用其协议适配器", 400);
  const transport = modelEndpointFetch(connection.baseUrl, options, connection);
  const mappedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST" || !/\/(?:images\/(?:generations|edits)|chat\/completions)$/.test(new URL(request.url).pathname)) return transport(request);
    const map = (body: Record<string, any>) => {
      body.model = connection.wireModel;
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
      if (error instanceof ModelConfigError && error.code === "PROVIDER_BUSY") return Response.json({ error: { message: error.message, type: "naumi_capacity", code: error.code } }, { status: 429 });
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
  const transport = scope ? executionFetch(scope, { trustedOrigins: (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) }) : fetch;
  if (connection?.protocol === "router-images") appendImageGatewayFields(form, scope!.frozen.publicModelId);
  const { observeModelCall, modelExecutionTelemetry } = await import("../bi/model-observer");
  return observeModelCall(connection?.wireModel || String(form.get("model") || "unrecorded"), () => transport(`${(connection?.baseUrl || baseUrl).replace(/\/$/, "")}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${connection?.apiKey || apiKey}` }, body: form, signal }), modelExecutionTelemetry(scope) || null);
}

/** The explicit factory redirects each resource to its frozen modality; legacy/BYOK callers retain their own connection. */
export function modelAwareOpenAI(options: ConstructorParameters<typeof OpenAI>[0], managed = true): OpenAI {
  const legacy = new OpenAI(options);
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
