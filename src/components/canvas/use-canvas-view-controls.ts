"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import type {ReactFlowInstance} from "@xyflow/react";
import {detectDesktopPlatform,zoomPercentInput,zoomPercentLabel,type CanvasPrimaryTool,type DesktopPlatform} from "@/lib/canvas/view-controls";

type Options={flow:RefObject<ReactFlowInstance|null>;area:RefObject<HTMLElement|null>;zoom:number;zoomLabel:string;desktopAppearance:boolean;enabled:boolean;contextKey:string;browsing:boolean;onMarquee:()=>void};

export function useCanvasViewControls(options:Options){
  const latest=useRef(options);latest.current=options;
  const [tool,setTool]=useState<CanvasPrimaryTool>("move"),[showMinimap,setShowMinimap]=useState(false),[snapGrid,setSnapGrid]=useState(false);
  const [lightCanvas,setLightCanvas]=useState(()=>{if(options.desktopAppearance)return true;try{return typeof window==="undefined"||localStorage.getItem("nv:canvas:bg")!=="dark";}catch{return true;}});
  const [platform,setPlatform]=useState<DesktopPlatform>("other");useEffect(()=>setPlatform(detectDesktopPlatform()),[]);
  const [zoomMenuOpen,setZoomMenuOpen]=useState(false),[zoomInput,setZoomInput]=useState("100");
  const zoomLabelRef=useRef<HTMLSpanElement>(null),zoomButtonRef=useRef<HTMLButtonElement>(null),zoomInputRef=useRef<HTMLInputElement>(null),liveZoom=useRef(options.zoom);
  useEffect(()=>{liveZoom.current=options.zoom;if(document.activeElement!==zoomInputRef.current)setZoomInput(zoomPercentInput(options.zoom||1));},[options.zoom]);
  useEffect(()=>{setZoomMenuOpen(false);},[options.contextKey,options.browsing]);
  useEffect(()=>{
    if(!options.enabled)return;const element=options.area.current;if(!element)return;
    const wheel=(event:WheelEvent)=>{if(event.ctrlKey||event.metaKey)event.preventDefault();};
    element.addEventListener("wheel",wheel,{passive:false});return()=>element.removeEventListener("wheel",wheel);
  },[options.area,options.enabled,options.browsing]);
  function selectTool(next:CanvasPrimaryTool){setTool(next);if(next==="marquee")latest.current.onMarquee();}
  function toggleTheme(){setLightCanvas(value=>{const next=!value;try{localStorage.setItem("nv:canvas:bg",next?"light":"dark");}catch{/* Local preference is best effort. */}return next;});}
  function closeZoom(){setZoomMenuOpen(false);setZoomInput(zoomPercentInput(liveZoom.current||1));}
  function toggleZoom(){if(zoomMenuOpen)closeZoom();else{setZoomInput(zoomPercentInput(liveZoom.current||1));setZoomMenuOpen(true);}}
  function changeZoom(value:string){const next=value.replace(",",".");if(/^\d*(?:\.\d*)?(?:e[+-]?\d*)?$/i.test(next))setZoomInput(next);}
  function applyZoom(){const percent=Number(zoomInput.replace(",","."));if(Number.isFinite(percent)&&percent>0)latest.current.flow.current?.zoomTo(percent/100,{duration:200});else setZoomInput(zoomPercentInput(liveZoom.current||1));}
  function syncZoom(zoom:number){liveZoom.current=zoom;const label=zoomPercentLabel(zoom);if(zoomLabelRef.current)zoomLabelRef.current.textContent=label;zoomButtonRef.current?.setAttribute("aria-label",`${latest.current.zoomLabel} ${label}`);if(zoomInputRef.current&&document.activeElement!==zoomInputRef.current)zoomInputRef.current.value=zoomPercentInput(zoom);}
  return {tool,selectTool,showMinimap,toggleMinimap:()=>setShowMinimap(v=>!v),snapGrid,toggleSnap:()=>setSnapGrid(v=>!v),lightCanvas,toggleTheme,
    isMac:platform==="mac",modifierKey:platform==="mac"?"⌘":"Ctrl",zoomMenuOpen,zoomInput,zoomLabelRef,zoomButtonRef,zoomInputRef,closeZoom,toggleZoom,changeZoom,applyZoom,syncZoom,
    zoomIn:(duration=200)=>latest.current.flow.current?.zoomIn({duration}),zoomOut:(duration=200)=>latest.current.flow.current?.zoomOut({duration}),
    zoomTo:(zoom:number,duration=200)=>latest.current.flow.current?.zoomTo(zoom,{duration}),fit:(duration=400)=>latest.current.flow.current?.fitView({duration,padding:0.2,maxZoom:1})};
}
export type CanvasViewControls=ReturnType<typeof useCanvasViewControls>;
