import "server-only";

import type {GenParams} from "./generation-types";
const RATIO_HINT =
  "Re-render this image at the new target aspect ratio. Keep the same subject, style, colours, lighting and overall look as the reference image; naturally re-frame and recompose to fill the new proportions — do not stretch, squash, distort, letterbox or crop the subject out. Photorealistic, cohesive, high quality, no borders, no frames, no added text.";
export function buildPrompt(p: GenParams, styleGuide: Record<string, string>): string {
  // 默认风格:完全透传用户提示词,不附加任何内容——输出由用户提示词完全决定。
  const styleDesc =
    p.style && p.style !== "默认" ? styleGuide[p.style] || p.style : "";
  if (!styleDesc) return p.prompt;
  // 选了具体风格:仅在用户提示词后追加该风格描述(风格表后台可改)。
  return `${p.prompt}，${styleDesc}`;
}

export function ratioPrompt(p: GenParams): string {
  const base = (p.prompt || "").trim();
  return base ? `${base}. ${RATIO_HINT}` : RATIO_HINT;
}
