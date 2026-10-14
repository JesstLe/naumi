import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {createCanvasVideoTools} from "../src/lib/agent/canvas-video-tools";
import {assertInternalAgentPath} from "../src/lib/agent/harness-network";
import {AgentHarness,validateToolArguments} from "../src/lib/agent/harness";
import {describeNaumiTools} from "../src/lib/agent/naumi-tools";
import type {CanvasVideoNode} from "../src/lib/canvas/video-node-schema";
import type {PublicVideoTaskView} from "../src/lib/video/service";
async function main(){
  const h=await createVideoFixture({startWorker:false}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`agent-tools-${randomUUID()}`);
  try{
    const project=`tree:${h.refs.image.id}`,canvas={anchorId:h.refs.image.id,imageUrls:[h.refs.image.url],ratio:"1:1",resolution:"2K",quality:"max",video:{projectKey:project}};
    let confirmation:{version:number;credits:number}|undefined;
    const internal=(account:"a"|"b")=>async(api:string,signal?:AbortSignal,init:RequestInit={})=>{assertInternalAgentPath(api,init.method||"GET");const response=await fetch(h.baseUrl+api,{...init,signal,headers:{...Object.fromEntries(new Headers(init.headers)),cookie:h.cookies[account],...(confirmation?{"x-naumi-billing-version":String(confirmation.version),"x-naumi-billing-credits":String(confirmation.credits)}:{})}}),body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error||"fixture API failed"),{status:response.status,code:body.code});return body;};
    const tools=createCanvasVideoTools({actor:h.accounts.a,canvas,internal:internal("a"),confirmation:()=>confirmation}),foreign=createCanvasVideoTools({actor:h.accounts.b,canvas,internal:internal("b")});
    const invoke=async(name:string,args:Record<string,unknown>,callId=randomUUID())=>{const tool=tools.find(tool=>tool.name===name)!;assert.ok(tool,`missing ${name}`);validateToolArguments(tool.parameters,args);return (await tool.execute(callId,args)).details as any;};
    const models=await invoke("list_video_models",{}),model=models.models.find((model:any)=>model.isDefault)||models.models[0],duration=model.definition.durationResolutionMap[0].durations[0],resolution=model.definition.durationResolutionMap[0].resolutions[0];
    const config={modelId:model.modelId,providerId:model.providerId,prompt:"第一镜头完整对白\n甲：不要截断。",mode:"text",durationSeconds:duration,resolution,aspectRatio:model.definition.aspectRatios[0]};
    const original=await h.request<ArrayBuffer>("a","GET",h.refs.video.url),originalHash=createHash("sha256").update(Buffer.from(original.body)).digest("hex");
    const textId=`text-${randomUUID()}`,script="完整剧本\n"+"甲：请保留每句对白。\n".repeat(400),textNode=await h.request("a","POST","/api/canvas/text-nodes",{id:textId,projectKey:project,title:"原始剧本",content:script,status:"completed",canvasX:0,canvasY:0});assert.equal(textNode.status,200);
    const textList=await invoke("list_video_text_nodes",{});assert.ok(textList.nodes.some((item:any)=>item.id===textId));assert.equal((await invoke("get_video_text",{node_id:textId})).node.content,script);assert.equal((await h.request("b","GET",`/api/video/texts?id=${textId}`)).status,404);
    const created=await invoke("create_video_node",{config,title:"Agent镜头"}),node=created.node as CanvasVideoNode;assert.equal(node.projectKey,project);assert.equal(h.supplierCalls().filter(call=>call.phase==="create"||call.phase==="image-create").length,0);
    const read=await invoke("get_video_config",{node_id:node.id});assert.equal(read.node.config.prompt,config.prompt);assert.doesNotMatch(JSON.stringify(read),/apiKey|credentialRef|modelExecutions/);
    const prompt="完整镜头对白\n甲：第一行。\n乙：第二行。",promptId=randomUUID(),updated=await invoke("set_video_prompt",{node_id:node.id,expected_revision:node.revision,prompt},promptId);
    assert.equal(updated.node.config.prompt,prompt);assert.equal((await invoke("set_video_prompt",{node_id:node.id,expected_revision:node.revision,prompt},promptId)).node.revision,updated.node.revision);
    await assert.rejects(()=>invoke("set_video_prompt",{node_id:node.id,expected_revision:node.revision,prompt:"stale"}));
    const quote=await h.request<{version:number;credits:number;authorizedCredits:number;mode:string}>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId:model.modelId,providerId:model.providerId,resolution});assert.equal(quote.status,200);confirmation={version:quote.body.version,credits:quote.body.mode==="api-cost-plus"?quote.body.authorizedCredits:quote.body.credits};
    const generationId=randomUUID(),generated=await invoke("generate_video",{node_id:node.id,expected_revision:updated.node.revision},generationId);assert.ok(generated.taskId);assert.equal(generated.projectKey,project);
    assert.equal((await invoke("generate_video",{node_id:node.id,expected_revision:updated.node.revision},generationId)).taskId,generated.taskId);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,1);
    const until=Date.now()+180000;let task:PublicVideoTaskView;for(;;){const state=await invoke("get_video_task",{task_id:generated.taskId});task=state.task;if(task.status==="completed")break;assert.ok(Date.now()<until,"Agent task timeout");assert.ok(!["failed","cancelled","needs_attention"].includes(task.status));await new Promise(resolve=>setTimeout(resolve,250));}
    await h.restartApp();const restored=await invoke("get_video_task",{task_id:generated.taskId});assert.equal(restored.task.artworkId,task.artworkId);assert.equal((await invoke("get_video_config",{node_id:node.id})).node.lastTaskId,task.id);
    await assert.rejects(()=>foreign.find(tool=>tool.name==="get_video_config")!.execute(randomUUID(),{node_id:node.id}));
    const meta=describeNaumiTools(tools);assert.equal(meta.find(tool=>tool.name==="plan_video_shot")?.write,true);assert.equal(meta.find(tool=>tool.name==="plan_video_storyboard")?.write,true);assert.equal(meta.find(tool=>tool.name==="get_video_task")?.write,false);
    const harness=new AgentHarness(h.accounts.a,"agent-video-fixture");harness.configure(meta);harness.begin("只分析视频，不生成",()=>{});assert.throws(()=>harness.check("generate_video",{node_id:node.id,expected_revision:1}));harness.finish();
    harness.begin("请制作视频分镜并抽帧",()=>{});harness.check("plan_video_shot",{prompt:"完整规划",config});harness.check("process_video",{action:"frame",inputs:[task.artworkId],timestamp:"last"});harness.finish();
    const balance=await h.creditState("a"),callCount=h.supplierCalls().filter(call=>call.phase==="create").length,story=await invoke("plan_video_storyboard",{mode:"independent",config,shots:[{id:"A",prompt:"片段A完整对白",durationSeconds:duration},{id:"B",prompt:"片段B完整对白",durationSeconds:duration,config:{mode:"reference"},dependsOn:["A"]}]});
    assert.equal(story.nodes.length,2);assert.equal(story.nodes[1].inputs[0].nodeId,story.nodes[0].id);assert.equal(story.nodes[1].config.prompt,"片段B完整对白");assert.deepEqual(await h.creditState("a"),balance);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,callCount);
    const mediaQuote=await h.request<{quote:{version:number;credits:number}}>("a","GET","/api/video/media-jobs/quote?action=frame");confirmation=mediaQuote.body.quote;
    const frame=await invoke("process_video",{action:"frame",inputs:[task.artworkId],timestamp:"last"});assert.ok(frame.jobId);const mediaUntil=Date.now()+120000;let media:any;for(;;){media=await invoke("get_video_media_task",{job_id:frame.jobId});if(media.job.status==="completed")break;assert.ok(Date.now()<mediaUntil,"media timeout");assert.ok(!["failed","cancelled"].includes(media.job.status),media.job.error);await new Promise(resolve=>setTimeout(resolve,250));}assert.equal(media.job.outputs[0].mimeType,"image/png");
    assert.throws(()=>assertInternalAgentPath("/api/admin/users","GET"));assert.throws(()=>assertInternalAgentPath("https://other.invalid/api/video/tasks","GET"));
    const after=await h.request<ArrayBuffer>("a","GET",h.refs.video.url);assert.equal(createHash("sha256").update(Buffer.from(after.body)).digest("hex"),originalHash);
    await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,"result.json"),JSON.stringify({ok:true,actualAppDbTasksAndMediaWorker:true,fullEditablePrompt:true,ownedFullScriptNotTruncated:true,settingsReplayAndRevision:true,oneTaskForSameToolCall:true,actualTaskCompletionAndAppRestart:true,ownerIsolation:true,harnessVideoIntentAndPlanningWrites:true,editableStoryboardDependencies:true,planningSupplierCalls:0,planningCreditsChanged:false,actualLastFrame:true,internalPathConfinement:true,sourceSha256:originalHash,paidVideoApiCalls:0,sseAgentAndDurableChainStillRequired:true},null,2));process.stdout.write(`VIDEO_AGENT_FOUNDATION=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
