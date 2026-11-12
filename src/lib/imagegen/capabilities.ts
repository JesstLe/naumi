import { z } from "zod";
import type { CapabilityKey, CapabilitySet, Intent } from "./types";
import { IMAGEGEN_USE_CASES } from "./catalog";
export const IMAGEGEN_CAPABILITY_KEYS=["edit","mask","transparent","inputFidelity","outputFormat","outputCompression","moderation","pixelSize"] as const;
const evidenceSchema=z.strictObject({state:z.enum(["supported","unsupported","unknown"]),
  values:z.array(z.string().min(1).max(100)).max(100).optional(),source:z.string().max(1000),
  checkedAt:z.union([z.literal(""),z.iso.date()])});
export const imagegenCapabilitySetSchema=z.strictObject({
  edit:evidenceSchema.optional(),mask:evidenceSchema.optional(),transparent:evidenceSchema.optional(),inputFidelity:evidenceSchema.optional(),
  outputFormat:evidenceSchema.optional(),outputCompression:evidenceSchema.optional(),moderation:evidenceSchema.optional(),pixelSize:evidenceSchema.optional(),
});
export const imagegenRequirementsSchema=z.strictObject({background:z.enum(["transparent","opaque"]).nullable(),
  operation:z.enum(["generate","edit","cutout","postprocess"]),useCase:z.enum(IMAGEGEN_USE_CASES.map(x=>x.id) as [typeof IMAGEGEN_USE_CASES[number]["id"],...typeof IMAGEGEN_USE_CASES[number]["id"][]]).optional(),
  conflicts:z.array(z.string().max(300)).max(20),requirements:z.array(z.strictObject({name:z.string().max(100),value:z.string().max(100),source:z.enum(["prompt","ui","skill"])})).max(30)});
export const IMAGEGEN_WIRE_FIELDS=["background","input_fidelity","output_format","output_compression","moderation","size","resolution","image_size","omit"] as const;
export const IMAGEGEN_FIELDS_BY_CAPABILITY:Record<CapabilityKey,readonly string[]>={edit:["omit"],mask:["omit"],transparent:["background","omit"],inputFidelity:["input_fidelity","omit"],outputFormat:["output_format","omit"],outputCompression:["output_compression","omit"],moderation:["moderation","omit"],pixelSize:["size","resolution","image_size","omit"]};
export const imagegenWireMapSchema=z.partialRecord(z.enum(IMAGEGEN_CAPABILITY_KEYS),z.enum(IMAGEGEN_WIRE_FIELDS))
  .refine(map=>Object.entries(map).every(([key,value])=>IMAGEGEN_FIELDS_BY_CAPABILITY[key as CapabilityKey].includes(value)),"实际参数名与能力不匹配");
export const imagegenMetadataSchema=z.strictObject({capabilities:imagegenCapabilitySetSchema.default({}),wireMap:imagegenWireMapSchema.default({})});
export function resolveImagegenCapabilities(manual:CapabilitySet|undefined,supplier:CapabilitySet|undefined):CapabilitySet {
  const result:CapabilitySet={};
  for(const key of IMAGEGEN_CAPABILITY_KEYS){const value=manual&&Object.hasOwn(manual,key)?manual[key]:supplier?.[key];if(value!==undefined)result[key]=structuredClone(value);}
  return result;
}
export function missingImagegenCapabilities(intent:Intent,capabilities:CapabilitySet):CapabilityKey[] {
  const required=new Set<CapabilityKey>();
  if(intent.operation==="edit"||intent.operation==="cutout")required.add("edit");
  if(intent.operation==="cutout"||intent.background==="transparent"&&intent.operation!=="postprocess")required.add("transparent");
  for(const requirement of intent.requirements){
    if(requirement.name==="mask")required.add("mask");
    if(requirement.name==="inputFidelity")required.add("inputFidelity");
    if(requirement.name==="moderation")required.add("moderation");
    if(requirement.name==="width"||requirement.name==="height")required.add("pixelSize");
  }
  return [...required].filter(key=>{
    const cap=capabilities[key];if(cap?.state!=="supported")return true;
    const requested=intent.requirements.find(r=>r.name===key);
    return requested&&cap.values!==undefined&&!cap.values.includes(requested.value);
  });
}
export function eligibleImagegenChannels(intent:Intent,candidates:{id:string;capabilities:CapabilitySet}[]):string[]{
  if(intent.conflicts.length)return [];
  return candidates.filter(c=>missingImagegenCapabilities(intent,c.capabilities).length===0).map(c=>c.id);
}
/** Published legacy booleans remain authoritative; missing proof dates are explicitly unrecorded. */
export function publishedImagegenCapabilities(capabilities:{verified:boolean;edit:boolean;transparent:boolean;imagegen?:CapabilitySet}):CapabilitySet {
  const legacy:CapabilitySet={};
  for(const key of ["edit","transparent"] as const)legacy[key]={state:capabilities[key]?"supported":"unsupported",source:"既有发布配置（历史核对日期未记录）",checkedAt:""};
  const published=resolveImagegenCapabilities(capabilities.imagegen,legacy);
  // Unknown is a documentation state, not a revocation of an enabled operation.
  // A deliberate per-capability refusal still overrides the legacy declaration.
  for(const key of ["edit","transparent"] as const)if(published[key]?.state==="unknown")published[key]=legacy[key];
  return published;
}
