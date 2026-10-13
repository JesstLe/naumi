import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {readLimitedVideoResponse} from "../src/lib/video/result-download";
import type {MediaJobRequest,MediaJobOutput} from "../src/lib/video/media-job-schema";

type Job={id:string;status:string;outputs:MediaJobOutput[];queryResult:string|null};
async function main(){
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-b",randomUUID());await mkdir(evidence,{recursive:true});
  // Measure bytes, not supplier-declared allocation sizes; cancel and release on failures.
  const understated=new Response(new Uint8Array(17),{headers:{"content-type":"video/mp4","content-length":"1"}});
  assert.equal((await readLimitedVideoResponse(understated,20)).bytes.byteLength,17);
  let cancelled=false;const oversized=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(21));},cancel(){cancelled=true;}}),{headers:{"content-type":"video/mp4"}});
  await assert.rejects(()=>readLimitedVideoResponse(oversized,20));assert.equal(cancelled,true);assert.equal(oversized.body?.locked,false);
  await assert.rejects(()=>readLimitedVideoResponse(new Response("bad",{headers:{"content-type":"text/html"}})));
  const h=await createVideoFixture();
  const start=async(input:Partial<MediaJobRequest>)=>{
    const body={operationId:randomUUID(),inputs:[h.refs.video.id],...input};
    const response=await h.request<{jobId:string;job:Job}>("a","POST","/api/video/media-jobs",body);assert.equal(response.status,202,JSON.stringify(response.body));return {id:response.body.jobId,body};
  };
  const wait=async(id:string)=>{const deadline=Date.now()+180000;while(Date.now()<deadline){const result=await h.request<{job:Job}>("a","GET",`/api/video/media-jobs/${id}`);assert.equal(result.status,200,JSON.stringify(result.body));if(result.body.job.status==="completed")return result.body.job;
    assert.ok(!["failed","cancelled"].includes(result.body.job.status),JSON.stringify(result.body));await new Promise(resolve=>setTimeout(resolve,200));}throw new Error("Media fixture timed out");};
  const probeOutput=async(output:MediaJobOutput)=>{
    const response=await h.request<ArrayBuffer>("a","GET",output.url);assert.equal(response.status,200);const bytes=Buffer.from(response.body);assert.equal(createHash("sha256").update(bytes).digest("hex"),output.sha256);
    const filename=path.join(evidence,`${randomUUID()}-${path.basename(output.name)}`);await writeFile(filename,bytes);
    // Independent actual FFprobe, outside the worker's metadata implementation.
    const raw=await new Promise<string>((resolve,reject)=>{const child=spawn("ffprobe",["-v","error","-show_streams","-show_format","-of","json",filename],{windowsHide:true,env:{NODE_ENV:"test",PATH:process.env.PATH||process.env.Path,SystemRoot:process.env.SystemRoot},stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",chunk=>stdout+=chunk);child.stderr.on("data",chunk=>stderr+=chunk);child.on("error",reject);child.on("close",code=>code===0?resolve(stdout):reject(new Error(stderr)));});
    return JSON.parse(raw) as {streams:Array<{codec_type:string;codec_name:string;width?:number;height?:number}>;format:{duration:string}};
  };
  try{
    const before=await h.request<ArrayBuffer>("a","GET",h.refs.video.url),sourceHash=createHash("sha256").update(Buffer.from(before.body)).digest("hex");
    const frameHashes=[];
    for(const timestamp of ["first",1.25,"last"] as const){const started=await start({action:"frame",timestamp}),job=await wait(started.id);assert.equal(job.outputs.length,1);const probe=await probeOutput(job.outputs[0]);assert.equal(probe.streams[0].width,1280);assert.equal(probe.streams[0].codec_name,"png");frameHashes.push(job.outputs[0].sha256);}
    assert.equal(new Set(frameHashes).size,3);
    const trim=await start({action:"trim",start:1,end:3}),trimmed=await wait(trim.id),trimProbe=await probeOutput(trimmed.outputs[0]);assert.ok(Math.abs(Number(trimProbe.format.duration)-2)<0.12);assert.equal(trimProbe.streams.find(s=>s.codec_type==="video")?.codec_name,"h264");
    const separate=await start({action:"separate"}),separated=await wait(separate.id);assert.equal(separated.outputs.length,2);
    const video=separated.outputs.find(o=>o.mimeType.startsWith("video/"))!,audio=separated.outputs.find(o=>o.mimeType.startsWith("audio/"))!;
    assert.ok(!(await probeOutput(video)).streams.some(s=>s.codec_type==="audio"));assert.ok(Number((await probeOutput(audio)).format.duration)>3.9);
    const concat=await start({action:"concat",inputs:[h.refs.video.id,h.refs.video.id]}),concatenated=await wait(concat.id);assert.ok(Math.abs(Number((await probeOutput(concatenated.outputs[0])).format.duration)-8)<0.15);
    const multi=await start({action:"ffmpeg",outputs:["frame.png","copy.mp4"],args:["-i","asset:0","-map","0:v:0","-frames:v","1","-update","1","output:0","-map","0:v:0","-map","0:a:0","-c","copy","output:1"]}),multiple=await wait(multi.id);assert.equal(multiple.outputs.length,2);for(const output of multiple.outputs)await probeOutput(output);
    const probe=await start({action:"ffprobe",args:["-v","error","-show_streams","-show_format","-of","json","asset:0"]}),probed=await wait(probe.id);assert.equal(probed.outputs.length,0);assert.equal(JSON.parse(probed.queryResult!).streams.find((s:any)=>s.codec_type==="video").width,1280);
    const replay=await h.request<{job:Job}>("a","POST","/api/video/media-jobs",trim.body);assert.equal(replay.body.job.id,trim.id);assert.equal(await h.dbCount("app_video_media_jobs",{id:trim.id}),1);
    assert.equal((await h.request("b","GET",`/api/video/media-jobs/${trim.id}`)).status,404);
    assert.equal((await h.request("b","POST","/api/video/media-jobs",{...trim.body,operationId:randomUUID()})).status,404);
    for(const input of [{action:"frame",timestamp:99},{action:"trim",start:2,end:8},{action:"extract_audio",inputs:[h.refs.silentVideo.id]},{action:"ffmpeg",outputs:["copy.mp4"],args:["-i","/etc/passwd","output:0"]},{action:"ffmpeg",outputs:["copy.mp4"],args:["-i","http://127.0.0.1:3000/private","output:0"]}])assert.equal((await h.request("a","POST","/api/video/media-jobs",{operationId:randomUUID(),inputs:[h.refs.video.id],...input})).status,422);
    const queued=await start({action:"trim",start:0,end:3});assert.equal((await h.request<{job:Job}>("a","DELETE",`/api/video/media-jobs/${queued.id}`)).body.job.status,"cancelled");
    const after=await h.request<ArrayBuffer>("a","GET",h.refs.video.url);assert.equal(createHash("sha256").update(Buffer.from(after.body)).digest("hex"),sourceHash);
    assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
    await writeFile(path.join(evidence,"evidence.json"),JSON.stringify({owner:"canvas-video-fusion-20261013",sourceHash,frameHashes,trimDuration:Number(trimProbe.format.duration),independentProbe:true,linuxSandboxValidated:false}));
    console.log("VIDEO_MEDIA=PASS real_media=true actual_app_worker_db=true supplier_video_calls=0 linux_sandbox=separate_gate");
  }finally{await h.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
