"use client";
import {useRef} from "react";
import {videoByocWorkbenchDraft} from "@/lib/video/byoc-draft";
import {browserRandomUUID} from "@/lib/browser-crypto";
import {clientIntentKey} from "@/lib/billing/client-intent";
import type {PublicQuote} from "@/lib/billing/client";
import {inputReference,type VideoNodeConfig} from "@/lib/video/client-settings";
import type {OrderedInput} from "@/lib/video/references";
import type {VideoPrivateFetch} from "./use-video-nodes";
import {setLocalItem} from "@/lib/browser-storage/local";
type Receipt={ids:string[];completed:Record<string,{taskId:string;cost:number}>};
export class VideoGenerationPriceChanged extends Error{constructor(){super("价格已更新，请重新确认生成");}}
async function json(response:Response){try{return await response.json();}catch{throw new Error("创建响应尚未核实，操作编号已保留");}}
export function useVideoGeneration({email,request}:{email?:string;request:VideoPrivateFetch}){
  const actor=useRef({email,revision:0}),busy=useRef(false);if(actor.current.email!==email)actor.current={email,revision:actor.current.revision+1};
  async function submit(config:VideoNodeConfig,inputs:OrderedInput[],count:number,quote:PublicQuote|null){
    if(!email||busy.current)throw new Error("无法提交视频任务");if(!Number.isInteger(count)||count<1||count>8)throw new Error("批量任务数需为1至8");
    if(!config.comfyWorkflowId&&!quote)throw new Error("请先确认视频报价");
    const expected=actor.current.revision,current=()=>actor.current.revision===expected&&actor.current.email===email;
    const {comfyWorkflowId:_workflow,comfyInputs:_inputs,batchCount:_batchCount,...settings}=config;
    const references=inputs.length?inputs.flatMap(input=>{const ref=inputReference(input);return ref?[ref]:[];}):config.references;
    const body=config.comfyWorkflowId?videoByocWorkbenchDraft(config,inputs):{...settings,source:"workbench",orderedInputs:inputs.length?inputs:undefined,references};
    busy.current=true;
    try{
      const key=(await clientIntentKey(email,"/video/generation-batch",{body:JSON.stringify({body,count})})).replace("naumi:billing-intent:","naumi:video-generation:");if(!current())throw new Error("账号已切换");
      let receipt:Receipt|undefined;try{const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved?.ids?.length===count&&saved.ids.every((id:unknown)=>typeof id==="string"&&/^[0-9a-f-]{36}$/.test(id))&&saved.completed&&typeof saved.completed==="object")receipt=saved;}catch{/* An invalid local receipt cannot identify a server operation. */}
      receipt=receipt||{ids:Array.from({length:count},()=>browserRandomUUID()),completed:{}};
      const save=()=>setLocalItem(key,JSON.stringify(receipt));save();
      const result:{taskId:string;cost:number}[]=[];
      for(const id of receipt.ids){
        if(!current())throw new Error("账号已切换，返回原账号查看已创建任务");
        if(receipt.completed[id]){result.push(receipt.completed[id]);continue;}
        const lookup=await request(`/api/video/tasks?idempotencyKey=${encodeURIComponent(id)}`,{cache:"no-store"}),known=await json(lookup);
        if(!current())throw new Error("账号已切换");
        if(lookup.ok&&known.task){receipt.completed[id]={taskId:known.task.id,cost:Number(known.task.cost)};save();result.push(receipt.completed[id]);continue;}
        if(lookup.status!==404)throw new Error(known.error||"上次提交尚未核实，操作编号已保留");
        const response=await request(config.comfyWorkflowId?"/api/comfyui/run":"/api/video/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,idempotencyKey:id,...(quote&&!config.comfyWorkflowId?{billingVersion:quote.version,billingCredits:quote.mode==="api-cost-plus"?quote.authorizedCredits??quote.reserveCredits:quote.credits}:{})})}),data=await json(response);
        if(!response.ok){if(response.status===409&&data.code==="PRICE_CHANGED")throw new VideoGenerationPriceChanged();throw new Error(data.error||"创建尚未核实，操作编号已保留");}
        if(typeof data.taskId!=="string"||!data.taskId||!Number.isFinite(Number(data.cost)))throw new Error("创建响应尚未核实，操作编号已保留");
        receipt.completed[id]={taskId:data.taskId,cost:Number(data.cost)};save();result.push(receipt.completed[id]);
      }
      if(localStorage.getItem(key)===JSON.stringify(receipt))localStorage.removeItem(key);
      if(!current())throw new Error("任务已创建，返回原账号查看");return result;
    }finally{busy.current=false;}
  }
  return {submit};
}
