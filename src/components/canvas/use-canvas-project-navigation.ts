"use client";
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
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
 const [loadedRequest,setLoadedRequest]=useState<object|null>(null);
 const latest=useRef(options);latest.current=options;
 const reading=useRef<{request:object;promise:Promise<void>}|null>(null);
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
 const request=useMemo(()=>({identity:requestIdentity}),[owner,requestIdentity]);
 const liveRequest=useRef(request);liveRequest.current=request;
 // The fresh-read receipt belongs to navigation, not to an individual document.
 // A failed initial read must be explicitly retryable through the same owner.
 const retryRequestedProject=useCallback(():Promise<void>=>{
  const current=()=>mounted.current&&live.current===owner&&liveRequest.current===request&&workspace===currentWorkspace()&&revision===currentWorkspaceRevision();
  if(!email||!requestedProject||!current())return Promise.resolve();
  if(reading.current?.request===request)return reading.current.promise;
  const promise=Promise.resolve().then(()=>current()?latest.current.ports().refreshProject?.():undefined).then(()=>{
   if(current())setLoadedRequest(request);
  }).finally(()=>{if(reading.current?.promise===promise)reading.current=null;});
  reading.current={request,promise};return promise;
 },[owner,email,requestedProject,requestIdentity,workspace,revision,request]);
 const state=useSyncExternalStore(owner.subscribe,owner.getSnapshot,owner.getSnapshot);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;live.current?.dispose();};},[]);
 useEffect(()=>{if(email)owner.initialize(new URLSearchParams(search).get('node'));return()=>owner.dispose();},[owner,email,search]);
 useEffect(()=>{
  if(!email)return;
  owner.requestProject(requestedProject);
  void retryRequestedProject().catch(()=>{});
 },[owner,email,requestedProject,retryRequestedProject]);
 useEffect(()=>{const pop=()=>{if(live.current?.pop())latest.current.ports().back();};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 return {navigation:owner,...state,targetEmail,readOnly,retryRequestedProject,requestedProjectReady:!requestedProject||loadedRequest===request};
}
