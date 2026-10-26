import type { GenerationStage } from "./generation-feedback";

/** Display progress only. Supplier status owns stage transitions and completion. */

/** Stable per-task pseudo-random in [0,1). The same seed replays the same curve;
 * different tasks get visibly different trajectories so pacing never reads as canned. */
function taskNoise(seed: number, index: number) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function generationDisplayProgress(stage: GenerationStage, seconds: number, completed?: number, count = 1, seed = 0) {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (stage === "queued") return 0;
  // Optimistic ramp: each task reaches 99% within a per-task 18-32s window, then
  // holds there until the supplier actually returns — 99 reads as "only the final
  // result is pending" instead of a countdown that stalls near the end.
  const ramp = 18 + 14 * taskNoise(seed, 0);
  const base = 6 + 93 * Math.pow(Math.min(1, elapsed / ramp), 1.15);
  if (stage === "preparing") {
    const cap = 12 + 4 * taskNoise(seed, 1);
    return Math.min(Math.floor(cap), Math.floor(base));
  }
  if (stage === "saving") return Math.min(100, Math.floor(base + 2));
  const observed = typeof completed === "number" && Number.isFinite(completed) && count > 1
    ? Math.floor(Math.max(0, Math.min(count, completed)) / count * 98) : 0;
  // Small uneven per-second deltas while climbing; at the 99% plateau the clamp
  // pins the value so the wait reads as a steady "finalizing" state.
  const wobble = 1.8 * Math.sin(elapsed / (5 + 3 * taskNoise(seed, 2)) + 6.2832 * taskNoise(seed, 3))
               + 1.2 * Math.sin(elapsed / (2.4 + 1.8 * taskNoise(seed, 4)) + 6.2832 * taskNoise(seed, 5));
  return Math.min(99, Math.max(observed, Math.floor(base + wobble)));
}

export function generationProgressHint(stage: GenerationStage, seconds: number, english = false) {
  if(stage==="queued")return english?"Preparing request":"正在准备请求";
  if (stage === "preparing") return english ? "Preparing your images and prompt" : "正在准备素材与提示词";
  if (stage === "saving") return english ? "Adding the result to your canvas" : "正在将结果放入画布";
  if (seconds >= 180) return english ? "Still generating · your task is active" : "仍在生成中，完成后自动呈现";
  if (seconds >= 70) return english ? "Generation is continuing" : "画面生成中，请稍候";
  return english ? "Creating your image" : "正在生成画面";
}
