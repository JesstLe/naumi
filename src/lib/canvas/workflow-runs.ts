import type {Artwork} from '../mock-data';
import {browserRandomUUID} from '../browser-crypto';
import type {ComfyRunPayload,ComfyRunResult} from '../comfyui/run-contract';
import {createCanvasComfyWorkflow,comfyRunReceiptKey} from './comfy-workflow';
import {createCanvasResultAttachment} from './result-attachment';
import type {CanvasGenerationRunContext} from './generation-run-context';
import type {CanvasPendingNode} from './scene-types';

type Context=CanvasGenerationRunContext&{storage:Pick<Storage,"getItem"|"setItem"|"removeItem">;submitted:()=>Promise<unknown>};
type Retained={task:ReturnType<typeof createCanvasComfyWorkflow>;context:Context;node:CanvasPendingNode};

/** Session ownership of the existing Comfy controller, keyed by its original
 * receipt identity. UNKNOWN and known results retain this exact controller and
 * payload; a known-unaccepted/finished intent releases it. Not a task engine. */
export function createCanvasWorkflowRuns(){
  const runs=new Map<string,Retained>();
  return {async run(source:Artwork|null,payload:ComfyRunPayload,current:Context,graphAnchor?:{id:string;x:number;y:number;width:number}):Promise<ComfyRunResult>{
    const identity=graphAnchor?.id||source?.id||payload.workflowId,operationKey=`node:${identity}`;
    if(current.generation.busy(operationKey))throw new Error('当前节点已有任务在进行');
    const key=comfyRunReceiptKey(current.owner.capture(),identity);let retained=runs.get(key);
    if(!retained){
      const ctx=current,anchor=source?ctx.geometry.source(source):{point:{x:graphAnchor?.x||0,y:graphAnchor?.y||0},size:{width:graphAnchor?.width||380}},position={x:anchor.point.x+anchor.size.width+ctx.geometry.gap,y:anchor.point.y},pendingId=`pend-comfy-${browserRandomUUID()}`;
      const task=createCanvasComfyWorkflow({sourceId:source?.id,payload,receiptKey:key,storage:ctx.storage,
        attach:createCanvasResultAttachment({layout:{kind:'offset',step:40},saveErrorText:'工作流结果定位失败',
          position:()=>ctx.geometry.position(pendingId,position),merge:ctx.document.merge,
          history:(ids,arts)=>{for(const id of ids)ctx.document.history([id],arts);}}),
        submitted:ctx.submitted,saving:()=>{if(ctx.owner.isVisible())ctx.pending.set(nodes=>nodes.map(node=>node.id===pendingId?{...node,generationStage:'saving'}:node));},
      });
      const node:CanvasPendingNode={id:pendingId,operationKey,...position,parentId:source?.id||null,linked:!!source,label:'工作流结果',uploading:false,progress:8,inputs:source?[source.id]:[],generating:true,generationStage:'generating',generationStartedAt:Date.now()};
      retained={task,context:ctx,node};runs.set(key,retained);
    }
    const entry=retained,{task,node,context:ctx}=entry,pendingId=node.id,scope=ctx.owner.capture();scope.assertCurrent();
    return (await ctx.generation.activity({operationKey,canRetry:scope.isCurrent,execute:async()=>{
      ctx.pending.set(nodes=>[...nodes.filter(item=>item.id!==pendingId),{...node,generating:true}]);
      const timer=window.setInterval(()=>{if(scope.isCurrent()){ctx.pending.set(nodes=>nodes.map(item=>item.id===pendingId?{...item,progress:Math.min(92,item.progress+Math.max(1,Math.round((96-item.progress)/9)))}:item));}},1200);
      try{
        const result=await task.run(scope);
        if(scope.isCurrent()){
          if(result.state==='completed')ctx.notice(result.images?.length?`工作流完成，${result.images.length} 张结果已回到画布`:'工作流完成，视频已生成');
          if(result.state==='submitted')ctx.notice('视频工作流已提交');
        }
        return result;
      }finally{
        if(task.finished&&runs.get(key)===entry){runs.delete(key);}
        window.clearInterval(timer);
        if(scope.isCurrent())ctx.pending.set(nodes=>nodes.filter(item=>item.id!==pendingId));
      }
    }}).run())!;
  }};
}
