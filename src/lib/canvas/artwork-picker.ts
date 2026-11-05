import type {Artwork} from '../mock-data';
import {isHostedImageUrl} from '../media-url';
import type {CanvasDocumentScope} from './document-scope';
import type {CanvasNodeCopyInput,CanvasNodeCopyResult} from './node-copy-contract';

type Point={x:number;y:number};
type Snapshot={point:Point|null;addingId:string|null;error:string|null;visible:number};
export const EMPTY_ARTWORK_PICKER:Snapshot={point:null,addingId:null,error:null,visible:60};
export type CanvasArtworkPickerPorts={
 writable:()=>boolean;project:()=>string|undefined;viewport:()=>Point&{zoom:number};size:{width:number;height:number};
 copy:(input:Omit<CanvasNodeCopyInput,'operationId'>,purpose:'history')=>Promise<CanvasNodeCopyResult>;
 applied:(result:CanvasNodeCopyResult)=>void;failed:string;
};

/** Original catalogue rules and ordering. This is a view onto the document's
 * existing artwork list, not a second gallery fetch or persistence owner. */
export function canvasPickerArtworks(artworks:readonly Artwork[]){
 return artworks.filter(art=>art.status==='completed'&&isHostedImageUrl(art.image)&&!['workflow-decoration','workflow-placeholder'].includes(art.source||''));
}

/** Owns the history-artwork selection session. The existing node operations
 * retain copy identity/UNKNOWN recovery and the shared history transaction. */
export function createCanvasArtworkPicker(){
 let active:ReturnType<typeof session>|undefined;
 function session(scope:CanvasDocumentScope){
  let snapshot=EMPTY_ARTWORK_PICKER;const listeners=new Set<()=>void>();
  return{scope,getSnapshot:()=>snapshot,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
   publish(patch:Partial<Snapshot>){snapshot={...snapshot,...patch};for(const listener of listeners)listener();}};
 }
 return{bind(scope:CanvasDocumentScope,ports:()=>CanvasArtworkPickerPorts){
  if(active?.scope!==scope)active=session(scope);
  const view=active,current=()=>active===view&&scope.viewCurrent();
  const close=()=>{if(!current()||view.getSnapshot().addingId)return false;view.publish({point:null,error:null});return true;};
  return{
   identity:view,getSnapshot:view.getSnapshot,subscribe:view.subscribe,close,
   open(screen:Point){
    const service=ports();if(!current()||!service.writable()||view.getSnapshot().addingId)return false;
    const viewport=service.viewport(),z=viewport.zoom||1;
    view.publish({point:{x:(screen.x-viewport.x)/z-service.size.width/2,y:(screen.y-viewport.y)/z-service.size.height/2},error:null,visible:60});return true;
   },
   more(){if(current()&&view.getSnapshot().point&&!view.getSnapshot().addingId)view.publish({visible:view.getSnapshot().visible+60});},
   async pick(id:string){
    const state=view.getSnapshot(),service=ports();if(!current()||!service.writable()||!state.point||state.addingId)return false;
    view.publish({addingId:id,error:null});
    try{
     const result=await service.copy({ids:[id],projectKey:service.project(),singleArtwork:{x:Math.round(state.point.x),y:Math.round(state.point.y)}},'history');
     if(current()){view.publish({point:null});service.applied(result);}return true;
    }catch(error){if(current())view.publish({error:error instanceof Error?error.message:service.failed});return false;}
    finally{view.publish({addingId:null});}
   },
  };
 }};
}
