import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
import {runVideoAgentBrowser} from "./verify-video-fusion-agent.mjs";

async function main(){
  let call=0,chain:any,releaseReply:()=>void=()=>{};
  const finalReply=new Promise<void>(resolve=>{releaseReply=resolve;});
  const h=await createVideoFixture({startWorker:false,agentReply:async(body:any)=>{
    assert.equal(body.model,"wire-agent");assert.ok(body.tools.some((tool:any)=>tool.function.name==="run_video_workflow"));
    call++;
    if(call===1)return {toolCalls:[{id:"browser-plan",name:"plan_video_storyboard",args:{mode:"independent",config:{modelId:"video-a",providerId:"managed-video",mode:"text",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},shots:[{id:"A",prompt:"甲：浏览器第一镜头完整对白。",durationSeconds:4},{id:"B",prompt:"乙：浏览器第二镜头完整对白。",durationSeconds:4,config:{mode:"extend"},dependsOn:["A"]}]}}]};
    if(call===2){const last=body.messages.filter((message:any)=>message.role==="tool").at(-1);const content=typeof last?.content==="string"?last.content:last.content.map((part:any)=>part.text||"").join("");const marked=/\[UNTRUSTED_TOOL_RESULT\]\n([\s\S]*?)\n\[\/UNTRUSTED_TOOL_RESULT\]/.exec(content);const planned=JSON.parse(marked?JSON.parse(marked[1]):content);assert.equal(planned.nodes.length,2);chain={operation_id:planned.suggestedRunId,nodes:planned.nodes.map((node:any)=>({id:node.id,revision:node.revision}))};return {toolCalls:[{id:"browser-unconfirmed",name:"run_video_workflow",args:{...chain,confirm:true}}]};}
    if(call===3){assert.ok(JSON.stringify(body.messages.filter((message:any)=>message.role==="user").at(-1)?.content).includes("确认"));return {toolCalls:[{id:"browser-confirmed",name:"run_video_workflow",args:{...chain,confirm:true}}]};}
    if(call===4){await finalReply;return {text:"原画布制作链已提交。"};}
    throw new Error("Unexpected additional Agent supplier request");
  }});
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`agent-browser-${randomUUID()}`);
  try{
    const anchorId=`video-${randomUUID()}`,projectKey=`tree:${anchorId}`;
    const anchor=await h.request<any>("a","POST","/api/canvas/video-nodes",{id:anchorId,projectKey,expectedRevision:0,operationId:randomUUID(),title:"Browser Agent project",x:40,y:50,width:360,height:280,config:{modelId:"video-a",providerId:"managed-video",mode:"text",prompt:"Browser Agent anchor",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},inputs:[]});assert.equal(anchor.status,201,JSON.stringify(anchor.body));
    await mkdir(evidence,{recursive:true});
    const result=await runVideoAgentBrowser(h,{anchorId,projectKey,evidence,getChain:()=>chain,releaseReply});
    await writeFile(path.join(evidence,"result.json"),JSON.stringify({...result,actualAgentRequests:call,isolatedScriptedTextSupplier:true,paidVideoApiCalls:0,fullCheckpointCStillRequired:true},null,2));process.stdout.write(`VIDEO_AGENT_BROWSER=PASS ${evidence}\n`);
  }finally{releaseReply();await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
