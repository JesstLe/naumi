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
  useEffect(()=>{
    const changed=previousScope.current!==scope;previousScope.current=scope;
    setRfNodes(current=>reconcileCanvasNodes(changed?[]:current,nodes));
    setRfEdges(current=>reconcileCanvasEdges(changed?[]:current,edges));
  },[nodes,edges,scope,setRfNodes,setRfEdges]);
  return {rfNodes,setRfNodes,onNodesChange,rfEdges,setRfEdges,onEdgesChange};
}
