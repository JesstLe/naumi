import type {Artwork} from '../mock-data';
import {browserRandomUUID} from '../browser-crypto';
import {createRetainedBillingSubmission} from '../billing/client-submission';
import {createCanvasEditTask,type CanvasEditRequest} from './edit-task';
import {createCanvasResultAttachment} from './result-attachment';
import {generationPlaceholderSize} from './generation-feedback';
import {generationFailureMessage} from './generation-failure';
import type {CanvasGenerationRunContext} from './generation-run-context';

/** Edit application composition: one retained request/controller, its original
 * view binding and its result attachment. React only supplies live scene/I/O. */
export async function runCanvasEdit(input:{source:Artwork;request:CanvasEditRequest;label:string},ctx:CanvasGenerationRunContext):Promise<boolean>{
  const {source,label}=input,{generation:view,pending,owner}=ctx,operationKey=`node:${source.id}`;
  if(view.busy(operationKey))return false;
  const anchor=ctx.geometry.source(source),pendingId=`pend-edit-${browserRandomUUID()}`;
  const node=pending.beginEdit({id:pendingId,operationKey,parentId:source.id,linked:true,label:`${label}结果`,uploading:false,progress:8,inputs:[source.id],generating:true,
    generationSize:generationPlaceholderSize(source.ratio),generationStage:'generating',generationStartedAt:Date.now()},
    {preferred:{x:anchor.point.x+anchor.size.width+ctx.geometry.gap,y:anchor.point.y},occupied:ctx.geometry.occupied()});
  const submission=createRetainedBillingSubmission();
  const task=createCanvasEditTask({request:input.request,
    submit:(prepared,scope)=>ctx.submit(prepared.url,prepared.init,scope,submission),
    attach:createCanvasResultAttachment({layout:{kind:'single'},saveErrorText:`${label}结果定位失败`,
      position:()=>ctx.geometry.position(pendingId,pending.get(pendingId)??node),...ctx.document}),
    user:ctx.user,saving:()=>pending.update(pendingId,{generationStage:'saving'}),errorText:`${label}未完成，请检查原操作`,
  });
  if(!owner.isVisible()||!pending.retained(pendingId))return false;
  const activity=view.activity({operationKey,canRetry:()=>owner.isVisible()&&pending.retained(pendingId),
    execute:async({retry}):Promise<boolean>=>{
      const scope=owner.capture();pending.update(pendingId,{generating:true,generationFailure:undefined,onGenerationRetry:undefined});
      const timer=window.setInterval(()=>{const progress=pending.get(pendingId)?.progress||8;pending.update(pendingId,{progress:Math.min(92,progress+Math.max(1,Math.round((96-progress)/9)))});},900);
      try{
        const result=await task.run(scope);
        if(result.status==='failed'||result.status==='stale'){
          pending.update(pendingId,{generating:false,generationFailure:result.failure,onGenerationRetry:retry});
          if(scope.isCurrent())ctx.notice(generationFailureMessage(result.failure));return false;
        }
        pending.release(pendingId);
        if(scope.isCurrent()){pending.set(nodes=>nodes.filter(item=>item.id!==pendingId));if(result.status==='succeeded')ctx.notice(`${label}完成，结果已载入画布`);}
        return result.status==='succeeded';
      }finally{window.clearInterval(timer);}
    },
  });
  return await activity.run()??false;
}
