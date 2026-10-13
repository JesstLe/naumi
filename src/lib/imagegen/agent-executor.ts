import "server-only";
import {submitAcceptedImagegen,getImagegenResult} from "./dispatch";
import {cancelImagegenOperation} from "./cancel";
import {submitAcceptedImagegenBatch,runImagegenBatchTick,readImagegenBatch,cancelImagegenBatch} from "./batch";
import type {ImagegenPlan,ImagegenResult} from "./types";
const stageNames={planning:"整理素材",generating:"生成图像",editing:"编辑图像",postprocessing:"处理输出",saving:"保存作品",done:"图像已完成"};
async function batchResult(plan:ImagegenPlan,owner:string):Promise<ImagegenResult>{
 await runImagegenBatchTick(plan.request.operationId);const batch=await readImagegenBatch(plan.request.operationId,owner);if(!batch)throw new Error("批次不存在或无权访问");
 const terminal=new Set(["succeeded","failed","cancelled","needs_attention"]),completed=batch.items.filter(i=>terminal.has(i.state)).length,status:ImagegenResult["status"]=["running","cancelling"].includes(batch.status)?"pending":batch.status as ImagegenResult["status"];
 return {operationId:batch.id,jobId:`imagegen-batch-${batch.id}`,status,stage:completed===batch.items.length?"done":"generating",artifacts:batch.items.filter(i=>i.result.status==="succeeded").flatMap(i=>i.result.artifacts),chargedCredits:batch.chargedCredits,progress:{completed,total:batch.items.length},...(status!=="succeeded"&&completed===batch.items.length?{error:{code:"BATCH_PARTIAL",message:batch.items.filter(i=>i.state!=="succeeded").map(i=>`${i.name}：${i.result.error?.message||i.state}`).join("；")}}:{})};
}
export async function executeAgentImagegen(plan:ImagegenPlan,owner:string,signal?:AbortSignal,onStage?:(result:ImagegenResult)=>void){
 if(signal?.aborted)throw new Error("任务已停止");const batch=plan.request.mode==="batch",deadline=Date.now()+540000;let last="";
 const cancel=()=>batch?cancelImagegenBatch(plan.request.operationId,owner):cancelImagegenOperation(plan.request.operationId,owner),abort=()=>{void cancel().catch(()=>{});};signal?.addEventListener("abort",abort,{once:true});
 try{let result:ImagegenResult;
  if(batch){await submitAcceptedImagegenBatch(plan,owner);result=await batchResult(plan,owner);}else result=await submitAcceptedImagegen(plan,owner);
  if(signal?.aborted){await cancel().catch(()=>{});throw new Error("后续步骤已停止，已受理任务保留在作品库");}
  while(Date.now()<deadline){if(signal?.aborted)throw new Error("后续步骤已停止，已受理任务保留在作品库");const progress=`${result.stage}:${result.progress?.completed||0}`;if(last!==progress){last=progress;onStage?.(result);}if(["succeeded","partial","failed","cancelled","needs_attention"].includes(result.status))break;
   await new Promise<void>((resolve,reject)=>{const done=()=>{signal?.removeEventListener("abort",stopped);resolve();},timer=setTimeout(done,1500),stopped=()=>{clearTimeout(timer);signal?.removeEventListener("abort",stopped);reject(new Error("任务已停止，已提交生成继续追踪"));};signal?.addEventListener("abort",stopped,{once:true});});
   result=batch?await batchResult(plan,owner):await getImagegenResult(plan.request.operationId,owner)||result;
  }
  if(result.status!=="succeeded"&&!(batch&&result.artifacts.length&&["partial","cancelled"].includes(result.status)))throw new Error(`${result.error?.message||"任务仍在后台处理，请从作品库查看；不要重复生成"} · 操作编号 ${result.operationId}`);
  const urls=result.artifacts.map(a=>a.url),summary=`${result.status==="succeeded"?"图像完成":"批次部分完成"}，产出${urls.length}张，消耗${result.chargedCredits}积分`;
  return {content:[{type:"text" as const,text:[summary,result.error?.message,urls.map(url=>`![图像结果](${url})`).join("\n")].filter(Boolean).join("\n")}],details:{urls,artworkIds:result.artifacts.map(a=>a.artworkId),operationId:result.operationId,chargedCredits:result.chargedCredits,status:result.status,publicSummary:summary,...(batch?{batchDownload:`/api/imagegen/batches/${result.operationId}/download`}:{})}};
 }finally{signal?.removeEventListener("abort",abort);}
}
export const imagegenAgentStage=(result:ImagegenResult)=>{const summary=stageNames[result.stage]+(result.progress?` ${result.progress.completed}/${result.progress.total}`:"");return {content:[{type:"text" as const,text:summary}],details:{publicSummary:summary,stage:result.stage,operationId:result.operationId}};};
