import "server-only";
import {applicationAPIMartImages} from "./apimart-image-policy";
import {currentImagegenStep} from "../imagegen/context";
import {mapImagegenParameters,imagegenWireRequest} from "../imagegen/parameters";
import {publishedImagegenCapabilities,IMAGEGEN_FIELDS_BY_CAPABILITY} from "../imagegen/capabilities";
import {apimartImagesFetch} from "./apimart-preset";
import type {ModelExecutionScope} from "./context";
import {modelEndpointFetch} from "./transport";
import type {ValidationOptions} from "./schema";
import {ModelConfigError} from "./types";
import {mapResolution,RESOLUTION_FIELDS} from "./resolution-policy";
import {policyQuality} from "./quality-policy";
import {reverseHubImageFetch} from "./reverse-hub-images";

export function providerExecutionTransport(scope: ModelExecutionScope, options: ValidationOptions): typeof fetch {
  const { connection, frozen, parameterMap } = scope;
  if (connection.options?.imageAdapter === "reverse-hub") {
    const adapter = reverseHubImageFetch(scope, options);
    return async (input, init) => {
      try { return await adapter(input, init); }
      catch (error) {
        // Hash/identity conflicts can refer to an already paid Hub task. They
        // must not be relabelled as proof that another supplier may be called.
        if (error instanceof ModelConfigError && ["INVALID_REQUEST","MODEL_INCOMPATIBLE","PROVIDER_BUSY","CHANNEL_DISABLED","CONFIG_UNAVAILABLE"].includes(error.code)) return Response.json({ error: { message: error.message, code: error.code, billing_status: "not_charged" } }, { status: error.code === "CONFIG_UNAVAILABLE" ? 429 : error.status });
        throw error;
      }
    };
  }
  if (connection.protocol === "apimart-images" && (scope.imagePreset || applicationAPIMartImages(connection.protocol,parameterMap))) {
    const adapter=apimartImagesFetch(scope,options);
    return async(input,init)=>{try{return await adapter(input,init);}catch(error){
      // The SDK otherwise hides our definite parameter/output rejection inside
      // a connection error. Unknown paid acceptance remains Pending, not 4xx.
      if(error instanceof ModelConfigError && ["INVALID_REQUEST","MODEL_INCOMPATIBLE","OPERATION_CONFLICT","MODEL_PARAMETER_UNAVAILABLE","PROVIDER_BUSY","CHANNEL_DISABLED","CONFIG_UNAVAILABLE"].includes(error.code))return Response.json({error:{message:error.message,type:"naumi_async_image_rejection",code:error.code,...(error.code!=="OPERATION_CONFLICT"?{billing_status:"not_charged"}:{})}},{status:error.status});
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
        if (parameterMap.qualityPolicy) {
          const wire = policyQuality(parameterMap.qualityPolicy, frozen.facts?.quality || body.quality);
          if (wire === undefined) delete body.quality; else body.quality = wire;
        } else if (typeof body.quality === "string" && parameterMap.quality?.[body.quality as keyof typeof parameterMap.quality]) body.quality = parameterMap.quality[body.quality as keyof typeof parameterMap.quality];
        const requestedResolution=frozen.facts?.requestedResolution;
        const resolution = (!parameterMap.resolutionPolicy && requestedResolution && (scope.capabilities.nativeResolutions as string[]).includes(requestedResolution) ? requestedResolution : frozen.facts?.resolution) as keyof NonNullable<typeof parameterMap.resolution>;
        if(parameterMap.resolutionPolicy)mapResolution(body,parameterMap.resolutionPolicy,frozen.facts?.requestedResolution||resolution,frozen.facts?.ratio);
        else if (resolution && parameterMap.resolution?.[resolution]) body.size = parameterMap.resolution[resolution];
      }
      const advanced=currentImagegenStep();
      if(advanced&&frozen.modality==="image"){
        const pixelOverride=advanced.request.parameters.width!==undefined&&advanced.request.parameters.height!==undefined;
        for(const [key,fields] of Object.entries(IMAGEGEN_FIELDS_BY_CAPABILITY))if(key!=="pixelSize"||pixelOverride)for(const field of fields)if(field!=="omit")delete body[field];
        const extra=mapImagegenParameters(imagegenWireRequest(advanced.request),publishedImagegenCapabilities(scope.capabilities),parameterMap.imagegen||{});Object.assign(body,extra);
        if(advanced.intent.background==="transparent"&&parameterMap.imagegen?.transparent!=="omit"&&!parameterMap.imagegen?.transparent)body.background="transparent";
      }
      return body;
    };
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData(); const fields = map(Object.fromEntries(Array.from(form.entries()).filter(([, value]) => typeof value === "string")));
      if(parameterMap.resolutionPolicy)for(const field of RESOLUTION_FIELDS)if(!Object.prototype.hasOwnProperty.call(fields,field))form.delete(field);
      if (parameterMap.qualityPolicy?.mode === "omit") form.delete("quality");
      for (const [key, value] of Object.entries(fields)) if (["string","number","boolean"].includes(typeof value)) form.set(key, String(value));
      const advanced=currentImagegenStep();if(advanced)for(const [key,names] of Object.entries(IMAGEGEN_FIELDS_BY_CAPABILITY))if(key!=="pixelSize"||advanced.request.parameters.width!==undefined)for(const field of names)if(field!=="omit"&&!Object.hasOwn(fields,field))form.delete(field);
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
      if (error instanceof ModelConfigError && ["PROVIDER_BUSY", "CHANNEL_DISABLED", "CONFIG_UNAVAILABLE"].includes(error.code)) return Response.json({ error: { message: error.message, type: "naumi_capacity", billing_status: "not_charged", code: error.code } }, { status: error.code === "CONFIG_UNAVAILABLE" ? 429 : error.status });
      throw error;
    }
  };
}

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
    const image = await generateNewApiImage({ model: scope.connection.wireModel, prompt: body.prompt, quality: typeof body.quality === "string" ? body.quality : undefined, images, settings: scope.connection, execution: scope, signal: request.signal, trustedOrigins: options.trustedOrigins });
    return Response.json({ created: Math.floor(Date.now() / 1000), data: [{ b64_json: image.buffer.toString("base64") }] });
  };
  return async (input, init) => {
    try { return await submit(input, init); }
    catch (error) {
      if (error instanceof ModelConfigError && ["MODEL_INCOMPATIBLE", "INVALID_REQUEST", "PROVIDER_BUSY", "CHANNEL_DISABLED", "CONFIG_UNAVAILABLE", "UPSTREAM_REJECTED_NOT_CHARGED"].includes(error.code)) return Response.json({ error: { message: error.message, type: "naumi_pre_submission", billing_status: "not_charged", code: error.code } }, { status: error.code === "CONFIG_UNAVAILABLE" ? 429 : error.status });
      throw error;
    }
  };
}
