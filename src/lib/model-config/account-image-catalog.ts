import type {ModelSnapshot} from "./types";
import type {AccountImageGrant} from "../accounts/creation-policy";
import {accountImageModel} from "./account-image-policy";
import {FEATURE_BINDINGS} from "./feature-model-policy";
/** Presentation-only copy. Never pass this projection to an executor, Router or publication. */
export function accountImageCatalogSnapshot(snapshot:ModelSnapshot,grant:AccountImageGrant):ModelSnapshot{
  accountImageModel(snapshot.config,grant);
  const copy=structuredClone(snapshot),config=copy.config;
  config.defaultImagePreset=undefined;
  config.publicModels=config.publicModels.filter(m=>m.modality!=="image"||m.id===grant.modelId).map(m=>m.id===grant.modelId?{...m,visible:true}:m);
  for(const key of ["image.generate","image.edit","image.cutout"] as const)config.bindings[key]=grant.modelId;
  for(const [feature,setting] of Object.entries(config.business||{}))if(FEATURE_BINDINGS[feature as keyof typeof FEATURE_BINDINGS]?.startsWith("image.")&&setting)setting.defaultModelId=grant.modelId;
  return copy;
}
