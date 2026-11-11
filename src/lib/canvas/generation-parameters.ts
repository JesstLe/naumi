import {frameRatio} from "../imagegen/frame-ratio";

import { IMAGE_RATIO_OPTIONS as CANVAS_RATIO_OPTIONS, IMAGE_RESOLUTIONS as CANVAS_RESOLUTIONS, validImageRatio as validCanvasRatio } from "../imagegen/parameter-options";
// Compatibility names for existing Canvas callers; image parameter rules have
// one owner shared with the per-turn creation settings editor.
export { IMAGE_RATIO_OPTIONS as CANVAS_RATIO_OPTIONS, IMAGE_RESOLUTIONS as CANVAS_RESOLUTIONS,
  validImageRatio as validCanvasRatio, imageParameterOptions as canvasModelParameters,
  imageCombinationSupported as canvasCombinationSupported, type ImageParameterDeclaration as CanvasModelParameters } from "../imagegen/parameter-options";

export const CANVAS_QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const;
export const CANVAS_MAX_COUNT = 4;

export function normalizeCanvasRatio(value: unknown): string {
  return value === "auto" || validCanvasRatio(value) ? String(value) : "auto";
}
/** These edits keep their source frame; expansion and new image generation do not. */
export function canvasSourceFrameEdit(path: string) {
  return ["/api/canvas/annotate", "/api/canvas/text-edit", "/api/canvas/image-tasks"].includes(path);
}
export function canvasSourceFrameRatio(image: {width?:number|null;height?:number|null;ratio?:string|null}) {
  return frameRatio({width:image.width||0,height:image.height||0}) || (validCanvasRatio(image.ratio) ? image.ratio : "auto");
}
export function normalizeCanvasResolution(value: unknown): string {
  return value === "5K" ? "4K" : (CANVAS_RESOLUTIONS as readonly unknown[]).includes(value) ? String(value) : "1K";
}
export function normalizeCanvasCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(CANVAS_MAX_COUNT, Math.max(1, Math.round(n))) : 1;
}
export function normalizeCanvasQuality(value: unknown): typeof CANVAS_QUALITIES[number] {
  return (CANVAS_QUALITIES as readonly unknown[]).includes(value) ? value as typeof CANVAS_QUALITIES[number] : "medium";
}
export function validateCanvasParameters(body: Record<string, unknown>, headerQuality?: string | null): string | null {
  if (body.targetWidth !== undefined || body.targetHeight !== undefined) return "画布不支持自定义像素尺寸，请选择标准比例和分辨率";
  if (body.ratio !== undefined && body.ratio !== "auto" && !validCanvasRatio(body.ratio)) return "画布比例无效，请重新选择比例";
  if (body.resolution !== undefined && !(CANVAS_RESOLUTIONS as readonly unknown[]).includes(body.resolution)) return "画布仅支持 1K、2K、4K";
  if (body.count !== undefined && (!Number.isInteger(Number(body.count)) || Number(body.count) < 1 || Number(body.count) > CANVAS_MAX_COUNT)) return "画布单次生成张数为 1–4 张";
  const quality = body.quality ?? headerQuality;
  if (quality != null && !(CANVAS_QUALITIES as readonly unknown[]).includes(quality)) return "画布质量档位无效，请刷新模型参数";
  return null;
}

/** Raw validation runs before billing intents, count clamping and model resolution.
 * Authenticated workers resume frozen jobs separately; this never revalidates them.
 */
export async function canvasParameterError(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  let body: Record<string, unknown>;
  let duplicateParameter = false;
  try {
    const copy = request.clone();
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await copy.formData();
      body = {};
      for (const [key, value] of Array.from(form.entries())) {
        if (typeof value !== "string") continue;
        if (["origin", "ratio", "resolution", "quality", "count", "targetWidth", "targetHeight"].includes(key) && form.getAll(key).length > 1) duplicateParameter = true;
        if (!(key in body)) body[key] = value;
      }
      if (form.getAll("origin").includes("canvas")) body.origin = "canvas";
    } else {
      body = await copy.json();
    }
  } catch { return null; /* Route owns malformed-body handling. */ }
  if (!body || typeof body !== "object") return null;
  if (path === "/api/generate-image" && body.origin !== "canvas") return null;
  const error = duplicateParameter ? "画布参数不能重复提交" : validateCanvasParameters(body, request.headers.get("x-naumi-image-quality"));
  return error ? new Response(JSON.stringify({ error, code: "CANVAS_PARAMETER_UNSUPPORTED" }), { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store" } }) : null;
}
