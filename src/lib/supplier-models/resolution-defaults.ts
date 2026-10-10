import {z} from "zod";
import {resolutionPolicySchema} from "../model-config/resolution-policy";
import type {SupplierModelRecord} from "./types";

export const metadataResolutionSchema=resolutionPolicySchema;
export type MetadataResolutionDefaults={id:string;revision:number;mode:"map"|"omit";field:z.infer<typeof resolutionPolicySchema>["field"];values:Record<string,string>;nativeValues:string[];source:string;state:string;checkedAt:string;available:boolean;reason:string};
export function metadataResolutionDefaults(record:SupplierModelRecord):MetadataResolutionDefaults{
  const explicit=metadataResolutionSchema.safeParse(record.parameterMetadata.resolutionDefaults);
  const legacy=(record.parameterMetadata.parameterMap as {resolution?:unknown}|undefined)?.resolution;
  const inherited=metadataResolutionSchema.safeParse({mode:"map",field:"size",values:legacy});
  const policy=explicit.success?explicit.data:inherited.success?inherited.data:undefined;
  // A list of native sizes does not tell us the parameter name, casing or ratio-specific pixels.
  return {id:record.id,revision:record.revision,mode:policy?.mode||"map",field:policy?.field||"size",values:{...policy?.values},nativeValues:record.capabilities.resolutions||[],source:record.capabilitySource||"元数据库",state:record.capabilityState,checkedAt:record.checkedAt,
    available:!!policy&&(policy.mode==="omit"||Object.keys(policy.values).length>0),
    reason:policy?"默认值来自此供应商实际模型的元数据库记录；保存后固定为执行映射":"元数据库尚未维护参数名与实际值，继续原传参；可补充资料或手动映射"};
}
