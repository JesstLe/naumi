import type {CanvasComfyNode} from "./comfy-node-schema";
import type {CanvasVideoNode} from "./video-node-schema";
import type {CanvasDirectorNode} from "./director-node-schema";
import type {CanvasCharacterNode} from "./character-node-schema";
import type {CanvasSceneNode} from "./scene-node-schema";
import type {CanvasAudioNode} from "./audio-node-schema";
import type {CanvasTimelineNode} from "./timeline-node-schema";

/** The six existing durable native document kinds, not a plugin/manager API.
 * Field names remain the published copy/history wire contract. */
export const CANVAS_NATIVE_NODE_KINDS=[
  {kind:"video",records:"videoNodes",ids:"videoIds"},
  {kind:"director",records:"directorNodes",ids:"directorIds"},
  {kind:"character",records:"characterNodes",ids:"characterIds"},
  {kind:"scene",records:"sceneNodes",ids:"sceneIds"},
  {kind:"audio",records:"audioNodes",ids:"audioIds"},
  {kind:"timeline",records:"timelineNodes",ids:"timelineIds"},
  {kind:"comfy",records:"comfyNodes",ids:"comfyIds"},
] as const;
export type CanvasNativeKind=typeof CANVAS_NATIVE_NODE_KINDS[number]["kind"];
export type CanvasNativeNodeSet={comfyNodes:CanvasComfyNode[];videoNodes:CanvasVideoNode[];directorNodes:CanvasDirectorNode[];characterNodes:CanvasCharacterNode[];sceneNodes:CanvasSceneNode[];audioNodes:CanvasAudioNode[];timelineNodes:CanvasTimelineNode[]};
export type CanvasNativeRecords=Partial<CanvasNativeNodeSet>;
export type CanvasNativeNode=CanvasNativeNodeSet[keyof CanvasNativeNodeSet][number];
export type CanvasNativeIds=Partial<Record<typeof CANVAS_NATIVE_NODE_KINDS[number]["ids"],string[]>>;

export function canvasNativeNodes(records:CanvasNativeRecords):CanvasNativeNode[]{const nodes:CanvasNativeNode[]=[];for(const {records:key} of CANVAS_NATIVE_NODE_KINDS)nodes.push(...records[key]||[]);return nodes;}
export function filterCanvasNativeRecords(records:CanvasNativeRecords,keep:(node:CanvasNativeNode)=>boolean):CanvasNativeRecords{
  return Object.fromEntries(CANVAS_NATIVE_NODE_KINDS.filter(({records:key})=>records[key]!==undefined).map(({records:key})=>[key,records[key]!.filter(keep)])) as CanvasNativeRecords;
}
export function canvasNativeIds(records:CanvasNativeRecords):CanvasNativeIds{
  return Object.fromEntries(CANVAS_NATIVE_NODE_KINDS.filter(({records:key})=>records[key]!==undefined).map(({records:key,ids})=>[ids,records[key]!.map(node=>node.id)]));
}
export function canvasNativeVisibility(records:CanvasNativeRecords,visible:boolean){
  return CANVAS_NATIVE_NODE_KINDS.flatMap(({kind,records:key})=>(records[key]||[]).map(node=>({type:`${kind}-visibility` as `${CanvasNativeKind}-visibility`,id:node.id,visible})));
}
export const isCanvasNativeOperation=(operation:{type:string})=>CANVAS_NATIVE_NODE_KINDS.some(({kind})=>operation.type.startsWith(kind+"-"));

/** Full public snapshot equality includes same-revision task/status updates. */
export function sameCanvasNativeSnapshot(a:unknown,b:unknown):boolean{
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=="object"||typeof b!=="object")return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameCanvasNativeSnapshot(value,b[index]));
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.prototype.hasOwnProperty.call(right,key)&&sameCanvasNativeSnapshot(left[key],right[key]));
}
export function mergeCanvasNativeSnapshots<N extends {id:string;revision:number}>(previous:N[],incoming:N[]):N[]{
  const nodes=new Map(previous.map(node=>[node.id,node]));let changed=false;
  for(const node of incoming){const old=nodes.get(node.id);if(old&&node.revision<old.revision)continue;if(!old||!sameCanvasNativeSnapshot(old,node)){nodes.set(node.id,node);changed=true;}}
  return changed?[...nodes.values()]:previous;
}
