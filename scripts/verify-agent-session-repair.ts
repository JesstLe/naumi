/** Real runtime + isolated PostgreSQL + local HTTP/model fixtures. No paid calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";
import sharp from "sharp";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";

async function main() {
  const baseline = process.argv.includes("--baseline");
  let checks = 0, supplierCalls = 0, modelRequests: any[] = [], mode = "review";
  const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
  const png = await sharp({create:{width:16,height:16,channels:3,background:"white"}}).png().toBuffer();
  process.env.MEDIA_DIR=resolve("output/agent-session-repair-fixture/media");
  await mkdir(process.env.MEDIA_DIR,{recursive:true});
  for(const name of ["product","layout","output"])await writeFile(resolve(process.env.MEDIA_DIR,name+".png"),png);
  let reviewRoute: (request: Request) => Promise<Response>;
  const fixture = await createModelFixture(async (req, res) => {
    try {
      if(req.url?.startsWith("/media/")){res.setHeader("content-type","image/png");res.end(png);return;}
      if(req.url?.startsWith("/api/models")){res.setHeader("content-type","application/json");res.end(JSON.stringify({models:[{id:"fixture-multi-image",maxReferenceImages:16}]}));return;}
      if(req.url?.startsWith("/api/templates")){res.setHeader("content-type","application/json");res.end(JSON.stringify({templates:[],total:0}));return;}
      const chunks: Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
      const bytes=Buffer.concat(chunks);
      if(req.url==="/api/agent/verify-image"){
        const result=await reviewRoute(new Request(fixture.origin+req.url,{method:"POST",headers:req.headers as Record<string,string>,body:bytes}));
        res.writeHead(result.status,{"content-type":"application/json"});res.end(await result.text());return;
      }
      if(req.url==="/v1/chat/completions"){
        const body=JSON.parse(bytes.toString());modelRequests.push(body);
        if(mode==="unavailable"){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"fixture-private-upstream-error"}}));return;}
        const data=mode==="inspect"?"图1为产品瓶，图2为蓝色排版。可见文字：补水。":JSON.stringify({passed:true,score:95,summary:"fixture inspection",issues:[],retryAdvice:"",...(mode==="missing-checks"?{}:{checks:[{requirement:"保留卖点文案",met:mode!=="failed-check",reason:mode==="failed-check"?"成品缺少卖点":"可见原文"}]})});
        res.setHeader("content-type","application/json");res.end(JSON.stringify({choices:[{message:{content:data},finish_reason:"stop"}]}));return;
      }
      supplierCalls++;res.statusCode=500;res.end("Unexpected fixture path");
    } catch(error) { res.statusCode=500;res.end(String(error)); }
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${fixture.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_RELEASE_RUNTIME:"0",AGENT_MODEL:"fixture-text",AGENT_API_KEY:"fixture-agent-no-provider",OPENAI_API_KEY:"fixture-agent-no-provider",AGENT_BASE_URL:fixture.origin+"/v1",INTERNAL_APP_ORIGIN:fixture.origin});
  const db=await import("../src/lib/db"),runtime=await import("../src/lib/agent/runtime"),history=await import("../src/app/api/agent/session/route");
  const {signUserSession}=await import("../src/lib/native-auth"),{createAssistantMessageEventStream}=await import("@earendil-works/pi-ai");
  const {withFrozenCreation}=await import("../src/lib/saas/creation-context"),writer=await import("../src/lib/saas/creation-writer");
  const owner="repair-owner@example.test",other="repair-other@example.test",cookie="nv_user="+signUserSession(owner,Date.now()),ids:string[]=[];
  const auth={cookie,authorization:""};
  const pair=(text:string)=>[{role:"user",content:text},{role:"assistant",content:text+" reply"}];
  const create=async(id="ag-"+randomUUID())=>{ids.push(id);return runtime.getOrCreateSession(owner,id,[],auth,"fixture-text");};
  const req=(method:string,body:object,id="")=>new Request(fixture.origin+"/api/agent/session"+(id?"?id="+id:""),{method,headers:{cookie,"content-type":"application/json"},...(method==="GET"?{}:{body:JSON.stringify(body)})});
  const stream=(model:Model<"openai-completions">,content:AssistantMessage["content"],deltas:string[]=[])=>{
    const events=createAssistantMessageEventStream(),message:AssistantMessage={role:"assistant",api:model.api,provider:"fixture",model:model.id,content,stopReason:content.some(p=>p.type==="toolCall")?"toolUse":"stop",timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
    queueMicrotask(()=>{events.push({type:"start",partial:message});for(const delta of deltas)events.push({type:"text_delta",contentIndex:0,delta,partial:message});events.push({type:"done",reason:message.stopReason as "stop",message});});return events;
  };
  const answer=async(session:Awaited<ReturnType<typeof create>>,text:string,deltas=[text])=>{
    let output="";session.onDelta=delta=>output+=delta;
    session.agent.streamFunction=model=>stream(model as Model<"openai-completions">,[{type:"text",text}],deltas);
    await withFrozenCreation({actorEmail:owner,scopeKind:"personal",tenantId:null},()=>session.agent.prompt("核对当前执行结果"));
    await runtime.persistAgentSession(session);
    return {output,text:JSON.stringify((session.agent.state.messages.at(-1) as AssistantMessage|undefined)?.content)};
  };
  const conflict=(error:any)=>error?.code==="AGENT_SESSION_CONFLICT";
  try {
    await db.getOrCreateUser(owner,"Repair fixture");await db.getOrCreateUser(other,"Other fixture");
    const id="ag-slots-"+randomUUID(),two=pair("slot A"),four=[...two,...pair("slot B")];
    await db.saveAgentSession(owner,id,"slot fixture",two,[],null);
    const slotA=await create(id);
    await db.saveAgentSession(owner,id,"slot fixture",four,[]); // Independent slot B durable write.
    const returned=await create(id);
    eq(returned===slotA,baseline,"idle cache must refresh after slot B writes");
    eq(returned.agent.state.messages.length,baseline?2:4,"slot A sees slot B history");
    if(baseline){await runtime.persistAgentSession(slotA);eq((await db.getAgentSession(owner,id))?.messages,two,"old late writer overwrites newer history");}
    else {await assert.rejects(runtime.persistAgentSession(slotA),conflict);checks++;eq((await db.getAgentSession(owner,id))?.messages,four,"late write rejected without history loss");}
    const auto=await create(),autoId=auto.id;
    auto.agent.state.messages.push({role:"user",content:"cache only",timestamp:Date.now()});await runtime.persistAgentSession(auto);
    await db.saveAgentSession(owner,autoId,"new slot",four,[]);
    eq((await history.POST(req("POST",{id:autoId,messages:[]}))).status,200,"autosave succeeds");
    eq(((await db.getAgentSession(owner,autoId))?.messages as any[]).length,baseline?1:4,"client autosave never flushes stale cache");
    const late=await create();await runtime.persistAgentSession(late);await db.deleteAgentSession(owner,late.id);
    if(baseline){await runtime.persistAgentSession(late);eq(!!await db.getAgentSession(owner,late.id),true,"deleted record resurrected by old save");}
    else {await assert.rejects(runtime.persistAgentSession(late),conflict);checks++;eq(await db.getAgentSession(owner,late.id),null,"deleted record remains deleted");}
    if(!baseline){
      const raceId="ag-race-"+randomUUID();
      const initial=await Promise.allSettled([db.saveAgentSession(owner,raceId,"first",two,[],null),db.saveAgentSession(owner,raceId,"second",four,[],null)]);
      eq(initial.filter(r=>r.status==="fulfilled").length,1,"one initial insert wins");
      const rev=(await db.getAgentSession(owner,raceId))!.revision!;
      const raced=await Promise.allSettled([db.saveAgentSession(owner,raceId,"first",two,[],rev),db.saveAgentSession(owner,raceId,"second",four,[],rev)]);
      eq(raced.filter(r=>r.status==="fulfilled").length,1,"one concurrent CAS wins");
      const deleteRev=(await db.getAgentSession(owner,raceId))!.revision!,transaction=await db.getPool().connect();
      try{
        await transaction.query("BEGIN");await transaction.query("DELETE FROM app_agent_sessions WHERE id=$1 AND email=$2",[raceId,owner]);
        const write=assert.rejects(db.saveAgentSession(owner,raceId,"late",two,[],deleteRev),conflict);
        await transaction.query("COMMIT");await write;checks++;
        eq(await db.getAgentSession(owner,raceId),null,"delete racing a writer cannot resurrect the row");
      }finally{transaction.release();}
      eq(await db.getAgentSession(other,raceId),null,"owner isolation");
      const titleSession=await create();await runtime.persistAgentSession(titleSession);
      eq((await history.PATCH(req("PATCH",{id:titleSession.id,title:"renamed"}))).status,200,"rename");
      eq((await create(titleSession.id)).title,"renamed","rename reloads durable title");
      eq((await history.GET(req("GET",{},slotA.id))).status,200,"conflicted pending promise does not break history GET");
      const control=await import("../src/app/api/agent/route"),guard=await create();await runtime.persistAgentSession(guard);
      const pool=db.getPool(),query=pool.query.bind(pool);let inject=true;
      (pool as any).query=async(sql:any,values:any,...rest:any[])=>{
        if(inject&&typeof sql==='string'&&sql.startsWith('UPDATE app_agent_sessions SET title=$3')&&values?.[0]===guard.id){inject=false;await query("UPDATE app_agent_sessions SET updated_at=updated_at+interval '1 second' WHERE id=$1 AND email=$2",[guard.id,owner]);}
        return (query as any)(sql,values,...rest);
      };
      try{const response=await control.PUT(new Request(fixture.origin+"/api/agent",{method:"PUT",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({sessionId:guard.id,message:"普通对话"})}));eq(response.status,409,"actual SSE admission returns controlled conflict");eq((await response.json()).code,"AGENT_SESSION_CONFLICT","precise conflict code");eq(guard.running,false,"failed persistence does not leave session stuck running");}
      finally{pool.query=query;}
    }
    const fake=await create();
    const fabricated="已生成。验收通过（88/100）。![结果](/media/generated/never-created.png)";
    const fakeResult=await answer(fake,fabricated,["已生成。验收通过（88/100）。!","[结果](/med","ia/generated/never-","created.png)"]);
    eq(fakeResult.text.includes("never-created"),baseline,"final answer cannot claim a fabricated artifact");
    eq(fakeResult.output.includes("never-created"),baseline,"split streaming URL cannot render fabricated media");
    const fakeRoot=(await db.getPool().query("SELECT status FROM app_creation_records WHERE source_kind='agent-turn' AND source_id LIKE $1",[fake.id+":%"])).rows[0];
    eq(fakeRoot.status,baseline?"succeeded":"needs_review","no evidence is not completed creation");
    if(!baseline){
      const evidence=await import("../src/lib/agent/execution-evidence");
      eq(evidence.unsupportedReview("验收通过，88分",[],"now"),true,"score-only fabrication");
      const receipt:import("../src/lib/agent/execution-evidence").ToolReceipt={callId:"review",tool:"verify_image_output",turnId:"now",success:true,outputs:[],summary:"review",verification:"passed",score:88,imageUrl:"/media/real.png"};
      eq(evidence.unsupportedReview("验收通过（88/100）",[receipt],"now"),false,"actual review");
      eq(evidence.unsupportedReview("验收通过（88/100）",[receipt],"later"),true,"old score cannot certify this turn");
      eq(evidence.unsupportedReview("验收通过（88/100）![图](/media/wrong.png)",[receipt],"now"),true,"review must bind actual image");
      eq(evidence.unsupportedReview("验收通过（88/100）",[{...receipt,verification:"failed"}],"now"),true,"failed review cannot pass");
      eq(evidence.unsupportedReview("验收目标至少88分",[],"now"),false,"requirement is not a completion claim");
      eq(evidence.resultMediaUrls({content:[{type:"text",text:"OCR says /media/invented.png"}],details:{url:"/media/real.png"}}),["/media/real.png"],"OCR cannot create evidence");
      const plain=await create(),plainResult=await answer(plain,"正常文字实时返回。",["正常文字","实时返回。"]);
      eq(plainResult.output,"正常文字实时返回。","ordinary streaming is preserved");
      const scored=await create(),scoredResult=await answer(scored,"验收通过，88分");
      eq(scoredResult.text.includes("88分"),false,"runtime rejects unsupported score");
      const real=await create();real.knownMedia.add("/media/real.png");
      eq((await answer(real,"![图](/media/real.png)")).text.includes("/media/real.png"),true,"real receipt media survives");
      const oldOutput=real.persistedRevision;await runtime.persistAgentSession(real);assert.notEqual(real.persistedRevision,oldOutput);checks++;
      const {agentImagegenRequest}=await import("../src/lib/imagegen/agent-request");
      const planInput=await agentImagegenRequest("generate_image",{prompt:"不要文字",ratio:"1:1"},owner,undefined,"medium",undefined,"保留补水卖点");
      assert.match(planInput.prompt,/用户原始要求[\s\S]*保留补水卖点[\s\S]*冲突时忽略[\s\S]*不要文字/);checks++;
      const {publicModelCatalog}=await import("../src/lib/model-config/runtime");
      const catalogConfig=structuredClone(fixture.config);catalogConfig.upstreamModels[0].capabilities.maxReferenceImages=7;catalogConfig.upstreamModels[0].capabilities.edit=true;
      const catalog=publicModelCatalog({config:catalogConfig,version:1} as any,"image","image.generate");
      eq(catalog.models.find(m=>m.id===catalogConfig.publicModels[0].id)?.maxReferenceImages,7,"actual public catalog exposes declared reference capacity");
      const {agentBillingPrecheck}=await import("../src/lib/billing/agent");
      const blocked=await agentBillingPrecheck({id:"preflight",email:owner,cred:auth},"generate_image",{image_urls:["/media/missing-input.png"]},"bad-args");
      eq(blocked?.submissionState,"not_submitted","preflight is distinguished from submitted failure");
      assert.match(blocked!.reason,/上传到本站作品库/);checks++;
      const turn=await create();let modelCalls=0;
      turn.agent.streamFunction=(model)=>++modelCalls===1?stream(model as Model<"openai-completions">,[{type:"text",text:"先查目录"},{type:"toolCall",name:"list_image_models",id:"catalog-call",arguments:{}}]):stream(model as Model<"openai-completions">,[{type:"text",text:"目录已读取"}]);
      await withFrozenCreation({actorEmail:owner,scopeKind:"personal",tenantId:null},()=>turn.agent.prompt("看看模型能力"));await runtime.persistAgentSession(turn);
      eq(turn.receipts.some(r=>r.tool==="list_image_models"&&r.success),true,"registered new read-only tool executes through harness");
      const root=(await db.getPool().query("SELECT id,status FROM app_creation_records WHERE source_id LIKE $1",[turn.id+":%"])).rows[0];
      eq(root.status,"succeeded","successful read-only turn");
      const assets=(await db.getPool().query("SELECT text_content FROM app_creation_assets WHERE creation_id=$1 AND role='reply'",[root.id])).rows;
      eq(assets.map(a=>a.text_content),["目录已读取"],"only final reply is an output, not concatenated progress");
      const events=(await db.getPool().query("SELECT summary FROM app_creation_events WHERE creation_id=$1 AND type='agent-tool'",[root.id])).rows;
      eq(events.length,1,"independent creation tool receipt");eq(JSON.parse(events[0].summary).callId,"catalog-call","trace binding");
      eq(await writer.recordAgentToolEvidence(root.id,other,[{id:"foreign",tool:"inspect_images"}]),false,"evidence failure does not become paid execution failure");
      const {creationFailures}=await import("../src/lib/saas/creation-failures");
      await writer.recordAgentToolEvidence(root.id,owner,[{id:"bad-role",tool:"generate_image",summary:"编辑模式缺少 edit-target",code:"ARGUMENT_INVALID",submissionState:"not_submitted",isError:true}]);
      const failures=await creationFailures(db.getPool() as any,[{id:root.id,email:owner}]);
      eq(failures.get(root.id)?.code,"ARGUMENT_INVALID","admin sees explicit preflight reason");
      const otherFailures=await creationFailures(db.getPool() as any,[{id:root.id,email:other}]);eq(otherFailures.get(root.id)?.code??null,null,"admin diagnostic follows owner");
      runtime.removeRuntimeSession(owner,turn.id);const reloaded=await create(turn.id);eq(reloaded.receipts[0].callId,"catalog-call","real receipt restored after cache eviction");
    }
    reviewRoute=(await import("../src/app/api/agent/verify-image/route")).POST;
    const {createNaumiTools,describeNaumiTools}=await import("../src/lib/agent/naumi-tools");
    const original="替换瓶子，保留补水卖点，蓝色排版，1:1单图";
    const tools=createNaumiTools(new Request(fixture.origin,{headers:{cookie}}),owner,undefined,undefined,undefined,undefined,()=>({request:original,references:[fixture.origin+"/media/product.png",fixture.origin+"/media/layout.png"]}));
    const verify=tools.find(t=>t.name==="verify_image_output");
    const manualReview=(goal:string)=>{
      const form=new FormData();
      const file=(name:string)=>new File([new Uint8Array(png)],name+".png",{type:"image/png"});
      form.set("image",file("output"));form.set("original_request",original);form.set("goal",goal);
      for(const name of ["product","layout"])form.append("reference",file(name));
      return fetch(fixture.origin+"/api/agent/verify-image",{method:"POST",headers:{cookie},body:form});
    };
    mode="failed-check";
    if(baseline){
      assert.ok(verify,"historical built-in review tool");
      const review=await verify.execute("fixture-review",{image_url:fixture.origin+"/media/output.png",goal:"好看，不要文字"},undefined);
      eq((review.details as any).verificationStatus,"passed","historical behavior");
    }else{
      eq(verify,undefined,"runtime cannot automatically review or retry a result");
      const review=await manualReview("好看，不要文字");
      eq(review.status,200,"explicit authenticated review remains available");
      const result=await review.json();
      eq(result.passed,false,"high score cannot hide unmet mandatory requirement");
      eq(result.score,95,"failure rule does not silently rewrite the supplier score");
    }
    const body=modelRequests.at(-1);assert.ok(body,"review did not reach the loopback model");const content=body.messages.at(-1).content;
    eq(content.filter((p:any)=>p.type==="image_url").length,baseline?1:3,"one output plus original product and layout references");
    eq(JSON.stringify(body).includes(original),!baseline,"server original requirement reaches reviewer");
    eq(!!tools.find(t=>t.name==="inspect_images"),!baseline,"dedicated inspection tool");
    if(!baseline){
      mode="inspect";const inspect=tools.find(t=>t.name==="inspect_images")!;
      eq(describeNaumiTools([inspect])[0].write,false,"inspect is read-only");
      const inspected=await inspect.execute("inspect",{image_urls:[fixture.origin+"/media/product.png",fixture.origin+"/media/layout.png"],question:"读取卖点"},undefined);
      eq((inspected.details as any).inspectionStatus,"completed","actual multipart inspect endpoint");
      eq(modelRequests.at(-1).messages.at(-1).content.filter((p:any)=>p.type==="image_url").length,2,"all reference images transmitted");
      mode="missing-checks";const incomplete=await manualReview("检查");
      eq(incomplete.status,502,"missing requirement checks is unverified");
      eq((await incomplete.json()).code,"VISION_RESPONSE_INVALID","explicit malformed response");
      mode="unavailable";const count=modelRequests.length;
      const unavailable=await manualReview("检查");
      eq(unavailable.status,502,"upstream failure does not report quality failure");
      eq((await unavailable.json()).code,"VISION_UPSTREAM_UNAVAILABLE","explicit upstream failure");
      eq(modelRequests.length-count,1,"no automatic model retry");
      const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>inspect.execute("cancelled",{image_urls:[fixture.origin+"/media/product.png"],question:"读取"},cancelled.signal));checks++;
    }
    eq(supplierCalls,0,"no unexpected paths, no paid generation");
    console.log(`AGENT_SESSION_REPAIR=${baseline?"BASELINE_REPRODUCED":"PASS"} CHECKS=${checks} REAL_PG=1 RUNTIME=1 CAS=${baseline?"ABSENT":"PASS"} STALE_CACHE=${baseline?"REPRODUCED":"FIXED"} FABRICATED_MEDIA=${baseline?"REPRODUCED":"FILTERED"} ORIGINAL_REFS=${baseline?"MISSING":"PASS"} SUPPLIER_CALLS=0`);
  } finally {
    for(const id of new Set(ids)){const s=runtime.getSession(owner,id);if(s){await s.persistPending?.catch(()=>undefined);s.running=false;s.canvasExecuting=false;runtime.removeRuntimeSession(owner,id);}}
    await db.getPool().end();await fixture.cleanup();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
