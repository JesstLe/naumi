import {DISPLAY_RESOLUTIONS} from "../model-config/resolution-options";
import {RESOLUTION_FIELDS,RATIO_FIELDS,resolutionValue} from "../model-config/resolution-policy";

export type SupplierSpecificationCatalog={url:string;fetchedAt:string;hash:string;body:{version?:string;capability_version?:string;models:any[]}};

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
