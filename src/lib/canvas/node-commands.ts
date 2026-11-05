import {filterCanvasNativeRecords,canvasNativeNodes,type CanvasNativeRecords} from "./native-node-records";
import type {Artwork} from "../mock-data";
import type {CanvasVideoNode} from "./video-node-schema";
import {CANVAS_TEXT_DEFAULT_HEIGHT,CANVAS_TEXT_DEFAULT_WIDTH,type CanvasTextNode} from "./text-document-model";
import type {CanvasHistoryAction} from "./history-model";
import {browserRandomUUID} from "../browser-crypto";
import type {CanvasPendingNode,CanvasGenerationTask} from "./scene-types";

export type CanvasLocalNodeRecords={pendingNodes:CanvasPendingNode[];generationTasks:CanvasGenerationTask[]};
export type CanvasLocalHistoryAction=Extract<CanvasHistoryAction,{kind:"pending-add"|"pending-link"|"local-delete"|"mixed-delete"}>;
export type CanvasNodeRecords={artworks:Artwork[];textNodes:CanvasTextNode[];videoNodes:CanvasVideoNode[]}&Omit<CanvasNativeRecords,"videoNodes">&Partial<CanvasLocalNodeRecords>;
/** Deleting a preview is not cancellation. Running/uncertain paid work and
 * queued text slots remain owned by their original execution/receipt. */
export function canvasDeletableIds(ids:string[],nodes:Pick<CanvasNodeRecords,"textNodes"|"pendingNodes"|"generationTasks">){
  return [...new Set(ids.filter(Boolean))].filter(id=>{
    if(nodes.textNodes.find(node=>node.id===id)?.status==="generating")return false;
    const pending=nodes.pendingNodes?.find(node=>node.id===id);
    if(pending)return !pending.generating&&!pending.uploading&&!pending.needsAttention;
    const task=nodes.generationTasks?.find(node=>node.id===id);
    if(task)return !!task.failure&&!task.replaceNode;
    return !id.startsWith("pend-")&&!id.startsWith("task-");
  });
}
export function canvasDeleteRecords(ids:string[],nodes:CanvasNodeRecords):CanvasNodeRecords{
  const selected=new Set(canvasDeletableIds(ids,nodes));
  return {artworks:nodes.artworks.filter(node=>selected.has(node.id)),textNodes:nodes.textNodes.filter(node=>selected.has(node.id)),videoNodes:[],...filterCanvasNativeRecords(nodes,node=>selected.has(node.id)),
    ...(nodes.pendingNodes?{pendingNodes:nodes.pendingNodes.filter(node=>selected.has(node.id)).map(node=>({...node,inputs:[...node.inputs]}))}:{}),
    ...(nodes.generationTasks?{generationTasks:nodes.generationTasks.filter(node=>selected.has(node.id))}:{})};
}
export function canvasDeletionAction(records:CanvasNodeRecords):CanvasHistoryAction|null{
  const {artworks,textNodes,pendingNodes=[],generationTasks=[]}=records,local=pendingNodes.length+generationTasks.length;
  if(!artworks.length&&!textNodes.length&&!canvasNativeNodes(records).length)return local?{kind:"local-delete",pendingNodes,generationTasks}:null;
  if(local||canvasNativeNodes(records).length||artworks.length&&textNodes.length)return {kind:"mixed-delete",...records};
  return artworks.length?{kind:"delete",records:artworks}:{kind:"text-delete",records:textNodes};
}

/** Session-local portion of the existing history transaction. Presentation
 * stores retain their own hidden IDs; no receipt/task is removed. */
export function applyCanvasLocalHistory(action:CanvasLocalHistoryAction,undo:boolean,ports:{
  pending:{get:(id:string)=>CanvasPendingNode|undefined;getSnapshot:()=>CanvasPendingNode[];set:(update:(nodes:CanvasPendingNode[])=>CanvasPendingNode[])=>void;visibility:(nodes:CanvasPendingNode[],visible:boolean)=>void};
  generation:{getSnapshot:()=>{tasks:readonly CanvasGenerationTask[]};visibility:(nodes:CanvasGenerationTask[],visible:boolean)=>void};
},checkOnly=false){
  if(action.kind==="pending-link"){
    const node=ports.pending.get(action.id);if(!node||node.generating||node.uploading)throw new Error("节点已开始生成或已移除");
    if(!checkOnly)ports.pending.set(nodes=>nodes.map(node=>node.id===action.id?{...node,...action[undo?"from":"to"]}:node));
    return [];
  }
  const pending=action.kind==="pending-add"?action.records:action.pendingNodes||[],tasks=action.kind==="pending-add"?[]:action.generationTasks||[];
  const visible=action.kind==="pending-add"?!undo:undo,ids=[...pending,...tasks].map(node=>node.id);
  const allowed=new Set(canvasDeletableIds(ids,{textNodes:[],pendingNodes:ports.pending.getSnapshot(),generationTasks:[...ports.generation.getSnapshot().tasks]}));
  if(!visible&&(checkOnly||action.kind!=="mixed-delete")&&ids.some(id=>!allowed.has(id)))throw new Error("节点正在执行，请稍后再删除");
  if(checkOnly)return [];
  const p=visible?pending:pending.filter(node=>allowed.has(node.id)),t=visible?tasks:tasks.filter(node=>allowed.has(node.id));
  ports.pending.visibility(p,visible);ports.generation.visibility(t,visible);
  return visible?[]:[...p,...t].map(node=>node.id);
}
export function newCanvasText(input:{x:number;y:number;viewport:{x:number;y:number;zoom:number};project:string|null;forceNewProject?:boolean;title:string;prompt?:string;sourceIds?:string[]}):CanvasTextNode{
  const id=`text-${browserRandomUUID()}`,now=new Date().toISOString(),z=input.viewport.zoom||1;
  return {id,projectKey:input.forceNewProject?`tree:${id}`:input.project||`tree:${id}`,title:input.title,prompt:input.prompt||"",content:"",status:"idle",
    canvasX:(input.x-input.viewport.x)/z-150,canvasY:(input.y-input.viewport.y)/z-88,createdAt:now,updatedAt:now,width:CANVAS_TEXT_DEFAULT_WIDTH,height:CANVAS_TEXT_DEFAULT_HEIGHT,
    sourceIds:[...new Set(input.sourceIds||[])].slice(0,5),targetIds:[],productIds:[]};
}
