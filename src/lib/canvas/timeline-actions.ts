import {browserRandomUUID} from "../browser-crypto";
import {newTimelineProject} from "../timeline/project";
import type {Artwork} from "../mock-data";
import type {VideoInputChoice} from "../video/input-choice";
import type {PublicMediaJob} from "../video/media-job-schema";
import type {CanvasTimelineNode,TimelineNodeWrite,TimelineMaterial} from "./timeline-node-schema";
import type {CanvasDocumentScope} from "./document-scope";
import type {TimelinePatchFields,CanvasHistoryAction} from "./history-model";
import {canvasDocumentFetch} from "./document-scope";

type Ports={
  english?:boolean;writable:()=>boolean;settingsReady:()=>boolean;locked:(id:string)=>boolean;
  store:{getNode:(id:string)=>CanvasTimelineNode|undefined;flush:()=>Promise<unknown>;
    save:(id:string,patch:Partial<Omit<TimelineNodeWrite,"id"|"operationId">>)=>Promise<CanvasTimelineNode>;
    render:(id:string,revision:number,operationId:string)=>Promise<{node:CanvasTimelineNode;job:PublicMediaJob}>;
    adopt:(id:string,revision:number,operationId:string,jobId:string)=>Promise<CanvasTimelineNode>;
    inspect:(id:string,ids:string[])=>Promise<TimelineMaterial[]>;
    accept?:(nodes:CanvasTimelineNode[],isCurrent:()=>boolean)=>void};
  location:(at:{x:number;y:number},id:string)=>{projectKey:string;x:number;y:number};
  created:(node:CanvasTimelineNode)=>void;history:(action:CanvasHistoryAction)=>void;
  upload:(files:File[],project:string)=>Promise<VideoInputChoice[]>;merge:(ids:string[])=>Promise<Artwork[]>;
  jobs:readonly PublicMediaJob[];refresh:()=>Promise<unknown>;
};
type RenderAttempt={signature:string;operationId:string;expectedRevision:number};
type AdoptAttempt={jobId:string;operationId:string;expectedRevision:number;from:CanvasTimelineNode["adopted"]};

/** Native multitrack commands. The original node CAS, shared document history
 * and media jobs remain the only persistence, execution and billing owners.
 * Attempts are scoped to the originating account/workspace/project, including
 * when acceptance succeeded but its browser response was lost. */
export function createCanvasTimelineActions(){
  const creating=new Set<string>(),renders=new Map<string,RenderAttempt>(),adoptions=new Map<string,AdoptAttempt>();
  return {bind(scope:CanvasDocumentScope,ports:Ports){
    const label=(zh:string,en:string)=>ports.english?en:zh;
    const assert=()=>{scope.assertView();if(!ports.writable())throw new Error(label("多轨不可编辑","Multitrack is not editable"));};
    const editable=(id:string)=>{assert();if(!ports.settingsReady()||ports.locked(id))throw new Error(label("请先解锁多轨节点","Unlock this multitrack node first"));};
    const key=(id:string)=>JSON.stringify([scope.account,scope.workspace,scope.project,id]);
    return {
      async audioRequest(id:string,url:string,init:RequestInit={}){
        editable(id);if(!/^\/api\/canvas\/audio-operations(?:\/(?:catalog|quote|speech|transcribe|recover|adopt))?(?:\?|$)/.test(url))throw new Error("声音请求路径无效");
        const before=ports.store.getNode(id);if(!before||before.projectKey!==scope.project)throw new Error("声音工程不属于当前项目");
        const response=await canvasDocumentFetch(scope,url,init,true),data=await response.json();
        if(!response.ok)throw Object.assign(new Error(data.error||"声音操作尚未完成"),{status:response.status,code:data.code});
        if(data.node){
          if(data.node.id!==id||data.node.projectKey!==scope.project)throw new Error("声音采用回执不属于当前工程");
          if(scope.documentCurrent()){
            ports.store.accept?.([data.node],scope.documentCurrent);
            if(data.node.revision>before.revision&&JSON.stringify(before.timeline)!==JSON.stringify(data.node.timeline))ports.history({kind:"timeline-patch",id,from:{timeline:before.timeline},to:{timeline:data.node.timeline}});
          }
        }
        return data;
      },
      async inspect(id:string,ids:string[]){editable(id);const materials=await ports.store.inspect(id,ids);editable(id);return materials;},
      async create(at:{x:number;y:number}){
        assert();if(creating.has(scope.key))return;creating.add(scope.key);
        try{const id=`timeline-${browserRandomUUID()}`,node=await ports.store.save(id,{...ports.location(at,id),title:label("多轨","Multitrack"),timeline:newTimelineProject()});
          if(scope.documentCurrent())ports.history({kind:"timeline-add",records:[node]});if(scope.viewCurrent())ports.created(node);return node;
        }finally{creating.delete(scope.key);}
      },
      async patch(id:string,patch:TimelinePatchFields&{expectedRevision?:number}){
        editable(id);await ports.store.flush();editable(id);const before=ports.store.getNode(id);if(!before)throw new Error(label("多轨工程不存在","Multitrack not found"));
        const {expectedRevision,...fields}=patch,from:TimelinePatchFields={};
        for(const field of Object.keys(fields) as Array<keyof TimelinePatchFields>)Object.assign(from,{[field]:structuredClone(before[field])});
        const result=await ports.store.save(id,{...fields,expectedRevision:expectedRevision??before.revision});
        if(scope.documentCurrent()&&JSON.stringify(from)!==JSON.stringify(fields))ports.history({kind:"timeline-patch",id,from,to:fields});return result;
      },
      async upload(id:string,files:File[]){
        editable(id);const node=ports.store.getNode(id);if(!node)throw new Error(label("多轨工程不存在","Multitrack not found"));
        const choices=await ports.upload(files,node.projectKey);assert();const fresh=await ports.merge(choices.map(choice=>choice.nodeId));assert();
        if(fresh.length)ports.history({kind:"add",records:fresh});return choices;
      },
      async render(id:string,revision:number){
        editable(id);const node=ports.store.getNode(id);if(!node)throw new Error(label("多轨工程不存在","Multitrack not found"));
        const signature=JSON.stringify(node.timeline),binding=node.render,job=ports.jobs.find(job=>job.operationId===binding?.operationId),idKey=key(id);let attempt=renders.get(idKey);
        if(binding&&JSON.stringify(binding.project)===signature&&!["failed","cancelled"].includes(job?.status||"")&&(!job||node.adopted?.jobId!==job.id))attempt={signature,operationId:binding.operationId,expectedRevision:binding.baseRevision};
        else if(!attempt||attempt.signature!==signature)attempt={signature,operationId:browserRandomUUID(),expectedRevision:revision};
        renders.set(idKey,attempt);const result=await ports.store.render(id,attempt.expectedRevision,attempt.operationId);renders.delete(idKey);assert();await ports.refresh();return result;
      },
      async adopt(id:string,job:PublicMediaJob){
        editable(id);await ports.store.flush();editable(id);const before=ports.store.getNode(id);if(!before||job.status!=="completed")throw new Error(label("导出结果尚未完成","Export result is not completed"));
        const idKey=key(id);let attempt=adoptions.get(idKey);
        if(!attempt||attempt.jobId!==job.id)attempt={jobId:job.id,operationId:browserRandomUUID(),expectedRevision:before.revision,from:structuredClone(before.adopted)};
        adoptions.set(idKey,attempt);const result=await ports.store.adopt(id,attempt.expectedRevision,attempt.operationId,job.id);adoptions.delete(idKey);
        if(scope.documentCurrent()&&JSON.stringify(attempt.from)!==JSON.stringify(result.adopted))ports.history({kind:"timeline-patch",id,from:{adopted:attempt.from},to:{adopted:result.adopted}});return result;
      },
    };
  }};
}
