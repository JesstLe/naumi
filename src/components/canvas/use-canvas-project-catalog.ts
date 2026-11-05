"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {canvasDocumentFetch,type CanvasDocumentScope} from "@/lib/canvas/document-scope";

type Options={scope:CanvasDocumentScope;ready:boolean;actor:string;target:string;readOnly:boolean;notice:(message:string)=>void;failure:string};
type Edit={key:string;value:string};

/** Project names belong to an account/workspace session, not a selected node or
 * project. Original document scope freezes auth context for each accepted write. */
export function useCanvasProjectCatalog(options:Options){
  const {scope,ready,actor,target,readOnly}=options;
  const identity=JSON.stringify([scope.account,scope.workspace,actor,target,ready]);
  const owner=useMemo(()=>({identity,names:{} as Record<string,string>,confirmed:{} as Record<string,string>,edit:null as Edit|null,
    touched:new Set<string>(),versions:new Map<string,number>(),queues:new Map<string,Promise<void>>(),alive:true,
    tab:"all" as "all"|"workflows",menuKey:null as string|null}),[identity]);
  const live=useRef(owner);live.current=owner;
  const latest=useRef(options);latest.current=options;
  const [,render]=useState(0);
  const current=()=>owner===live.current&&owner.alive&&scope.documentCurrent();
  const publish=()=>{if(current())render(n=>n+1);};

  useEffect(()=>{
    owner.alive=true;let stopped=false;
    if(ready&&actor&&target)void canvasDocumentFetch(scope,`/api/projects?email=${encodeURIComponent(target)}`)
      .then(async response=>{if(!response.ok)throw new Error("项目名称读取失败");return response.json() as Promise<{names?:Record<string,string>}>;})
      .then(data=>{
        if(stopped||!current())return;
        const names={...(data.names||{})};
        owner.confirmed={...names,...owner.confirmed};
        for(const key of owner.touched){if(Object.hasOwn(owner.names,key))names[key]=owner.names[key];else delete names[key];}
        owner.names=names;publish();
      }).catch(()=>{});
    return()=>{stopped=true;owner.alive=false;};
    // A project navigation does not invalidate the account-level catalog read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner]);

  function begin(project:{key:string;name:string}){
    if(readOnly||!actor||!current())return;
    owner.menuKey=null;owner.edit={key:project.key,value:project.name};publish();
  }
  function change(value:string){if(owner.edit&&current()){owner.edit={...owner.edit,value};publish();}}
  function cancel(){if(current()){owner.edit=null;publish();}}
  function setTab(tab:"all"|"workflows"){if(current()){owner.tab=tab;publish();}}
  function toggleMenu(key:string){if(current()){owner.menuKey=owner.menuKey===key?null:key;publish();}}
  function closeMenu(){if(current()){owner.menuKey=null;publish();}}
  function remove(key:string){
    if(!current())return;
    owner.touched.add(key);owner.versions.set(key,(owner.versions.get(key)||0)+1);
    const names={...owner.names};delete names[key];owner.names=names;delete owner.confirmed[key];if(owner.edit?.key===key)owner.edit=null;publish();
  }
  async function commit(key:string){
    const edit=owner.edit;if(!edit||edit.key!==key||!current())return;
    const name=edit.value.trim();owner.edit=null;publish();
    if(latest.current.readOnly||!actor||!name)return;
    const version=(owner.versions.get(key)||0)+1;owner.versions.set(key,version);owner.touched.add(key);
    owner.names={...owner.names,[key]:name};publish();
    const previous=owner.queues.get(key)||Promise.resolve();
    const task=previous.then(async()=>{
      if(!current()||latest.current.readOnly)return;
      const response=await canvasDocumentFetch(scope,"/api/projects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:actor,key,name})});
      const data=await response.json() as {name?:string;error?:string};
      if(!response.ok)throw new Error(data.error||latest.current.failure);
      if(!current())return;
      owner.confirmed[key]=data.name??name;
      if(owner.versions.get(key)===version){owner.names={...owner.names,[key]:owner.confirmed[key]};publish();}
    }).catch((error:unknown)=>{
      if(!current()||owner.versions.get(key)!==version)return;
      const names={...owner.names};if(Object.hasOwn(owner.confirmed,key))names[key]=owner.confirmed[key];else delete names[key];owner.names=names;publish();
      latest.current.notice(error instanceof Error?error.message:latest.current.failure);
    });
    owner.queues.set(key,task);
    await task;
    if(owner.queues.get(key)===task)owner.queues.delete(key);
  }
  return {names:owner.names,edit:owner.edit,begin,change,cancel,commit,remove,tab:owner.tab,setTab,menuKey:owner.menuKey,toggleMenu,closeMenu};
}
export type CanvasProjectCatalog=ReturnType<typeof useCanvasProjectCatalog>;
