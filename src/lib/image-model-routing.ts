import {canonicalPublicModelId} from "./model-config/public-identity";
export type ImageModelRoutingOption = {
  id: string;
  previousIds?: string[];
  provider?: string;
  label?: string;
  supportsEdit?: boolean;
  modality?: string;
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

export function imageModelDisplayId(model: string) {
  return flowModelPrefix(model) || model;
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
  model = canonicalPublicModelId(available.map(item => typeof item === "string" ? {id:item} : item), model);
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

/** Keep the model selector focused on model families; ratio is selected next. */
export function compactImageModelOptions<T extends ImageModelRoutingOption>(
  options: T[],
  preferredIds: string[] = []
): T[] {
  const seen = new Set<string>();
  // Preferences choose a family's representative, never its position in the menu.
  return options.flatMap((option) => {
    // Management inventories also contain text/video models. Their public names
    // must not be replaced by image-family IDs or grouped as ratio variants.
    if (option.modality && option.modality !== "image") return [option];
    const displayId = imageModelDisplayId(option.id);
    const key = displayId;
    if (seen.has(key)) return [];
    seen.add(key);
    const family = options.filter(option => (!option.modality || option.modality === "image") && imageModelDisplayId(option.id) === displayId);
    const item = preferredIds.map(id => family.find(member => member.id === id)).find(Boolean) || option;
    const label = item.label?.trim();
    const managed = item.provider === "managed" || item.modality === "image";
    const custom = managed && label && label !== item.id && family.every(option => option.label?.trim() === label);
    const previousIds = family.flatMap(member => member.previousIds || []);
    return [{ ...item, ...(previousIds.length ? {previousIds} : {}), label: custom ? label : displayId }];
  });
}
