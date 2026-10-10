import { normalizeCanvasRatio } from "./generation-parameters";

export type GenerationStage = "preparing" | "generating" | "saving";

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
  const position = { ...preferred };
  for (let i = 0; i <= occupied.length; i++) {
    const overlaps = occupied.filter(rect => position.x < rect.x + rect.width + 32 && position.x + size.width + 32 > rect.x
      && position.y < rect.y + rect.height + 48 && position.y + size.height + 48 > rect.y);
    if (!overlaps.length) return position;
    position.y = Math.max(...overlaps.map(rect => rect.y + rect.height + 48));
  }
  return position;
}

/** Elapsed time changes waiting copy, not the claimed processing stage/percentage. */
export function generationWaitingHint(stage: GenerationStage, seconds: number, english = false) {
  if (stage === "preparing") return english ? "Preparing your request" : "正在准备素材";
  if (stage === "saving") return english ? "Adding results to the canvas" : "正在放入画布";
  if (seconds >= 75) return english ? "Still processing · please wait" : "任务仍在处理中，请稍候";
  if (seconds >= 30) return english ? "Complex requests can take longer" : "复杂画面需要更多时间";
  if (seconds >= 10) return english ? "Waiting for the result" : "正在等待生成结果";
  return english ? "Your request has been submitted" : "请求已提交";
}
