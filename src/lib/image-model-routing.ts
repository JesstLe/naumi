export type ImageModelRoutingOption = {
  id: string;
  provider?: string;
};

const FLOW_VARIANT_SUFFIXES = [
  "four-three",
  "three-four",
  "landscape",
  "portrait",
  "square",
] as const;

function flowModelPrefix(model: string) {
  const suffix = FLOW_VARIANT_SUFFIXES.find((value) => model.endsWith(`-${value}`));
  return suffix ? model.slice(0, -(suffix.length + 1)) : null;
}

function flowVariantForRatio(ratio: string) {
  const [rawWidth, rawHeight] = ratio.split(":").map(Number);
  if (!(rawWidth > 0 && rawHeight > 0)) return null;
  const value = rawWidth / rawHeight;
  if (Math.abs(value - 1) < 0.05) return "square";
  if (ratio === "3:4") return "three-four";
  if (ratio === "4:3") return "four-three";
  return value < 1 ? "portrait" : "landscape";
}

/** Route a directional image model to the variant matching the node ratio. */
export function routeImageModel(
  model: string,
  ratio: string,
  available: ImageModelRoutingOption[] | string[]
) {
  const prefix = flowModelPrefix(model);
  const variant = flowVariantForRatio(ratio);
  if (!prefix || !variant) return model;
  const ids = available.map((item) => (typeof item === "string" ? item : item.id));
  const exact = `${prefix}-${variant}`;
  return ids.includes(exact) ? exact : model;
}

export function imageModelFamily(model: string) {
  if (/^gemini-3(?:\.0)?-pro-image-/.test(model)) return "nano-banana-pro";
  if (/^gemini-3\.1-flash-image-/.test(model)) return "nano-banana-2";
  if (/^imagen-4\.0-generate-preview-/.test(model)) return "imagen-4";
  return null;
}
