import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {runCanvasVideoBrowser} from "./verify-video-fusion-canvas.mjs";
async function main(){const h=await createVideoFixture({startWorker:false,uiModels:true}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`canvas-browser-${randomUUID()}`);try{
  const create=async(actor:"a"|"b",prompt:string)=>{const id=`video-${randomUUID()}`,response=await h.request<any>(actor,"POST","/api/canvas/video-nodes",{id,projectKey:`tree:${id}`,expectedRevision:0,operationId:randomUUID(),title:actor==="a"?"Browser video project":"Target readonly project",x:40,y:50,width:420,height:320,config:{modelId:"video-a",providerId:"managed-video",mode:"text",prompt,durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(response.status,201,JSON.stringify(response.body));return id;};
  const nodeId=await create("a","Browser initial prompt"),targetNodeId=await create("b","Target account original prompt");await mkdir(evidence,{recursive:true});
  const result=await runCanvasVideoBrowser(h,{nodeId,targetNodeId,evidence});await writeFile(path.join(evidence,"result.json"),JSON.stringify({...result,paidVideoApiCalls:0,agentBrowserAndRemainingCanvasCasesStillRequired:true},null,2));process.stdout.write(`VIDEO_CANVAS_BROWSER=PASS ${evidence}\n`);
}finally{await h.stop();}}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
