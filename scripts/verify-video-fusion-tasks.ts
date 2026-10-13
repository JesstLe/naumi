import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createVideoFixture} from "./video-fusion/harness";
import type {PublicVideoTaskView} from "../src/lib/video/service";
async function main(){

const h=await createVideoFixture({startWorker:false});
async function terms(){const result=await h.request<{version:number;credits:number;authorizedCredits:number;mode:string}>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId:"video-a",resolution:"720p"});assert.equal(result.status,200);return {billingVersion:result.body.version,billingCredits:result.body.mode==="api-cost-plus"?result.body.authorizedCredits:result.body.credits};}
async function task(id:string){const r=await h.request<{task:PublicVideoTaskView}>("a","GET",`/api/video/tasks?id=${id}`);assert.equal(r.status,200);return r.body.task;}
async function finish(id:string){const deadline=Date.now()+90_000;while(Date.now()<deadline){const current=await task(id);if(["completed","failed","cancelled","needs_attention"].includes(current.status))return current;await new Promise(resolve=>setTimeout(resolve,500));}throw new Error("Video task did not settle");}
try{
  const prompt="细节镜头".repeat(400),input={prompt,modelId:"video-a",mode:"text",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",generateAudio:false,watermark:false,idempotencyKey:randomUUID(),...await terms()};
  const [one,two]=await Promise.all([h.request<{taskId:string}>("a","POST","/api/video/generate",input),h.request<{taskId:string}>("a","POST","/api/video/generate",input)]);
  assert.equal(one.status,200);assert.equal(two.status,200);assert.equal(one.body.taskId,two.body.taskId);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,1);
  const saved=await h.taskPersistence("a",one.body.taskId);assert.equal(saved.parameters.request.prompt,prompt);assert.equal(saved.parameters.request.generateAudio,false);assert.equal(saved.parameters.request.watermark,false);
  const queued=await h.prepareQueued("a",one.body.taskId),createCount=h.supplierCalls().filter(call=>call.phase==="create").length;
  const cancelled=await h.request<{status:string}>("a","POST",`/api/video/tasks/${queued.taskId}/cancel`);assert.equal(cancelled.body.status,"cancelled");await h.tick();assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,createCount);
  const settled=await finish(one.body.taskId);assert.equal(settled.status,"completed");const balance=await h.creditState("a");await Promise.all([task(one.body.taskId),task(one.body.taskId)]);assert.deepEqual(await h.creditState("a"),balance);
  assert.equal((await h.request("b","POST",`/api/video/tasks/${one.body.taskId}/cancel`)).status,404);
  const remote=await h.request<{taskId:string}>("a","POST","/api/video/generate",{...input,idempotencyKey:randomUUID()});
  await h.request("a","POST",`/api/video/tasks/${remote.body.taskId}/cancel`);await h.tick();assert.equal((await task(remote.body.taskId)).status,"cancelled");
  h.setScenario("cancel-unsupported");const unsupported=await h.request<{taskId:string}>("a","POST","/api/video/generate",{...input,idempotencyKey:randomUUID()});
  await h.request("a","POST",`/api/video/tasks/${unsupported.body.taskId}/cancel`);await h.tick();
  const completedUnsupported=await finish(unsupported.body.taskId);assert.equal(completedUnsupported.status,"completed");assert.equal(completedUnsupported.supplierCancellationSupported,false);assert.ok(completedUnsupported.cancellationRequestedAt);
  h.setScenario("success");
  h.setScenario("accepted-disconnect");
  const unknown=await h.request<{taskId:string}>("a","POST","/api/video/generate",{...input,idempotencyKey:randomUUID()});assert.equal(unknown.status,200);assert.equal((await task(unknown.body.taskId)).status,"needs_attention");
  const acceptedCount=h.supplierCalls().filter(call=>call.phase==="create").length;await h.restartApp();await h.tick();await h.tick();assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,acceptedCount);
  assert.equal((await task(unknown.body.taskId)).status,"needs_attention");
  assert.equal((await h.request("a","POST",`/api/video/tasks/${unknown.body.taskId}/retry`,{idempotencyKey:randomUUID()})).status,409);
  h.setScenario("rejected");const failed=await h.request<{taskId:string}>("a","POST","/api/video/generate",{...input,idempotencyKey:randomUUID()});assert.equal((await finish(failed.body.taskId)).status,"failed");
  h.setScenario("success");const retried=await h.request<{taskId:string}>("a","POST",`/api/video/tasks/${failed.body.taskId}/retry`,{idempotencyKey:randomUUID(),...await terms()});assert.equal(retried.status,202);assert.notEqual(retried.body.taskId,failed.body.taskId);assert.equal((await finish(retried.body.taskId)).status,"completed");
  const beforeByoc=await h.creditState("a"),byoc=await h.request<{taskId:string;cost:number}>("a","POST","/api/comfyui/run",{workflowId:h.byocWorkflowId,artworkId:h.refs.image.id,mediaType:"video",idempotencyKey:randomUUID(),seed:0,prompt:"自备工作流视频"});assert.equal(byoc.status,202);assert.equal(byoc.body.cost,0);
  const own=await h.taskPersistence("a",byoc.body.taskId);assert.equal(typeof own.parameters.byocSnapshot,"string");assert.equal(own.parameters.request.workflowManifest,undefined);assert.equal(own.parameters.request.apiKey,undefined);
  assert.equal((await finish(byoc.body.taskId)).status,"completed");assert.deepEqual(await h.creditState("a"),beforeByoc);
  process.stdout.write("VIDEO_TASKS=PASS concurrent_create_once=true complete_settles_once=true queued_cancel_never_submits=true unknown_creation_held=true full_retry=true byoc_durable_zero=true paid_calls=0\n");
}finally{await h.stop();}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
