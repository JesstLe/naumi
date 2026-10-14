import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {runByocAndMediaBrowser} from "./verify-video-fusion-media.mjs";
async function main(){const h=await createVideoFixture({videoProfile:"comfyui",startWorker:false}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`byoc-browser-${randomUUID()}`);try{
  const template={image:{class_type:"LoadImage",inputs:{image:"original.png"}},video:{class_type:"VHS_LoadVideo",inputs:{video:"original.mp4"}},audio:{class_type:"LoadAudio",inputs:{audio:"original.wav"}},encode:{class_type:"CLIPTextEncode",inputs:{text:"original"}},save:{class_type:"SaveVideo",inputs:{frames:["image",0],seed:99,width:640,height:360,length:16,generate_audio:true}}};
  assert.equal((await h.request("a","POST","/api/comfyui/workflows",{name:"Browser full BYOC",json:JSON.stringify(template)})).status,200);const catalog=await h.request<any>("a","GET","/api/video/byoc/catalog"),workflow=catalog.body.workflows.find((item:any)=>item.name==="Browser full BYOC");assert.ok(workflow);assert.doesNotMatch(JSON.stringify(catalog.body),/credentialRef|apiJson|baseUrl/);
  const id=`video-${randomUUID()}`,projectKey=`tree:${id}`,created=await h.request<any>("a","POST","/api/canvas/video-nodes",{id,projectKey,expectedRevision:0,operationId:randomUUID(),title:"Browser BYOC node",x:40,y:50,width:420,height:320,config:{modelId:"video-a",providerId:"managed-video",mode:"text",prompt:"完整BYOC原始说明。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(created.status,201);await mkdir(evidence,{recursive:true});
  const result=await runByocAndMediaBrowser(h,{nodeId:id,projectKey,workflowId:workflow.id,evidence});await writeFile(path.join(evidence,"result.json"),JSON.stringify({...result,actualChromeAppDbPrivateMediaAndWorker:true,paidVideoApiCalls:0,fullCheckpointCStillRequired:true},null,2));process.stdout.write(`VIDEO_BYOC_MEDIA_BROWSER=PASS ${evidence}\n`);
}finally{await h.stop();}}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
