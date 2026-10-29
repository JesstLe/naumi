import { resolveConfiguredImageQuality } from "@/lib/model-config/image-quality";
import { modelAwareOpenAI } from "@/lib/model-config/clients";
import { observeOpenAI } from "@/lib/bi/model-observer";
import "server-only";
import OpenAI, { toFile } from "openai";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { imageGatewayFields, withImageOperation } from "@/lib/image-gateway";
import { randomUUID } from "node:crypto";
import { resolveImageQuality, type ExecutedQuality, type ResolvedImageQuality } from "@/lib/image-quality";
import { withQualityFallback, sdkImageQuality } from "@/lib/image-quality-request";
import {currentModelExecution} from "@/lib/model-config/context";
import {exactImageRequestSize,ExactImageSizeError} from "@/lib/imagegen/request-size";
import {frameRatio} from "@/lib/imagegen/frame-ratio";

/** Shared Images edit transport; callers own masks, credit settlement and storage. */
export async function editImage(input: {
	operationId?: string;
  legacyOperationId?: boolean;
  images: Buffer[]; mask?: Buffer; prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  sourceFrame?: {width:number;height:number};
  types?: string[];
  quality?: ExecutedQuality | ResolvedImageQuality;
}) {
  const { apiKey, model } = await getOpenAISettings();
  if (!apiKey) throw new Error("模型接口未配置");
  // Managed calls already own a published/frozen parameter plan. For legacy
  // exact-size models, preserve the explicit source frame rather than direction-only sizing.
  let size:string=input.size;
  const ratio=input.sourceFrame&&frameRatio(input.sourceFrame);
  if(ratio&&!currentModelExecution("image")){
    try{size=exactImageRequestSize(ratio,model,true)||input.size;}
    catch(error){if(error instanceof ExactImageSizeError)size="auto";else throw error;}
  }
  // Includes response-body download. Never retry an expensive image request implicitly:
  // two 240s attempts would exceed the outer 360s proxy budget and may generate twice.
  const configured = Number(process.env.IMAGE_EDIT_TIMEOUT_MS || 240_000);
  const timeout = Number.isFinite(configured) ? Math.max(1000, Math.min(240_000, configured)) : 240_000;
  const signal = AbortSignal.timeout(timeout);
  const client = observeOpenAI(modelAwareOpenAI({ apiKey, baseURL: (await getOpenAIBaseUrl()) || undefined, timeout, maxRetries: 0 }));
  const files = await Promise.all(input.images.map((b, i) => {
    const type = input.types?.[i] || "image/png";
    const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    return toFile(b, `image-${i}.${ext}`, { type });
  }));
  const quality = typeof input.quality === "object" ? input.quality : resolveConfiguredImageQuality(input.quality ?? "medium");
  const operationId = input.operationId || `edit-${randomUUID()}`;
  const response = await withQualityFallback(quality, executed => withImageOperation(model, { id: input.legacyOperationId ? operationId : `${operationId}:quality:${executed}`, ...(input.legacyOperationId ? {} : {quality: executed}), preserveIdentity: true }, async () => client.images.edit({
    ...imageGatewayFields(model, true),
    model, image: files.length === 1 ? files[0] : files,
    ...(input.mask ? { mask: await toFile(input.mask, "mask.png", { type: "image/png" }) } : {}),
    prompt: input.prompt, size: size as OpenAI.Images.ImageEditParams["size"], n: 1,
    quality: sdkImageQuality(executed),
  }, { signal })), model);
  const result = response.data?.[0];
  const b64 = result?.b64_json;
  if (!b64 && result?.url) {
    const downloaded = await fetch(result.url, { signal, redirect: "error" });
    if (!downloaded.ok) throw new Error(`图片下载失败 (${downloaded.status})`);
    return Buffer.from(await downloaded.arrayBuffer());
  }
  if (!b64) throw new Error("未返回图片数据");
  return Buffer.from(b64, "base64");
}

export function isImageTimeout(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return status === 504 || status === 524 ||
    (error instanceof Error && /timeout|timed out|abort|\b524\b/i.test(`${error.name} ${error.message}`));
}
