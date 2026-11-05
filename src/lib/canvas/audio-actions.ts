import {browserRandomUUID} from "../browser-crypto";
import {newAudioProject} from "../audio/project";
import type {Artwork} from "../mock-data";
import type {VideoInputChoice} from "../video/input-choice";
import type {PublicMediaJob} from "../video/media-job-schema";
import type {CanvasAudioNode,AudioNodeWrite} from "./audio-node-schema";
import type {CanvasDocumentScope} from "./document-scope";
import type {AudioPatchFields,CanvasHistoryAction} from "./history-model";

type Ports={
  english?:boolean;
  writable:()=>boolean;settingsReady:()=>boolean;locked:(id:string)=>boolean;
  store:{getNode:(id:string)=>CanvasAudioNode|undefined;flush:()=>Promise<unknown>;
    save:(id:string,patch:Partial<Omit<AudioNodeWrite,"id"|"operationId">>)=>Promise<CanvasAudioNode>;
    render:(id:string,revision:number,operationId:string)=>Promise<{node:CanvasAudioNode;job:PublicMediaJob}>};
  location:(at:{x:number;y:number},id:string)=>{projectKey:string;x:number;y:number};
  created:(node:CanvasAudioNode)=>void;history:(action:CanvasHistoryAction)=>void;
  upload:(files:File[],project:string)=>Promise<VideoInputChoice[]>;merge:(ids:string[])=>Promise<Artwork[]>;
  jobs:readonly PublicMediaJob[];refresh:()=>Promise<unknown>;notice:(message:string)=>void;
};
type RenderAttempt={signature:string;operationId:string;expectedRevision:number};

/** Native audio editing commands. Node CAS/history and the existing media job
 * remain the only persistence/execution owners. Scope-bound commands keep local
 * creation/render/adoption lifetimes out of the Canvas shell. No React or I/O
 * implementation lives here; the browser supplies its existing document ports. */
export function createCanvasAudioActions(){
  const creating=new Set<string>(),attempts=new Map<string,RenderAttempt>(),adopting=new Set<string>();
  return {bind(scope:CanvasDocumentScope,ports:Ports){
    const label=(zh:string,en:string)=>ports.english?en:zh;
    const assert=()=>{scope.assertView();if(!ports.writable())throw new Error(label("音频不可编辑","Audio is not editable"));};
    const key=(id:string)=>JSON.stringify([scope.account,scope.workspace,scope.project,id]);
    const patch=async(id:string,patch:AudioPatchFields&{expectedRevision?:number},resultAdoption=false)=>{
      assert();if(!ports.settingsReady()||ports.locked(id))throw new Error(label("请先解锁音频","Unlock audio first"));
      await ports.store.flush();assert();const before=ports.store.getNode(id);if(!before)throw new Error(label("音频不存在","Audio not found"));
      const {expectedRevision,...fields}=patch,from:AudioPatchFields={};
      for(const field of Object.keys(fields) as Array<keyof AudioPatchFields>)Object.assign(from,{[field]:structuredClone(before[field])});
      if(resultAdoption&&from.audio)from.audio={...from.audio,render:null};
      const result=await ports.store.save(id,{...fields,expectedRevision:expectedRevision??before.revision});
      if(scope.documentCurrent()&&JSON.stringify(from)!==JSON.stringify(fields))ports.history({kind:"audio-patch",id,from,to:fields});return result;
    };
    const adopt=async(id:string,job:PublicMediaJob)=>{
      assert();await ports.store.flush();assert();const node=ports.store.getNode(id),render=node?.audio.render,output=job.outputs.find(output=>output.mimeType.startsWith("audio/")&&!output.fragment);
      if(!node||node.deletedAt||!render||render.operationId!==job.operationId||job.status!=="completed"||!output)throw new Error(label("音频回执已改变，请重新读取","Audio receipt changed; reload the node"));
      return patch(id,{expectedRevision:node.revision,audio:{...node.audio,adopted:{artworkId:output.artworkId,sourceArtworkId:render.sourceArtworkId,edit:render.edit,jobId:job.id},render:null}},true);
    };
    return {patch,adopt,
      async create(at:{x:number;y:number}){
        assert();if(creating.has(scope.key))return;creating.add(scope.key);
        try{const id=`audio-${browserRandomUUID()}`,location=ports.location(at,id),node=await ports.store.save(id,{...location,title:label("音频","Audio"),audio:newAudioProject()});
          if(scope.documentCurrent())ports.history({kind:"audio-add",records:[node]});if(scope.viewCurrent())ports.created(node);return node;
        }finally{creating.delete(scope.key);}
      },
      async upload(id:string,files:File[]){
        assert();const node=ports.store.getNode(id);if(!node||ports.locked(id))throw new Error(label("音频不可编辑","Audio is not editable"));
        const choices=await ports.upload(files,node.projectKey);assert();
        const fresh=await ports.merge(choices.map(choice=>choice.nodeId));assert();if(fresh.length)ports.history({kind:"add",records:fresh});return choices.filter(choice=>choice.kind==="audio");
      },
      async render(id:string,revision:number){
        assert();const node=ports.store.getNode(id);if(!node||ports.locked(id))throw new Error(label("音频不可编辑","Audio is not editable"));
        const signature=JSON.stringify([node.audio.sourceArtworkId,node.audio.edit]),binding=node.audio.render,job=ports.jobs.find(job=>job.operationId===binding?.operationId),idKey=key(id);
        let attempt=attempts.get(idKey);
        if(binding&&JSON.stringify([binding.sourceArtworkId,binding.edit])===signature&&!["failed","cancelled"].includes(job?.status||""))attempt={signature,operationId:binding.operationId,expectedRevision:binding.baseRevision};
        else if(!attempt||attempt.signature!==signature)attempt={signature,operationId:browserRandomUUID(),expectedRevision:revision};
        attempts.set(idKey,attempt);const result=await ports.store.render(id,attempt.expectedRevision,attempt.operationId);attempts.delete(idKey);assert();await ports.refresh();return result;
      },
      adoptReady(nodes:readonly CanvasAudioNode[]){
        if(!scope.viewCurrent()||!ports.writable()||!ports.settingsReady())return;
        for(const node of nodes.filter(node=>node.projectKey===scope.project)){
          const render=node.audio.render,job=ports.jobs.find(job=>job.operationId===render?.operationId),idKey=key(node.id);
          if(!render||job?.status!=="completed"||node.audio.sourceArtworkId!==render.sourceArtworkId||JSON.stringify(node.audio.edit)!==JSON.stringify(render.edit)||adopting.has(idKey)||ports.locked(node.id))continue;
          adopting.add(idKey);void adopt(node.id,job).catch(error=>{if(scope.viewCurrent())ports.notice(error instanceof Error?error.message:label("音频结果采用失败","Audio result adoption failed"));}).finally(()=>adopting.delete(idKey));
        }
      },
    };
  }};
}
