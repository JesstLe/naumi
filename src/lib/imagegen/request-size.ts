/** GPT Image 2 accepts WIDTHxHEIGHT (both edges divisible by 16).
 * https://developers.openai.com/api/reference/resources/images/methods/generate
 * Keep older models' native contracts; never identify capability by UI display name.
 */
const EXACT_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "2:3": "1024x1536",
  "3:2": "1536x1024",
  "3:4": "1152x1536",
  "4:3": "1536x1152",
  "9:16": "864x1536",
  "16:9": "1536x864",
  "4:5": "1024x1280",
  "5:4": "1280x1024",
  "1:2": "768x1536",
  "2:1": "1536x768",
  "21:9": "1792x768",
};
export function supportsExactImageSize(model: string) {
  return /^gpt-image-(?:2(?:-2026-04-21)?|2\.5-(?:sunburst|flare)(?:-2026-09-08)?)$/.test(
    model,
  );
}
export type ImageRatioValidationPolicy = { nativePixelGrid: 16 };

/** Native Gemini image outputs use a 16px grid. This is a bounded validation
 * allowance, never a resize/crop or permission to relax exact pixel contracts.
 * Mixed fallback families retain strict checking because the winning model is
 * not known here. UI labels and requested resolution do not select this policy. */
export function imageRatioValidationPolicy(connections: readonly { protocol: string; wireModel: string }[]): ImageRatioValidationPolicy | undefined {
  if (connections.length && connections.every(c => ["openai-images", "new-api-flow"].includes(c.protocol) && /^(?:gemini-3(?:\.0)?-pro-image|gemini-3\.1-flash-image)-(?:preview|three-four|four-three|portrait|landscape|square)$/.test(c.wireModel))) return { nativePixelGrid: 16 };
}
/** A definite, local rejection. Never turn this into an unknown paid attempt. */
export class ExactImageSizeError extends Error {
  readonly code = "IMAGE_SIZE_UNSUPPORTED";
  constructor(ratio: string) {
    const shown = /^[1-9]\d{0,5}:[1-9]\d{0,5}$/.test(ratio) ? `（${ratio}）` : "";
    super(`当前图片模型尚未配置该精确比例${shown}，请明确选择支持的比例；本次未提交生成，未扣积分`);
    this.name = "ExactImageSizeError";
  }
}
export function exactImageRequestSize(
  ratio: string,
  model: string,
  customRatio = false,
): string | undefined {
  if (!supportsExactImageSize(model)) return;
  if (ratio === "auto") return "auto";
  const size = EXACT_SIZES[ratio];
  if (size) return size;
  // Contract v2, new requests only. OpenAI's documented custom-size contract
  // permits 16px-grid dimensions, aspect 1:3..3:1 and >=655,360 pixels.
  // Keep the established standard table and a bounded native budget; never
  // enlarge to enormous exact multiples or transform the returned image.
  if (customRatio && /^[1-9]\d{0,5}:[1-9]\d{0,5}$/.test(ratio)) {
    const [rw, rh] = ratio.split(":").map(Number);
    if (rw / rh >= 1 / 3 && rw / rh <= 3) {
      let best: { width: number; height: number; error: number } | undefined;
      for (let height = 16; height <= 1536; height += 16) {
        const target = height * rw / rh / 16;
        for (const width of new Set([Math.floor(target) * 16, Math.ceil(target) * 16])) {
          const pixels = width * height;
          if (width < 16 || width > 1536 || pixels < 655360 || pixels > 1572864 || width > height * 3 || height > width * 3) continue;
          const error = Math.abs(width * rh - height * rw) / (height * rw);
          if (!best || error < best.error || error === best.error && pixels > best.width * best.height) best = { width, height, error };
        }
      }
      if (best) return `${best.width}x${best.height}`;
    }
  }
  // Reject an unsupported exact contract rather than silently reverting to direction-only.
  throw new ExactImageSizeError(ratio);
}
export function imageRatioMismatch(
  requested: string,
  image: { width?: number; height?: number; ratio?: string },
  policy?: ImageRatioValidationPolicy,
) {
  if (!requested || requested === "auto") return;
  const parts = requested.split(":").map(Number),
    [rw, rh] = parts;
  if (parts.length !== 2 || !(rw > 0 && rh > 0 && Number.isFinite(rw / rh)))
    return "所选图片比例无效";
  const { width: w, height: h } = image;
  if (!(w && h && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0))
    return "结果图片尺寸核验未完成，原图已保留，请查看作品记录；任务未自动重试";
  // Permit at most one-pixel rounding along the shorter edge (e.g. 4K Lanczos upscale).
  const delta =
    rw <= rh ? Math.abs(w - (h * rw) / rh) : Math.abs(h - (w * rh) / rw);
  if (delta <= 1.01) return;
  // Only named standard ratios and actual aligned outputs qualify. At most
  // half a grid cell AND 1% of the requested shorter edge are accepted. Source-
  // inherited custom ratios, arbitrary models and exact GPT contracts stay strict.
  const grid = policy?.nativePixelGrid;
  const expectedShortEdge = rw <= rh ? (h * rw) / rh : (w * rh) / rw;
  if (grid === 16 && EXACT_SIZES[requested] && Number.isInteger(w) && Number.isInteger(h) && w % grid === 0 && h % grid === 0 && delta <= grid / 2 && delta / expectedShortEdge <= 0.01) return;
  return `生成结果为 ${image.ratio || `${w}:${h}`}（${w}×${h}），与所选 ${requested} 不一致；原图已保留，实际生成积分已结算，任务未自动重试`;
}
