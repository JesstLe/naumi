'use client';
import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasNativeEditorSession,EMPTY_NATIVE_EDITORS,type CanvasNativeEditorCatalogue} from '@/lib/canvas/native-editor-session';

/** React subscription and authoritative catalogue reconciliation only. */
export function useCanvasNativeEditors(scope:CanvasDocumentScope,catalogue:CanvasNativeEditorCatalogue,focus:(project:string|null,id:string)=>void){
  const latest=useRef(focus);latest.current=focus;
  const stores=useRef(catalogue);stores.current=catalogue;
  const ref=useRef<ReturnType<typeof createCanvasNativeEditorSession>|null>(null);
  if(!ref.current)ref.current=createCanvasNativeEditorSession(()=>({focus:(project,id)=>latest.current(project,id)}));
  const owner=ref.current,view=useMemo(()=>owner.bind(scope),[owner,scope]);
  const sessions=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_NATIVE_EDITORS);
  useEffect(()=>{owner.mount(true);return()=>owner.mount(false);},[owner]);
  useEffect(()=>{view.reconcile(stores.current);},[view,
    catalogue.character.nodes,catalogue.character.ready,catalogue.scene.nodes,catalogue.scene.ready,
    catalogue.director.nodes,catalogue.director.ready,catalogue.audio.nodes,catalogue.audio.ready,
    catalogue.timeline.nodes,catalogue.timeline.ready]);
  return {...view,sessions,openCount:Object.keys(sessions).length};
}
