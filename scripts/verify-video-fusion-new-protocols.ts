import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fixtureDatabase} from "./video-fusion/fixture";
import {loadVideoAssets,defaultAssetsRoot} from "./video-fusion/assets.mjs";
import {createVideoSupplier} from "./video-fusion/supplier.mjs";
import {createWireVideoAdapter} from "../src/lib/video/providers/wire-adapter";
import {buildVideoCreate,buildVideoPoll,decodeVideoPolled,field} from "../src/lib/video/providers/wire";
import {videoProfileProtocol,type VideoWireProfile} from "../src/lib/video/capability-schema";
import type {VideoGenerationRequest,VideoReference,VideoTaskSnapshot} from "../src/lib/video/types";
import type {VideoProviderRuntimeConfig} from "../src/lib/video/providers/config";

if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1")throw new Error("New video protocols require isolated fixture mode");
if(process.env.DATABASE_URL){const guard=await fixtureDatabase();await guard.end();}
const assetsRoot=process.env.VIDEO_FIXTURE_ASSETS_ROOT||defaultAssetsRoot,manifest=await loadVideoAssets(assetsRoot);
let activeProfile:VideoWireProfile="tokendance-seedance";
const createPaths:Partial<Record<VideoWireProfile,string>>={"tokendance-seedance":"/ark/v3/generations/tasks","tokendance-kling-text":"/kling/v1/text2video","tokendance-kling-image":"/kling/v1/image2video",
  "tokendance-kling-motion":"/kling/v1/motion-control","tokendance-kling-omni":"/kling/v1/omni-video","tokendance-wan3":"/alibaba/wan3/v1/video-synthesis",
  "tokendance-happyhorse":"/alibaba/happyhorse/v1/video-synthesis","tokendance-minimax":"/minimax/v2/video_generation","compshare-h3":"/minimax/v2/video_generation"};
const bodies:Array<{profile:string;body:unknown}>=[];
const supplier=await createVideoSupplier({assetsRoot,manifest,validateWire:({path:wirePath,body}:{path:string;body:unknown})=>{
  assert.equal(wirePath,createPaths[activeProfile]||(activeProfile.startsWith("tfrouter")?"/v1/video/generateVideo":"/v1/tasks/submit"));
  assert.equal(field(body,"model")||field(body,"model_name"),"selected-wire-model");
}});
const savedOrigins=process.env.MODEL_CONFIG_TRUSTED_ORIGINS;process.env.MODEL_CONFIG_TRUSTED_ORIGINS=supplier.origin;
const png=await readFile(path.join(assetsRoot,"first.png"));
const image:VideoReference={id:"i",kind:"image",role:"reference",url:supplier.origin+"/assets/first.png",inlineData:{mimeType:"image/png",data:png.toString("base64")}};
const first={...image,role:"first_frame" as const},last={...image,id:"last",role:"last_frame" as const,url:supplier.origin+"/assets/last.png"};
const video:VideoReference={id:"v",kind:"video",role:"source_video",url:supplier.origin+"/assets/landscape-4-audio.mp4"},audio:VideoReference={id:"a",kind:"audio",role:"source_audio",url:supplier.origin+"/assets/tone-8.wav"};
const cases:Array<{profile:VideoWireProfile;mode:VideoGenerationRequest["mode"];refs:VideoReference[];extra?:Partial<VideoGenerationRequest>}>=
 [{profile:"tokendance-seedance",mode:"reference",refs:[image,video,audio],extra:{generateAudio:false,watermark:false,providerOptions:{seed:0}}},
  {profile:"tokendance-seedance",mode:"first_optional",refs:[last]},
  {profile:"tokendance-kling-text",mode:"text",refs:[]},
  {profile:"tokendance-kling-image",mode:"frames_required",refs:[first,last]},
  {profile:"tokendance-kling-motion",mode:"motion_control",refs:[image,video],extra:{providerOptions:{characterOrientation:"image"}}},
  {profile:"tokendance-kling-omni",mode:"reference",refs:[image,video,audio]},
  {profile:"tokendance-wan3",mode:"reference",refs:[image,video,audio],extra:{generateAudio:false,watermark:false}},
  {profile:"tokendance-happyhorse",mode:"reference",refs:[image]},
  {profile:"tokendance-happyhorse",mode:"extend",refs:[video]},
  {profile:"tokendance-minimax",mode:"frames_required",refs:[first,last]},
  {profile:"tfrouter-generic",mode:"reference",refs:[image,video,audio],extra:{generateAudio:false}},
  {profile:"tfrouter-generic",mode:"first_optional",refs:[last]},
  {profile:"tfrouter-kling",mode:"frames_required",refs:[first,last]},
  {profile:"tfrouter-kling-omni",mode:"reference",refs:[image,video]},
  {profile:"tfrouter-grok",mode:"text",refs:[]},
  {profile:"compshare-h3",mode:"reference",refs:[image,video,audio],extra:{resolution:"768P",watermark:false,providerOptions:{muteAudio:false,useContextIR:false}}},
  {profile:"compshare-hailuo",mode:"single_image",refs:[first],extra:{durationSeconds:6}},
  {profile:"compshare-vidu",mode:"text",refs:[]},
  {profile:"compshare-vidu",mode:"reference",refs:[image]},
  {profile:"compshare-vidu",mode:"frames_required",refs:[first,last]},
  {profile:"compshare-vidu-extend",mode:"extend",refs:[video,last]},
  {profile:"compshare-vidu-lip-sync",mode:"lip_sync",refs:[video,audio],extra:{prompt:""}},
  {profile:"compshare-vidu-lip-sync",mode:"lip_sync",refs:[video],extra:{prompt:"",providerOptions:{text:"你好"}}},
  {profile:"compshare-wan",mode:"text",refs:[],extra:{aspectRatio:"9:16"}},
  {profile:"compshare-wan",mode:"frames_required",refs:[first,last,audio]},
  {profile:"compshare-seedance",mode:"reference",refs:[image,video,audio],extra:{generateAudio:false,watermark:false}},
  {profile:"compshare-seedance",mode:"first_optional",refs:[last]}];
try{
  for(const item of cases){
    activeProfile=item.profile;supplier.setScenario(item.profile==="compshare-vidu"&&item.mode==="reference"?"multi-output":"success");const protocol=videoProfileProtocol(item.profile);
    const provider:VideoProviderRuntimeConfig={id:randomUUID(),label:item.profile,protocol,videoProfile:item.profile,baseUrl:supplier.origin+`/protocol/${protocol}`,apiKey:supplier.token,
      models:["selected-wire-model"],defaultModel:"unused-default",idempotencyStrategy:"header"};
    const request:VideoGenerationRequest={source:"workbench",providerId:provider.id,modelId:"selected-wire-model",mode:item.mode,prompt:"新协议校验",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",references:item.refs,idempotencyKey:randomUUID(),...item.extra};
    const context={provider,profile:item.profile,request},wire=buildVideoCreate(context);bodies.push({profile:item.profile,body:wire.body});
    const adapter=createWireVideoAdapter(provider),created=await adapter.create(request);
    const task:VideoTaskSnapshot={id:randomUUID(),email:"fixture@example.test",providerId:provider.id,modelId:request.modelId,prompt:request.prompt,upstreamTaskId:created.upstreamTaskId,parameters:{durationSeconds:request.durationSeconds,resolution:request.resolution},references:request.references};
    if(item.profile==="tokendance-kling-motion")assert.equal(buildVideoPoll(context,created.upstreamTaskId).path.split("/").slice(0,-1).join("/"),"/kling/v1/motion-control");
    assert.equal((await adapter.poll(task)).status,"processing");const done=await adapter.poll(task);assert.equal(done.status,"completed");
    const output=await adapter.fetchResult(task,done);assert.ok(output.bytes&&output.bytes.length>1000);
    if(item.profile==="compshare-vidu"&&item.mode==="reference"){
      assert.equal(done.resultAssets?.length,2);
      for(const asset of done.resultAssets!){const extraOutput=await adapter.fetchResult(task,{...done,resultUrl:asset.url});assert.ok(extraOutput.bytes&&extraOutput.bytes.length>1000);}
    }
  }
  assert.equal(field(bodies.find(item=>item.profile==="tokendance-seedance")!.body,"seed"),0);
  assert.equal(field(bodies.find(item=>item.profile==="tfrouter-generic")!.body,"metadata.generate_audio"),false);
  const tail=bodies.filter(item=>item.profile==="tfrouter-generic")[1].body;assert.equal(field(tail,"metadata.references.0.role"),"last_frame");
  assert.equal(field(bodies.find(item=>item.profile==="compshare-h3")!.body,"mute_audio"),false);
  assert.equal(field(bodies.find(item=>item.profile==="compshare-vidu-extend")!.body,"parameters.vidu_type"),"extend");
  assert.equal(field(bodies.filter(item=>item.profile==="compshare-vidu-lip-sync")[1].body,"input.text"),"你好");
  const multi=decodeVideoPolled("compshare-vidu",{output:{task_status:"Success",urls:[supplier.origin+"/assets/landscape-4-audio.mp4",supplier.origin+"/assets/portrait-4-audio.mp4"]}});
  assert.equal(multi.resultAssets?.length,2);
  assert.throws(()=>decodeVideoPolled("tfrouter-generic",{status:"success",data:{echo:{url:image.url}}}));
  assert.throws(()=>decodeVideoPolled("compshare-vidu",{output:{task_status:"Success",urls:[]}}));
  assert.equal(supplier.calls.filter(call=>call.phase==="create").length,cases.length);
  process.stdout.write(`VIDEO_NEW_PROTOCOLS=PASS http_cases=${cases.length} tail_frame=true complete_output_list=true paid_calls=0\n`);
}finally{await supplier.close();if(savedOrigins===undefined)delete process.env.MODEL_CONFIG_TRUSTED_ORIGINS;else process.env.MODEL_CONFIG_TRUSTED_ORIGINS=savedOrigins;
 if(process.env.DATABASE_URL){const {getPool}=await import("../src/lib/db");await getPool().end();}}
