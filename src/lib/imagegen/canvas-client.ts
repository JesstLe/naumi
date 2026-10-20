"use client";
import {browserRandomUUID} from "../browser-crypto";
import {imagegenRequestSchema} from "./schema";
import {previewImagegen,startImagegen,uploadImagegenInput,ImagegenHttpError} from "./client";
import {canvasReceipts,saveCanvasReceipt,clearCanvasReceipt} from "./canvas-receipts";
import type {ImagegenRequest} from "./types";
import {automaticFrameRatio,type FrameInput} from "./frame-ratio";
import {resolveImagegenIntent} from "./intent";
/** Ordinary node prompts use the same read-only plan; specialized old recipes retain their adapter. */
export async function submitCanvasImagegen(form:FormData,sourceNodeId:string|undefined,onPlan:((message:string)=>void)|undefined,scope:{owner:string;project:string;isCurrent?:()=>boolean}){
 let submitting=false;
 try {
 const assertCurrent=()=>{if(scope.isCurrent&&!scope.isCurrent())throw new Error("画布账号或项目已切换，未提交新任务");};assertCurrent();
 const nodeId=String(form.get("imagegenNodeId")||form.get("parentId")||sourceNodeId||"workspace");
 const previous=canvasReceipts(sessionStorage,scope.owner,scope.project).find(r=>r.receipt.nodeId===nodeId);
 if(previous)return Response.json({jobId:`imagegen-${previous.receipt.id}`});
 const inputs:ImagegenRequest["inputs"]=[];
 const frames:FrameInput[]=[],files=form.getAll("image").filter((file):file is File=>file instanceof File);
 for(const file of files){assertCurrent();const asset=await uploadImagegenInput(file,files.length,assertCurrent);assertCurrent();const input={artworkId:asset.artworkId,role:inputs.length?"reference" as const:"edit-target" as const};inputs.push(input);frames.push({...input,width:asset.sourceWidth,height:asset.sourceHeight});}
 const value=(name:string)=>String(form.get(name)||"");
 const style=value("style"),raw=value("userPrompt")||value("prompt"),prompt=raw+(style&&!/默认|default/i.test(style)?`\n用户选择的视觉风格：${style}`:"");
 const request=imagegenRequestSchema.parse({version:1,operationId:browserRandomUUID(),entry:"canvas",mode:inputs.length?"edit":"generate",prompt,sourceNodeId:value("parentId")||sourceNodeId,inputs,modelId:value("model")||undefined,variants:Number(value("count")||1),parameters:{quality:value("quality")||"medium",resolution:value("resolution")||"1K",ratio:value("ratio")||"auto"},output:value("transparent")==="1"?{background:"transparent",backgroundOrigin:"current-ui"}:{format:"png"}});
 // A rounded derivative is transport, not the original composition. Resolve the
 // user's automatic frame before asking the server to inspect prepared pixels.
 const intent=resolveImagegenIntent(request),ratio=automaticFrameRatio(request,frames,intent.operation,intent.useCase);if(ratio)request.parameters.ratio=ratio;
 assertCurrent();const plan=await previewImagegen(request);assertCurrent();const stages=plan.steps.map(s=>s.operation==="cutout"?"抠图":s.operation==="edit"?"编辑":"生成").join(" → ");
 if(plan.intent.background==="transparent")onPlan?.(`已识别：透明背景 · ${stages} · ${plan.totalCredits} 积分`);
 if(plan.confirmationRequired&&!window.confirm(`${stages}\n${plan.warnings.join("\n")}\n本次合计 ${plan.totalCredits} 积分，是否执行？`))throw new Error("已取消提交");
 assertCurrent();const key=saveCanvasReceipt(sessionStorage,scope.owner,scope.project,{id:request.operationId,nodeId,sourceNodeId:request.sourceNodeId,x:Number(form.get("imagegenNodeX")||0),y:Number(form.get("imagegenNodeY")||0)});
 submitting=true;
 try{const result=await startImagegen(plan.request,{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true});return Response.json({jobId:"jobId" in result?result.jobId:`imagegen-${request.operationId}`});}
 catch(error){if(error instanceof ImagegenHttpError&&error.accepted===false){clearCanvasReceipt(sessionStorage,key,request.operationId);throw error;}onPlan?.("提交回执待核查，正在追踪原任务");return Response.json({jobId:`imagegen-${request.operationId}`});}
 } catch(error) {
  // Upload/plan/storage failures precede the only paid POST. Mark them as
  // not accepted so the canvas can offer an explicit retry without ambiguity.
  if(!submitting)throw new ImagegenHttpError(error instanceof Error?error.message:"生成准备失败",error instanceof ImagegenHttpError?error.status:0,false);
  throw error;
 }
}
