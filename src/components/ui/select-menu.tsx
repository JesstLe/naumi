"use client";

import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {Check,ChevronDown} from "lucide-react";
import {cn} from "@/lib/utils";
import {qualityMenuPosition,nextQualityOption} from "./image-quality-select-layout";
import {useSurfaceAppearance,surfaceAppearanceClass} from "./surface-appearance";

type Option={value:string;label:ReactNode;buttonLabel?:ReactNode;disabled?:boolean};
/** Shared popover; scoped Canvas surfaces carry their theme through the portal. Keep focus on its combobox; active option is announced by aria-activedescendant. */
export function SelectMenu({value,options,onChange,disabled,className,size="md",label,id,popoverClassName}:{
 value:string;options:Option[];onChange:(value:string)=>void;disabled?:boolean;className?:string;size?:"sm"|"md";label?:string;id?:string;popoverClassName?:string;
}){
 const appearance=useSurfaceAppearance();
 const portalClasses=appearance?popoverClassName?.split(/\s+/).filter(token=>!["canvas-ui-light","canvas-ui-dark","tool-popover"].includes(token)).join(" "):popoverClassName;
 const generated=useId(),listId=`${generated}-list`,button=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [menu,setMenu]=useState<ReturnType<typeof qualityMenuPosition>|null>(null),[active,setActive]=useState(-1);
 const [lightTool,setLightTool]=useState(false);
 const search=useRef({text:"",time:0});
 const open=menu!==null&&!disabled,current=options.find(o=>o.value===value);
 const close=()=>setMenu(null);
 function show(direction:1|-1=1){
  if(disabled||!button.current||!options.length)return;
  setLightTool(!!button.current.closest('.tool-page'));
  setMenu(qualityMenuPosition(button.current.getBoundingClientRect(),innerWidth,innerHeight,options.length));
  const selected=options.findIndex(o=>o.value===value&&!o.disabled);
  setActive(selected>=0?selected:nextQualityOption(options,direction===1?-1:0,direction));
 }
 function pick(index:number){const option=options[index];if(!option||option.disabled||disabled)return;onChange(option.value);close();button.current?.focus({preventScroll:true});}
 useEffect(()=>{if(!open)return;const scroll=(event:Event)=>{if(event.target instanceof Node&&panel.current?.contains(event.target))return;const rect=button.current?.getBoundingClientRect();if(!rect||rect.bottom<=0||rect.top>=innerHeight){close();return;}setMenu(qualityMenuPosition(rect,innerWidth,innerHeight,options.length));};const resize=()=>close();window.addEventListener("scroll",scroll,true);window.addEventListener("resize",resize);return()=>{window.removeEventListener("scroll",scroll,true);window.removeEventListener("resize",resize);};},[open,options.length]);
 useEffect(()=>{
  const list=panel.current,item=list?.children[active] as HTMLElement|undefined;
  if(!open||!list||!item)return;
  if(item.offsetTop<list.scrollTop)list.scrollTop=item.offsetTop;
  else if(item.offsetTop+item.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=item.offsetTop+item.offsetHeight-list.clientHeight;
 },[open,active]);
 useEffect(()=>{if(disabled||!options.length)setMenu(null);},[disabled,options.length]);
 return <>
  <button ref={button} id={id} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
   aria-controls={open?listId:undefined} aria-activedescendant={open&&active>=0?`${listId}-${active}`:undefined}
   data-testid="select-menu" disabled={disabled||!options.length} onClick={()=>open?close():show()} onBlur={close}
   onKeyDown={event=>{
    if(["ArrowDown","ArrowUp","Home","End","Enter"," ","Escape"].includes(event.key)){
     event.preventDefault();event.stopPropagation();if(event.key==="Escape"){close();return;}
     if(!open){show(event.key==="ArrowUp"||event.key==="End"?-1:1);return;}
     if(event.key==="Enter"||event.key===" "){pick(active);return;}
     const direction=event.key==="ArrowUp"||event.key==="End"?-1:1;
     setActive(nextQualityOption(options,event.key==="Home"?-1:event.key==="End"?0:active,direction));
    }else if(event.key==="Tab"){close();}else if(open&&event.key.length===1&&!event.ctrlKey&&!event.metaKey){
     const now=Date.now();search.current={text:now-search.current.time<700?search.current.text+event.key:event.key,time:now};
     const text=search.current.text.toLowerCase();const index=options.findIndex((o,i)=>!o.disabled&&panel.current?.children[i]?.textContent?.trim().toLowerCase().startsWith(text));if(index>=0)setActive(index);
    }
   }}
   className={cn("flex min-w-0 items-center justify-between gap-2 rounded-[10px] border border-c-border2 bg-c-card text-left font-medium text-c-text transition-colors hover:border-acc/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-acc/15 disabled:cursor-not-allowed disabled:opacity-50",size==="sm"?"h-8 px-2.5 text-xs":"h-[42px] px-3 text-[13.5px]",open&&"border-acc ring-[3px] ring-acc/15",surfaceAppearanceClass(appearance),appearance&&"canvas-ui-control",className)}>
   <span className="min-w-0 truncate">{current?.buttonLabel??current?.label??value}</span><ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-c-text3 transition-transform",open&&"rotate-180")}/>
  </button>
  {open&&menu&&createPortal(<div className={cn("fixed inset-0 z-[300]",!appearance&&lightTool&&"tool-popover",portalClasses,surfaceAppearanceClass(appearance))} onPointerDown={event=>{event.stopPropagation();close();}}>
   <div ref={panel} id={listId} role="listbox" aria-label={label} style={menu} onPointerDown={event=>{event.preventDefault();event.stopPropagation();}}
    className={cn("fixed overflow-y-auto overscroll-contain rounded-xl border border-c-border2 bg-c-card p-1 text-c-text shadow-pop",appearance&&"canvas-ui-surface canvas-ui-surface-solid")}>
    {options.map((o,index)=><div key={o.value} id={`${listId}-${index}`} role="option" aria-selected={o.value===value} aria-disabled={!!o.disabled}
     onPointerMove={()=>{if(!o.disabled)setActive(index);}} onClick={()=>pick(index)}
     className={cn("flex min-h-9 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px]",o.disabled?"cursor-not-allowed opacity-40":"cursor-pointer",index===active&&!o.disabled&&"bg-c-subtle2",appearance&&(index===active&&!o.disabled?"canvas-ui-control":"canvas-ui-action"),o.value===value&&"font-semibold")}>
     <span className="min-w-0 break-words">{o.label}</span><Check className={cn("h-3.5 w-3.5 shrink-0 text-acc",o.value===value?"opacity-100":"opacity-0")}/>
    </div>)}
   </div>
  </div>,document.body)}
 </>;
}
