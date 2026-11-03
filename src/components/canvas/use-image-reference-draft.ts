'use client';
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {browserRandomUUID} from '@/lib/browser-crypto';
import {ImageReferenceDraftStore} from '@/lib/canvas/image-reference-drafts';
import {currentWorkspace,WORKSPACE_SELECTION} from '@/lib/saas/workspace-client';

const subscribe=(notify:()=>void)=>{window.addEventListener(WORKSPACE_SELECTION,notify);return()=>window.removeEventListener(WORKSPACE_SELECTION,notify);};
const serverWorkspace=()=> 'personal';

/** Only this hook owns temporary reference Files and their preview URLs. */
export function useImageReferenceDraft(draftKey:string|null,ownerScope:string|null,readOnly=false){
  const workspace=useSyncExternalStore(subscribe,currentWorkspace,serverWorkspace);
  const ownedStore=useMemo(()=>({ownerScope,store:new ImageReferenceDraftStore()}),[ownerScope]);
  const store=ownedStore.store;
  const key=!readOnly&&ownerScope&&draftKey?JSON.stringify([workspace,draftKey]):null;
  const current=useRef({store,key,readOnly});current.current={store,key,readOnly};
  const alive=useRef(false);
  const [,render]=useState(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;store.clear();};},[store]);
  const uploads=store.read(key),files=useMemo(()=>uploads.map(upload=>upload.file),[uploads]);
  const add=useCallback((values:readonly File[])=>{
    if(!alive.current||!key||readOnly||currentWorkspace()!==workspace||current.current.store!==store||current.current.key!==key||current.current.readOnly)return;
    store.add(key,values.map(file=>({key:`upload:${browserRandomUUID()}`,file})));render(value=>value+1);
  },[key,readOnly,store,workspace]);
  const remove=useCallback((id:string)=>{
    if(!alive.current||!key||readOnly||currentWorkspace()!==workspace||current.current.store!==store||current.current.key!==key||current.current.readOnly)return;
    store.remove(key,id);render(value=>value+1);
  },[key,readOnly,store,workspace]);
  const copyTo=useCallback((targetDraftKey:string|null,sourceDraftKey=draftKey)=>{
    if(!alive.current||!sourceDraftKey||!targetDraftKey||readOnly||currentWorkspace()!==workspace||current.current.store!==store||current.current.readOnly)return;
    store.copy(JSON.stringify([workspace,sourceDraftKey]),JSON.stringify([workspace,targetDraftKey]));render(value=>value+1);
  },[draftKey,readOnly,store,workspace]);
  return {uploads,files,add,remove,copyTo};
}
