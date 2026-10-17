import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture,CAP_RICH} from "./video-fusion/harness";
import {videoWireProfileSchema,type VideoModelDefinition,type VideoWireProfile} from "../src/lib/video/capability-schema";
import {field} from "../src/lib/video/providers/wire";
import type {VideoGenerationRequest,VideoReference} from "../src/lib/video/types";

type Case={id:string;profile:VideoWireProfile;mode:NonNullable<VideoGenerationRequest["mode"]>;refs:string[];extra:any};
const paths:Record<string,string>={"tokendance-seedance":"/ark/v3/generations/tasks","tokendance-kling-text":"/kling/v1/text2video","tokendance-kling-image":"/kling/v1/image2video","tokendance-kling-motion":"/kling/v1/motion-control","tokendance-kling-omni":"/kling/v1/omni-video","tokendance-wan3":"/alibaba/wan3/v1/video-synthesis","tokendance-happyhorse":"/alibaba/happyhorse/v1/video-synthesis","tokendance-minimax":"/minimax/v2/video_generation","compshare-h3":"/minimax/v2/video_generation"};
function expectedPath(profile:string){return paths[profile]||(profile.startsWith("kie")?"/api/v1/jobs/createTask":profile.startsWith("apimart")||["grok2api","cogvideox3"].includes(profile)?"/v1/videos/generations":profile==="ark"?"/api/v3/contents/generations/tasks":profile==="gemini"?"/v1beta/models/wire-video:predictLongRunning":["minimax","metaso"].includes(profile)?"/v2/video_generation":profile.startsWith("tfrouter")?"/v1/video/generateVideo":profile.startsWith("compshare")?"/v1/tasks/submit":"/v1/videos");}
function definition(cases:Case[]):VideoModelDefinition{
  const options:NonNullable<VideoModelDefinition["providerOptions"]>={};
  for(const item of cases)for(const [key,value] of Object.entries(item.extra.providerOptions||{}))options[key]=key==="seed"?{type:"integer",minimum:0,send:"value"}:key==="characterOrientation"?{type:"enum",values:["image","video"],send:"value"}:{type:typeof value==="boolean"?"boolean":"string",send:"value"};
  return {...CAP_RICH,modes:[...new Set(cases.map(item=>item.mode))],supportsFrameAudio:cases.some(item=>["single_image","frames_required","first_optional","last_optional"].includes(item.mode)&&item.refs.some(ref=>ref.startsWith("audio:"))),requiresPrompt:!cases.some(item=>item.mode==="lip_sync"),durationResolutionMap:[{durations:[4,5,6,8,10,12,15,30],resolutions:["720p","1080p","768P"]}],providerOptions:options};
}
async function main(){
  const manifest=JSON.parse(await readFile(path.resolve("scripts/video-fusion/application-protocol-cases.json"),"utf8")),all=manifest.cases as Case[];
  assert.equal(all.length,53);for(const item of all)videoWireProfileSchema.parse(item.profile);
  const selected=process.argv.find(a=>a.startsWith("--profiles="))?.slice(11).split(",");if(selected?.some(p=>!all.some(c=>c.profile===p)))throw new Error("Unknown application protocol profile");
  const groups=[...new Set(all.filter(item=>!selected||selected.includes(item.profile)).map(item=>item.profile))];
  const planned=all.filter(item=>groups.includes(item.profile));
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`application-protocols-${randomUUID()}`),completed:any[]=[];
  await mkdir(evidence,{recursive:true});
  const save=()=>writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:completed.length===planned.length,scope:selected||"all-41-native-profiles",plannedCases:planned.length,completedCases:completed.length,evidence:completed,actualAppDbRouterWorker:true,paidVideoApiCalls:0,realVideoQualityValidated:false,workflowProfilesHaveSeparateApplicationEvidence:true},null,2));
  await save();
  for(const profile of groups){
    const cases=all.filter(item=>item.profile===profile);let active:Case=cases[0];
    const h=await createVideoFixture({videoProfile:profile,videoDefinition:definition(cases),startWorker:false,validateWire:async(raw:any)=>{
      assert.equal(raw.path,expectedPath(profile),active.id);assert.equal(field(raw.body,"model")||field(raw.body,"model_name")||profile==="gemini"&&"wire-video","wire-video",active.id);
      if(profile==="ark"){assert.equal(field(raw.body,"seed"),0);assert.equal(field(raw.body,"camera_fixed"),false);assert.equal(field(raw.body,"generate_audio"),false);}
      if(profile==="tokendance-seedance"&&active.mode==="reference")assert.equal(field(raw.body,"seed"),0);
      if(profile==="tfrouter-generic"&&active.mode==="reference")assert.equal(field(raw.body,"metadata.generate_audio"),false);
      if(profile==="tfrouter-generic"&&active.mode==="first_optional")assert.equal(field(raw.body,"metadata.references.0.role"),"last_frame");
      if(profile==="compshare-h3")assert.equal(field(raw.body,"mute_audio"),false);
      if(profile==="compshare-vidu-extend")assert.equal(field(raw.body,"parameters.vidu_type"),"extend");
      if(profile==="compshare-vidu-lip-sync"&&active.extra.providerOptions?.text)assert.equal(field(raw.body,"input.text"),"你好");
      if(profile==="compshare-wan"&&active.mode==="frames_required"){assert.equal(typeof field(raw.body,"input.first_frame_url"),"string");assert.equal(typeof field(raw.body,"input.last_frame_url"),"string");assert.equal(typeof field(raw.body,"input.audio_url"),"string");}
      if(profile==="kie-kling"){assert.equal(field(raw.body,"input.multi_shots"),true);assert.equal(field(raw.body,"input.multi_prompt.0.duration"),2);assert.equal(field(raw.body,"input.kling_elements.0.name"),"角色");}
      if(profile==="kie-motion-control")assert.equal(field(raw.body,"input.character_orientation"),"image");
      if(profile.startsWith("kie-kling-omni-")){
        const hasVideo=active.refs.some(ref=>ref.startsWith("video:")),hasImage=active.refs.some(ref=>ref.startsWith("image:")||ref.startsWith("last:"));
        const videoOnly=hasVideo&&!hasImage&&!active.extra.element;
        assert.equal(field(raw.body,"input.duration"),videoOnly?undefined:active.extra.durationSeconds??4);
        assert.equal(field(raw.body,"input.aspect_ratio"),profile==="kie-kling-omni-reference"&&hasVideo||profile==="kie-kling-omni-transform"&&videoOnly||profile==="kie-kling-omni-image"&&active.refs.length>1?"auto":"16:9");
        if(active.extra.generateAudio!==undefined)assert.equal(field(raw.body,"input.audio"),active.extra.generateAudio);
        assert.equal(field(raw.body,"input.prompt"),"甲：保留完整句子。\n乙：包括最后一句。");
        if(profile==="kie-kling-omni-transform"){assert.equal(field(raw.body,"input.multi_prompt"),undefined);assert.equal(field(raw.body,"input.elements"),undefined);}
      }
    }});
    try{
      const original=(await h.request<ArrayBuffer>("a","GET",h.refs.video.url)).body,sourceSha=createHash("sha256").update(Buffer.from(original)).digest("hex");
      const refs=(items:string[])=>items.map((item,index)=>{const [name,role]=item.split(":"),source=h.refs[name==="last"?"lastImage":name as "image"|"video"|"audio"];return {id:`input-${index}`,kind:name==="image"||name==="last"?"image":name,role,artworkId:source.id,url:source.url} as VideoReference;});
      for(const item of cases){
        active=item;h.setScenario(item.extra.multiOutput?"multi-output":"success");
        const {element,multiOutput:_multiOutput,...extra}=item.extra,references=refs(item.refs),idempotencyKey=randomUUID();
        const quote=await h.request<any>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId:"video-a",resolution:extra.resolution||"720p"});assert.equal(quote.status,200);
        const input={source:"workbench",providerId:"managed-video",modelId:"video-a",mode:item.mode,prompt:"甲：保留完整句子。\n乙：包括最后一句。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",references,...extra,...(element?{elements:[{name:"角色",description:"同一人物",references:refs(["image:reference"])}]}:{}),idempotencyKey,billingVersion:quote.body.version,billingCredits:quote.body.mode==="api-cost-plus"?quote.body.authorizedCredits:quote.body.credits};
        const before=h.supplierCalls().filter(c=>c.phase==="create").length;
        const created=await h.request<any>("a","POST","/api/video/generate",input);assert.equal(created.status,200,`${item.id}: ${JSON.stringify(created.body)}`);const taskId=created.body.taskId;
        const submittedState=await h.creditState("a"),replay=await h.request<any>("a","POST","/api/video/generate",input);assert.equal(replay.body.taskId,taskId);assert.deepEqual(await h.creditState("a"),submittedState);
        let task:any,reportedError=false;const until=Date.now()+180000;
        while(Date.now()<until){await h.forceVideoPollDue(taskId);await h.tick();const state=await h.request<any>("a","GET",`/api/video/tasks?id=${taskId}`);assert.equal(state.status,200);task=state.body.task;if(task.error&&!reportedError){reportedError=true;await writeFile(path.join(evidence,`${item.id}-first-error.json`),JSON.stringify({id:item.id,status:task.status,error:task.error.replace(/https?:\/\/\S+/g,"[url-redacted]")},null,2));}if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),`${item.id}: ${JSON.stringify(task)}`);await new Promise(r=>setTimeout(r,300));}
        assert.equal(task?.status,"completed",item.id);assert.equal(task.source,"workbench");assert.equal(task.projectKey,null);assert.equal(h.supplierCalls().filter(c=>c.phase==="create").length,before+1);
        assert.ok(task.resultAssets?.length);if(item.extra.multiOutput)assert.equal(task.resultAssets.length,2);
        const assets=[];for(const asset of task.resultAssets){const downloaded=await h.request<ArrayBuffer>("a","GET",asset.url);assert.equal(downloaded.status,200);const sha=createHash("sha256").update(Buffer.from(downloaded.body)).digest("hex");assert.equal(sha,asset.sha256);assert.ok(asset.probe?.durationSeconds>0);assert.equal((await h.request("b","GET",asset.url)).status,404);assert.equal(await h.dbCount("app_artworks",{id:asset.artworkId}),1);assets.push({artworkId:asset.artworkId,sha256:sha,probe:asset.probe});}
        const persisted=await h.taskPersistence("a",taskId);assert.equal(persisted.parameters.request.mode,item.mode);assert.equal(persisted.parameters.request.modelId,"wire-video");assert.equal(persisted.parameters.publicModelId,"video-a");assert.equal(persisted.video_references.length,references.length);
        const settled=await h.creditState("a");await h.tick();assert.deepEqual(await h.creditState("a"),settled);
        assert.equal(createHash("sha256").update(Buffer.from((await h.request<ArrayBuffer>("a","GET",h.refs.video.url)).body)).digest("hex"),sourceSha);
        completed.push({id:item.id,profile,mode:item.mode,taskId,expectedPath:expectedPath(profile),actualRawWireValidated:true,actualAppAndWorkerCompleted:true,actualPrivateMediaHashesAndOwnership:true,idempotencyAndSettlement:true,originalSha256:sourceSha,assets});await save();process.stdout.write(`APPLICATION_PROTOCOL_CASE=PASS ${item.id} ${completed.length}/${all.length}\n`);
      }
      const calls=h.supplierCalls().filter(c=>c.phase==="create").length,credits=await h.creditState("a");await h.restartApp();await h.tick();assert.equal(h.supplierCalls().filter(c=>c.phase==="create").length,calls);assert.deepEqual(await h.creditState("a"),credits);
    }finally{await writeFile(path.join(evidence,`${profile}-calls.json`),JSON.stringify(h.supplierCalls().filter(c=>c.phase==="create"),null,2));await h.stop();}
  }
  await save();process.stdout.write(`VIDEO_APPLICATION_PROTOCOLS=PASS profiles=${groups.length} cases=${completed.length} ${evidence}\n`);
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
