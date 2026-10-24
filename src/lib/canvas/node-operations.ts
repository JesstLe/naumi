import {browserRandomUUID} from "../browser-crypto";
import type {Artwork} from "../mock-data";
import {canvasDocumentFetch,type CanvasDocumentScope} from "./document-scope";
import {canvasHistoryScope,type CanvasHistoryAction} from "./history-model";
import {canvasDeleteRecords,canvasDeletionAction,type CanvasNodeRecords} from "./node-commands";
import type {CanvasNodeCopyInput,CanvasNodeCopyResult} from "./node-copy-contract";
import type {CanvasVideoNode} from "./video-node-schema";

type CopyIntent=Omit<CanvasNodeCopyInput,"operationId">;
type Ports={
  writable:()=>boolean;snapshot:()=>CanvasNodeRecords;
  history:{transaction<T>(scope:CanvasDocumentScope,work:()=>Promise<T>):Promise<T>;
    acknowledge(scope:CanvasDocumentScope,action:CanvasHistoryAction,persisted:boolean):void;record(scope:CanvasDocumentScope,action:CanvasHistoryAction):void};
  artworks:(ids:string[])=>Promise<Artwork[]>;
  videos:(nodes:CanvasVideoNode[],current:()=>boolean)=>void;
};
class NodeRequestError extends Error{constructor(message:string,readonly status:number){super(message);}}
async function post(scope:CanvasDocumentScope,url:string,body:unknown){
  const response=await canvasDocumentFetch(scope,url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)},true);
  const data=await response.json().catch(()=>null);if(!response.ok)throw new NodeRequestError(data?.error||"画布操作失败",response.status);
  if(!data?.ok)throw new Error("画布保存结果待核实，请重试原操作");return data;
}
const rejected=(error:unknown)=>error instanceof NodeRequestError&&error.status>=400&&error.status<500;
const atProject=(scope:CanvasDocumentScope,project:string|null):CanvasDocumentScope=>({...scope,project,key:canvasHistoryScope(scope.account,scope.workspace,project)});

/** Node lifecycle operations, not a new task framework: existing history is the
 * sole serialization/undo owner; copy/project-delete retain their existing API
 * receipts. Known copied records resume reads, never copy them a second time. */
export function createCanvasNodeOperations(){
  type CopyAttempt={body:CanvasNodeCopyInput;result?:CanvasNodeCopyResult;action?:CanvasHistoryAction;recorded?:boolean;flight?:Promise<CanvasNodeCopyResult>};
  const copies=new Map<string,CopyAttempt>(),deletions=new Map<string,{body:{projectKey:string;operationId:string};saved?:boolean;persisted?:boolean;flight?:Promise<void>}>();
  type Removal={body?:{operationId:string;artworkIds:string[];textIds:string[];videoIds:string[]};records?:CanvasNodeRecords;action?:CanvasHistoryAction;recorded?:boolean;saved?:boolean;persisted?:boolean;flight?:Promise<boolean>};
  const removals=new Map<string,Removal>();
  function bind(scope:CanvasDocumentScope,ports:Ports){
    const assert=()=>{scope.assertView();if(!ports.writable())throw new Error("当前画布为只读");};
    const copy=(intent:CopyIntent,purpose:"selection"|"duplicate"|"history"="selection"):Promise<CanvasNodeCopyResult>=>{
      assert();const key=JSON.stringify([scope.account,scope.workspace,scope.project,purpose,[...intent.ids].sort(),intent.projectKey]);let attempt=copies.get(key);
      if(!attempt){attempt={body:structuredClone({...intent,operationId:browserRandomUUID()})};copies.set(key,attempt);}
      if(attempt.flight)return attempt.flight;
      const retained=attempt;
      const run=ports.history.transaction(scope,async()=>{
        assert();
        if(!retained.result){
          const result=await post(atProject(scope,intent.projectKey||null),"/api/canvas/nodes/copy",retained.body);
          if(!Array.isArray(result.artworkIds)||!Array.isArray(result.textNodes)||!Array.isArray(result.nodes)||!result.projectKey||!result.idMap||Object.keys(result.idMap).length!==retained.body.ids.length||retained.body.ids.some(id=>typeof result.idMap[id]!=="string")||retained.body.projectKey&&retained.body.projectKey!==result.projectKey)throw new Error("复制结果待同步，请重试原操作");
          retained.result=result;
        }
        const result=retained.result!;
        if(!scope.documentCurrent())throw new Error("节点已复制，请返回原账号同步");
        const artworks=await ports.artworks(result.artworkIds);
        if(!scope.documentCurrent())throw new Error("节点已复制，请返回原账号同步");
        if(result.artworkIds.some(id=>!artworks.some(node=>node.id===id)))throw new Error("节点已复制，作品尚未同步，请重试原操作");
        retained.action??={kind:"mixed-add",artworks:artworks.filter(node=>result.artworkIds.includes(node.id)),textNodes:result.textNodes,videoNodes:result.nodes,projectKey:result.projectKey};
        const target=atProject(scope,result.projectKey);
        // Record the durable mutation before any optional presentation refresh.
        if(!retained.recorded){ports.history.record(target,retained.action);retained.recorded=true;}
        ports.history.acknowledge(target,retained.action,true);ports.videos(result.nodes,scope.documentCurrent);
        copies.delete(key);return result;
      }).catch(error=>{if(!retained.result&&rejected(error))copies.delete(key);throw error;}).finally(()=>{retained.flight=undefined;});
      retained.flight=run;return run;
    };
    const remove=(ids:string[]):Promise<boolean>=>{
      assert();const key=JSON.stringify([scope.account,scope.workspace,scope.project,[...new Set(ids)].sort()]);let attempt=removals.get(key);
      if(!attempt){attempt={};removals.set(key,attempt);}if(attempt.flight)return attempt.flight;const retained=attempt;
      const run=ports.history.transaction(scope,async()=>{
        assert();
        if(!retained.body){
          const records=canvasDeleteRecords(ids,ports.snapshot()),action=canvasDeletionAction(records);
          if(!action){removals.delete(key);return false;}
          retained.records=records;retained.action=action;
          retained.body={operationId:browserRandomUUID(),artworkIds:records.artworks.map(node=>node.id),textIds:records.textNodes.map(node=>node.id),videoIds:records.videoNodes.map(node=>node.id)};
        }
        if(!retained.saved){const result=await post(scope,"/api/canvas/nodes/delete",retained.body);retained.saved=true;retained.persisted=result.persisted!==false;}
        if(!scope.documentCurrent())throw new Error("节点已删除，请返回原账号同步");
        if(!retained.recorded){ports.history.record(scope,retained.action!);retained.recorded=true;}
        ports.history.acknowledge(scope,retained.action!,retained.persisted!==false);
        const now=new Date().toISOString();ports.videos(retained.records!.videoNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        removals.delete(key);return true;
      }).catch(error=>{if(!retained.body||!retained.saved&&rejected(error))removals.delete(key);throw error;}).finally(()=>{retained.flight=undefined;});
      retained.flight=run;return run;
    };
    const removeProject=(projectKey:string):Promise<void>=>{
      assert();const key=JSON.stringify([scope.account,scope.workspace,projectKey]);let attempt=deletions.get(key);
      if(!attempt){attempt={body:{projectKey,operationId:browserRandomUUID()}};deletions.set(key,attempt);}
      if(attempt.flight)return attempt.flight;const retained=attempt;
      const run=ports.history.transaction(scope,async()=>{
        assert();if(!retained.saved){const result=await post(atProject(scope,projectKey),"/api/canvas/nodes/delete",retained.body);retained.saved=true;retained.persisted=result.persisted!==false;}
        if(!scope.documentCurrent())throw new Error("项目已删除，请返回原账号同步");
        const nodes=ports.snapshot(),kind=projectKey.slice(0,projectKey.indexOf(":")),id=projectKey.slice(projectKey.indexOf(":")+1);
        const records={artworks:nodes.artworks.filter(node=>kind==="batch"?node.batchId===id:node.groupId===id||node.id===id),textNodes:nodes.textNodes.filter(node=>node.projectKey===projectKey),videoNodes:nodes.videoNodes.filter(node=>node.projectKey===projectKey)};
        const action=canvasDeletionAction(records);if(action)ports.history.acknowledge(atProject(scope,projectKey),action,retained.persisted!==false);
        const now=new Date().toISOString();ports.videos(records.videoNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        deletions.delete(key);
      }).catch(error=>{if(!retained.saved&&rejected(error))deletions.delete(key);throw error;}).finally(()=>{retained.flight=undefined;});
      retained.flight=run;return run;
    };
    return {copy,remove,removeProject};
  }
  return {bind};
}
