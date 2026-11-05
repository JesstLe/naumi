import type {Node,Edge} from "@xyflow/react";
import {canvasNodePosition} from "./stable-placement";
import {knownCanvasNodeMeasurement} from "./node-measurement";

/** Compare the complete render value, not a handwritten subset of field names.
 * Scene data are plain DTOs; functions keep identity (stable action delegates,
 * or a new retained-task retry). No JSON serialization or property truncation. */
export function equalSceneValue(a:unknown,b:unknown):boolean{
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=="object"||typeof b!=="object")return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equalSceneValue(v,b[i]));
  if(Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;
  const left=Object.keys(a),right=Object.keys(b);
  return left.length===right.length&&left.every(key=>Object.hasOwn(b,key)&&equalSceneValue((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}

/** Projection owns business data; React Flow owns live selection, drag and
 * measurements. Preserve unchanged node/array identities to avoid feedback loops. */
export function reconcileCanvasNodes(current:Node[],projected:Node[]):Node[]{
  const byId=new Map(current.map(node=>[node.id,node]));let changed=current.length!==projected.length;
  const next=projected.map((node,index)=>{
    const live=byId.get(node.id),sameBox=live&&equalSceneValue(live.style,node.style),merged={...node,...canvasNodePosition(node,live),
      ...(sameBox&&live.width!==undefined?{width:live.width}:{}),...(sameBox&&live.height!==undefined?{height:live.height}:{}),
      ...(live?.resizing?{position:live.position,width:live.width,height:live.height,style:live.style,resizing:true}:{}),selected:live?.selected??false,
      measured:live?.measured??knownCanvasNodeMeasurement(node.style)};
    if(live&&equalSceneValue(live,merged)){if(current[index]!==live)changed=true;return live;}
    changed=true;return merged;
  });
  return changed?next:current;
}
export function reconcileCanvasEdges(current:Edge[],projected:Edge[]):Edge[]{
  const byId=new Map(current.map(edge=>[edge.id,edge]));let changed=current.length!==projected.length;
  const next=projected.map((edge,index)=>{
    const live=byId.get(edge.id),merged={...edge,selected:edge.selectable!==false&&!!live?.selected};
    if(live&&equalSceneValue(live,merged)){if(current[index]!==live)changed=true;return live;}
    changed=true;return merged;
  });
  return changed?next:current;
}
