import type { ModelConfig } from "./types";

export type PublicIdentity = { id: string; previousIds?: string[] };

/** Exact, version-owned aliases. Never consult current config while restoring a job. */
export function canonicalPublicModelId(models: readonly PublicIdentity[], id: string): string;
export function canonicalPublicModelId(models: readonly PublicIdentity[], id: string | undefined): string | undefined;
export function canonicalPublicModelId(models: readonly PublicIdentity[], id: string | undefined) {
  if (!id || models.some(model => model.id === id)) return id;
  return models.find(model => model.previousIds?.includes(id))?.id || id;
}

/** Preserve legacy parameter contracts which were keyed by public ID. This is
 * not the supplier model: wire IDs still come exclusively from upstream config. */
export function parameterModelIdentity(config: ModelConfig, id: string) {
  return config.publicModels.find(model => model.id === id)?.previousIds?.[0] || id;
}
