import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {createCanvasVideoTools} from "../src/lib/agent/canvas-video-tools";
import {validateToolArguments} from "../src/lib/agent/harness";
import {assertInternalAgentPath} from "../src/lib/agent/harness-network";

async function main(){
  const h=await createVideoFixture({startWorker:false,videoProfile:"kie-kling"});
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`script-multishot-${randomUUID()}`);
  try{
    const projectKey=`tree:${h.refs.image.id}`,tools=createCanvasVideoTools({actor:h.accounts.a,canvas:{anchorId:h.refs.image.id,imageUrls:[],ratio:"16:9",resolution:"720p",quality:"high",video:{projectKey}},internal:async(api,signal,init={})=>{
      assertInternalAgentPath(api,init.method||"GET");const response=await fetch(h.baseUrl+api,{...init,signal,headers:{...Object.fromEntries(new Headers(init.headers)),cookie:h.cookies.a}}),body=await response.json();if(!response.ok)throw new Error(body.error);return body;
    }});
    const invoke=async(name:string,args:any,callId:string=randomUUID())=>{const tool=tools.find(t=>t.name===name)!;validateToolArguments(tool.parameters,args);return (await tool.execute(callId,args)).details as any;};
    const parts=["甲：第一段原文，含完整结尾。\n","乙：第二段原文，不能删句。\n"],source=await invoke("plan_video_script",{title:"结构化分镜原稿",content:parts.join("")});
    const config={modelId:"video-a",providerId:"managed-video",mode:"reference",durationSeconds:8,resolution:"720p",aspectRatio:"16:9",generateAudio:false};
    const inputs=[{id:"picture",nodeId:h.refs.image.id,kind:"image",role:"reference",value:h.refs.image.url}];
    const args={mode:"multi_shot",script_source:{node_id:source.node.id},config,inputs,shots:parts.map((part,i)=>({id:`shot-${i}`,prompt:`镜头${i+1}：图片1锁定角色，${i?"镜头拉远":"摄影机固定"}，完整保留正文。`,durationSeconds:4,originalText:part}))};
    const initial=await h.creditState("a"),call=randomUUID(),originalArgs=JSON.stringify(args);
    const planned=await invoke("plan_video_storyboard",args,call);assert.equal(JSON.stringify(args),originalArgs);assert.equal(planned.node.config.shots.length,2);
    assert.equal((await invoke("plan_video_storyboard",args,call)).node.id,planned.node.id);
    assert.deepEqual(await h.creditState("a"),initial);assert.equal(h.supplierCalls().filter(c=>c.phase==="create").length,0);
    const bodyNodes:string[]=[];
    for(let i=0;i<2;i++){
      const shot=planned.node.config.shots[i],author=planned.node.inputs.filter((r:any)=>r.kind==="text")[i],body=(await invoke("get_video_text",{node_id:shot.textNodeId})).node;
      assert.notEqual(shot.textNodeId,author.nodeId);assert.equal(body.content,shot.prompt);assert.equal(author.value,parts[i]);assert.ok(body.content.includes(parts[i]));assert.ok(body.content.includes(i?"镜头拉远":"摄影机固定"));bodyNodes.push(body.id);
    }
    const full=await h.request<any>("a","GET","/api/canvas/text-nodes"),sources=full.body.nodes;for(let i=0;i<2;i++){const body=sources.find((n:any)=>n.id===bodyNodes[i]),author=planned.node.inputs.filter((r:any)=>r.kind==="text")[i];assert.deepEqual(body.sourceIds,[author.nodeId]);}
    const workflowArgs={operation_id:randomUUID(),project_key:projectKey,nodes:[{id:planned.node.id,revision:planned.node.revision}]};
    const intent={id:workflowArgs.operation_id,projectKey,nodes:workflowArgs.nodes},started=await h.request<any>("a","POST","/api/canvas/video-workflows",intent);assert.equal(started.status,202,JSON.stringify(started.body));
    let run=await invoke("get_video_workflow",{run_id:workflowArgs.operation_id}),deadline=Date.now()+180000;
    while(Date.now()<deadline){await h.tick();run=await invoke("get_video_workflow",{run_id:workflowArgs.operation_id});if(run.nodes.every((n:any)=>n.status==="completed"))break;assert.ok(!run.nodes.some((n:any)=>["failed","needs_confirmation","needs_attention"].includes(n.status)),JSON.stringify(run));await new Promise(r=>setTimeout(r,250));}
    assert.ok(run.nodes.every((n:any)=>n.status==="completed"),JSON.stringify(run));
    const wire:any=h.supplierCalls().filter(c=>c.phase==="create").at(-1),prompts=wire.body.input.multi_prompt;
    assert.equal(prompts.length,2);for(let i=0;i<2;i++){assert.equal(prompts[i].prompt,planned.node.config.shots[i].prompt);assert.ok(prompts[i].prompt.includes(parts[i]));assert.equal(prompts[i].duration,4);}
    assert.equal(h.supplierCalls().filter(c=>c.phase==="create").length,1);
    const taskId=run.nodes[0].taskId,frozen=await h.taskPersistence("a",taskId);assert.equal(frozen.parameters.request.shots[0].prompt,planned.node.config.shots[0].prompt);
    assert.equal((await h.request<any>("a","POST","/api/canvas/video-workflows",intent)).status,202);assert.equal(h.supplierCalls().filter(c=>c.phase==="create").length,1);
    await h.restartApp();assert.equal((await invoke("get_video_workflow",{run_id:workflowArgs.operation_id})).nodes[0].taskId,taskId);
    await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,"result.json"),JSON.stringify({ok:true,actualAppDbRouterWorker:true,nativeKieMultiPrompt:true,sourceScriptPreserved:true,separateEditableShotBodies:true,originalWhitespacePreserved:true,correctFormalLineage:true,argumentsUnchanged:true,planningCharged:false,oneWorkflowTask:true,workflowFreezeKeepsVisualDirection:true,taskId,shotBodyNodeIds:bodyNodes,appRestart:true,paidVideoApiCalls:0},null,2));process.stdout.write(`VIDEO_SCRIPT_MULTI_SHOT=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
