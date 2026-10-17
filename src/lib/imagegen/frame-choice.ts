import type { ImagegenRequest } from "./types";

export type FrameInput = ImagegenRequest["inputs"][number] & { label?: string; width?: number; height?: number };
export type FrameSize = { width: number; height: number };
export type FrameChoice = { ratio: string; source?: FrameInput; size?: FrameSize; error?: string };

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

export function resolveFrameChoice(inputs: FrameInput[], choice: string, sourceId: string, sizes: Record<string, FrameSize>, supportedRatios: string[], useCase = ""): FrameChoice {
  const sources = inputs.filter(input => input.role !== "mask");
  if (choice === "auto" && sources.length) return { ratio: "", error: "有素材时请选择沿用素材比例，或明确指定固定比例。" };
  let ratio = choice;
  let source: FrameInput | undefined;
  let size: FrameSize | undefined;
  if (choice === "source") {
    source = sourceId ? sources.find(input => input.artworkId === sourceId) : defaultFrameSource(inputs, useCase);
    if (!source) return { ratio: "", error: sourceId ? "所选画幅素材已移除，请重新选择。" : "有多张参考图，请选择沿用哪张图的画幅。" };
    size = sizes[source.artworkId] || (source.width && source.height ? { width: source.width, height: source.height } : undefined);
    ratio = frameRatio(size) || "";
    if (!ratio) return { ratio, source, error: "素材尺寸尚未读取，请稍候或选择固定比例。" };
  }
  if (ratio !== "auto") {
    const numeric = ratio.split(":").map(Number);
    const match = supportedRatios.find(value => value !== "auto" && (() => {
      const values = value.split(":").map(Number);
      return numeric.length === 2 && values.length === 2 && numeric[0] * values[1] === numeric[1] * values[0];
    })());
    if (!match) return { ratio, source, size, error: `当前模型不支持 ${ratio} 画幅，请更换模型或选择其他比例。` };
    ratio = match;
  }
  const target = inputs.find(input => input.role === "edit-target");
  const targetSize = target && (sizes[target.artworkId] || (target.width && target.height ? { width: target.width, height: target.height } : undefined));
  if (inputs.some(input => input.role === "mask") && ratio !== "auto") {
    if (!targetSize) return { ratio, source, size, error: "请先读取蒙版编辑目标的尺寸。" };
    const [w, h] = ratio.split(":").map(Number);
    if (w * targetSize.height !== h * targetSize.width) return { ratio, source, size, error: "蒙版编辑需保留编辑目标的画幅，请选择对应素材或原比例。" };
  }
  return { ratio, source, size };
}
