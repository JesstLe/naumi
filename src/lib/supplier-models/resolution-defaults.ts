import {specificationResolution} from "./specifications";
import {z} from "zod";
import {resolutionPolicySchema} from "../model-config/resolution-policy";
import type {SupplierModelRecord} from "./types";

export const metadataResolutionSchema=resolutionPolicySchema;
export type MetadataResolutionDefaults={id:string;revision:number;mode:"map"|"omit";field:z.infer<typeof resolutionPolicySchema>["field"];ratioField?:z.infer<typeof resolutionPolicySchema>["ratioField"];values:Record<string,string>;nativeValues:string[];source:string;state:string;checkedAt:string;available:boolean;reason:string};
export function metadataResolutionDefaults(record:SupplierModelRecord):MetadataResolutionDefaults{
  const explicit=metadataResolutionSchema.safeParse(record.parameterMetadata.resolutionDefaults);
  const legacy=(record.parameterMetadata.parameterMap as {resolution?:unknown}|undefined)?.resolution;
  const inherited=metadataResolutionSchema.safeParse({mode:"map",field:"size",values:legacy});
  const specification=record.parameterMetadata.supplierSpecification as {model?:unknown;url?:string;observedAt?:string}|undefined;
  const documented=specificationResolution(specification?.model);
  const policy=explicit.success?explicit.data:documented?{mode:"map" as const,...documented}:inherited.success?inherited.data:undefined;
  const fromDocument=!explicit.success&&!!documented;
  // A list of native sizes does not tell us the parameter name, casing or ratio-specific pixels.
  return {id:record.id,revision:record.revision,mode:policy?.mode||"map",field:policy?.field||"size",ratioField:policy?.ratioField,values:{...policy?.values},nativeValues:documented&&policy?.field===documented.field?documented.nativeValues:record.capabilities.resolutions||[],source:fromDocument?"供应商正式参数文档":record.capabilitySource||"元数据库",state:fromDocument?"documented":record.capabilityState,checkedAt:fromDocument?specification?.observedAt?.slice(0,10)||record.checkedAt:record.checkedAt,
    available:!!policy&&(policy.mode==="omit"||Object.keys(policy.values).length>0),
    reason:policy?fromDocument?"接口字段和实际规格已从供应商正式参数目录匹配，未逐档实测；保存后固定为执行映射":"默认值来自此供应商实际模型的元数据库记录；保存后固定为执行映射":"元数据库尚未维护参数名与实际值，继续原传参；可补充资料或手动映射"};
}
