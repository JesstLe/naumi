import "server-only";
import {DurableImageJobs} from "../durable-image-jobs";
import {getPool, dbEnabled} from "@/platform/db/pool";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {addArtworks} from "@/lib/artworks/writer";
import {readCanvasOutput} from "../canvas-image-input";
import {inspectImagegenPixels} from "./postprocess";
import {saveCanvasLocalEdit} from "../canvas-local-image-edit";
import {planImagegen,imagegenFingerprint} from "./plan";
import {assertImagegenQuoteReference,frozenImagegenQuote,latestImagegenQuote,type ImagegenSubmissionConfirmation} from "./quotes";
import {executeImagegenStep} from "./adapters";
import {imagegenStepId} from "./generation-core";
import {imagegenRequestSchema} from "./schema";
import {imagegenSubmission,ImagegenStopped} from "./cancel";
import {readImagegenInputAsset} from "./input-assets";
import {readImagegenInputs} from "./inputs";
import {preserveMaskedOutside} from "./mask";
import type {ImagegenPlan,ImagegenRequest,ImagegenResult} from "./types";
import { imageOutputNotice, presentImagegenOutput, legacyRatioWarning } from "./output-advisory";
import { plainGeneratedOutput } from "./receipt-policy";
import { storedImageReview, IMAGE_REVIEW_MESSAGE } from "../image-job-review";
import { storedDeliveryState, recoverStoredDelivery } from "./stored-delivery";
import {readImagegenBilling} from "./delivery-billing";
import {currentCreationContext} from "../saas/creation-context";
import {assertImagegenCreationScope,imagegenCreationScopeKey,ImagegenScopeError} from "./creation-scope";
type Parent={status:string;result:ImagegenResult;fingerprint:string;children:Record<string,{state:"starting"|"submitted"|"done";jobId?:string;ids?:string[]}>};
const jobs=new DurableImageJobs<Parent>("imagegen");
const memoryScopes=new Map<string,unknown>();
async function assertParentScope(id:string,owner:string){
 if(!dbEnabled){assertImagegenCreationScope(memoryScopes.get(id),owner);return;}
 const row=(await getPool().query("SELECT payload->'creationScope' AS scope FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen'",[id,owner.toLowerCase()])).rows[0];
 if(!row)throw new ImagegenScopeError();
 assertImagegenCreationScope(row.scope,owner);
}
class NotAccepted extends Error{}
const parentId=(id:string)=>`imagegen-${id}`;
async function artifacts(ids:string[],owner:string){
 const works=await listArtworksByIds(owner,ids);
 const results=[];
 for(const id of ids){const w=works.find(w=>w.id===id);if(!w?.image)throw new Error("任务产物不存在或无权访问");const input=await readCanvasOutput(w.image,"http://internal",owner),pixels=await inspectImagegenPixels(input.buffer);results.push({artworkId:id,url:w.image,mime:input.mimeType,...pixels});}
 return results;
}
async function runParent(id:string,payload:Record<string,unknown>,snapshot:Parent){
 const plan=payload.plan as ImagegenPlan,owner=await jobs.owner(id);if(!owner)return;
 let ids:string[]=[],baseIds:string[]=[],cutoutIds:string[]=[],state=snapshot,deliveryComplete=true;
 const warnings = new Set(snapshot.result.warnings || []);
 const checkChildOutput = async (jobId?: string) => {
  if(!jobId)return;
  const row=(await getPool().query("SELECT snapshot->>'deliveryComplete' AS complete,snapshot->>'imagegenOutputError' AS error,snapshot->>'imagegenOutputWarning' AS warning,jsonb_array_length(CASE WHEN jsonb_typeof(snapshot->'images')='array' THEN snapshot->'images' ELSE '[]'::jsonb END) AS images FROM app_image_jobs WHERE id=$1 AND email=$2",[jobId,owner])).rows[0];
  const notice=imageOutputNotice(row?.error,row?.warning,Number(row?.images)>0);
  if(notice.error)throw new Error(notice.error);
  if(notice.warning)warnings.add(notice.warning);
  if(row?.complete==="false")deliveryComplete=false;
 };
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
   if(child?.state==="done"){ids=child.ids||[];if(step.operation==="cutout")cutoutIds.push(...ids);else baseIds=ids;await checkChildOutput(child.jobId);continue;}
   if(!child||child.state==="starting"){
    const wasStarting=!!child;
    const response=await imagegenSubmission(id,async()=>{
    if(!child){child={state:"starting"};await update({status:"running",children:{...state.children,[step.key]:child}},{status:"running",stage:step.operation==="cutout"?"postprocessing":step.operation==="edit"?"editing":"generating"});}
    const effective=step.operation==="cutout"&&baseIds.length?{...plan,request:{...plan.request,inputs:[{artworkId:baseIds[Number(step.key.split("-")[1])||0],role:"edit-target" as const}]}}:plan;
    return executeImagegenStep(effective,step.key,owner);
    },wasStarting),body=response.body;
    if(response.status<200||response.status>=300){
     if(body.code==="OPERATION_PENDING"||response.status>=500){await update({status:"error"},{status:"failed",error:{code:"SUBMISSION_UNKNOWN",message:"本次生成未完成，请重试"}});return;}
     throw new NotAccepted(body.error||"执行步骤被拒绝");
    }
    child=body.jobId?{state:"submitted",jobId:body.jobId}:{state:"done",ids:body.id?[body.id]:body.images?.map((i:{id:string})=>i.id)||[]};
    await update({children:{...state.children,[step.key]:child}});
   }
   if(child!.state==="submitted"){
    const row=(await getPool().query("SELECT email,snapshot FROM app_image_jobs WHERE id=$1 AND kind='generate'",[child!.jobId])).rows[0];
    if(!row||row.email!==owner){await update({status:"error"},{status:"failed",error:{code:"CHILD_MISSING",message:"生成任务读取失败，请重试"}});return;}
    if(row.snapshot.status==="needs_attention"){await update({status:"error"},{status:"failed",error:{code:"CHILD_PENDING",message:row.snapshot.error||"本次未取得图片，请重试"}});return;}
    if(row.snapshot.status==="error"){
     const attempts=Object.values(row.snapshot.paidOperations||{}) as {state:string}[];
     if(attempts.length&&attempts.every(a=>a.state==="rejected"))throw new NotAccepted(row.snapshot.error||"供应商明确未受理");
     throw new Error(row.snapshot.error||"生成失败");
    }
    if(row.snapshot.status!=="done"){await update({status:"pending"},{status:row.snapshot.queueState?"queued":"pending"});return;}
    child={...child,state:"done",ids:(row.snapshot.images||[]).map((i:{id:string})=>i.id)};
    await update({children:{...state.children,[step.key]:child}});
   }
   ids=child!.ids||[];if(step.operation==="cutout")cutoutIds.push(...ids);else baseIds=ids;
   if(!ids.length)throw new Error("模型未返回有效图片");
   await checkChildOutput(child!.jobId);
  }
  if(cutoutIds.length)ids=cutoutIds;
  await update({},{stage:"postprocessing"});
  if(plan.request.inputs.some(input=>input.role==="mask")){
   const inputs=await readImagegenInputs(plan.request,owner),target=inputs.find(input=>input.role==="edit-target")!,mask=inputs.find(input=>input.role==="mask")!;
   const sources=await listArtworksByIds(owner,ids),constrained:string[]=[];
   for(const [i,source] of ids.entries()){
    const work=sources.find(work=>work.id===source);if(!work?.image)throw new Error("蒙版结果不存在或无权访问");
    const generated=await readCanvasOutput(work.image,"http://internal",owner);
    const replacement=await preserveMaskedOutside(target.buffer,mask.buffer,generated.buffer,plan.intent.background==="transparent");
    const saved=await saveCanvasLocalEdit(owner,{mode:"replace",id:source,operationId:imagegenStepId(plan.request.operationId,`mask-${i}`)},"http://internal",replacement,{entry:plan.request.entry,generatedOutput:true});
    constrained.push(saved.id);
   }
   ids=constrained;
  }
  const output={...plan.request.output,compression:plan.request.output.compressionMode==="native"?undefined:plan.request.output.compression,background:plan.intent.background||undefined};
  if(plan.request.mode==="postprocess"||plan.request.chroma||output.format!=="png"||output.compression!==undefined||output.downscaleMaxDim||output.flattenColor){
   const processed:string[]=[];
   for(const [i,source] of ids.entries()){const result=await saveCanvasLocalEdit(owner,{mode:"process",id:source,operationId:imagegenStepId(plan.request.operationId,`output-${i}`),output,chroma:plan.request.chroma},"http://internal",undefined,{entry:plan.request.entry});processed.push(result.id);}
   ids=processed;
  }
  const result=await artifacts(ids,owner);
  if(plan.intent.background==="transparent"&&result.some(a=>a.transparentPixels===0||a.visiblePixels===0))throw new Error("结果没有有效透明主体；原生成版本已保留，请调整模型能力或抠图设置");
  const billing=await readImagegenBilling(owner,state.children,plan);
  await update({status:"done"},{status:deliveryComplete&&result.length===plan.request.variants?"succeeded":"partial",stage:"done",artifacts:result,chargedCredits:billing.chargedCredits,billingStatus:billing.confirmed?"confirmed":"unavailable",warnings:[...warnings],error:undefined});
 }catch(error){
  let kept:ImagegenResult["artifacts"]=[],charged=state.result.chargedCredits,chargeKnown=false;
  // Read actual settlement independently: an unreadable image must not turn a paid result into a zero-credit receipt.
  try{const billing=await readImagegenBilling(owner,state.children,plan);charged=billing.chargedCredits;chargeKnown=billing.confirmed;}catch{warnings.add("积分结算信息暂未同步，请查看积分记录");}
  for(const id of new Set(baseIds.length?baseIds:ids))try{kept.push(...await artifacts([id],owner));}catch{/* Other retained outputs remain recoverable; do not discard them. */}
  const safeToRestart=chargeKnown&&charged===0&&!kept.length&&!Object.values(state.children).some(c=>c.state==="done");
  await update({status:error instanceof ImagegenStopped?"done":"error"},{status:error instanceof ImagegenStopped?"cancelled":"failed",artifacts:kept,chargedCredits:charged,billingStatus:chargeKnown?"confirmed":"unavailable",warnings:[...warnings],error:error instanceof ImagegenStopped?undefined:{code:error instanceof NotAccepted?(safeToRestart?"NOT_ACCEPTED":"PARTIAL_EXECUTION_REJECTED"):"EXECUTION_FAILED",message:error instanceof Error?error.message:"图像处理失败"}});}
}
export async function resumeImagegen(id:string){await jobs.kick(id,(payload,snapshot)=>runParent(id,payload,snapshot));}
async function presentPendingReview(id:string,owner:string,snapshot:Parent):Promise<ImagegenResult|null>{
 if(!["pending","running"].includes(snapshot.status))return null;
 for(const child of Object.values(snapshot.children||{}))if(child.jobId&&await storedImageReview(child.jobId,owner))return {...snapshot.result,status:"failed",error:{code:"EXECUTION_FAILED",message:"本次未取得图片，请重试"}};
 return null;
}
/** Receipt lookup cannot claim work or depend on successful scheduling. */
async function presentParentOutput(id:string,owner:string,result:ImagegenResult):Promise<ImagegenResult>{
 if(!dbEnabled)return result;
 if(["succeeded","partial","failed","needs_attention","cancelled"].includes(result.status))try{
  const row=(await getPool().query("SELECT payload->'plan' plan,snapshot->'children' children FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen'",[id,owner.toLowerCase()])).rows[0];
  if(row){const billing=await readImagegenBilling(owner,row.children||{},row.plan);result={...result,chargedCredits:billing.chargedCredits,billingStatus:billing.confirmed?"confirmed":"unavailable"};}
 }catch{result={...result,billingStatus:"unavailable"};}
 if(!["failed","needs_attention"].includes(result.status))return result;
 const recovery=await storedDeliveryState(id,owner);
 if(recovery?.ids){try{
  const resultArtifacts=await artifacts(recovery.ids,owner);
  const row=(await getPool().query("SELECT payload->'plan' plan,snapshot->'children' children FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen'",[id,owner.toLowerCase()])).rows[0];
  if(!row)return result;
  const billing=await readImagegenBilling(owner,row.children,row.plan);
  return {...result,artifacts:resultArtifacts,chargedCredits:billing.chargedCredits,billingStatus:billing.confirmed?"confirmed":"unavailable",recoveryAvailable:false,status:recovery.complete?"succeeded":"needs_attention",stage:recovery.complete?"done":result.stage,error:recovery.complete?undefined:{code:"OUTPUT_PROCESSING_INCOMPLETE",message:"原始生成图片已恢复，其余处理仍待核查；不会重新生成"},warnings:[...new Set([...(result.warnings||[]),"已从保存的原始结果恢复，没有重新生成或重复扣费"])]};
 }catch{return {...result,billingStatus:"unavailable"};}}
 if(recovery?.available)return {...result,recoveryAvailable:true,error:{code:"STORED_OUTPUT_AVAILABLE",message:"已有原始生成图片待恢复，点击检查原任务可恢复；不会重新生成或重复扣费"}};
 const legacyRatio=legacyRatioWarning(result.error?.message),oversize=result.error?.code==="EXECUTION_FAILED"&&result.error.message==="对象超过大小限制";
 if(!legacyRatio&&!oversize)return result;
 const row=(await getPool().query("SELECT payload->'plan' AS plan,snapshot->'children' AS children FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='imagegen'",[id,owner.toLowerCase()])).rows[0];
 if(!row)return result;
 const plan=row.plan as ImagegenPlan,children=row.children as Parent["children"],finished=Object.values(children||{});
 const single=finished.length===1&&finished.every(c=>c.state==="done")&&plainGeneratedOutput(plan);
 if(!single)return result;
 if(!oversize)return presentImagegenOutput(result,true);
 const child=finished[0];
 const saved=child.jobId?(await getPool().query("SELECT snapshot FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind='generate'",[child.jobId,owner.toLowerCase()])).rows[0]?.snapshot:undefined;
 if(!saved||saved.status!=="done"||saved.imagegenOutputError&&!legacyRatioWarning(saved.imagegenOutputError))return result;
 const ids=(saved.images||[]).map((image:{id?:string})=>image.id).filter(Boolean) as string[];
 if(!ids.length||ids.length>4||ids.length!==(child.ids||[]).length||ids.some(id=>!child.ids?.includes(id)))return result;
 try{
  const restored=await artifacts(ids,owner),billing=await readImagegenBilling(owner,children,plan);
  return {...result,status:"succeeded",stage:"done",artifacts:restored,chargedCredits:billing.chargedCredits,billingStatus:billing.confirmed?"confirmed":"unavailable",error:undefined,warnings:[...new Set([...(result.warnings||[]),"已恢复原生成图片，积分以实际结算记录为准"])]};
 }catch{return {...result,billingStatus:"unavailable"};}
}
export async function readImagegenReceipt(operationId:string,owner:string):Promise<ImagegenResult|null>{
 const id=parentId(operationId);if(await jobs.owner(id)!==owner.toLowerCase())return null;
 const saved=await jobs.get(id,false);if(!saved)return null;
 try{await assertParentScope(id,owner);}catch(error){if(error instanceof ImagegenScopeError)return null;throw error;}
 return await presentPendingReview(id,owner,saved)||presentParentOutput(id,owner,saved.result);
}
export async function getImagegenResult(operationId:string,owner:string):Promise<ImagegenResult|null>{
 const id=parentId(operationId);if((await jobs.owner(id))!==owner.toLowerCase())return null;
 const saved=await jobs.get(id,false);if(!saved)return null;
 try{await assertParentScope(id,owner);}catch(error){if(error instanceof ImagegenScopeError)return null;throw error;}
 // Active result polls finish proven stored bytes, never a new supplier request.
 // readImagegenReceipt above remains strictly read-only.
 if(["error","needs_attention"].includes(saved.status)){
  const recovery=await storedDeliveryState(id,owner);
  if(recovery?.available||recovery?.ids&&!recovery.complete)try{await recoverStoredDelivery(id,owner);}catch{/* Preserve the original checkpoint on a leased/failing delivery. */}
 }
 const review=await presentPendingReview(id,owner,saved);if(review)return review;
 if(!["done","error","needs_attention"].includes(saved.status))await resumeImagegen(id);
 const current=(await jobs.get(id,false))!;
 if(current.status==="error"&&current.result.status!=="failed")return {...current.result,status:"failed",error:{code:"EXECUTION_FAILED",message:"图片加载失败，请重试"}};
 return presentParentOutput(id,owner,current.result);
}
export async function submitImagegen(raw:ImagegenRequest,owner:string,confirmation?:ImagegenSubmissionConfirmation):Promise<ImagegenResult>{
 const request=imagegenRequestSchema.parse(raw),id=parentId(request.operationId),fingerprint=imagegenFingerprint(request);
 if(confirmation?.quoteId!==undefined)assertImagegenQuoteReference(confirmation.quoteId,request.operationId);
 const previous=await jobs.get(id,false);
 if(previous){if(await jobs.owner(id)!==owner.toLowerCase()||previous.fingerprint!==fingerprint)throw new Error("提交编号与已有请求冲突");await assertParentScope(id,owner);await resumeImagegen(id);return previous.result;}
 try{
  if(confirmation?.quoteId!==undefined)return await submitAcceptedImagegen(await frozenImagegenQuote(request,owner,confirmation),owner,fingerprint);
  if(confirmation?.confirmed===false)throw new Error("已取消提交");
  const quoteId=await latestImagegenQuote(request,owner);
  const plan=quoteId?await frozenImagegenQuote(request,owner,{quoteId,confirmed:true}):await planImagegen(request,owner);
  return await submitAcceptedImagegen(plan,owner,fingerprint);
 }catch(error){
  const winner=await jobs.get(id,false);
  if(!winner||await jobs.owner(id)!==owner.toLowerCase()||winner.fingerprint!==fingerprint)throw error;
  await assertParentScope(id,owner);return winner.result;
 }
}
/** Server-owned frozen batch/Agent plans only; no HTTP endpoint accepts a client-supplied plan. */
export async function submitAcceptedImagegen(plan:ImagegenPlan,owner:string,fingerprint=plan.fingerprint):Promise<ImagegenResult>{
 const request=plan.request,id=parentId(request.operationId),prior=await jobs.get(id,false);
 if(prior){if(await jobs.owner(id)!==owner.toLowerCase()||prior.fingerprint!==fingerprint)throw new Error("提交编号与已有请求冲突");await assertParentScope(id,owner);await resumeImagegen(id);return prior.result;}
 imagegenCreationScopeKey(owner);
 const result:ImagegenResult={operationId:request.operationId,jobId:id,status:"queued",stage:"planning",artifacts:[],chargedCredits:0,...(plan.warnings.length?{warnings:[...plan.warnings]}:{})};
 try{await jobs.create(id,owner,{status:"pending",result,fingerprint,children:{}},{plan},0,false);if(!dbEnabled)memoryScopes.set(id,structuredClone(currentCreationContext()));}catch(error){const race=await jobs.get(id,false);if(!race||await jobs.owner(id)!==owner.toLowerCase()||race.fingerprint!==fingerprint)throw error;await assertParentScope(id,owner);return race.result;}
 await resumeImagegen(id);return result;
}
