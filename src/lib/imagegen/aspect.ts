/** A legacy auto edit uses the first input frame; explicit ratios remain unchanged. */
const standardRatios = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"];
export function inheritedImageRatio(requested: string | undefined, target?: { width: number; height: number }) {
  if (requested && requested !== "auto") return requested;
  if (!target || !(target.width > 0 && target.height > 0)) return requested || "auto";
  const actual = target.width / target.height;
  // Only account for native one-pixel rounding. An unusual source remains auto,
  // rather than silently rounding it to a different supported composition.
  return standardRatios.find(r => { const [w,h] = r.split(":").map(Number); return Math.abs(w / h - actual) / actual < .001; }) || "auto";
}
export function imageAspectInstruction(ratio: string, target?: { width: number; height: number }) {
  const frame = ratio && ratio !== "auto" ? `${ratio}（宽:高）` : target ? `编辑目标原图的 ${target.width}×${target.height} 画幅比例` : "模型适合本次内容的画幅";
  return `画幅要求：使用${frame}重新安排完整构图；所有标题、文字、产品和关键信息必须放在画布边界以内，并保留安全边距。空间不足时等比缩小主体或调整排版，不放大后截边，不让内容延伸到画布之外，不以裁掉边缘来适配比例。`;
}
