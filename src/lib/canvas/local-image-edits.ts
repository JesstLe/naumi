import type {Artwork} from '../mock-data';
import {browserRandomUUID,browserSha256Hex} from '../browser-crypto';
import {canvasDocumentHeaders,type CanvasDocumentScope} from './document-scope';
import type {CanvasCrop} from './node-settings';
import type {CanvasHistoryAction} from './history-model';
import {canvasLocalImageEditResultId} from './local-image-edit-id';

export type CanvasLocalImageEditPorts={
  writable:()=>boolean;ready:boolean;locked:(id:string)=>boolean;viewCurrent:()=>boolean;
  merge:(ids:string[])=>Promise<Artwork[]>;
  history:{record:(scope:CanvasDocumentScope,action:CanvasHistoryAction)=>void};
  fill:(artwork:Artwork,file:File)=>Promise<void>;
  applied:(id:string)=>void;notice:(message:string)=>void;
  messages:{invalidFile:string;failed:string;filled:string;fillFailed:string;saved:string;unknown:string;missing:string};
};
type Attempt={operationId:string;sent:boolean;body:BodyInit;headers?:Record<string,string>;resultId?:string;recorded:boolean;action?:CanvasHistoryAction};
type Snapshot={crop:Artwork|null;busy:boolean};
export const EMPTY_LOCAL_IMAGE_EDITS:Snapshot={crop:null,busy:false};
type Bucket={snapshot:Snapshot;cropScope?:CanvasDocumentScope;cropCurrent?:()=>boolean;listeners:Set<()=>void>;attempts:Map<string,Attempt>};

/** Session-local editing intent and result application. Original immutable
 * versions remain in the existing local-edit service, artwork document and
 * history. A lost ACK is resumed by authorized artwork reads, never a re-POST. */
export function createCanvasLocalImageEdits(){
  const buckets=new Map<string,Bucket>();
  let replacement:{scope:CanvasDocumentScope;artwork:Artwork;run:(artwork:Artwork,crop:CanvasCrop|undefined,file:File)=>Promise<void>}|undefined;
  function bind(scope:CanvasDocumentScope){
    let bucket=buckets.get(scope.key);if(!bucket){bucket={snapshot:EMPTY_LOCAL_IMAGE_EDITS,listeners:new Set(),attempts:new Map()};buckets.set(scope.key,bucket);}const state=bucket;
    const publish=(patch:Partial<Snapshot>)=>{state.snapshot={...state.snapshot,...patch};state.listeners.forEach(listener=>listener());};
    const current=(ports:CanvasLocalImageEditPorts)=>scope.viewCurrent()&&ports.viewCurrent();
    const allowed=(artwork:Artwork,ports:CanvasLocalImageEditPorts)=>current(ports)&&ports.writable()&&ports.ready&&!ports.locked(artwork.id)&&!state.snapshot.busy;
    async function execute(artwork:Artwork,crop:CanvasCrop|undefined,file:File|undefined,ports:CanvasLocalImageEditPorts){
      if(!allowed(artwork,ports))return;
      if(file&&(file.size>12*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))){ports.notice(ports.messages.invalidFile);return;}
      publish({busy:true});
      try{
        if(artwork.source==='workflow-placeholder'&&file){await ports.fill(artwork,file);if(current(ports))ports.notice(ports.messages.filled);return;}
        // Two distinct files with identical metadata are not the same intent.
        // Hash only the existing 12MiB-bounded input, before any POST.
        const digest=file?await browserSha256Hex(new Uint8Array(await file.arrayBuffer())):undefined;
        if(!current(ports)||!ports.writable())return;
        const fingerprint=JSON.stringify({id:artwork.id,crop,file:file?{name:file.name,size:file.size,lastModified:file.lastModified,digest}:null});
        let attempt=state.attempts.get(fingerprint);
        if(!attempt){
          const operationId=browserRandomUUID();let body:BodyInit,headers:Record<string,string>|undefined;
          if(file){const form=new FormData();form.set('image',file);form.set('id',artwork.id);form.set('operationId',operationId);body=form;}
          else{headers={'content-type':'application/json'};body=JSON.stringify({mode:'crop',id:artwork.id,operationId,crop});}
          attempt={operationId,body,headers,sent:false,recorded:false};state.attempts.set(fingerprint,attempt);
        }
        const saved=attempt;let rows:Artwork[]|undefined;
        if(!saved.resultId&&saved.sent){
          // Empty/failed reads remain unknown; they never authorize a new POST.
          const expected=canvasLocalImageEditResultId(saved.operationId);rows=await ports.merge([expected]);
          if(!scope.documentCurrent())return;
          if(!rows.some(node=>node.id===expected))throw new Error(ports.messages.unknown);
          saved.resultId=expected;
        }
        if(!saved.resultId){
          const headers=await canvasDocumentHeaders(scope,saved.headers,true);
          if(!current(ports)||!ports.writable())return;
          saved.sent=true;
          const response=await fetch('/api/canvas/local-image-edit',{method:'POST',headers,body:saved.body,signal:AbortSignal.timeout(60_000)});
          const text=await response.text();let data:{id?:string;error?:string};
          try{data=text?JSON.parse(text):{};}catch{throw new Error(!response.ok?`服务暂时不可用(${response.status}),请刷新页面后重试`:'服务返回异常,请重试');}
          if(!response.ok){if([400,401,403,413].includes(response.status))saved.sent=false;throw new Error(data.error||ports.messages.failed);}
          if(data.id!==canvasLocalImageEditResultId(saved.operationId))throw new Error(ports.messages.unknown);
          saved.resultId=data.id;
        }
        // Remember a known result even across actor changes; only its original
        // document can merge it later. View changes must not discard the bytes.
        if(!scope.documentCurrent())return;
        rows=rows||await ports.merge([saved.resultId]);if(!scope.documentCurrent())return;
        const result=rows.find(node=>node.id===saved.resultId);if(!result)throw new Error(ports.messages.missing);
        if(!saved.recorded){saved.action||={kind:'add',records:[result]};ports.history.record(scope,saved.action);saved.recorded=true;}
        state.attempts.delete(fingerprint);
        if(current(ports)){publish({crop:null});ports.applied(saved.resultId);ports.notice(ports.messages.saved);}
      }catch(error){if(current(ports))ports.notice(error instanceof Error?error.message:artwork.source==='workflow-placeholder'?ports.messages.fillFailed:ports.messages.failed);}
      finally{publish({busy:false});}
    }
    return {
      getSnapshot:()=>state.snapshot,subscribe(listener:()=>void){state.listeners.add(listener);return()=>{state.listeners.delete(listener);};},
      currentCrop:()=>scope.viewCurrent()&&state.cropScope?.viewCurrent()&&state.cropCurrent?.()?state.snapshot.crop:null,
      openCrop(artwork:Artwork,ports:CanvasLocalImageEditPorts){if(!allowed(artwork,ports))return;state.cropScope=scope;state.cropCurrent=()=>current(ports);publish({crop:artwork});},
      close(){if(scope.viewCurrent()&&!state.snapshot.busy)publish({crop:null});},
      execute,
      requestReplacement(artwork:Artwork,ports:CanvasLocalImageEditPorts){if(!allowed(artwork,ports))return false;replacement={scope,artwork,run:(art,crop,file)=>execute(art,crop,file,ports)};return true;},
      async replace(file:File){const selected=replacement;replacement=undefined;if(selected?.scope.viewCurrent())await selected.run(selected.artwork,undefined,file);},
    };
  }
  return {bind};
}
