'use client';
import {useMemo,useRef,useSyncExternalStore} from 'react';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {createCanvasStitchRun} from '@/lib/canvas/stitch-run';

export function useCanvasStitch(scope:CanvasDocumentScope){
 const ref=useRef<ReturnType<typeof createCanvasStitchRun>|null>(null);if(!ref.current)ref.current=createCanvasStitchRun();
 const owner=ref.current,view=useMemo(()=>owner.bind(scope),[owner,scope]);
 const snapshot=useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
 return{...view,...snapshot};
}
