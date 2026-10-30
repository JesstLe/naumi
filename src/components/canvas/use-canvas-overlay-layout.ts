"use client";
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject} from "react";
import type {Node,ReactFlowInstance} from "@xyflow/react";
import {flowNodeSize} from "@/lib/canvas/node-geometry";
import {canvasAnchorViewport,canvasDockLayout,canvasOverlayNodeScreen,canvasOverlaySafeArea,type CanvasOverlayViewport,type CanvasSize,type DockMetrics} from "@/lib/canvas/dock-layout";
import type {CanvasSelection} from "@/lib/canvas/selection";

type Input={flow:RefObject<ReactFlowInstance|null>;viewport:RefObject<CanvasOverlayViewport>;nodes:Node[];size:CanvasSize;
  selection:Pick<CanvasSelection,"selectedId"|"selectedPendId"|"selectedTextId">;contextMenuOpen:boolean;
  textComposerExpanded:boolean;readOnly:boolean;nodeTitleHeight:number;anchorTitleHeight:number;
  measurementKey:string;contextKey:string;syncZoom:(zoom:number)=>void};
const anchor=(input:Input)=>input.selection.selectedId??input.selection.selectedPendId??input.selection.selectedTextId;
const geometry=(input:Input)=>{const id=anchor(input),node=id?input.nodes.find(node=>node.id===id):undefined;return node?{...node.position,...flowNodeSize(node)}:undefined;};

const projectOverlay=(input:Input,viewport:CanvasOverlayViewport,metrics:DockMetrics)=>{
 const nodeScreen=canvasOverlayNodeScreen(geometry(input),viewport);
 return {nodeScreen,...canvasDockLayout({nodeScreen,canvasSize:input.size,dockMetrics:metrics,
  selectedTextId:input.selection.selectedTextId,textComposerExpanded:input.textComposerExpanded,readOnly:input.readOnly,nodeTitleHeight:input.nodeTitleHeight})};
};

/** One owner for overlay measurements, minimal anchor pan and live DOM layout.
 * It reads selected node geometry; it never writes documents/history/tasks. */
export function useCanvasOverlayLayout(input:Input){
 const latest=useRef(input);latest.current=input;
 const panelRef=useRef<HTMLDivElement|null>(null),textComposerDockRef=useRef<HTMLDivElement|null>(null);
 const nodeToolbarRef=useRef<HTMLDivElement|null>(null),nodeRenamePositionRef=useRef<HTMLDivElement|null>(null);
 const previousSize=useRef({width:0,height:0}),previousAnchor=useRef<string|null>(null);
 const [metrics,setMetrics]=useState({dockHeight:0,toolbarHeight:50,toolbarWidth:0}),liveMetrics=useRef(metrics);liveMetrics.current=metrics;
 const {selectedId,selectedPendId,selectedTextId}=input.selection,{size,nodes,contextMenuOpen,textComposerExpanded,readOnly}=input;
 const overlaySafeArea=useMemo(()=>canvasOverlaySafeArea(size),[size]);
 const {nodeScreen,dock:dockStyle,toolbar:topbarStyle}=projectOverlay(input,input.viewport.current,metrics);
 useEffect(()=>{
  if(contextMenuOpen)return;
  const id=anchor(input),previous=previousSize.current,oldAnchor=previousAnchor.current;previousSize.current=size;previousAnchor.current=id;
  if(!size.width||!size.height||Math.abs(previous.width-size.width)<1&&Math.abs(previous.height-size.height)<1&&oldAnchor===id)return;
  const instance=input.flow.current;if(!instance)return;
  const next=canvasAnchorViewport({node:geometry(input),viewport:instance.getViewport(),size,safeArea:overlaySafeArea,selectedText:!!selectedTextId,titleHeight:input.anchorTitleHeight});
  if(next)void instance.setViewport(next,{duration:180});
 },[size,overlaySafeArea,nodes,selectedId,selectedPendId,selectedTextId,contextMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps
 const docksReady=!!dockStyle&&!!topbarStyle;
 useLayoutEffect(()=>{
  if(!docksReady)return;
  const dock=selectedTextId?textComposerDockRef.current:panelRef.current,toolbar=nodeToolbarRef.current;if(!dock||!toolbar)return;
  const key=input.contextKey;let active=true;
  const measure=()=>{
   if(!active||latest.current.contextKey!==key||(latest.current.selection.selectedTextId?textComposerDockRef.current:panelRef.current)!==dock||nodeToolbarRef.current!==toolbar)return;
   setMetrics(previous=>{if(!active||latest.current.contextKey!==key)return previous;const next={dockHeight:dock.offsetHeight,toolbarHeight:toolbar.offsetHeight,toolbarWidth:toolbar.offsetWidth};
    return previous.dockHeight===next.dockHeight&&previous.toolbarHeight===next.toolbarHeight&&previous.toolbarWidth===next.toolbarWidth?previous:next;});
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(dock);observer.observe(toolbar);
  return()=>{active=false;observer.disconnect();};
 },[docksReady,size.width,size.height,selectedId,selectedPendId,selectedTextId,input.measurementKey,input.contextKey,readOnly,textComposerExpanded]); // eslint-disable-line react-hooks/exhaustive-deps
 const updateLiveViewport=useCallback((viewport:CanvasOverlayViewport)=>{
  const value=latest.current;value.syncZoom(viewport.zoom);
  const {nodeScreen:screen,...result}=projectOverlay(value,viewport,liveMetrics.current);if(!screen)return;
  const text=value.selection.selectedTextId,dock=text?textComposerDockRef.current:panelRef.current;
  if(dock&&result.dock){if(!(value.textComposerExpanded&&text))dock.style.left=result.dock.left+"px";
   dock.style.top=result.dock.top+"px";dock.style.maxHeight=result.dock.maxHeight==null?"":result.dock.maxHeight+"px";
   if(text)dock.style.minHeight=Math.min(218,result.dock.maxHeight??218)+"px";}
  if(nodeToolbarRef.current&&result.toolbar){nodeToolbarRef.current.style.left=result.toolbar.left+"px";nodeToolbarRef.current.style.top=result.toolbar.top+"px";}
  if(nodeRenamePositionRef.current){nodeRenamePositionRef.current.style.left=screen.cx+"px";nodeRenamePositionRef.current.style.top=Math.max(8,screen.top-40)+"px";}
 },[]);
 return {nodeScreen,dockStyle,topbarStyle,overlaySafeArea,panelRef,textComposerDockRef,nodeToolbarRef,nodeRenamePositionRef,updateLiveViewport};
}
