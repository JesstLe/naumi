import "server-only";
import {submitAcceptedImagegen,getImagegenResult} from "./dispatch";
import {cancelImagegenOperation} from "./cancel";
import type {ImagegenPlan,ImagegenResult} from "./types";
const stageNames={planning:"整理素材",generating:"生成图像",editing:"编辑图像",postprocessing:"处理输出",saving:"保存作品",done:"图像已完成"};
export async function executeAgentImagegen(plan:ImagegenPlan,owner:string,signal?:AbortSignal,onStage?:(result:ImagegenResult)=>void){
 if(signal?.aborted)throw new Error("任务已停止");
 let result=await submitAcceptedImagegen(plan,owner);const deadline=Date.now()+540000;let last="";
 const abort=()=>{void cancelImagegenOperation(plan.request.operationId,owner).catch(()=>{});};signal?.addEventListener("abort",abort,{once:true});
 try{while(Date.now()<deadline){if(signal?.aborted)throw new Error("后续步骤已停止，已受理任务保留在作品库");if(last!==result.stage){last=result.stage;onStage?.(result);}if(["succeeded","failed","cancelled","needs_attention"].includes(result.status))break;
  await new Promise<void>((resolve,reject)=>{const done=()=>{signal?.removeEventListener("abort",stopped);resolve();},timer=setTimeout(done,1500),stopped=()=>{clearTimeout(timer);signal?.removeEventListener("abort",stopped);reject(new Error("任务已停止，已提交生成继续追踪"));};signal?.addEventListener("abort",stopped,{once:true});});
  result=await getImagegenResult(plan.request.operationId,owner)||result;
 }
 if(result.status!=="succeeded")throw new Error(result.error?.message||"任务仍在后台处理，请从作品库查看；不要重复生成");
 const urls=result.artifacts.map(a=>a.url);return {content:[{type:"text" as const,text:urls.map(url=>`![图像结果](${url})`).join("\n")}],details:{urls,artworkIds:result.artifacts.map(a=>a.artworkId),operationId:result.operationId,chargedCredits:result.chargedCredits,publicSummary:`图像完成，产出${urls.length}张，消耗${result.chargedCredits}积分`}};
 }finally{signal?.removeEventListener("abort",abort);}
}
export const imagegenAgentStage=(result:ImagegenResult)=>({content:[{type:"text" as const,text:stageNames[result.stage]}],details:{publicSummary:stageNames[result.stage],stage:result.stage,operationId:result.operationId}});
