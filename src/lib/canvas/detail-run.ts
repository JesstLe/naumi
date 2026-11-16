import {createRetainedBillingSubmission} from '../billing/client-submission';
import {createCanvasDetailTask} from './detail-task-controller';
import {prepareCanvasDetailTask,type CanvasDetailRequest} from './detail-task-request';
import {createCanvasResultAttachment} from './result-attachment';
import {generationPlaceholderSize} from './generation-feedback';
import type {CanvasPendingNode} from './scene-types';
import type {GenerationFailure} from './generation-failure';
import type {CanvasGenerationRunContext} from './generation-run-context';

/** Detail composition owns the relationship between the existing task card,
 * optional blank placeholder and original detail controller. Selection/error
 * display stays at the UI boundary; execution and charging stay unchanged. */
export async function runCanvasDetail(input:{request:CanvasDetailRequest;pending?:CanvasPendingNode;
  label:(done:number)=>string;errorText:string;saveErrorText:string;
  failed:(failure:GenerationFailure)=>void;attached:(pendingId:string,artworkId?:string)=>void;
},ctx:CanvasGenerationRunContext){
  const {request,pending:pend}=input,{source,count}=request,{generation:view,pending,owner}=ctx;
  const operationKey=pend?`pend:${pend.id}`:`node:${source.id}`;if(view.busy(operationKey))return;
  const anchor=ctx.geometry.source(source),basePosition=pend?{x:pend.x,y:pend.y}:anchor.inScene?{x:anchor.point.x+anchor.size.width+ctx.geometry.gap,y:anchor.point.y}:{x:0,y:0};
  const taskId=`task-detail-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const position=view.start({id:taskId,isVisible:owner.isVisible,operationKey,sourceId:source.id,label:input.label(0),stage:'preparing',startedAt:Date.now(),
    previewSize:generationPlaceholderSize(request.ratio),count,completed:0},{preferred:basePosition,existing:pend?basePosition:undefined,occupied:ctx.geometry.occupied()});
  if(pend)pending.retain({...(pending.get(pend.id)??pend),operationKey,generating:true,generationFailure:undefined,onGenerationRetry:undefined});
  const update=(patch:Partial<CanvasPendingNode>)=>{if(pend)pending.update(pend.id,patch);};
  const submission=createRetainedBillingSubmission();
  const task=createCanvasDetailTask({prepare:scope=>prepareCanvasDetailTask(request,scope),
    submit:(form,scope)=>ctx.submit('/api/aplus',{method:'POST',body:form},scope,submission),
    attach:createCanvasResultAttachment({position:()=>pend?ctx.geometry.position(pend.id,position):view.position(taskId,position),
      layout:{kind:'detail',gap:24,height:art=>ctx.geometry.artworkSize(art).height},saveErrorText:input.saveErrorText,...ctx.document}),
    progress:(stage,done)=>{view.update(taskId,{stage,completed:done,label:input.label(done),failure:undefined});update({generating:true,generationStage:stage,generationFailure:undefined});},
    user:ctx.user,errorText:input.errorText,expectedCount:count,
  });
  return view.activity({operationKey,canRetry:owner.isVisible,clear:()=>view.remove(taskId),
    execute:async({retry,retain})=>{
      const scope=owner.capture(),result=await task.run(scope);
      if(result.status==='failed'||result.status==='stale'){
        retain();if(pend)view.hide(taskId);else view.update(taskId,{failure:result.failure,onRetry:retry});
        update({generating:false,generationFailure:result.failure,onGenerationRetry:retry});
        if(scope.isCurrent())input.failed(result.failure);return;
      }
      if(pend)pending.release(pend.id);
      if(scope.isCurrent()&&pend){
        if(result.status==='succeeded'){pending.set(nodes=>nodes.filter(item=>item.id!==pend.id));input.attached(pend.id,result.ids[0]);}
        else pending.set(nodes=>nodes.map(item=>item.id===pend.id?{...item,generating:false}:item));
      }
    },
  }).run();
}
