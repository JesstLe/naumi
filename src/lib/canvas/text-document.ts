import { canvasDocumentFetch, type CanvasDocumentScope } from "./document-scope";
import { reduceHistoryTexts } from "./history-model";
import type { CanvasHistoryOperation } from "./history-contract";
import { mergeTextDrafts, normalizeTextNodes, rebaseText, sameText, textCache, textDocumentKey, type CanvasTextNode } from "./text-document-model";

export type TextDocumentSnapshot = {nodes:CanvasTextNode[];phase:"idle"|"loading"|"ready"|"error";error:string;unsaved:number};
export const EMPTY_TEXT_DOCUMENT:TextDocumentSnapshot = {nodes:[],phase:"idle",error:"",unsaved:0};
export type CanvasTextHistoryPort = {
  transaction<T>(scope:CanvasDocumentScope,work:()=>Promise<T>):Promise<T>;
  applyHistory(scope:CanvasDocumentScope,operations:CanvasHistoryOperation[]):void;
};
type Bucket = {
  snapshot:TextDocumentSnapshot;cacheKey:string;legacyKey:string|null;cacheRead:boolean;owner:string;
  drafts:Map<string,CanvasTextNode>;confirmed:Map<string,CanvasTextNode>;scheduled:Map<string,CanvasTextNode>;
  queues:Map<string,Promise<unknown>>;barrier:Promise<unknown>;deleted:Set<string>;removals:Map<string,number>;
  listeners:Set<()=>void>;loadVersion:number;writes:number;written:Map<string,number>;frame?:Map<string,CanvasTextNode>;
};
type Options = {storage:()=>Pick<Storage,"getItem"|"setItem">|undefined;notice:(scope:CanvasDocumentScope,message:string)=>void};
const bucketKey=(scope:CanvasDocumentScope)=>JSON.stringify([scope.account,scope.workspace]);

/** Document owner, not a second task system: one local graph, one per-node save
 * queue and one history barrier per actor/workspace. No generation or billing. */
export function createCanvasTextDocument(options:Options) {
  const buckets=new Map<string,Bucket>();
  const notify=(b:Bucket)=>b.listeners.forEach(listener=>listener());
  const publish=(b:Bucket,patch:Partial<TextDocumentSnapshot>={})=>{
    b.snapshot={...b.snapshot,...patch,unsaved:b.drafts.size};
    let cached=false;
    try{const storage=options.storage();if(storage){storage.setItem(b.cacheKey,JSON.stringify(textCache(b.snapshot.nodes,Array.from(b.drafts.values()))));cached=true;}}catch{/* Memory drafts survive a browser storage failure. */}
    notify(b);return cached;
  };
  const readCache=(b:Bucket)=>{
    if(b.cacheRead)return;b.cacheRead=true;
    try {
      const raw=options.storage()?.getItem(b.cacheKey),saved=raw?JSON.parse(raw):null;
      const legacy=!saved&&b.legacyKey?options.storage()?.getItem(b.legacyKey):null;
      const nodes=normalizeTextNodes(saved?.version===2?saved.nodes:legacy?JSON.parse(legacy):[]);
      for(const node of normalizeTextNodes(saved?.version===2?saved.drafts:[]))if(!b.drafts.has(node.id))b.drafts.set(node.id,node);
      b.snapshot={...b.snapshot,nodes:mergeTextDrafts(nodes,b.drafts.values())};
    }catch{/* A corrupt cache is not converted into a successful server read. */}
  };
  const written=(b:Bucket,id:string)=>{b.writes++;b.written.set(id,b.writes);};
  const get=(scope:CanvasDocumentScope)=>{const b=buckets.get(bucketKey(scope));if(!b)throw new Error("文字文档尚未打开");return b;};
  const history:CanvasTextHistoryPort={
    async transaction(scope,work) {
      scope.assertView();const b=get(scope),previous=b.barrier,pending=Array.from(b.queues.values()),before=new Map(b.snapshot.nodes.map(n=>[n.id,n]));
      let release!:()=>void;const done=new Promise<void>(resolve=>{release=resolve;});
      const drain=Promise.allSettled([previous,...pending]),gate=drain.then(()=>done);b.barrier=gate;
      try{await drain;scope.assertView();b.frame=before;return await work();}
      finally{b.frame=undefined;release();if(b.barrier===gate)b.barrier=Promise.resolve();}
    },
    applyHistory(scope,operations) {
      const b=get(scope),before=b.frame||new Map(b.snapshot.nodes.map(n=>[n.id,n]));
      const confirmed=reduceHistoryTexts(Array.from(b.confirmed.values()),operations);
      const projected=reduceHistoryTexts(b.snapshot.nodes,operations),live=new Map(b.snapshot.nodes.map(n=>[n.id,n]));
      b.confirmed=new Map(confirmed.map(n=>[n.id,n]));
      const nodes=projected.map(n=>live.has(n.id)?rebaseText(n,before.get(n.id),live.get(n.id)!):n);
      const touched=new Set(operations.flatMap(op=>op.type==="text-restore"?[op.node.id]:op.type==="text-delete"||op.type==="text-patch"||op.type==="position"&&op.text?[op.id]:[]));
      for(const id of touched){
        const node=nodes.find(n=>n.id===id);written(b,id);
        if(!node){b.deleted.add(id);b.removals.set(id,(b.removals.get(id)||0)+1);b.drafts.delete(id);}else{b.deleted.delete(id);if(sameText(node,b.confirmed.get(id)))b.drafts.delete(id);else b.drafts.set(id,node);}
      }
      publish(b,{nodes});
    },
  };
  function bind(scope:CanvasDocumentScope,actor:string,owner:string,writable:boolean) {
    const key=bucketKey(scope);let b=buckets.get(key);
    if(!b){b={snapshot:EMPTY_TEXT_DOCUMENT,cacheKey:textDocumentKey(actor,owner,scope.workspace),legacyKey:scope.workspace==="personal"&&actor.toLowerCase()===owner.toLowerCase()?`naumi:canvas-text-nodes:${owner.toLowerCase()}`:null,cacheRead:false,owner,
      drafts:new Map(),confirmed:new Map(),scheduled:new Map(),queues:new Map(),barrier:Promise.resolve(),deleted:new Set(),removals:new Map(),listeners:new Set(),loadVersion:0,writes:0,written:new Map()};buckets.set(key,b);}
    const state=b;
    const set=(update:CanvasTextNode[]|((nodes:CanvasTextNode[])=>CanvasTextNode[]))=>{
      if(!scope.documentCurrent())return;
      readCache(state);
      const previous=state.snapshot.nodes,nodes=typeof update==="function"?update(previous):update;
      if(nodes===previous)return;
      for(const node of nodes){if(!sameText(node,previous.find(n=>n.id===node.id))){state.deleted.delete(node.id);if(writable)state.drafts.set(node.id,structuredClone(node));}}
      for(const node of previous)if(!nodes.some(n=>n.id===node.id)){state.deleted.add(node.id);state.removals.set(node.id,(state.removals.get(node.id)||0)+1);state.drafts.delete(node.id);state.confirmed.delete(node.id);written(state,node.id);}
      publish(state,{nodes});
    };
    const accept=(nodes:CanvasTextNode[])=>{
      if(!scope.documentCurrent())return;
      readCache(state);
      for(const node of nodes){state.confirmed.set(node.id,node);state.deleted.delete(node.id);written(state,node.id);if(sameText(node,state.drafts.get(node.id)))state.drafts.delete(node.id);}
      publish(state,{nodes:mergeTextDrafts(mergeTextDrafts(state.snapshot.nodes,nodes),state.drafts.values())});
    };
    const save=(requested:CanvasTextNode):Promise<CanvasTextNode|null>=>{
      if(!writable||!scope.documentCurrent())return Promise.resolve(null);
      readCache(state);
      const node=structuredClone(requested),before=state.scheduled.get(node.id)||state.confirmed.get(node.id),gate=state.barrier,removal=state.removals.get(node.id)||0;
      state.scheduled.set(node.id,node);state.drafts.set(node.id,node);publish(state);
      const run=async()=>{
        try {
          if(!scope.documentCurrent()||state.deleted.has(node.id)||(state.removals.get(node.id)||0)!==removal)return null;
          const confirmed=state.confirmed.get(node.id),effective=confirmed?rebaseText(confirmed,before,node):node;
          const response=await canvasDocumentFetch({...scope,project:node.projectKey},"/api/canvas/text-nodes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(effective),signal:AbortSignal.timeout(20_000)});
          const data=await response.json();if(!response.ok)throw new Error(data?.error||"文字保存失败");
          if(data?.persisted!==false&&!data?.node)throw new Error("文字保存结果待核实");
          const saved=(data.node||effective) as CanvasTextNode;state.confirmed.set(node.id,saved);written(state,node.id);
          const current=state.snapshot.nodes.find(n=>n.id===node.id);
          let cached;
          if(current&&(sameText(current,node)||sameText(current,effective))){
            state.drafts.delete(node.id);cached=publish(state,{nodes:state.snapshot.nodes.map(n=>n.id===node.id?saved:n)});
          }else cached=publish(state);
          if(data.persisted===false&&!cached){state.drafts.set(node.id,current||effective);throw new Error("本机草稿保存失败");}
          return saved;
        }catch(error){publish(state);if(scope.documentCurrent())options.notice(scope,"文字保存失败"+(error instanceof Error?`：${error.message}`:""));return null;}
      };
      const pending=(state.queues.get(node.id)||Promise.resolve()).catch(()=>{}).then(()=>gate).then(run);
      state.queues.set(node.id,pending);
      return pending.finally(()=>{if(state.queues.get(node.id)===pending){state.queues.delete(node.id);state.scheduled.delete(node.id);}});
    };
    const load=async()=>{
      if(!scope.documentCurrent())return false;readCache(state);
      const version=++state.loadVersion,writes=state.writes;publish(state,{phase:"loading",error:""});
      try {
        const response=await canvasDocumentFetch({...scope,project:null},`/api/canvas/text-nodes?email=${encodeURIComponent(owner)}`,{cache:"no-store",signal:AbortSignal.timeout(20_000)});
        const data=await response.json();if(!response.ok)throw new Error(data?.error||"文字节点加载失败");
        if(!scope.documentCurrent()||version!==state.loadVersion)return false;
        if(typeof data?.persisted!=="boolean"||!Array.isArray(data.nodes))throw new Error("文字节点响应格式异常");
        const server=data.persisted?normalizeTextNodes(data.nodes):state.snapshot.nodes;
        const merged=new Map(server.map(n=>[n.id,n]));
        for(const [id,revision] of state.written)if(revision>writes){const latest=state.confirmed.get(id);if(latest)merged.set(id,latest);else merged.delete(id);}
        state.confirmed=merged;
        for(const [id,draft] of state.drafts)if(sameText(draft,merged.get(id)))state.drafts.delete(id);
        publish(state,{nodes:mergeTextDrafts(Array.from(merged.values()),state.drafts.values()),phase:"ready",error:""});return true;
      } catch(error){if(scope.documentCurrent()&&version===state.loadVersion)publish(state,{phase:"error",error:error instanceof Error?error.message:"文字节点加载失败"});return false;}
    };
    return {getSnapshot:()=>state.snapshot,subscribe:(listener:()=>void)=>{state.listeners.add(listener);return()=>{state.listeners.delete(listener);};},set,accept,save,load,
      flush:()=>Promise.all(Array.from(state.queues.values())),retry:()=>Promise.all(Array.from(state.drafts.values(),save)),history};
  }
  return {bind,history};
}
