import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createVideoFixture} from "./video-fusion/harness";
type Event={type:string;data:any};
async function main(){
  let call=0,chain:any,releaseReply:()=>void=()=>{};
  const finalReply=new Promise<void>(resolve=>{releaseReply=resolve;});
  const h=await createVideoFixture({startWorker:false,agentReply:async(body:any)=>{
    assert.equal(body.model,"wire-agent");assert.ok(body.tools.some((tool:any)=>tool.function.name==="run_video_workflow"));
    call++;
    if(call===1)return {toolCalls:[{id:"plan-fixture",name:"plan_video_storyboard",args:{mode:"independent",config:{modelId:"video-a",providerId:"fixture-video-provider",mode:"text",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},shots:[{id:"A",prompt:"甲：第一镜头完整对白。",durationSeconds:4},{id:"B",prompt:"乙：第二镜头完整对白。",durationSeconds:4,config:{mode:"extend"},dependsOn:["A"]}]}}]};
    if(call===2){const last=body.messages.filter((message:any)=>message.role==="tool").at(-1);const content=typeof last?.content==="string"?last.content:last.content.map((part:any)=>part.text||"").join("");const marked=/\[UNTRUSTED_TOOL_RESULT\]\n([\s\S]*?)\n\[\/UNTRUSTED_TOOL_RESULT\]/.exec(content);const planned=JSON.parse(marked?JSON.parse(marked[1]):content);assert.equal(planned.nodes.length,2);chain={operation_id:planned.suggestedRunId,nodes:planned.nodes.map((node:any)=>({id:node.id,revision:node.revision}))};return {toolCalls:[{id:"run-unconfirmed",name:"run_video_workflow",args:{...chain,confirm:true}}]};}
    const latest=body.messages.filter((message:any)=>message.role==="user").at(-1)?.content;
    if(call===3){assert.ok(JSON.stringify(latest).includes("确认"));return {toolCalls:[{id:"run-confirmed",name:"run_video_workflow",args:{...chain,confirm:true}}]};}
    if(call===4){await finalReply;return {text:"制作链已提交，请按持久任务查询。"};}
    throw new Error("Unexpected extra Agent request");
  }});
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`agent-sse-${randomUUID()}`);
  try{
    const projectKey=`tree:${h.refs.image.id}`,sessionId=`sse-fixture-${randomUUID()}`,message="请制作两个视频分镜并执行连续制作链，完整保留每句对白，先按实际模型能力保存镜头。";
    // Compile internal node routes before a live Agent session: Next dev HMR otherwise
    // reloads the session module on its first internal POST. Production is checked in D.
    assert.equal((await h.request("a","GET",`/api/canvas/video-nodes?projectKey=${encodeURIComponent(projectKey)}`)).status,200);
    const stream=async(messages:{role:string;content:string}[],session:string,stopAtRun=false)=>{
      const abort=new AbortController(),events:Event[]=[],timeout=setTimeout(()=>abort.abort(),180000);
      const response=await fetch(h.baseUrl+"/api/canvas/assistant",{method:"POST",signal:abort.signal,headers:{cookie:h.cookies.a,"content-type":"application/json","x-naumi-billing-operation-id":randomUUID()},body:JSON.stringify({mode:"agent",modelId:"fixture-agent",anchorId:"",projectKey,sessionId:session,messages})});
      assert.equal(response.status,200,response.status===200?"":await response.text());assert.ok(response.headers.get("content-type")?.includes("text/event-stream"));
      const reader=response.body!.getReader(),decoder=new TextDecoder();let pending="",stopped=false;
      try{while(!stopped){const read=await reader.read();if(read.done)break;pending+=decoder.decode(read.value,{stream:true});let boundary:number;while((boundary=pending.indexOf("\n\n"))>=0){const frame=pending.slice(0,boundary);pending=pending.slice(boundary+2);const type=/^event: (.+)$/m.exec(frame)?.[1],data=/^data: (.+)$/m.exec(frame)?.[1];if(!type||!data)continue;const event={type,data:JSON.parse(data)};events.push(event);if(stopAtRun&&type==="tool_end"&&event.data.tool==="run_video_workflow"){assert.equal(event.data.isError,false,JSON.stringify(events));stopped=true;abort.abort();releaseReply();await reader.cancel().catch(()=>{});break;}}}}
      finally{clearTimeout(timeout);reader.releaseLock();}
      return {events,stopped};
    };
    const first=await stream([{role:"user",content:message}],sessionId);
    assert.ok(first.events.some(event=>event.type==="attention"&&event.data.kind==="waiting"),JSON.stringify(first.events));
    assert.ok(first.events.some(event=>event.type==="video_nodes"&&event.data.nodes.length===2));
    assert.equal(await h.dbCount("app_video_tasks"),0);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
    assert.ok(chain?.operation_id);const actualSession=first.events.find(event=>event.type==="open")!.data.sessionId;
    const second=await stream([{role:"user",content:message},{role:"assistant",content:first.events.find(event=>event.type==="final")?.data.reply||"请确认制作链报价。"},{role:"user",content:"确认"}],actualSession,true);
    assert.ok(second.stopped,"SSE was not closed after accepted chain");
    const submitted=await h.request<any>("a","GET",`/api/video/workflows/${chain.operation_id}`);assert.equal(submitted.status,200,JSON.stringify(submitted.body));assert.equal(submitted.body.run.nodes.filter((node:any)=>node.taskId).length,1);
    await h.restartApp();
    const until=Date.now()+180000;let run:any;
    while(Date.now()<until){const current=await h.request<any>("a","GET",`/api/video/workflows/${chain.operation_id}`);assert.equal(current.status,200);run=current.body.run;for(const node of run.nodes)if(node.taskId)await h.forceVideoPollDue(node.taskId);await h.tick();run=(await h.request<any>("a","GET",`/api/video/workflows/${chain.operation_id}`)).body.run;if(run.nodes.every((node:any)=>node.status==="completed"))break;assert.ok(!run.nodes.some((node:any)=>["blocked","needs_confirmation","needs_attention","cancelled"].includes(node.status)),JSON.stringify(run.nodes));await new Promise(resolve=>setTimeout(resolve,250));}
    assert.ok(run.nodes.every((node:any)=>node.status==="completed"),JSON.stringify(run.nodes));assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,2);assert.equal(await h.dbCount("app_video_tasks"),2);
    for(const node of run.nodes){const saved=await h.request<any>("a","GET",`/api/canvas/video-nodes/${node.id}`);assert.equal(saved.body.node.lastTaskId,node.taskId);assert.ok(saved.body.node.lastResultId);}
    assert.equal((await h.request("a","POST","/api/canvas/video-workflows",{id:chain.operation_id,projectKey,nodes:chain.nodes})).status,202);assert.equal(await h.dbCount("app_video_tasks"),2);
    const restored=await h.request<any>("a","GET",`/api/canvas/assistant?projectKey=${encodeURIComponent(projectKey)}&id=${actualSession}`);assert.equal(restored.status,200,JSON.stringify(restored.body));assert.ok(JSON.stringify(restored.body).includes("video_nodes"));
    await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,"result.json"),JSON.stringify({ok:true,actualAgentSseAndPiStreaming:true,isolatedScriptedTextSupplier:true,editableStoryboardEvents:true,modelSelfConfirmationBlocked:true,fullChainQuoteBeforeAnyVideoTask:true,humanConfirmationNextTurn:true,sseClosedAfterAcceptance:true,actualAppRestart:true,workerContinuedTwoDependentStages:true,originalNodeResults:true,originalOperationReplayNoNewTasks:true,restoredSessionVideoEvents:true,paidVideoApiCalls:0},null,2));process.stdout.write(`VIDEO_AGENT_SSE=PASS ${evidence}\n`);
  }finally{releaseReply();await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
