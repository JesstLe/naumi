import { normalizeCanvasRatio } from "./generation-parameters";
import { createPlacementSpace } from "./placement-space";

export type GenerationStage = "queued" | "preparing" | "generating" | "saving";

/** Preview geometry only; never alters provider request dimensions. */
export function generationPlaceholderSize(ratio?: string | null) {
  const normalized = normalizeCanvasRatio(ratio);
  const [w, h] = (normalized === "auto" ? "1:1" : normalized).split(":").map(Number);
  const scale = Math.min(384 / w, 512 / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** New previews avoid covering existing nodes; dragged positions are never re-laid out. */
export function placeGenerationPreview(preferred: { x: number; y: number }, size: { width: number; height: number },
  occupied: Array<{ x: number; y: number; width: number; height: number }>) {
  return createPlacementSpace(occupied).place(preferred, size);
}

/** Existing placeholders are user-owned coordinates; only new previews may avoid collisions. */
export function generationPositionForTask(existing: { x: number; y: number } | null | undefined,
  preferred: { x: number; y: number }, size: { width: number; height: number },
  occupied: Array<{ x: number; y: number; width: number; height: number }>) {
  return existing ? { x: existing.x, y: existing.y } : placeGenerationPreview(preferred, size, occupied);
}

/** Elapsed time changes waiting copy, not the claimed processing stage/percentage. */
export function generationWaitingHint(stage: GenerationStage, seconds: number, english = false) {
  if(stage==="queued")return english?"Queued · your task is saved":"任务已排队，原请求已保存";
  if (stage === "preparing") return english ? "Preparing your request" : "正在准备素材";
  if (stage === "saving") return english ? "Adding results to the canvas" : "正在放入画布";
  if (seconds >= 75) return english ? "Still processing · please wait" : "任务仍在处理中，请稍候";
  if (seconds >= 30) return english ? "Complex requests can take longer" : "复杂画面需要更多时间";
  if (seconds >= 10) return english ? "Waiting for the result" : "正在等待生成结果";
  return english ? "Your request has been submitted" : "请求已提交";
}
