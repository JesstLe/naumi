import {accountImageModel} from "./account-image-policy";
import type {AccountImageGrant} from "../accounts/creation-policy";
import {canonicalPublicModelId} from "./public-identity";
import {MODEL_BINDINGS,type ModelBinding} from "./bindings";
import {selectedBusinessOption} from "./business";
import {selectedImagePreset,presetPublicId} from "./image-preset";
import {requestedFeatureModel} from "./selection-policy";
import { featureDefaultModel, assertToolScope } from "./feature-model-policy";
import {ModelConfigError,type ModelConfig} from "./types";

/** One public model identity for execution and pricing. Channel admission is a separate decision. */
export function selectFeatureModel(config:ModelConfig,input:{accountImage?:AccountImageGrant;feature?:string;binding:string;requestedModelId?:string;scopeSystem?:"canvas";requireVisible?:boolean;allowUnboundCutout?:boolean}){
  const purpose=MODEL_BINDINGS[input.binding as ModelBinding];
  if(!purpose)throw new ModelConfigError("INVALID_REQUEST","未知模型用途");
  const accountImage=purpose.modality==="image"?input.accountImage:undefined;
  const requested=accountImageModel(config,accountImage,canonicalPublicModelId(config.publicModels,requestedFeatureModel(input.feature,input.requestedModelId)));
  const preset=selectedImagePreset(config,input.feature,requested,input.binding);
  const option=selectedBusinessOption(config,input.feature,requested);
  if(input.allowUnboundCutout&&input.feature==="tool.cutout"&&!requested&&!preset&&!option&&!config.bindings[input.binding as ModelBinding])return null;
  if(accountImage&&option?.routing?.enabled)throw new ModelConfigError("ACCOUNT_MODEL_UNAVAILABLE","专属模型不使用通道回退",503);
  const id=preset?presetPublicId(preset,requested):option?.modelId||requested||featureDefaultModel(config,input.feature,input.binding as ModelBinding);
  const model=config.publicModels.find(m=>m.id===id&&m.enabled&&m.modality===purpose.modality&&(!(input.requireVisible||requested)||m.visible||accountImage?.modelId===m.id));
  if(!model)throw new ModelConfigError("MODEL_UNAVAILABLE","所选模型不可用，请刷新模型列表后重试",409);
  assertToolScope(config,input.feature,model.id,input.scopeSystem);
  return {model,preset,option,purpose,requestedModelId:requested};
}
