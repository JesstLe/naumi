import { FEATURE_BINDINGS, upstreamSupportsFeature } from "./feature-model-policy";
import "server-only";
import { requestedFeatureModel } from "./selection-policy";
import type { FeatureId } from "../billing/rules/registry";
import { MODEL_BINDINGS } from "./bindings";
import { currentModelExecution } from "./context";
import { modelConfigurationEnabled } from "./availability";
import {readManagedModelSnapshot} from "./snapshot-reader";
import {selectFeatureModel} from "./model-selection";
import { ModelConfigError,type ModelSnapshot } from "./types";

const billingBinding = (feature: FeatureId) => FEATURE_BINDINGS[feature];

/** Compatibility HTTP adapter; business callers pass selection facts directly. */
export async function managedBillingModel(request:Request,feature:FeatureId,selected?:string){
  return managedBillingSelection({textModel:request.headers.get("x-naumi-text-model"),canvas:request.headers.get("x-naumi-canvas")==="1"},feature,selected);
}
export async function managedBillingSelection(selection:{textModel?:string|null;canvas?:boolean},feature:FeatureId,selected?:string,models?:ModelSnapshot|null){
  const binding=billingBinding(feature);
  if(!binding)return null;
  if(models===null)return null;
  if(models===undefined&&!await modelConfigurationEnabled())return null;
  const role=binding.startsWith("vision.")?"vision":MODEL_BINDINGS[binding].modality;
  const scope=currentModelExecution(role);
  const explicit=requestedFeatureModel(feature,selected);
  if(scope&&(!explicit||explicit===scope.frozen.publicModelId)&&(scope.frozen.binding===binding||feature==="canvas.image"&&scope.frozen.binding==="image.generate")&&(!scope.frozen.feature||scope.frozen.feature===feature))return {modelId:scope.frozen.publicModelId,providerId:scope.connection.providerId};
  const snapshot=models??await readManagedModelSnapshot();if(!snapshot)return null;
  const requested=requestedFeatureModel(feature,selected||(role==="text"?selection.textModel?.trim():undefined));
  const selectedModel=selectFeatureModel(snapshot.config,{feature,binding,requestedModelId:requested,scopeSystem:selection.canvas?"canvas":undefined,allowUnboundCutout:true});
  if(!selectedModel)return null;
  const {model,preset}=selectedModel;
  if(preset)return {modelId:model.id,providerId:snapshot.config.upstreamModels.find(u=>u.id===preset.upstreamId)!.providerId};
  if(model.target.type==="pool")return {modelId:model.id,providerId:"managed-router"};
  const upstream=snapshot.config.upstreamModels.find(u=>u.id===model.target.id);
  const provider=snapshot.config.providers.find(p=>p.id===upstream?.providerId);
  // Billing identity must not reject a supplier family based on its primary target.
  if(!upstream||!provider||!model.supplierRouting&&(!upstream.enabled||!provider.enabled||!upstreamSupportsFeature(upstream.capabilities,binding,feature)))throw new ModelConfigError("MODEL_INCOMPATIBLE","所选模型不支持当前操作",400);
  return {modelId:model.id,providerId:["apimart-images","fal-images"].includes(provider.protocol)?"managed-router":provider.id};
}
