import {reduceHistoryArtworks,rebaseCanvasArtworkAction,type CanvasHistoryAction} from "./history-model";
import type {HistoryCommit} from "./history-controller";
import type {CanvasArtworkConflict} from "./artwork-write";
export type ArtworkDocumentConflict=CanvasArtworkConflict&{action:CanvasHistoryAction;undo:boolean};
export type CanvasArtworkHistoryPort={transaction<T>(scope:CanvasDocumentScope,work:()=>Promise<T>):Promise<T>;applyHistory(scope:CanvasDocumentScope,commit:HistoryCommit):void;conflict(scope:CanvasDocumentScope,value:CanvasArtworkConflict,action:CanvasHistoryAction,undo:boolean):void};
import type { Artwork } from "../mock-data";
import { invalidateBrowserData, loadAccountSnapshot } from "../browser-data-cache";
import { canvasDocumentFetch, type CanvasDocumentScope } from "./document-scope";
import { artworkRows, mergeArtworkFields, sortCanvasArtworks } from "./artwork-document-model";

export type ArtworkDocumentSnapshot={conflicts:Record<string,ArtworkDocumentConflict>;nodes:Artwork[]|null;phase:"idle"|"loading"|"ready"|"error";error:string;trash:Artwork[]|null;trashError:string;trashBusy:boolean};
export const EMPTY_ARTWORK_DOCUMENT:ArtworkDocumentSnapshot={conflicts:{},nodes:null,phase:"idle",error:"",trash:null,trashError:"",trashBusy:false};
type Bucket={snapshot:ArtworkDocumentSnapshot;listeners:Set<()=>void>;revision:number;changes:Map<string,number>;deleted:Set<string>;dimensionSync:Set<string>;read:number;rowReads:Map<string,number>;statusRead:number;lastIds?:string[];trashRead:number;frame?:Map<string,Artwork>};
const documentKey=(scope:CanvasDocumentScope)=>JSON.stringify([scope.account,scope.workspace]);
class ArtworkReadError extends Error{constructor(message:string,readonly status?:number){super(message);}}
const denied=(error:unknown)=>!!error&&typeof error==="object"&&"status" in error&&[401,403].includes(Number(error.status));

/** Owns one artwork graph per actor/workspace. Reads never turn failures into an
 * empty success or expand an ID synchronization into a whole-account fallback. */
export function createCanvasArtworkDocument(){
  const buckets=new Map<string,Bucket>();
  const publish=(b:Bucket,patch:Partial<ArtworkDocumentSnapshot>)=>{b.snapshot={...b.snapshot,...patch};b.listeners.forEach(fn=>fn());};
  const get=(scope:CanvasDocumentScope)=>buckets.get(documentKey(scope));
  const history:CanvasArtworkHistoryPort={
    async transaction(scope,work){const b=get(scope);if(!b)return work();const before=b.frame;b.frame=new Map((b.snapshot.nodes||[]).map(n=>[n.id,n]));try{return await work();}finally{b.frame=before;}},
    conflict(scope,value,action,undo){const b=get(scope);if(!b||!scope.documentCurrent())return;publish(b,{conflicts:{...b.snapshot.conflicts,[value.id]:{...value,action,undo}}});},
    applyHistory(scope,value){const b=get(scope);if(!b||!scope.documentCurrent())return;const live=b.snapshot.nodes,projected=reduceHistoryArtworks(live,value.operations,value.action,value.undo);
      if(!value.artworkNodes){publish(b,{nodes:projected});return;}
      const ids=new Set(value.artworkIds||value.artworkNodes.map(r=>r.node.id)),byId=new Map(value.artworkNodes.map(r=>[r.node.id,r])),nodes=(projected||[]).filter(n=>!ids.has(n.id));
      for(const id of ids){const receipt=byId.get(id);if(receipt?.visible){nodes.push(mergeArtworkFields(receipt.node,b.frame?.get(id),(live||[]).find(n=>n.id===id)));b.deleted.delete(id);}else b.deleted.add(id);b.changes.set(id,++b.revision);}
      publish(b,{nodes:sortCanvasArtworks(nodes)});
    },
  };
  function bind(scope:CanvasDocumentScope,owner:string,writable:boolean){
    const key=documentKey(scope);let b=buckets.get(key);
    if(!b){b={snapshot:EMPTY_ARTWORK_DOCUMENT,listeners:new Set(),revision:0,changes:new Map(),deleted:new Set(),dimensionSync:new Set(),read:0,rowReads:new Map(),statusRead:0,trashRead:0};buckets.set(key,b);}
    const state=b,current=(extra:()=>boolean=()=>true)=>scope.documentCurrent()&&extra();
    const update=(change:Artwork[]|null|((nodes:Artwork[]|null)=>Artwork[]|null))=>{
      if(!current())return;const previous=state.snapshot.nodes,next=typeof change==="function"?change(previous):change;
      if(previous===next)return;state.revision++;const before=new Map((previous||[]).map(n=>[n.id,n])),after=new Map((next||[]).map(n=>[n.id,n]));
      for(const [id,node] of after){if(node!==before.get(id)){state.changes.set(id,state.revision);state.deleted.delete(id);}}
      for(const id of before.keys())if(!after.has(id)){state.changes.set(id,state.revision);state.deleted.add(id);}
      publish(state,{nodes:next});
    };
    const accept=(nodes:Artwork[])=>update(current=>sortCanvasArtworks(new Map([...(current||[]).map(n=>[n.id,n] as const),...nodes.map(n=>[n.id,n] as const)]).values()));
    /** Image decode metadata is document-owned, not a layout/history command.
     * A failed write allows the next observation; it never schedules a retry. */
    const recordDimensions=async(id:string,width:number,height:number):Promise<void>=>{
      const w=Math.round(width),h=Math.round(height);
      if(!current()||!id||!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||w>8192||h>8192)return;
      update(nodes=>nodes?.map(art=>art.id===id&&(art.width!==w||art.height!==h)?{...art,width:w,height:h}:art)??nodes);
      if(!owner||!writable||state.dimensionSync.has(id))return;
      state.dimensionSync.add(id);
      try{
        const response=await canvasDocumentFetch(scope,"/api/artworks/dimensions",{
          method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,width:w,height:h}),
        });
        if(!response.ok)state.dimensionSync.delete(id);
      }catch{state.dimensionSync.delete(id);}
    };
    const remove=(ids:string[])=>{if(!current())return [];const wanted=new Set(ids);update(nodes=>(nodes||[]).filter(n=>!wanted.has(n.id)));for(const id of wanted){state.deleted.add(id);state.changes.set(id,++state.revision);}return state.snapshot.nodes||[];};
    const applyRead=(rows:Artwork[],before:Map<string,Artwork>,revision:number,ticket:number,full:boolean)=>{
      const live=new Map((state.snapshot.nodes||[]).map(n=>[n.id,n])),next=full?new Map<string,Artwork>():new Map(live);
      for(const row of rows){
        if(state.deleted.has(row.id))continue;
        const last=state.rowReads.get(row.id)||0;
        if(last>ticket){if(live.has(row.id))next.set(row.id,live.get(row.id)!);continue;}
        next.set(row.id,mergeArtworkFields(row,before.get(row.id),live.get(row.id)));state.rowReads.set(row.id,ticket);
      }
      if(full)for(const [id,node] of live)if(!state.deleted.has(id)&&((state.changes.get(id)||0)>revision||(state.rowReads.get(id)||0)>ticket))next.set(id,next.get(id)||node);
      // An authoritative absence is a read result too. Otherwise an older ID
      // request can reinsert a row removed by a newer full read.
      if(full)for(const id of new Set([...before.keys(),...live.keys()]))if(!next.has(id))state.rowReads.set(id,Math.max(ticket,state.rowReads.get(id)||0));
      publish(state,{nodes:sortCanvasArtworks(next.values())});
    };
    const read=async(ids:string[]|undefined,extra:()=>boolean=()=>true,initial=false):Promise<Artwork[]>=>{
      if(!owner||!current(extra))return [];const wanted=ids?[...new Set(ids.filter(Boolean))]:undefined;
      if(wanted&&!wanted.length)return state.snapshot.nodes||[];
      const ticket=++state.read,revision=state.revision,before=new Map((state.snapshot.nodes||[]).map(n=>[n.id,n]));state.lastIds=wanted;state.statusRead=ticket;
      const readScope={...scope,documentCurrent:()=>current(extra)};
      publish(state,{phase:"loading",error:""});
      try{
        let rows:Artwork[];
        if(wanted){
          invalidateBrowserData(owner);rows=[];
          for(let offset=0;offset<wanted.length;offset+=100){
            if(!current(extra))return [];
            const chunk=wanted.slice(offset,offset+100),response=await canvasDocumentFetch(readScope,`/api/artworks/get?email=${encodeURIComponent(owner)}&ids=${chunk.map(encodeURIComponent).join(",")}`,{cache:"no-store",signal:AbortSignal.timeout(20_000)});
            const body=await response.json();if(!response.ok)throw new ArtworkReadError("作品同步失败，请重试读取",response.status);
            const found=artworkRows(body?.artworks);if(found.some(row=>!chunk.includes(row.id)))throw new ArtworkReadError("作品响应与请求不匹配");rows.push(...found);
          }
        }else{
          if(!initial)invalidateBrowserData(owner);
          let snapshot;
          for(let attempt=0;attempt<3;attempt++){
            try{snapshot=await loadAccountSnapshot<Artwork>(owner,"",undefined,{partition:scope.workspace,isCurrent:()=>current(extra),request:(url,init)=>canvasDocumentFetch(readScope,url,{...init,signal:AbortSignal.timeout(20_000)})});break;}
            catch(error){if(!current(extra)||attempt===2||!(error instanceof Error)||error.message!=="Account snapshot superseded")throw error;}
          }
          rows=artworkRows(snapshot?.artworks);
        }
        if(!current(extra))return [];
        applyRead(rows,before,revision,ticket,!wanted);
        if(wanted&&wanted.some(id=>!rows.some(row=>row.id===id)||!state.snapshot.nodes?.some(row=>row.id===id)))throw new ArtworkReadError("作品已保存或状态已变化，画布尚未同步完整；请重试同步原结果");
        if(ticket>=state.statusRead){state.statusRead=ticket;publish(state,{phase:"ready",error:""});}
        return state.snapshot.nodes||[];
      }catch(error){
        if(!current(extra))return [];
        if(ticket>=state.statusRead){state.statusRead=ticket;publish(state,{phase:"error",error:error instanceof ArtworkReadError?error.message:"作品读取失败，请重试",...(denied(error)?{nodes:null}:{} )});}
        throw error;
      }finally{if(scope.documentCurrent()&&!extra()&&ticket===state.statusRead)publish(state,{phase:state.snapshot.nodes===null?"idle":"ready"});}
    };
    const loadTrash=async()=>{
      if(!current())return;const ticket=++state.trashRead;publish(state,{trashError:""});
      try{const response=await canvasDocumentFetch({...scope,project:null},`/api/artworks/trash?email=${encodeURIComponent(owner)}`,{cache:"no-store",signal:AbortSignal.timeout(20_000)}),body=await response.json();
        if(!response.ok)throw new ArtworkReadError(body?.error||"回收站读取失败",response.status);
        if(current()&&ticket===state.trashRead)publish(state,{trash:artworkRows(body?.artworks),trashError:""});
      }catch(error){if(current()&&ticket===state.trashRead)publish(state,{trashError:error instanceof Error?error.message:"回收站读取失败",...(denied(error)?{trash:null}:{})});}
    };
    const trashAction=async(action:"restore"|"purge",ids:string[])=>{
      if(!current()||!writable||!ids.length||state.snapshot.trashBusy)return;publish(state,{trashBusy:true});
      try{
        const response=await canvasDocumentFetch({...scope,project:null},"/api/artworks/trash",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:owner,action,ids}),signal:AbortSignal.timeout(20_000)}),body=await response.json();
        if(!response.ok)throw new ArtworkReadError(body?.error||"回收站操作失败",response.status);
        invalidateBrowserData(owner);publish(state,{trash:state.snapshot.trash?.filter(n=>!ids.includes(n.id))??null});
        if(action==="restore"){for(const id of ids)state.deleted.delete(id);if(current())await read(ids);}else remove(ids);
      }finally{publish(state,{trashBusy:false});}
    };
    const resolveConflict=(id:string,choice:"local"|"server")=>{
      if(!current()||!writable)return null;const conflict=state.snapshot.conflicts[id];if(!conflict)return null;
      if(choice==="local")return conflict.current?.visible?rebaseCanvasArtworkAction(conflict.action,conflict.current,conflict.undo):null;
      const conflicts={...state.snapshot.conflicts};delete conflicts[id];const nodes=(state.snapshot.nodes||[]).filter(n=>n.id!==id);if(conflict.current?.visible)nodes.push(conflict.current.node);update(sortCanvasArtworks(nodes));publish(state,{conflicts});return null;
    };
    const clearConflict=(id:string)=>{const conflicts={...state.snapshot.conflicts};delete conflicts[id];publish(state,{conflicts});};
    return {resolveConflict,clearConflict,history,getSnapshot:()=>state.snapshot,subscribe:(fn:()=>void)=>{state.listeners.add(fn);return()=>{state.listeners.delete(fn);};},set:update,accept,remove,recordDimensions,
      merge:(ids:string[],extra?:()=>boolean)=>read(ids,extra),refresh:(extra?:()=>boolean)=>read(undefined,extra),load:()=>read(undefined,undefined,true),retry:()=>read(state.lastIds),loadTrash,trashAction};
  }
  return {bind};
}
