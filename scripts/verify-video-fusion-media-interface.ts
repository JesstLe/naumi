import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {mediaIntent,readMediaReceipt,writeMediaReceipt,clearMediaReceipt,clearTerminalMediaReceipts,type MediaJobIntent} from "../src/lib/video/media-client-intent";
import type {PublicMediaJob} from "../src/lib/video/media-job-schema";

class ReceiptStorage {
  private values=new Map<string,string>();get length(){return this.values.size;}key(index:number){return [...this.values.keys()][index]??null;}
  getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}
}
async function verifyReceipts(){
  const raw:MediaJobIntent={action:"ffmpeg",inputs:["own-video","own-image"],outputs:["movie.mp4"],args:["-i","asset:0","-c","copy","output:0"],source:"canvas",projectKey:"tree:own-root",auxiliaryFiles:[{name:"filter.txt",encoding:"utf8",content:"drawbox=x=0:y=0:w=8:h=8:color=red"}],auxiliaryOutputs:[]};
  const first=await mediaIntent(raw),reordered=await mediaIntent({...raw,inputs:[...raw.inputs],args:[...raw.args!]});assert.equal(first.fingerprint,reordered.fingerprint);
  assert.notEqual(first.fingerprint,(await mediaIntent({...raw,inputs:[...raw.inputs].reverse()})).fingerprint,"有序输入必须影响操作指纹");
  assert.notEqual(first.fingerprint,(await mediaIntent({...raw,projectKey:"tree:another-root"})).fingerprint,"项目必须参与操作指纹");
  assert.notEqual(first.fingerprint,(await mediaIntent({...raw,auxiliaryFiles:[{...raw.auxiliaryFiles[0],content:"drawbox=x=1:y=0:w=8:h=8:color=red"}]})).fingerprint,"辅助文件字节必须参与操作指纹");
  const storage=new ReceiptStorage(),old={fingerprint:first.fingerprint,operationId:randomUUID()},next={...old,operationId:randomUUID()};
  writeMediaReceipt(storage,"A@example.test",old);assert.equal(readMediaReceipt(storage,"a@example.test",old.fingerprint)?.operationId,old.operationId);assert.equal(readMediaReceipt(storage,"b@example.test",old.fingerprint),null);
  assert.ok(!storage.getItem(storage.key(0)!)!.includes("drawbox"),"本地回执不得包含辅助文件明文");
  writeMediaReceipt(storage,"a@example.test",next);clearMediaReceipt(storage,"a@example.test",old);assert.equal(readMediaReceipt(storage,"a@example.test",old.fingerprint)?.operationId,next.operationId,"旧请求终态不得删除新回执");
  writeMediaReceipt(storage,"b@example.test",old);clearTerminalMediaReceipts(storage,"a@example.test",old.operationId);assert.ok(readMediaReceipt(storage,"b@example.test",old.fingerprint));assert.ok(readMediaReceipt(storage,"a@example.test",old.fingerprint));
  clearTerminalMediaReceipts(storage,"a@example.test",next.operationId);assert.equal(readMediaReceipt(storage,"a@example.test",old.fingerprint),null);assert.ok(readMediaReceipt(storage,"b@example.test",old.fingerprint));
}
async function main(){
  await verifyReceipts();const h=await createVideoFixture({startWorker:false}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`media-interface-${randomUUID()}`);
  try{
    const projectKey=`tree:${h.refs.image.id}`,creditsBefore=await h.creditState("a"),source=await h.request<ArrayBuffer>("a","GET",h.refs.video.url),originalHash=createHash("sha256").update(Buffer.from(source.body)).digest("hex");assert.equal(source.status,200);
    for(const query of ["limit=NaN","limit=1.5","limit=0","limit=101","cursor=broken","operationId=bad","source=invalid"]){assert.equal((await h.request("a","GET",`/api/video/media-jobs?${query}`)).status,422,query);}
    await h.mediaWorkerMode("drain");
    const start=async(timestamp:"first"|"last")=>{const body={operationId:randomUUID(),action:"frame",timestamp,inputs:[h.refs.video.id],source:"canvas",projectKey};const response=await h.request<{job:PublicMediaJob}>("a","POST","/api/video/media-jobs",body);assert.equal(response.status,202,JSON.stringify(response.body));return {body,job:response.body.job};};
    const first=await start("first"),second=await start("last"),count=await h.dbCount("app_video_media_jobs");
    const page=await h.request<{jobs:PublicMediaJob[];nextCursor:{createdAt:string;id:string}}>("a","GET",`/api/video/media-jobs?limit=1&projectKey=${encodeURIComponent(projectKey)}`);assert.equal(page.status,200);assert.ok(page.headers.get("cache-control")?.includes("private"));assert.deepEqual(new Set(page.body.jobs.map(job=>job.id)),new Set([first.job.id,second.job.id]),"分页之外的实际 pending 必须仍可恢复");assert.ok(page.body.nextCursor);
    assert.equal(page.body.jobs[0].projectKey,projectKey);assert.deepEqual(page.body.jobs[0].inputArtworkIds,[h.refs.video.id]);assert.equal(page.body.jobs[0].source,"canvas");assert.equal(page.body.jobs[0].cost,0);
    for(const job of page.body.jobs)for(const field of ["request","inputs","args","auxiliaryFiles","auxiliary_files_enc"])assert.equal(field in job,false,field);
    const older=await h.request<{jobs:PublicMediaJob[];nextCursor:null}>("a","GET",`/api/video/media-jobs?limit=1&projectKey=${encodeURIComponent(projectKey)}&cursor=${encodeURIComponent(JSON.stringify(page.body.nextCursor))}`);assert.equal(older.status,200);assert.equal(older.body.jobs.length,1);assert.notEqual(older.body.jobs[0].id,page.body.jobs[0].id);assert.equal(older.body.nextCursor,null);
    const recovered=await h.request<{jobs:PublicMediaJob[]}>("a","GET",`/api/video/media-jobs?operationId=${first.body.operationId}`);assert.equal(recovered.body.jobs[0].id,first.job.id);assert.equal(recovered.body.jobs[0].operationId,first.body.operationId);
    assert.equal((await h.request<{jobs:PublicMediaJob[]}>("b","GET",`/api/video/media-jobs?operationId=${first.body.operationId}`)).body.jobs.length,0);assert.equal((await h.request("b","GET",`/api/video/media-jobs/${first.job.id}`)).status,404);
    const rejected=await fetch(`${h.baseUrl}/api/video/media-jobs`,{method:"POST",headers:{cookie:h.cookies.a,origin:"https://foreign.invalid","content-type":"application/json"},body:JSON.stringify({...first.body,operationId:randomUUID()})});assert.equal(rejected.status,403);
    const rejectedCancel=await fetch(`${h.baseUrl}/api/video/media-jobs/${first.job.id}`,{method:"DELETE",headers:{cookie:h.cookies.a,origin:"https://foreign.invalid"}});assert.equal(rejectedCancel.status,403);assert.equal(await h.dbCount("app_video_media_jobs"),count);
    const replay=await h.request<{job:PublicMediaJob}>("a","POST","/api/video/media-jobs",first.body);assert.equal(replay.body.job.id,first.job.id);assert.equal(await h.dbCount("app_video_media_jobs"),count);
    await h.restartApp();const restored=await h.request<{jobs:PublicMediaJob[]}>("a","GET",`/api/video/media-jobs?projectKey=${encodeURIComponent(projectKey)}`);assert.deepEqual(new Set(restored.body.jobs.map(job=>job.id)),new Set([first.job.id,second.job.id]));
    assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",{projectKey,operationId:randomUUID()})).status,200);await h.mediaWorkerMode("resume");
    const completed:PublicMediaJob[]=[];
    for(const job of [first.job,second.job]){const deadline=Date.now()+180000;while(true){const response=await h.request<{job:PublicMediaJob}>("a","GET",`/api/video/media-jobs/${job.id}`);assert.equal(response.status,200,JSON.stringify(response.body));if(response.body.job.status==="completed"){completed.push(response.body.job);break;}assert.ok(!["failed","cancelled"].includes(response.body.job.status),JSON.stringify(response.body));assert.ok(Date.now()<deadline,"持久媒体任务超时");await new Promise(resolve=>setTimeout(resolve,250));}}
    for(const job of completed){assert.equal(job.outputs.length,1);const art=await h.request<{artworks:{id:string;origin:string}[]}>("a","GET",`/api/artworks/get?ids=${job.outputs[0].artworkId}`);assert.equal(art.status,200);assert.equal(art.body.artworks[0].origin,"workbench","项目删除后的迟到结果必须只留历史");const bytes=await h.request<ArrayBuffer>("a","GET",job.outputs[0].url);assert.equal(bytes.status,200);assert.equal(createHash("sha256").update(Buffer.from(bytes.body)).digest("hex"),job.outputs[0].sha256);assert.equal((await h.request("b","GET",job.outputs[0].url)).status,404);}
    const after=await h.request<ArrayBuffer>("a","GET",h.refs.video.url);assert.equal(after.status,200);assert.equal(createHash("sha256").update(Buffer.from(after.body)).digest("hex"),originalHash);assert.deepEqual(await h.creditState("a"),creditsBefore);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
    await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,"result.json"),JSON.stringify({ok:true,receipts:true,historyPagination:true,pendingBeyondPage:true,actualAppRestart:true,accountIsolation:true,crossSiteMutationBlocked:true,operationReplay:true,lateDeletedProjectResults:"workbench",originalSha256:originalHash,supplierCalls:0,creditsUnchanged:true,jobIds:completed.map(job=>job.id)},null,2));process.stdout.write(`MEDIA_INTERFACE_APP=PASS ${evidence}\n`);
  }finally{await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
