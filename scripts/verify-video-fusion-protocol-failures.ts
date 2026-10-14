import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture,CAP_RICH} from "./video-fusion/harness";
import type {VideoModelDefinition,VideoWireProfile} from "../src/lib/video/capability-schema";

const profiles:VideoWireProfile[]=["openai-videos","ark","kie-generic","apimart-generic","gemini","minimax","metaso","tokendance-seedance","tokendance-kling-text","tokendance-wan3","tokendance-minimax","tfrouter-generic","compshare-h3","compshare-vidu","compshare-wan"];
async function main(){
 const cases=JSON.parse(await readFile("scripts/video-fusion/application-protocol-cases.json","utf8")).cases,evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`protocol-failures-${randomUUID()}`),results:any[]=[];await mkdir(evidence,{recursive:true});
 const selected=process.argv.find(value=>value.startsWith("--profiles="))?.slice(11).split(",");if(selected?.some(profile=>!profiles.includes(profile as VideoWireProfile)))throw new Error("Unknown failure response shape");
 const save=()=>writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:results.length===profiles.length,scope:selected||"all-15-native-error-response-shapes",actualAppDbRouterWorker:true,plannedProfiles:profiles,results,paidVideoApiCalls:0,realVideoQualityValidated:false},null,2));
 for(const profile of profiles.filter(profile=>!selected||selected.includes(profile))){
  const item=cases.find((item:any)=>item.profile===profile);assert.ok(item);const options:NonNullable<VideoModelDefinition["providerOptions"]>={};for(const [key,value] of Object.entries(item.extra.providerOptions||{}))options[key]=key==="seed"?{type:"integer",minimum:0,send:"value"}:{type:typeof value==="boolean"?"boolean":"string",send:"value"};
  const definition:VideoModelDefinition={...CAP_RICH,modes:[item.mode],durationResolutionMap:[{durations:[4,5,6,8,10,12,15,30],resolutions:["720p","1080p","768P"]}],providerOptions:options},h=await createVideoFixture({startWorker:false,videoProfile:profile,videoDefinition:definition});
  try{
   h.setScenario("rejected");const before=await h.creditState("a"),reference=(raw:string,index:number)=>{const [name,role]=raw.split(":"),source=h.refs[name==="last"?"lastImage":name as "image"|"video"|"audio"];return {id:`error-ref-${index}`,kind:name==="last"?"image":name,role,artworkId:source.id,url:source.url};},quote=await h.request<any>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId:"video-a",resolution:item.extra.resolution||"720p"});assert.equal(quote.status,200);
   const {element:_element,multiOutput:_multiOutput,...extra}=item.extra,input={source:"workbench",providerId:"managed-video",modelId:"video-a",mode:item.mode,prompt:"此请求必须按真实供应商失败终态结束。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",references:item.refs.map(reference),...extra,idempotencyKey:randomUUID(),billingVersion:quote.body.version,billingCredits:quote.body.mode==="api-cost-plus"?quote.body.authorizedCredits:quote.body.credits};
   const created=await h.request<any>("a","POST","/api/video/generate",input);assert.equal(created.status,200,JSON.stringify(created.body));const taskId=created.body.taskId;let task:any;const until=Date.now()+90000;
   while(Date.now()<until){await h.forceVideoPollDue(taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${taskId}`)).body.task;if(["failed","completed","cancelled","needs_attention"].includes(task.status))break;await new Promise(resolve=>setTimeout(resolve,250));}
   assert.equal(task?.status,"failed",JSON.stringify(task));assert.ok(task.error);assert.equal(task.videoUrl,"");assert.equal(task.resultAssets.length,0);assert.deepEqual(await h.creditState("a"),before);assert.equal(await h.dbCount("app_video_results"),0);assert.equal((await h.request("b","GET",`/api/video/tasks?id=${taskId}`)).status,404);
   const creates=h.supplierCalls().filter(call=>call.phase==="create").length;assert.equal(creates,1);const replay=await h.request<any>("a","POST","/api/video/generate",input);assert.equal(replay.status,200);assert.equal(replay.body.taskId,taskId);await h.tick();assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,creates);assert.deepEqual(await h.creditState("a"),before);await h.restartApp();await h.tick();assert.deepEqual(await h.creditState("a"),before);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,1);
   const row={profile,caseId:item.id,taskId,status:"failed",nativeErrorDecoded:true,noResultOrFalseCompletion:true,fullRefundOnce:true,idempotentFailedReplay:true,restartNoNewCreateOrSettlement:true,otherAccountDenied:true};results.push(row);await save();process.stdout.write(`PROTOCOL_FAILURE=PASS ${profile} ${results.length}/${profiles.length}\n`);
  }finally{await writeFile(path.join(evidence,`${profile}-calls.json`),JSON.stringify(h.supplierCalls().filter(call=>["create","poll"].includes(call.phase)),null,2));await h.stop();}
 }
 await save();process.stdout.write(`VIDEO_PROTOCOL_FAILURES=PASS ${evidence}\n`);
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
