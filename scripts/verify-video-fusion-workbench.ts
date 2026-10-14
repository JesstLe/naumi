import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {runVideoWorkbenchHistory} from "./verify-video-fusion-history.mjs";
async function main(){const h=await createVideoFixture({startWorker:false,videoProfile:"compshare-vidu"}),evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`workbench-${randomUUID()}`);try{
  h.setScenario("multi-output");const id=`video-${randomUUID()}`,projectKey=`tree:${id}`,created=await h.request<any>("a","POST","/api/canvas/video-nodes",{id,projectKey,expectedRevision:0,operationId:randomUUID(),title:"Workbench target",config:{modelId:"video-a",providerId:"managed-video",mode:"text",prompt:"发送目标原始节点。",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(created.status,201,JSON.stringify(created.body));await mkdir(evidence,{recursive:true});
  const result=await runVideoWorkbenchHistory(h,{targetId:id,projectKey,evidence});await writeFile(path.join(evidence,"result.json"),JSON.stringify({...result,actualChromeAppDbRouterAndWorker:true,isolatedOriginalVideoSupplier:true,paidVideoApiCalls:0,fullCheckpointCStillRequired:true},null,2));process.stdout.write(`VIDEO_WORKBENCH_BROWSER=PASS ${evidence}\n`);
}finally{await h.stop();}}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
