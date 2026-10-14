import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import type {PublicMediaJob,MediaJobOutput} from "../src/lib/video/media-job-schema";

async function main(){
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-d",`derived-media-${randomUUID()}`);
  await mkdir(evidence,{recursive:true});
  const h=await createVideoFixture({startWorker:false,videoProfile:"ark"});
  const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
  const artifacts:any[]=[];
  async function bytes(url:string){const result=await h.request<ArrayBuffer>("a","GET",url);assert.equal(result.status,200);return Buffer.from(result.body);}
  async function artwork(id:string){const result=await h.request<any>("a","GET",`/api/artworks/get?ids=${encodeURIComponent(id)}`);assert.equal(result.status,200);assert.equal(result.body.artworks.length,1);return result.body.artworks[0];}
  async function mediaWait(id:string){const until=Date.now()+180000;while(Date.now()<until){const result=await h.request<{job:PublicMediaJob}>("a","GET",`/api/video/media-jobs/${id}`);assert.equal(result.status,200);if(result.body.job.status==="completed")return result.body.job;assert.ok(!["failed","cancelled"].includes(result.body.job.status),JSON.stringify(result.body));await new Promise(resolve=>setTimeout(resolve,200));}throw Error("Media completion timeout");}
  async function videoWait(id:string){const until=Date.now()+180000;while(Date.now()<until){await h.forceVideoPollDue(id);await h.tick();const result=await h.request<any>("a","GET",`/api/video/tasks?id=${id}`);assert.equal(result.status,200);if(result.body.task.status==="completed")return result.body.task;assert.ok(!["failed","cancelled","needs_attention"].includes(result.body.task.status),JSON.stringify(result.body.task));await new Promise(resolve=>setTimeout(resolve,200));}throw Error("Video completion timeout");}
  async function probe(output:MediaJobOutput){
    const data=await bytes(output.url);assert.equal(hash(data),output.sha256);assert.equal((await h.request("b","GET",output.url)).status,404);
    const file=path.join(evidence,`${output.artworkId}-${path.basename(output.name)}`);await writeFile(file,data);
    const raw=await new Promise<string>((resolve,reject)=>{const child=spawn("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",chunk=>stdout+=chunk);child.stderr.on("data",chunk=>stderr+=chunk);child.once("error",reject);child.once("close",code=>code===0?resolve(stdout):reject(Error(stderr)));});
    return JSON.parse(raw);
  }
  try{
    const originalHash=hash(await bytes(h.refs.video.url)),id=`vnode-${randomUUID()}`,projectKey=`tree:${id}`;
    const created=await h.request<any>("a","POST","/api/canvas/video-nodes",{id,projectKey,expectedRevision:0,operationId:randomUUID(),config:{providerId:"managed-video",modelId:"video-a",mode:"text",prompt:"甲：完整原始画布视频。\n乙：末句必须保留。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(created.status,201);
    const quote=(await h.request<any>("a","POST","/api/billing/quote",{feature:"video.generate",quantity:1,modelId:"video-a",resolution:"720p"})).body;
    const billing={billingVersion:quote.version,billingCredits:quote.mode==="api-cost-plus"?quote.authorizedCredits:quote.credits};
    const generated=await h.request<any>("a","POST",`/api/canvas/video-nodes/${id}/generate`,{idempotencyKey:randomUUID(),expectedRevision:created.body.node.revision,...billing});assert.equal(generated.status,202,JSON.stringify(generated.body));const first=await videoWait(generated.body.taskId);
    const sourceArt=await artwork(first.resultAssets[0].artworkId),sourceHash=hash(await bytes(sourceArt.videoUrl)),sourceNode=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;
    const jobs:PublicMediaJob[]=[],receipts:any[]=[];
    for(const input of [{action:"frame",timestamp:"first"},{action:"frame",timestamp:1.25},{action:"frame",timestamp:"last"},{action:"trim",start:1,end:3},{action:"extract_audio"},{action:"separate"}]){
      const body={operationId:randomUUID(),inputs:[id],projectKey,source:"canvas",...input};const started=await h.request<any>("a","POST","/api/video/media-jobs",body);assert.equal(started.status,202,JSON.stringify(started.body));const job=await mediaWait(started.body.jobId);assert.deepEqual(job.inputArtworkIds,[sourceArt.id]);assert.equal(job.projectKey,projectKey);assert.equal(job.source,"canvas");
      for(const output of job.outputs){const independent=await probe(output),art=await artwork(output.artworkId);assert.equal(art.parentId,sourceArt.id);assert.equal(art.groupId,id);assert.equal(art.creationProvenance.ref,job.id);assert.equal(art.creationProvenance.operation,"video-extract");artifacts.push({action:input.action,timestamp:"timestamp" in input?input.timestamp:undefined,artworkId:output.artworkId,sha256:output.sha256,parentId:art.parentId,groupId:art.groupId,probe:independent});}
      assert.equal((await h.request("b","GET",`/api/video/media-jobs/${job.id}`)).status,404);jobs.push(job);receipts.push(body);
    }
    assert.equal(new Set(jobs.slice(0,3).map(job=>job.outputs[0].sha256)).size,3);assert.ok(Math.abs(Number(artifacts.find(row=>row.action==="trim").probe.format.duration)-2)<0.12);
    const split=artifacts.filter(row=>row.action==="separate");assert.equal(split.length,2);assert.ok(split.some(row=>row.probe.streams.some((stream:any)=>stream.codec_type==="video")&&!row.probe.streams.some((stream:any)=>stream.codec_type==="audio")));assert.ok(split.some(row=>row.probe.streams.every((stream:any)=>stream.codec_type==="audio")));
    const before=await h.creditState("a"),count=await h.dbCount("app_video_media_jobs");
    for(const invalid of [{action:"frame",timestamp:4},{action:"frame",timestamp:4.01},{action:"trim",start:1,end:4.01},{action:"trim",start:3,end:1},{action:"extract_audio",inputs:[h.refs.silentVideo.id]},{action:"separate",inputs:[h.refs.silentVideo.id]}]){
      const response=await h.request<any>("a","POST","/api/video/media-jobs",{operationId:randomUUID(),inputs:[id],projectKey,source:"canvas",...invalid});assert.equal(response.status,422,JSON.stringify(response.body));if(invalid.inputs)assert.equal(response.body.code,"AUDIO_STREAM_UNAVAILABLE");
    }
    assert.equal(await h.dbCount("app_video_media_jobs"),count);assert.deepEqual(await h.creditState("a"),before);
    const frame=jobs[1].outputs[0],trim=jobs[3].outputs[0],audio=jobs[4].outputs[0],references=[{id:"derived-frame",kind:"image",role:"reference",artworkId:frame.artworkId,url:frame.url},{id:"derived-trim",kind:"video",role:"reference",artworkId:trim.artworkId,url:trim.url},{id:"derived-audio",kind:"audio",role:"reference",artworkId:audio.artworkId,url:audio.url}];
    const nextId=`vnode-${randomUUID()}`,next=await h.request<any>("a","POST","/api/canvas/video-nodes",{id:nextId,projectKey,expectedRevision:0,operationId:randomUUID(),config:{providerId:"managed-video",modelId:"video-a",mode:"reference",prompt:"复用原视频的当前帧、裁剪片段与音轨。\n保留完整末句。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:references.map(ref=>({id:ref.id,nodeId:ref.artworkId,kind:ref.kind,role:ref.role,value:ref.url}))});assert.equal(next.status,201);
    const operation={idempotencyKey:randomUUID(),expectedRevision:next.body.node.revision,...billing};
    await h.restartApp();
    const secondStart=await h.request<any>("a","POST",`/api/canvas/video-nodes/${nextId}/generate`,operation);assert.equal(secondStart.status,202,JSON.stringify(secondStart.body));const second=await videoWait(secondStart.body.taskId),frozen=await h.taskPersistence("a",second.id);
    assert.deepEqual(frozen.video_references.map((ref:any)=>ref.artworkId),references.map(ref=>ref.artworkId));assert.deepEqual(frozen.video_references.map((ref:any)=>ref.sha256),[frame.sha256,trim.sha256,audio.sha256]);
    const native=h.supplierCalls().filter(call=>call.phase==="create").at(-1)!.body.content;
    assert.deepEqual(native.map((item:any)=>item.type),["text","image_url","video_url","audio_url"]);
    for(const [index,output] of [frame,trim,audio].entries()){const item=native[index+1];assert.ok(new URL(item[item.type].url).pathname.endsWith(`/${output.storageKey}`));}
    const settled=await h.creditState("a");for(let index=0;index<jobs.length;index++){const replay=await h.request<any>("a","POST","/api/video/media-jobs",receipts[index]);assert.equal(replay.body.jobId,jobs[index].id);for(const output of jobs[index].outputs)assert.equal(hash(await bytes(output.url)),output.sha256);}
    const replay=await h.request<any>("a","POST",`/api/canvas/video-nodes/${nextId}/generate`,operation);assert.equal(replay.body.taskId,second.id);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,2);assert.deepEqual(await h.creditState("a"),settled);
    const persisted=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;assert.equal(persisted.lastTaskId,sourceNode.lastTaskId);assert.equal(persisted.lastResultId,sourceNode.lastResultId);assert.equal(hash(await bytes(sourceArt.videoUrl)),sourceHash);assert.equal(hash(await bytes(h.refs.video.url)),originalHash);
    await writeFile(path.join(evidence,"native-creates.json"),JSON.stringify(h.supplierCalls().filter(call=>call.phase==="create"),null,2));
    await writeFile(path.join(evidence,"result.json"),JSON.stringify({schemaVersion:1,ok:true,actualAppDbRouterMediaAndVideoWorkers:true,generatedCanvasSource:true,firstCurrentLastFramesDistinct:true,allDerivedSourceParentsProjectAndProvenance:true,independentFrameTrimAudioAndSplitProbes:true,invalidTimeAndSilentAudioRejectWithoutWritesOrFees:true,derivedFrameTrimAudioReferencedInNewCompletedVideo:true,frozenDerivedIdentitiesAndHashes:true,restartAndReplayNoExtraTasksFeesOrCreates:true,originalNodeAndMediaPreserved:true,artifacts,mediaJobs:jobs.map(job=>job.id),videoTasks:[first.id,second.id],paidVideoApiCalls:0,realVideoQualityValidated:false},null,2));
    process.stdout.write(`VIDEO_DERIVED_MEDIA=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
