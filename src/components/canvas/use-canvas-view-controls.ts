"use client";
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from "react";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import {createCanvasViewNavigation} from "@/lib/canvas/view-navigation";
import type {ReactFlowInstance} from "@xyflow/react";
import {detectDesktopPlatform,zoomPercentInput,zoomPercentLabel,type CanvasPrimaryTool,type DesktopPlatform} from "@/lib/canvas/view-controls";

type Options={flow:RefObject<ReactFlowInstance|null>;area:RefObject<HTMLElement|null>;zoom:number;zoomLabel:string;desktopAppearance:boolean;enabled:boolean;contextKey:string;browsing:boolean;scope?:CanvasDocumentScope;onMarquee:()=>void;onNavigate?:()=>void};

export function useCanvasViewControls(options:Options){
  const latest=useRef(options);latest.current=options;
  const [nodeFocus,setNodeFocus]=useState<{id:string|null;revision:number}>({id:null,revision:0});
  function clearNodeFocus(){setNodeFocus(current=>current.id===null?current:{...current,id:null});latest.current.onNavigate?.();}
  const navigation=useRef<ReturnType<typeof createCanvasViewNavigation>|null>(null);
  if(!navigation.current)navigation.current=createCanvasViewNavigation({
    frame:run=>{const id=window.requestAnimationFrame(run);return()=>window.cancelAnimationFrame(id);},
    timer:run=>{const id=window.setTimeout(run,0);return()=>window.clearTimeout(id);},
    flow:()=>latest.current.flow.current,area:()=>latest.current.area.current,onIntent:clearNodeFocus,
  });
  const owner=navigation.current;owner.bind({scope:options.scope,contextKey:options.contextKey,browsing:options.browsing});
  const navigationRevision=owner.navigationRevision;
  // A view replacement must not re-run an old ID against a same-ID node in the
  // new view. Keep the request's revision rather than adopting the latest one.
  const currentNodeFocus=nodeFocus.revision===navigationRevision.current&&!options.browsing&&(!options.scope||options.scope.viewCurrent())?nodeFocus:{...nodeFocus,id:null};
  useEffect(()=>{owner.mount();return()=>owner.dispose();},[owner]);
  function cancelFocus(){owner.cancel();clearNodeFocus();}
  function focusNode(id:string){cancelFocus();setNodeFocus({id,revision:navigationRevision.current});}
  function completeNodeFocus(update:string|null|((id:string|null)=>string|null)){setNodeFocus(current=>{const id=typeof update==="function"?update(current.id):update;return id===current.id?current:{...current,id};});}
  const [tool,setTool]=useState<CanvasPrimaryTool>("move"),[showMinimap,setShowMinimap]=useState(false),[snapGrid,setSnapGrid]=useState(false);
  const [lightCanvas,setLightCanvas]=useState(true);
  // Server and first client render share the light default. Restore only this
  // canvas's local preference before paint; never mutate the site's theme.
  useLayoutEffect(()=>{try{setLightCanvas(options.desktopAppearance||localStorage.getItem("nv:canvas:bg")!=="dark");}catch{setLightCanvas(true);}},[options.desktopAppearance]);
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
  function applyZoom(){const percent=Number(zoomInput.replace(",","."));if(Number.isFinite(percent)&&percent>0)navigate(()=>latest.current.flow.current?.zoomTo(percent/100,{duration:200}));else setZoomInput(zoomPercentInput(liveZoom.current||1));}
  function syncZoom(zoom:number){liveZoom.current=zoom;const label=zoomPercentLabel(zoom);if(zoomLabelRef.current)zoomLabelRef.current.textContent=label;zoomButtonRef.current?.setAttribute("aria-label",`${latest.current.zoomLabel} ${label}`);if(zoomInputRef.current&&document.activeElement!==zoomInputRef.current)zoomInputRef.current.value=zoomPercentInput(zoom);}
  function navigate<T>(run:()=>T):T{cancelFocus();return run();}
  return {navigationRevision,cancelFocus,nodeFocus:currentNodeFocus,focusNode,completeNodeFocus,capture:owner.capture,tool,selectTool,showMinimap,toggleMinimap:()=>setShowMinimap(v=>!v),snapGrid,toggleSnap:()=>setSnapGrid(v=>!v),lightCanvas,toggleTheme,
    isMac:platform==="mac",modifierKey:platform==="mac"?"⌘":"Ctrl",zoomMenuOpen,zoomInput,zoomLabelRef,zoomButtonRef,zoomInputRef,closeZoom,toggleZoom,changeZoom,applyZoom,syncZoom,
    zoomIn:(duration=200)=>navigate(()=>latest.current.flow.current?.zoomIn({duration})),zoomOut:(duration=200)=>navigate(()=>latest.current.flow.current?.zoomOut({duration})),
    zoomTo:(zoom:number,duration=200)=>navigate(()=>latest.current.flow.current?.zoomTo(zoom,{duration})),fit:(duration=400)=>navigate(()=>latest.current.flow.current?.fitView({duration,padding:0.2,maxZoom:1}))};
}
export type CanvasViewControls=ReturnType<typeof useCanvasViewControls>;
