import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 let f:any,email="",db:any,cookie="",digest="",childWrites=0,modelCalls=0,skillCalls=0,analysis=false,holdModel=false,textOnly=false;
 const calls:any[]=[], png=await readFile("public/demos/suite-demo/suppl-src.png");
 const fixtureMedia="output/canvas-agent-execution/media";await mkdir(fixtureMedia,{recursive:true});await writeFile(fixtureMedia+"/anchor.png",png);
 Object.assign(process.env,{STORAGE_DRIVER:"local",MEDIA_DIR:fixtureMedia,NAUMI_MULTI_USER:"1",OPENAI_API_KEY:"fixture",AGENT_API_KEY:"fixture"});
 f=await createModelFixture(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const raw=Buffer.concat(chunks);
  const headers=Object.fromEntries(Object.entries(req.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(","):v||""]));
  const request=new Request(f.origin+req.url,{method:req.method,headers,...(!["GET","HEAD"].includes(req.method||"")?{body:raw}:{})});
  if(req.url?.startsWith("/media/")){res.setHeader("content-type","image/png");return res.end(png);}
  res.setHeader("content-type","application/json");
  const body=headers["content-type"]?.includes("json")&&raw.length?JSON.parse(raw.toString()):{};
  if(req.url==="/internal/config/state")return res.end(JSON.stringify({digest}));
  if(req.url==="/internal/config/prepare")return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
  if(req.url==="/internal/config/activate"){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}
  if(req.url?.startsWith("/internal/config/publications/")){res.statusCode=404;return res.end("{}");}
  if(req.url?.startsWith("/api/generate-image")){
   if(req.method==="GET")return res.end(JSON.stringify({status:"done",images:[{id:"result-one",url:"/media/result.png"}]}));
   const form=await request.clone().formData();childWrites++;assert.equal(form.get("origin"),"canvas");assert.equal(form.get("parentId"),"anchor");assert.equal(form.get("model"),"image-a");assert.equal(form.getAll("image").length,1);assert.match(String(form.get("prompt")),/#0000FF/);
   const {withBillingRequest,configuredToolCost}=await import("../src/lib/billing/synchronous"),{withBiRequest}=await import("../src/lib/bi/model-observer");
   const response=await withBillingRequest(request,"canvas.image",()=>withBiRequest(request,async()=>{await configuredToolCost();await db.addArtworks(email,[{id:"result-one",title:"蓝色商品",category:"main",prompt:"mock result",status:"completed",image:"/media/result.png",gradient:""}],"fixture-output");return Response.json({ok:true,url:"/media/result.png"});}));
   assert.equal(response.status,200,await response.clone().text());return res.end(JSON.stringify({jobId:"fixture-image-job"}));
  }
  if(req.url?.endsWith("/chat/completions")){
   modelCalls++;calls.push(body);assert.equal(body.model,"wire-text");assert.ok(body.tools.some((tool:any)=>tool.function.name==="recolor_product"));assert.equal(body.messages.some((m:any)=>Array.isArray(m.content)&&m.content.some((p:any)=>p.type==="image_url")),!textOnly);assert.ok(!JSON.stringify(body.messages).includes("本次任务的输出必须是纯文字"));if(JSON.stringify(body.messages).includes("【图像创作 Skill】")){assert.ok(JSON.stringify(body.messages).includes("Skill 蓝色换色流程"));skillCalls++;}
   const toolDone=body.messages.some((message:any)=>message.role==="tool"),frame=(delta:any,finish_reason:any=null)=>"data: "+JSON.stringify({id:"fixture-completion",object:"chat.completion.chunk",created:1,model:body.model,choices:[{index:0,delta,finish_reason}]})+"\n\n";
   res.setHeader("content-type","text/event-stream");res.write(frame({role:"assistant"}));if(holdModel){res.on("close",()=>undefined);return;}
   if(analysis||toolDone){res.write(frame({content:textOnly?"纯文本对话已完成，不需要绑定图片。":analysis?"图片以植物绿色为主。":"已完成换色，结果已放回画布。"}));res.write(frame({},"stop"));}
   else{res.write(frame({tool_calls:[{index:0,id:"call-recolor",type:"function",function:{name:"recolor_product",arguments:JSON.stringify({image_url:f.origin+"/media/anchor.png",color:"#0000FF",strength:100})}}]}));res.write(frame({},"tool_calls"));}
   return res.end("data: [DONE]\n\n");
  }
  res.statusCode=404;res.end("{}");
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-long-router-secret-canvas-agent",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-long-envelope-secret-canvas-agent",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,INTERNAL_APP_ORIGIN:f.origin});
 db=await import("../src/lib/db");
 try{
  const cred=await f.credentials.importPlain({providerId:"text",plain:"fixture-text",actor:"fixture"});
  f.config.providers.push({...f.config.providers[0],id:"text",name:"text supplier",protocol:"openai-chat",credentialRef:cred.id});
  f.config.upstreamModels[0].capabilities.preserveIdentity=true;
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"text-upstream",providerId:"text",model:"wire-text",modality:"text",parameterMap:{},capabilities:{...f.config.upstreamModels[0].capabilities,vision:true}});
  f.config.publicModels[0].toolScope={features:["canvas.image"],systems:["canvas"],defaultFor:[]};
  f.config.publicModels.push({id:"text-family",label:"GPT-6 Astra",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"text-upstream"},toolScope:{features:["canvas.assistant"],defaultFor:[]}});
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels.at(-1)),id:"text-only-upstream",capabilities:{...f.config.upstreamModels.at(-1).capabilities,vision:false}});
  f.config.publicModels.push({...structuredClone(f.config.publicModels.at(-1)),id:"text-only",target:{type:"upstream",id:"text-only-upstream"}});
  Object.assign(f.config.bindings,{"agent.text":"text-family","text.generate":"text-family","vision.reference":"text-family"});(await import("../src/lib/model-config/schema")).validateModelConfig(f.config,{trustedOrigins:[f.origin]});await f.repo.current();await db.ensureSchema();
  email="canvas-agent-"+randomUUID()+"@example.test";await db.getOrCreateUser(email,"Canvas Agent fixture");
  const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),(tx:any)=>createBillingService().grantTx(tx,{id:randomUUID(),email,amount:100,source:"admin",reason:"fixture",expiry:{unit:"years",value:1},ledgerId:"fixture-fund",fingerprint:"fixture-fund",actor:"fixture"}));
  const {getBillingRuntime}=await import("../src/lib/billing/server"),billing=await getBillingRuntime(),original=await billing.config.current(),config=structuredClone(original.config);
  config.switches.metering="on";config.features["canvas.image"].pricing={mode:"fixed",credits:4};config.features["canvas.assistant"].pricing={mode:"fixed",credits:0};config.thresholds.agentConfirmCredits=7;
  const price=await billing.config.publish({id:randomUUID(),expectedVersion:original.version,config,actor:"fixture",reason:"Canvas Agent fixture"});
  await db.addArtworks(email,[{id:"anchor",title:"植物海报",category:"main",prompt:"植物商品",status:"completed",image:"/media/anchor.png",gradient:"",origin:"canvas",groupId:"fixture-project",canvasX:100,canvasY:200}],"fixture-anchor");
  cookie="nv_user="+(await import("../src/lib/native-auth")).signUserSession(email,Date.now());
  const imageSkill=await (await import("../src/lib/image-skills/server")).saveImageSkill(email,{name:"Skill 蓝色换色流程",description:"保留商品细节的蓝色换色",category:"电商",instructions:"确认商品和目标颜色。调用 recolor_product，把商品换成蓝色，保留结构和 Logo。复核真实输出后交付画布。"});
  const handler=(await import("../src/app/api/canvas/assistant/route")).POST;
  const task={skill:{id:imageSkill.id,revision:imageSkill.revision},mode:"agent",anchorId:"anchor",contextIds:["anchor"],sessionId:randomUUID(),turnId:randomUUID(),messages:[{role:"user",content:"把颜色统一替换为蓝色"}],imageModelId:"image-a",ratio:"1:1",resolution:"1K",quality:"medium"};
  const request=(payload:any,id:string)=>new Request(f.origin+"/api/canvas/assistant",{method:"POST",headers:{cookie,"content-type":"application/json","x-naumi-feature-model":textOnly?"text-only":"text-family","x-naumi-billing-operation-id":id,"x-naumi-billing-version":String(price.version),"x-naumi-billing-credits":"0"},body:JSON.stringify(payload)});
  const id=randomUUID(),response=await handler(request(task,id));assert.equal(response.status,200,await response.clone().text());const events=await response.text();assert.match(events,/event: tool_start/);assert.match(events,/event: artifacts/);assert.match(events,/result-one/);assert.match(events,/event: done/);assert.equal(childWrites,1);assert.equal(modelCalls,2);assert.equal(skillCalls,2);
  const output=(await db.listArtworksByIds(email,["result-one"]))[0];assert.equal(output.parentId,"anchor");assert.equal(output.groupId,"fixture-project");assert.equal(output.origin,"canvas");assert.ok(output.canvasX!>100);
  const countBefore=modelCalls,replay=await(await handler(request(task,id))).text();assert.match(replay,/replayed/);assert.match(replay,/result-one/);assert.equal(childWrites,1);assert.equal(modelCalls,countBefore);
  const lifecycle=await import("../src/app/api/canvas/assistant/route"),opened=events.match(/event: open\ndata: ([^\n]+)/);assert.ok(opened);const savedId=JSON.parse(opened[1]).sessionId;
  const historyRequest=(method="GET",id="",body?:any)=>new Request(f.origin+"/api/canvas/assistant?anchorId=anchor"+(id?"&id="+id:""),{method,headers:{cookie,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const listing=await(await lifecycle.GET(historyRequest())).json();assert.ok(listing.sessions.some((item:any)=>item.id===savedId));
  const saved=await(await lifecycle.GET(historyRequest("GET",savedId))).json();assert.ok(saved.session.turns.some((turn:any)=>turn.role==="assistant"&&turn.artifacts.some((art:any)=>art.id==="result-one")));
  const {removeRuntimeSession,getSession}=await import("../src/lib/agent/runtime");assert.equal(removeRuntimeSession(email,savedId),"removed");analysis=true;
  const resumed={...task,sessionId:savedId,turnId:randomUUID(),messages:[...saved.session.turns,{role:"user",content:"只分析图片，不要再生图"}]};assert.match(await(await handler(request(resumed,randomUUID()))).text(),/图片以植物绿色为主/);assert.equal(childWrites,1);
  const projectRequest=(method="GET",id="",body?:any)=>new Request(f.origin+"/api/canvas/assistant?projectKey=tree:fixture-project"+(id?"&id="+id:""),{method,headers:{cookie,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const projectList=await(await lifecycle.GET(projectRequest())).json();assert.ok(projectList.sessions.some((item:any)=>item.id===savedId&&item.anchorId==="anchor"));
  const byProject=await(await lifecycle.GET(projectRequest("GET",savedId))).json();assert.equal(byProject.session.anchorId,"anchor");assert.equal(byProject.session.status,"completed");
  const workbenchHistory=(await import("../src/app/api/agent/session/route"));const noCanvas=await(await workbenchHistory.GET(new Request(f.origin+"/api/agent/session",{headers:{cookie}}))).json();assert.ok(noCanvas.sessions.every((item:any)=>!item.id.startsWith("cv-")));
  const {canvasSessionPrefix}=await import("../src/lib/agent/canvas-history");const interruptedId=canvasSessionPrefix("anchor")+randomUUID();
  await db.saveAgentSession(email,interruptedId,"待恢复消息",[],[{type:"canvas_turn",anchorId:"anchor",message:"请保留中断前的用户消息",messageIndex:0}]);
  const interrupted=await(await lifecycle.GET(projectRequest("GET",interruptedId))).json();assert.equal(interrupted.session.status,"failed");assert.equal(interrupted.session.turns[0].content,"请保留中断前的用户消息");
  assert.equal((await lifecycle.GET(new Request(f.origin+"/api/canvas/assistant?projectKey=tree:other&id="+savedId,{headers:{cookie}}))).status,404);
  const secondId=canvasSessionPrefix("result-one")+randomUUID();await db.saveAgentSession(email,secondId,"第二节点历史",[{role:"user",content:"第二节点问题"},{role:"assistant",content:"第二节点回答"}],[{type:"canvas_turn",anchorId:"result-one",message:"第二节点问题",messageIndex:0},{type:"agent_end"},{type:"canvas_terminal",status:"completed"}]);
  const multi=await(await lifecycle.GET(projectRequest())).json();assert.ok(multi.sessions.some((item:any)=>item.id===secondId));assert.equal((await(await lifecycle.GET(projectRequest("GET",secondId))).json()).session.anchorId,"result-one");
  const canonicalId="ag-"+randomUUID();await db.saveAgentSession(email,canonicalId,"服务器会话",[{role:"user",content:"数据库用户消息"},{role:"assistant",content:"数据库完整回答"}],[{type:"tool_end",tool:"fixture",summary:"完整轨迹"}]);
  const clientSave=await workbenchHistory.POST(new Request(f.origin+"/api/agent/session",{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({id:canonicalId,messages:[{role:"user",content:"过期副本"}],steps:[]})}));assert.equal(clientSave.status,200);assert.equal((await db.getAgentSession(email,canonicalId)).messages[1].content,"数据库完整回答");
  process.env.AGENT_BASE_URL=f.origin+"/v1";const {getOrCreateSession}=await import("../src/lib/agent/runtime");const recoveredWorkbench=await getOrCreateSession(email,canonicalId,[],{cookie,authorization:""},"wire-text");assert.equal(recoveredWorkbench.agent.state.messages[1].role,"assistant");assert.equal(recoveredWorkbench.agent.state.messages.length,2);assert.ok(recoveredWorkbench.events.some((item:any)=>item.type==="tool_end"));assert.equal(removeRuntimeSession(email,canonicalId),"removed");
  assert.equal((await workbenchHistory.POST(new Request(f.origin+"/api/agent/session",{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({id:savedId,messages:[],steps:[]})}))).status,400);

  textOnly=true;
  const legacyText=await(await handler(request({...resumed,projectKey:"tree:fixture-project",anchorId:"",contextIds:[],turnId:randomUUID(),messages:[{role:"user",content:"移除参考图后继续文本对话"}]},randomUUID()))).text();assert.match(legacyText,/纯文本对话已完成/);assert.equal(JSON.parse(legacyText.match(/event: open\ndata: ([^\n]+)/)![1]).sessionId,savedId);textOnly=false;
  const continued=await(await lifecycle.GET(historyRequest("GET",savedId))).json();assert.ok(continued.session.turns.some((turn:any)=>turn.role==="assistant"&&turn.content.includes("已完成换色")));assert.ok(continued.session.turns.some((turn:any)=>turn.artifacts.some((art:any)=>art.id==="result-one")),JSON.stringify(continued.session));
  const runtime=getSession(email,savedId)!;runtime.canvasExecuting=true;assert.equal((await lifecycle.DELETE(historyRequest("DELETE",savedId))).status,409);assert.equal((await lifecycle.PATCH(historyRequest("PATCH",savedId,{title:"busy"}))).status,409);assert.equal(removeRuntimeSession(email,savedId),"running");runtime.canvasExecuting=false;
  assert.equal((await lifecycle.PATCH(historyRequest("PATCH",savedId,{title:"植物换色项目"}))).status,200);assert.equal((await(await lifecycle.GET(historyRequest("GET",savedId))).json()).session.title,"植物换色项目");
  const crossNode=new Request(f.origin+"/api/canvas/assistant?anchorId=not-owned&id="+savedId,{headers:{cookie}});assert.equal((await lifecycle.GET(crossNode)).status,404);
  assert.equal((await lifecycle.DELETE(historyRequest("DELETE",savedId))).status,200);assert.equal((await lifecycle.GET(historyRequest("GET",savedId))).status,404);assert.equal((await db.listArtworksByIds(email,["result-one"])).length,1);
  analysis=true;const discussion={...task,sessionId:randomUUID(),turnId:randomUUID(),messages:[{role:"user",content:"只分析图片，不要生图"}]};assert.match(await(await handler(request(discussion,randomUUID()))).text(),/图片以植物绿色为主/);assert.equal(childWrites,1);
  holdModel=true;const abortController=new AbortController(),cancelTask={...discussion,sessionId:randomUUID(),turnId:randomUUID()},cancelRequest=new Request(request(cancelTask,randomUUID()),{signal:abortController.signal});
  const cancelResponse=await handler(cancelRequest),cancelReader=cancelResponse.body!.getReader(),openChunk=await cancelReader.read(),cancelId=JSON.parse(new TextDecoder().decode(openChunk.value).match(/data: ([^\n]+)/)![1]).sessionId;
  assert.equal((await(await lifecycle.GET(historyRequest("GET",cancelId))).json()).session.running,true);assert.equal((await lifecycle.DELETE(historyRequest("DELETE",cancelId))).status,409);
  abortController.abort();while(!(await cancelReader.read()).done){};for(let i=0;i<30&&getSession(email,cancelId)?.canvasExecuting;i++)await new Promise(r=>setTimeout(r,100));
  const canceled=await(await lifecycle.GET(historyRequest("GET",cancelId))).json();assert.equal(canceled.session.running,false);assert.equal(canceled.session.status,"stopped");assert.match(canceled.session.error,/停止/);assert.equal(childWrites,1);holdModel=false;
  textOnly=true;
  const plain={...discussion,anchorId:"",contextIds:[],projectKey:"tree:fixture-project",sessionId:randomUUID(),turnId:randomUUID(),messages:[{role:"user",content:"帮我规划创作流程，只进行文本对话"}]};
  const plainStream=await(await handler(request(plain,randomUUID()))).text();assert.match(plainStream,/纯文本对话已完成/);assert.match(plainStream,/event: done/);assert.equal(childWrites,1);
  const plainId=JSON.parse(plainStream.match(/event: open\ndata: ([^\n]+)/)![1]).sessionId;
  const plainSaved=await(await lifecycle.GET(projectRequest("GET",plainId))).json();assert.equal(plainSaved.session.anchorId,"");assert.equal(plainSaved.session.status,"completed");assert.equal(plainSaved.session.turns.length,2);
  assert.ok((await(await lifecycle.GET(projectRequest())).json()).sessions.some((item:any)=>item.id===plainId));
  assert.equal((await lifecycle.GET(new Request(f.origin+"/api/canvas/assistant?projectKey=tree:other&id="+plainId,{headers:{cookie}}))).status,404);
  assert.equal(removeRuntimeSession(email,plainId),"removed");
  assert.match(await(await handler(request({...plain,sessionId:plainId,turnId:randomUUID(),messages:[{role:"user",content:"继续文本讨论"}]},randomUUID()))).text(),/纯文本对话已完成/);
  const plainResumed=await(await lifecycle.GET(projectRequest("GET",plainId))).json();assert.equal(plainResumed.session.turns.length,4);
  assert.equal((await lifecycle.PATCH(projectRequest("PATCH",plainId,{title:"纯文本历史"}))).status,200);
  assert.equal((await(await lifecycle.GET(projectRequest("GET",plainId))).json()).session.title,"纯文本历史");
  assert.equal((await handler(request({...plain,anchorId:"anchor"},randomUUID()))).status,400);
  holdModel=true;const plainAbort=new AbortController(),plainCancel=await handler(new Request(request({...plain,sessionId:randomUUID()},randomUUID()),{signal:plainAbort.signal}));
  const plainReader=plainCancel.body!.getReader(),plainOpen=await plainReader.read(),plainCancelId=JSON.parse(new TextDecoder().decode(plainOpen.value).match(/data: ([^\n]+)/)![1]).sessionId;
  plainAbort.abort();while(!(await plainReader.read()).done){};for(let i=0;i<30&&getSession(email,plainCancelId)?.canvasExecuting;i++)await new Promise(r=>setTimeout(r,100));
  assert.equal((await(await lifecycle.GET(projectRequest("GET",plainCancelId))).json()).session.status,"stopped");holdModel=false;
  assert.equal((await lifecycle.DELETE(projectRequest("DELETE",plainId))).status,200);assert.equal((await lifecycle.GET(projectRequest("GET",plainId))).status,404);
  const emptyProject="tree:empty-text-fixture";
  const emptyStream=await(await handler(request({...plain,projectKey:emptyProject,sessionId:randomUUID(),turnId:randomUUID()},randomUUID()))).text();assert.match(emptyStream,/event: done/);
  const emptyId=JSON.parse(emptyStream.match(/event: open\ndata: ([^\n]+)/)![1]).sessionId;
  const emptyRequest=(id="")=>new Request(f.origin+"/api/canvas/assistant?projectKey="+emptyProject+(id?"&id="+id:""),{headers:{cookie}});
  assert.ok((await(await lifecycle.GET(emptyRequest())).json()).sessions.some((item:any)=>item.id===emptyId));assert.equal((await(await lifecycle.GET(emptyRequest(emptyId))).json()).session.anchorId,"");
  await db.getOrCreateUser("other@example.test","Other isolated fixture");
  assert.equal((await lifecycle.GET(new Request(emptyRequest(emptyId),{headers:{cookie:"nv_user="+(await import("../src/lib/native-auth")).signUserSession("other@example.test",Date.now())}}))).status,404);
  // Canvas sessions must not crowd workbench history out before LIMIT is applied.
  await db.getPool().query("INSERT INTO app_agent_sessions(id,email,title,messages,steps) SELECT 'cv-crowd-'||i,$1,'crowd','[]'::jsonb,'[]'::jsonb FROM generate_series(1,55)i",[email]);
  const wbList=await(await workbenchHistory.GET(new Request(f.origin+"/api/agent/session",{headers:{cookie}}))).json();assert.ok(wbList.sessions.some((item:any)=>item.id===canonicalId));
  textOnly=false;
  console.log("TEXT_ONLY_NONVISION_MODEL=PASS TEXT_HISTORY_RESTART_RESUME_RENAME_DELETE=PASS TEXT_CANCEL=PASS OPTIONAL_IMAGE_CONTEXT=PASS EMPTY_CANVAS_TEXT_HISTORY=PASS WORKBENCH_LIMIT_ISOLATION=PASS");
  const forbidden=await handler(request({...task,sessionId:randomUUID(),anchorId:"not-owned"},randomUUID()));assert.equal(forbidden.status,404);
  const imageAsText=new Request(f.origin+"/api/canvas/assistant",{method:"POST",headers:{cookie,"content-type":"application/json","x-naumi-feature-model":"image-a"},body:JSON.stringify(task)});assert.ok([400,409].includes((await handler(imageAsText)).status));
  const charges=await db.getPool().query("SELECT quote,charged_credits FROM app_billing_operations WHERE email=$1 AND feature='canvas.image'",[email]);assert.equal(charges.rows.length,1);assert.equal(Number(charges.rows[0].charged_credits),4);
  const {agentBillingPrecheck}=await import("../src/lib/billing/agent"),session={email,id:randomUUID(),cred:{cookie,authorization:"",canvas:{anchorId:"anchor",imageUrls:[],imageModelId:"image-a",quality:"medium",ratio:"1:1",resolution:"1K"}}};
  const canvasSession={...session,turnId:"turn-one"};
  const expensive=structuredClone(config);expensive.thresholds.agentConfirmCredits=3;await billing.config.publish({id:randomUUID(),expectedVersion:price.version,config:expensive,actor:"fixture",reason:"confirmation fixture"});assert.equal((await agentBillingPrecheck(session,"recolor_product",{color:"#0000FF"},randomUUID()))?.block,true);
  assert.equal((await agentBillingPrecheck(canvasSession,"recolor_product",{color:"#0000FF",confirm:true},randomUUID()))?.block,true);assert.equal((await agentBillingPrecheck(canvasSession,"recolor_product",{color:"#0000FF",confirm:true},randomUUID()))?.block,true);canvasSession.turnId="turn-two";assert.equal(await agentBillingPrecheck(canvasSession,"recolor_product",{color:"#0000FF",confirm:true},randomUUID()),undefined);
  analysis=false; textOnly=false;
  const latestBilling=await billing.config.current(), confirmConfig=structuredClone(latestBilling.config);
  confirmConfig.thresholds.agentConfirmCredits=1;
  const confirmPrice=await billing.config.publish({id:randomUUID(),expectedVersion:latestBilling.version,config:confirmConfig,actor:"fixture",reason:"Orb confirmation lifecycle"});
  const confirmPayload={...task,sessionId:randomUUID(),turnId:randomUUID()}, confirmOperation=randomUUID();
  const confirmRequest=()=>{const req=request(confirmPayload,confirmOperation);const headers=new Headers(req.headers);headers.set("x-naumi-billing-version",String(confirmPrice.version));return new Request(req,{headers});};
  const writesBeforeConfirm=childWrites, confirmStream=await(await handler(confirmRequest())).text();
  assert.match(confirmStream,/event: attention\ndata: .*"kind":"waiting"/);assert.match(confirmStream,/等待下一条消息明确同意/);assert.match(confirmStream,/event: done/);assert.equal(childWrites,writesBeforeConfirm);
  const confirmId=JSON.parse(confirmStream.match(/event: open\ndata: ([^\n]+)/)![1]).sessionId;
  const confirmHistory=await(await lifecycle.GET(projectRequest("GET",confirmId))).json();assert.equal(confirmHistory.session.attention,"waiting");assert.equal(confirmHistory.session.status,"waiting");
  assert.ok(confirmHistory.session.turns.some((turn:any)=>turn.role==="assistant"&&turn.content.includes("等待下一条消息明确同意")));
  assert.equal(removeRuntimeSession(email,confirmId),"removed");
  const restartedConfirmHistory=await(await lifecycle.GET(projectRequest("GET",confirmId))).json();assert.equal(restartedConfirmHistory.session.attention,"waiting");assert.equal(restartedConfirmHistory.session.status,"waiting");assert.deepEqual(restartedConfirmHistory.session.turns,confirmHistory.session.turns);
  const callsBeforeReplay=modelCalls,confirmReplay=await(await handler(confirmRequest())).text();assert.match(confirmReplay,/event: attention/);assert.match(confirmReplay, /"kind":"waiting"/);assert.equal(modelCalls,callsBeforeReplay);assert.equal(childWrites,writesBeforeConfirm);
  console.log("ORB_ATTENTION_LIFECYCLE=PASS REAL_BILLING_GATE=WAITING EMPTY_FINAL_QUOTE=VISIBLE HISTORY=WAITING REPLAY=WAITING BLOCKED_TOOL_WRITES=0 PAID_UPSTREAM_CALLS=0");
  console.log("PROJECT_HISTORY_WITHOUT_SELECTION=PASS PENDING_USER_RECOVERY=PASS WORKBENCH_HISTORY_ISOLATION=PASS CANVAS_TERMINAL_STATUS=PASS MULTI_NODE_PROJECT_HISTORY=PASS SERVER_OWNED_HISTORY=PASS WORKBENCH_RESTART_RESTORE=PASS");
  console.log("IMAGE_SKILL_PROVIDER_REQUEST=PASS SKILL_CALLS="+skillCalls);
  console.log("CANVAS_AGENT_EXECUTION=PASS REAL_RUNTIME_TOOLS=PASS OWNED_REFERENCES=PASS CANVAS_MODEL_SCOPE=PASS OUTPUT_PARENT_PROJECT_POSITION=PASS REPLAY_NO_DUPLICATE=PASS ANALYSIS_NO_IMAGE=PASS MODALITY_GUARD=PASS BILLING_ONCE_4=PASS CONFIRMATION=PASS PERSISTED_HISTORY_RESTART_RESUME_RENAME_DELETE=PASS CANCEL_PERSISTENCE=PASS ACTIVE_HISTORY_GUARD=PASS SAME_TURN_SELF_CONFIRM_BLOCKED=PASS PAID_UPSTREAM_CALLS=0");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
