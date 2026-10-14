import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import type {CanvasVideoNode} from "../src/lib/canvas/video-node-schema";

async function main(){
  const h=await createVideoFixture({startWorker:false});
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`canvas-workflow-${randomUUID()}`);
  try{
    const projectKey=`tree:${h.refs.image.id}`,textId=`text-${randomUUID()}`;
    const dialogue="甲：每一句对白必须完整保留。\n乙：镜头继续。\n".repeat(75);
    assert.equal((await h.request("a","POST","/api/canvas/text-nodes",{id:textId,projectKey,title:"完整对白",content:dialogue,status:"completed",canvasX:0,canvasY:0})).status,200);
    const workflowId=h.byocWorkflowId;
    const recipe={"load-video":{class_type:"VHS_LoadVideo",inputs:{video:"old.mp4"}},encode:{class_type:"CLIPTextEncode",inputs:{text:"old text"}},"save-video":{class_type:"SaveVideo",inputs:{frames:["load-video",0]}}};
    assert.equal((await h.request("a","POST","/api/comfyui/workflows",{id:workflowId,name:"Mixed owned video recipe",json:JSON.stringify(recipe)})).status,200);
    const create=async(config:Record<string,unknown>,inputs:unknown[]=[])=>{
      const response=await h.request<{node:CanvasVideoNode}>("a","POST","/api/canvas/video-nodes",{id:`video-${randomUUID()}`,projectKey,operationId:randomUUID(),expectedRevision:0,config,inputs});
      assert.equal(response.status,201,JSON.stringify(response.body));return response.body.node;
    };
    const managed={modelId:"video-a",mode:"text",prompt:"镜头A完整原文",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"};
    const a=await create(managed);
    const b=await create({comfyWorkflowId:workflowId,prompt:"镜头B {{ref 2}}",mode:"reference",comfyInputs:[{name:"previous-video",type:"video",path:["load-video","inputs","video"],index:0,required:true}]},[
      {id:"full-text",nodeId:textId,kind:"text",role:"context",value:dialogue},
      {id:"previous-output",nodeId:a.id,kind:"video",role:"source_video",value:"/media/pending"},
    ]);
    const c=await create({...managed,mode:"extend",prompt:"镜头C续写真实B产物"},[{id:"continue-b",nodeId:b.id,kind:"video",role:"source_video",value:"/media/pending"}]);
    const intent={id:randomUUID(),projectKey,nodes:[a,b,c].map(node=>({id:node.id,revision:node.revision}))};
    const started=await h.request<any>("a","POST","/api/canvas/video-workflows",intent);
    assert.equal(started.status,202,JSON.stringify(started.body));
    const run=async()=>{const response=await h.request<any>("a","GET",`/api/video/workflows/${intent.id}`);assert.equal(response.status,200,JSON.stringify(response.body));return response.body.run;};
    const first=await run(),aTask=first.nodes.find((node:any)=>node.id===a.id).taskId;
    assert.equal(started.body.taskIds.length,1,JSON.stringify(first.nodes));
    assert.equal((await h.request<{node:CanvasVideoNode}>("a","GET",`/api/canvas/video-nodes/${a.id}`)).body.node.lastTaskId,aTask);
    assert.deepEqual(await h.workflowFreezeState("a",intent.id),{encrypted:true,inputDigestSaved:true});
    assert.equal(first.plan.nodes[1].request.orderedInputs[0].value,dialogue);
    assert.equal(first.plan.nodes[1].request.orderedInputs[1].id,"previous-output");
    assert.doesNotMatch(JSON.stringify(first),/apiKey|credentialRef|frozen_nodes_enc/);
    assert.equal((await h.request("b","GET",`/api/video/workflows/${intent.id}`)).status,404);
    assert.equal((await h.request("b","POST","/api/canvas/video-workflows",intent)).status,409);
    assert.equal((await h.request("a","POST","/api/canvas/video-workflows",{...intent,nodes:[{id:b.id,revision:b.revision}]})).status,409);
    // Editing the library and dialogue must not alter already queued BYOC stages.
    assert.equal((await h.request("a","POST","/api/comfyui/workflows",{id:workflowId,name:"Edited later",json:JSON.stringify({...recipe,encode:{class_type:"CLIPTextEncode",inputs:{text:"LATER_LIBRARY_TEXT"}}})})).status,200);
    assert.equal((await h.request("a","POST","/api/canvas/text-nodes",{id:textId,projectKey,title:"已改对白",content:"LATER_DIALOGUE",status:"completed",canvasX:0,canvasY:0})).status,200);
    const moved=await h.request<{node:CanvasVideoNode}>("a","PATCH",`/api/canvas/video-nodes/${b.id}`,{expectedRevision:b.revision,operationId:randomUUID(),x:123,y:77});assert.equal(moved.status,200);
    const finish=async(taskId:string)=>{const until=Date.now()+150000;for(;;){await h.forceVideoPollDue(taskId);const response=await h.request<any>("a","GET",`/api/video/tasks?id=${taskId}`);assert.equal(response.status,200,JSON.stringify(response.body));if(response.body.task.status==="completed")return response.body.task;assert.ok(!["failed","cancelled","needs_attention"].includes(response.body.task.status),JSON.stringify(response.body));assert.ok(Date.now()<until,"real task completion timed out");await new Promise(resolve=>setTimeout(resolve,200));}};
    const aResult=await finish(aTask);
    assert.equal((await h.request<{node:CanvasVideoNode}>("a","GET",`/api/canvas/video-nodes/${a.id}`)).body.node.lastResultId,aResult.artworkId);
    // Delete only task history, retaining owned media and settled billing. The next stage
    // must use transactionally cached outputs rather than requiring the old task row.
    assert.equal((await h.request("a","DELETE",`/api/video/tasks/${aTask}`)).status,200);
    assert.equal((await h.request("a","GET",`/api/video/tasks?id=${aTask}`)).status,404);
    await h.restartApp();
    assert.equal((await h.request("a","POST","/api/canvas/video-workflows",intent)).status,202);
    const middle=await run(),bTask=middle.nodes.find((node:any)=>node.id===b.id).taskId;
    assert.ok(bTask,JSON.stringify(middle.nodes));assert.equal(middle.nodes.find((node:any)=>node.id===a.id).status,"completed");
    const bNode=(await h.request<{node:CanvasVideoNode}>("a","GET",`/api/canvas/video-nodes/${b.id}`)).body.node;
    assert.equal(bNode.lastTaskId,bTask);assert.equal(bNode.x,123);assert.equal(bNode.y,77);
    const bResult=await finish(bTask),persisted=await h.taskPersistence("a",bTask);
    assert.equal(persisted.parameters.workflowRunId,intent.id);assert.equal(persisted.parameters.workflowNodeId,b.id);
    assert.equal(persisted.parameters.request.orderedInputs[0].value,dialogue);
    assert.equal(persisted.parameters.request.orderedInputs[1].id,"previous-output");
    const byocCreate=h.supplierCalls().find((call:any)=>call.phase==="create"&&call.protocol==="comfyui") as any;
    assert.ok(byocCreate);assert.ok(String(byocCreate.body.prompt.encode.inputs.text).includes(dialogue.trim()));
    assert.ok(!JSON.stringify(byocCreate.body).includes("LATER_DIALOGUE"));assert.ok(!JSON.stringify(byocCreate.body).includes("LATER_LIBRARY_TEXT"));
    assert.equal(bResult.cost,0);
    assert.equal((await h.request("a","POST",`/api/video/workflows/${intent.id}`,{action:"resume"})).status,200);
    const finalRun=await run(),cTask=finalRun.nodes.find((node:any)=>node.id===c.id).taskId;assert.ok(cTask,JSON.stringify(finalRun.nodes));await finish(cTask);
    await h.tick();assert.ok((await run()).nodes.every((node:any)=>node.status==="completed"));
    const count=h.supplierCalls().filter(call=>call.phase==="create").length;assert.equal(count,3);
    assert.equal((await h.request("a","POST","/api/canvas/video-workflows",intent)).status,202);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,count);
    // A pending stage edited in another window is blocked, rather than overwritten.
    const d=await create(managed),e=await create({...managed,mode:"extend"},[{id:"previous-d",nodeId:d.id,kind:"video",role:"source_video",value:"/media/pending"}]);
    const other={id:randomUUID(),projectKey,nodes:[d,e].map(node=>({id:node.id,revision:node.revision}))};
    assert.equal((await h.request("a","POST","/api/canvas/video-workflows",other)).status,202);
    const dTask=(await h.request<any>("a","GET",`/api/video/workflows/${other.id}`)).body.run.nodes.find((node:any)=>node.id===d.id).taskId;
    assert.equal((await h.request("a","PATCH",`/api/canvas/video-nodes/${e.id}`,{expectedRevision:e.revision,operationId:randomUUID(),config:{...e.config,prompt:"另一个窗口的新编辑"}})).status,200);
    await finish(dTask);const changed=await h.request<any>("a","POST",`/api/video/workflows/${other.id}`,{action:"resume"});assert.equal(changed.status,200);assert.equal(changed.body.run.nodes.find((node:any)=>node.id===e.id).status,"blocked");assert.equal(changed.body.run.nodes.find((node:any)=>node.id===e.id).taskId,null);
    await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,"result.json"),JSON.stringify({ok:true,realAppDbAndWorker:true,managedByocManagedChain:true,originalNodeTaskAndResultPointers:true,fullOrderedTextFrozen:true,byocLibraryFrozen:true,positionOnlyEditPreserved:true,contentEditPreventsOverwrite:true,completedDependencySurvivesHistoryDeletion:true,actualAppRestart:true,replayNoNewTask:true,ownerIsolation:true,paidVideoApiCalls:0},null,2));
    process.stdout.write(`VIDEO_CANVAS_WORKFLOW=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
