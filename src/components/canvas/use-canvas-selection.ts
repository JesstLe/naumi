"use client";
import {useMemo,useState,type SetStateAction} from "react";
import {EMPTY_CANVAS_SELECTION,patchCanvasSelection,type CanvasSelection} from "@/lib/canvas/selection";

/** One selection snapshot; compatibility setters route all existing callers to
 * the same reducer. Flow and explicit commands no longer own separate copies. */
export function useCanvasSelection(){
  const [state,set]=useState<CanvasSelection>(EMPTY_CANVAS_SELECTION);
  const actions=useMemo(()=>{
    const field=<K extends keyof CanvasSelection>(key:K)=>(value:SetStateAction<CanvasSelection[K]>)=>set(previous=>patchCanvasSelection(previous,{[key]:typeof value==="function"?(value as (v:CanvasSelection[K])=>CanvasSelection[K])(previous[key]):value}));
    return {setSelectedId:field("selectedId"),setSelectedTextId:field("selectedTextId"),setSelectedPendId:field("selectedPendId"),setSelectedEdge:field("selectedEdge"),setMultiSel:field("multiSel"),
      patch:(value:Partial<CanvasSelection>)=>set(previous=>patchCanvasSelection(previous,value)),update:(fn:(state:CanvasSelection)=>CanvasSelection)=>set(fn)};
  },[]);
  return {...state,...actions};
}
