"use client";
import {useEffect,useRef} from "react";
import {canvasKeyboardCommand,type CanvasKeyboardAction,type CanvasKeyboardState} from "@/lib/canvas/keyboard-command";
import {CANVAS_MODAL_SELECTOR,isEditableClipboardTarget} from "@/lib/canvas/input-target";

/** Exactly one captured listener; every event reads current selection/permissions
 * and current command adapters, rather than a partially declared effect closure. */
export function useCanvasKeyboard({state,perform}:{state:()=>CanvasKeyboardState;perform:(action:CanvasKeyboardAction)=>void}){
  const latest=useRef({state,perform});latest.current={state,perform};
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target instanceof Element?event.target:document.activeElement;
      const current=latest.current.state();
      const decision=canvasKeyboardCommand({...current,key:event.key,code:event.code,mod:event.metaKey||event.ctrlKey,alt:event.altKey,shift:event.shiftKey,
        repeat:event.repeat,composing:event.isComposing,defaultPrevented:event.defaultPrevented,tag:target?.tagName||"",editable:isEditableClipboardTarget(target),
        blocked:current.blocked||!!target?.closest('[data-canvas-hotkeys-blocked="true"], [data-canvas-hotkeys-scope="assistant"]')||!!document.querySelector(CANVAS_MODAL_SELECTOR)});
      if(decision.prevent)event.preventDefault();
      if(decision.action)latest.current.perform(decision.action);
    };
    window.addEventListener("keydown",onKey,true);
    return()=>window.removeEventListener("keydown",onKey,true);
  },[]);
}
