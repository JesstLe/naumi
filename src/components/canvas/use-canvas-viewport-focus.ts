"use client";
import {useEffect,useRef,type Dispatch,type RefObject,type SetStateAction} from "react";
import type {Node,ReactFlowInstance} from "@xyflow/react";
import {flowNodeSize} from "@/lib/canvas/node-geometry";
import {canvasFocusViewport} from "@/lib/canvas/upload-visibility";

type Options={id:string|null;enabled:boolean;flow:RefObject<ReactFlowInstance|null>;nodes:Node[];
  size:{width:number;height:number};insets:{top:number;right:number;bottom:number;left:number};minZoom:number;
  contextKey:string;requestRevision?:number;navigationRevision:RefObject<number>;onComplete:Dispatch<SetStateAction<string|null>>};

/** Deep links and explicit focus move only the view. A later manual navigation
 * owns the viewport, even while this effect still has queued animation frames. */
export function useCanvasViewportFocus(options:Options){
  const latest=useRef(options);latest.current=options;
  const {id,enabled,flow,nodes,size,insets,minZoom,contextKey,navigationRevision,requestRevision}=options;
  useEffect(()=>{
    if(!id||!enabled)return;
    const node=nodes.find(item=>item.id===id);if(!node)return;
    let cancelled=false,frame:number;const revision=navigationRevision.current;
    const current=()=>!cancelled&&revision===navigationRevision.current&&latest.current.contextKey===contextKey&&latest.current.id===id;
    frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
      if(!current())return;const instance=flow.current;if(!instance)return;
      const live=instance.getNode(id)??node,target=canvasFocusViewport({...live.position,...flowNodeSize(live)},size,insets,minZoom);
      if(!target)return;
      void instance.setViewport(target,{duration:280}).then(ok=>{if(ok&&current())latest.current.onComplete(value=>value===id?null:value);});
    });});
    return()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[id,enabled,flow,nodes,size,insets,minZoom,contextKey,navigationRevision,requestRevision]);
}
