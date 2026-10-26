/** Actual application setup/entry/inspection only. Both complete source trees
 * compile this same fixture. No task, lease, billing or codec is replaced. */
import {randomUUID} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {initializeApplicationPersistence} from "@/lib/application/persistence";
import {getOrCreateUser} from "@/lib/accounts/session";
import {addCreditBatch} from "@/lib/billing/grants";
import sharp from "sharp";
import {addArtworks} from "@/lib/artworks/writer";
import {createCredentialStore} from "@/lib/model-config/credentials";
import {createModelRepository} from "@/lib/model-config/repository";
import {fixtureModelConfig} from "./model-config-unit-fixture";
import {getBillingRuntime} from "@/lib/billing/runtime";
import * as video from "@/lib/video/service";
import * as byoc from "@/lib/video/byoc";
import * as workflow from "@/lib/video/workflow";
import {getVideoTask} from "@/lib/video/task-repository";
import {requestVideoCancellation} from "@/lib/video/cancellation";
import {saveComfyEndpoint,saveComfyWorkflow} from "@/lib/comfyui/repository";
import {signUserSession} from "@/lib/native-auth";
import * as generateRoute from "@/app/api/video/generate/route";
import * as tasksRoute from "@/app/api/video/tasks/route";
import * as taskRoute from "@/app/api/video/tasks/[id]/route";
import * as retryRoute from "@/app/api/video/tasks/[id]/retry/route";
import {withFrozenCreation} from "@/lib/saas/creation-scope";
import {backgroundWorkCount,waitForBackgroundWork} from "@/lib/worker/inflight";
import {closeImageCoordinationPool} from "@/lib/imagegen/coordination-pool";
import {closeVideoCoordinationPool} from "@/lib/video/coordination-pool";
import {submitAcceptedImagegen,getImagegenResult} from "@/lib/imagegen/dispatch";
import {imagegenRequestSchema} from "@/lib/imagegen/schema";
import {imagegenFingerprint} from "@/lib/imagegen/plan";
import type {ImagegenPlan} from "@/lib/imagegen/types";
export const pool=getPool;
export {backgroundWorkCount,waitForBackgroundWork};
export async function seed(origin:string){
 await initializeApplicationPersistence();
 const sql=getPool(),credentials=createCredentialStore(sql),key=await credentials.importPlain({providerId:"video-fixture",plain:"original-video-key",actor:"fixture"});
 const imageKey=await credentials.importPlain({providerId:"p1",plain:"unused-image-fixture-key",actor:"fixture"});
 const config=fixtureModelConfig(origin+"/unused-image",imageKey.id);
 config.providers.push({id:"video-fixture",name:"Video fixture",protocol:"openai-videos",baseUrl:origin+"/native",credentialRef:key.id,enabled:true,timeoutMs:10000,maxConcurrent:4,options:{videoProfile:"openai-videos",idempotencyStrategy:"none"}});
 config.upstreamModels.push({...structuredClone(config.upstreamModels[0]),id:"video-up",providerId:"video-fixture",model:"original-wire-video",modality:"video",capabilities:{...structuredClone(config.upstreamModels[0].capabilities),edit:false,maxReferenceImages:0,video:{modes:["text"],durationResolutionMap:[{durations:[5],resolutions:["720p"]}],aspectRatios:["16:9"],defaultDurationSeconds:5,defaultResolution:"720p",defaultAspectRatio:"16:9",limits:{images:0,videos:0,audios:0}}},parameterMap:{videoProfile:"openai-videos"}});
 config.publicModels.push({id:"video-a",label:"Video fixture",modality:"video",enabled:true,visible:true,target:{type:"upstream",id:"video-up"},toolScope:{features:["video.generate"],defaultFor:["video.generate"]}});config.bindings["video.generate"]="video-a";
 const repo=createModelRepository({pool:sql,initialize:async()=>config,trustedOrigins:[origin]});await repo.current();
 const billing=await getBillingRuntime(),initial=await billing.config.current(),price=structuredClone(initial.config);price.switches.metering="on";price.features["video.generate"].pricing={mode:"fixed",credits:6};price.features["video.generate"].rules=[];
 await billing.config.publish({id:randomUUID(),expectedVersion:initial.version,config:price,actor:"fixture",reason:"Original video price"});
 const owner="video-owner@fixture.test",other="video-other@fixture.test";for(const email of [owner,other])await getOrCreateUser(email);
 for(const email of [owner,other]){await sql.query("DELETE FROM app_ledger WHERE email=$1",[email]);await sql.query("DELETE FROM app_credit_batches WHERE email=$1",[email]);await sql.query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[email]);}
 await addCreditBatch(owner,500,{source:"admin",reason:"Video Worker fixture"});await addCreditBatch(other,1,{source:"admin",reason:"Insufficient balance fixture"});
 const root="video-fixture-root",pixels=await sharp({create:{width:32,height:32,channels:3,background:"#aabbee"}}).png().toBuffer();await addArtworks(owner,[{id:root,title:"Fixture project",category:"main",prompt:"fixture",status:"completed",image:"data:image/png;base64,"+pixels.toString("base64"),gradient:""}]);
 const endpoints=await saveComfyEndpoint(owner,{name:"Original endpoint",baseUrl:origin+"/comfy",apiKey:"original-byoc-key",activate:true});
 const flows=await saveComfyWorkflow(owner,{name:"Video workflow",apiJson:{"1":{class_type:"CLIPTextEncode",inputs:{text:"positive fixture"}},"2":{class_type:"SaveVideo",inputs:{filename_prefix:"fixture"}}},inputs:[],required:[]});
 return {owner,other,root,projectKey:"tree:"+root,workflowId:flows[0].id,endpointId:endpoints[0].id,repo,billing,credentials,origin};
}
const input=(label:string)=>({source:"workbench" as const,modelId:"video-a",mode:"text" as const,prompt:label,seconds:"5",size:"720p",durationSeconds:5,resolution:"720p",aspectRatio:"16:9",idempotencyKey:"fixture-"+label.replace(/[^a-zA-Z0-9]/g,"-")});
export async function submit(data:any,label:string,actor=data.owner){return video.createVideoGeneration(actor,input(label));}
export async function submitHttp(data:any,label:string){
 const body=input(label),response=await generateRoute.POST(new Request(data.origin+"/api/video/generate",{method:"POST",headers:{"content-type":"application/json",cookie:`nv_user=${signUserSession(data.owner,Date.now())}`,origin:data.origin},body:JSON.stringify(body)}));
 return {status:response.status,body:await response.json()};
}
export async function readHttp(data:any,id:string,actor=data.owner){
 const request=new Request(data.origin+"/api/video/tasks?id="+id,{headers:{cookie:`nv_user=${signUserSession(actor,Date.now())}`}}),response=await tasksRoute.GET(request);
 return {status:response.status,body:await response.json()};
}
export async function readSingleHttp(data:any,id:string,actor=data.owner){
 const response=await taskRoute.GET(new Request(data.origin+"/api/video/tasks/"+id,{headers:{cookie:`nv_user=${signUserSession(actor,Date.now())}`}}),{params:Promise.resolve({id})});
 return {status:response.status,body:await response.json()};
}
export async function retryHttp(data:any,id:string,key:string){
 const response=await retryRoute.POST(new Request(data.origin+"/api/video/tasks/"+id+"/retry",{method:"POST",headers:{"content-type":"application/json",cookie:`nv_user=${signUserSession(data.owner,Date.now())}`,origin:data.origin},body:JSON.stringify({idempotencyKey:key})}),{params:Promise.resolve({id})});
 return {status:response.status,body:await response.json()};
}
export const task=(data:any,id:string)=>getVideoTask(data.owner,id);
export const cancel=(data:any,id:string)=>requestVideoCancellation(data.owner,id);
export const readAndSettle=(data:any,id:string)=>video.pollAndSettle(data.owner,id);
export async function submitByoc(data:any,label:string){return byoc.submitByocComfyVideo(data.owner,{workflowId:data.workflowId,idempotencyKey:"byoc-"+label,prompt:label,durationSeconds:5});}
export async function submitWorkflow(data:any){
 const scope={actorEmail:data.owner,scopeKind:"personal" as const,tenantId:null,parentContext:data.projectKey};
 return withFrozenCreation(scope,()=>workflow.scheduleVideoWorkflow(data.owner,{id:randomUUID(),projectKey:data.projectKey,nodes:[
  {id:"A",request:{modelId:"video-a",prompt:"workflow-A",mode:"text",durationSeconds:5,resolution:"720p",aspectRatio:"16:9"},dependsOn:[]},
  {id:"B",request:{modelId:"video-a",prompt:"workflow-B",mode:"text",durationSeconds:5,resolution:"720p",aspectRatio:"16:9"},dependsOn:["A"]}]}));
}
export const readWorkflow=(data:any,id:string)=>workflow.getVideoWorkflow(data.owner,id);
export async function publishCurrent(data:any){
 const current=await data.billing.config.current(),config=structuredClone(current.config);config.features["video.generate"].pricing={mode:"fixed",credits:17};await data.billing.config.publish({id:randomUUID(),expectedVersion:current.version,config,actor:"fixture",reason:"Current changed after accepted6"});
 const snapshot=await data.repo.current(),draft=await data.repo.draft("fixture"),models=structuredClone(snapshot.config),provider=models.providers.find((x:any)=>x.id==="video-fixture");
 provider.baseUrl=data.origin+"/changed";provider.credentialRef=(await data.credentials.importPlain({providerId:provider.id,plain:"new-video-key",actor:"fixture"})).id;models.upstreamModels.find((x:any)=>x.id==="video-up").model="changed-wire-video";
 const saved=await data.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:models,actor:"fixture"}),staged=await data.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor:"fixture",reason:"Changed current transport"});await data.repo.markApplied(staged.id,staged.digest);
 await saveComfyEndpoint(data.owner,{id:data.endpointId,name:"Changed endpoint",baseUrl:data.origin+"/changed-comfy",apiKey:"changed-byoc-key",activate:true});
}
export async function markSending(data:any,id:string){await pool().query("UPDATE app_video_tasks SET parameters=jsonb_set(parameters,'{submissionState}','\"sending\"'),poll_lock_until=NULL,next_poll_at=now() WHERE id=$1",[id]);}
export async function markLive(data:any,id:string){await pool().query("UPDATE app_video_tasks SET poll_lock_until=now()+interval '5 minutes' WHERE id=$1",[id]);}
export async function forceDue(ids:string[]){await pool().query("UPDATE app_video_tasks SET next_poll_at=now(),poll_lock_until=NULL WHERE id=ANY($1::text[]) AND status='processing'",[ids]);}
export async function fastImage(data:any){
 const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"postprocess",prompt:"Preserve original pixels",inputs:[{artworkId:data.root,role:"edit-target"}],parameters:{ratio:"1:1",resolution:"1K"},output:{format:"png"},variants:1});
 const plan:ImagegenPlan={request,intent:{background:"opaque",operation:"postprocess",conflicts:[],requirements:[]},fingerprint:imagegenFingerprint(request),modelVersion:0,billingVersion:0,steps:[{key:"post",operation:"postprocess",eligibleUpstreamIds:[],parameters:{},credits:0}],totalCredits:0,confirmationRequired:false,warnings:[]};
 await submitAcceptedImagegen(plan,data.owner);return request.operationId;
}
export const imageResult=(data:any,id:string)=>getImagegenResult(id,data.owner);
export async function close(){await waitForBackgroundWork();await closeImageCoordinationPool();await closeVideoCoordinationPool();await pool().end();}
