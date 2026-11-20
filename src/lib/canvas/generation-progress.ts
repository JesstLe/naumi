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
  if (stage === "queued") {
    // 排队走进度语言,是"提交→出图"的慢速前段:快启动(0~2.5s 冲到 ~8-11%,
    // 条立刻动起来),随后每 ~20s 约 +1% 渐近 ~19-23%(排队不算完成度,给真实
    // 生成留足爬坡空间,条永不在天花板卡死);微幅摆动让整数百分比之间也
    // 读成"仍在动",长时间等待不呈现为 0% 死条或"卡死"。
    const kick = 8 + 4 * taskNoise(seed, 6), kickSeconds = 2 + 1.5 * taskNoise(seed, 7);
    const cap = 19 + 4 * taskNoise(seed, 8), driftSeconds = 260 + 140 * taskNoise(seed, 9);
    const kicked = Math.min(1, elapsed / kickSeconds);
    const drift = Math.pow(Math.min(1, Math.max(0, (elapsed - kickSeconds) / driftSeconds)), 1.6);
    const wobble = 0.5 * Math.sin(elapsed / (4 + 2 * taskNoise(seed, 10)) + 6.2832 * taskNoise(seed, 11));
    return Math.max(1, Math.min(Math.floor(cap), Math.floor(kick * kicked + (cap - kick) * drift + wobble)));
  }
  // Fast front/middle, slow final stretch. Task-specific duration/easing keeps
  // pacing varied without oscillating backwards. Only real results end the UI.
  const fastSeconds = 6 + 4 * taskNoise(seed, 0);
  const finishSeconds = 45 + 30 * taskNoise(seed, 2);
  const fast = Math.pow(Math.min(1, elapsed / fastSeconds), 0.8 + 0.2 * taskNoise(seed, 3));
  const finish = Math.min(1, Math.max(0, (elapsed - fastSeconds) / finishSeconds));
  const base = elapsed < fastSeconds ? 6 + 84 * fast
    : 90 + 9 * (1 - Math.pow(1 - finish, 1.5 + 0.5 * taskNoise(seed, 4)));
  if (stage === "preparing") {
    const cap = 12 + 4 * taskNoise(seed, 1);
    return Math.min(Math.floor(cap), Math.floor(base));
  }
  if (stage === "saving") return Math.min(100, Math.floor(base + 2));
  const observed = typeof completed === "number" && Number.isFinite(completed) && count > 1
    ? Math.floor(Math.max(0, Math.min(count, completed)) / count * 98) : 0;
  return Math.min(99, Math.max(observed, Math.floor(base)));
}

export function generationProgressHint(stage: GenerationStage, seconds: number, english = false) {
  if (stage === "queued") {
    if (seconds >= 90) return english ? "Task saved · it runs automatically, no need to resubmit" : "任务已受理，完成后自动呈现，无需重复提交";
    if (seconds >= 20) return english ? "High demand · your task starts as soon as possible" : "生成高峰，正在尽快安排你的任务";
    return english ? "Submitted · starting your generation" : "已提交，正在开始生成";
  }
  if (stage === "preparing") return english ? "Preparing your images and prompt" : "正在准备素材与提示词";
  if (stage === "saving") return english ? "Adding the result to your canvas" : "正在将结果放入画布";
  if (seconds >= 180) return english ? "Still generating · your task is active" : "仍在生成中，完成后自动呈现";
  if (seconds >= 70) return english ? "Generation is continuing" : "画面生成中，请稍候";
  return english ? "Creating your image" : "正在生成画面";
}
