import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createVideoFixture} from "./video-fusion/harness";
import {validateVideoWorkflow} from "../src/lib/video/workflow";
import {buildVideoCreate,decodeVideoPolled} from "../src/lib/video/providers/wire";
import type {VideoWorkflowPlan} from "../src/lib/video/workflow-schema";
const request={prompt:"{{var scene}}",modelId:"video-a",mode:"text" as const,durationSeconds:4,resolution:"720p",aspectRatio:"16:9"};
const plan:VideoWorkflowPlan={id:randomUUID(),projectKey:"tree:fixture",variables:{scene:"镜头A"},nodes:[{id:"A",request,dependsOn:[]},{id:"B",request,dependsOn:["A"]}]};
assert.equal(validateVideoWorkflow(plan).nodes[0].request.prompt,"镜头A");
assert.throws(()=>validateVideoWorkflow({...plan,variables:{}}));
assert.throws(()=>validateVideoWorkflow({...plan,nodes:[{id:"A",request,dependsOn:["B"]},{id:"B",request,dependsOn:["A"]}]}));
assert.throws(()=>validateVideoWorkflow({...plan,nodes:[{id:"A",request,dependsOn:["A"]}]}));
assert.throws(()=>validateVideoWorkflow({...plan,variables:{scene:"x".repeat(16384)},nodes:[{id:"A",request:{...request,prompt:"{{var scene}}{{var scene}}"},dependsOn:[]}]}));
assert.equal(decodeVideoPolled("runninghub",{code:0,data:[]}).status,"processing");
assert.equal(decodeVideoPolled("runninghub",{code:805,msg:"node error"}).status,"failed");
assert.throws(()=>decodeVideoPolled("autodl",{code:"success",data:{status:"completed",results:[{type:"image",url:"https://media.example.test/photo.png"}]}}));
const context={profile:"autodl" as const,provider:{id:"fixture",label:"Fixture",protocol:"autodl" as const,apiKey:"fixture-key",baseUrl:"https://fixture.example.test",models:["selected"],defaultModel:"wrong-default",idempotencyStrategy:"none" as const},
  request:{source:"workflow" as const,providerId:"fixture",modelId:"selected",prompt:"workflow",durationSeconds:4,resolution:"720p",references:[],idempotencyKey:randomUUID(),
    providerOptions:{seed:0},workflowManifest:{version:1 as const,kind:"autodl" as const,workflowId:"selected-workflow",inputs:[{name:"seed",type:"custom" as const,path:["seed"]},{name:"prompt",type:"prompt" as const,path:["prompt"],required:true}]}}};
assert.equal(buildVideoCreate(context).path,"/api/v1/comfyui/comfyui_workflow/selected-workflow");
assert.equal((buildVideoCreate(context).body as {seed:number}).seed,0);
const h=await createVideoFixture();
try{
  const runId=randomUUID(),payload={id:runId,projectKey:`tree:${h.refs.image.id}`,nodes:[
    {id:"A",request:{...request,prompt:"独立镜头A"},dependsOn:[]},
    {id:"B",request:{...request,prompt:"继续A",mode:"extend"},dependsOn:["A"],mediaBindings:[{fromNodeId:"A",kind:"video",role:"source_video"}]},
    {id:"C",request:{...request,prompt:"独立镜头C"},dependsOn:[]}]};
  const created=await h.request<{runId:string}>("a","POST","/api/video/workflows",payload);assert.equal(created.status,202);assert.equal(created.body.runId,runId);
  assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,2);
  assert.equal((await h.request("b","GET",`/api/video/workflows/${runId}`)).status,404);
  await h.request("a","POST",`/api/video/workflows/${runId}`,{action:"resume"});await h.request("a","POST",`/api/video/workflows/${runId}`,{action:"resume"});
  assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,2);
  const deadline=Date.now()+90_000;
  let complete=false;
  while(Date.now()<deadline){
    await h.tick();const state=await h.request<{run:{nodes:Array<{id:string;status:string;taskId:string}>}}>("a","GET",`/api/video/workflows/${runId}`);
    if(state.body.run.nodes.every(node=>node.status==="completed")){complete=true;break;}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(complete,true);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,3);
  const calls=h.supplierCalls().filter(call=>call.phase==="create");assert.equal(calls.filter(call=>JSON.stringify(call.body).includes("继续A")).length,1);
  process.stdout.write("VIDEO_WORKFLOW=PASS dependency_waits_for_result=true independent_branch=true replay_submits_once=true paid_calls=0\n");
}finally{await h.stop();}
