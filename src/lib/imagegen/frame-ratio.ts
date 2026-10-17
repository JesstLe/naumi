import type { ImagegenRequest, Intent } from "./types";

export type FrameInput = ImagegenRequest["inputs"][number] & { label?: string; width?: number; height?: number };
export type FrameSize = { width: number; height: number };

export function frameRatio(size?: FrameSize): string | undefined {
  if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width <= 0 || size.height <= 0) return;
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(size.width, size.height);
  return `${size.width / divisor}:${size.height / divisor}`;
}

/** A reference supplies the layout; an edit/insert target supplies the subject.
 * Explicit target-edit workflows and masks keep their editing canvas instead.
 * Never infer a reference from array order, dimensions, or prompt keywords. */
export function defaultFrameSource(inputs: FrameInput[], useCase = ""): FrameInput | undefined {
  const sources = inputs.filter(input => input.role !== "mask");
  if (sources.length === 1) return sources[0];
  const targets = sources.filter(input => input.role === "edit-target");
  const referenceLayout = !useCase || ["compositing", "product-mockup", "ads-marketing"].includes(useCase);
  if (inputs.some(input => input.role === "mask") || !referenceLayout) return targets.length === 1 ? targets[0] : undefined;
  const references = sources.filter(input => input.role === "reference");
  if (references.length === 1) return references[0];
  if (!references.length && targets.length === 1) return targets[0];
}

/** Resolve once before quoting/freezing; never reinterpret an already accepted plan. */
export function automaticFrameRatio(request: ImagegenRequest, inputs: FrameInput[], operation: Intent["operation"], useCase?: string): string | undefined {
  if (operation === "postprocess" || operation === "cutout" || request.parameters.width || request.parameters.height || request.parameters.ratio && request.parameters.ratio !== "auto" || !inputs.length) return;
  const source = defaultFrameSource(inputs, useCase);
  if (!source) throw new Error("有多张参考图，请明确本次生成画幅比例后再预览。");
  const ratio = frameRatio(source.width && source.height ? { width: source.width, height: source.height } : undefined);
  if (!ratio || !/^[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(ratio)) throw new Error("参考素材的原始画幅尚不支持直接生成，请明确选择比例；不会自动改成方图。");
  return ratio;
}
