"use client";
import {useEffect,useRef} from "react";
import {useNodesState,useEdgesState,type Node,type Edge} from "@xyflow/react";
import {reconcileCanvasNodes,reconcileCanvasEdges} from "@/lib/canvas/scene-reconciliation";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";

/** Controlled Flow state is an interaction projection, never another document.
 * Whole scene updates retain live drag/selection/measurement and unchanged refs. */
export function useCanvasScene(nodes:Node[],edges:Edge[],scope:CanvasDocumentScope){
  const [rfNodes,setRfNodes,onNodesChange]=useNodesState<Node>([]);
  const [rfEdges,setRfEdges,onEdgesChange]=useEdgesState<Edge>([]);
  const previousScope=useRef(scope);
  const held=useRef(new Map<string,{scope:CanvasDocumentScope;point:{x:number;y:number}}>());
  useEffect(()=>{
    const changed=previousScope.current!==scope;previousScope.current=scope;
    if(changed)for(const [id,hold]of held.current)if(!hold.scope.viewCurrent())held.current.delete(id);
    const projected=nodes.map(node=>{const hold=held.current.get(node.id);return hold?.scope.viewCurrent()?{...node,position:hold.point}:node;});
    setRfNodes(current=>reconcileCanvasNodes(changed?[]:current,projected));
    setRfEdges(current=>reconcileCanvasEdges(changed?[]:current,edges));
  },[nodes,edges,scope,setRfNodes,setRfEdges]);
  // Pending position writes are view-only overlays; the documents still change
  // only after history commit. A late acknowledgement can't clear a newer drag.
  const holdPositions=(points:Map<string,{x:number;y:number}>,captured:CanvasDocumentScope)=>{
    const tokens=new Map(Array.from(points,([id,point])=>[id,{scope:captured,point}]));
    for(const [id,token]of tokens)held.current.set(id,token);
    return ()=>{for(const [id,token]of tokens)if(held.current.get(id)===token)held.current.delete(id);};
  };
  return {rfNodes,setRfNodes,onNodesChange,rfEdges,setRfEdges,onEdgesChange,holdPositions};
}
