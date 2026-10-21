import "server-only";
import { frameRatio } from "./frame-ratio";
import { sourceImageDimensions } from "./output-shape";

/** New submissions only, inside the raw receipt boundary and before routing or
 * quoting. JSON actions and accepted worker checkpoints keep their frozen frame. */
export async function normalizeAplusFrameRequest(request: Request): Promise<Request> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return request;
  const form = await request.clone().formData();
  let format = String(form.get("format") || "aplus-web");
  if (format === "auto") {
    const files = form.getAll("image").filter((value): value is File => value instanceof File && value.size > 0).slice(0, form.get("prepared") === "1" ? 6 : 3);
    if (!files.length) return request;
    const index = form.get("frameSourceIndex");
    const selected = index === null ? undefined : Number(index);
    if (selected !== undefined && (!Number.isInteger(selected) || selected < 0 || selected >= files.length)) throw new Error("画幅来源已失效，请重新选择");
    const candidates = selected === undefined ? files : [files[selected]];
    const ratios: string[] = [];
    for (const file of candidates) {
      if (file.size > 12 * 1024 * 1024) throw new Error("单张上传图片过大（请 < 12MB）");
      const ratio = frameRatio(await sourceImageDimensions(Buffer.from(await file.arrayBuffer())));
      if (!ratio) throw new Error("参考素材的画幅读取失败，请重新上传图片");
      ratios.push(ratio);
    }
    if (!ratios.every(ratio => ratio === ratios[0])) throw new Error("参考图比例不同，请选择跟随哪张图的画幅");
    format = ratios[0];
    form.set("format", format);
  }
  const ratio = format === "aplus-mobile" ? "2:3" : format.startsWith("aplus-") ? "3:2" : format;
  // Domain parsing still validates format. Never trust a separate forged ratio.
  form.set("ratio", ratio);
  const headers = new Headers(request.headers);
  headers.delete("content-type"); headers.delete("content-length");
  return new Request(request.url, { method: request.method, headers, body: form, signal: request.signal });
}
