import type {CanvasDocumentScope} from "./document-scope";
import {createCanvasTextTask,type CanvasTextTaskPorts,type CanvasTextTaskState} from "./text-task";
import type {CanvasTextTaskRequest} from "./text-task-request";
import {runSelectionBatch} from "./selection-run";

type Task=ReturnType<typeof createCanvasTextTask>;
const idle:CanvasTextTaskState={busy:false,phase:"idle",error:"",hasResult:false};
/** Task lookup and derived-batch orchestration. No global document/store and no
 * transport of its own; each attempt gets current scoped document adapters. */
export function createCanvasTextTasks(){
  const tasks=new Map<string,Task>(),batches=new Map<string,Promise<{succeeded:number;failed:number;skipped:number}>>(),listeners=new Set<()=>void>();let revision=0;
  const key=(scope:CanvasDocumentScope,id:string)=>JSON.stringify([scope.account,scope.workspace,scope.project,id]);
  const changed=()=>{revision++;listeners.forEach(fn=>fn());};
  const find=(scope:CanvasDocumentScope,id:string)=>tasks.get(key(scope,id));
  const execute=(scope:CanvasDocumentScope,request:CanvasTextTaskRequest,ports:Omit<CanvasTextTaskPorts,"changed">)=>{
    const identity=key(scope,request.node.id);let task=tasks.get(identity);
    if(!task||["succeeded","rejected"].includes(task.getSnapshot().phase)){task=createCanvasTextTask(request);tasks.set(identity,task);}
    return task.run(scope,{...ports,changed});
  };
  return {
    subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},revision:()=>revision,
    state:(scope:CanvasDocumentScope,id?:string|null)=>id?find(scope,id)?.getSnapshot()||idle:idle,
    retryable:(scope:CanvasDocumentScope,id:string)=>{const task=find(scope,id),state=task?.getSnapshot();return !!state&&(state.phase==="retry"||state.phase==="rejected"&&task!.request.created);},
    execute,
    resume:(scope:CanvasDocumentScope,id:string,ports:Omit<CanvasTextTaskPorts,"changed">)=>find(scope,id)?.run(scope,{...ports,changed})||Promise.resolve(false),
    busy:(scope:CanvasDocumentScope,mode:"reverse"|"assist")=>batches.has(key(scope,`batch:${mode}`)),
    batch(scope:CanvasDocumentScope,mode:"reverse"|"assist",requests:CanvasTextTaskRequest[],ports:Omit<CanvasTextTaskPorts,"changed">){
      const identity=key(scope,`batch:${mode}`),existing=batches.get(identity);if(existing)return existing;
      const work=Promise.resolve().then(()=>runSelectionBatch(requests.map(request=>({id:request.node.id,request})),{isCurrent:scope.viewCurrent,canRun:()=>true,run:({request})=>execute(scope,request,ports)})).finally(()=>{batches.delete(identity);changed();});
      batches.set(identity,work);changed();return work;
    },
  };
}
