"use client";
import {useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasGenerationPresentation,EMPTY_GENERATION_PRESENTATION} from '@/lib/canvas/generation-presentation';

/** The artwork document already owns account/workspace/project observation.
 * React subscribes only to that view's generation presentation. */
export function useCanvasGenerationPresentation(scope:CanvasDocumentScope){
  const store=useRef<ReturnType<typeof createCanvasGenerationPresentation>|null>(null);
  if(!store.current)store.current=createCanvasGenerationPresentation();
  const owner=store.current,view=useMemo(()=>owner.bind(scope.key),[owner,scope.key]);
  const snapshot=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_GENERATION_PRESENTATION);
  return {...view,atScope:(target:CanvasDocumentScope)=>owner.bind(target.key),...snapshot};
}
