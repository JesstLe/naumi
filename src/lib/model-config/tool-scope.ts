import type { ModelConfig } from "./types";
import { ModelConfigError } from "./types";
import { FEATURE_BINDINGS, compatiblePublicModels } from "./feature-model-policy";
import { MODEL_BINDINGS } from "./bindings";

export function validateToolScopes(config: ModelConfig) {
  const defaults = new Set<string>();
  for (const model of config.publicModels) {
    const scope = model.toolScope; if (!scope) continue;
    if (new Set(scope.features).size !== scope.features.length || new Set(scope.defaultFor).size !== scope.defaultFor.length)
      throw new ModelConfigError("INVALID_CONFIG", "工具范围不能包含重复选项");
    for (const feature of scope.features) {
      const binding = FEATURE_BINDINGS[feature];
      if (!binding || model.modality !== MODEL_BINDINGS[binding].modality || model.enabled && model.visible && !compatiblePublicModels(config, binding, feature).some(m => m.id === model.id))
        throw new ModelConfigError("INVALID_CONFIG", "模型能力不满足所选工具范围");
    }
    for (const feature of scope.defaultFor) {
      if (!model.enabled || !model.visible || !scope.features.includes(feature) || defaults.has(feature))
        throw new ModelConfigError("INVALID_CONFIG", "工具默认模型必须唯一、启用并包含在应用范围中");
      defaults.add(feature);
    }
  }
}

export { modelAllowedForFeature, featureDefaultModel, assertToolScope } from "./feature-model-policy";
