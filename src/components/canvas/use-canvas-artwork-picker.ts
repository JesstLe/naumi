'use client';
import {useMemo,useRef,useSyncExternalStore} from 'react';
import type {Artwork} from '@/lib/mock-data';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';
import {canvasPickerArtworks,createCanvasArtworkPicker,EMPTY_ARTWORK_PICKER,type CanvasArtworkPickerPorts} from '@/lib/canvas/artwork-picker';

/** React observes one view-scoped picker. Document and copy/history ownership
 * stay at their existing boundaries, including after navigation and lost ACK. */
export function useCanvasArtworkPicker(scope:CanvasDocumentScope,works:readonly Artwork[]|null,ports:()=>CanvasArtworkPickerPorts){
 const latest=useRef(ports);latest.current=ports;
 const ref=useRef<ReturnType<typeof createCanvasArtworkPicker>|null>(null);if(!ref.current)ref.current=createCanvasArtworkPicker();
 const owner=ref.current,view=useMemo(()=>owner.bind(scope,()=>latest.current()),[owner,scope]);
 const state=useSyncExternalStore(view.subscribe,view.getSnapshot,()=>EMPTY_ARTWORK_PICKER);
 const available=useMemo(()=>canvasPickerArtworks(works||[]),[works]);
 return{...view,...state,items:available.slice(0,state.visible),hasMore:available.length>state.visible};
}
