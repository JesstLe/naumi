/** Image creation choices shared by all editors. This projection never changes
 * a saved draft, admits a request, or infers capabilities from a model name. */
export const IMAGE_RATIO_OPTIONS = [
  { id: "auto", w: 0, h: 0 },
  { id: "1:1", w: 1, h: 1 },
  { id: "2:3", w: 2, h: 3 },
  { id: "3:2", w: 3, h: 2 },
  { id: "3:4", w: 3, h: 4 },
  { id: "4:3", w: 4, h: 3 },
  { id: "9:16", w: 9, h: 16 },
  { id: "16:9", w: 16, h: 9 },
] as const;
export const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type ImageParameterDeclaration = { ratios?: string[]; resolutions?: string[]; combinations?: string[] };

export function validImageRatio(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,5}:[1-9]\d{0,5}$/.test(value);
}

/** Missing declarations retain the existing Canvas creation choices. Explicit
 * empty arrays stay empty; unusual but published ratios are not discarded. */
export function imageParameterOptions(declared?: ImageParameterDeclaration) {
  return {
    ratios: ["auto", ...new Set(declared?.ratios?.filter(validImageRatio) ?? IMAGE_RATIO_OPTIONS.filter(r => r.id !== "auto").map(r => r.id))],
    resolutions: (Array.from(IMAGE_RESOLUTIONS) as string[]).filter(r => !declared?.resolutions || declared.resolutions.includes(r)),
    combinations: declared?.combinations,
  };
}

/** Explicit parameter definitions take precedence over the native-resolution
 * hint, including an explicitly disabled/empty resolution declaration. */
export function imageModelParameterOptions(model?: { generationParameters?: ImageParameterDeclaration; nativeResolutions?: string[] }) {
  const declared = model?.generationParameters;
  return imageParameterOptions({ ...declared, resolutions: declared?.resolutions ?? model?.nativeResolutions });
}

/** An unspecified/auto dimension asks whether any valid completion exists. */
export function imageCombinationSupported(parameters: ImageParameterDeclaration | undefined, ratio?: string, resolution?: string) {
  if (!parameters?.combinations) return true;
  return parameters.combinations.some(value => {
    const split = value.indexOf(":");
    return split > 0 && (!resolution || value.slice(0, split) === resolution)
      && (!ratio || ratio === "auto" || value.slice(split + 1) === ratio);
  });
}
