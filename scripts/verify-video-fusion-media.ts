import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {readLimitedVideoResponse} from "../src/lib/video/result-download";
import type {MediaJobRequest,MediaJobOutput} from "../src/lib/video/media-job-schema";
import {inspectMediaBundle} from "../src/modules/media/bundle.mjs";
import type {ConfigSnapshot} from "../src/lib/billing/types";

type Job={id:string;status:string;outputs:MediaJobOutput[];queryResult:string|null;cost:number;billingVersion:number;processedSeconds:number};
async function main(){
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-b",randomUUID());await mkdir(evidence,{recursive:true});
  // Measure bytes, not supplier-declared allocation sizes; cancel and release on failures.
  const understated=new Response(new Uint8Array(17),{headers:{"content-type":"video/mp4","content-length":"1"}});
  assert.equal((await readLimitedVideoResponse(understated,20)).bytes.byteLength,17);
  let cancelled=false;const oversized=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(21));},cancel(){cancelled=true;}}),{headers:{"content-type":"video/mp4"}});
  await assert.rejects(()=>readLimitedVideoResponse(oversized,20));assert.equal(cancelled,true);assert.equal(oversized.body?.locked,false);
  await assert.rejects(()=>readLimitedVideoResponse(new Response("bad",{headers:{"content-type":"text/html"}})));
  const interrupted=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8));controller.error(new Error("fixture stream interrupted"));}}));await assert.rejects(()=>readLimitedVideoResponse(interrupted,20));assert.equal(interrupted.body?.locked,false);
  const h=await createVideoFixture({startWorker:false});
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
    const controlsOnly=process.argv.includes("--controls-only"),frameHashes:string[]=[],bundleEvidence:unknown[]=[];let trimDuration:number|null=null;
    if(!controlsOnly){
    for(const timestamp of ["first",1.25,"last"] as const){const started=await start({action:"frame",timestamp}),job=await wait(started.id);assert.equal(job.outputs.length,1);const probe=await probeOutput(job.outputs[0]);assert.equal(probe.streams[0].width,1280);assert.equal(probe.streams[0].codec_name,"png");frameHashes.push(job.outputs[0].sha256);}
    assert.equal(new Set(frameHashes).size,3);
    const trim=await start({action:"trim",start:1,end:3}),trimmed=await wait(trim.id),trimProbe=await probeOutput(trimmed.outputs[0]);assert.ok(Math.abs(Number(trimProbe.format.duration)-2)<0.12);assert.equal(trimProbe.streams.find(s=>s.codec_type==="video")?.codec_name,"h264");
    trimDuration=Number(trimProbe.format.duration);
    const separate=await start({action:"separate"}),separated=await wait(separate.id);assert.equal(separated.outputs.length,2);
    const video=separated.outputs.find(o=>o.mimeType.startsWith("video/"))!,audio=separated.outputs.find(o=>o.mimeType.startsWith("audio/"))!;
    assert.ok(!(await probeOutput(video)).streams.some(s=>s.codec_type==="audio"));assert.ok(Number((await probeOutput(audio)).format.duration)>3.9);
    const concat=await start({action:"concat",inputs:[h.refs.video.id,h.refs.video.id]}),concatenated=await wait(concat.id);assert.ok(Math.abs(Number((await probeOutput(concatenated.outputs[0])).format.duration)-8)<0.15);
    const multi=await start({action:"ffmpeg",outputs:["frame.png","copy.mp4"],args:["-i","asset:0","-map","0:v:0","-frames:v","1","-update","1","output:0","-map","0:v:0","-map","0:a:0","-c","copy","output:1"]}),multiple=await wait(multi.id);assert.equal(multiple.outputs.length,2);for(const output of multiple.outputs)await probeOutput(output);
    const probe=await start({action:"ffprobe",args:["-v","error","-show_streams","-show_format","-of","json","asset:0"]}),probed=await wait(probe.id);assert.equal(probed.outputs.length,0);assert.equal(JSON.parse(probed.queryResult!).streams.find((s:any)=>s.codec_type==="video").width,1280);
    const sequence=await start({action:"ffmpeg",inputs:[h.refs.image.id,h.refs.lastImage.id],outputs:["sequence.mp4"],args:["-framerate","2","-i","assets:png","-c:v","libx264","-pix_fmt","yuv420p","output:0"]});assert.ok(Math.abs(Number((await probeOutput((await wait(sequence.id)).outputs[0])).format.duration)-1)<0.12);
    const filter=await start({action:"ffmpeg",outputs:["filtered.mp4"],auxiliaryFiles:[{name:"filter.txt",encoding:"utf8",content:"drawbox=x=10:y=10:w=80:h=80:color=red:t=fill"}],args:["-i","asset:0","-filter_script:v","aux:0","-c:v","libx264","-c:a","aac","output:0"]});await probeOutput((await wait(filter.id)).outputs[0]);
    for(const format of ["hls","dash"] as const){
      const started=await start({action:"ffmpeg",outputs:[`package/manifest.${format==="hls"?"m3u8":"mpd"}`],args:["-i","asset:0","-c:v","libx264","-g","25","-sc_threshold","0","-c:a","aac",...(format==="hls"?["-hls_time","1","-hls_list_size","0","-hls_segment_type","fmp4"]:["-seg_duration","1"]),"-f",format,"output:0"]}),job=await wait(started.id);
      const packageDirectory=path.join(evidence,started.id);await mkdir(packageDirectory,{recursive:true});
      for(const output of job.outputs){const response=await h.request<ArrayBuffer>("a","GET",output.url);assert.equal(response.status,200);const bytes=Buffer.from(response.body);assert.equal(createHash("sha256").update(bytes).digest("hex"),output.sha256);const file=path.join(packageDirectory,output.name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);assert.equal((await h.request("b","GET",output.url)).status,404);}
      const entry=job.outputs.find(output=>output.name.endsWith(format==="hls"?".m3u8":".mpd"))!;assert.ok(entry.probe?.durationSeconds);const text=await readFile(path.join(packageDirectory,entry.name),"utf8");
      inspectMediaBundle(entry.name,text,job.outputs.map(output=>output.name));
      const independent=await new Promise<string>((resolve,reject)=>{const child=spawn("ffprobe",["-v","error","-show_streams","-show_format","-of","json",path.join(packageDirectory,entry.name)],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",chunk=>stdout+=chunk);child.stderr.on("data",chunk=>stderr+=chunk);child.once("error",reject);child.once("close",code=>code===0?resolve(stdout):reject(new Error(stderr)));});
      assert.ok(Number(JSON.parse(independent).format.duration)>3.9);bundleEvidence.push({format,files:job.outputs.length,independentProbe:true});
      const reused=await start({action:"trim",inputs:[`media-job:${job.id}:bundle:${entry.name}`],start:0.5,end:2.5});assert.ok(Math.abs(Number((await probeOutput((await wait(reused.id)).outputs[0])).format.duration)-2)<0.15);
      assert.equal((await h.request("b","POST","/api/video/media-jobs",{...reused.body,operationId:randomUUID()})).status,404);
    }
    for(const text of ['#EXTM3U\nhttp://127.0.0.1/private.ts','#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../private.key"\npart.ts','#EXTM3U\nmissing.ts'])assert.throws(()=>inspectMediaBundle("list.m3u8",text,["part.ts"]));
    assert.throws(()=>inspectMediaBundle("list.mpd",'<!DOCTYPE MPD [<!ENTITY x SYSTEM "file:///etc/passwd">]><MPD><BaseURL>&x;</BaseURL></MPD>',["part.m4s"]));
    const replay=await h.request<{job:Job}>("a","POST","/api/video/media-jobs",trim.body);assert.equal(replay.body.job.id,trim.id);assert.equal(await h.dbCount("app_video_media_jobs",{id:trim.id}),1);
    assert.equal((await h.request("b","GET",`/api/video/media-jobs/${trim.id}`)).status,404);
    assert.equal((await h.request("b","POST","/api/video/media-jobs",{...trim.body,operationId:randomUUID()})).status,404);
    for(const input of [{action:"frame",timestamp:99},{action:"trim",start:2,end:8},{action:"extract_audio",inputs:[h.refs.silentVideo.id]},{action:"ffmpeg",outputs:["copy.mp4"],args:["-i","/etc/passwd","output:0"]},{action:"ffmpeg",outputs:["copy.mp4"],args:["-i","http://127.0.0.1:3000/private","output:0"]}])assert.equal((await h.request("a","POST","/api/video/media-jobs",{operationId:randomUUID(),inputs:[h.refs.video.id],...input})).status,422);
    await writeFile(path.join(evidence,"basic-evidence.json"),JSON.stringify({owner:"canvas-video-fusion-20261013",sourceHash,frameHashes,trimDuration,bundleEvidence,basicMediaPassed:true}));
    }
    const queued=await start({action:"trim",start:0,end:3});assert.equal((await h.request<{job:Job}>("a","DELETE",`/api/video/media-jobs/${queued.id}`)).body.job.status,"cancelled");
    assert.equal(await h.mediaTemporaryExists(queued.id),false);
    assert.equal((await h.mediaWorkerRequest(queued.id,"POST",{action:"ffmpeg",inputs:[],outputs:[],args:["-version"]})).status,410);
    await h.restartMediaWorker();assert.equal((await h.mediaWorkerRequest(queued.id,"POST",{action:"ffmpeg",inputs:[],outputs:[],args:["-version"]})).status,410);
    const active=await start({action:"ffmpeg",outputs:["slow.mp4"],args:["-re","-stream_loop","-1","-i","asset:0","-t","120","-c","copy","output:0"]});
    const activeDeadline=Date.now()+30000;let runningJob:Job|undefined;
    while(Date.now()<activeDeadline){runningJob=(await h.request<{job:Job}>("a","GET",`/api/video/media-jobs/${active.id}`)).body.job;if(runningJob.status==="processing"&&runningJob.processedSeconds>0)break;assert.ok(!["failed","completed","cancelled"].includes(runningJob.status));await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(runningJob?.status,"processing");assert.ok(runningJob!.processedSeconds>0,"Cancellation must interrupt actual FFmpeg processing");
    await h.request("a","DELETE",`/api/video/media-jobs/${active.id}`);
    const cancelDeadline=Date.now()+15000;let cancelledJob:Job|undefined;
    while(Date.now()<cancelDeadline){cancelledJob=(await h.request<{job:Job}>("a","GET",`/api/video/media-jobs/${active.id}`)).body.job;if(cancelledJob.status==="cancelled")break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.equal(cancelledJob?.status,"cancelled");assert.equal(cancelledJob?.outputs.length,0);assert.equal(await h.mediaTemporaryExists(active.id),false);
    const setPrice=async(credits:number,enabled=true)=>{
      const current=await h.request<{snapshot:ConfigSnapshot}>("a","GET","/api/admin/billing");assert.equal(current.status,200);
      const config=structuredClone(current.body.snapshot.config),rule=config.features["video.process"];rule.enabled=enabled;rule.pricing={mode:"fixed",credits};rule.settlement.failureBps=0;rule.rules=[];
      const result=await h.request("a","POST","/api/admin/billing",{id:randomUUID(),expectedVersion:current.body.snapshot.version,config,reason:"Isolated media fee freeze verifier"});assert.equal(result.status,200,JSON.stringify(result.body));
      const price=await h.request<{quote:{credits:number;version:number}}>("a","GET","/api/video/media-jobs/quote?action=frame");assert.equal(price.status,200);return price.body.quote;
    };
    const paidBefore=await h.creditState("a"),price=await setPrice(3),paidBody={operationId:randomUUID(),action:"frame",timestamp:"first",inputs:[h.refs.video.id]};assert.equal(price.credits,3);
    assert.equal((await h.request("a","POST","/api/video/media-jobs",paidBody)).status,409);assert.deepEqual(await h.creditState("a"),paidBefore);
    const paid=await start({...paidBody,action:"frame",timestamp:"first",billingConfirmation:price});assert.equal(Number((await h.creditState("a")).credits_used),Number(paidBefore.credits_used)+3);
    await setPrice(7);await h.restartApp();const paidJob=await wait(paid.id);assert.equal(paidJob.cost,3);assert.equal(paidJob.billingVersion,price.version);
    assert.equal(Number((await h.creditState("a")).credits_total),Number(paidBefore.credits_total)-3);assert.equal(Number((await h.creditState("a")).credits_used),Number(paidBefore.credits_used));
    const settledState=await h.creditState("a");await Promise.all([wait(paid.id),wait(paid.id)]);assert.deepEqual(await h.creditState("a"),settledState);assert.equal(await h.dbCount("app_ledger",{id:`led-media-${paid.id}`}),1);
    assert.equal((await h.request<{job:Job}>("a","POST","/api/video/media-jobs",paid.body)).body.job.id,paid.id);
    const cancelPrice=await h.request<{quote:{version:number;credits:number}}>("a","GET","/api/video/media-jobs/quote?action=frame"),paidCancel=await start({action:"frame",timestamp:"first",billingConfirmation:cancelPrice.body.quote});await h.request("a","DELETE",`/api/video/media-jobs/${paidCancel.id}`);assert.deepEqual(await h.creditState("a"),settledState);
    assert.equal((await setPrice(0)).credits,0);assert.equal((await setPrice(99,false)).credits,0);
    await h.mediaWorkerMode("drain");const drained=await start({action:"frame",timestamp:"first"}),drainedView=await h.request<{job:Job}>("a","GET",`/api/video/media-jobs/${drained.id}`);assert.equal(drainedView.status,200);assert.equal(drainedView.body.job.status,"queued");assert.equal(await h.mediaTemporaryExists(drained.id),false);
    await h.mediaWorkerMode("resume");assert.equal((await wait(drained.id)).status,"completed");
    const after=await h.request<ArrayBuffer>("a","GET",h.refs.video.url);assert.equal(createHash("sha256").update(Buffer.from(after.body)).digest("hex"),sourceHash);
    assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
    await writeFile(path.join(evidence,"evidence.json"),JSON.stringify({owner:"canvas-video-fusion-20261013",sourceHash,frameHashes,trimDuration,bundleEvidence,groups:controlsOnly?["controls","billing"]:["basic","controls","billing"],activeCancellation:true,retirementSurvivesRestart:true,feeVersionFrozen:true,feeSettledOnce:true,independentProbe:!controlsOnly,linuxSandboxValidated:false}));
    console.log(`${controlsOnly?"VIDEO_MEDIA_CONTROLS":"VIDEO_MEDIA"}=PASS real_media=true actual_app_worker_db=true supplier_video_calls=0 linux_sandbox=separate_gate`);
  }finally{await h.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
