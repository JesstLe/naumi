export type CanvasSelectedEdge={id:string;source:string;target:string};
export type CanvasSelection={selectedId:string|null;selectedTextId:string|null;selectedPendId:string|null;selectedEdge:CanvasSelectedEdge|null;multiSel:string[]};
export const EMPTY_CANVAS_SELECTION:CanvasSelection={selectedId:null,selectedTextId:null,selectedPendId:null,selectedEdge:null,multiSel:[]};
const focus={selectedId:null,selectedTextId:null,selectedPendId:null};
const equalIds=(a:string[],b:string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
export function patchCanvasSelection(state:CanvasSelection,patch:Partial<CanvasSelection>):CanvasSelection{
  const next={...state,...patch};
  if(equalIds(next.multiSel,state.multiSel))next.multiSel=state.multiSel;
  if(next.selectedEdge?.id===state.selectedEdge?.id&&next.selectedEdge?.source===state.selectedEdge?.source&&next.selectedEdge?.target===state.selectedEdge?.target)next.selectedEdge=state.selectedEdge;
  return (Object.keys(next) as Array<keyof CanvasSelection>).every(key=>next[key]===state[key])?state:next;
}
export function canvasNodeClick(id:string,modified:boolean,group:string[]=[]):Partial<CanvasSelection>{
  if(id.startsWith("pend-"))return {...focus,selectedPendId:id,selectedEdge:null};
  if(id.startsWith("text-"))return {...focus,selectedTextId:id,selectedEdge:null};
  if(modified)return {...focus,selectedEdge:null};
  return group.length>1?{...focus,selectedEdge:null,multiSel:group}:{...focus,selectedEdge:null,selectedId:id};
}
export function canvasFlowSelection(state:CanvasSelection,nodes:Array<{id:string;type?:string}>,edges:CanvasSelectedEdge[]):CanvasSelection{
  const ids=nodes.filter(node=>node.type!=="workflowGroup").map(node=>node.id).sort(),first=edges[0],edge=first?{id:first.id,source:first.source,target:first.target}:null;
  const current=[...state.multiSel].sort();
  return patchCanvasSelection(state,{...(edge&&!ids.length?focus:{}),multiSel:equalIds(current,ids)?state.multiSel:ids,selectedEdge:edge});
}
export function canvasSelectionIds(ids:string[],kinds:ReadonlyMap<string,"art"|"text"|"video"|"director"|"character"|"scene"|"audio">):Partial<CanvasSelection>{
  const valid=[...new Set(ids.filter(id=>kinds.has(id)))],one=valid.length===1?valid[0]:null;
  return {...focus,selectedEdge:null,multiSel:valid,selectedTextId:one&&kinds.get(one)==="text"?one:null,selectedId:one&&kinds.get(one)!=="text"?one:null};
}
