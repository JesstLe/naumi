import {z} from "zod";
import {DISPLAY_QUALITY_IDS} from "../model-config/quality-policy";
import type {SupplierModelRecord} from "./types";

const wireValue=z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
export const metadataQualitySchema=z.discriminatedUnion("mode",[
 z.strictObject({mode:z.literal("omit")}),
 z.strictObject({mode:z.literal("map"),values:z.partialRecord(z.enum(DISPLAY_QUALITY_IDS),wireValue)}),
]);
export type MetadataQualityDefaults={id:string;revision:number;mode:"map"|"omit";values:Record<string,string>;nativeValues:string[];source:string;state:string;checkedAt:string;available:boolean;reason:string};
export function metadataQualityDefaults(record:SupplierModelRecord):MetadataQualityDefaults{
 const nativeValues=[...new Set((record.capabilities.qualities || []).filter(v=>wireValue.safeParse(v).success))];
 const explicit=metadataQualitySchema.safeParse(record.parameterMetadata.qualityDefaults);
 const parameterMap=record.parameterMetadata.parameterMap as {quality?:Record<string,string>;qualityPolicy?:unknown}|undefined;
 const values:Record<string,string>={};
 if(explicit.success&&explicit.data.mode==="map")Object.assign(values,explicit.data.values);
 else if(!explicit.success)for(const id of DISPLAY_QUALITY_IDS){const v=parameterMap?.quality?.[id];if(wireValue.safeParse(v).success)values[id]=v!;}
 // Only recognized, ordered native quality names can supply missing display
 // tiers. Arbitrary vendor enums require an explicit library mapping.
 const ranked=DISPLAY_QUALITY_IDS.filter(id=>nativeValues.includes(id));
 for(let i=0;i<DISPLAY_QUALITY_IDS.length;i++){
  const id=DISPLAY_QUALITY_IDS[i];if(values[id])continue;
  if(nativeValues.includes(id))values[id]=id;
  else if(ranked.length)values[id]=[...ranked].reverse().find(q=>DISPLAY_QUALITY_IDS.indexOf(q)<=i) || ranked[0];
 }
 const omit=explicit.success&&explicit.data.mode==="omit";
 return {id:record.id,revision:record.revision,mode:omit?"omit":"map",values,nativeValues,source:record.capabilitySource || "元数据库",state:record.capabilityState,checkedAt:record.checkedAt,available:omit||Object.keys(values).length>0,reason:omit?"元数据库配置为不发送 quality":Object.keys(values).length?"默认映射来自此供应商的实际模型记录；较高展示档位可复用最高已记录原生档位":"元数据库尚未记录可用 quality 值，请补充资料或手动填写；不会猜测上游参数"};
}
