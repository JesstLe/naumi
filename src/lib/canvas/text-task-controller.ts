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
      const work=Promise.resolve().then(async()=>{
        scope.assertView();
        const unique=[...new Map(requests.map(request=>[request.node.id,request])).values()],ids=new Set(unique.map(request=>request.node.id)),started=new Set<string>();
        // Materialize all input slots once before the first concurrent start.
        ports.document.set(nodes=>[...nodes,...unique.filter(request=>!nodes.some(node=>node.id===request.node.id)).map(request=>({...request.node,status:"generating" as const,error:""}))]);
        const result=await runSelectionBatch(unique.map(request=>({id:request.node.id,request})),{isCurrent:scope.viewCurrent,canRun:()=>true,run:({request})=>{
          started.add(request.node.id);return execute(scope,request,{...ports,history:()=>{}});
        }});
        if(scope.documentCurrent()){
          for(const request of unique)if(!started.has(request.node.id)){
            const node=ports.document.getSnapshot().nodes.find(node=>node.id===request.node.id);if(!node)continue;
            const failed={...node,status:"failed" as const,error:"画布已切换，此图片尚未提交反推",updatedAt:new Date().toISOString()};
            ports.document.set(nodes=>nodes.map(node=>node.id===failed.id?failed:node));
            try{await ports.document.save(failed);}catch{/* Original document retains the failed/unsaved slot. */}
          }
          const records=ports.document.getSnapshot().nodes.filter(node=>ids.has(node.id)&&unique.some(request=>request.node.id===node.id&&request.created));
          if(records.length){if(ports.historyBatch)ports.historyBatch(records);else records.forEach(ports.history);}
        }
        return result;
      }).finally(()=>{batches.delete(identity);changed();});
      batches.set(identity,work);changed();return work;
    },
  };
}
