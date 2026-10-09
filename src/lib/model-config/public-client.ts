import { IMAGE_QUALITY_IDS, type ImageQualityId } from "../image-quality";

export const MODEL_CATALOG_REFRESH = "naumi:model-catalog-refresh";
export type PublicImageModel = {
  creditHint?:string;
  id: string;
  label: string;
  supportsEdit: boolean;
  provider?: string;
  qualities?: string[];
  qualityLabels?: Record<string,string>;
  nativeResolutions?: string[];
  generationParameters?: { ratios?: string[]; resolutions?: string[]; combinations?: string[] };
  qualitySupported?: boolean;
};
export type PublicImageConfiguration = {
  modelVersion?: number;
  defaultImageModel?: string;
  imageModels?: PublicImageModel[];
  imageModelBindings?: Record<string, string>;
  imageBindingCapabilities?: Record<string, { qualities: string[]; nativeResolutions: string[] }>;
  imageQualityCapable?: boolean;
  imageQualityExperimental?: boolean;
};
let acceptedVersion: number | undefined;
export const currentModelCatalogVersion = () => acceptedVersion;
export function rememberModelCatalogVersion(version?: number) {
  acceptedVersion =
    Number.isSafeInteger(version) && version! > 0 ? version : undefined;
}
export function availableImageQualities(
  config: PublicImageConfiguration | null,
  modelId?: string,
  binding = "image.generate",
): ImageQualityId[] {
  const model = config?.imageModels?.find(
    (m) =>
      m.id ===
      (modelId ||
        config.imageModelBindings?.[binding] ||
        config.defaultImageModel),
  );
  const qualities = !modelId ? config?.imageBindingCapabilities?.[binding]?.qualities ?? model?.qualities : model?.qualities;
  if (qualities !== undefined) {
    const allowed = IMAGE_QUALITY_IDS.filter((q) =>
      qualities.includes(q),
    );
    return allowed.length ? allowed : ["medium"];
  }
  return config?.imageQualityCapable ? [...IMAGE_QUALITY_IDS] : ["medium"];
}
