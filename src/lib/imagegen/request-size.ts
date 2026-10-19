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
): string | undefined {
  if (!supportsExactImageSize(model)) return;
  if (ratio === "auto") return "auto";
  const size = EXACT_SIZES[ratio];
  if (size) return size;
  // Reject an unsupported exact contract rather than silently reverting to direction-only.
  throw new ExactImageSizeError(ratio);
}
export function imageRatioMismatch(
  requested: string,
  image: { width?: number; height?: number; ratio?: string },
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
  return `生成结果为 ${image.ratio || `${w}:${h}`}（${w}×${h}），与所选 ${requested} 不一致；原图已保留，实际生成积分已结算，任务未自动重试`;
}
