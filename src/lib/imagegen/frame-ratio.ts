import { defaultFrameSource, frameRatio, type FrameInput } from "./frame-choice";
import type { ImagegenRequest, Intent } from "./types";

/** Resolve once before quoting/freezing; never reinterpret an already accepted plan. */
export function automaticFrameRatio(request: ImagegenRequest, inputs: FrameInput[], operation: Intent["operation"], useCase?: string): string | undefined {
  if (operation === "postprocess" || operation === "cutout" || request.parameters.width || request.parameters.height || request.parameters.ratio && request.parameters.ratio !== "auto" || !inputs.length) return;
  const source = defaultFrameSource(inputs, useCase);
  if (!source) throw new Error("有多张参考图，请明确本次生成画幅比例后再预览。");
  const ratio = frameRatio(source.width && source.height ? { width: source.width, height: source.height } : undefined);
  if (!ratio || !/^[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(ratio)) throw new Error("参考素材的原始画幅尚不支持直接生成，请明确选择比例；不会自动改成方图。");
  return ratio;
}
