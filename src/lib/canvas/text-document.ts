import {CANVAS_TEXT_WRITE_FIELDS} from "./text-write";
import {browserRandomUUID} from "../browser-crypto";
import { canvasDocumentFetch, type CanvasDocumentScope } from "./document-scope";
import { reduceHistoryTexts } from "./history-model";
import type { CanvasHistoryOperation } from "./history-contract";
import { mergeTextDrafts, normalizeTextNodes, rebaseText, sameText, textCache, textDocumentKey, type CanvasTextNode } from "./text-document-model";

export type TextDocumentConflict={id:string;fields:string[];current:CanvasTextNode|null};
export type TextDocumentSnapshot = {conflicts:Record<string,TextDocumentConflict>;nodes:CanvasTextNode[];phase:"idle"|"loading"|"ready"|"error";error:string;unsaved:number};
export const EMPTY_TEXT_DOCUMENT:TextDocumentSnapshot = {conflicts:{},nodes:[],phase:"idle",error:"",unsaved:0};
export type CanvasTextHistoryPort = {
  transaction<T>(scope:CanvasDocumentScope,work:()=>Promise<T>):Promise<T>;
  applyHistory(scope:CanvasDocumentScope,operations:CanvasHistoryOperation[],canonical?:CanvasTextNode[]):void;
  conflict?:(scope:CanvasDocumentScope,value:TextDocumentConflict)=>void;
};
type SaveAttempt={node:CanvasTextNode;requested:CanvasTextNode;body:string};
type Bucket = {
  pending:Map<string,SaveAttempt>;bases:Map<string,CanvasTextNode|null>;
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
    try{const storage=options.storage();if(storage){storage.setItem(b.cacheKey,JSON.stringify({...textCache(b.snapshot.nodes,Array.from(b.drafts.values()),Array.from(b.confirmed.values())),writeBases:Array.from(b.bases.entries()),pendingWrites:Array.from(b.pending.entries())}));cached=true;}}catch{/* Memory drafts survive a browser storage failure. */}
    notify(b);return cached;
  };
  const readCache=(b:Bucket)=>{
    if(b.cacheRead)return;b.cacheRead=true;
    try {
      const raw=options.storage()?.getItem(b.cacheKey),saved=raw?JSON.parse(raw):null;
      const legacy=!saved&&b.legacyKey?options.storage()?.getItem(b.legacyKey):null;
      const nodes=normalizeTextNodes(saved?.version===2?saved.nodes:legacy?JSON.parse(legacy):[]);
      for(const node of normalizeTextNodes(saved?.version===2?saved.drafts:[]))if(!b.drafts.has(node.id))b.drafts.set(node.id,node);
      for(const node of normalizeTextNodes(saved?.confirmed))b.confirmed.set(node.id,node);
      for(const node of nodes)if(!b.drafts.has(node.id)&&!b.confirmed.has(node.id))b.confirmed.set(node.id,node);
      for(const node of b.drafts.values())b.bases.set(node.id,b.confirmed.get(node.id)||null);
      for(const entry of Array.isArray(saved?.writeBases)?saved.writeBases:[])if(Array.isArray(entry)&&typeof entry[0]==="string"&&(entry[1]===null||entry[1]?.id===entry[0]))b.bases.set(entry[0],entry[1]);
      for(const entry of Array.isArray(saved?.pendingWrites)?saved.pendingWrites:[])if(Array.isArray(entry)&&typeof entry[0]==="string"&&entry[1]?.node?.id===entry[0]&&typeof entry[1]?.body==="string")b.pending.set(entry[0],entry[1]);
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
    conflict(scope,value){const b=get(scope);if(!scope.documentCurrent())return;publish(b,{conflicts:{...b.snapshot.conflicts,[value.id]:value}});},
    applyHistory(scope,operations,canonical) {
      const b=get(scope),before=b.frame||new Map(b.snapshot.nodes.map(n=>[n.id,n]));
      let confirmed=reduceHistoryTexts(Array.from(b.confirmed.values()),operations);
      let projected=reduceHistoryTexts(b.snapshot.nodes,operations);if(canonical){const changed=new Set(operations.flatMap(op=>op.type==="text-restore"?[op.node.id]:op.type==="text-delete"||op.type==="text-patch"||op.type==="position"&&op.text?[op.id]:[])),byId=new Map(canonical.map(n=>[n.id,n]));const replace=(items:CanvasTextNode[])=>[...items.filter(n=>!changed.has(n.id)||byId.has(n.id)).map(n=>changed.has(n.id)?byId.get(n.id)!:n),...canonical.filter(n=>!items.some(item=>item.id===n.id))];confirmed=replace(confirmed);projected=replace(projected);}
      const live=new Map(b.snapshot.nodes.map(n=>[n.id,n]));
      b.confirmed=new Map(confirmed.map(n=>[n.id,n]));
      const nodes=projected.map(n=>{
        const current=live.get(n.id);if(!current)return n;
        const merged=rebaseText(n,b.bases.get(n.id)||before.get(n.id),current);
        for(const op of operations){if(op.type==="text-patch"&&op.id===n.id)for(const [key,value] of Object.entries(op.fields)){
          if(op.expected&&JSON.stringify(value)===JSON.stringify(op.expected[key as keyof typeof op.expected]))continue;
          if((!op.expected&&JSON.stringify(current[key as keyof CanvasTextNode])===JSON.stringify(before.get(n.id)?.[key as keyof CanvasTextNode]))||JSON.stringify(current[key as keyof CanvasTextNode])===JSON.stringify(value)||JSON.stringify(current[key as keyof CanvasTextNode])===JSON.stringify(op.expected?.[key as keyof typeof op.expected]))Object.assign(merged,{[key]:n[key as keyof CanvasTextNode]});
        }else if(op.type==="position"&&op.text&&op.id===n.id)for(const [key,value,expected]of [["canvasX",op.x,op.expected?.x],["canvasY",op.y,op.expected?.y]] as const){if((!op.expected&&current[key]===before.get(n.id)?.[key])||current[key]===value||current[key]===expected)merged[key]=n[key];}}
        return merged;
      });
      const touched=new Set(operations.flatMap(op=>op.type==="text-restore"?[op.node.id]:op.type==="text-delete"||op.type==="text-patch"||op.type==="position"&&op.text?[op.id]:[]));
      for(const id of touched){
        const node=nodes.find(n=>n.id===id);written(b,id);b.pending.delete(id);
        if(!node){b.deleted.add(id);b.removals.set(id,(b.removals.get(id)||0)+1);b.drafts.delete(id);b.bases.delete(id);b.pending.delete(id);}else{b.deleted.delete(id);b.bases.set(id,b.confirmed.get(id)||null);if(sameText(node,b.confirmed.get(id)))b.drafts.delete(id);else b.drafts.set(id,node);}
      }
      publish(b,{nodes});
    },
  };
  function bind(scope:CanvasDocumentScope,actor:string,owner:string,writable:boolean) {
    const key=bucketKey(scope);let b=buckets.get(key);
    if(!b){b={snapshot:EMPTY_TEXT_DOCUMENT,cacheKey:textDocumentKey(actor,owner,scope.workspace),legacyKey:scope.workspace==="personal"&&actor.toLowerCase()===owner.toLowerCase()?`naumi:canvas-text-nodes:${owner.toLowerCase()}`:null,cacheRead:false,owner,
      pending:new Map(),bases:new Map(),drafts:new Map(),confirmed:new Map(),scheduled:new Map(),queues:new Map(),barrier:Promise.resolve(),deleted:new Set(),removals:new Map(),listeners:new Set(),loadVersion:0,writes:0,written:new Map()};buckets.set(key,b);}
    const state=b;
    const set=(update:CanvasTextNode[]|((nodes:CanvasTextNode[])=>CanvasTextNode[]))=>{
      if(!scope.documentCurrent())return;
      readCache(state);
      const previous=state.snapshot.nodes,nodes=typeof update==="function"?update(previous):update;
      if(nodes===previous)return;
      for(const node of nodes){if(!sameText(node,previous.find(n=>n.id===node.id))){state.deleted.delete(node.id);if(writable){if(!state.bases.has(node.id))state.bases.set(node.id,state.confirmed.get(node.id)||null);state.drafts.set(node.id,structuredClone(node));}}}
      for(const node of previous)if(!nodes.some(n=>n.id===node.id)){state.deleted.add(node.id);state.removals.set(node.id,(state.removals.get(node.id)||0)+1);state.drafts.delete(node.id);state.confirmed.delete(node.id);written(state,node.id);}
      publish(state,{nodes});
    };
    const accept=(nodes:CanvasTextNode[])=>{
      if(!scope.documentCurrent())return;
      readCache(state);
      for(const node of nodes){state.confirmed.set(node.id,node);state.deleted.delete(node.id);written(state,node.id);if(sameText(node,state.drafts.get(node.id)))state.drafts.delete(node.id);}
      publish(state,{nodes:mergeTextDrafts(mergeTextDrafts(state.snapshot.nodes,nodes),state.drafts.values())});
    };
    /** Read already-saved tool results into this graph, never execute the tool.
     * Reuse the document's normalizer, drafts and per-ID write fence. A later
     * local/history/save result wins over a snapshot that began before it. */
    const refreshSaved=async(nodes:readonly Pick<CanvasTextNode,"id"|"projectKey">[],signal:AbortSignal,isCurrent:()=>boolean):Promise<void>=>{
      const ids=new Set(nodes.filter(node=>node.projectKey===scope.project).map(node=>node.id));
      const current=()=>scope.viewCurrent()&&isCurrent();
      if(!ids.size||!owner||!current())return;
      const writes=state.writes;
      const response=await canvasDocumentFetch(scope,`/api/canvas/text-nodes?email=${encodeURIComponent(owner)}`,{signal},true);
      if(!response.ok)throw new Error("剧本资产已保存，画布文字读取暂不可用");
      const snapshot=await response.json();
      if(!current())return;
      const rows=snapshot.nodes||[];
      if(!Array.isArray(rows))throw new Error("文字节点响应格式异常");
      const incoming=rows.filter(node=>node&&ids.has(node.id)&&node.projectKey===scope.project&&(state.written.get(node.id)||0)<=writes);
      accept(normalizeTextNodes(incoming));
    };
    const save=(requested:CanvasTextNode):Promise<CanvasTextNode|null>=>{
      if(!writable||!scope.documentCurrent()||state.snapshot.conflicts[requested.id])return Promise.resolve(null);
      readCache(state);
      const node=structuredClone(requested),before=state.scheduled.get(node.id)||state.confirmed.get(node.id),gate=state.barrier,removal=state.removals.get(node.id)||0;
      if(!state.bases.has(node.id))state.bases.set(node.id,state.confirmed.get(node.id)||null);
      state.scheduled.set(node.id,node);state.drafts.set(node.id,node);publish(state);
      const post=async(attempt:SaveAttempt)=>{
        const response=await canvasDocumentFetch({...scope,project:node.projectKey},"/api/canvas/text-nodes",{method:"POST",headers:{"content-type":"application/json"},body:attempt.body,signal:AbortSignal.timeout(20_000)});
        const data=await response.json();
        if(!response.ok){if(response.status>=400&&response.status<500)state.pending.delete(node.id);if(data?.code==="CANVAS_TEXT_CONFLICT")history.conflict?.(scope,{id:node.id,fields:data.fields||[],current:data.current||null});throw new Error(data?.error||"文字保存失败");}
        if(data?.persisted!==false&&!data?.node)throw new Error("文字保存结果待核实");
        const saved=(data.node||attempt.node) as CanvasTextNode;state.pending.delete(node.id);state.confirmed.set(node.id,saved);state.bases.set(node.id,saved);written(state,node.id);
        const current=state.snapshot.nodes.find(n=>n.id===node.id);let cached;
        if(current){const rebased=rebaseText(saved,attempt.requested,current);if(sameText(rebased,saved)){state.drafts.delete(node.id);state.bases.delete(node.id);}else state.drafts.set(node.id,rebased);cached=publish(state,{nodes:state.snapshot.nodes.map(n=>n.id===node.id?rebased:n)});}else cached=publish(state);
        if(data.persisted===false&&!cached){state.drafts.set(node.id,current||attempt.node);throw new Error("本机草稿保存失败");}
        return saved;
      };
      const run=async()=>{
        try{
          if(!scope.documentCurrent()||state.deleted.has(node.id)||(state.removals.get(node.id)||0)!==removal||state.snapshot.conflicts[node.id])return null;
          const pending=state.pending.get(node.id);if(pending){const saved=await post(pending);if(sameText(pending.requested,node))return saved;}
          const confirmed=state.confirmed.get(node.id),effective=confirmed?rebaseText(confirmed,before,node):node;
          if(confirmed&&sameText(confirmed,effective)){if(sameText(state.snapshot.nodes.find(n=>n.id===node.id),confirmed)){state.drafts.delete(node.id);state.bases.delete(node.id);publish(state);}return confirmed;}
          const attempt={node:effective,requested:node,body:JSON.stringify({...effective,base:state.bases.has(node.id)?state.bases.get(node.id)!:confirmed??null})};state.pending.set(node.id,attempt);publish(state);return await post(attempt);
        }catch(error){publish(state);if(scope.documentCurrent())options.notice(scope,"文字保存失败"+(error instanceof Error?`：${error.message}`:""));return null;}
      };
      const pending=(state.queues.get(node.id)||Promise.resolve()).catch(()=>{}).then(()=>gate).then(run);state.queues.set(node.id,pending);
      return pending.finally(()=>{if(state.queues.get(node.id)===pending){state.queues.delete(node.id);state.scheduled.delete(node.id);}});
    };
    /** Link delivered images into the latest text graph, not a submission-time
     * snapshot. Existing draft/rebase/save queues remain the only write owner. */
    const attachImageResults=async(sourceIds:string[],imageIds:string[])=>{
      if(!writable||!scope.documentCurrent()||!sourceIds.length||!imageIds.length)return;
      const ids=new Set(sourceIds),updated=state.snapshot.nodes.filter(node=>ids.has(node.id)).map(node=>({...node,targetIds:Array.from(new Set([...(node.targetIds??[]),...imageIds])),updatedAt:new Date().toISOString()}));
      const links=new Map(updated.map(node=>[node.id,node.targetIds]));
      set(nodes=>nodes.map(node=>links.has(node.id)?{...node,targetIds:Array.from(new Set([...(node.targetIds??[]),...links.get(node.id)!]))}:node));
      await Promise.all(updated.map(save));
    };
    const resolve=async(id:string,choice:"local"|"server")=>{
      if(!scope.documentCurrent()||!writable)return null;const conflict=state.snapshot.conflicts[id],baseline=state.bases.get(id),local=state.snapshot.nodes.find(n=>n.id===id);if(!conflict)return null;
      const conflicts={...state.snapshot.conflicts};delete conflicts[id];state.pending.delete(id);state.bases.delete(id);state.drafts.delete(id);
      if(conflict.current)state.confirmed.set(id,conflict.current);else state.confirmed.delete(id);
      if(choice==="server"){publish(state,{conflicts,nodes:conflict.current?state.snapshot.nodes.map(n=>n.id===id?conflict.current!:n):state.snapshot.nodes.filter(n=>n.id!==id)});return conflict.current;}
      if(!local){publish(state,{conflicts});return null;}
      const retained=conflict.current&&baseline?Object.fromEntries(CANVAS_TEXT_WRITE_FIELDS.filter(key=>JSON.stringify(local[key])!==JSON.stringify(baseline[key])).map(key=>[key,local[key]])):local;
      const next=conflict.current?{...conflict.current,...retained,updatedAt:conflict.current.updatedAt}:{...local,id:`text-${browserRandomUUID()}`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      publish(state,{conflicts,nodes:state.snapshot.nodes.map(n=>n.id===id?next:n)});state.bases.set(next.id,conflict.current);state.drafts.set(next.id,next);return save(next);
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
    return {getSnapshot:()=>state.snapshot,subscribe:(listener:()=>void)=>{state.listeners.add(listener);return()=>{state.listeners.delete(listener);};},set,accept,save,load,attachImageResults,refreshSaved,
      resolve,hasUnsaved:(id:string)=>state.drafts.has(id)||state.pending.has(id)||state.queues.has(id)||state.scheduled.has(id),
      flush:(ids?:readonly string[])=>Promise.all(ids?ids.map(id=>state.queues.get(id)):Array.from(state.queues.values())),retry:()=>Promise.all(Array.from(state.drafts.values(),save)),history};
  }
  return {bind,history};
}
