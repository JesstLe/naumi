import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fixtureDatabase} from "./video-fusion/fixture";
import {loadVideoAssets,defaultAssetsRoot} from "./video-fusion/assets.mjs";
import {createVideoSupplier} from "./video-fusion/supplier.mjs";
import {createWireVideoAdapter,videoWireEndpoint} from "../src/lib/video/providers/wire-adapter";
import {buildVideoCreate,decodeVideoPolled,field,type VideoWireContext} from "../src/lib/video/providers/wire";
import type {VideoGenerationRequest,VideoReference,VideoTaskSnapshot} from "../src/lib/video/types";
import type {VideoWireProfile} from "../src/lib/video/capability-schema";
import type {VideoProviderRuntimeConfig,VideoProviderProtocol} from "../src/lib/video/providers/config";

if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1")throw new Error("Video protocol verification requires isolated fixture mode");
if(process.env.DATABASE_URL){const sql=await fixtureDatabase();await sql.end();}
const assetsRoot=process.env.VIDEO_FIXTURE_ASSETS_ROOT||defaultAssetsRoot,manifest=await loadVideoAssets(assetsRoot);
const bodies:Array<{profile:string;body:unknown}>=[];
let activeProfile:VideoWireProfile="openai-videos";
const supplier=await createVideoSupplier({assetsRoot,manifest,validateWire:({path:wirePath,body}: {path:string;body:unknown})=>{
  const expected=activeProfile.startsWith("kie")?"/api/v1/jobs/createTask":activeProfile.startsWith("apimart")||["grok2api","cogvideox3"].includes(activeProfile)?"/v1/videos/generations":activeProfile==="ark"?"/contents/generations/tasks":["minimax","metaso"].includes(activeProfile)?"/v2/video_generation":activeProfile==="gemini"?"/v1beta/models/non-default-wire-model:predictLongRunning":"/v1/videos";
  assert.equal(wirePath,expected);assert.equal(field(body,"model")||activeProfile==="gemini"&&"non-default-wire-model","non-default-wire-model");
  if(activeProfile==="ark"){assert.equal(field(body,"generate_audio"),false);assert.equal(field(body,"seed"),0);}
  if(activeProfile==="kie-kling")assert.equal(field(body,"input.kling_elements.0.name"),"角色");
},validatePoll:({path:wirePath,taskId}:{path:string;taskId:string})=>{
  const id=encodeURIComponent(taskId),expected=activeProfile.startsWith("kie")?`/api/v1/jobs/recordInfo?taskId=${id}`:activeProfile.startsWith("apimart")?`/v1/tasks/${id}?language=zh`:activeProfile==="ark"?`/contents/generations/tasks/${id}`:activeProfile==="gemini"?`/v1beta/operations/${id}`:["minimax","metaso"].includes(activeProfile)?`/v2/query/video_generation/${id}`:activeProfile==="cogvideox3"?`/v1/async-result/${id}`:`/v1/videos/${id}`;
  assert.equal(wirePath,expected);
}});
const previousOrigins=process.env.MODEL_CONFIG_TRUSTED_ORIGINS;process.env.MODEL_CONFIG_TRUSTED_ORIGINS=supplier.origin;
const first=await readFile(path.join(assetsRoot,"first.png")),last=await readFile(path.join(assetsRoot,"last.png"));
const image:VideoReference={id:"image",kind:"image",role:"reference",url:supplier.origin+"/assets/first.png",inlineData:{mimeType:"image/png",data:first.toString("base64")}};
const end:VideoReference={id:"last",kind:"image",role:"last_frame",url:supplier.origin+"/assets/last.png",inlineData:{mimeType:"image/png",data:last.toString("base64")}};
const video:VideoReference={id:"video",kind:"video",role:"source_video",url:supplier.origin+"/assets/landscape-4-audio.mp4"};
const audio:VideoReference={id:"audio",kind:"audio",role:"source_audio",url:supplier.origin+"/assets/tone-8.wav"};
const shots=[{prompt:"走近镜头",durationSeconds:2},{prompt:"转身",durationSeconds:2}];
const elements=[{name:"角色",description:"同一人物",references:[image]}];
const cases:Array<{profile:VideoWireProfile;refs:VideoReference[];extra?:Partial<VideoGenerationRequest>}>=
  [{profile:"openai-videos",refs:[image]},{profile:"grok2api",refs:[]},{profile:"grok2api",refs:[image]},
    {profile:"cogvideox3",refs:[{...image,role:"first_frame"},end],extra:{generateAudio:false}},
    {profile:"agnes",refs:[image,{...image,id:"second"}]},{profile:"agnes-v25",refs:[{...image,role:"first_frame"},end]},
    {profile:"agnes-v25",refs:[image,video,audio]},
    {profile:"ark",refs:[image,video,audio],extra:{generateAudio:false,watermark:false,providerOptions:{seed:0,cameraFixed:false}}},
    {profile:"kie-generic",refs:[image,video,audio]},
    {profile:"kie-kling",refs:[image],extra:{shots,elements,generateAudio:false}},
    {profile:"kie-kling-v26",refs:[image],extra:{durationSeconds:5,generateAudio:false}},
    {profile:"kie-kling-omni-text",refs:[],extra:{shots}},
    {profile:"kie-kling-omni-image",refs:[image,end],extra:{shots,elements}},
    {profile:"kie-kling-omni-reference",refs:[image,video],extra:{shots,elements,generateAudio:false}},
    {profile:"kie-kling-omni-transform",refs:[image,video]},
    {profile:"kie-motion-control",refs:[image,video],extra:{providerOptions:{characterOrientation:"image"}}},
    {profile:"apimart-generic",refs:[image,video,audio]},
    {profile:"apimart-kling",refs:[image],extra:{shots,elements}},
    {profile:"apimart-kling-v26",refs:[image],extra:{durationSeconds:5,generateAudio:false}},
    {profile:"apimart-kling-omni",refs:[image,video]},
    {profile:"apimart-motion-control",refs:[image,video],extra:{providerOptions:{characterOrientation:"image"}}},
    {profile:"gemini",refs:[{...image,role:"first_frame"},end]},
    {profile:"minimax",refs:[image,video,audio]},{profile:"metaso",refs:[{...image,role:"first_frame"},end]}];
try{
  for(const item of cases){
    activeProfile=item.profile;
    const protocol:VideoProviderProtocol=item.profile.startsWith("kie")?"kie":item.profile.startsWith("apimart")?"apimart":item.profile==="ark"?"ark":item.profile==="gemini"?"gemini":["minimax","metaso"].includes(item.profile)?"minimax":"openai-videos";
    const cfg:VideoProviderRuntimeConfig={id:`fixture-${randomUUID()}`,label:item.profile,protocol,videoProfile:item.profile,baseUrl:supplier.origin+`/protocol/${protocol}`,
      apiKey:supplier.token,models:["non-default-wire-model"],defaultModel:"unused-default",idempotencyStrategy:"header",timeoutMs:120000};
    const input:VideoGenerationRequest={source:"workbench",providerId:cfg.id,modelId:"non-default-wire-model",prompt:"wire matrix",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",references:item.refs,idempotencyKey:randomUUID(),...item.extra};
    const context:VideoWireContext={profile:item.profile,provider:cfg,request:input},wire=buildVideoCreate(context);bodies.push({profile:item.profile,body:wire.body});
    const adapter=createWireVideoAdapter(cfg),created=await adapter.create(input);
    assert.ok(created.upstreamTaskId);const task:VideoTaskSnapshot={id:randomUUID(),email:"fixture@example.test",providerId:cfg.id,modelId:input.modelId,upstreamTaskId:created.upstreamTaskId,prompt:input.prompt,parameters:{durationSeconds:4,resolution:"720p"},references:input.references};
    assert.equal((await adapter.poll(task)).status,"processing");const done=await adapter.poll(task);assert.equal(done.status,"completed");
    const result=await adapter.fetchResult(task,done);assert.ok(result.bytes&&result.bytes.byteLength>1000);assert.equal(result.mimeType,"video/mp4");
  }
  const ark=bodies.find(item=>item.profile==="ark")!.body;
  assert.equal(field(ark,"seed"),0);assert.equal(field(ark,"camera_fixed"),false);assert.equal(field(ark,"generate_audio"),false);
  const kling=bodies.find(item=>item.profile==="kie-kling")!.body;
  assert.equal(field(kling,"input.multi_shots"),true);assert.equal(field(kling,"input.multi_prompt.0.duration"),2);
  assert.equal(field(kling,"input.kling_elements.0.element_input_urls.0"),image.url);
  assert.equal(field(bodies.find(item=>item.profile==="kie-motion-control")!.body,"input.character_orientation"),"image");
  assert.equal(field(bodies.find(item=>item.profile==="gemini")!.body,"instances.0.image.inlineData.data"),first.toString("base64"));
  assert.throws(()=>decodeVideoPolled("ark",{status:"unknown",content:{video_url:image.url}}));
  assert.throws(()=>decodeVideoPolled("kie-generic",{data:{state:"success",resultJson:JSON.stringify({request:{url:image.url}})}}));
  assert.throws(()=>decodeVideoPolled("gemini",{done:true,response:{echo:{url:image.url}}}));
  assert.equal(videoWireEndpoint({baseUrl:"https://supplier.example.test/v1"},"/v1/videos"),"https://supplier.example.test/v1/videos");
  assert.equal(supplier.calls.filter(call=>call.phase==="create").length,cases.length);
  process.stdout.write(`VIDEO_IC_PROTOCOLS=PASS http_cases=${cases.length} selected_model=true real_media_download=true paid_calls=0\n`);
}finally{await supplier.close();if(previousOrigins===undefined)delete process.env.MODEL_CONFIG_TRUSTED_ORIGINS;else process.env.MODEL_CONFIG_TRUSTED_ORIGINS=previousOrigins;
  if(process.env.DATABASE_URL){const {getPool}=await import("../src/lib/db");await getPool().end();}}
