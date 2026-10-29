"use client";
import {useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasPendingPresentation,EMPTY_PENDING_PRESENTATION} from '@/lib/canvas/pending-presentation';

/** Reuse the artwork document's existing scope; this hook owns no task,
 * permission, billing, transport or persistent-recovery policy. */
export function useCanvasPendingPresentation(scope:CanvasDocumentScope,readOnly=false){
  const store=useRef<ReturnType<typeof createCanvasPendingPresentation>|null>(null);
  if(!store.current)store.current=createCanvasPendingPresentation();
  const owner=store.current,view=useMemo(()=>owner.bind(scope.key),[owner,scope.key]);
  const nodes=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_PENDING_PRESENTATION);
  return {...view,nodes:readOnly?EMPTY_PENDING_PRESENTATION:nodes};
}
