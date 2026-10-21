"use client";
import {browserRandomUUID} from "../browser-crypto";
import {imagegenRequestSchema} from "./schema";
import {previewImagegen,startImagegen,uploadImagegenInput,ImagegenHttpError} from "./client";
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
 const inputs:ImagegenRequest["inputs"]=[],assets:CanvasFrameChoice[]=[];
 const files=form.getAll("image").filter((file):file is File=>file instanceof File);
 for(const file of files){assertCurrent();const asset=await uploadImagegenInput(file,files.length,assertCurrent);assertCurrent();const input={artworkId:asset.artworkId,role:inputs.length?"reference" as const:"edit-target" as const};inputs.push(input);const original={...asset,width:asset.sourceWidth,height:asset.sourceHeight};assets.push({...original,label:`图片 ${inputs.length}`,ratio:frameRatio(original)||""});}
 const value=(name:string)=>String(form.get(name)||"");
 const style=value("style"),raw=value("userPrompt")||value("prompt"),prompt=raw+(style&&!/默认|default/i.test(style)?`\n用户选择的视觉风格：${style}`:"");
 const request=imagegenRequestSchema.parse({version:1,operationId:browserRandomUUID(),entry:"canvas",mode:inputs.length?"edit":"generate",prompt,sourceNodeId:value("parentId")||sourceNodeId,inputs,modelId:value("model")||undefined,variants:Number(value("count")||1),parameters:{quality:value("quality")||"medium",resolution:value("resolution")||"1K",ratio:value("ratio")||"auto"},output:value("transparent")==="1"?{background:"transparent",backgroundOrigin:"current-ui"}:{format:"png"}});
 // A rounded derivative is transport, not the original composition. Resolve the
 // user's automatic frame before asking the server to inspect prepared pixels;
 // genuinely ambiguous mixed ratios ask once instead of guessing.
 const frameInputs:FrameInput[]=inputs.map(input=>{const asset=assets.find(candidate=>candidate.artworkId===input.artworkId);return asset?{...input,width:asset.width,height:asset.height}:input;});
 const intent=resolveImagegenIntent(request);
 try {
  const ratio=automaticFrameRatio(request,frameInputs,intent.operation,intent.useCase);
  if(ratio)request.parameters.ratio=ratio;
 }
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
 assertCurrent();submitting=true;
 const result=await startImagegen(request,{billingVersion:plan.billingVersion,modelVersion:plan.modelVersion,credits:plan.totalCredits,confirmed:true});
 return Response.json({jobId:"jobId" in result?result.jobId:`imagegen-${request.operationId}`});
 } catch(error) {
  if(error instanceof ImagegenPreparationCancelled)throw error;
  // Upload/plan/storage failures precede the only paid POST. Mark them as
  // not accepted so the canvas can offer an explicit retry without ambiguity.
  if(!submitting)throw new ImagegenHttpError(error instanceof Error?error.message:"生成准备失败",error instanceof ImagegenHttpError?error.status:0,false);
  throw error;
 }
}
