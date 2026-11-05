import { applicationAPIMartImages } from "./apimart-image-policy";
import {z} from "zod";
import {DISPLAY_RESOLUTIONS} from "./resolution-options";
import {ModelConfigError, type ModelConfig} from "./types";
import {conventionalContract,type ParameterContract} from "./parameter-contract";
import type {MetadataResolutionDefaults} from "../supplier-models/resolution-defaults";

export const RESOLUTION_FIELDS = ["size", "resolution", "image_size", "image_config.image_size", "generationConfig.imageConfig.imageSize"] as const;
export const RATIO_FIELDS=["size","aspect_ratio","ratio","image_config.aspect_ratio","generationConfig.imageConfig.aspectRatio"] as const;
export const resolutionValue = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
export const resolutionPolicySchema = z.strictObject({
  mode:z.enum(["map","omit"]), field:z.enum(RESOLUTION_FIELDS),
  ratioField:z.enum(RATIO_FIELDS).optional(),
  values:z.partialRecord(z.enum(DISPLAY_RESOLUTIONS),resolutionValue),
}).refine(p=>p.mode!=="map"||p.field!==p.ratioField,"分辨率与比例不能使用同一参数字段");
export type ResolutionPolicy=z.infer<typeof resolutionPolicySchema>;
export const resolutionParametersSchema=z.strictObject({routes:z.array(z.strictObject({
  upstreamId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/), mode:z.enum(["legacy","map","omit"]),
  field:z.enum(RESOLUTION_FIELDS), ratioField:z.enum(RATIO_FIELDS).nullable().optional(), values:z.record(z.string(),z.string().max(100)),
  metadataRef:z.strictObject({id:z.uuid(),revision:z.number().int().positive()}).nullable().optional(),
})).min(1).max(100)});
export type ResolutionParameters=z.infer<typeof resolutionParametersSchema>;

/** Only resolution fields can be replaced; model, auth and other parameters are untouched. */
export function mapResolution(body:Record<string,any>,policy:ResolutionPolicy|undefined,requested:unknown,ratio?:string,contract?:ParameterContract){
  if(!policy)return body;
  // Conventional: an empty tier keeps the protocol's own size and ratio fields untouched.
  if(contract==="conventional"&&policy.mode==="map"&&!policy.values[requested as keyof typeof policy.values])return body;
  // Remove conflicting legacy fields, including nested variants, before applying this channel's contract.
  for(const field of RESOLUTION_FIELDS){const keys=field.split(".");let parent=body;
    for(const key of keys.slice(0,-1)){parent=parent?.[key];if(!parent||typeof parent!=="object")break;}
    if(parent&&typeof parent==="object")delete parent[keys[keys.length-1]];
  }
  const set=(field:string,value:string)=>{const keys=field.split(".");let target=body;for(const key of keys.slice(0,-1))target=target[key]&&typeof target[key]==="object"?target[key]:(target[key]={});target[keys[keys.length-1]]=value;};
  if(policy.ratioField&&ratio)set(policy.ratioField,ratio);
  if(policy.mode==="omit")return body;
  const value=policy.values[requested as keyof typeof policy.values];
  if(!value)throw new ModelConfigError("MODEL_PARAMETER_UNAVAILABLE","此供应通道尚未配置该分辨率映射，请核对后台设置",409);
  set(policy.field,value);return body;
}

export function resolutionConfiguration(config:ModelConfig,ids:string[]){
  return {routes:ids.map(id=>config.upstreamModels.find(u=>u.id===id)!).filter(Boolean).map(u=>{
    const provider=config.providers.find(p=>p.id===u.providerId)!;
    const policy=u.parameterMap.resolutionPolicy;
    return {upstreamId:u.id,model:u.model,provider:provider.name,protocol:provider.protocol,
      editable:(["openai-images","new-api-flow"].includes(provider.protocol)||applicationAPIMartImages(provider.protocol,u.parameterMap))&&!(config.defaultImagePreset?.enabled&&config.defaultImagePreset.upstreamId===u.id)&& !config.publicModels.some(m=>m.enabled&&m.target.type==="pool"&&config.pools.find(p=>p.id===m.target.id)?.candidates.includes(u.id)),
      mode:policy?.mode || "legacy" as "legacy"|"map"|"omit", field:policy?.field || "size" as ResolutionPolicy["field"],
      ratioField:policy?.ratioField,fieldKnown:Boolean(policy)||provider.protocol==="openai-images",
      values:{...(policy?.values||u.parameterMap.resolution||{})} as Record<string,string>,configured:Boolean(policy),
      nativeValues:[...u.capabilities.nativeResolutions] as string[],metadataDefaults:null as MetadataResolutionDefaults|null,
      metadataRef:null as {id:string;revision:number}|null};
  })};
}

export function applyResolutionParameters(source:ModelConfig,row:{id:string;modality:string;preset:boolean;resolutionConfig?:ReturnType<typeof resolutionConfiguration>},resolutions:readonly string[],input:ResolutionParameters|null){
  if(row.modality!=="image"||row.preset||!row.resolutionConfig?.routes.length)throw new ModelConfigError("MODEL_PARAMETERS_ADAPTER","该路径的参数需由对应适配器管理");
  const config=structuredClone(source),routes=row.resolutionConfig.routes;
  if(input&&(input.routes.length!==routes.length||new Set(input.routes.map(r=>r.upstreamId)).size!==routes.length||input.routes.some(r=>!routes.some(a=>a.upstreamId===r.upstreamId))))throw new ModelConfigError("INVALID_REQUEST","请配置该家族的全部实际模型来源");
  for(const route of routes){
    const u=config.upstreamModels.find(u=>u.id===route.upstreamId)!;
    const value=input?.routes.find(r=>r.upstreamId===u.id);
    if(!value||value.mode==="legacy"){delete u.parameterMap.resolutionPolicy;continue;}
    if(!route.editable)throw new ModelConfigError("MODEL_PARAMETERS_ADAPTER","此供应通道不能覆盖适配器的分辨率契约");
    if((route.protocol==="openai-images"||applicationAPIMartImages(route.protocol,u.parameterMap))&&(value.field.includes(".")||value.ratioField?.includes(".")))throw new ModelConfigError("INVALID_REQUEST","OpenAI 图片接口请选择 size、resolution 或 image_size 字段");
    if(value.mode==="map"&&!conventionalContract(u.parameterMap)&&resolutions.some(id=>!value.values[id]?.trim()))throw new ModelConfigError("INVALID_REQUEST","请为每个开放的分辨率填写实际上游值");
    const ratioField=value.ratioField===undefined?(u.parameterMap.resolutionPolicy?.field===value.field?u.parameterMap.resolutionPolicy?.ratioField:undefined):value.ratioField||undefined;
    u.parameterMap.resolutionPolicy=resolutionPolicySchema.parse({mode:value.mode,field:value.field,...(ratioField?{ratioField}:{}),values:Object.fromEntries(DISPLAY_RESOLUTIONS.filter(id=>value.values[id]?.trim()).map(id=>[id,value.values[id]]))});
  }
  return config;
}
