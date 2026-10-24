export type CanvasTextNode = {
  id:string;projectKey:string;title:string;prompt:string;content:string;
  status:"idle"|"generating"|"completed"|"failed";canvasX:number;canvasY:number;
  createdAt:string;updatedAt:string;width:number;height:number;
  sourceIds:string[];targetIds:string[];productIds?:string[];
};
export const CANVAS_TEXT_DEFAULT_WIDTH=380;
export const CANVAS_TEXT_DEFAULT_HEIGHT=240;
export type TextDocumentCache = {version:2;nodes:CanvasTextNode[];drafts:CanvasTextNode[]};

export const textDocumentKey = (actor:string,owner:string,workspace:string) =>
  `naumi:canvas-text:v2:${JSON.stringify([actor.toLowerCase(),owner.toLowerCase(),workspace])}`;

export function normalizeTextNodes(value:unknown):CanvasTextNode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((node):node is CanvasTextNode => !!node && typeof node.id === "string" && typeof node.projectKey === "string")
    .map(node=>({...node,title:String(node.title||""),content:String(node.content||""),prompt:String(node.prompt||""),
      width:Number.isFinite(node.width)&&node.width>0?node.width:CANVAS_TEXT_DEFAULT_WIDTH,height:Number.isFinite(node.height)&&node.height>0?node.height:CANVAS_TEXT_DEFAULT_HEIGHT,
      sourceIds:Array.isArray(node.sourceIds)?node.sourceIds:[],targetIds:Array.isArray(node.targetIds)?node.targetIds:[],productIds:Array.isArray(node.productIds)?node.productIds:[]}));
}
export function textCache(nodes:CanvasTextNode[],drafts:CanvasTextNode[]):TextDocumentCache {
  const stopped=(items:CanvasTextNode[])=>items.map(node=>node.status==="generating"?{...node,status:"idle" as const}:node);
  return {version:2,nodes:stopped(nodes),drafts:stopped(drafts)};
}
export function mergeTextDrafts(nodes:CanvasTextNode[],drafts:Iterable<CanvasTextNode>) {
  const merged=new Map(nodes.map(node=>[node.id,node]));for(const draft of drafts)merged.set(draft.id,draft);return Array.from(merged.values());
}
export function sameText(a:CanvasTextNode|undefined,b:CanvasTextNode|undefined) {
  if(!a||!b)return a===b;
  return Object.keys({...a,...b}).filter(key=>key!=="updatedAt").every(key=>JSON.stringify(a[key as keyof CanvasTextNode])===JSON.stringify(b[key as keyof CanvasTextNode]));
}
/** Keep only edits made AFTER a history boundary, not an old whole-node snapshot. */
export function rebaseText(projected:CanvasTextNode,before:CanvasTextNode|undefined,after:CanvasTextNode) {
  if(!before)return after;
  const result={...projected};
  for(const key of Object.keys(after) as Array<keyof CanvasTextNode>) {
    if(JSON.stringify(before[key])!==JSON.stringify(after[key]))Object.assign(result,{[key]:after[key]});
  }
  return result;
}
