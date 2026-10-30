"use client";
import {useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasTextImageRuns,EMPTY_TEXT_IMAGE_RUN} from '@/lib/canvas/text-image-runs';

/** One React adapter to the existing document-scoped application owner. */
export function useCanvasTextImages(scope:CanvasDocumentScope){
  const ref=useRef<ReturnType<typeof createCanvasTextImageRuns>|null>(null);
  if(!ref.current)ref.current=createCanvasTextImageRuns();
  const owner=ref.current,view=useMemo(()=>owner.bind(scope),[owner,scope]);
  const snapshot=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_TEXT_IMAGE_RUN);
  return {...view,...snapshot};
}
