"use client";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {currentWorkspace,currentWorkspaceRevision} from '@/lib/saas/workspace-client';
import {createCanvasProjectNavigation} from '@/lib/canvas/project-navigation';

type Options={ready:boolean;email?:string;requestedProject?:string;ports:()=>{select:(project:string,id:string|null)=>void;focus:(id:string,project:string)=>void;missing:()=>void;back:()=>void;refreshProject?:()=>Promise<unknown>}};
/** One authenticated workspace view session; no document or request ownership. */
export function useCanvasProjectNavigation(options:Options){
 const email=options.ready?options.email||'':'',search=typeof window==='undefined'?'':window.location.search;
 const targetEmail=email?(new URLSearchParams(search).get('email')||email):null;
 const readOnly=!!targetEmail&&targetEmail.toLowerCase()!==email.toLowerCase();
 const workspace=currentWorkspace(),revision=currentWorkspaceRevision(),identity=JSON.stringify([email.toLowerCase(),targetEmail?.toLowerCase(),workspace]);
 const requestedProject=options.requestedProject||new URLSearchParams(search).get('project')||undefined;
 const requestIdentity=JSON.stringify([identity,revision,requestedProject]);
 const [loadedRequest,setLoadedRequest]=useState<{owner:ReturnType<typeof createCanvasProjectNavigation>;identity:string}|null>(null);
 const latest=useRef(options);latest.current=options;
 const live=useRef<ReturnType<typeof createCanvasProjectNavigation>|null>(null),mounted=useRef(true);
 const owner=useMemo(()=>{
  const current=()=>mounted.current&&live.current===navigation&&workspace===currentWorkspace()&&revision===currentWorkspaceRevision();
  const navigation=createCanvasProjectNavigation(identity,{current,
   storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)},
   push:()=>window.history.pushState({nvCanvasEditor:true},''),back:()=>window.history.back(),
   select:(project,id)=>latest.current.ports().select(project,id),focus:(id,project)=>latest.current.ports().focus(id,project),missing:()=>latest.current.ports().missing(),
   schedule:run=>{let timer:number|undefined;const frame=window.requestAnimationFrame(()=>{timer=window.setTimeout(run,0);});return()=>{window.cancelAnimationFrame(frame);if(timer!==undefined)window.clearTimeout(timer);};},
  });return navigation;
 },[identity,workspace,revision]);
 live.current=owner;
 const state=useSyncExternalStore(owner.subscribe,owner.getSnapshot,owner.getSnapshot);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;live.current?.dispose();};},[]);
 useEffect(()=>{if(email)owner.initialize(new URLSearchParams(search).get('node'));return()=>owner.dispose();},[owner,email,search]);
 useEffect(()=>{
  if(!email)return;
  owner.requestProject(requestedProject);if(!requestedProject)return;let active=true;
  // Navigation controls opening; existing document owners perform the refresh.
  const current=()=>active&&live.current===owner&&workspace===currentWorkspace()&&revision===currentWorkspaceRevision();
  void Promise.resolve().then(()=>current()?latest.current.ports().refreshProject?.():undefined).then(()=>{
   if(current())setLoadedRequest({owner,identity:requestIdentity});
  }).catch(()=>{});
  return()=>{active=false;};
 },[owner,email,requestedProject,requestIdentity,workspace,revision]);
 useEffect(()=>{const pop=()=>{if(live.current?.pop())latest.current.ports().back();};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 return {navigation:owner,...state,targetEmail,readOnly,requestedProjectReady:!requestedProject||loadedRequest?.owner===owner&&loadedRequest.identity===requestIdentity};
}
