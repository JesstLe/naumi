import type { GenerationStage } from "./generation-feedback";

/** Display progress only. Supplier status owns stage transitions and completion. */
export function generationDisplayProgress(stage: GenerationStage, seconds: number, completed?: number, count = 1) {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if(stage==="queued")return 0;
  if (stage === "preparing") return Math.min(16, Math.floor(4 + 13 * (1 - Math.exp(-elapsed / 7))));
  if (stage === "saving") return Math.min(98, Math.floor(94 + 5 * (1 - Math.exp(-elapsed / 20))));
  const observed = typeof completed === "number" && Number.isFinite(completed) && count > 1
    ? Math.floor(Math.max(0, Math.min(count, completed)) / count * 90) : 0;
  return Math.min(92, Math.max(observed, Math.floor(18 + 75 * (1 - Math.exp(-elapsed / 78)))));
}

export function generationProgressHint(stage: GenerationStage, seconds: number, english = false) {
  if(stage==="queued")return english?"Preparing request":"正在准备请求";
  if (stage === "preparing") return english ? "Preparing your images and prompt" : "正在准备素材与提示词";
  if (stage === "saving") return english ? "Adding the result to your canvas" : "正在将结果放入画布";
  if (seconds >= 180) return english ? "Still generating · your task is active" : "仍在生成中，完成后自动呈现";
  if (seconds >= 70) return english ? "Generation is continuing" : "画面生成中，请稍候";
  return english ? "Creating your image" : "正在生成画面";
}
