import {VideoNodeSaveQueue,VideoNodeClientError} from "./video-node-save-queue";
import {browserRandomUUID} from "../browser-crypto";
import {canvasDocumentFetch,type CanvasDocumentScope} from "./document-scope";
import {mergeCanvasNativeSnapshots,type CanvasNativeKind,type CanvasNativeNodeSet} from "./native-node-records";
import type {VideoNodeWrite} from "./video-node-schema";
import type {DirectorNodeWrite} from "./director-node-schema";
import type {CharacterNodeWrite} from "./character-node-schema";
import type {SceneNodeWrite} from "./scene-node-schema";
import type {AudioNodeWrite} from "./audio-node-schema";
import type {TimelineNodeWrite} from "./timeline-node-schema";

export type NativeNodeFor<K extends CanvasNativeKind> = CanvasNativeNodeSet[`${K}Nodes`][number];
type Writes={video:VideoNodeWrite;director:DirectorNodeWrite;character:CharacterNodeWrite;scene:SceneNodeWrite;audio:AudioNodeWrite;timeline:TimelineNodeWrite};
export type NativeNodePatch<K extends CanvasNativeKind>=Partial<Omit<Writes[K],"id"|"operationId">>;
export type NativeNodeSnapshot<N>={nodes:N[];phase:"idle"|"loading"|"ready"|"error";error:string;saving:number;unsavedCount:number};
export class NativeNodeClientError extends Error{constructor(message:string,public status:number,public code?:string){super(message);}}
type ErrorFactory=(message:string,status:number,code?:string)=>NativeNodeClientError;
const labels={video:"视频节点",director:"导演工程",character:"角色",scene:"场景",audio:"音频",timeline:"多轨"};
type Attempt={key:string;url:string;method:"POST"|"PATCH";project:string|null;body:string};

/** Document state for the six existing native kinds. Only reads, node write
 * queues and original receipts live here. Payload/CAS, render, adoption, tasks,
 * billing and history stay in their existing owners. */
export function createCanvasNativeNodeDocument<K extends CanvasNativeKind>(kind:K,error:ErrorFactory){
  type N=NativeNodeFor<K>;
  type Bucket={snapshot:NativeNodeSnapshot<N>;listeners:Set<()=>void>;queues:Map<string,Promise<N>>;pending:Map<string,Attempt>;flights:Map<string,{current:()=>boolean;promise:Promise<N>}>;read:number;writes:number;written:Map<string,number>;writable:boolean;writeEpoch:number;video?:{queue:VideoNodeSaveQueue;current:()=>boolean};videoFlights:Set<Promise<NativeNodeFor<"video">>>};
  const buckets=new Map<string,Bucket>(),url=`/api/canvas/${kind}-nodes`,label=labels[kind];
  const publish=(b:Bucket,patch:Partial<NativeNodeSnapshot<N>>)=>{if(Object.entries(patch).every(([key,value])=>b.snapshot[key as keyof typeof b.snapshot]===value))return;b.snapshot={...b.snapshot,...patch};b.listeners.forEach(fn=>fn());};
  const merge=(b:Bucket,nodes:N[])=>{
    const next=mergeCanvasNativeSnapshots(b.snapshot.nodes,nodes);
    for(const node of nodes)b.written.set(node.id,++b.writes);
    if(next!==b.snapshot.nodes)publish(b,{nodes:next});
  };
  const node=(value:unknown,id?:string):value is N=>!!value&&typeof value==="object"&&typeof (value as N).id==="string"&&typeof (value as N).projectKey==="string"&&Number.isInteger((value as N).revision)&&(!id||(value as N).id===id);
  function bind(scope:CanvasDocumentScope,email:string,readOnly:boolean){
    const key=JSON.stringify([scope.account,scope.workspace,email]);let bucket=buckets.get(key);
    if(!bucket){bucket={snapshot:{nodes:[],phase:email?"idle":"ready",error:"",saving:0,unsavedCount:0},listeners:new Set(),queues:new Map(),pending:new Map(),flights:new Map(),read:0,writes:0,written:new Map(),writable:false,writeEpoch:0,videoFlights:new Set()};buckets.set(key,bucket);}
    const state=bucket,writable=!!email&&!readOnly;if(state.writable!==writable){state.writable=writable;state.writeEpoch++;}const writeEpoch=state.writeEpoch;
    const current=()=>scope.documentCurrent();
    const writeCurrent=()=>current()&&state.writable&&writeEpoch===state.writeEpoch;
    const assertWrite=()=>{if(!writeCurrent())throw new Error("画布账号、工作空间或编辑状态已改变");};
    async function request(path:string,init:RequestInit={},project:string|null=null){
      const writing=!!init.method&&init.method!=="GET";
      if(writing)assertWrite();
      // Recheck after asynchronous auth, before POST. Do not run the unguarded
      // page privateFetchRaw as another authentication hop.
      const target={...scope,project,documentCurrent:()=>writing?writeCurrent():current()};
      const response=await canvasDocumentFetch(target,path,{...init,signal:init.signal||AbortSignal.timeout(20_000)});
      const data=await response.json();
      if(!response.ok)throw error(data?.error||`${label}请求失败`,response.status,data?.code);
      return data;
    }
    const refresh=async()=>{
      if(!email||!current())return;const ticket=++state.read,writes=state.writes;if(state.snapshot.phase==="idle")publish(state,{phase:"loading",error:""});
      try{
        const data=await request(`${url}?includeDeleted=1&email=${encodeURIComponent(email)}`,{cache:"no-store"});
        if(!current()||ticket!==state.read)return;
        if(!Array.isArray(data.nodes)||!data.nodes.every((value:unknown)=>node(value)))throw new Error(`${label}响应格式异常`);
        const incoming=new Map<string,N>((data.nodes as N[]).map(value=>[value.id,value]));
        // A read started before a receipt may not erase that receipt, including
        // a new/deleted node absent from the older read snapshot.
        for(const saved of state.snapshot.nodes)if((state.written.get(saved.id)||0)>writes||state.pending.has(saved.id)||state.video?.queue.hasUnconfirmed(saved.id))incoming.set(saved.id,saved);
        const base=state.snapshot.nodes.some(value=>!incoming.has(value.id))?state.snapshot.nodes.filter(value=>incoming.has(value.id)):state.snapshot.nodes;
        const next=mergeCanvasNativeSnapshots(base,[...incoming.values()]);
        publish(state,{nodes:next,phase:"ready",error:""});
      }catch(cause){if(current()&&ticket===state.read)publish(state,{phase:"error",error:cause instanceof Error?cause.message:`${label}加载失败`});throw cause;}
    };
    // The same document still owns canonical nodes and read epochs. The video
    // queue only owns ordered writes and its existing exact-attempt journal.
    const videoWrites=()=>{
      assertWrite();
      if(state.video&&!state.video.current()){state.video.queue.dispose();state.video=undefined;}
      if(!state.video){
        let journal:ConstructorParameters<typeof VideoNodeSaveQueue>[0]["journal"];
        try{if(typeof sessionStorage!=="undefined")journal={key:`naumi:video-node-saves:v1:${JSON.stringify([email.toLowerCase(),scope.workspace])}`,storage:sessionStorage};}catch{/* In-memory recovery remains available. */}
        const queue=new VideoNodeSaveQueue({current:writeCurrent,workspace:scope.workspace,journal,
          getNode:id=>state.snapshot.nodes.find(value=>value.id===id) as NativeNodeFor<"video">|undefined,
          accept:value=>merge(state,[value as N]),
          pendingChanged:unsavedCount=>publish(state,{unsavedCount}),
          changed:cause=>{if(current())publish(state,{error:cause?.message||""});},
          conflict:()=>{if(current())void refresh().catch(()=>{});},
          request:(path,init={})=>{
            const input=JSON.parse(String(init.body)),old=state.snapshot.nodes.find(value=>value.id===input.id);
            const project=!old&&input.expectedRevision===0&&input.projectKey===`tree:${input.id}`?null:input.projectKey||old?.projectKey||scope.project;
            return canvasDocumentFetch({...scope,project,documentCurrent:writeCurrent},String(path),init);
          },
        });state.video={queue,current:writeCurrent};
      }
      return state.video.queue;
    };
    const activate=()=>{
      if(kind!=="video"||!writable)return()=>{};
      const queue=videoWrites();return()=>{queue.dispose();if(state.video?.queue===queue)state.video=undefined;};
    };
    const save=(id:string,patch:NativeNodePatch<K>):Promise<N>=>{
      try{assertWrite();}catch(cause){return Promise.reject(cause);}
      if(kind==="video"){
        const result=videoWrites().save(id,patch as NativeNodePatch<"video">);
        if(!state.videoFlights.has(result)){
          state.videoFlights.add(result);publish(state,{saving:state.snapshot.saving+1});
          void result.finally(()=>{state.videoFlights.delete(result);publish(state,{saving:Math.max(0,state.snapshot.saving-1)});}).catch(()=>{});
        }
        return result as Promise<N>;
      }
      const input=structuredClone(patch),fingerprint=JSON.stringify([id,input]),flight=state.flights.get(fingerprint);
      if(flight?.current())return flight.promise;
      publish(state,{saving:state.snapshot.saving+1});
      async function send(attempt:Attempt){
        const data=await request(attempt.url,{method:attempt.method,headers:{"content-type":"application/json"},body:attempt.body},attempt.project);
        if(!node(data?.node,id))throw new Error(`${label}保存结果待核实，请重试原操作`);
        state.pending.delete(id);merge(state,[data.node]);
        if(!current())throw new Error(`${label}已保存，请返回原账号和工作空间同步`);
        return data.node;
      }
      const execute=async()=>{
        assertWrite();
        const prior=state.pending.get(id);
        if(prior){const saved=await send(prior);if(prior.key===fingerprint)return saved;}
        const old=state.snapshot.nodes.find(value=>value.id===id);
        const expectedRevision=input.expectedRevision??old?.revision??0;
        // A genuinely new root is attested in the owning node transaction. Its
        // project travels in the body, not a header that binds it prematurely.
        const project=!old&&expectedRevision===0&&input.projectKey===`tree:${id}`?null:input.projectKey||old?.projectKey||scope.project;
        const attempt:Attempt={key:fingerprint,url:old?`${url}/${encodeURIComponent(id)}`:url,method:old?"PATCH":"POST",project,
          body:JSON.stringify({...input,id,expectedRevision,operationId:browserRandomUUID()})};
        state.pending.set(id,attempt);return send(attempt);
      };
      const queued=(state.queues.get(id)||Promise.resolve()).catch(()=>{}).then(execute).catch(cause=>{
        // Definite rejection retires the intent. Transport/JSON/5xx uncertainty
        // retains its exact body/method/ID before any later write.
        if(cause instanceof NativeNodeClientError&&cause.status>=400&&cause.status<500){state.pending.delete(id);if(cause.status===409&&current())void refresh().catch(()=>{});}
        throw cause;
      });
      const promise=queued.finally(()=>{
        if(state.queues.get(id)===promise)state.queues.delete(id);
        if(state.flights.get(fingerprint)?.promise===promise)state.flights.delete(fingerprint);
        publish(state,{saving:Math.max(0,state.snapshot.saving-1)});
      });
      state.queues.set(id,promise);state.flights.set(fingerprint,{current:writeCurrent,promise});return promise;
    };
    async function command<T extends {node:N}>(id:string,suffix:string,body:Record<string,unknown>):Promise<T>{
      assertWrite();try{
        const data=await request(`${url}/${encodeURIComponent(id)}/${suffix}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)},state.snapshot.nodes.find(value=>value.id===id)?.projectKey||scope.project);
        if(!node(data?.node,id))throw new Error(`${label}回执待核实，请检查原操作`);
        merge(state,[data.node]);if(!current())throw new Error(`${label}操作已受理，请返回原账号和工作空间同步`);return data as T;
      }catch(cause){if((cause instanceof NativeNodeClientError||cause instanceof VideoNodeClientError)&&cause.status===409&&current())void refresh().catch(()=>{});throw cause;}
    }
    const read=async(path:string)=>{const data=await request(path,{cache:"no-store"});if(!current())throw new Error("画布账号或工作空间已切换");return data;};
    return {getSnapshot:()=>state.snapshot,subscribe:(fn:()=>void)=>{state.listeners.add(fn);return()=>{state.listeners.delete(fn);};},refresh,save,command,read,activate,
      accept:(nodes:N[],isCurrent:()=>boolean)=>{if(current()&&isCurrent())merge(state,nodes);},getNode:(id:string)=>state.snapshot.nodes.find(value=>value.id===id),flush:async(id?:string)=>kind==="video"?videoWrites().flush(id):Promise.all([...state.queues.values()]),retryPending:()=>kind==="video"?videoWrites().retryPending():Promise.resolve()};
  }
  return {bind};
}
