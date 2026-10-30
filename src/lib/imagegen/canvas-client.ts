"use client";
import {browserRandomUUID} from "../browser-crypto";
import {imagegenRequestSchema} from "./schema";
import {previewImagegen,startImagegen,pollImagegen,uploadImagegenInput,imagegenScopeHeaders,ImagegenHttpError} from "./client";
import type {ImagegenRequest} from "./types";
import {automaticFrameRatio,frameCandidates,frameRatio,FrameRatioChoiceRequired,type FrameInput} from "./frame-ratio";
import {resolveImagegenIntent} from "./intent";
import {legacyImagegenIntent} from './legacy-intent';
import {ImagegenPreparationCancelled} from "./http";
import {browserImageHeader} from "../browser-reference-image";
import {canvasReferenceManifestSchema,referenceManifestError} from "./reference-labels";
import {currentWorkspace} from '../saas/workspace-client';
import {canvasImagegenActionKey,pendingAttemptKey,readPendingAttempt,savePendingAttempt,withPendingAttempt,type ImagegenPendingAttempt} from './client-recovery';
import {readCanvasFanoutPlacement} from "../canvas/generation-fanout";
export {completeCanvasImagegen} from './client-recovery';
export type CanvasFrameChoice={artworkId:string;url:string;label:string;width:number;height:number;ratio:string};
/** The specialized/redo route quotes the same resolved frame it submits.
 * Header-only local inspection: no upload, provider call or changed intent ID. */
export async function resolveCanvasLegacyFrame(form:FormData,chooseFrame:(choices:CanvasFrameChoice[])=>Promise<string|null>,isCurrent:()=>boolean){
 const ratio=String(form.get('ratio')||'auto');
 if(ratio!=='auto'||form.get('ratiogen')==='1'||Number(form.get('targetWidth'))>0||Number(form.get('targetHeight'))>0)return;
 const files=form.getAll('image').filter((x):x is File=>x instanceof File&&x.size>0);
 if(!files.length)return;
 const manifest=form.has('canvasReferences')?canvasReferenceManifestSchema.parse(JSON.parse(String(form.get('canvasReferences')))):null;
 if(manifest&&manifest.length!==files.length)throw new Error('参考图与实际上传图片不一致');
 const inputs:FrameInput[]=files.map((_,index)=>({artworkId:String(index),role:manifest?.[index].role||(index?'reference':'edit-target')}));
 const intent=legacyImagegenIntent({userPrompt:form.get('userPrompt'),prompt:form.get('prompt'),origin:'canvas'},files.length);
 const candidates=frameCandidates(inputs,intent?.useCase),choices:CanvasFrameChoice[]=[];
 try{
  for(const input of candidates){const i=Number(input.artworkId),size=await browserImageHeader(files[i]);if(!isCurrent())throw new ImagegenPreparationCancelled();Object.assign(input,size);choices.push({artworkId:input.artworkId,url:URL.createObjectURL(files[i]),label:manifest?.[i]?`图${manifest[i].number} · ${manifest[i].title}`:`图片 ${i+1}`,...size,ratio:frameRatio(size)!});}
  if(!choices.length)return;
  const selected=choices.every(x=>x.ratio===choices[0].ratio)?choices[0].artworkId:await chooseFrame(choices);
  if(!isCurrent()||selected===null)throw new ImagegenPreparationCancelled();
  const choice=choices.find(x=>x.artworkId===selected);if(!choice)throw new Error('所选画幅已失效');
  form.set('ratio',choice.ratio);
 }finally{choices.forEach(x=>URL.revokeObjectURL(x.url));}
}
/** Specialized long-detail submissions share the same choice UI, before quote.
 * Only temporary local object URLs are used; no duplicate media upload/storage. */
export async function resolveCanvasDetailFrame(form:FormData,chooseFrame:(choices:CanvasFrameChoice[])=>Promise<string|null>,isCurrent:()=>boolean){
 const format=String(form.get("format")||"");if(format!=="auto")return;
 const files=form.getAll("image").filter((file):file is File=>file instanceof File&&file.size>0).slice(0,form.get("prepared")==="1"?6:3);
 const choices:CanvasFrameChoice[]=[];
 try{
  for(const [index,file] of files.entries()){
   const size=await browserImageHeader(file);if(!isCurrent())throw new ImagegenPreparationCancelled();
   choices.push({artworkId:String(index),url:URL.createObjectURL(file),label:`图片 ${index+1}`,...size,ratio:frameRatio(size)!});
  }
  if(!choices.length)return;
  const selected=choices.every(item=>item.ratio===choices[0].ratio)?choices[0].artworkId:await chooseFrame(choices);
  if(!isCurrent()||selected===null)throw new ImagegenPreparationCancelled();
  const choice=choices.find(item=>item.artworkId===selected);if(!choice)throw new Error("所选画幅已失效，请重新选择");
  form.set("frameSourceIndex",choice.artworkId);form.set("format",choice.ratio);form.set("ratio",choice.ratio);
 }finally{choices.forEach(choice=>URL.revokeObjectURL(choice.url));}
}
/** Ordinary node prompts use the same read-only plan; specialized old recipes retain their adapter. */
export async function submitCanvasImagegen(form:FormData,sourceNodeId:string|undefined,onPlan:((message:string)=>void)|undefined,scope:{owner:string;project:string;headers?:Record<string,string>;isCurrent?:()=>boolean;chooseFrame?:(choices:CanvasFrameChoice[])=>Promise<string|null>}){
 const workspace=currentWorkspace(),capturedHeaders=scope.headers?imagegenScopeHeaders(scope.headers):undefined,context={workspace,...capturedHeaders?{headers:capturedHeaders}:{},...scope.project!=='workspace'?{projectContext:scope.project}:{},isCurrent:()=>currentWorkspace()===workspace&&(!scope.isCurrent||scope.isCurrent())};
 const assertCurrent=()=>{if(currentWorkspace()!==workspace||scope.isCurrent&&!scope.isCurrent())throw new Error("画布账号、项目或工作空间已切换，未提交新任务");};assertCurrent();
 const actionKey=await canvasImagegenActionKey(form,sourceNodeId);assertCurrent();
 const key=pendingAttemptKey(scope.owner,workspace,scope.project,actionKey);
 const response=await withPendingAttempt(key,async()=>{
 let pending:ImagegenPendingAttempt|null=null,submitting=false;
 try {
 assertCurrent();submitting=true;pending=readPendingAttempt(key);submitting=!!pending&&pending.accepted!=='unaccepted';
 if(pending&&pending.accepted!=='unaccepted'){
  // A 404 can race acceptance or hide a scope mismatch. It never authorizes
  // another paid POST; retain this receipt until the original is recovered.
  submitting=true;
  let result:Awaited<ReturnType<typeof pollImagegen>>;
  try{result=await pollImagegen(pending.operationId,{...pending.context,isCurrent:context.isCurrent});}
  catch(error){if(error instanceof ImagegenHttpError)throw new ImagegenHttpError(error.message,error.status,undefined,error.code);throw error;}
  assertCurrent();
  if(result.jobId!==`imagegen-${pending.operationId}`||result.operationId&&result.operationId!==pending.operationId)throw new ImagegenHttpError('原任务回执尚未核实，请稍后重试',0);
  pending={...pending,accepted:'accepted',jobId:result.jobId};savePendingAttempt(key,pending);
  return Response.json({jobId:result.jobId});
 }
 let request:ImagegenRequest;
 if(pending)request=pending.request;
 else {
 const inputs:ImagegenRequest["inputs"]=[],assets:CanvasFrameChoice[]=[];
 const files=form.getAll("image").filter((file):file is File=>file instanceof File);
 const manifest=form.has("canvasReferences")?canvasReferenceManifestSchema.parse(JSON.parse(String(form.get("canvasReferences")))):null;
 if(manifest){
   if(manifest.length!==files.length)throw new Error("参考图与实际上传图片不一致，请重新选择");
   const error=referenceManifestError(String(form.get("userPrompt")||form.get("prompt")||""),manifest);if(error)throw new Error(error);
 }
 for(const file of files){assertCurrent();const label=manifest?.[inputs.length];const asset=await uploadImagegenInput(file,files.length,assertCurrent,context,label?.sourceNodeId);assertCurrent();const input={artworkId:asset.artworkId,originalArtworkId:asset.originalArtworkId,inputVariant:asset.inputVariant,role:label?.role||(inputs.length?"reference" as const:"edit-target" as const),...(label?{reference:{number:label.number,title:label.title,...(label.sourceNodeId?{sourceNodeId:label.sourceNodeId}:{})}}:{})};inputs.push(input);const original={...asset,width:asset.sourceWidth,height:asset.sourceHeight};assets.push({...original,label:label?`图${label.number} · ${label.title}`:`图片 ${inputs.length}`,ratio:frameRatio(original)||""});}
 const value=(name:string)=>String(form.get(name)||"");
 const style=value("style"),raw=value("userPrompt")||value("prompt"),prompt=raw+(style&&!/默认|default/i.test(style)?`\n用户选择的视觉风格：${style}`:"");
 const canvasTarget=value("canvasTargetNode")?{nodeId:value("canvasTargetNode"),expectedRevision:Number(value("canvasTargetRevision")||0),expectedImage:value("canvasTargetImage")}:undefined;
 request=imagegenRequestSchema.parse({version:1,operationId:browserRandomUUID(),entry:"canvas",mode:inputs.some(input=>input.role==="edit-target")?"edit":"generate",prompt,sourceNodeId:canvasTarget?.nodeId||value("parentId")||sourceNodeId,canvasTarget,inputs,framePolicy:"all-inputs",modelId:value("model")||undefined,variants:Number(value("count")||1),parameters:{quality:value("quality")||"medium",resolution:value("resolution")||"1K",ratio:value("ratio")||"auto"},output:value("transparent")==="1"?{background:"transparent",backgroundOrigin:"current-ui"}:{format:"png"}});
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
  const candidates=new Set(frameCandidates(frameInputs,intent.useCase,request.frameSourceId,request.framePolicy).map(input=>input.artworkId));
  const choices=assets.filter(asset=>candidates.has(asset.artworkId)&&asset.ratio);
  if(!choices.length)throw error;
  const selected=await scope.chooseFrame(choices);assertCurrent();
  if(selected===null)throw new ImagegenPreparationCancelled();
  const choice=choices.find(asset=>asset.artworkId===selected);if(!choice)throw new Error("所选画幅已失效，请重新选择");
  request.frameSourceId=choice.artworkId;
  request.parameters.ratio=choice.ratio;
 }
 }
 assertCurrent();const plan=await previewImagegen(request,context);assertCurrent();const stages=plan.steps.map(s=>s.operation==="cutout"?"抠图":s.operation==="edit"?"编辑":"生成").join(" → ");
 if(plan.requestedParameters?.resolution)onPlan?.(plan.warnings.join("\n"));
 if(plan.intent.background==="transparent")onPlan?.(`已识别：透明背景 · ${stages} · ${plan.totalCredits} 积分`);
 const placement=form.has("imagegenPlacement")?readCanvasFanoutPlacement(JSON.parse(String(form.get("imagegenPlacement"))),request.sourceNodeId,request.variants):undefined;
 if(form.has("imagegenPlacement")&&(!placement||request.canvasTarget))throw new Error("生成位置记录与本次请求不一致");
 const submit=async(latest:typeof plan)=>{
  assertCurrent();
  pending={version:1,owner:scope.owner.toLowerCase(),workspace,project:scope.project,actionKey,operationId:request.operationId,quoteId:latest.quote?.id,request,authorizedCredits:latest.totalCredits,confirmationRequired:latest.confirmationRequired,...placement?{placement}:{},accepted:'unknown',context:{workspace,...capturedHeaders?{headers:capturedHeaders}:{},...scope.project!=='workspace'?{projectContext:scope.project}:{}}};
  // Durable, scoped identity exists before authentication and the paid POST.
  savePendingAttempt(key,pending);submitting=true;
  try{return await startImagegen(request,{billingVersion:latest.billingVersion,modelVersion:latest.modelVersion,credits:latest.totalCredits,confirmed:true,quoteId:latest.quote?.id},context);}
  catch(error){if(error instanceof ImagegenHttpError&&error.accepted===false){pending={...pending,accepted:'unaccepted'};savePendingAttempt(key,pending);}throw error;}
 };
 let result:Awaited<ReturnType<typeof startImagegen>>;
 try{result=await submit(plan);}
 catch(error){
  // Refresh only when the server proved this operation was not accepted.
  // Network/unknown/accepted results retain their receipt; no paid retry here.
  if(!(error instanceof ImagegenHttpError&&error.status===409&&error.code==="IMAGEGEN_PLAN_CHANGED"&&error.accepted===false))throw error;
  submitting=false;
  assertCurrent();const latest=await previewImagegen(request,context);assertCurrent();
  if(latest.requestedParameters?.resolution)onPlan?.(latest.warnings.join("\n"));
  assertCurrent();result=await submit(latest);
 }
 assertCurrent();
 if(!('jobId' in result)||result.jobId!==`imagegen-${request.operationId}`||'operationId' in result&&result.operationId!==request.operationId)throw new ImagegenHttpError('任务提交回执尚未核实，请稍后重试',0);
 pending={...pending!,accepted:'accepted',jobId:result.jobId};savePendingAttempt(key,pending);
 return Response.json({jobId:result.jobId});
 } catch(error) {
  if(error instanceof ImagegenPreparationCancelled)throw error;
  // Upload/plan/storage failures precede the only paid POST. Mark them as
  // not accepted so the canvas can offer an explicit retry without ambiguity.
  if(!submitting)throw new ImagegenHttpError(error instanceof Error?error.message:"生成准备失败",error instanceof ImagegenHttpError?error.status:0,false);
  throw error;
 }
 });
 assertCurrent();return response;
}
