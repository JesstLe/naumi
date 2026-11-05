import {executionImageParameterPlan} from './model-config/image-plan-runtime';
import {applyImageParameterPlan} from './model-config/image-parameter-plan';
import { getNewApiImageSettings } from "@/lib/image-model-catalog";
import {observeModelCall, modelExecutionTelemetry} from "@/lib/bi/model-calls";
import { currentModelExecution, type ModelExecutionScope } from "./model-config/context";
import { ModelConfigError } from "./model-config/types";
import { modelEndpointFetch } from "./model-config/transport";
import { supplierCostFetch } from "./supplier-cost/collect";
import {mapResolution} from "./model-config/resolution-policy";
import {policyQuality} from "./model-config/quality-policy";
import {readBoundedBytes} from "./supplier-cost/io";

export type NewApiReferenceImage = {
  buffer: Buffer;
  mimeType: string;
};

function upstreamError(raw: string, status: number, retryAfter: string | null = null) {
  try {
    const body = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if ((body as any).billing_status === "not_charged" || typeof body.error === "object" && (body.error as any)?.billing_status === "not_charged") throw Object.assign(new ModelConfigError("UPSTREAM_REJECTED_NOT_CHARGED","上游明确拒绝且未收费",status), {retryAfter});
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message || body.message || raw.slice(0, 500);
    return Object.assign(new Error(`${status} ${message}`), {status,retryAfter});
  } catch (error) {
    if(error instanceof ModelConfigError)throw error;
    return Object.assign(new Error(`${status} ${raw.slice(0, 500)}`), {status,retryAfter});
  }
}

function collectStreamContent(raw: string) {
  let content = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const chunk = JSON.parse(data) as {
        choices?: {
          delta?: { content?: string; reasoning_content?: string };
          message?: { content?: string };
        }[];
        error?: { message?: string } | string;
      };
      if (chunk.error) {
        throw new Error(
          typeof chunk.error === "string"
            ? chunk.error
            : chunk.error.message || "生图服务返回错误"
        );
      }
      const choice = chunk.choices?.[0];
      content +=
        choice?.delta?.content ||
        choice?.delta?.reasoning_content ||
        choice?.message?.content ||
        "";
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  if (!content && raw.trim().startsWith("{")) {
    try {
      const body = JSON.parse(raw) as {
        choices?: { message?: { content?: string } }[];
      };
      content = body.choices?.[0]?.message?.content || "";
    } catch {
      /* keep empty content */
    }
  }
  return content;
}

function extractImageUrl(content: string) {
  // Keep the last complete Markdown image ahead of bare URLs, as before.
  // Retrying [^\]]* from each unmatched ![ is quadratic on supplier text.
  // A single forward pass tracks the first opener and an optional URL. Track
  // nested openers too: a failed outer URL may contain a valid inner image.
  let label = false, urlStart = -1, bodyStart = -1, lastStart = -1, lastEnd = -1;
  const whitespace = /\s/; // One code unit only; preserves ECMAScript whitespace.
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (urlStart >= 0 && (c === ")" || whitespace.test(c))) {
      if (c === ")" && i > bodyStart) {
        lastStart = urlStart; lastEnd = i;
        label = false; // The complete outer match consumes nested openers.
      }
      urlStart = -1;
    }
    if (c === "!" && content[i + 1] === "[") label = true;
    if (c !== "]" || !label) continue;
    label = false;
    if (urlStart >= 0 || content[i + 1] !== "(") continue;
    const start = i + 2;
    const prefix = content.startsWith("https://", start) ? 8 : content.startsWith("http://", start) ? 7 : 0;
    if (prefix) { urlStart = start; bodyStart = start + prefix; }
  }
  if (lastStart >= 0) return content.slice(lastStart, lastEnd);
  // This simple URL character class scans linearly; retain only the last match
  // rather than materializing every URL/match object in a supplier response.
  let last = "";
  for (const match of content.matchAll(/https?:\/\/[^\s)]+/g)) last = match[0];
  return last;
}

export async function generateNewApiImage(input: {
  model: string;
  prompt: string;
  quality?: string;
  images?: NewApiReferenceImage[];
  settings?: { baseUrl: string; apiKey: string };
  execution?: ModelExecutionScope;
  signal?: AbortSignal;
  trustedOrigins?: readonly string[];
}): Promise<{ buffer: Buffer; contentType: string }> {
  const settings = input.settings || getNewApiImageSettings();
  const scope = input.execution || currentModelExecution("image");
  const managed = scope?.connection.protocol === "new-api-flow" && (!input.settings || input.settings.baseUrl === scope.connection.baseUrl && input.settings.apiKey === scope.connection.apiKey);
  const wireModel = managed ? scope.connection.wireModel : input.model;
  const quality = managed && scope.parameterMap.qualityPolicy ? policyQuality(scope.parameterMap.qualityPolicy, scope.frozen.facts?.quality || input.quality, scope.parameterMap.parameterContract) : undefined;
  const requestedResolution=scope?.frozen.facts?.requestedResolution;
  const legacyResolution=requestedResolution && (scope?.capabilities.nativeResolutions as string[]|undefined)?.includes(requestedResolution) ? requestedResolution : scope?.frozen.facts?.resolution;
  const parameterPlan=managed?executionImageParameterPlan(scope,{}):undefined;
  const mapSize=(body:Record<string,any>)=>parameterPlan?applyImageParameterPlan(body,parameterPlan):mapResolution(body,managed?scope.parameterMap.resolutionPolicy:undefined,scope?.frozen.facts?.requestedResolution||scope?.frozen.facts?.resolution,scope?.frozen.facts?.ratio,managed?scope.parameterMap.parameterContract:undefined);
  const submit = managed ? modelEndpointFetch(settings.baseUrl, { trustedOrigins: input.trustedOrigins || (process.env.MODEL_CONFIG_TRUSTED_ORIGINS || "").split(/[\s,]+/).filter(Boolean) }, {...scope.connection,costScope:scope}) : supplierCostFetch(fetch,{providerId:"legacy-flow",apiKey:settings.apiKey,baseUrl:settings.baseUrl,wireModel,protocol:"new-api-flow"});
  if (!settings.baseUrl || !settings.apiKey) {
    throw new Error("New API 生图分组尚未配置");
  }
  const references = managed ? input.images || [] : (input.images || []).slice(0, 6);
  if (managed && references.length > scope.capabilities.maxReferenceImages) throw new ModelConfigError("MODEL_INCOMPATIBLE", "参考图片超过当前模型上限", 400);
  // The Jimeng streaming chat adapter hardcodes 1:1; its image endpoint accepts ratio.
  if (/^jimeng-image-[a-z0-9][a-z0-9.-]*$/i.test(wireModel)) {
    const ratio = scope?.frozen.facts?.ratio || "1:1";
    if (!["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "21:9"].includes(ratio)) throw new ModelConfigError("MODEL_INCOMPATIBLE", "即梦接口未开放该比例", 400);
    const response = await observeModelCall(wireModel, () => submit(`${settings.baseUrl}/images/generations`, {
      method: "POST", headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(mapSize({ model: wireModel, prompt: input.prompt, ...(quality ? {quality} : {}), ratio, resolution: (legacyResolution || "1K").toLowerCase(), n: 1, response_format: "b64_json", filePaths: references.map(image => `data:${image.mimeType};base64,${image.buffer.toString("base64")}`) })),
      signal: AbortSignal.any([input.signal || new AbortController().signal, AbortSignal.timeout(managed ? scope.connection.timeoutMs : 300_000)]),
    }), managed ? modelExecutionTelemetry(scope) : null);
    const raw = await response.text();
    if (!response.ok) throw upstreamError(raw, response.status, response.headers.get("retry-after"));
    const encoded = JSON.parse(raw).data?.[0]?.b64_json;
    if (typeof encoded !== "string" || !encoded.length || encoded.length > 45 * 1024 * 1024) throw new Error("即梦未返回有效图片内容");
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length || buffer.length > 32 * 1024 * 1024) throw new Error("即梦图片大小无效");
    return { buffer, contentType: "image/png" };
  }
  const prompt=/^nano-banana-/i.test(wireModel)&&scope?.frozen.facts?.ratio?`${input.prompt}\nImage aspect ratio: ${scope.frozen.facts.ratio}.`:input.prompt;
  const content = references.length
    ? [
        { type: "text", text: prompt },
        ...references.map((image) => ({
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType || "image/png"};base64,${image.buffer.toString("base64")}`,
          },
        })),
      ]
    : prompt;
  const response = await observeModelCall(wireModel,()=>submit(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mapSize({
      model: wireModel,
      ...(quality ? {quality} : {}),
      messages: [{ role: "user", content }],
      stream: true,
    })),
    signal: AbortSignal.any([input.signal || new AbortController().signal, AbortSignal.timeout(managed ? scope.connection.timeoutMs : 300_000)]),
  }), managed ? modelExecutionTelemetry(scope) : null);
  const raw = await response.text();
  if (!response.ok) throw upstreamError(raw, response.status, response.headers.get("retry-after"));
  const streamContent = collectStreamContent(raw);
  const inline=streamContent.match(/data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)/);
  if(inline){if(inline[2].length>45*1024*1024)throw new Error("返回图片超过大小限制");const buffer=Buffer.from(inline[2],"base64");if(!buffer.length||buffer.length>32*1024*1024)throw new Error("返回图片大小无效");return {buffer,contentType:inline[1]};}
  const imageUrl = extractImageUrl(streamContent);
  if (!imageUrl) {
    throw new Error(`New API 生图分组未返回图片：${streamContent.slice(-300)}`);
  }
  const imageTransport = managed ? modelEndpointFetch(new URL(imageUrl).origin,{trustedOrigins:input.trustedOrigins||(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(/[\s,]+/).filter(Boolean)}) : fetch;
  const imageResponse = await imageTransport(imageUrl, {
    redirect: "error",
    signal: AbortSignal.any([input.signal || new AbortController().signal, AbortSignal.timeout(60_000)]),
  });
  if (!imageResponse.ok) {
    throw new Error(`生成图片下载失败 ${imageResponse.status}`);
  }
  const contentType = imageResponse.headers.get("content-type") || "image/png";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("生图服务返回了非图片内容");
  }
  const declaredSize = Number(imageResponse.headers.get("content-length") || 0);
  if (declaredSize > 32 * 1024 * 1024) {
    throw new Error("生成图片超过 32MB 限制");
  }
  const buffer = await readBoundedBytes(imageResponse,32*1024*1024);
  if (!buffer.length) throw new Error("生成图片内容为空");
  if (buffer.length > 32 * 1024 * 1024) {
    throw new Error("生成图片超过 32MB 限制");
  }
  return {
    buffer,
    contentType,
  };
}
