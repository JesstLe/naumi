import type { ConfigSnapshot } from "../billing/types";
import type { ModelConfig } from "./types";
import { canonicalPublicModelId } from "./public-identity";

/** Adapt rule references in memory to the selected model snapshot. Amounts,
 * ordering, billing version and stored/frozen receipts remain unchanged. */
export function billingForModelIdentities(snapshot: ConfigSnapshot, models: ModelConfig): ConfigSnapshot {
  if (!models.publicModels.some(model => model.previousIds?.length)) return snapshot;
  let changed = false;
  const features = { ...snapshot.config.features };
  for (const key of Object.keys(features) as (keyof typeof features)[]) {
    const tariff = features[key]; let tariffChanged = false;
    const rules = tariff.rules.map(rule => {
      if (!rule.when.modelId) return rule;
      const ids = rule.when.modelId.map(id => canonicalPublicModelId(models.publicModels, id));
      if (ids.every((id, index) => id === rule.when.modelId![index])) return rule;
      tariffChanged = changed = true;
      return { ...rule, when: { ...rule.when, modelId: [...new Set(ids)] } };
    });
    if (tariffChanged) features[key] = { ...tariff, rules };
  }
  return changed ? { ...snapshot, config: { ...snapshot.config, features } } : snapshot;
}
