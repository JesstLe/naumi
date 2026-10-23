import documented from "./video-family-capabilities.json";
import type {VideoModelDefinition,VideoWireProfile} from "../video/capability-schema";

/** Supported documented contract and successful smoke inputs are distinct. */
export const DOCUMENTED_VIDEO_FAMILIES=documented.items.map(item=>({...item,definition:item.definition as VideoModelDefinition,profile:item.profile as VideoWireProfile}));
export function documentedVideoFamily(item:{providerId:string;model:string}){
  return DOCUMENTED_VIDEO_FAMILIES.find(entry=>entry.providerId===item.providerId&&entry.model===item.model);
}
