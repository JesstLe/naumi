import {selectedImagePreset} from "./image-preset";
import type {AccountImageGrant} from "../accounts/creation-policy";
import {ModelConfigError,type ModelConfig} from "./types";
/** Server-loaded grant only. Hidden public identity + one frozen upstream; never a provider fallback. */
export function accountImageModel(config:ModelConfig,grant:AccountImageGrant|undefined|null,requested?:string){
  if(!grant)return requested;
  if(requested&&requested!==grant.modelId)throw new ModelConfigError("ACCOUNT_MODEL_REQUIRED","此账号使用专属生图模型，请刷新模型列表",403);
  const model=config.publicModels.find(m=>m.id===grant.modelId&&m.enabled&&m.modality==="image");
  const upstream=config.upstreamModels.find(u=>u.id===grant.upstreamId&&u.enabled);
  if(!model||model.visible||model.target.type!=="upstream"||model.target.id!==grant.upstreamId||model.supplierRouting||!upstream||!config.providers.some(p=>p.id===upstream.providerId&&p.enabled&&!!p.credentialRef))throw new ModelConfigError("ACCOUNT_MODEL_UNAVAILABLE","专属生图通道尚未就绪",503);
  if(selectedImagePreset(config,"image.generate",model.id,"image.generate"))throw new ModelConfigError("ACCOUNT_MODEL_UNAVAILABLE","专属模型不使用公共图片预设",503);
  return model.id;
}
