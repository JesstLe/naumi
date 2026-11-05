import type {Artwork} from "../mock-data";
import type {CanvasDocumentScope} from "./document-scope";
import type {CanvasPendingNode} from "./scene-types";
import type {CanvasPoint} from "./stable-placement";

export type CanvasFollowedVideoTask={id:string;source?:string;sourceId?:string;status:string;progress?:number;artworkId?:string;prompt?:string;error?:string};
type Project={key:string;members:Artwork[]};
export type CanvasVideoFollowPorts={
  project:()=>Project|null;
  request:(url:string,init?:RequestInit)=>Promise<Response>;
  pending:{set:(change:(nodes:CanvasPendingNode[])=>CanvasPendingNode[])=>void};
  position:(source:Artwork|undefined)=>CanvasPoint;
  merge:(ids:string[],current:()=>boolean)=>Promise<Artwork[]>;
  credits:()=>Promise<unknown>;notice:(message:string)=>void;
  messages:{attention:string;attentionHint:string;openTasks:string};
  timer:{set:(run:()=>void,delay:number)=>unknown;clear:(id:unknown)=>void};
};
const running=(task:CanvasFollowedVideoTask)=>task.status==="processing"||task.status==="queued";
const terminal=(task:CanvasFollowedVideoTask)=>task.status==="completed"||task.status==="failed"||task.status==="cancelled";
const progress=(task:CanvasFollowedVideoTask)=>Math.max(5,Math.min(95,Number(task.progress||0)));

/** Only presentation recovery for existing durable video tasks. This owner never
 * creates a video, changes its status or settles billing. Document writes retain
 * their existing initialize/merge adapters and captured scope. */
export function createCanvasVideoTaskFollower(){
  const documents=new Map<string,{settled:Set<string>;failed:Set<string>}>();
  return {follow(scope:CanvasDocumentScope,ports:CanvasVideoFollowPorts){
    let state=documents.get(scope.key);if(!state){state={settled:new Set(),failed:new Set()};documents.set(scope.key,state);}
    const document=state;let stopped=false,timer:unknown;
    const current=()=>!stopped&&scope.viewCurrent();
    const later=(delay:number)=>{if(current())timer=ports.timer.set(()=>{timer=undefined;void sync();},delay);};
    async function sync(){
      try{
        if(!current())return;const project=ports.project();if(!project||project.key!==scope.project)return;
        const ids=project.members.map(member=>member.id),chunks=Array.from({length:Math.max(1,Math.ceil(ids.length/80))},(_,i)=>ids.slice(i*80,i*80+80));
        const responses=await Promise.all(chunks.map(chunk=>ports.request(`/api/video/tasks?source=canvas&limit=500&sourceIds=${encodeURIComponent(chunk.join(","))}`)));
        if(!current())return;
        if(responses.some(response=>!response.ok))throw new Error("视频任务查询失败");
        const bodies=await Promise.all(responses.map(response=>response.json()));if(!current())return;
        const active=ports.project();if(!active||active.key!==scope.project)return;
        const members=new Map(active.members.map(member=>[member.id,member]));
        const tasks=bodies.flatMap(body=>Array.isArray(body?.tasks)?body.tasks:[]) as CanvasFollowedVideoTask[];
        const relevant=tasks.filter(task=>task.source==="canvas"&&task.sourceId&&members.has(task.sourceId));
        const runningIds=new Set(relevant.filter(running).map(task=>task.id)),attentionIds=new Set(relevant.filter(task=>task.status==="needs_attention").map(task=>task.id)),terminalIds=new Set(relevant.filter(terminal).map(task=>task.id));
        const attention={attentionTitle:ports.messages.attention,attentionHint:ports.messages.attentionHint,attentionAction:ports.messages.openTasks,attentionHref:"/video"};
        ports.pending.set(items=>{
          if(!current())return items;
          const byId=new Map(relevant.map(task=>[task.id,task]));
          const kept=items.filter(item=>item.taskKind!=="video"||!item.taskId||!terminalIds.has(item.taskId)).map(item=>{
            if(item.taskKind!=="video"||!item.taskId)return item;
            if(attentionIds.has(item.taskId))return {...item,label:ports.messages.attention,generating:false,progress:0,needsAttention:true,...attention};
            return runningIds.has(item.taskId)?{...item,progress:progress(byId.get(item.taskId)!),generating:true,needsAttention:false}:item;
          });
          const known=new Set(kept.filter(item=>item.taskKind==="video").map(item=>item.taskId).filter(Boolean));
          for(const task of relevant){
            if((!runningIds.has(task.id)&&!attentionIds.has(task.id))||known.has(task.id))continue;
            kept.push({id:`pend-video-task-${task.id}`,taskId:task.id,taskKind:"video",...ports.position(members.get(task.sourceId!)),parentId:task.sourceId||null,linked:true,
              label:attentionIds.has(task.id)?ports.messages.attention:task.prompt?`视频生成中 · ${task.prompt.slice(0,18)}`:"视频生成中",uploading:false,
              progress:attentionIds.has(task.id)?0:progress(task),inputs:task.sourceId?[task.sourceId]:[],generating:!attentionIds.has(task.id),needsAttention:attentionIds.has(task.id),...attention});
          }
          return kept;
        });
        for(const task of relevant.filter(task=>task.status==="completed"&&task.artworkId&&!members.has(task.artworkId)&&!document.settled.has(task.id))){
          if(!current())return;const point=ports.position(members.get(task.sourceId!));
          const response=await ports.request("/api/artworks/position",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"initialize",id:task.artworkId,x:Math.round(point.x),y:Math.round(point.y)})});
          if(!current())return;if(!response.ok)throw new Error("视频结果定位失败");
          const fresh=await ports.merge([task.artworkId!],current);if(!current())return;
          if(fresh.some(art=>art.id===task.artworkId)){document.settled.add(task.id);await ports.credits();if(!current())return;}
        }
        for(const task of relevant){
          if(task.status!=="failed"||document.failed.has(task.id))continue;
          if(!current())return;document.failed.add(task.id);await ports.credits();if(!current())return;
          ports.notice(task.error||"视频生成失败，积分已退回");
        }
        later(runningIds.size?8000:15000);
      }catch{later(12000);}
    }
    void sync();
    return ()=>{stopped=true;if(timer!==undefined)ports.timer.clear(timer);};
  }};
}
