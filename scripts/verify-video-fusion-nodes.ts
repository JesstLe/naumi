import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createVideoFixture} from "./video-fusion/harness";
import type {CanvasVideoNode} from "../src/lib/canvas/video-node-schema";
async function main(){

const h=await createVideoFixture({startWorker:false});
type Result={node:CanvasVideoNode};
try{
  const id=`video-${randomUUID()}`,projectKey=`tree:${id}`,operationId=randomUUID();
  const payload={id,projectKey,expectedRevision:0,operationId,title:"空白视频",config:{modelId:"video-a",prompt:"视频镜头",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",mode:"text"},inputs:[]};
  const created=await h.request<Result>("a","POST","/api/canvas/video-nodes",payload);assert.equal(created.status,201);assert.equal(created.body.node.revision,1);assert.equal(created.body.node.lastTaskId,null);
  const replay=await h.request<Result>("a","POST","/api/canvas/video-nodes",payload);assert.equal(replay.body.node.revision,1);
  assert.equal((await h.request("b","GET",`/api/canvas/video-nodes/${id}`)).status,404);
  assert.equal((await h.request("b","GET",`/api/canvas/video-nodes?projectKey=${encodeURIComponent(projectKey)}`)).status,404);
  const stale=await h.request("a","PATCH",`/api/canvas/video-nodes/${id}`,{expectedRevision:0,operationId:randomUUID(),title:"旧窗口"});assert.equal(stale.status,409);
  const moved=await h.request<Result>("a","PATCH",`/api/canvas/video-nodes/${id}`,{expectedRevision:1,operationId:randomUUID(),x:120,y:60});assert.equal(moved.body.node.revision,2);assert.equal(moved.body.node.config.prompt,"视频镜头");
  const tasksBefore=await h.dbCount("app_video_tasks"),billingBefore=await h.creditState("a");
  const invalidGenerate=await h.request("a","POST",`/api/canvas/video-nodes/${id}/generate`,{expectedRevision:1,idempotencyKey:randomUUID()});assert.equal(invalidGenerate.status,409,JSON.stringify(invalidGenerate.body));
  assert.equal(await h.dbCount("app_video_tasks"),tasksBefore);assert.deepEqual(await h.creditState("a"),billingBefore);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
  const copied=await h.request<{nodes:CanvasVideoNode[];idMap:Record<string,string>}>("a","POST","/api/canvas/video-nodes/copy",{ids:[id],projectKey:`tree:${h.refs.image.id}`,operationId:randomUUID()});assert.equal(copied.status,200);assert.equal(copied.body.nodes.length,1);assert.equal(copied.body.nodes[0].lastTaskId,null);
  const deleted=await h.request<Result>("a","PATCH",`/api/canvas/video-nodes/${id}`,{expectedRevision:2,operationId:randomUUID(),deleted:true});assert.equal(deleted.body.node.revision,3);
  assert.equal((await h.request("a","GET",`/api/canvas/video-nodes/${id}`)).status,404);
  const restored=await h.request<Result>("a","PATCH",`/api/canvas/video-nodes/${id}`,{expectedRevision:3,operationId:randomUUID(),deleted:false});assert.equal(restored.body.node.config.prompt,"视频镜头");
  const submission=await h.request<{taskId:string}>("a","POST",`/api/canvas/video-nodes/${id}/generate`,{expectedRevision:4,idempotencyKey:randomUUID()});assert.equal(submission.status,202);
  const current=await h.request<Result>("a","GET",`/api/canvas/video-nodes/${id}`);assert.equal(current.body.node.lastTaskId,submission.body.taskId);
  const countBefore=await h.dbCount("app_video_tasks"),stateBefore=await h.creditState("a");
  const rollback=await h.checkNodeReservationRollback("a",submission.body.taskId);assert.equal(rollback.rolledBack,true);
  assert.equal(await h.dbCount("app_video_tasks"),countBefore);assert.deepEqual(await h.creditState("a"),stateBefore);
  const retained=await h.request<Result>("a","GET",`/api/canvas/video-nodes/${id}`);assert.equal(retained.body.node.lastTaskId,submission.body.taskId);
  const filtered=await h.request<{tasks:Array<{id:string}>}>("a","GET",`/api/video/tasks?projectKey=${encodeURIComponent(projectKey)}&nodeId=${id}`);assert.deepEqual(filtered.body.tasks.map(task=>task.id),[submission.body.taskId]);
  process.stdout.write("VIDEO_NODES=PASS empty_node_durable=true owner_isolated=true stale_reservation_rolls_back=true soft_restore=true paid_calls=0\n");
}finally{await h.stop();}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
