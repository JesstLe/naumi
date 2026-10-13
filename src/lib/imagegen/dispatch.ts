import "server-only";
import {DurableImageJobs} from "../durable-image-jobs";
import {getPool,listArtworksByIds,addArtworks} from "../db";
import {readCanvasImage} from "../canvas-image-input";
import {inspectImagegenPixels} from "./postprocess";
import {saveCanvasLocalEdit} from "../canvas-local-image-edit";
import {planImagegen,imagegenFingerprint} from "./plan";
import {executeImagegenStep} from "./adapters";
import {imagegenStepId} from "./generation-core";
import {imagegenRequestSchema} from "./schema";
import {imagegenSubmission,ImagegenStopped} from "./cancel";
import {readImagegenInputAsset} from "./input-assets";
import type {ImagegenPlan,ImagegenRequest,ImagegenResult} from "./types";
type Parent={status:string;result:ImagegenResult;fingerprint:string;children:Record<string,{state:"starting"|"submitted"|"done";jobId?:string;ids?:string[]}>};
const jobs=new DurableImageJobs<Parent>("imagegen");
class NotAccepted extends Error{}
const parentId=(id:string)=>`imagegen-${id}`;
async function artifacts(ids:string[],owner:string){
 const works=await listArtworksByIds(owner,ids);
 const results=[];
 for(const id of ids){const w=works.find(w=>w.id===id);if(!w?.image)throw new Error("任务产物不存在或无权访问");const input=await readCanvasImage(w.image,"http://internal",owner),pixels=await inspectImagegenPixels(input.buffer);results.push({artworkId:id,url:w.image,mime:input.mimeType,...pixels});}
 return results;
}
async function runParent(id:string,payload:Record<string,unknown>,snapshot:Parent){
 const plan=payload.plan as ImagegenPlan,owner=await jobs.owner(id);if(!owner)return;
 let ids:string[]=[],baseIds:string[]=[],cutoutIds:string[]=[],state=snapshot;
 const update=async(patch:Partial<Parent>,result:Partial<ImagegenResult>={})=>{state={...state,...patch,result:{...state.result,...result}};await jobs.set(id,state);};
 try{
  for(const step of plan.steps){
   if(step.operation==="postprocess"){
    await imagegenSubmission(id,async()=>{});
    for(const input of plan.request.inputs.filter(i=>i.role==="edit-target")){
     if(!input.artworkId.startsWith("asset-")){ids.push(input.artworkId);continue;}
     const imported=`art-${imagegenStepId(plan.request.operationId,`import:${input.artworkId}`)}`;
     if(!(await listArtworksByIds(owner,[imported])).length){const asset=await readImagegenInputAsset(input.artworkId,owner),pixels=await inspectImagegenPixels(asset.buffer);await addArtworks(owner,[{id:imported,title:"导入原图",category:"main",status:"completed",prompt:"",image:asset.url,gradient:"",origin:plan.request.entry==="canvas"?"canvas":"generate",width:pixels.width,height:pixels.height}]);}
     ids.push(imported);
    }baseIds=[...ids];break;
   }
   let child=state.children[step.key];
   if(child?.state==="done"){ids=child.ids||[];if(step.operation==="cutout")cutoutIds.push(...ids);else baseIds=ids;continue;}
   if(!child||child.state==="starting"){
    const wasStarting=!!child;
    const response=await imagegenSubmission(id,async()=>{
    if(!child){child={state:"starting"};await update({status:"running",children:{...state.children,[step.key]:child}},{status:"running",stage:step.operation==="cutout"?"postprocessing":step.operation==="edit"?"editing":"generating"});}
    const effective=step.operation==="cutout"&&baseIds.length?{...plan,request:{...plan.request,inputs:[{artworkId:baseIds[Number(step.key.split("-")[1])||0],role:"edit-target" as const}]}}:plan;
    return executeImagegenStep(effective,step.key,owner);
    },wasStarting),body=await response.json();
    if(!response.ok){
     if(body.code==="OPERATION_PENDING"||response.status>=500){await update({status:"needs_attention"},{status:"needs_attention",error:{code:"SUBMISSION_UNKNOWN",message:"上游提交结果待核查，任务保留，不会重复生成"}});return;}
     throw new NotAccepted(body.error||"执行步骤被拒绝");
    }
    child=body.jobId?{state:"submitted",jobId:body.jobId}:{state:"done",ids:body.id?[body.id]:body.images?.map((i:{id:string})=>i.id)||[]};
    await update({children:{...state.children,[step.key]:child}});
   }
   if(child!.state==="submitted"){
    const row=(await getPool().query("SELECT email,snapshot FROM app_image_jobs WHERE id=$1 AND kind='generate'",[child!.jobId])).rows[0];
    if(!row||row.email!==owner){await update({status:"needs_attention"},{status:"needs_attention",error:{code:"CHILD_MISSING",message:"生成任务待核查，不会重复提交"}});return;}
    if(row.snapshot.status==="needs_attention"){await update({status:"needs_attention"},{status:"needs_attention",error:{code:"CHILD_PENDING",message:row.snapshot.error||"上游结果待核查"}});return;}
    if(row.snapshot.status==="error"){
     const attempts=Object.values(row.snapshot.paidOperations||{}) as {state:string}[];
     if(attempts.length&&attempts.every(a=>a.state==="rejected"))throw new NotAccepted(row.snapshot.error||"供应商明确未受理");
     throw new Error(row.snapshot.error||"生成失败");
    }
    if(row.snapshot.status!=="done"){await update({status:"pending"},{status:"pending"});return;}
    child={...child,state:"done",ids:(row.snapshot.images||[]).map((i:{id:string})=>i.id)};
    await update({children:{...state.children,[step.key]:child}});
   }
   ids=child!.ids||[];if(step.operation==="cutout")cutoutIds.push(...ids);else baseIds=ids;
   if(!ids.length)throw new Error("模型未返回有效图片");
   if(child!.jobId){const row=(await getPool().query("SELECT snapshot->>'imagegenOutputError' AS error FROM app_image_jobs WHERE id=$1 AND email=$2",[child!.jobId,owner])).rows[0];if(row?.error)throw new Error(row.error);}
  }
  if(cutoutIds.length)ids=cutoutIds;
  await update({},{stage:"postprocessing"});
  const output={...plan.request.output,compression:plan.request.output.compressionMode==="native"?undefined:plan.request.output.compression,background:plan.intent.background||undefined};
  if(plan.request.mode==="postprocess"||plan.request.chroma||output.format!=="png"||output.compression!==undefined||output.downscaleMaxDim||output.flattenColor){
   const processed:string[]=[];
   for(const [i,source] of ids.entries()){const result=await saveCanvasLocalEdit(owner,{mode:"process",id:source,operationId:imagegenStepId(plan.request.operationId,`output-${i}`),output,chroma:plan.request.chroma},"http://internal");processed.push(result.id);}
   ids=processed;
  }
  const result=await artifacts(ids,owner);
  if(plan.intent.background==="transparent"&&result.some(a=>a.transparentPixels===0||a.transparentPixels===a.totalPixels))throw new Error("结果没有有效透明主体；原生成版本已保留，请调整模型能力或抠图设置");
  const charge=(await getPool().query("SELECT COALESCE(sum(charged_credits),0)::int AS n FROM app_billing_operations WHERE email=$1 AND (id=ANY($2::text[]) OR id=ANY($3::text[]))",[owner,Object.values(state.children).map(c=>c.jobId).filter(Boolean),plan.steps.map(s=>`tool-${imagegenStepId(plan.request.operationId,s.key)}`)])).rows[0].n;
  await update({status:"done"},{status:"succeeded",stage:"done",artifacts:result,chargedCredits:charge,error:undefined});
 }catch(error){
  let kept:ImagegenResult["artifacts"]=[],charged=0;
  try{kept=await artifacts(baseIds.length?baseIds:ids,owner);charged=Number((await getPool().query("SELECT COALESCE(sum(charged_credits),0)::int AS n FROM app_billing_operations WHERE email=$1 AND (id=ANY($2::text[]) OR id=ANY($3::text[]))",[owner,Object.values(state.children).map(c=>c.jobId).filter(Boolean),plan.steps.map(s=>`tool-${imagegenStepId(plan.request.operationId,s.key)}`)])).rows[0].n);}catch{/* Historical task data remains recoverable by its child ID. */}
  await update({status:error instanceof ImagegenStopped?"done":"error"},{status:error instanceof ImagegenStopped?"cancelled":"failed",artifacts:kept,chargedCredits:charged,error:error instanceof ImagegenStopped?undefined:{code:error instanceof NotAccepted?"NOT_ACCEPTED":"EXECUTION_FAILED",message:error instanceof Error?error.message:"图像处理失败"}});}
}
export async function resumeImagegen(id:string){await jobs.kick(id,(payload,snapshot)=>runParent(id,payload,snapshot));}
export async function getImagegenResult(operationId:string,owner:string):Promise<ImagegenResult|null>{
 const id=parentId(operationId);if((await jobs.owner(id))!==owner.toLowerCase())return null;
 const saved=await jobs.get(id,false);if(!saved)return null;
 if(!["done","error","needs_attention"].includes(saved.status))await resumeImagegen(id);
 const current=(await jobs.get(id,false))!;
 if(current.status==="error"&&current.result.status!=="failed")return {...current.result,status:"needs_attention",error:{code:"RECOVERY_REQUIRED",message:"任务恢复异常，请联系管理员核查；不会重复提交"}};
 return current.result;
}
export async function submitImagegen(raw:ImagegenRequest,owner:string,confirmation?:{billingVersion:number;credits:number;confirmed:boolean;modelVersion?:number}):Promise<ImagegenResult>{
 const request=imagegenRequestSchema.parse(raw),id=parentId(request.operationId),fingerprint=imagegenFingerprint(request);
 const previous=await jobs.get(id,false);
 if(previous){if(await jobs.owner(id)!==owner.toLowerCase()||previous.fingerprint!==fingerprint)throw new Error("提交编号与已有请求冲突");await resumeImagegen(id);return previous.result;}
 const plan=await planImagegen(request,owner);
 if(plan.totalCredits>0&&(!confirmation||confirmation.billingVersion!==plan.billingVersion||(confirmation.modelVersion!==undefined&&confirmation.modelVersion!==plan.modelVersion)||confirmation.credits!==plan.totalCredits||confirmation.confirmed!==true))throw new Error("请确认最新执行计划和积分报价后提交");
 return submitAcceptedImagegen(plan,owner,fingerprint);
}
/** Server-owned frozen batch/Agent plans only; no HTTP endpoint accepts a client-supplied plan. */
export async function submitAcceptedImagegen(plan:ImagegenPlan,owner:string,fingerprint=plan.fingerprint):Promise<ImagegenResult>{
 const request=plan.request,id=parentId(request.operationId),prior=await jobs.get(id,false);
 if(prior){if(await jobs.owner(id)!==owner.toLowerCase()||prior.fingerprint!==fingerprint)throw new Error("提交编号与已有请求冲突");await resumeImagegen(id);return prior.result;}
 const result:ImagegenResult={operationId:request.operationId,jobId:id,status:"queued",stage:"planning",artifacts:[],chargedCredits:0};
 try{await jobs.create(id,owner,{status:"pending",result,fingerprint,children:{}},{plan},0,false);}catch(error){const race=await jobs.get(id,false);if(!race||await jobs.owner(id)!==owner.toLowerCase()||race.fingerprint!==fingerprint)throw error;return race.result;}
 await resumeImagegen(id);return result;
}
