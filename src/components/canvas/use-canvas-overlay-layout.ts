"use client";
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject} from "react";
import type {Node,ReactFlowInstance} from "@xyflow/react";
import {flowNodeSize} from "@/lib/canvas/node-geometry";
import {canvasAnchorViewport,canvasDockLayout,canvasImageTitleInset,canvasOverlayNodeScreen,canvasOverlaySafeArea,type CanvasOverlayViewport,type CanvasSize,type DockMetrics} from "@/lib/canvas/dock-layout";
import type {CanvasSelection} from "@/lib/canvas/selection";

type Input={flow:RefObject<ReactFlowInstance|null>;viewport:RefObject<CanvasOverlayViewport>;nodes:Node[];size:CanvasSize;
  selection:Pick<CanvasSelection,"selectedId"|"selectedPendId"|"selectedTextId">;contextMenuOpen:boolean;
  textComposerExpanded:boolean;mediaComposerExpanded?:boolean;protectImageNodeTitle?:boolean;compactImage?:boolean;readOnly:boolean;nodeTitleHeight:number;anchorTitleHeight:number;
  measurementKey:string;contextKey:string;syncZoom:(zoom:number)=>void};
const anchor=(input:Input)=>input.selection.selectedId??input.selection.selectedPendId??input.selection.selectedTextId;
const geometry=(input:Input)=>{const id=anchor(input),node=id?input.nodes.find(node=>node.id===id):undefined;return node?{...node.position,...flowNodeSize(node)}:undefined;};

const projectOverlay=(input:Input,viewport:CanvasOverlayViewport,metrics:DockMetrics)=>{
 const nodeScreen=canvasOverlayNodeScreen(geometry(input),viewport);
 return {nodeScreen,...canvasDockLayout({nodeScreen,canvasSize:input.size,dockMetrics:metrics,
  selectedTextId:input.selection.selectedTextId,textComposerExpanded:input.textComposerExpanded,mediaComposerExpanded:input.mediaComposerExpanded,readOnly:input.readOnly,
  nodeTitleHeight:input.protectImageNodeTitle?canvasImageTitleInset(viewport.zoom):input.nodeTitleHeight,protectNodeTitle:input.protectImageNodeTitle,compactImage:input.compactImage})};
};

/** One owner for overlay measurements, minimal anchor pan and live DOM layout.
 * It reads selected node geometry; it never writes documents/history/tasks. */
export function useCanvasOverlayLayout(input:Input){
 const latest=useRef(input);latest.current=input;
 const panelRef=useRef<HTMLDivElement|null>(null),textComposerDockRef=useRef<HTMLDivElement|null>(null);
 const nodeToolbarRef=useRef<HTMLDivElement|null>(null),nodeRenamePositionRef=useRef<HTMLDivElement|null>(null);
 const previousSize=useRef({width:0,height:0}),previousAnchor=useRef<string|null>(null);
 const [metrics,setMetrics]=useState({dockHeight:0,toolbarHeight:50,toolbarWidth:0,dockMinimumHeight:0,dockNaturalHeight:0}),liveMetrics=useRef(metrics);liveMetrics.current=metrics;
 const {selectedId,selectedPendId,selectedTextId}=input.selection,{size,nodes,contextMenuOpen,textComposerExpanded,readOnly}=input;
 const overlaySafeArea=useMemo(()=>canvasOverlaySafeArea(size),[size]);
 const {nodeScreen,dock:dockStyle,toolbar:topbarStyle}=projectOverlay(input,input.viewport.current,metrics);
 useEffect(()=>{
  if(contextMenuOpen)return;
  const id=anchor(input),previous=previousSize.current,oldAnchor=previousAnchor.current;previousSize.current=size;previousAnchor.current=id;
  if(!size.width||!size.height||Math.abs(previous.width-size.width)<1&&Math.abs(previous.height-size.height)<1&&oldAnchor===id)return;
  const instance=input.flow.current;if(!instance)return;
  const viewport=instance.getViewport();
  const next=canvasAnchorViewport({node:geometry(input),viewport,size,safeArea:overlaySafeArea,selectedText:!!selectedTextId,
    titleHeight:input.protectImageNodeTitle?canvasImageTitleInset(viewport.zoom):input.anchorTitleHeight,protectNodeTitle:input.protectImageNodeTitle,compactImage:input.compactImage,metrics});
  if(next)void instance.setViewport(next,{duration:180});
 },[size,overlaySafeArea,nodes,selectedId,selectedPendId,selectedTextId,contextMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps
 const docksReady=!!dockStyle&&!!topbarStyle;
 useLayoutEffect(()=>{
  if(!docksReady)return;
  const dock=selectedTextId?textComposerDockRef.current:panelRef.current,toolbar=nodeToolbarRef.current;if(!dock||!toolbar)return;
  const header=dock.querySelector<HTMLElement>('[data-composer-header]'),footer=dock.querySelector<HTMLElement>('[data-composer-footer]'),body=dock.querySelector<HTMLElement>('[data-composer-body]');
  const key=input.contextKey;let active=true;
  const measure=()=>{
   if(!active||latest.current.contextKey!==key||(latest.current.selection.selectedTextId?textComposerDockRef.current:panelRef.current)!==dock||nodeToolbarRef.current!==toolbar)return;
   setMetrics(previous=>{if(!active||latest.current.contextKey!==key)return previous;
    // Intrinsic body height, not the preceding clipped/expanded border box,
    // makes a collapse converge to the same slot for identical content.
    const bodyStyle=body?getComputedStyle(body):null;
    const naturalBody=body?Array.from(body.children).reduce((height,child)=>{const style=getComputedStyle(child);return height+(child as HTMLElement).offsetHeight+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);},(parseFloat(bodyStyle!.paddingTop)||0)+(parseFloat(bodyStyle!.paddingBottom)||0)):0;
    const next={dockHeight:dock.offsetHeight,toolbarHeight:toolbar.offsetHeight,toolbarWidth:toolbar.offsetWidth,dockMinimumHeight:(header?.offsetHeight||38)+(footer?.offsetHeight||90)+50,
      dockNaturalHeight:input.compactImage?Math.ceil((header?.offsetHeight||0)+(footer?.offsetHeight||0)+naturalBody+2):0};
    return previous.dockHeight===next.dockHeight&&previous.toolbarHeight===next.toolbarHeight&&previous.toolbarWidth===next.toolbarWidth&&previous.dockMinimumHeight===next.dockMinimumHeight&&previous.dockNaturalHeight===next.dockNaturalHeight?previous:next;});
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(dock);observer.observe(toolbar);if(header)observer.observe(header);if(footer)observer.observe(footer);if(input.compactImage&&body)for(const child of Array.from(body.children))observer.observe(child);
  return()=>{active=false;observer.disconnect();};
 },[docksReady,size.width,size.height,selectedId,selectedPendId,selectedTextId,input.measurementKey,input.contextKey,readOnly,textComposerExpanded,input.mediaComposerExpanded,input.compactImage]); // eslint-disable-line react-hooks/exhaustive-deps
 const updateLiveViewport=useCallback((viewport:CanvasOverlayViewport)=>{
  const value=latest.current;value.syncZoom(viewport.zoom);
  const {nodeScreen:screen,...result}=projectOverlay(value,viewport,liveMetrics.current);if(!screen)return;
  const text=value.selection.selectedTextId,dock=text?textComposerDockRef.current:panelRef.current;
  if(dock&&result.dock){if(!(value.textComposerExpanded&&text))dock.style.left=result.dock.left+"px";
   dock.style.top=result.dock.top+"px";if(value.compactImage)dock.style.width=result.dock.width+"px";dock.style.maxHeight=result.dock.maxHeight==null?"":result.dock.maxHeight+"px";
   if(!text)dock.style.height=result.dock.height==null?"":result.dock.height+"px";
   if(text)dock.style.minHeight=Math.min(218,result.dock.maxHeight??218)+"px";}
  if(nodeToolbarRef.current&&result.toolbar){nodeToolbarRef.current.style.left=result.toolbar.left+"px";nodeToolbarRef.current.style.top=result.toolbar.top+"px";}
  if(nodeRenamePositionRef.current){nodeRenamePositionRef.current.style.left=screen.cx+"px";nodeRenamePositionRef.current.style.top=Math.max(8,screen.top-40)+"px";}
 },[]);
 return {nodeScreen,dockStyle,topbarStyle,overlaySafeArea,panelRef,textComposerDockRef,nodeToolbarRef,nodeRenamePositionRef,updateLiveViewport};
}
