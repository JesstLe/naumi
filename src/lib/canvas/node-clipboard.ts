export const CANVAS_NODE_CLIPBOARD_TYPE = "application/x-naumi-canvas-node";
export type CanvasClipboardSelection={marker:string;ids:string[];owner:string;workspace?:string};
export type CanvasClipboardData=Pick<DataTransfer,"getData"|"setData">;

export function canvasNodeIdFromClipboard(data:Pick<DataTransfer,"getData">):string|null{
  const direct=data.getData(CANVAS_NODE_CLIPBOARD_TYPE).trim();
  if(direct)return direct;
  const matched=data.getData("text/html").match(/data-naumi-canvas-node="([^"]+)"/i);
  if(!matched?.[1])return null;
  try{return decodeURIComponent(matched[1]);}catch{return null;}
}
export function escapeClipboardHtml(value:string):string{
  return value.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
export function canvasNodeClipboardHtml(nodeId:string,title:string){
  return `<span data-naumi-canvas-node="${encodeURIComponent(nodeId)}">${escapeClipboardHtml(title)}</span>`;
}
export function setCanvasNodeClipboardData(data:Pick<DataTransfer,"setData">,nodeId:string,title:string){
  try{data.setData(CANVAS_NODE_CLIPBOARD_TYPE,nodeId);}catch{/* HTML remains portable when custom MIME is unsupported. */}
  data.setData("text/plain",title);data.setData("text/html",canvasNodeClipboardHtml(nodeId,title));
}
/** Keep the established personal key and legacy personal payload. Tenant clips
 * use the same record with an explicit workspace, never another workspace's IDs. */
export function canvasClipboardStorageKey(owner:string,workspace:string){
  const base=`naumi:canvas-node-clipboard:${owner.toLowerCase()}`;
  return workspace==="personal"?base:`${base}:${encodeURIComponent(workspace)}`;
}
export function canvasClipboardSelection(value:unknown,owner:string,workspace:string,marker?:string):CanvasClipboardSelection|null{
  if(!value||typeof value!=="object")return null;
  const clip=value as CanvasClipboardSelection;
  return clip.owner===owner.toLowerCase()&&(clip.workspace??"personal")===workspace&&typeof clip.marker==="string"&&
    Array.isArray(clip.ids)&&clip.ids.length>0&&clip.ids.length<=200&&clip.ids.every(id=>typeof id==="string")&&(!marker||clip.marker===marker)?clip:null;
}
