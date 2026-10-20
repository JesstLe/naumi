"use client";
import {browserRandomUUID} from "../browser-crypto";
import {imagegenRequestSchema} from "./schema";
import {previewImagegen,startImagegen,uploadImagegenInput,ImagegenHttpError} from "./client";
import {canvasReceipts,saveCanvasReceipt,clearCanvasReceipt} from "./canvas-receipts";
import type {ImagegenRequest} from "./types";
import {automaticFrameRatio,frameCandidates,frameRatio,FrameRatioChoiceRequired,type FrameInput} from "./frame-ratio";
import {resolveImagegenIntent} from "./intent";
import {ImagegenPreparationCancelled} from "./http";
export type CanvasFrameChoice={artworkId:string;url:string;label:string;width:number;height:number;ratio:string};
/** Ordinary node prompts use the same read-only plan; specialized old recipes retain their adapter. */
export async function submitCanvasImagegen(form:FormData,sourceNodeId:string|undefined,onPlan:((message:string)=>void)|undefined,scope:{owner:string;project:string;isCurrent?:()=>boolean;chooseFrame?:(choices:CanvasFrameChoice[])=>Promise<string|null>}){
 let submitting=false;
 try {
 const assertCurrent=()=>{if(scope.isCurrent&&!scope.isCurrent())throw new Error("画布账号或项目已切换，未提交新任务");};assertCurrent();
 const nodeId=String(form.get("imagegenNodeId")||form.get("parentId")||sourceNodeId||"workspace");
 const previous=canvasReceipts(sessionStorage,scope.owner,scope.project).find(r=>r.receipt.nodeId===nodeId);
 if(previous){
  const selected=String(form.get("model")||"");
  onPlan?.(previous.receipt.modelId&&previous.receipt.modelId===selected
   ?"正在检查该节点的原任务，没有再次生成"
   :"该节点已有未完成的原任务，正在检查原任务；本次未按新选择重新生成");
  return Response.json({jobId:`imagegen-${previous.receipt.id}`});
 }
 const inputs:ImagegenRequest["inputs"]=[],assets:CanvasFrameChoice[]=[];
 for(const file of form.getAll("image")){if(!(file instanceof File))continue;assertCurrent();const asset=await uploadImagegenInput(file);assertCurrent();inputs.push({artworkId:asset.artworkId,role:inputs.length?"reference":"edit-target"});assets.push({...asset,label:`图片 ${inputs.length}`,ratio:frameRatio(asset)||""});}
 const value=(name:string)=>String(form.get(name)||"");
 const style=value("style"),raw=value("userPrompt")||value("prompt"),prompt=raw+(style&&!/默认|default/i.test(style)?`\n用户选择的视觉风格：${style}`:"");
 const request=imagegenRequestSchema.parse({version:1,operationId:browserRandomUUID(),entry:"canvas",mode:inputs.length?"edit":"generate",prompt,sourceNodeId:value("parentId")||sourceNodeId,inputs,modelId:value("model")||undefined,variants:Number(value("count")||1),parameters:{quality:value("quality")||"medium",resolution:value("resolution")||"1K",ratio:value("ratio")||"auto"},output:value("transparent")==="1"?{background:"transparent",backgroundOrigin:"current-ui"}:{format:"png"}});
 const frameInputs:FrameInput[]=inputs.map(input=>({...input,...assets.find(asset=>asset.artworkId===input.artworkId)}));
 const intent=resolveImagegenIntent(request);
 try { automaticFrameRatio(request,frameInputs,intent.operation,intent.useCase); }
 catch(error){
  if(!(error instanceof FrameRatioChoiceRequired)||!scope.chooseFrame)throw error;
  const candidates=new Set(frameCandidates(frameInputs,intent.useCase).map(input=>input.artworkId));
  const choices=assets.filter(asset=>candidates.has(asset.artworkId)&&asset.ratio);
  if(!choices.length)throw error;
  const selected=await scope.chooseFrame(choices);assertCurrent();
  if(selected===null)throw new ImagegenPreparationCancelled();
  const choice=choices.find(asset=>asset.artworkId===selected);if(!choice)throw new Error("所选画幅已失效，请重新选择");
  request.parameters.ratio=choice.ratio;
 }
 assertCurrent();const plan=await previewImagegen(request);assertCurrent();const stages=plan.steps.map(s=>s.operation==="cutout"?"抠图":s.operation==="edit"?"编辑":"生成").join(" → ");
 if(plan.requestedParameters?.resolution)onPlan?.(plan.warnings.join("\n"));
 if(plan.intent.background==="transparent")onPlan?.(`已识别：透明背景 · ${stages} · ${plan.totalCredits} 积分`);
 if(plan.confirmationRequired&&!window.confirm(`${stages}\n${plan.warnings.join("\n")}\n本次合计 ${plan.totalCredits} 积分，是否执行？`))throw new Error("已取消提交");
 assertCurrent();const key=saveCanvasReceipt(sessionStorage,scope.owner,scope.project,{id:request.operationId,nodeId,sourceNodeId:request.sourceNodeId,modelId:request.modelId,x:Number(form.get("imagegenNodeX")||0),y:Number(form.get("imagegenNodeY")||0)});
 submitting=true;
 try{const result=await startImagegen(request,{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true});return Response.json({jobId:"jobId" in result?result.jobId:`imagegen-${request.operationId}`});}
 catch(error){if(error instanceof ImagegenHttpError&&error.accepted===false){clearCanvasReceipt(sessionStorage,key,request.operationId);throw error;}onPlan?.("提交回执待核查，正在追踪原任务");return Response.json({jobId:`imagegen-${request.operationId}`});}
 } catch(error) {
  if(error instanceof ImagegenPreparationCancelled)throw error;
  // Upload/plan/storage failures precede the only paid POST. Mark them as
  // not accepted so the canvas can offer an explicit retry without ambiguity.
  if(!submitting)throw new ImagegenHttpError(error instanceof Error?error.message:"生成准备失败",error instanceof ImagegenHttpError?error.status:0,false);
  throw error;
 }
}
