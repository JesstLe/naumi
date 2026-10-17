import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {runVideoCanvasInteractions,runMacVideoCanvasShortcuts} from "./verify-video-fusion-canvas-interactions.mjs";

async function main(){const h=await createVideoFixture({startWorker:false}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`canvas-interactions-${randomUUID()}`);try{
  const create=async(title:string,actor:"a"|"b"="a")=>{const id=`video-${randomUUID()}`,response=await h.request<any>(actor,"POST","/api/canvas/video-nodes",{id,projectKey:`tree:${id}`,expectedRevision:0,operationId:randomUUID(),title,x:40,y:50,width:420,height:320,config:{modelId:"video-a",providerId:"managed-video",mode:actor==="a"?"single_image":"text",prompt:`${title}完整对白。`,durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:actor==="a"?[{id:`input-${randomUUID()}`,nodeId:h.refs.image.id,kind:"image",role:"first_frame",value:h.refs.image.url}]:[]});assert.equal(response.status,201,JSON.stringify(response.body));return response.body.node;};
  const source=await create("Source video project"),target=await create("Target video project"),foreign=await create("Other account project","b");await mkdir(evidence,{recursive:true});
  const profile=process.argv.find(value=>value.startsWith("--profiles="))?.slice(11);if(profile&&profile!=="mac-shortcuts")throw new Error("Unknown interaction profile");
  const result=profile?await runMacVideoCanvasShortcuts(h,{source,target,evidence}):await runVideoCanvasInteractions(h,{source,target,foreign,evidence});assert.equal(await h.dbCount("app_video_tasks"),0);assert.equal(h.supplierCalls().filter(call=>call.phase==="create"||call.phase==="image-create").length,0);
  await writeFile(path.join(evidence,"result.json"),JSON.stringify({...result,actualAppDbAndChrome:true,noGenerationTasks:true,paidVideoApiCalls:0,fullCheckpointCStillRequired:true},null,2));process.stdout.write(`VIDEO_CANVAS_INTERACTIONS=PASS ${evidence}\n`);
}finally{await h.stop();}}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
