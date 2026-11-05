import type { Artwork } from "../mock-data";

export const sortCanvasArtworks=(nodes:Iterable<Artwork>)=>Array.from(nodes).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
export function artworkRows(data:unknown):Artwork[] {
  if(!Array.isArray(data)||data.some(n=>!n||typeof n.id!=="string"||!n.id))throw new Error("作品响应格式异常");
  if(new Set(data.map(n=>n.id)).size!==data.length)throw new Error("作品响应包含重复记录");
  return data as Artwork[];
}
/** Apply remote metadata while retaining fields edited since this read began.
 * Server CAS remains a separate persistence concern; this is local projection. */
export function mergeArtworkFields(incoming:Artwork,before:Artwork|undefined,current:Artwork|undefined):Artwork {
  if(!current||current===before)return incoming;
  if(!before)return current;
  const result={...incoming};
  for(const key of new Set([...Object.keys(before),...Object.keys(current)]) as Set<keyof Artwork>) {
    if(JSON.stringify(before[key])!==JSON.stringify(current[key])){
      if(key in current)Object.assign(result,{[key]:current[key]});else delete result[key];
    }
  }
  return result;
}
