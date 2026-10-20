import "server-only";
import { defaultFrameSource, frameRatio, type FrameInput } from "./frame-ratio";
import { legacyImagegenIntent } from "./legacy-intent";
import { sourceImageDimensions } from "./output-shape";

export class LegacyFrameError extends Error {}

/** New legacy submissions only. The outer billing intent keeps the original request identity.
 * Normalization must precede model binding, quoting and freezing; accepted tasks bypass it. */
export async function normalizeLegacyFrameRequest(request: Request): Promise<Request> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return request;
  let form:FormData;
  try{form=await request.clone().formData();}catch{throw new LegacyFrameError("请求格式不正确");}
  const requested = String(form.get("ratio") || "");
  if (requested && requested !== "auto") return request;
  if (Number(form.get("targetWidth"))>0 || Number(form.get("targetHeight"))>0 || form.get("ratiogen") === "1") return request;
  const files = form.getAll("image").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 16);
  if (!files.length) return request;
  if (files.some(file => file.size > 12 * 1024 * 1024)) throw new LegacyFrameError("单张上传图片过大（请 < 12MB）");
  // Same transport contract as submitCanvasImagegen: target first, references after it.
  const inputs: FrameInput[] = files.map((_, index) => ({ artworkId: `legacy-${index}`, role: index ? "reference" : "edit-target" }));
  const intent = legacyImagegenIntent({ prompt: String(form.get("userPrompt") || form.get("prompt") || ""), origin: String(form.get("origin") || "") }, files.length);
  const source = defaultFrameSource(inputs, intent?.useCase);
  if (!source) throw new LegacyFrameError("有多张参考图，请在图片节点明确本次生成比例后再提交。");
  const index = inputs.indexOf(source);
  let dimensions;
  try { dimensions = await sourceImageDimensions(Buffer.from(await files[index].arrayBuffer())); }
  catch { throw new LegacyFrameError("参考素材读取失败，请重新上传图片。"); }
  const ratio = frameRatio(dimensions);
  if (!ratio || !/^[1-9]\d{0,5}:[1-9]\d{0,5}$/.test(ratio)) throw new LegacyFrameError("参考素材的画幅读取失败，请重新上传图片。");
  // Resolve the actual reference frame here; the selected route's admission
  // owns its supported dimensions/adapter allowlist, not a global seven-ratio UI list.
  form.set("ratio", ratio);
  const headers = new Headers(request.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  return new Request(request.url, { method: request.method, headers, body: form, signal: request.signal });
}
