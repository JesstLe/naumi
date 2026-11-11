import {publicToolDetails} from "../src/lib/agent/tool-presentation";
import assert from "node:assert/strict";
import fs from "node:fs";
import { freezeCreationSettings, creationToolArguments, creationImageForm, assertVideoCreationSettings } from "../src/lib/agent/creation-settings";
import { reduceWorkbenchActivity, restoreWorkbenchMessages } from "../src/lib/agent/workbench-activity";
import { createWorkbenchSession, type WorkbenchSendContext } from "../src/lib/agent/workbench-session";
import type { WorkbenchMessage } from "../src/lib/agent/workbench-contract";
import { createNaumiTools, AGENT_SYSTEM_PROMPT } from "../src/lib/agent/naumi-tools";
import { buildTaskPlan } from "../src/lib/agent/recovery";

async function main() {
  let checks=0; const check=(name:string,value:unknown)=>{assert.ok(value,name);checks++;console.log("PASS "+name);};
  const draft={image:{modelId:"image-a",ratio:"1:1",resolution:"2K" as const},video:{modelId:"video-a",providerId:"managed-video",aspectRatio:"16:9",resolution:"720p",durationSeconds:5}};
  const turn=freezeCreationSettings(draft);draft.image.modelId="image-b";
  check("round-snapshot-is-deep-frozen",Object.isFrozen(turn)&&Object.isFrozen(turn.image)&&turn.image?.modelId==="image-a");
  assert.throws(()=>freezeCreationSettings({image:{modelId:"a",secret:"bad"}}));checks++;
  const args={model:"llm-choice",ratio:"9:16",prompt:"product"};
  const effective=creationToolArguments("generate_image",args,turn);
  check("explicit-image-settings-win-without-mutating-args",effective.model==="image-a"&&effective.ratio==="1:1"&&effective.resolution==="2K"&&args.model==="llm-choice");
  const automatic=creationToolArguments("generate_image",args,freezeCreationSettings({}));
  check("smart-settings-preserve-tool-choice",automatic===args);
  const clean=freezeCreationSettings({image:{ratio:undefined}});
  check("undefined-ui-reset-does-not-erase-tool-choice",creationToolArguments("generate_image",args,clean).ratio==="9:16");
  check("merged-main-model-backed-tools-follow-round-settings",creationToolArguments("upscale_image",args,turn).model==="image-a"&&creationToolArguments("cutout_image",args,turn).model==="image-a");
  check("reference-inspection-and-custom-workflow-unchanged",creationToolArguments("inspect_images",args,turn)===args&&creationToolArguments("run_comfy_workflow",args,turn)===args);
  const v=creationToolArguments("generate_video",{config:{prompt:"clip",modelId:"llm-video",providerId:"other",resolution:"1080p"}},turn).config as Record<string,unknown>;
  check("video-config-pinned",v.modelId==="video-a"&&v.providerId==="managed-video"&&v.resolution==="720p"&&v.prompt==="clip");
  check("video-public-details-use-effective-config",publicToolDetails("generate_video",{config:v}).parameters.some(pair=>pair.name==="model"&&pair.value==="video-a"));
  assertVideoCreationSettings(v,turn);assert.throws(()=>assertVideoCreationSettings({...v,modelId:"other"},turn));checks++;
  const form=new FormData();form.set("model","other");form.set("ratio","9:16");
  const forwarded=creationImageForm("/api/recolor",form,turn)!;
  check("legacy-form-and-model-header-use-same-snapshot",forwarded.body.get("model")==="image-a"&&forwarded.body.get("resolution")==="2K"&&forwarded.headers["x-naumi-feature-model"]==="image-a"&&form.get("model")==="other");
  form.set("jobId","already-accepted");
  check("frozen-aplus-continuation-and-reference-inspection-untouched",!creationImageForm("/api/aplus",form,turn)&&!creationImageForm("/api/agent/verify-image",form,turn));
  let steps=reduceWorkbenchActivity([],"tool_start",{id:"call-1",tool:"recolor_product"});
  for(let i=0;i<8;i++)steps=reduceWorkbenchActivity(steps,"tool_start",{id:"call-1",tool:"recolor_product",summary:"正在生成",progress:{completed:0,total:1}});
  steps=reduceWorkbenchActivity(steps,"tool_end",{id:"call-1",tool:"recolor_product",summary:"已换色",outputs:["/media/result.webp"]});
  steps=reduceWorkbenchActivity(steps,"harness",{summary:"private"});
  steps=reduceWorkbenchActivity(steps,"tool_end",{id:"verify",tool:"verify_image_output"});
  check("one-invocation-one-row-no-bookkeeping-or-visual-review",steps.length===1&&steps[0].status==="done"&&steps[0].outputs?.length===1);
  check("no-fake-progress",!reduceWorkbenchActivity([],"tool_start",{id:"c",tool:"generate_image",progress:{completed:41,total:1}})[0].progress);
  const restored=restoreWorkbenchMessages([{role:"user",content:"first"},{role:"assistant",content:"first result"},{role:"user",content:"second"},{role:"assistant",content:"second result"}], [
    {type:"turn_settings",turnId:"t1",userIndex:0,settings:turn,modelId:"chat-a"},{type:"tool_start",turnId:"t1",id:"c1",tool:"recolor_product"},{type:"tool_end",turnId:"t1",id:"c1",tool:"recolor_product",summary:"已换色"},
    {type:"turn_settings",turnId:"t2",userIndex:1,settings:{image:{modelId:"image-b"}},modelId:"chat-b"},{type:"tool_end",turnId:"t2",id:"c2",tool:"retouch_product",summary:"已精修"},
  ]);
  check("history-attaches-settings-and-tools-to-original-turn",restored[1].steps?.length===1&&restored[1].steps[0].tool==="recolor_product"&&restored[1].creationSettings?.image?.modelId==="image-a"&&restored[3].steps?.[0].tool==="retouch_product"&&restored[3].creationSettings?.image?.modelId==="image-b"&&restored[1].agentModel==="chat-a");
  const compacted=restoreWorkbenchMessages(restored,[]);
  check("old-round-settings-survive-event-buffer-compaction",compacted[0].creationSettings?.image?.modelId==="image-a"&&compacted[3].creationSettings?.image?.modelId==="image-b");
  check("automatic-verification-removed-from-prompt-and-plan",!AGENT_SYSTEM_PROMPT.includes("verify_image_output")&&!buildTaskPlan("生成商品图").some(item=>item.includes("视觉模型")));

  // Real tool adapters, network receipts isolated. No provider or database call.
  const originalFetch=globalThis.fetch;const requests:{path:string;headers:Headers;body:unknown}[]=[];
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;requests.push({path,headers:new Headers(init?.headers),body:init?.body});
    if(path==="/uploads/fixture.png")return new Response(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64"),{headers:{"content-type":"image/png"}});
    if(path==="/api/recolor")return Response.json({url:"/media/result.webp",cost:1});
    if(path==="/api/video/tasks")return Response.json({error:"not found"},{status:404});
    if(path==="/api/video/generate")return Response.json({taskId:"task-fixture",cost:1});
    throw Error("Unexpected network: "+path);
  };
  try {
    const tools=createNaumiTools(new Request("http://127.0.0.1:3022"),"test@example.test",()=>({cookie:"",authorization:"",creationSettings:turn}));
    check("automatic-verification-not-callable-reference-reading-retained",!tools.some(tool=>tool.name==="verify_image_output")&&tools.some(tool=>tool.name==="inspect_images"));
    await tools.find(tool=>tool.name==="recolor_product")!.execute("recolor-fixture",{image_url:"http://127.0.0.1:3022/uploads/fixture.png",color:"#C8102E",strength:100});
    const recolor=requests.find(request=>request.path==="/api/recolor")!;
    check("actual-recolor-adapter-forwards-selected-model-and-parameters",recolor.headers.get("x-naumi-feature-model")==="image-a"&&(recolor.body as FormData).get("ratio")==="1:1"&&(recolor.body as FormData).get("resolution")==="2K");
    await tools.find(tool=>tool.name==="generate_video")!.execute("video-fixture",{config:{prompt:"clip",modelId:"llm-video",mode:"text",resolution:"1080p",aspectRatio:"1:1",durationSeconds:10},inputs:[]});
    const body=JSON.parse(requests.find(request=>request.path==="/api/video/generate")!.body as string);
    check("actual-video-adapter-forwards-selected-model-and-parameters",body.modelId==="video-a"&&body.providerId==="managed-video"&&body.resolution==="720p"&&body.durationSeconds===5&&body.aspectRatio==="16:9");
  } finally {globalThis.fetch=originalFetch;}

  const owner=createWorkbenchSession();owner.activateAccount("test@example.test");let messages:WorkbenchMessage[]=[],id="",sent:any;
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const settings={image:{modelId:"a"}};
  const context={ready:true,busy:false,unavailable:false,allowed:true,authenticated:true,uploading:false,input:"generate",attachments:[],messages:[],skill:null,creationSettings:settings,sessionId:()=>id,
    headers:async()=>{await gate;return {"x-naumi-text-model":"chat-a"};},request:async(_url:any,init?:RequestInit)=>{sent=JSON.parse(init!.body as string);return new Response('event: open\ndata: {"sessionId":"ag-fixture"}\n\nevent: tool_start\ndata: {"id":"c","tool":"recolor_product"}\n\nevent: tool_start\ndata: {"id":"c","tool":"recolor_product","summary":"生成中"}\n\nevent: tool_end\ndata: {"id":"c","tool":"recolor_product","summary":"完成"}\n\nevent: final\ndata: {"reply":"完成"}\n\n');},
    setMessages:(change:any)=>{messages=typeof change==="function"?change(messages):change;},setBusy:()=>{},setRunning:()=>{},setError:()=>{},setInput:()=>{},setAttachments:()=>{},installSession:(value:string)=>{id=value;},refreshSessions:async()=>{},requestSignIn:()=>{},invalidateAccount:()=>{}} satisfies WorkbenchSendContext;
  const pending=owner.send(context);settings.image.modelId="b";release();await pending;
  check("send-freezes-before-auth-await",sent.creationSettings.image.modelId==="a"&&messages[1].creationSettings?.image?.modelId==="a");
  check("live-stream-deduplicates-progress",messages[1].steps?.length===1&&messages[1].steps[0].status==="done");
  console.log(`AGENT_CREATION_PASS checks=${checks} paid_calls=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
