import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {chromium,expect} from "@playwright/test";
import {createVideoFixture} from "./video-fusion/harness";
import {createCanvasVideoTools} from "../src/lib/agent/canvas-video-tools";
import {AgentHarness,validateToolArguments} from "../src/lib/agent/harness";
import {describeNaumiTools} from "../src/lib/agent/naumi-tools";
import {assertInternalAgentPath} from "../src/lib/agent/harness-network";

const digest=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
const browserParts=["甲：第一镜头完整对白🥢。\n","乙：第二镜头也不能丢句。\n"];
let browserCalls=0,browserPlan:any;
async function main(){
  const h=await createVideoFixture({startWorker:false,referenceModels:true,agentReply:body=>{
    assert.equal(body.model,"wire-agent");assert.ok(JSON.stringify(body.messages.filter((m:any)=>m.role==="system")).includes("script_source.node_id"));
    browserCalls++;
    if(browserCalls===1)return {toolCalls:[{id:"browser-script-master",name:"plan_video_script",args:{title:"Browser原稿",content:browserParts.join("")}}]};
    if(browserCalls===2){
      const last=body.messages.filter((m:any)=>m.role==="tool").at(-1),raw=typeof last.content==="string"?last.content:last.content.map((p:any)=>p.text||"").join("");
      const marked=/\[UNTRUSTED_TOOL_RESULT\]\n([\s\S]*?)\n\[\/UNTRUSTED_TOOL_RESULT\]/.exec(raw),saved=JSON.parse(marked?JSON.parse(marked[1]):raw);
      assert.equal(saved.node.content,browserParts.join(""));
      return {toolCalls:[{id:"browser-script-story",name:"plan_video_storyboard",args:{mode:"independent",script_source:{node_id:saved.node.id},config:{modelId:"video-a",providerId:"managed-video",mode:"text",durationSeconds:4},shots:browserParts.map((part,i)=>({id:`browser-${i}`,title:`Browser镜头${i+1}`,prompt:`镜头${i+1}画面，逐字保留对白。`,durationSeconds:4,scriptStart:i?browserParts[0].length:0,scriptEnd:browserParts.slice(0,i+1).join("").length}))}}]};
    }
    if(browserCalls===3){const last=JSON.stringify(body.messages.filter((m:any)=>m.role==="tool").at(-1));assert.ok(last.includes("nodeIds"));return {text:"剧本与两段分镜已保存，尚未生成视频。"};}
    throw new Error("Unexpected scripted Agent request");
  }});
  const evidence=path.resolve("output/canvas-video-fusion-20261013/checkpoint-c",`script-${randomUUID()}`);
  let browser:any;
  try{
    await mkdir(evidence,{recursive:true});
    const projectKey=`tree:${h.refs.image.id}`,canvas={anchorId:h.refs.image.id,imageUrls:[],ratio:"16:9",resolution:"720p",quality:"high",video:{projectKey}};
    const tools=createCanvasVideoTools({actor:h.accounts.a,canvas,internal:async(api,signal,init={})=>{
      assertInternalAgentPath(api,init.method||"GET");const response=await fetch(h.baseUrl+api,{...init,signal,headers:{...Object.fromEntries(new Headers(init.headers)),cookie:h.cookies.a}}),body=await response.json();
      if(!response.ok)throw Object.assign(new Error(body.error),{status:response.status});return body;
    }});
    const invoke=async(name:string,args:any,callId:string=randomUUID())=>{const tool=tools.find(t=>t.name===name)!;validateToolArguments(tool.parameters,args);return (await tool.execute(callId,args)).details as any;};
    const texts=async()=>{const r=await h.request<any>("a","GET",`/api/video/texts?projectKey=${encodeURIComponent(projectKey)}`);assert.equal(r.status,200);return r.body.nodes;};
    const createCalls=()=>h.supplierCalls().filter(c=>c.phase==="create").length;
    const originalParts=["第一场，甲：每句话都要原样保留🥢。\n".repeat(70),"第二场，乙：包括逗号、换行与称呼。\n".repeat(70),"第三场，旁白：结尾也不能遗漏。\n".repeat(70)];
    const original=originalParts.join(""),beforeCredits=await h.creditState("a"),originalCall=randomUUID();
    const master=await invoke("plan_video_script",{title:"完整原稿",content:original},originalCall);assert.equal(master.node.content,original);
    assert.equal((await invoke("plan_video_script",{title:"完整原稿",content:original},originalCall)).node.id,master.node.id);
    const parallelBody={operationId:randomUUID(),projectKey,title:"并发原稿",content:"并发保存同一原稿。"},parallel=await Promise.all(Array.from({length:8},()=>h.request<any>("a","POST","/api/video/texts",parallelBody)));
    assert.ok(parallel.every(r=>r.status===200));assert.equal(new Set(parallel.map(r=>r.body.node.id)).size,1);
    assert.equal((await h.request("a","POST","/api/video/texts",{...parallelBody,content:"不可用同编号替换原稿"})).status,409);
    const edited={id:master.node.id,projectKey,title:"用户编辑版本",content:original+"用户手工追加。",status:"completed",canvasX:master.node.x,canvasY:master.node.y};
    assert.equal((await h.request("a","POST","/api/canvas/text-nodes",edited)).status,200);
    assert.equal((await invoke("plan_video_script",{title:"完整原稿",content:original},originalCall)).node.content,edited.content);
    const source=await invoke("plan_video_script",{title:"分镜制作原稿",content:original});
    const sourceHash=digest(original),initialTextCount=(await texts()).length;
    const first=await h.request<ArrayBuffer>("a","GET",h.refs.image.url),last=await h.request<ArrayBuffer>("a","GET",h.refs.lastImage.url);
    const firstPanel=await sharp(Buffer.from(first.body)).resize(640,360).png().toBuffer(),lastPanel=await sharp(Buffer.from(last.body)).resize(640,360).png().toBuffer();
    const mosaic=await sharp({create:{width:1280,height:360,channels:3,background:"white"}}).composite([{input:firstPanel,left:0,top:0},{input:lastPanel,left:640,top:0}]).png().toBuffer();
    await writeFile(path.join(evidence,"original-two-panel.png"),mosaic);
    const form=new FormData();form.append("image",new Blob([Uint8Array.from(mosaic)],{type:"image/png"}),"original-two-panel.png");form.append("title","原创两格分镜拼图");form.append("canvasGroupId",h.refs.image.id);form.append("x","600");form.append("y","400");
    const uploaded=await fetch(h.baseUrl+"/api/artworks/add",{method:"POST",headers:{cookie:h.cookies.a},body:form});assert.equal(uploaded.status,200);const image=await uploaded.json();
    const imageBefore=await h.request<ArrayBuffer>("a","GET",image.image),imageHash=digest(Buffer.from(imageBefore.body));
    const config={modelId:"video-reference",providerId:"managed-video",mode:"reference",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",generateAudio:false,watermark:false,providerOptions:{seed:0}};
    const inputs=[{id:"mosaic",nodeId:image.id,kind:"image",role:"reference",value:image.image}];
    let cursor=0;const shots=originalParts.map((part,i)=>{const start=cursor;cursor+=part.length;return {id:`scene-${i}`,title:`原稿镜头 ${i+1}`,prompt:`图片1是两格序列参考，遵循左至右面板正文，不渲染网格/编号。片段${i+1}只朗读自己的原文。`,durationSeconds:4,scriptStart:start,scriptEnd:cursor};});
    const args={mode:"independent",script_source:{node_id:source.node.id},config,inputs,shots};
    for(const broken of [shots.map((s,i)=>i===1?{...s,scriptStart:s.scriptStart+1}:s),shots.map((s,i)=>i===1?{...s,scriptStart:s.scriptStart-1}:s),shots.slice(0,2)]){
      await assert.rejects(()=>invoke("plan_video_storyboard",{...args,shots:broken}),/原文|覆盖/);assert.equal((await texts()).length,initialTextCount);
    }
    await assert.rejects(()=>invoke("plan_video_storyboard",{...args,inputs:[...inputs,{id:"whole",nodeId:source.node.id,kind:"text",role:"author",value:original}]}),/整份剧本/);
    const emoji=original.indexOf("🥢");assert.equal((await h.request("a","POST","/api/video/texts",{operationId:randomUUID(),projectKey,title:"错误字符边界",sourceNodeId:source.node.id,start:0,end:emoji+1})).status,422);
    assert.equal((await h.request("a","POST","/api/video/texts",{operationId:randomUUID(),projectKey,title:"伪造来源快照",sourceNodeId:source.node.id,start:0,end:10,expectedSourceSha256:"0".repeat(64)})).status,409);
    assert.equal((await h.request("b","POST","/api/video/texts",{operationId:randomUUID(),projectKey,title:"越权来源",sourceNodeId:source.node.id,start:0,end:10})).status,404);
    const csrf=await fetch(h.baseUrl+"/api/video/texts",{method:"POST",headers:{cookie:h.cookies.a,origin:"https://other.invalid","content-type":"application/json"},body:JSON.stringify(parallelBody)});assert.equal(csrf.status,403);
    const argumentSnapshot=JSON.stringify(args);const planned=await invoke("plan_video_storyboard",args,"script-contiguous-plan");assert.equal(JSON.stringify(args),argumentSnapshot);assert.equal(planned.nodes.length,3);
    assert.deepEqual(await h.creditState("a"),beforeCredits);assert.equal(createCalls(),0);
    for(let i=0;i<3;i++){const node=planned.nodes[i],author=node.inputs.find((r:any)=>r.kind==="text");assert.equal(author.role,"author");assert.equal(author.value,originalParts[i]);assert.notEqual(author.nodeId,source.node.id);assert.ok(node.config.prompt.includes(`[原文开始]\n${originalParts[i]}\n[原文结束]`));assert.equal(node.inputs[0].role,"reference");}
    assert.equal(planned.nodes.map((n:any)=>n.inputs.find((r:any)=>r.kind==="text").value).join(""),original);
    const replay=await invoke("plan_video_storyboard",args,"script-contiguous-plan");assert.deepEqual(replay.nodeIds,planned.nodeIds);
    const metadata=describeNaumiTools(tools),harness=new AgentHarness(h.accounts.a,"cv-script",()=>{});harness.configure(metadata);
    assert.equal(metadata.find(t=>t.name==="plan_video_script")?.write,true);
    harness.begin("只分析剧本，不要保存",()=>{});harness.check("plan_video_script",{title:"原稿",content:original});harness.finish();
    harness.begin("请保存剧本，不要生成视频",()=>{});harness.check("plan_video_script",{title:"原稿",content:original});harness.check("generate_video",{node_id:planned.nodes[0].id,expected_revision:1});harness.finish();
    const results=[];
    for(let i=0;i<3;i++){
      const node=planned.nodes[i],operation=randomUUID(),generated=await invoke("generate_video",{node_id:node.id,expected_revision:node.revision,operation_id:operation}),afterSubmit=await h.creditState("a");
      assert.equal((await invoke("generate_video",{node_id:node.id,expected_revision:node.revision,operation_id:operation})).taskId,generated.taskId);assert.deepEqual(await h.creditState("a"),afterSubmit);
      let task:any;const deadline=Date.now()+180000;while(Date.now()<deadline){await h.forceVideoPollDue(generated.taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${generated.taskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status));await new Promise(r=>setTimeout(r,250));}assert.equal(task.status,"completed");
      const frozen=await h.taskPersistence("a",task.id);assert.equal(frozen.parameters.request.orderedInputs.find((r:any)=>r.kind==="text").value,originalParts[i]);assert.equal(frozen.parameters.request.references[0].role,"reference");
      const wire:any=h.supplierCalls().filter(c=>c.phase==="create").at(-1);assert.ok(wire.body.content[0].text.includes(originalParts[i]));assert.ok(!wire.body.content[0].text.includes(originalParts[(i+1)%3]));assert.equal(wire.body.content[1].role,"reference_image");assert.equal(wire.body.generate_audio,false);assert.equal(wire.body.seed,0);results.push({taskId:task.id,nodeId:node.id,completed:true});
    }
    assert.equal(createCalls(),3);assert.equal(digest(Buffer.from((await h.request<ArrayBuffer>("a","GET",image.image)).body)),imageHash);assert.equal((await invoke("get_video_text",{node_id:source.node.id})).node.content,original);
    await h.restartApp();assert.equal((await invoke("plan_video_script",{title:"完整原稿",content:original},originalCall)).node.content,edited.content);
    for(const result of results)assert.equal((await invoke("get_video_config",{node_id:result.nodeId})).node.lastTaskId,result.taskId);
    const browserAnchor=`vnode-${randomUUID()}`,browserProject=`tree:${browserAnchor}`;
    assert.equal((await h.request("a","POST","/api/canvas/video-nodes",{id:browserAnchor,projectKey:browserProject,operationId:randomUUID(),expectedRevision:0,title:"Script browser project",config:{modelId:"video-a",providerId:"managed-video",mode:"text",durationSeconds:4},inputs:[]})).status,201);
    browser=await chromium.launch({headless:true,channel:"chrome"});const context=await browser.newContext({viewport:{width:1440,height:960}});
    await context.addCookies([{name:"nv_user",value:h.cookies.a.slice("nv_user=".length),url:h.baseUrl},{name:"naumi_locale",value:"zh",url:h.baseUrl}]);const page=await context.newPage(),errors:string[]=[];page.on("pageerror",(e:Error)=>errors.push(e.message));
    await page.goto(h.baseUrl+`/canvas?node=${h.refs.image.id}`,{waitUntil:"domcontentloaded",timeout:150000});
    const originalImage=page.locator(`.react-flow__node[data-id="${h.refs.image.id}"]`),originalText=page.locator(".react-flow__node").filter({hasText:"用户编辑版本"});
    await originalImage.waitFor({timeout:120000});await originalText.waitFor({timeout:120000});
    const imageBox=await originalImage.boundingBox(),textBox=await originalText.boundingBox();assert.ok(imageBox&&textBox);
    assert.ok(imageBox.x+imageBox.width<=textBox.x||textBox.x+textBox.width<=imageBox.x||imageBox.y+imageBox.height<=textBox.y||textBox.y+textBox.height<=imageBox.y,"New script must not cover the existing image");
    await page.goto(h.baseUrl+`/canvas?node=${browserAnchor}`,{waitUntil:"domcontentloaded",timeout:150000});await page.locator(`[data-id="${browserAnchor}"]`).getByTestId("canvas-video-node").waitFor({timeout:120000});
    const panel=page.getByTestId("canvas-assistant-panel");if(!await panel.isVisible())await page.getByTestId("canvas-agent-toggle").click();await panel.waitFor();
    await panel.getByTestId("canvas-assistant-input").fill("请保存剧本并规划视频分镜，只保存方案，不要生成视频。");await panel.getByRole("button",{name:"发送消息",exact:true}).click();
    await expect(panel).toContainText("剧本与两段分镜已保存，尚未生成视频。",{timeout:180000});
    const persisted=await h.request<any>("a","GET",`/api/video/texts?projectKey=${encodeURIComponent(browserProject)}`);assert.equal(persisted.body.nodes.length,3);browserPlan=persisted.body.nodes;
    await expect(page.locator(".react-flow__node").filter({hasText:"Browser原稿"})).toHaveCount(1);await expect(page.getByTestId("canvas-video-node")).toHaveCount(3);
    await expect(page.locator(".react-flow__node")).toHaveCount(6);await page.getByTestId("canvas-agent-toggle").click();await page.getByRole("button",{name:"适应视图",exact:true}).click();
    await expect.poll(async()=>page.evaluate(()=>{const area=document.querySelector(".react-flow")!.getBoundingClientRect();return Array.from(document.querySelectorAll(".react-flow__node")).every(node=>{const box=node.getBoundingClientRect();return box.left>=area.left&&box.right<=area.right&&box.top>=area.top&&box.bottom<=area.bottom;});}),{timeout:15000}).toBe(true);
    await page.screenshot({path:path.join(evidence,"script-browser.png"),fullPage:false});await page.reload();await expect(page.locator(".react-flow__node").filter({hasText:"Browser原稿"})).toHaveCount(1,{timeout:120000});
    assert.equal(browserCalls,3);assert.equal(createCalls(),3);assert.deepEqual(errors,[]);
    await writeFile(path.join(evidence,"result.json"),JSON.stringify({ok:true,actualAppDbRouterWorkerAndChrome:true,originalSourceSha256:sourceHash,mosaicSha256:imageHash,contiguousFullOriginal:true,formalFragmentAssets:true,noWholeScriptPerShot:true,invalidPlansHaveNoWrites:true,emojiBoundaryAndSourceRevision:true,concurrentReceiptAndEditedReplay:true,ownerAndCsrfIsolation:true,planningCharged:false,realArkRequests:results,appRestart:true,actualAgentTextEventsAndBrowserRefresh:true,existingImageNotCovered:true,allSixNodesInsideCanvas:true,browserScriptNodes:browserPlan.map((n:any)=>n.id),paidVideoApiCalls:0,scriptedTextSupplier:true,realLlmCreativeQualityUnverified:true},null,2));
    process.stdout.write(`VIDEO_SCRIPT_ASSETS=PASS ${evidence}\n`);
  }finally{await browser?.close();await h.stop();}
}
main().catch(error=>{process.stderr.write(`${error instanceof Error?error.stack:String(error)}\n`);process.exitCode=1;});
