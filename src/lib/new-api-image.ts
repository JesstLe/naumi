import { getNewApiImageSettings } from "@/lib/image-model-catalog";
import { observeModelCall, modelExecutionTelemetry } from "@/lib/bi/model-observer";
import { currentModelExecution, type ModelExecutionScope } from "./model-config/context";
import { ModelConfigError } from "./model-config/types";
import { modelEndpointFetch } from "./model-config/transport";
import { supplierCostFetch } from "./supplier-cost/collect";
import {mapResolution} from "./model-config/resolution-policy";
import {policyQuality} from "./model-config/quality-policy";

export type NewApiReferenceImage = {
  buffer: Buffer;
  mimeType: string;
};

function upstreamError(raw: string, status: number) {
  try {
    const body = JSON.parse(raw) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if ((body as any).billing_status === "not_charged" || typeof body.error === "object" && (body.error as any)?.billing_status === "not_charged") throw new ModelConfigError("UPSTREAM_REJECTED_NOT_CHARGED","上游明确拒绝且未收费",status);
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message || body.message || raw.slice(0, 500);
    return Object.assign(new Error(`${status} ${message}`), {status});
  } catch (error) {
    if(error instanceof ModelConfigError)throw error;
    return Object.assign(new Error(`${status} ${raw.slice(0, 500)}`), {status});
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
  const markdown = Array.from(
    content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)
  );
  if (markdown.length) return markdown.at(-1)?.[1] || "";
  const urls = Array.from(content.matchAll(/https?:\/\/[^\s)]+/g));
  return urls.at(-1)?.[0] || "";
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
  const quality = managed && scope.parameterMap.qualityPolicy ? policyQuality(scope.parameterMap.qualityPolicy, scope.frozen.facts?.quality || input.quality) : undefined;
  const requestedResolution=scope?.frozen.facts?.requestedResolution;
  const legacyResolution=requestedResolution && (scope?.capabilities.nativeResolutions as string[]|undefined)?.includes(requestedResolution) ? requestedResolution : scope?.frozen.facts?.resolution;
  const mapSize=(body:Record<string,any>)=>mapResolution(body,managed?scope.parameterMap.resolutionPolicy:undefined,scope?.frozen.facts?.requestedResolution||scope?.frozen.facts?.resolution,scope?.frozen.facts?.ratio);
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
    if (!response.ok) throw upstreamError(raw, response.status);
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
  if (!response.ok) throw upstreamError(raw, response.status);
  const streamContent = collectStreamContent(raw);
  const inline=streamContent.match(/data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)/);
  if(inline){if(inline[2].length>45*1024*1024)throw new Error("返回图片超过大小限制");const buffer=Buffer.from(inline[2],"base64");if(!buffer.length||buffer.length>32*1024*1024)throw new Error("返回图片大小无效");return {buffer,contentType:inline[1]};}
  const imageUrl = extractImageUrl(streamContent);
  if (!imageUrl) {
    throw new Error(`New API 生图分组未返回图片：${streamContent.slice(-300)}`);
  }
  const imageResponse = await fetch(imageUrl, {
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
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (!buffer.length) throw new Error("生成图片内容为空");
  if (buffer.length > 32 * 1024 * 1024) {
    throw new Error("生成图片超过 32MB 限制");
  }
  return {
    buffer,
    contentType,
  };
}
