import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  const baseline = process.argv.includes("--baseline");
  let mode = "broken", modelCalls = 0, writes = 0, continuationRequests = 0;
  let release: (() => void) | undefined;
  const calls: any[] = [];
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", OPENAI_API_KEY: "fixture-local-only", AGENT_API_KEY: "fixture-local-only", STORAGE_DRIVER: "local" });
  const f = await createModelFixture(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (!req.url?.endsWith("/chat/completions")) { writes++; res.statusCode = 500; res.end("Unexpected request"); return; }
    modelCalls++; const body = JSON.parse(Buffer.concat(chunks).toString()); calls.push(body);
    const frame = (delta: unknown, finish: string | null = null) => "data: " + JSON.stringify({ id: "fixture-stream", object: "chat.completion.chunk", model: "wire-text", choices: [{ index: 0, delta, finish_reason: finish }] }) + "\n\n";
    res.setHeader("content-type", "text/event-stream"); res.write(frame({role:"assistant"}));
    if (mode === "hold") await new Promise<void>(resolve => { release = resolve; });
    if (mode === "continue" || mode === "hold") {
      continuationRequests++;
      assert.equal((body.tools || []).length, 0, "Continuation must not offer tools");
      assert(!body.messages.some((m: any) => m.role === "tool"));
      assert(body.messages.some((m: any) => JSON.stringify(m.content).includes("详情承接：配方徽章与")), "Failed assistant text must reach provider context");
      res.write(frame({content:"包装结构，补全后续方案。"}));res.write(frame({},"stop"));
    } else if (mode === "injected-tool") {
      assert.equal((body.tools || []).length, 0);
      if (body.messages.at(-1)?.role === "tool") { res.write(frame({content:"只继续文字，未执行工具。"}));res.write(frame({},"stop")); }
      else { res.write(frame({tool_calls:[{index:0,id:"forged",type:"function",function:{name:"generate_image",arguments:JSON.stringify({prompt:"should never execute",confirm:true})}}]}));res.write(frame({},"tool_calls")); }
    } else {
      if (mode !== "empty") res.write(frame({content:"已保留正文。详情承接：配方徽章与"}));
      if (mode === "length") res.write(frame({},"length"));
      if (mode === "stop") res.write(frame({},"stop"));
    }
    res.end("data: [DONE]\n\n");
  });
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, INTERNAL_APP_ORIGIN:f.origin, NAUMI_ROUTER_MANAGEMENT_URL:f.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-local-router-stream-recovery", MODEL_CONFIG_ENVELOPE_SECRET:"fixture-local-envelope-stream-recovery", MODEL_CONFIG_TRUSTED_ORIGINS:f.origin });
  const db = await import("../src/lib/db");
  try {
    const credential = await f.credentials.importPlain({providerId:"text",plain:"fixture-local-text",actor:"fixture"});
    f.config.providers.push({...f.config.providers[0],id:"text",name:"fixture text",protocol:"openai-chat",credentialRef:credential.id});
    f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"text",providerId:"text",model:"wire-text",modality:"text",parameterMap:{},capabilities:{...f.config.upstreamModels[0].capabilities,vision:true}});
    f.config.publicModels.push({id:"text-family",label:"Text fixture",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"text"},toolScope:{features:["canvas.assistant"],defaultFor:[]}});
    Object.assign(f.config.bindings,{"agent.text":"text-family","vision.reference":"text-family"});await f.repo.current();
    await db.ensureSchema(); const email = `stream-recovery-${randomUUID()}@fixture.test`;await db.getOrCreateUser(email,"Stream fixture");
    const {getBillingRuntime} = await import("../src/lib/billing/server"), billing = await getBillingRuntime(), old = await billing.config.current(), config = structuredClone(old.config);
    config.switches.metering="on";config.features["canvas.assistant"].pricing={mode:"fixed",credits:0};
    const price = await billing.config.publish({id:randomUUID(),expectedVersion:old.version,config,actor:"fixture",reason:"Local stream recovery"});
    const cookie="nv_user="+(await import("../src/lib/native-auth")).signUserSession(email,Date.now());
    const api = await import("../src/app/api/canvas/assistant/route"), runtime = await import("../src/lib/agent/runtime");
    const request = (payload: any) => new Request(f.origin+"/api/canvas/assistant",{method:"POST",headers:{cookie,"content-type":"application/json","x-naumi-feature-model":"text-family","x-naumi-billing-operation-id":randomUUID(),"x-naumi-billing-version":String(price.version),"x-naumi-billing-credits":"0"},body:JSON.stringify({mode:"agent",sessionId:randomUUID(),projectKey:"workspace",messages:[{role:"user",content:"先出初稿"}],...payload})});
    const parse=(s:string)=>s.split("\n\n").filter(x=>x.startsWith("event:")).map(x=>({type:x.split("\n")[0].slice(7),data:JSON.parse(x.split("\ndata: ")[1])}));
    const send=async(payload:any={})=>{const response=await api.POST(request(payload));assert.equal(response.status,200,await response.clone().text());return parse(await response.text());};
    const saved=async(id:string)=>(await(await api.GET(new Request(f.origin+"/api/canvas/assistant?projectKey=workspace&id="+id,{headers:{cookie}}))).json()).session;
    const broken=await send(), id=broken.find(e=>e.type==="open")!.data.sessionId, error=broken.findLast(e=>e.type==="error")!;
    assert(broken.some(e=>e.type==="delta"&&e.data.text.includes("配方徽章与")));
    assert(!broken.some(e=>e.type==="done"));
    const history=await saved(id);assert(history.turns.at(-1).content.endsWith("配方徽章与"));
    assert.equal(history.status,"failed");
    if (baseline) {
      assert.equal(error.data.code,"PROVIDER");assert.equal(history.continueFromTurnId,undefined);
      mode="length";const length=await send();assert(length.some(e=>e.type==="done"));
      console.log("BASELINE=REPRODUCED PARTIAL=RETAINED BROKEN=GENERIC_PROVIDER LENGTH=FALSE_SUCCESS CONTINUE=ABSENT EXTERNAL_SUPPLIER_CALLS=0");return;
    }
    assert.equal(error.data.code,"STREAM_INTERRUPTED");assert.equal(error.data.canContinue,true);assert.match(error.data.message,/内容已保留/);
    assert.equal(history.continueFromTurnId,error.data.continueFromTurnId);
    const diagnostic=history.steps.findLast((s:any)=>s.type==="model_stream_end");assert.equal(diagnostic.stopReason,"error");assert.equal(diagnostic.category,"missing_finish_reason");assert(diagnostic.emittedChars>0);assert(!JSON.stringify(diagnostic).includes("errorMessage"));
    assert.equal(runtime.removeRuntimeSession(email,id),"removed"); // cold reload must preserve capability
    assert.equal((await saved(id)).continueFromTurnId,error.data.continueFromTurnId);
    mode="continue";const resume={sessionId:id,continueText:true,continueFromTurnId:error.data.continueFromTurnId,messages:[]};
    const continued=await send(resume);assert(continued.some(e=>e.type==="done"));assert.match(continued.find(e=>e.type==="final")!.data.reply,/补全后续/);
    const restored=await saved(id);assert.equal(restored.status,"completed");assert.equal(restored.continueFromTurnId,undefined);assert(restored.turns.some((t:any)=>t.content.endsWith("配方徽章与")));assert.equal(restored.turns.at(-2).content,"继续输出");
    const count=modelCalls;assert.equal((await api.POST(request(resume))).status,409);assert.equal(modelCalls,count);
    mode="length";const length=await send(), le=length.findLast(e=>e.type==="error")!;assert.equal(le.data.code,"OUTPUT_LENGTH");assert.equal(le.data.canContinue,true);assert(!length.some(e=>e.type==="done"));
    const lengthId=length.find(e=>e.type==="open")!.data.sessionId;
    mode="hold";const first=await api.POST(request({sessionId:lengthId,continueText:true,continueFromTurnId:le.data.continueFromTurnId,messages:[]}));
    for(let i=0;!release&&i<80;i++)await new Promise(r=>setTimeout(r,25));assert(release);
    assert.equal((await api.POST(request({sessionId:lengthId,continueText:true,continueFromTurnId:le.data.continueFromTurnId,messages:[]}))).status,409);release!();assert.match(await first.text(),/event: done/);
    mode="broken";const attack=await send(), ae=attack.findLast(e=>e.type==="error")!, aid=attack.find(e=>e.type==="open")!.data.sessionId;
    mode="injected-tool";await send({sessionId:aid,continueText:true,continueFromTurnId:ae.data.continueFromTurnId,messages:[]});assert.equal(writes,0);
    const active=runtime.getSession(email,aid)!;assert(active.agent.state.tools.length>0);assert.equal(active.textOnlyContinuation,false);
    active.harness.begin("继续输出",()=>undefined);active.textOnlyContinuation=true;
    const guard=await active.agent.beforeToolCall!({toolCall:{type:"toolCall",name:"generate_image",id:"guard",arguments:{}},args:{},context:{} as any,assistantMessage:{} as any});assert.equal(guard?.block,true);assert.equal(guard?.terminate,true);active.textOnlyContinuation=false;active.harness.finish();
    mode="empty";const empty=await send();assert.equal(empty.findLast(e=>e.type==="error")!.data.canContinue,false);
    mode="broken";const again=await send(), againId=again.find(e=>e.type==="open")!.data.sessionId, againError=again.findLast(e=>e.type==="error")!;
    mode="empty";const retryEmpty=await send({sessionId:againId,continueText:true,continueFromTurnId:againError.data.continueFromTurnId,messages:[]}), retryError=retryEmpty.findLast(e=>e.type==="error")!;
    assert.equal(retryError.data.canContinue,true);assert.equal((await saved(againId)).continueFromTurnId,retryError.data.continueFromTurnId);
    mode="continue";assert((await send({sessionId:againId,continueText:true,continueFromTurnId:retryError.data.continueFromTurnId,messages:[]})).some(e=>e.type==="done"));
    mode="stop";const normal=await send();assert(normal.some(e=>e.type==="done"));assert(!normal.some(e=>e.type==="error"));
    const forbidden=await api.POST(request({sessionId:aid,projectKey:"different-project",continueText:true,continueFromTurnId:ae.data.continueFromTurnId,messages:[]}));assert.equal(forbidden.status,404);
    const {streamDiagnostic,continuationTurn,withTextOnlyContinuation}=await import("../src/lib/agent/stream-recovery");
    const secret=streamDiagnostic({stopReason:"error",errorMessage:"socket failed https://secret.example/?token=abc",rawStopReason:"secret-api-key",usage:{input:NaN,output:Infinity}},5);
    assert.equal(secret.category,"network");assert(!JSON.stringify(secret).includes("secret"));assert.equal(secret.outputTokens,undefined);
    assert.equal(continuationTurn([{type:"canvas_turn",turnId:"a"},{type:"canvas_terminal",turnId:"a",status:"stopped",canContinue:true}],[{role:"assistant",content:"partial"}]),undefined);
    const originalTools=active.agent.state.tools, originalMessages=active.agent.state.messages, originalPrompt=active.agent.state.systemPrompt;
    await assert.rejects(()=>withTextOnlyContinuation(active,async()=>{assert.equal(active.agent.state.tools.length,0);throw Error("fixture throw");}));assert.deepEqual(active.agent.state.tools,originalTools);assert.deepEqual(active.agent.state.messages,originalMessages);assert.equal(active.agent.state.systemPrompt,originalPrompt);assert.equal(active.textOnlyContinuation,false);
    const debits=await db.getPool().query("SELECT count(*)::int AS n FROM app_ledger WHERE email=$1 AND delta<0",[email]);assert.equal(debits.rows[0].n,0);
    console.log(`MODIFIED=PASS BROKEN=TYPED LENGTH=INCOMPLETE COLD_CONTINUE=PASS EMPTY_COMPOSER=SUPPORTED STALE=409 CONCURRENT=409 INJECTED_TOOLS=BLOCKED DIAGNOSTIC=BOUNDED TOOLS_RESTORED=PASS NORMAL=PASS PAID_WRITES=${writes} DEBITS=0 EXTERNAL_SUPPLIER_CALLS=0 MODEL_FIXTURE_CALLS=${modelCalls} CONTINUATIONS=${continuationRequests}`);
  } finally { release?.();await db.getPool().end();await f.cleanup(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
