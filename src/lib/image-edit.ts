import "server-only";
import OpenAI, { toFile } from "openai";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";

/** Shared Images edit transport; callers own masks, credit settlement and storage. */
export async function editImage(input: {
  images: Buffer[]; mask?: Buffer; prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
}) {
  const { apiKey, model } = await getOpenAISettings();
  if (!apiKey) throw new Error("模型接口未配置");
  const client = new OpenAI({ apiKey, baseURL: (await getOpenAIBaseUrl()) || undefined, timeout: 240_000, maxRetries: 0 });
  const files = await Promise.all(input.images.map((b, i) => toFile(b, `image-${i}.png`, { type: "image/png" })));
  const response = await client.images.edit({
    model, image: files.length === 1 ? files[0] : files,
    ...(input.mask ? { mask: await toFile(input.mask, "mask.png", { type: "image/png" }) } : {}),
    prompt: input.prompt, size: input.size, n: 1,
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("未返回图片数据");
  return Buffer.from(b64, "base64");
}
