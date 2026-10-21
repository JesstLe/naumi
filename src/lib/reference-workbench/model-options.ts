import {compactImageModelOptions,imageModelDisplayId,imageModelFamily} from "../image-model-routing";
import {frontendImageModels} from "../frontend-image-models";

export type WorkbenchModelOption={id:string;label:string;aliases?:string[]};
const familyKey=(id:string)=>imageModelFamily(id)?imageModelDisplayId(id):id;

/** Presentation only: retain a real public ID; execution still routes by ratio. */
export function workbenchModelOptions(options:WorkbenchModelOption[]):WorkbenchModelOption[]{
 options=frontendImageModels(options);
 const seen=new Set<string>();
 return options.flatMap(option=>{
  const key=familyKey(option.id);if(seen.has(key))return [];seen.add(key);
  const family=options.filter(item=>familyKey(item.id)===key);
  const representative=imageModelFamily(option.id)
   ?compactImageModelOptions(family.map(item=>({...item,modality:"image"})))[0]
   :option;
  return [{id:representative.id,label:representative.label,aliases:[...new Set(family.flatMap(item=>[item.id,...item.aliases||[]]))]}];
 });
}

/** Old saved ratio IDs select their visible family, not an empty native select. */
export function workbenchModelSelection(saved:string,options:WorkbenchModelOption[]):string{
 return options.find(item=>item.id===saved)?.id
  ||options.find(item=>item.aliases?.includes(saved)||imageModelFamily(saved)&&familyKey(item.id)===familyKey(saved))?.id
  ||"";
}
