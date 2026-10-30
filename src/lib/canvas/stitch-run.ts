import type {Artwork} from '../mock-data';
import {browserRandomUUID} from '../browser-crypto';
import {canvasDocumentHeaders,type CanvasDocumentScope} from './document-scope';
import type {CanvasHistoryAction} from './history-model';

type Input={ids:string[];title:string;x:number;y:number};
export type CanvasStitchPorts={writable:()=>boolean;current:()=>boolean;merge:(ids:string[])=>Promise<Artwork[]>;
 history:{record:(scope:CanvasDocumentScope,action:CanvasHistoryAction)=>void};
 applied:(id:string)=>void;notice:(message:string)=>void;messages:{failed:string;done:string;unknown:string;missing:string}};
type Attempt={body:string;operationId:string;sent:boolean;resultId?:string;action?:CanvasHistoryAction;recorded:boolean};
type Snapshot={busy:boolean};
type Bucket={snapshot:Snapshot;attempts:Map<string,Attempt>;listeners:Set<()=>void>};
/** Session-local intent, not a new task/save queue. Unknown POST outcomes only
 * query their original server receipt; document/history remain result owners. */
export function createCanvasStitchRun(){
 const buckets=new Map<string,Bucket>();
 return{bind(scope:CanvasDocumentScope){
  let bucket=buckets.get(scope.key);if(!bucket){bucket={snapshot:{busy:false},attempts:new Map(),listeners:new Set()};buckets.set(scope.key,bucket);}const state=bucket;
  const publish=(busy:boolean)=>{state.snapshot={busy};for(const listener of state.listeners)listener();};
  return{
   getSnapshot:()=>state.snapshot,subscribe(listener:()=>void){state.listeners.add(listener);return()=>{state.listeners.delete(listener);};},
   async run(input:Input,ports:CanvasStitchPorts){
    const current=()=>scope.viewCurrent()&&ports.current();
    if(!current()||!ports.writable()||state.snapshot.busy||input.ids.length<2)return;
    // A pending intent freezes its title and placement even if the nodes move
    // before a user checks its original receipt. Success retires this intent.
    publish(true);const fingerprint=JSON.stringify(input.ids);
    try{
     let attempt=state.attempts.get(fingerprint);
     if(!attempt){const operationId=browserRandomUUID();attempt={operationId,body:JSON.stringify({...input,operationId}),sent:false,recorded:false};state.attempts.set(fingerprint,attempt);}
     const saved=attempt;
     if(!saved.resultId){
      const querying=saved.sent;
      const headers=await canvasDocumentHeaders(scope,querying?undefined:{'content-type':'application/json'},true);
      if(!current()||!ports.writable())return;
      if(!querying)saved.sent=true;
      const response=await fetch(querying?'/api/canvas/stitch?operationId='+encodeURIComponent(saved.operationId):'/api/canvas/stitch',
       querying?{headers,cache:'no-store',signal:AbortSignal.timeout(20_000)}:{method:'POST',headers,body:saved.body,signal:AbortSignal.timeout(60_000)});
      const text=await response.text();let data:any;try{data=text?JSON.parse(text):{};}catch{throw Error(ports.messages.unknown);}
      if(!response.ok){if(!querying&&data.accepted===false)saved.sent=false;throw Error(data.error||ports.messages.failed);}
      const result=querying?data.result:data;
      if(!result||typeof result.id!=='string'||!result.id)throw Error(ports.messages.unknown);
      if(result.operationId!==saved.operationId)throw Error(ports.messages.unknown);
      if(result.projectKey&&scope.project&&result.projectKey!==scope.project)throw Error(ports.messages.unknown);
      saved.resultId=result.id;
     }
     if(!scope.documentCurrent())return;
     const resultId=saved.resultId;if(!resultId)throw Error(ports.messages.unknown);
     const fresh=await ports.merge([resultId]);if(!scope.documentCurrent())return;
     const node=fresh.find(a=>a.id===resultId);if(!node)throw Error(ports.messages.missing);
     if(!saved.recorded){saved.action||={kind:'add',records:[node]};ports.history.record(scope,saved.action);saved.recorded=true;}
     state.attempts.delete(fingerprint);
     if(current()){ports.applied(resultId);ports.notice(ports.messages.done);}
    }catch(error){if(current())ports.notice(error instanceof Error?error.message:ports.messages.failed);}
    finally{publish(false);}
   },
  };
 }};
}
