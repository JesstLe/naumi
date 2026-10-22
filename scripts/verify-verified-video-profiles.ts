import assert from "node:assert/strict";
import {VideoContractError} from "../src/lib/video/contract";
import {videoProfileProtocol,videoWireProfileSchema,type VideoWireProfile} from "../src/lib/video/capability-schema";
import {buildVideoCreate,buildVideoPoll,decodeVideoCreated,decodeVideoPolled,type VideoWireContext} from "../src/lib/video/providers/wire";
import type {VideoGenerationRequest,VideoReference} from "../src/lib/video/types";

/**
 * Protocol regression only: no HTTP, credentials, database or paid requests.
 * Expected wire fixtures come from the independently submitted 2026-10-23 plans
 * and decoded-media receipts documented in docs/changes/2026-10-23-provider-video-probe.md.
 * Deliberately inline the non-secret, synthetic request fields so this check can
 * run in a fresh checkout without ignored output/ evidence files.
 */
const prompt="A red wooden cube rotates slowly on a plain white table. Static camera, no people, no text.";
const image:VideoReference={id:"synthetic-image",kind:"image",role:"reference",url:"https://media.example.test/synthetic-red-cube.png"};
const sourceVideo:VideoReference={id:"synthetic-video",kind:"video",role:"source_video",url:"https://media.example.test/synthetic-red-cube.mp4",durationSeconds:5};
const resultURL="https://media.example.test/result.mp4";
type Fixture={name:string;profile:VideoWireProfile;request:Partial<VideoGenerationRequest>&{modelId:string;durationSeconds:number;resolution:string};body:Record<string,unknown>};
const fixtures:Fixture[]=[];
function apib(profile:VideoWireProfile,modelId:string,durationSeconds:number,resolution:string,bodyExtra:Record<string,unknown>={},requestExtra:Partial<VideoGenerationRequest>={}){
  fixtures.push({name:`APIB/${modelId}`,profile,request:{modelId,durationSeconds,resolution,aspectRatio:"16:9",...requestExtra},
    body:{model:modelId,prompt,duration:durationSeconds,...(!("mode" in bodyExtra)?{resolution}:{}),...bodyExtra}});
}

// Exact successful probes. Published capabilities separately constrain what can be selected;
// codecs translate configured values instead of hardcoding these sample values.
apib("apimart-apib-seedance","seedance-1-0-pro-fast",2,"480p");
apib("apimart-apib-seedance","seedance-1-0-pro-quality",2,"480p");
apib("apimart-apib-seedance","seedance-1-5-pro",4,"480p",{audio:false},{generateAudio:false});
for(const model of ["seedance-2.0","seedance-2.0-fast","seedance-2.0-mini","seedance-2.5"])apib("apimart-apib-seedance",model,4,"480p");
apib("apimart-apib-kling","kling-v2-6",5,"720p",{mode:"std",audio:false},{generateAudio:false});
apib("apimart-apib-kling","kling-v3",3,"720p",{mode:"std",audio:false},{generateAudio:false});
apib("apimart-apib-kling","kling-v3-omni",3,"720p",{mode:"std",audio:false},{generateAudio:false});
apib("apimart-apib-kling","kling-video-o1",5,"720p",{mode:"std"});
apib("apimart-apib-kling","kling-3.0-turbo",3,"720p");
apib("apimart-apib-kling","kling-v4",3,"720p");
apib("apimart-apib-wan","wan2.5-preview",5,"480p",{audio:true},{generateAudio:true});
apib("apimart-apib-wan","wan2.6",5,"720p");
apib("apimart-apib-wan","wan2.6-i2v-flash",2,"720p",{audio:false,image_urls:[image.url]},{mode:"single_image",references:[image],generateAudio:false});
apib("apimart-apib-wan","wan2.7-r2v",2,"720P",{image_with_roles:[{url:image.url,role:"reference_image"}]},{mode:"reference",references:[image]});
apib("apimart-apib-wan","wan2.7-videoedit",2,"720P",{video_urls:[sourceVideo.url]},{mode:"video_edit",references:[sourceVideo]});
apib("apimart-apib-wan","wan3.0-video",2,"480P");
apib("apimart-apib-wan","wan3.0-video-prime",2,"480P");
apib("apimart-apib-h3","MiniMax-H3",4,"768P");
apib("apimart-apib-h3","MiniMax-H3-Max",5,"480P");

for(const modelId of ["kling-1.6-720p","kling-2.0-720p","kling-2.1-720p","kling-2.5-720p","kling-2.6-mute-720p","kling-3.0-720p-mute","kling-3.0-omni-720p-noref-mute","kling-o1-720p","kling-3.0-omni-720p-ref-mute"]){
  const reference=modelId==="kling-3.0-omni-720p-ref-mute";
  fixtures.push({name:`Geek/${modelId}`,profile:"geek-kling",request:{modelId,durationSeconds:5,resolution:"720P",aspectRatio:"16:9",generateAudio:false,
    ...(reference?{mode:"reference",references:[image]}:{})},
    body:{model:modelId,prompt,seconds:"5",metadata:{output_config:{resolution:"720P",aspect_ratio:"16:9",audio_generation:"Disabled"}},...(reference?{images:[image.url]}:{})}});
}
fixtures.push({name:"Geek/wan3.0-video",profile:"geek-wan3",request:{modelId:"wan3.0-video",durationSeconds:2,resolution:"480P",aspectRatio:"16:9"},
  body:{model:"wan3.0-video",prompt,seconds:2,size:"480P",aspect_ratio:"16x9"}});

function context(fixture:Fixture):VideoWireContext{
  const request:VideoGenerationRequest={source:"canvas",providerId:"synthetic-provider",prompt,references:[],idempotencyKey:"synthetic-idempotency-key",...fixture.request};
  return {profile:fixture.profile,provider:{id:request.providerId,label:"Synthetic protocol fixture",protocol:videoProfileProtocol(fixture.profile),baseUrl:"https://supplier.example.test/v1",apiKey:"synthetic-unused-key",
    models:[request.modelId],defaultModel:request.modelId,idempotencyStrategy:"header",videoProfile:fixture.profile},request};
}
function json(value:unknown):unknown{return JSON.parse(JSON.stringify(value));}
let assertions=0;
function equal(actual:unknown,expected:unknown,message:string){assert.deepEqual(actual,expected,message);assertions++;}
function rejects(ctx:VideoWireContext,patch:Partial<VideoGenerationRequest>,message:string){
  assert.throws(()=>buildVideoCreate({...ctx,request:{...ctx.request,...patch}}),error=>error instanceof VideoContractError&&error.status===422&&/^VIDEO_/.test(error.code),message);assertions++;
}

assert.equal(fixtures.length,32,"32 new-profile SKUs plus the separately checked Geek H3 binding");
for(const fixture of fixtures){
  const ctx=context(fixture),before=json(ctx),wire=buildVideoCreate(ctx),body=json(wire.body) as Record<string,unknown>;
  equal(videoWireProfileSchema.parse(fixture.profile),fixture.profile,`${fixture.name}: registered schema`);
  equal(wire.method,"POST",`${fixture.name}: create method`);
  equal(wire.encoding,"json",`${fixture.name}: JSON wire, not legacy OpenAI multipart`);
  equal(wire.path,fixture.profile.startsWith("apimart-")?"/v1/videos/generations":"/v1/videos",`${fixture.name}: create endpoint`);
  equal(body,fixture.body,`${fixture.name}: independently recorded minimal request`);
  equal(json(ctx),before,`${fixture.name}: build does not mutate frozen input`);
  equal(typeof body[fixture.profile==="geek-kling"||fixture.profile==="geek-wan3"?"seconds":"duration"],fixture.profile==="geek-kling"?"string":"number",`${fixture.name}: duration wire type`);
  // These fields have different supplier meanings; accidentally inherited aliases cost money.
  equal("generate_audio" in body,false,`${fixture.name}: do not substitute the wrong audio key`);
  if(fixture.profile==="geek-kling")equal(Object.keys(body.metadata as object),["output_config"],`${fixture.name}: all output settings stay nested`);
  if(fixture.request.modelId==="wan2.7-r2v")equal("image_urls" in body,false,`${fixture.name}: role-bearing reference must not become a plain image list`);
  const encoded=encodeURIComponent("task/unsafe ?");
  equal(buildVideoPoll(ctx,"task/unsafe ?").path,fixture.profile.startsWith("apimart-")?`/v1/tasks/${encoded}?language=zh`:`/v1/videos/${encoded}`,`${fixture.name}: escaped task path`);

  rejects(ctx,{modelId:"unverified-model"},`${fixture.name}: unknown model fails before submission`);
  rejects(ctx,{durationSeconds:0},`${fixture.name}: nonpositive duration rejected`);
  rejects(ctx,{durationSeconds:1.5},`${fixture.name}: fractional duration rejected`);
  rejects(ctx,{resolution:""},`${fixture.name}: missing resolution rejected`);
  rejects(ctx,{aspectRatio:"invalid-ratio"},`${fixture.name}: unmapped ratio rejected`);
  rejects(ctx,{providerOptions:{model:"other-model"}},`${fixture.name}: options cannot replace model`);
  rejects(ctx,{providerOptions:{seed:0}},`${fixture.name}: unverified option rejected even when falsy`);
  rejects(ctx,{shots:[{prompt:"Unverified storyboard",durationSeconds:1}]},`${fixture.name}: structured shots rejected`);
  rejects(ctx,{elements:[{name:"Unverified element",references:[image]}]},`${fixture.name}: structured elements rejected`);
  rejects(ctx,{negativePrompt:"No red cubes"},`${fixture.name}: unmapped negative prompt rejected`);
  rejects(ctx,{watermark:false},`${fixture.name}: unmapped false watermark rejected`);
  rejects(ctx,{width:1280,height:720},`${fixture.name}: unmapped exact dimensions rejected`);
  if(fixture.request.generateAudio===undefined)rejects(ctx,{generateAudio:false},`${fixture.name}: no mapped audio field cannot be added even when false`);
}

// Required material must not be dropped, silently reclassified or carried across model families.
const fixtureFor=(model:string)=>context(fixtures.find(item=>item.request.modelId===model)!);
const changedBody=(model:string,patch:Partial<VideoGenerationRequest>)=>{
  const ctx=fixtureFor(model);return json(buildVideoCreate({...ctx,request:{...ctx.request,...patch}}).body) as Record<string,unknown>;
};
// Admin-owned capabilities may expand later; the protocol must preserve normalized
// requests without silently replacing them with the original probe's sample values.
equal(changedBody("seedance-2.0",{durationSeconds:8,resolution:"720p",aspectRatio:"9:16"}),
  {model:"seedance-2.0",prompt,duration:8,resolution:"720p",aspect_ratio:"9:16"},"Seedance duration/resolution/ratio propagate");
equal(changedBody("seedance-1-5-pro",{generateAudio:true}).audio,true,"Seedance uses audio, not generate_audio");
equal(changedBody("kling-v3",{durationSeconds:8,resolution:"1080p",generateAudio:true}),
  {model:"kling-v3",prompt,duration:8,mode:"pro",audio:true},"Kling pro mode and audio propagate");
equal(changedBody("kling-v3-omni",{resolution:"4k"}).mode,"4k","Kling Omni documented 4k mode");
rejects(fixtureFor("kling-v2-6"),{generateAudio:true},"Kling2.6 standard mode explicitly forbids audio");
equal(changedBody("kling-v2-6",{resolution:"1080p",generateAudio:true}).audio,true,"Kling2.6 pro mode supports mapped audio");
rejects(fixtureFor("kling-video-o1"),{resolution:"4k"},"Kling o1 cannot invent an unmapped 4k mode");
equal(changedBody("wan2.5-preview",{durationSeconds:10,resolution:"720p",generateAudio:false}).audio,false,"Wan false audio is preserved");
equal(changedBody("wan2.7-r2v",{durationSeconds:5,resolution:"1080p"}).resolution,"1080P","Wan resolution casing is normalized without replacing value");
equal(changedBody("MiniMax-H3",{durationSeconds:8,resolution:"1080p"}).duration,8,"APIB H3 configured duration propagates");
for(const model of ["wan2.6-i2v-flash","wan2.7-videoedit"])equal("aspect_ratio" in changedBody(model,{aspectRatio:"adaptive"}),false,`${model}: adaptive inherits source aspect ratio`);
equal(changedBody("kling-1.6-720p",{durationSeconds:10,resolution:"1080p",aspectRatio:"9:16",generateAudio:true}),
  {model:"kling-1.6-720p",prompt,seconds:"10",metadata:{output_config:{resolution:"1080P",aspect_ratio:"9:16",audio_generation:"Enabled"}}},"Geek Kling dynamic string duration and nested output fields");
const geekWan=fixtures.find(item=>item.profile==="geek-wan3")!,geekWanContext=context(geekWan);
equal(json(buildVideoCreate({...geekWanContext,request:{...geekWanContext.request,durationSeconds:6,resolution:"720p",aspectRatio:"9:16"}}).body),
  {model:"wan3.0-video",prompt,seconds:6,size:"720P",aspect_ratio:"9x16"},"Geek Wan dynamic numeric duration and ratio translation");
for(const model of ["wan2.6-i2v-flash","wan2.7-r2v","kling-3.0-omni-720p-ref-mute"]){
  const ctx=fixtureFor(model);
  rejects(ctx,{references:[]},`${model}: required image missing`);
  rejects(ctx,{references:[sourceVideo]},`${model}: video cannot replace required image`);
  rejects(ctx,{references:[image,{...image,id:"extra-image"}]},`${model}: unverified second image rejected`);
  const httpReference={...image,url:"http://media.example.test/image.png"};
  const httpBody=json(buildVideoCreate({...ctx,request:{...ctx.request,references:[httpReference]}}).body) as Record<string,unknown>;
  const expectedHTTP=model==="wan2.7-r2v"?{image_with_roles:[{url:httpReference.url,role:"reference_image"}]}:
    model==="kling-3.0-omni-720p-ref-mute"?{images:[httpReference.url]}:{image_urls:[httpReference.url]};
  for(const [field,value] of Object.entries(expectedHTTP))equal(httpBody[field],value,`${model}: HTTP reference translation preserves URL; outer transport still owns SSRF checks`);
  rejects(ctx,{references:[{...image,url:"https://user:secret@media.example.test/image.png"}]},`${model}: credentials in a reference URL rejected`);
  rejects(ctx,{references:[{...image,inlineData:{mimeType:"image/png",data:"AA=="}}]},`${model}: inline bytes cannot replace an authorized URL`);
}
rejects(fixtureFor("wan2.7-videoedit"),{references:[]},"Wan edit requires source video");
rejects(fixtureFor("wan2.7-videoedit"),{references:[image]},"Wan edit cannot send an image as a video");
equal(changedBody("wan2.7-videoedit",{references:[{...sourceVideo,url:"http://media.example.test/video.mp4"}]}).video_urls,["http://media.example.test/video.mp4"],"Wan edit translates HTTP video URLs; materialization retains transport authorization");
rejects(fixtureFor("seedance-2.0"),{references:[image]},"Seedance text-only acceptance cannot imply image capability");
rejects(fixtureFor("MiniMax-H3"),{modelId:"MiniMax-H3-Regeneration"},"H3 regeneration cannot be submitted as ordinary text generation");
rejects(fixtureFor("wan3.0-video"),{modelId:"wan2.7"},"Pending Wan2.7 text probe cannot be enabled by a family prefix");

for(const profile of ["apimart-apib-seedance","apimart-apib-kling","apimart-apib-wan","apimart-apib-h3"] as const){
  equal(videoProfileProtocol(profile),"apimart",`${profile}: protocol family`);
  equal(decodeVideoCreated(profile,{data:[{task_id:"synthetic-task",status:"pending"}]}).upstreamTaskId,"synthetic-task",`${profile}: created task ID`);
  equal(decodeVideoCreated(profile,{data:[{id:"synthetic-alt-task"}]}).upstreamTaskId,"synthetic-alt-task",`${profile}: alternate task ID`);
  assert.throws(()=>decodeVideoCreated(profile,{data:[{}]}),/任务ID/);assertions++;
  const complete=decodeVideoPolled(profile,{data:{status:"completed",progress:100,result:{videos:[{url:[resultURL]}]}}});
  equal({status:complete.status,progress:complete.progress,url:complete.resultUrl},{status:"completed",progress:100,url:resultURL},`${profile}: completed video decoded`);
  equal(decodeVideoPolled(profile,{data:{status:"processing",progress:20}}).status,"processing",`${profile}: pending does not require a URL`);
  const failed=decodeVideoPolled(profile,{data:{status:"failed",error:{message:"Synthetic failure",code:"SYNTHETIC"}}});
  equal({status:failed.status,error:failed.errorMessage,code:failed.errorCode},{status:"failed",error:"Synthetic failure",code:"SYNTHETIC"},`${profile}: failure details retained`);
  assert.throws(()=>decodeVideoPolled(profile,{data:{status:"completed",result:{videos:[]}}}),/缺少真实结果/);assertions++;
  assert.throws(()=>decodeVideoPolled(profile,{data:{status:"mystery",result:{videos:[{url:[resultURL]}]}}}),/状态未知/);assertions++;
}

for(const profile of ["geek-kling","geek-wan3"] as const){
  equal(videoProfileProtocol(profile),"openai-videos",`${profile}: protocol family`);
  equal(decodeVideoCreated(profile,{id:"synthetic-task",status:"queued"}).upstreamTaskId,"synthetic-task",`${profile}: created task ID`);
  equal(decodeVideoCreated(profile,{task_id:"synthetic-task-only",status:"queued"}).upstreamTaskId,"synthetic-task-only",`${profile}: task_id fallback`);
  assert.throws(()=>decodeVideoCreated(profile,{}),/任务ID/);assertions++;
  equal(decodeVideoPolled(profile,{status:"processing",progress:30}).status,"processing",`${profile}: processing decoded`);
  assert.throws(()=>decodeVideoPolled(profile,{status:"completed"}),/缺少真实结果/);assertions++;
  assert.throws(()=>decodeVideoPolled(profile,{status:"mystery",video_url:resultURL}),/状态未知/);assertions++;
}
equal(decodeVideoPolled("geek-kling",{status:"completed",video_url:resultURL}).resultUrl,resultURL,"Geek Kling direct video URL");
equal(decodeVideoPolled("geek-wan3",{status:"completed",video_url:resultURL,metadata:{url:resultURL}}).resultUrl,resultURL,"Geek Wan actual receipt's top-level video URL");
equal(decodeVideoPolled("geek-wan3",{output:{task_status:"SUCCEEDED",video_url:resultURL}}).resultUrl,resultURL,"Geek Wan nested output video URL");

// Legacy frozen profiles retain their prior field names and behavior.
const legacy=context(fixtures[0]);
legacy.profile="apimart-kling-v26";
legacy.provider.videoProfile=legacy.profile;
legacy.request={...legacy.request,modelId:"legacy-kling",durationSeconds:5,resolution:"720p",generateAudio:false};
const oldKling=buildVideoCreate(legacy).body as Record<string,unknown>;
equal(oldKling.sound,false,"Legacy API Mart v2.6 still uses sound (new APIB uses audio)");
equal("audio" in oldKling,false,"Legacy profile is not silently migrated");
legacy.profile="openai-videos";legacy.provider.protocol="openai-videos";legacy.provider.videoProfile=legacy.profile;
const oldOpenAI=buildVideoCreate(legacy);
equal(oldOpenAI.encoding,"multipart","Legacy OpenAI remains multipart");
assert(oldOpenAI.body instanceof FormData);assertions++;
equal(oldOpenAI.body.get("seconds"),"5","Legacy OpenAI seconds remains a multipart string");
equal(decodeVideoPolled("openai-videos",{status:"completed"}).status,"completed","Legacy OpenAI retains its content endpoint fallback");

// Geek H3 uses the existing MiniMax content grammar with explicit endpoint overrides.
// Response shape is taken from the actual isolated Geek H3 receipt: top-level
// create id/status, then poll task.status/task.content.url (also video_url).
const h3:VideoWireContext={...legacy,profile:"minimax",provider:{...legacy.provider,protocol:"minimax",videoProfile:"minimax",models:["MiniMax-H3"],defaultModel:"MiniMax-H3",createPath:"/v1/videos",pollPath:"/v1/videos/{id}"},
  request:{source:"canvas",providerId:"synthetic-provider",modelId:"MiniMax-H3",prompt,durationSeconds:1,resolution:"768P",aspectRatio:"16:9",references:[],idempotencyKey:"synthetic-h3-key"}};
equal(json(buildVideoCreate(h3)),{path:"/v1/videos",method:"POST",encoding:"json",body:{model:"MiniMax-H3",content:[{type:"text",text:prompt}],resolution:"768P",duration:1,ratio:"16:9"}},"Geek H3 tested content grammar and create override");
equal(buildVideoPoll(h3,"task/unsafe ?").path,`/v1/videos/${encodeURIComponent("task/unsafe ?")}`,"Geek H3 poll override escapes task ID");
equal(decodeVideoCreated("minimax",{id:"synthetic-h3-task",task_id:"synthetic-h3-task",status:"processing"}).upstreamTaskId,"synthetic-h3-task","Geek H3 actual create receipt shape");
const h3Poll=decodeVideoPolled("minimax",{status:"completed",video_url:resultURL,task:{status:"succeeded",content:{url:resultURL}}});
equal({status:h3Poll.status,url:h3Poll.resultUrl},{status:"completed",url:resultURL},"Geek H3 actual nested task receipt shape");
const nativeH3={...h3,provider:{...h3.provider,createPath:undefined,pollPath:undefined}};
equal(buildVideoCreate(nativeH3).path,"/v2/video_generation","Existing MiniMax native create endpoint remains available");
equal(buildVideoPoll(nativeH3,"task-1").path,"/v2/query/video_generation/task-1","Existing MiniMax native poll endpoint remains available");

process.stdout.write(`VERIFIED_VIDEO_PROFILES=PASS skus=33 assertions=${assertions} http_calls=0 paid_calls=0 evidence=protocol-fixtures-only\n`);
