"use client";
import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasTextNode} from '@/lib/canvas/text-document-model';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasTextEditing} from '@/lib/canvas/text-editing';
type Ports=Parameters<ReturnType<typeof createCanvasTextEditing>['bind']>[1];
/** React bridges a view-bound editing owner to the existing document/history. */
export function useCanvasTextEditing(scope:CanvasDocumentScope,ports:Ports,ready:boolean,nodes:readonly CanvasTextNode[]){
 const latest=useRef(ports);latest.current=ports;const ref=useRef<ReturnType<typeof createCanvasTextEditing>|null>(null);
 if(!ref.current)ref.current=createCanvasTextEditing();const owner=ref.current,save=ports().document.save,view=useMemo(()=>owner.bind(scope,()=>latest.current()),[owner,scope,save]);
 const expanded=useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
 useEffect(()=>{view.fit(ready);},[view,ready,nodes]);
 return {...view,expanded};
}
