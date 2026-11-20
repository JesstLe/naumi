'use client';
import {useLayoutEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {createCanvasDownloads,EMPTY_CANVAS_DOWNLOADS,type CanvasDownloadFeedback} from '@/lib/canvas/downloads';
import {canvasDownloadBrowser} from '@/lib/canvas/download-browser';
import type {CanvasDocumentScope} from '@/lib/canvas/document-scope';

export function useCanvasDownloads(scope:CanvasDocumentScope,feedback:CanvasDownloadFeedback){
  const pending=useRef(new Set<{scope:CanvasDocumentScope;owner:ReturnType<typeof createCanvasDownloads>}>());
  const owner=useMemo(()=>createCanvasDownloads(scope,canvasDownloadBrowser(scope)),[scope]);
  useLayoutEffect(()=>{
    for(const entry of pending.current)if(!entry.scope.documentCurrent()){entry.owner.cancel();pending.current.delete(entry);}
  },[scope]);
  useLayoutEffect(()=>{
    const flights=pending.current;return()=>{for(const entry of flights)entry.owner.cancel();flights.clear();};
  },[]);
  const track=async(run:()=>Promise<void>)=>{
    const entry={scope,owner};pending.current.add(entry);try{await run();}finally{pending.current.delete(entry);}
  };
  const snapshot=useSyncExternalStore(owner.subscribe,owner.getSnapshot,()=>EMPTY_CANVAS_DOWNLOADS);
  return{zipping:snapshot.zipping,compressing:snapshot.compressing,image:(source:string)=>track(()=>owner.image(source,feedback)),
    compressImage:(source:string,title:string)=>track(()=>owner.compressImage(source,title,feedback)),
    archive:(members:Parameters<typeof owner.archive>[0],name:string)=>track(()=>owner.archive(members,name,feedback)),video:owner.video};
}
