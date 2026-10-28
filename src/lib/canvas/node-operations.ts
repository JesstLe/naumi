import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {CanvasAudioNode} from "./audio-node-schema";
import type {CanvasSceneNode} from "./scene-node-schema";
import type {CanvasCharacterNode} from "./character-node-schema";
import {artworkFields,type CanvasArtworkConflict,type CanvasArtworkReceipt} from "./artwork-write";
import type {TextDocumentConflict} from "./text-document";
import {browserRandomUUID} from "../browser-crypto";
import type {Artwork} from "../mock-data";
import {canvasDocumentFetch,type CanvasDocumentScope} from "./document-scope";
import {canvasHistoryScope,type CanvasHistoryAction} from "./history-model";
import {canvasDeleteRecords,canvasDeletionAction,type CanvasNodeRecords} from "./node-commands";
import type {CanvasNodeCopyInput,CanvasNodeCopyResult} from "./node-copy-contract";
import type {CanvasDirectorNode} from "./director-node-schema";
import type {CanvasVideoNode} from "./video-node-schema";

type CopyIntent=Omit<CanvasNodeCopyInput,"operationId">;
type Ports={
  writable:()=>boolean;snapshot:()=>CanvasNodeRecords;
  history:{artworkConflict?:(scope:CanvasDocumentScope,value:CanvasArtworkConflict,action:CanvasHistoryAction)=>void;conflict?:(scope:CanvasDocumentScope,value:TextDocumentConflict)=>void;transaction<T>(scope:CanvasDocumentScope,work:()=>Promise<T>):Promise<T>;
    acknowledge(scope:CanvasDocumentScope,action:CanvasHistoryAction,persisted:boolean,receipt?:{artworkNodes?:CanvasArtworkReceipt[];artworkIds?:string[]}):void;record(scope:CanvasDocumentScope,action:CanvasHistoryAction):void};
  artworks:(ids:string[])=>Promise<Artwork[]>;
  videos:(nodes:CanvasVideoNode[],current:()=>boolean)=>void;
  directors?:(nodes:CanvasDirectorNode[],current:()=>boolean)=>void;
  characters?:(nodes:CanvasCharacterNode[],current:()=>boolean)=>void;
  audios?:(nodes:CanvasAudioNode[],current:()=>boolean)=>void;
  timelines?:(nodes:CanvasTimelineNode[],current:()=>boolean)=>void;
  scenes?:(nodes:CanvasSceneNode[],current:()=>boolean)=>void;
};
class NodeRequestError extends Error{constructor(message:string,readonly status:number,readonly conflict?:TextDocumentConflict,readonly artworkConflict?:CanvasArtworkConflict){super(message);}}
async function post(scope:CanvasDocumentScope,url:string,body:unknown){
  const response=await canvasDocumentFetch(scope,url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)},true);
  const data=await response.json().catch(()=>null);if(!response.ok)throw new NodeRequestError(data?.error||"画布操作失败",response.status,data?.code==="CANVAS_TEXT_CONFLICT"?{id:data.id,fields:data.fields,current:data.current}:undefined,data?.code==="CANVAS_ARTWORK_CONFLICT"?{id:data.id,fields:data.fields,current:data.current}:undefined);
  if(!data?.ok)throw new Error("画布保存结果待核实，请重试原操作");return data;
}
const rejected=(error:unknown)=>error instanceof NodeRequestError&&error.status>=400&&error.status<500;
const atProject=(scope:CanvasDocumentScope,project:string|null):CanvasDocumentScope=>({...scope,project,key:canvasHistoryScope(scope.account,scope.workspace,project)});

/** Node lifecycle operations, not a new task framework: existing history is the
 * sole serialization/undo owner; copy/project-delete retain their existing API
 * receipts. Known copied records resume reads, never copy them a second time. */
export function createCanvasNodeOperations(){
  type CopyAttempt={body:CanvasNodeCopyInput;result?:CanvasNodeCopyResult;action?:CanvasHistoryAction;recorded?:boolean;flight?:Promise<CanvasNodeCopyResult>};
  const copies=new Map<string,CopyAttempt>(),deletions=new Map<string,{body:{projectKey:string;operationId:string};saved?:boolean;receipt?:{artworkNodes?:CanvasArtworkReceipt[];artworkIds?:string[]};persisted?:boolean;flight?:Promise<void>}>();
  type Removal={body?:{operationId:string;artworkIds:string[];textIds:string[];videoIds:string[];directorIds?:string[];characterIds?:string[];sceneIds?:string[];audioIds?:string[];timelineIds?:string[];expectedTexts?:import("./text-document-model").CanvasTextNode[];expectedArtworks?:Array<{id:string;fields:import("./artwork-write").CanvasArtworkFields}>};records?:CanvasNodeRecords;action?:CanvasHistoryAction;recorded?:boolean;saved?:boolean;receipt?:{artworkNodes?:CanvasArtworkReceipt[];artworkIds?:string[]};persisted?:boolean;flight?:Promise<boolean>};
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
        retained.action??={kind:"mixed-add",artworks:artworks.filter(node=>result.artworkIds.includes(node.id)),textNodes:result.textNodes,videoNodes:result.nodes,...(result.directorNodes?{directorNodes:result.directorNodes}:{}),...(result.characterNodes?{characterNodes:result.characterNodes}:{}),...(result.sceneNodes?{sceneNodes:result.sceneNodes}:{}),...(result.audioNodes?{audioNodes:result.audioNodes}:{}),...(result.timelineNodes?{timelineNodes:result.timelineNodes}:{}),projectKey:result.projectKey};
        const target=atProject(scope,result.projectKey);
        // Record the durable mutation before any optional presentation refresh.
        if(!retained.recorded){ports.history.record(target,retained.action);retained.recorded=true;}
        ports.history.acknowledge(target,retained.action,true);ports.videos(result.nodes,scope.documentCurrent);if(result.directorNodes)ports.directors?.(result.directorNodes,scope.documentCurrent);if(result.characterNodes)ports.characters?.(result.characterNodes,scope.documentCurrent);if(result.sceneNodes)ports.scenes?.(result.sceneNodes,scope.documentCurrent);if(result.audioNodes)ports.audios?.(result.audioNodes,scope.documentCurrent);if(result.timelineNodes)ports.timelines?.(result.timelineNodes,scope.documentCurrent);
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
          retained.body={operationId:browserRandomUUID(),artworkIds:records.artworks.map(node=>node.id),textIds:records.textNodes.map(node=>node.id),videoIds:records.videoNodes.map(node=>node.id),...(records.directorNodes?.length?{directorIds:records.directorNodes.map(node=>node.id)}:{}),...(records.characterNodes?.length?{characterIds:records.characterNodes.map(node=>node.id)}:{}),...(records.sceneNodes?.length?{sceneIds:records.sceneNodes.map(node=>node.id)}:{}),...(records.audioNodes?.length?{audioIds:records.audioNodes.map(node=>node.id)}:{}),...(records.timelineNodes?.length?{timelineIds:records.timelineNodes.map(node=>node.id)}:{}),expectedTexts:records.textNodes,expectedArtworks:records.artworks.map(n=>({id:n.id,fields:artworkFields(n)}))};
        }
        if(!retained.saved){const result=await post(scope,"/api/canvas/nodes/delete",retained.body);retained.saved=true;retained.receipt=result;retained.persisted=result.persisted!==false;}
        if(!scope.documentCurrent())throw new Error("节点已删除，请返回原账号同步");
        if(!retained.recorded){ports.history.record(scope,retained.action!);retained.recorded=true;}
        ports.history.acknowledge(scope,retained.action!,retained.persisted!==false,retained.receipt);
        const now=new Date().toISOString();ports.videos(retained.records!.videoNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(retained.records!.directorNodes)ports.directors?.(retained.records!.directorNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(retained.records!.characterNodes)ports.characters?.(retained.records!.characterNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(retained.records!.sceneNodes)ports.scenes?.(retained.records!.sceneNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(retained.records!.audioNodes)ports.audios?.(retained.records!.audioNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(retained.records!.timelineNodes)ports.timelines?.(retained.records!.timelineNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        removals.delete(key);return true;
      }).catch(error=>{if(error instanceof NodeRequestError&&error.conflict)ports.history.conflict?.(scope,error.conflict);if(error instanceof NodeRequestError&&error.artworkConflict&&retained.action)ports.history.artworkConflict?.(scope,error.artworkConflict,retained.action);if(!retained.body||!retained.saved&&rejected(error))removals.delete(key);throw error;}).finally(()=>{retained.flight=undefined;});
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
        const records={artworks:nodes.artworks.filter(node=>kind==="batch"?node.batchId===id:node.groupId===id||node.id===id),textNodes:nodes.textNodes.filter(node=>node.projectKey===projectKey),videoNodes:nodes.videoNodes.filter(node=>node.projectKey===projectKey),...(nodes.directorNodes?{directorNodes:nodes.directorNodes.filter(node=>node.projectKey===projectKey)}:{}),...(nodes.characterNodes?{characterNodes:nodes.characterNodes.filter(node=>node.projectKey===projectKey)}:{}),...(nodes.sceneNodes?{sceneNodes:nodes.sceneNodes.filter(node=>node.projectKey===projectKey)}:{}),...(nodes.audioNodes?{audioNodes:nodes.audioNodes.filter(node=>node.projectKey===projectKey)}:{}),...(nodes.timelineNodes?{timelineNodes:nodes.timelineNodes.filter(node=>node.projectKey===projectKey)}:{})};
        const action=canvasDeletionAction(records);if(action)ports.history.acknowledge(atProject(scope,projectKey),action,retained.persisted!==false);
        const now=new Date().toISOString();ports.videos(records.videoNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(records.directorNodes)ports.directors?.(records.directorNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(records.characterNodes)ports.characters?.(records.characterNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(records.sceneNodes)ports.scenes?.(records.sceneNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(records.audioNodes)ports.audios?.(records.audioNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        if(records.timelineNodes)ports.timelines?.(records.timelineNodes.map(node=>({...node,deletedAt:now,revision:node.revision+1})),scope.documentCurrent);
        deletions.delete(key);
      }).catch(error=>{if(!retained.saved&&rejected(error))deletions.delete(key);throw error;}).finally(()=>{retained.flight=undefined;});
      retained.flight=run;return run;
    };
    return {copy,remove,removeProject};
  }
  return {bind};
}
