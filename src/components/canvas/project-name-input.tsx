"use client";
import type {CanvasProjectCatalog} from "./use-canvas-project-catalog";

/** One Enter/Escape/blur contract for the browser card and editor title. */
export function CanvasProjectNameInput({projectKey,names,className,placeholder}:{projectKey:string;names:CanvasProjectCatalog;className:string;placeholder?:string}){
  return <input autoFocus value={names.edit?.key===projectKey?names.edit.value:""}
    onChange={event=>names.change(event.target.value)} onFocus={event=>event.currentTarget.select()}
    onClick={event=>event.stopPropagation()}
    onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();if(event.key==="Escape")names.cancel();}}
    onBlur={()=>void names.commit(projectKey)} maxLength={60} placeholder={placeholder} className={className}/>;
}
