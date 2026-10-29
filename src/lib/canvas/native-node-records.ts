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
] as const;
export type CanvasNativeKind=typeof CANVAS_NATIVE_NODE_KINDS[number]["kind"];
export type CanvasNativeNodeSet={videoNodes:CanvasVideoNode[];directorNodes:CanvasDirectorNode[];characterNodes:CanvasCharacterNode[];sceneNodes:CanvasSceneNode[];audioNodes:CanvasAudioNode[];timelineNodes:CanvasTimelineNode[]};
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
