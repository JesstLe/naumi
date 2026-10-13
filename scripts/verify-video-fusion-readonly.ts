import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
async function main(){
  const h=await createVideoFixture({startWorker:false}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`readonly-${randomUUID()}`);
  try{
    const id=`video-${randomUUID()}`,projectKey=`tree:${id}`;
    const saved=await h.request<any>("b","POST","/api/canvas/video-nodes",{id,projectKey,expectedRevision:0,operationId:randomUUID(),title:"Target account video",config:{modelId:"video-a",mode:"text",prompt:"目标账号完整视频描述",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(saved.status,201,JSON.stringify(saved.body));
    const generated=await h.request<any>("b","POST",`/api/canvas/video-nodes/${id}/generate`,{expectedRevision:saved.body.node.revision,idempotencyKey:randomUUID()});assert.equal(generated.status,202,JSON.stringify(generated.body));
    const query=`email=${encodeURIComponent(h.accounts.b)}`,node=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}?${query}`));assert.equal(node.status,200);assert.equal(node.body.node.config.prompt,"目标账号完整视频描述");
    const count=h.supplierCalls().length,billing=await h.creditState("b");
    const list=await h.request<any>("a","GET",`/api/canvas/video-nodes?${query}`);assert.equal(list.status,200);assert.ok(list.body.nodes.some((node:any)=>node.id===id));
    for(const url of [`/api/video/tasks?id=${generated.body.taskId}&${query}`,`/api/video/tasks?projectKey=${projectKey}&${query}`,`/api/video/tasks/${generated.body.taskId}?${query}`]){const response=await h.request<any>("a","GET",url);assert.equal(response.status,200,JSON.stringify(response.body));assert.doesNotMatch(JSON.stringify(response.body),/apiKey|credentialRef|modelExecutions|providerSnapshot/);}
    assert.equal(h.supplierCalls().length,count,"Admin inspection must not poll the supplier");assert.deepEqual(await h.creditState("b"),billing);
    assert.equal((await h.request("a","GET",`/api/canvas/video-nodes/${id}`)).status,404);
    assert.equal((await h.request("b","GET",`/api/canvas/video-nodes?email=${encodeURIComponent(h.accounts.a)}`)).status,401);
    assert.equal((await h.request("b","GET",`/api/video/tasks?email=${encodeURIComponent(h.accounts.a)}`)).status,403);
    for(const url of ["/api/video/assets","/api/video/byoc/catalog"]){assert.equal((await h.request("a","GET",`${url}?${query}`)).status,200);assert.equal((await h.request("b","GET",`${url}?email=${encodeURIComponent(h.accounts.a)}`)).status,401);}
    assert.equal((await h.request("a","PATCH",`/api/canvas/video-nodes/${id}?${query}`,{expectedRevision:node.body.node.revision,operationId:randomUUID(),config:{prompt:"Must not overwrite"}})).status,404);
    assert.equal((await h.request("a","POST",`/api/canvas/video-nodes/${id}/generate?${query}`,{expectedRevision:node.body.node.revision,idempotencyKey:randomUUID()})).status,404);
    assert.equal((await h.request("a","POST",`/api/video/tasks/${generated.body.taskId}/cancel?${query}`)).status,404);
    assert.equal((await h.request("a","DELETE",`/api/video/tasks/${generated.body.taskId}?${query}`)).status,404);
    assert.equal(h.supplierCalls().length,count);assert.deepEqual(await h.creditState("b"),billing);assert.equal((await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}?${query}`)).body.node.config.prompt,"目标账号完整视频描述");
    await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,"result.json"),JSON.stringify({ok:true,actualAppDb:true,adminExplicitTargetRead:true,ordinaryAccountTargetDenied:true,defaultOwnerStillIsolated:true,taskInspectionNoSupplierPolling:true,targetBalanceUnchanged:true,writeGenerateCancelDeleteCannotImpersonateTarget:true,publicSnapshotNoExecutionSecrets:true,paidVideoApiCalls:0},null,2));process.stdout.write(`VIDEO_READONLY=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
