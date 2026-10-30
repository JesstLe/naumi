'use client';
import {useCallback,useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasNodePreferences,EMPTY_NODE_PREFERENCES} from '@/lib/canvas/node-preferences';
import {nodePreferenceBrowser} from '@/lib/canvas/node-preferences-browser';

/** React observes the preference owner; shared history remains the only writer. */
export function useCanvasNodePreferences(scope:CanvasDocumentScope,input:{owner:string;enabled:boolean;notice:(message:string)=>void;failed:string}){
  const store=useRef<ReturnType<typeof createCanvasNodePreferences>|null>(null);if(!store.current)store.current=createCanvasNodePreferences();
  const view=useMemo(()=>store.current!.bind(scope,input.owner,nodePreferenceBrowser(scope,input.owner,input.notice,input.failed)),[scope,input.owner,input.notice,input.failed]);
  const latest=useRef(view);latest.current=view;
  const get=useCallback((id:string)=>latest.current.get(id),[]),locked=useCallback((id:string)=>latest.current.locked(id),[]);
  const snapshot=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_NODE_PREFERENCES);
  // A different project shares the actor's preferences, not another read loop.
  useEffect(()=>{if(input.enabled)void latest.current.load();},[view.identity,input.enabled]);
  return{...view,...snapshot,ready:input.enabled&&snapshot.ready,get,locked};
}
