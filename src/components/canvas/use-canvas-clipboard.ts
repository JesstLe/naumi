"use client";
import {useEffect,useRef,useState} from "react";
import type {Artwork} from "@/lib/mock-data";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {clipboardImageFiles} from "@/lib/canvas/clipboard-files";
import {CANVAS_MODAL_SELECTOR,isEditableClipboardTarget} from "@/lib/canvas/input-target";
import {canvasClipboardSelection,canvasClipboardStorageKey,canvasNodeIdFromClipboard,setCanvasNodeClipboardData,type CanvasClipboardSelection} from "@/lib/canvas/node-clipboard";
import {copyCanvasImage,writeCanvasNodeClipboard} from "@/lib/canvas/clipboard-browser";

type Point={x:number;y:number};
type Options={
  owner?:string;account:string;workspace:string;current:()=>boolean;imageLabel:string;selectionLabel:string;
  state:()=>{ready:boolean;readOnly:boolean;browsing:boolean;loading:boolean;blocked:boolean;selected:Artwork|null;selectedId:string|null;selectedTextId:string|null;multiSel:string[]};
  contains:(id:string)=>boolean;isVideo:(id:string)=>boolean;center:()=>Point;hasCanvas:()=>boolean;
  duplicateArtwork:(node:Artwork)=>Promise<void>;duplicateNodes:(ids:string[])=>Promise<void>;
  workflow:(html:string,point:Point)=>boolean;images:(files:File[],point:Point)=>void;copied:()=>void;imageCopied:()=>void;
};
type Session={key:string;owner:string;workspace:string;storageKey:string;artwork:Artwork|null;selection:CanvasClipboardSelection|null;intent:string|null;revision:number};

/** A clipboard session owns only selection identity, native event ownership and
 * transport lifetime. The existing node/history and image/workflow import owners
 * receive every actual mutation through the supplied ports. */
export function useCanvasClipboard(options:Options){
  const latest=useRef(options);latest.current=options;
  const [,changed]=useState(0),session=useRef<Session|null>(null),mounted=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const owner=options.owner?.toLowerCase()||"",key=JSON.stringify([options.account,owner,options.workspace]);
  function stored(scope:Session,marker?:string){try{return canvasClipboardSelection(JSON.parse(localStorage.getItem(scope.storageKey)||"null"),scope.owner,scope.workspace,marker);}catch{return null;}}
  if(session.current?.key!==key){
    const next:Session={key,owner,workspace:options.workspace,storageKey:canvasClipboardStorageKey(owner,options.workspace),artwork:null,selection:null,intent:null,revision:0};
    if(owner)next.selection=stored(next);session.current=next;
  }
  function clearIntent(){session.current!.intent=null;if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}}
  function mark(marker:string){clearIntent();const scope=session.current!;scope.intent=marker;timer.current=setTimeout(()=>{if(session.current===scope&&scope.intent===marker)scope.intent=null;timer.current=null;},1000);}
  function attempt(){const scope=session.current!,revision=++scope.revision,current=latest.current.current;return()=>mounted.current&&session.current===scope&&scope.revision===revision&&current();}
  function readSelection(marker?:string){
    const scope=session.current!,cached=canvasClipboardSelection(scope.selection,scope.owner,scope.workspace,marker);
    if(cached)return cached;
    const value=stored(scope,marker);if(value)scope.selection=value;return value;
  }
  function copyArtwork(node:Artwork,system=false){
    const scope=session.current!;clearIntent();scope.selection=null;scope.artwork=node;changed(value=>value+1);
    const current=attempt();if(system)void writeCanvasNodeClipboard({id:node.id,title:node.title||latest.current.imageLabel},current);
  }
  function copySelection(ids:string[]){
    const scope=session.current!,wanted=Array.from(new Set(ids)).filter(latest.current.contains);if(!scope.owner||!wanted.length)return false;
    const clip={marker:`clip-${browserRandomUUID()}`,ids:wanted,owner:scope.owner,workspace:scope.workspace};
    scope.selection=clip;scope.artwork=null;mark(clip.marker);changed(value=>value+1);
    try{localStorage.setItem(scope.storageKey,JSON.stringify(clip));}catch{/* Memory copy still works when storage is unavailable. */}
    void writeCanvasNodeClipboard({id:clip.marker,title:latest.current.selectionLabel},attempt());return true;
  }
  async function paste(){const scope=session.current!,node=scope.artwork;if(node){await latest.current.duplicateArtwork(node);return;}const clip=readSelection();if(clip)await latest.current.duplicateNodes(clip.ids);}
  function copyShortcut(){
    clearIntent();const state=latest.current.state(),native=window.getSelection();
    if((state.multiSel.length>1||state.selectedTextId||state.selectedId&&latest.current.isVideo(state.selectedId))&&(!native||native.isCollapsed)){
      if(copySelection(state.multiSel.length?state.multiSel:[state.selectedTextId||state.selectedId!]))latest.current.copied();return;
    }
    if(!state.selected||(native&&!native.isCollapsed))return;
    copyArtwork(state.selected,true);mark(state.selected.id);latest.current.copied();
  }
  function copyEvent(event:ClipboardEvent){
    const scope=session.current!,generic=scope.selection,intended=scope.intent;clearIntent();
    if(isEditableClipboardTarget(event.target)||!event.clipboardData)return;
    if(generic&&intended===generic.marker){event.preventDefault();setCanvasNodeClipboardData(event.clipboardData,generic.marker,latest.current.selectionLabel);return;}
    const node=scope.artwork;if(!node||intended!==node.id||latest.current.state().selected?.id!==node.id)return;
    event.preventDefault();setCanvasNodeClipboardData(event.clipboardData,node.id,node.title||latest.current.imageLabel);
  }
  function pasteEvent(event:ClipboardEvent){
    if(event.target instanceof Element&&event.target.closest('[data-canvas-hotkeys-blocked="true"], [data-canvas-hotkeys-scope="assistant"]'))return;
    const state=latest.current.state();if(!state.ready||!session.current!.owner||state.readOnly||state.browsing||state.loading||state.blocked||document.querySelector(CANVAS_MODAL_SELECTOR))return;
    const data=event.clipboardData;if(!data)return;const editable=isEditableClipboardTarget(event.target);
    if(!editable&&latest.current.workflow(data.getData("text/html"),latest.current.center())){event.preventDefault();return;}
    const files=clipboardImageFiles(data);if(files.length){event.preventDefault();latest.current.images(files,latest.current.center());return;}
    if(editable)return;
    const nodeId=canvasNodeIdFromClipboard(data),generic=nodeId&&readSelection(nodeId);
    if(generic){session.current!.artwork=null;event.preventDefault();void latest.current.duplicateNodes(generic.ids);return;}
    const copied=session.current!.artwork;if(!copied||nodeId!==copied.id||!latest.current.hasCanvas())return;
    event.preventDefault();void paste();
  }
  const handlers=useRef({copyEvent,pasteEvent});handlers.current={copyEvent,pasteEvent};
  useEffect(()=>{
    mounted.current=true;const copy=(event:ClipboardEvent)=>handlers.current.copyEvent(event),paste=(event:ClipboardEvent)=>handlers.current.pasteEvent(event);
    const storage=(event:StorageEvent)=>{const scope=session.current!;if(event.key!==scope.storageKey)return;let clip=null;try{clip=canvasClipboardSelection(JSON.parse(event.newValue||"null"),scope.owner,scope.workspace);}catch{}
      scope.selection=clip;scope.artwork=null;scope.revision++;clearIntent();changed(value=>value+1);};
    window.addEventListener("copy",copy);window.addEventListener("paste",paste);window.addEventListener("storage",storage);
    return()=>{mounted.current=false;clearIntent();window.removeEventListener("copy",copy);window.removeEventListener("paste",paste);window.removeEventListener("storage",storage);};
  },[]);
  return {hasClip:!!(session.current.artwork||session.current.selection),copyArtwork,copySelection,copyShortcut,paste,clearIntent,
    hasMediaIntent:()=>{const scope=session.current!;return !!scope.intent&&(scope.artwork?.id===scope.intent||scope.selection?.marker===scope.intent);},
    copyImage:async(image:string)=>{clearIntent();const current=attempt();if(await copyCanvasImage(image,current)&&current())latest.current.imageCopied();}};
}
