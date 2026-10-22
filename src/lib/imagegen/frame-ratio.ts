import type { ImagegenRequest, Intent } from "./types";
import { imagegenUseCase } from "./catalog";

export type FrameInput = ImagegenRequest["inputs"][number] & { label?: string; width?: number; height?: number };
export type FrameSize = { width: number; height: number };

export function frameRatio(size?: FrameSize): string | undefined {
  if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width <= 0 || size.height <= 0) return;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(size.width, size.height);
  return `${size.width / divisor}:${size.height / divisor}`;
}

/** Only layout-bearing inputs compete for the output frame. Style, mask and
 * inserted products must not override a composition reference. */
export function frameCandidates(inputs: FrameInput[], useCase = "", frameSourceId?: string, framePolicy?: "all-inputs"): FrameInput[] {
  const sources = inputs.filter(input => input.role !== "mask");
  // A public UI choice or the Agent's task-specific composition reference is
  // independent of input order. Authorization still happens in readInputs.
  if (frameSourceId) return sources.filter(input => input.artworkId === frameSourceId);
  if (sources.length === 1) return sources;
  const targets = sources.filter(input => input.role === "edit-target");
  const retainEditingCanvas = imagegenUseCase(useCase)?.mode === "edit" && useCase !== "compositing";
  if (inputs.some(input => input.role === "mask") || retainEditingCanvas) return targets;
  // Generic uploads do not convey semantic roles. Do not pretend that the
  // second uploaded image is necessarily the layout reference.
  if (framePolicy === "all-inputs") return sources.filter(input => input.role !== "style" && input.role !== "insert");
  const references = sources.filter(input => input.role === "reference");
  return references.length ? references : targets.length ? targets : sources;
}

/** A unique frame or exact ratio consensus needs no user interruption. This
 * never chooses an arbitrary reference when the candidate ratios differ. */
export function defaultFrameSource(inputs: FrameInput[], useCase = "", frameSourceId?: string, framePolicy?: "all-inputs"): FrameInput | undefined {
  const candidates = frameCandidates(inputs, useCase, frameSourceId, framePolicy);
  if (candidates.length === 1) return candidates[0];
  const ratios = candidates.map(input => frameRatio(input as FrameSize));
  if (ratios.length && ratios[0] && ratios.every(ratio => ratio === ratios[0])) return candidates[0];
}

export class FrameRatioChoiceRequired extends Error {
  constructor() {
    super("参考图比例不同，请选择本次生成比例。");
    this.name = "FrameRatioChoiceRequired";
  }
}

/** Resolve once before quoting/freezing; never reinterpret an already accepted plan. */
export function automaticFrameRatio(request: ImagegenRequest, inputs: FrameInput[], operation: Intent["operation"], useCase?: string): string | undefined {
  if (operation === "postprocess" || operation === "cutout" || request.parameters.width || request.parameters.height || request.parameters.ratio && request.parameters.ratio !== "auto" || !inputs.length) return;
  if (frameCandidates(inputs,useCase,request.frameSourceId,request.framePolicy).some(input=>!frameRatio(input as FrameSize))) throw new Error("参考素材的画幅读取失败，请重新上传图片。");
  const source = defaultFrameSource(inputs, useCase, request.frameSourceId, request.framePolicy);
  if (!source) throw new FrameRatioChoiceRequired();
  const ratio = frameRatio(source.width && source.height ? { width: source.width, height: source.height } : undefined);
  if (!ratio || !/^[1-9]\d{0,5}:[1-9]\d{0,5}$/.test(ratio)) throw new Error("参考素材的画幅读取失败，请重新上传图片。");
  return ratio;
}
