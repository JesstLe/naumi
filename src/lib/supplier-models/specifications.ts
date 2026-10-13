import {DISPLAY_RESOLUTIONS} from "../model-config/resolution-options";
import {RESOLUTION_FIELDS,RATIO_FIELDS,resolutionValue} from "../model-config/resolution-policy";
import type { CapabilityKey,CapabilitySet } from "../imagegen/types";
import { imagegenMetadataSchema } from "../imagegen/capabilities";

export type SupplierSpecificationCatalog={url:string;fetchedAt:string;hash:string;body:{version?:string;capability_version?:string;models:any[]}};

/** No guessing: only confirmed parameter paths and their documented enum values. */
export function specificationImagegen(raw:unknown){
  const envelope=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
  const model=envelope.model&&typeof envelope.model==="object"?envelope.model as Record<string,unknown>:{};
  const source=typeof envelope.url==="string"?envelope.url:"",checkedAt=typeof envelope.observedAt==="string"?envelope.observedAt.slice(0,10):"";
  const capabilities:CapabilitySet={},wireMap:Record<string,string>={};
  const keys:Record<string,CapabilityKey>={background:"transparent",input_fidelity:"inputFidelity",output_format:"outputFormat",output_compression:"outputCompression",moderation:"moderation",size:"pixelSize"};
  for(const p of Array.isArray(model.parameters)?model.parameters:[]){
    if(!p||typeof p!=="object")continue;
    const parameter=p as Record<string,unknown>,documentation=parameter.documentation as {values_confirmed?:unknown}|undefined;
    const path=typeof parameter.path==="string"?parameter.path:"",key=keys[path];
    if(!key||documentation?.values_confirmed!==true||!Array.isArray(parameter.options))continue;
    const values=parameter.options.filter((v):v is string=>typeof v==="string"&&v.length>0&&v.length<=100);
    if(!values.length||key==="transparent"&&!values.includes("transparent")||key==="pixelSize"&&!values.every(v=>/^\d+x\d+$/.test(v)))continue;
    capabilities[key]={state:"supported",values,source,checkedAt};wireMap[key]=path;
  }
  const parsed=imagegenMetadataSchema.safeParse({capabilities,wireMap});
  return parsed.success?parsed.data:{capabilities:{},wireMap:{}};
}

/** Derive enums only from explicit documented paths; model names and price tiers are not evidence. */
export function specificationResolution(spec:any){
  const parameters=Array.isArray(spec?.parameters)?spec.parameters:[];
  const parameter=parameters.find((p:any)=>RESOLUTION_FIELDS.includes(p.path)&&p.documentation?.values_confirmed===true&&Array.isArray(p.options)&&p.options.some((v:any)=>typeof v==="string"&&(DISPLAY_RESOLUTIONS as readonly string[]).includes(v.toUpperCase())));
  if(!parameter)return undefined;
  const nativeValues=parameter.options.filter((v:any)=>resolutionValue.safeParse(v).success) as string[];
  const values:Record<string,string>={};
  for(let i=0;i<DISPLAY_RESOLUTIONS.length;i++){
    const id=DISPLAY_RESOLUTIONS[i];
    const same=nativeValues.find(v=>v.toUpperCase()===id);
    const lower=[...DISPLAY_RESOLUTIONS.slice(0,i+1)].reverse().map(r=>nativeValues.find(v=>v.toUpperCase()===r)).find(Boolean);
    const lowest=DISPLAY_RESOLUTIONS.map(r=>nativeValues.find(v=>v.toUpperCase()===r)).find(Boolean);
    if(same||lower||lowest)values[id]=(same||lower||lowest)!;
  }
  const ratio=parameters.find((p:any)=>p.path!==parameter.path&&RATIO_FIELDS.includes(p.path)&&p.documentation?.values_confirmed===true&&Array.isArray(p.options)&&p.options.some((v:any)=>typeof v==="string"&&/^\d+:\d+$/.test(v)));
  return {field:parameter.path as typeof RESOLUTION_FIELDS[number],values,nativeValues,ratioField:ratio?.path as typeof RATIO_FIELDS[number]|undefined};
}
