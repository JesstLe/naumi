import type {Artwork} from "../mock-data";
import {browserRandomUUID} from "../browser-crypto";
import {canvasDocumentFetch,type CanvasDocumentScope} from "./document-scope";
import {canvasHistoryScope,type CanvasHistoryAction} from "./history-model";
import type {ImportedManifest} from "./workflow-clipboard";
type Snapshot={manifests:ImportedManifest[];phase:"idle"|"loading"|"ready"|"error";error:string};
export const EMPTY_WORKFLOW_DOCUMENT:Snapshot={manifests:[],phase:"idle",error:""};
type Fill={operationId:string;file:File;sent?:boolean;receipt?:{node:Artwork;assetOperationId:string;beforeAsset:{image:string;source:string;width:number;height:number};afterAsset:{image:string;source:string;width:number;height:number}};recorded?:boolean;flight?:Promise<void>};
type Bucket={snapshot:Snapshot;listeners:Set<()=>void>;read:number;changes:Map<string,number>;revision:number;fills:Map<string,Fill>};
type Ports={writable:()=>boolean;merge:(ids:string[])=>Promise<Artwork[]>;history:{record:(scope:CanvasDocumentScope,action:CanvasHistoryAction)=>void}};

/** Workflow metadata and fill continuation share the existing artwork document
 * and history; this owner holds no alternate graph or undo stack. Reads cannot
 * silently become an empty success or cross an actor/workspace epoch. */
export function createCanvasWorkflowDocument(){
  const buckets=new Map<string,Bucket>();
  function bind(scope:CanvasDocumentScope,email:string,ports:Ports){
    const key=JSON.stringify([scope.account,scope.workspace]);let bucket=buckets.get(key);
    if(!bucket){bucket={snapshot:EMPTY_WORKFLOW_DOCUMENT,listeners:new Set(),read:0,changes:new Map(),revision:0,fills:new Map()};buckets.set(key,bucket);}
    const state=bucket,publish=(patch:Partial<Snapshot>)=>{state.snapshot={...state.snapshot,...patch};state.listeners.forEach(fn=>fn());};
    const accept=(manifest:ImportedManifest)=>{if(!scope.documentCurrent())return;state.changes.set(manifest.operationId,++state.revision);publish({manifests:[...state.snapshot.manifests.filter(m=>m.operationId!==manifest.operationId),manifest]});};
    const load=async()=>{
      if(!email||!scope.documentCurrent())return;const ticket=++state.read,revision=state.revision;publish({phase:"loading",error:""});
      try{
        const response=await canvasDocumentFetch({...scope,project:null},`/api/canvas/workflow-import?email=${encodeURIComponent(email)}`,{cache:"no-store",signal:AbortSignal.timeout(20_000)}),data=await response.json();
        if(!response.ok||!Array.isArray(data.manifests))throw new Error(data.error||"工作流分组读取失败，请重试");
        if(!scope.documentCurrent()||ticket!==state.read)return;
        const incoming=new Map<string,ImportedManifest>(data.manifests.map((m:ImportedManifest)=>[m.operationId,m]));
        for(const item of state.snapshot.manifests)if((state.changes.get(item.operationId)||0)>revision)incoming.set(item.operationId,item);
        publish({manifests:[...incoming.values()],phase:"ready",error:""});
      }catch(error){if(scope.documentCurrent()&&ticket===state.read)publish({phase:"error",error:error instanceof Error?error.message:"工作流分组读取失败，请重试"});}
    };
    function fill(artwork:Artwork,file:File){
      scope.assertView();if(!ports.writable())return Promise.reject(new Error("当前画布为只读"));
      const fingerprint=JSON.stringify([artwork.id,file.name,file.size,file.lastModified]);let attempt=state.fills.get(fingerprint);
      if(!attempt){attempt={operationId:browserRandomUUID(),file};state.fills.set(fingerprint,attempt);}if(attempt.flight)return attempt.flight;const saved=attempt;
      const project=artwork.batchId?`batch:${artwork.batchId}`:`tree:${artwork.groupId||artwork.id}`,target={...scope,project,key:canvasHistoryScope(scope.account,scope.workspace,project)};
      const run=(async()=>{
        if(!saved.receipt&&saved.sent){
          const response=await canvasDocumentFetch(target,`/api/canvas/workflow-import/asset?id=${encodeURIComponent(artwork.id)}&operationId=${encodeURIComponent(saved.operationId)}`,{cache:"no-store",signal:AbortSignal.timeout(20_000)}),data=await response.json();
          if(response.ok)saved.receipt=data;else if(response.status!==404)throw new Error(data.error||"原补图结果待核实，请重试");
        }
        if(!saved.receipt){
          const form=new FormData();form.set("id",artwork.id);form.set("operationId",saved.operationId);form.set("image",saved.file);saved.sent=true;
          const response=await canvasDocumentFetch(target,"/api/canvas/workflow-import/asset",{method:"POST",body:form,signal:AbortSignal.timeout(60_000)}),data=await response.json();
          if(!response.ok)throw new Error(data.error||"补图失败，请重试原操作");saved.receipt=data;
        }
        if(!saved.receipt?.node||saved.receipt.node.id!==artwork.id||saved.receipt.assetOperationId!==saved.operationId||!saved.receipt.beforeAsset||!saved.receipt.afterAsset)throw new Error("补图回执尚未同步，请重试原操作");
        if(!scope.documentCurrent())throw new Error("图片已补齐，请返回原账号和工作空间同步");
        const rows=await ports.merge([artwork.id]);if(!scope.documentCurrent())throw new Error("图片已补齐，请返回原账号和工作空间同步");
        const node=rows.find(row=>row.id===artwork.id);if(!node)throw new Error("图片已补齐，原节点尚未同步，请重试");
        if(!saved.recorded){ports.history.record(target,{kind:"workflow-fill",id:node.id,assetOperationId:saved.operationId,from:{...node,...saved.receipt.beforeAsset},to:{...node,...saved.receipt.afterAsset}});saved.recorded=true;}
        state.fills.delete(fingerprint);
      })().finally(()=>{saved.flight=undefined;});saved.flight=run;return run;
    }
    return {accept,load,fill,getSnapshot:()=>state.snapshot,subscribe:(fn:()=>void)=>{state.listeners.add(fn);return()=>{state.listeners.delete(fn);};}};
  }
  return {bind};
}
