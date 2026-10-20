import { imageRatioMismatch, type ImageRatioValidationPolicy } from "./request-size";
import type { ImagegenResult } from "./types";

/** Ratio accuracy is a quality notice, not proof that a paid image is absent. */
export function imageRatioWarning(requested: string, image: { width?: number; height?: number; ratio?: string }, policy?: ImageRatioValidationPolicy): string | undefined {
  const mismatch = imageRatioMismatch(requested, image, policy);
  if (!mismatch) return;
  if (image.width && image.height) return `图片已生成，实际尺寸 ${image.width}×${image.height}，比例与所选 ${requested} 有差异；已保留完整画面`;
  return "图片已生成，实际尺寸待读取；已保留原图";
}

/** Match only the exact legacy ratio error shape. Transparency, empty/corrupt
 * images, transport errors, cancellation and unknown paid states stay errors. */
export function legacyRatioWarning(error?: string): string | undefined {
  const match = error?.match(/^生成结果为 ([\d:]+)（(\d+)×(\d+)），与所选 ([\d:]+) 不一致；原图已保留，实际生成积分已结算，任务未自动重试$/);
  if (!match) return;
  return `图片已生成，实际尺寸 ${match[2]}×${match[3]}，比例与所选 ${match[4]} 有差异；已保留完整画面`;
}

export function imageOutputNotice(error?: string, warning?: string, hasImages = false): { error?: string; warning?: string } {
  const oldRatio = hasImages ? legacyRatioWarning(error) : undefined;
  return { ...(error && !oldRatio ? { error } : {}), ...(warning || oldRatio ? { warning: warning || oldRatio } : {}) };
}

/** Read-only presentation of an already-paid, single-step legacy result.
 * Never rewrite its ledger, task state, assets or trigger another generation. */
export function presentImagegenOutput(result: ImagegenResult, singleGenerationStep: boolean): ImagegenResult {
  if (!singleGenerationStep || result.status !== "failed" || result.error?.code !== "EXECUTION_FAILED" || !result.artifacts.length) return result;
  if (result.artifacts.some(a => !(a.artworkId && a.url && a.width > 0 && a.height > 0))) return result;
  const warning = legacyRatioWarning(result.error.message);
  if (!warning) return result;
  return { ...result, status: "succeeded", stage: "done", error: undefined, warnings: Array.from(new Set([...(result.warnings || []), warning])) };
}

/** A single compact non-error notice; old/malformed API values do not crash UI. */
export function imageOutputWarningText(warnings: unknown): string | undefined {
  if (!Array.isArray(warnings)) return;
  const values = Array.from(new Set(warnings.filter((v): v is string => typeof v === "string" && !!v.trim()).slice(0, 3).map(v => v.slice(0, 240))));
  return values.length ? values.join("；") : undefined;
}
