"use client";
import {useLayoutEffect,useMemo,useRef} from "react";
import type {CanvasSceneActions} from "@/lib/canvas/scene-types";

/** Renderers dispatch commands by ID through stable delegates. Changing a
 * business closure never requires a synthetic node signature to refresh it. */
export function useCanvasSceneActions(actions:CanvasSceneActions):CanvasSceneActions{
  const current=useRef(actions);useLayoutEffect(()=>{current.current=actions;});
  return useMemo(()=>({
    dimensions:(...args)=>current.current.dimensions(...args),
    resize:(...args)=>current.current.resize(...args),
    ratioRepair:(...args)=>current.current.ratioRepair(...args),
    rename:(...args)=>current.current.rename(...args),
    videoProcess:(...args)=>current.current.videoProcess(...args),
    cutout:(...args)=>current.current.cutout(...args),
    generatePending:(...args)=>current.current.generatePending(...args),
    directorEdit:(...args)=>current.current.directorEdit?.(...args),
    characterEdit:(...args)=>current.current.characterEdit?.(...args),
    audioEdit:(...args)=>current.current.audioEdit?.(...args),
    timelineEdit:(...args)=>current.current.timelineEdit?.(...args),
    sceneEdit:(...args)=>current.current.sceneEdit?.(...args),
    videoEdit:(...args)=>current.current.videoEdit(...args),
    videoHistory:(...args)=>current.current.videoHistory(...args),
    videoCancel:(...args)=>current.current.videoCancel(...args),
    videoPrompt:(...args)=>current.current.videoPrompt(...args),
    videoResize:(...args)=>current.current.videoResize(...args),
    workflowFill:(...args)=>current.current.workflowFill(...args),
    workflowSelect:(...args)=>current.current.workflowSelect(...args),
  }),[]);
}
