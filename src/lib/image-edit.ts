import "server-only";
import OpenAI, { toFile } from "openai";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { imageGatewayFields, withImageOperation } from "@/lib/image-gateway";
import { randomUUID } from "node:crypto";

/** Shared Images edit transport; callers own masks, credit settlement and storage. */
export async function editImage(input: {
	operationId?: string;
  images: Buffer[]; mask?: Buffer; prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  types?: string[];
  quality?: "low" | "medium" | "high" | "auto";
}) {
  const { apiKey, model } = await getOpenAISettings();
  if (!apiKey) throw new Error("模型接口未配置");
  // Includes response-body download. Never retry an expensive image request implicitly:
  // two 240s attempts would exceed the outer 360s proxy budget and may generate twice.
  const configured = Number(process.env.IMAGE_EDIT_TIMEOUT_MS || 240_000);
  const timeout = Number.isFinite(configured) ? Math.max(1000, Math.min(240_000, configured)) : 240_000;
  const signal = AbortSignal.timeout(timeout);
  const client = new OpenAI({ apiKey, baseURL: (await getOpenAIBaseUrl()) || undefined, timeout, maxRetries: 0 });
  const files = await Promise.all(input.images.map((b, i) => {
    const type = input.types?.[i] || "image/png";
    const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    return toFile(b, `image-${i}.${ext}`, { type });
  }));
  const response = await withImageOperation(model, { id: input.operationId || `edit-${randomUUID()}`, preserveIdentity: true }, async () => client.images.edit({
    ...imageGatewayFields(model, true),
    model, image: files.length === 1 ? files[0] : files,
    ...(input.mask ? { mask: await toFile(input.mask, "mask.png", { type: "image/png" }) } : {}),
    prompt: input.prompt, size: input.size, n: 1,
    ...(input.quality ? { quality: input.quality } : {}),
  }, { signal }));
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
