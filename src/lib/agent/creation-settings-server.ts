import "server-only";
import { modelConfigurationEnabled } from "../model-config/availability";
import { readPublishedModelCatalog } from "../model-config/catalog-query";
import { canonicalPublicModelId } from "../model-config/public-identity";
import { freezeCreationSettings } from "./creation-settings";

/** Admission validates only the selectable public identity. The original tool
 * and its frozen quote still own capability, price and execution validation. */
export async function resolveCreationSettings(value: unknown) {
  const settings = freezeCreationSettings(value);
  if (settings.image && Object.keys(settings.image).length) {
    if (!await modelConfigurationEnabled()) throw new Error("当前图像配置尚未开放本轮参数，请使用智能设置或先发布平台模型");
    if (settings.image.modelId) {
      const catalog = await readPublishedModelCatalog("image", "image.generate");
      const id = canonicalPublicModelId(catalog.models, settings.image.modelId);
      if (!catalog.models.some(model => model.id === id)) throw new Error("本轮图像模型已不可用，请重新选择");
    }
  }
  return settings;
}
