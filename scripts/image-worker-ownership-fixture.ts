/** Fixture setup invokes real submission, handlers, repositories and billing.
 * No execution/quote/claim implementation is replaced. Both complete source
 * trees compile this same entry; only the local supplier is synthetic. */
import {randomUUID} from "node:crypto";
import {seed as seedOriginal,pool} from "./direct-worker-pg-fixture";
import {getOrCreateUser} from "@/lib/accounts/session";
import {DurableImageJobs} from "@/lib/image-jobs/runtime";
import {submitGeneration} from "@/lib/imagegen/generation-submission";
import {submitAcceptedImagegen,getImagegenResult} from "@/lib/imagegen/dispatch";
import {submitAcceptedImagegenBatch,recoverImagegenBatches} from "@/lib/imagegen/batch";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {imagegenFingerprint} from "@/lib/imagegen/plan";
import {imagegenStepId} from "@/lib/imagegen/generation-core";
import {cancelImagegenOperation} from "@/lib/imagegen/cancel";
import {recoverStoredDelivery,recoverStoredDeliveries} from "@/lib/imagegen/stored-delivery";
import {accept,singleState} from "@/lib/reference-workbench/service";
import {digest} from "@/lib/reference-workbench/contract";
import {signUserSession} from "@/lib/native-auth";
import * as generationRoute from "@/app/api/generate-image/route";
import * as suiteRoute from "@/app/api/suite/route";
import * as aplusRoute from "@/app/api/aplus/route";
import * as imagegenRoute from "@/app/api/imagegen/route";
import * as batchRoute from "@/app/api/imagegen/batches/[id]/route";
import * as deliveryRoute from "@/app/api/imagegen/recover-delivery/route";
import {backgroundWorkCount,waitForBackgroundWork} from "@/lib/worker/inflight";
import {closeImageCoordinationPool} from "@/lib/imagegen/coordination-pool";
import type {ImagegenPlan} from "@/lib/imagegen/types";

export {pool,backgroundWorkCount,waitForBackgroundWork,recoverImagegenBatches,recoverStoredDeliveries,closeImageCoordinationPool};
export async function seed(){
 const data=await seedOriginal();
 await getOrCreateUser("other@fixture.test");
 const p=(await pool().query("SELECT payload->'p' AS p FROM app_image_jobs WHERE id=$1",[data.ids.generate])).rows[0].p;
 return {...data,p};
}
export async function kickHttp(data:any){
 const routes={generate:generationRoute,suite:suiteRoute,aplus:aplusRoute,imagegen:imagegenRoute},statuses=[];
 for(const [kind,route]of Object.entries(routes)){
  const response=await route.POST(new Request("http://internal/api/"+kind,{method:"POST",headers:{"content-type":"application/json","x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!},body:JSON.stringify({workerJobId:data.ids[kind]})}));
  statuses.push(response.status);
 }return statuses;
}
export async function submitNewGeneration(data:any){
 const result=await submitGeneration({...structuredClone(data.p),prompt:"new user submission",userPrompt:"new user submission"},{actor:async()=>data.owner,ip:null,quote:async()=>data.quotes.generate});
 if(result.status!==200||!result.body.jobId)throw Error("New generation rejected: "+JSON.stringify(result));
 return String(result.body.jobId);
}
function localPlan(data:any,id:string=randomUUID()):ImagegenPlan{
 const request=imagegenRequestSchema.parse({version:1,operationId:id,entry:"canvas",mode:"postprocess",prompt:"preserve original pixels",inputs:[{artworkId:data.artifact,role:"edit-target"}],parameters:{ratio:"1:1",resolution:"1K"},output:{format:"png"},variants:1});
 return {request,intent:{background:"opaque",operation:"postprocess",conflicts:[],requirements:[]},fingerprint:imagegenFingerprint(request),modelVersion:0,billingVersion:0,steps:[{key:"post",operation:"postprocess",eligibleUpstreamIds:[],parameters:{},credits:0}],totalCredits:0,confirmationRequired:false,warnings:[]};
}
export async function submitPostprocess(data:any){const plan=localPlan(data);await submitAcceptedImagegen(plan,data.owner);return plan;}
export async function submitNested(data:any,cancel=false){
 const plan=localPlan(data);plan.request.entry="workbench";plan.request.mode="generate";plan.request.inputs=[];plan.request.modelId="gpt-image-2";plan.request.parameters.quality="medium";plan.intent.operation="generate";plan.fingerprint=imagegenFingerprint(plan.request);plan.totalCredits=6;plan.billingVersion=data.quotes.generate.configVersion;
 plan.steps=[{key:"generate",operation:"generate",modelId:"gpt-image-2",eligibleUpstreamIds:[],parameters:{},credits:6,billingQuote:data.quotes.generate}];
 await submitAcceptedImagegen(plan,data.owner);await submitAcceptedImagegen(plan,data.owner);
 if(cancel)await cancelImagegenOperation(plan.request.operationId,data.owner);
 return plan;
}
export async function postprocessResult(data:any,plan:ImagegenPlan){return getImagegenResult(plan.request.operationId,data.owner);}
export async function submitBatch(data:any){
 const plan=localPlan(data),id=randomUUID(),items=[{key:"one",name:"one",prompt:plan.request.prompt},{key:"two",name:"two",prompt:plan.request.prompt}];
 const request=imagegenRequestSchema.parse({...plan.request,operationId:id,mode:"batch",batch:{items,concurrency:2,maxAttempts:1,failFast:false}});
 const batch={...plan,request,fingerprint:imagegenFingerprint(request),children:items.map(item=>({key:item.key,plan:localPlan(data,imagegenStepId(id,`batch:${item.key}:1`))}))};
 await submitAcceptedImagegenBatch(batch,data.owner);return id;
}
const cookie=(owner:string)=>`nv_user=${signUserSession(owner,Date.now())}`;
export async function readBatch(data:any,id:string,owner=data.owner){const response=await batchRoute.GET(new Request("http://internal/api/imagegen/batches/"+id,{headers:{cookie:cookie(owner)}}),{params:Promise.resolve({id})});return {status:response.status,body:await response.json()};}
export async function newWorkbench(data:any){
 const id=randomUUID(),rid=randomUUID(),body={request_id:rid,prompt:"fixture reference",count:2};
 const plans=["1","2"].map(key=>{const plan=localPlan(data);plan.request.prompt=body.prompt;plan.fingerprint=imagegenFingerprint(plan.request);return {key,ref:"",kind:"generate",prompt:body.prompt,settings:{count:1,ratio:"1:1",resolution:"1K"},inputs:[],geometry:{width:32,height:32},plan,state:"queued"};});
 await pool().query("INSERT INTO app_reference_operations(id,owner,kind,request_id,fingerprint,body,plans) VALUES($1,$2,'single/start',$3,$4,$5::jsonb,$6::jsonb)",[id,data.owner,rid,digest({path:"single/start",body}),JSON.stringify(body),JSON.stringify(plans)]);
 let cancelStatus=0;try{await accept(data.owner,"single/start",{...body,native_quote:{id,confirmed:false}});}catch(error){cancelStatus=Number((error as any).status);}
 const before=(await pool().query("SELECT state FROM app_reference_operations WHERE id=$1",[id])).rows[0].state;
 const accepted=await accept(data.owner,"single/start",{...body,native_quote:{id}});
 return {id,cancelStatus,cancelState:before,accepted};
}
export async function workbenchResult(data:any,id:string){return singleState(data.owner,id);}
export async function newStored(data:any){
 const child="retained-"+randomUUID(),id="imagegen-"+randomUUID(),p=structuredClone(data.p),url=(await pool().query("SELECT image_url FROM app_artworks WHERE id=$1",[data.artifact])).rows[0].image_url;
 const jobs=new DurableImageJobs<any>("generate");await jobs.create(child,data.owner,{status:"error",paidOperations:{[child+":image:0"]:{state:"done",model:p.model,result:[{url}]}},createdAt:Date.now()},{p,cost:6,byok:false},6,true,data.quotes.generate);
 const plan=localPlan(data,id.slice(9));plan.request.mode="generate";plan.request.inputs=[];plan.steps=[{key:"generate",operation:"generate",eligibleUpstreamIds:[],parameters:{},credits:6}];
 await new DurableImageJobs<any>("imagegen").create(id,data.owner,{status:"error",children:{generate:{state:"submitted",jobId:child}},result:{operationId:id.slice(9),jobId:id,status:"failed",stage:"saving",artifacts:[],chargedCredits:0}},{plan},0,false);
 return {id,child};
}
export async function requestStored(data:any,id:string,owner=data.owner){
 const response=await deliveryRoute.POST(new Request("http://internal/api/imagegen/recover-delivery",{method:"POST",headers:{cookie:cookie(owner),"content-type":"application/json",origin:"http://internal"},body:JSON.stringify({operationId:id.slice(9)})}));
 return {status:response.status,body:await response.json()};
}
export async function requestStoredDirect(data:any,id:string){return recoverStoredDelivery(id,data.owner);}
export async function addUnknownStoredAttempt(stored:{child:string}){
 await pool().query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{paidOperations,unknown}', $2::jsonb) WHERE id=$1",[stored.child,JSON.stringify({state:"started",model:"gpt-image-2",replayable:false})]);
}
