"use client";
import {useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasLocalImageEdits,EMPTY_LOCAL_IMAGE_EDITS} from '@/lib/canvas/local-image-edits';

/** React observes the editor owner; the native file input remains a DOM ref. */
export function useCanvasLocalImageEdits(scope:CanvasDocumentScope){
  const ref=useRef<ReturnType<typeof createCanvasLocalImageEdits>|null>(null);if(!ref.current)ref.current=createCanvasLocalImageEdits();
  const owner=ref.current,view=useMemo(()=>owner.bind(scope),[owner,scope]);
  const snapshot=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_LOCAL_IMAGE_EDITS);
  return {...view,busy:snapshot.busy,crop:view.currentCrop()};
}
