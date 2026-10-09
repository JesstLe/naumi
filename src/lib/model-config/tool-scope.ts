import type { ModelConfig, PublicModel } from "./types";
import { ModelConfigError } from "./types";
import { FEATURE_BINDINGS, compatiblePublicModels } from "./business";
import { MODEL_BINDINGS, type ModelBinding } from "./bindings";

export function modelAllowedForFeature(model: PublicModel, feature?: string) {
  return !feature || !model.toolScope || model.toolScope.features.includes(feature as never);
}
export function featureDefaultModel(config: ModelConfig, feature?: string, binding?: ModelBinding): string | undefined {
  return (feature && config.publicModels.find(m => m.enabled && m.visible && m.toolScope?.defaultFor.includes(feature as never))?.id) ||
    (feature && config.business?.[feature as keyof NonNullable<ModelConfig["business"]>]?.defaultModelId) || (binding && config.bindings[binding]) || undefined;
}
export function assertToolScope(config: ModelConfig, feature: string | undefined, id: string) {
  const model = config.publicModels.find(m => m.id === id);
  if (model && !modelAllowedForFeature(model, feature)) throw new ModelConfigError("MODEL_OUTSIDE_TOOL_SCOPE", "该模型未应用到当前工具，请选择该工具已开放的模型", 400);
}
export function validateToolScopes(config: ModelConfig) {
  const defaults = new Set<string>();
  for (const model of config.publicModels) {
    const scope = model.toolScope; if (!scope) continue;
    if (new Set(scope.features).size !== scope.features.length || new Set(scope.defaultFor).size !== scope.defaultFor.length)
      throw new ModelConfigError("INVALID_CONFIG", "工具范围不能包含重复选项");
    for (const feature of scope.features) {
      const binding = FEATURE_BINDINGS[feature];
      if (!binding || model.modality !== MODEL_BINDINGS[binding].modality || model.enabled && model.visible && !compatiblePublicModels(config, binding).some(m => m.id === model.id))
        throw new ModelConfigError("INVALID_CONFIG", "模型能力不满足所选工具范围");
      if (feature === "canvas.assistant" && model.enabled && !(model.target.type === "upstream" && config.upstreamModels.find(u => u.id === model.target.id)?.capabilities.vision))
        throw new ModelConfigError("INVALID_CONFIG", "画布助手需要支持图片理解的文字模型");
    }
    for (const feature of scope.defaultFor) {
      if (!model.enabled || !model.visible || !scope.features.includes(feature) || defaults.has(feature))
        throw new ModelConfigError("INVALID_CONFIG", "工具默认模型必须唯一、启用并包含在应用范围中");
      defaults.add(feature);
    }
  }
}
