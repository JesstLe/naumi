/** New canvas submissions only. Never mutate artwork metadata or frozen jobs. */
export const CANVAS_RATIO_OPTIONS = [
  { id: "auto", w: 0, h: 0 },
  { id: "1:1", w: 1, h: 1 },
  { id: "2:3", w: 2, h: 3 },
  { id: "3:2", w: 3, h: 2 },
  { id: "3:4", w: 3, h: 4 },
  { id: "4:3", w: 4, h: 3 },
  { id: "9:16", w: 9, h: 16 },
  { id: "16:9", w: 16, h: 9 },
] as const;
export const CANVAS_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export const CANVAS_QUALITIES = ["low", "medium", "high"] as const;
export const CANVAS_MAX_COUNT = 4;

export function normalizeCanvasRatio(value: unknown): string {
  return CANVAS_RATIO_OPTIONS.some(r => r.id === value) ? String(value) : "auto";
}
export function normalizeCanvasResolution(value: unknown): string {
  return value === "5K" ? "4K" : (CANVAS_RESOLUTIONS as readonly unknown[]).includes(value) ? String(value) : "1K";
}
export function normalizeCanvasCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(CANVAS_MAX_COUNT, Math.max(1, Math.round(n))) : 1;
}
export function normalizeCanvasQuality(value: unknown): typeof CANVAS_QUALITIES[number] {
  return value === "low" ? "low" : ["high", "xhigh", "max"].includes(String(value)) ? "high" : "medium";
}
export type CanvasModelParameters = { ratios?: string[]; resolutions?: string[]; combinations?: string[] };
export function canvasModelParameters(declared?: CanvasModelParameters) {
  return {
    ratios: (CANVAS_RATIO_OPTIONS.map(r => r.id) as string[]).filter(r => r === "auto" || !declared?.ratios || declared.ratios.includes(r)),
    resolutions: (Array.from(CANVAS_RESOLUTIONS) as string[]).filter(r => !declared?.resolutions || declared.resolutions.includes(r)),
    combinations: declared?.combinations,
  };
}
export function canvasCombinationSupported(parameters: CanvasModelParameters | undefined, ratio: string, resolution: string) {
  return !parameters?.combinations || parameters.combinations.includes(`${resolution}:${ratio === "auto" ? "1:1" : ratio}`);
}

export function validateCanvasParameters(body: Record<string, unknown>, headerQuality?: string | null): string | null {
  if (body.targetWidth !== undefined || body.targetHeight !== undefined) return "画布不支持自定义像素尺寸，请选择标准比例和分辨率";
  if (body.ratio !== undefined && !CANVAS_RATIO_OPTIONS.some(r => r.id === body.ratio)) return "画布比例不受支持，请重新选择标准比例";
  if (body.resolution !== undefined && !(CANVAS_RESOLUTIONS as readonly unknown[]).includes(body.resolution)) return "画布仅支持 1K、2K、4K";
  if (body.count !== undefined && (!Number.isInteger(Number(body.count)) || Number(body.count) < 1 || Number(body.count) > CANVAS_MAX_COUNT)) return "画布单次生成张数为 1–4 张";
  const quality = body.quality ?? headerQuality;
  if (quality != null && !(CANVAS_QUALITIES as readonly unknown[]).includes(quality)) return "画布仅支持低、中、高质量";
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
