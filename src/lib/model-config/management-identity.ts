import { imageModelDisplayId } from "../image-model-routing";
import type { ManagedModelRow } from "./management";
import { ModelConfigError, type ModelConfig } from "./types";

/** One model-config publication owns identity, defaults, business options and
 * preset references. Prices in independent billing snapshots are projected by
 * billing-identity against these same versioned aliases, never double-published. */
export function editManagedModelIdentity(source: ModelConfig, row: ManagedModelRow, publicId: string, label: string): ModelConfig {
  const id = publicId.trim(), name = label.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id) || id.startsWith("byok:") || row.modality === "image" && imageModelDisplayId(id) !== id)
    throw new ModelConfigError("INVALID_PUBLIC_ID", "公开 ID 格式无效，图片家族 ID 不能以比例分支后缀结尾");
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name))
    throw new ModelConfigError("INVALID_LABEL", "显示名称需要 1–100 个字符，不能包含控制字符");
  const family = source.publicModels.filter(model => model.modality === row.modality && (row.modality === "image" ? imageModelDisplayId(model.id) === row.id : model.id === row.id));
  if (!family.length) throw new ModelConfigError("MODEL_UNAVAILABLE", "模型不存在，请刷新", 409);
  const replacements = new Map(family.map(model => [model.id, id + model.id.slice(row.id.length)]));
  for (const [before, after] of replacements) {
    if (after.length > 100 || source.publicModels.some(model => model.id !== before && (model.id === after || row.modality === "image" && imageModelDisplayId(model.id) === id && !family.includes(model)) || model.previousIds?.includes(after)))
      throw new ModelConfigError("PUBLIC_ID_CONFLICT", "公开 ID 或其比例分支已被使用，旧 ID 保留兼容不能复用", 409);
  }
  const config = structuredClone(source), replace = (value: string) => replacements.get(value) || value;
  for (const model of config.publicModels) if (replacements.has(model.id)) {
    const next = replace(model.id);
    if (next !== model.id) model.previousIds = [...(model.previousIds || []), model.id];
    model.id = next; model.label = name;
  }
  for (const key of Object.keys(config.bindings)) config.bindings[key] = replace(config.bindings[key]);
  for (const feature of Object.values(config.business || {})) if (feature) {
    feature.defaultModelId = replace(feature.defaultModelId);
    for (const option of feature.options) option.modelId = replace(option.modelId);
  }
  if (config.defaultImagePreset) {
    config.defaultImagePreset.defaultModelIds = config.defaultImagePreset.defaultModelIds.map(replace);
    for (const alias of config.defaultImagePreset.aliases) if (replacements.has(alias.id)) { alias.id = replace(alias.id); alias.label = name; }
  }
  return config;
}
