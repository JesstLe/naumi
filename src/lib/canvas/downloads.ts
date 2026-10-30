import type {Artwork} from '../mock-data';
import {isHostedImageUrl} from '../media-url';
import type {CanvasDocumentScope} from './document-scope';

export type CanvasArchiveItem={url:string;name:string};
export type CanvasDownloadPorts={
  image:(source:string,signal:AbortSignal)=>Promise<{blob:Blob;name:string}>;
  archive:(items:CanvasArchiveItem[],signal:AbortSignal)=>Promise<Blob>;
  save:(blob:Blob,name:string)=>void;
  video:(source:string)=>void;
};
export type CanvasDownloadFeedback={notice:(message:string)=>void;imageFailed:string;archiveFailed:string};
export const EMPTY_CANVAS_DOWNLOADS={zipping:false};

/** Owns only a view's download intent and archive admission, never a paid task,
 * document write or media authorization. The browser adapter owns bytes/DOM. */
export function createCanvasDownloads(scope:CanvasDocumentScope,ports:CanvasDownloadPorts){
  let snapshot=EMPTY_CANVAS_DOWNLOADS,archiveFlight:AbortController|undefined;
  const flights=new Set<AbortController>(),listeners=new Set<()=>void>();
  const publish=(zipping:boolean)=>{
    if(snapshot.zipping===zipping)return;
    snapshot={zipping};for(const listener of listeners)listener();
  };
  // Navigation does not cancel an explicit download of the original project.
  // Account/workspace retirement or explicit lifecycle cancellation does.
  const current=(flight?:AbortController)=>scope.documentCurrent()&&!flight?.signal.aborted;
  const report=(message:string,feedback:CanvasDownloadFeedback,flight:AbortController)=>{if(current(flight)&&scope.viewCurrent())feedback.notice(message);};
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    cancel(){for(const flight of flights)flight.abort();flights.clear();archiveFlight=undefined;publish(false);},
    video(source:string){if(scope.viewCurrent())ports.video(source);},
    async image(source:string,feedback:CanvasDownloadFeedback){
      if(!scope.viewCurrent())return;const flight=new AbortController();flights.add(flight);
      try{const result=await ports.image(source,flight.signal);if(current(flight))ports.save(result.blob,result.name);}
      catch{report(feedback.imageFailed,feedback,flight);}
      finally{flights.delete(flight);}
    },
    async archive(members:Pick<Artwork,'image'|'title'>[],filename:string,feedback:CanvasDownloadFeedback){
      if(!scope.viewCurrent()||archiveFlight)return;
      const items=members.filter(member=>isHostedImageUrl(member.image)).map((member,i)=>({url:member.image,name:member.title||`img-${i+1}`}));
      if(!items.length)return;
      const flight=new AbortController();archiveFlight=flight;flights.add(flight);publish(true);
      try{const blob=await ports.archive(items,flight.signal);if(current(flight))ports.save(blob,`${filename||'project'}.zip`);}
      catch{report(feedback.archiveFailed,feedback,flight);}
      finally{flights.delete(flight);if(archiveFlight===flight){archiveFlight=undefined;publish(false);}}
    },
  };
}
