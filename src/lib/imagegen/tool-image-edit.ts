"use client";
import {submitCanvasImagegen,completeCanvasImagegen} from "./canvas-client";
import {pollImagegen} from "./client";
import {currentWorkspace} from "../saas/workspace-client";
import {readImagegenResponse} from "./http";

/** A confirmed terminal failure may be replaced only by another user click.
 * The callback rechecks the original receipt; unknown/partial work has no exit. */
export class ToolImageEditFailed extends Error{
  constructor(message:string,readonly retry:()=>Promise<void>){super(message);}
}
/** A tool view of the existing receipt-first image client, not another
 * submission/quotation/retry implementation. A timeout keeps the same receipt. */
export async function runToolImageEdit(form:FormData,scope:{owner:string;isCurrent:()=>boolean}){
  const workspace=currentWorkspace(),isCurrent=()=>scope.isCurrent()&&currentWorkspace()===workspace;
  const current=()=>{if(!isCurrent())throw new Error("账号或工作空间已切换，原任务已保留");};
  const response=await submitCanvasImagegen(form,undefined,undefined,{...scope,project:"workspace",entry:"workbench",isCurrent});
  const submitted=await readImagegenResponse<{jobId:string;replayed?:boolean}>(response,"图像任务提交失败");current();
  if(!/^imagegen-[a-f0-9-]{36}$/i.test(submitted.jobId))throw new Error("原任务回执尚未核实，请稍后重试");
  const operationId=submitted.jobId.slice("imagegen-".length),deadline=Date.now()+300_000;
  while(Date.now()<deadline){
    current();const result=await pollImagegen(operationId,{workspace,isCurrent});current();
    if(result.jobId!==submitted.jobId||result.operationId!==operationId)throw new Error("原任务回执不一致，请保留当前任务");
    if(result.status==="succeeded"&&result.artifacts.length===1&&result.artifacts[0].url){
      completeCanvasImagegen(result.jobId,{owner:scope.owner,workspace,project:"workspace"});
      return {url:result.artifacts[0].url,creditsUsed:result.chargedCredits,replayed:submitted.replayed===true};
    }
    if(["failed","cancelled"].includes(result.status)&&result.artifacts.length===0){
      throw new ToolImageEditFailed(result.error?.message||"本次处理未完成，可点击重新抠图",async()=>{
        current();const original=await pollImagegen(operationId,{workspace,isCurrent});current();
        if(original.operationId!==operationId||original.jobId!==submitted.jobId||!["failed","cancelled"].includes(original.status)||original.artifacts.length)throw new Error("原任务状态已变化，请先查看原任务结果");
        completeCanvasImagegen(submitted.jobId,{owner:scope.owner,workspace,project:"workspace"});
      });
    }
    if(["failed","cancelled","partial","needs_attention"].includes(result.status))throw new Error(result.error?.message||"原任务尚未完整交付，请检查原任务结果");
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new Error("原任务仍在后台处理，稍后重试将查询同一任务");
}
