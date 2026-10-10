import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 let digest="",failure="",allFail=false;const calls:any[]=[];
 const f=await createModelFixture(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  res.setHeader("content-type","application/json");
  if(req.url?.endsWith("/models"))return res.end(JSON.stringify({data:[{id:"text-new"}]}));
  if(req.url==="/internal/config/state")return res.end(JSON.stringify({digest}));
  if(req.url==="/internal/config/prepare")return res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));
  if(req.url==="/internal/config/activate"){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:"applied"}));}
  if(req.url?.startsWith("/internal/config/publications/")){res.statusCode=404;return res.end("{}");}
  calls.push(body);
  if(allFail||body.model==="text-one"&&failure==="http"){res.statusCode=503;return res.end(JSON.stringify({error:{message:"fixture failure"}}));}
  if(body.model==="text-one"&&failure==="empty")return res.end(JSON.stringify({choices:[]}));
  if(body.model==="text-one"&&failure==="disconnect")return req.socket.destroy();
  if(body.model==="text-one"&&failure==="timeout"){await new Promise(r=>setTimeout(r,1300));return res.end('{}');}
  if(body.stream){res.setHeader("content-type","text/event-stream");
   res.write('data: '+JSON.stringify({choices:[{delta:{role:"assistant",content:""}}]})+'\n\n');
   if(body.model==="text-one"&&failure==="prelude")return res.end('data: '+JSON.stringify({error:{message:"pre-token failure"}})+'\n\n');
   res.write('data: '+JSON.stringify({choices:[{delta:{content:body.model+" result"}}]})+'\n\n');
   if(body.model==="text-one"&&failure==="partial"){await new Promise(r=>setTimeout(r,30));return req.socket.destroy();}
   await new Promise(r=>setTimeout(r,30));return res.end('data: '+JSON.stringify({choices:[{delta:{},finish_reason:"stop"}],usage:{prompt_tokens:1,completion_tokens:2}})+'\n\ndata: [DONE]\n\n');
  }
  return res.end(JSON.stringify({choices:[{message:{role:"assistant",content:body.model+" result"}}],usage:{prompt_tokens:1,completion_tokens:2}}));
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"text-channels-test-router-private-long",MODEL_CONFIG_ENVELOPE_SECRET:"text-channels-test-envelope-private-long",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only"});
 const db=await import("../src/lib/db");
 try{
  for(let i=1;i<=3;i++){const id="t"+i,cred=await f.credentials.importPlain({providerId:id,plain:"fixture-text-"+i,actor:"fixture"});
   f.config.providers.push({...f.config.providers[0],id,name:"Text supplier "+i,protocol:"openai-chat",credentialRef:cred.id,maxConcurrent:1,timeoutMs:1000});
   f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id,providerId:id,model:i===1?"text-one":i===2?"text-two":"pure-text",modality:"text",parameterMap:{},capabilities:{...f.config.upstreamModels[0].capabilities,vision:i<3,edit:false,qualities:[],nativeResolutions:[]}});
  }
  f.config.publicModels.push({id:"text-family",label:"GPT-6Astra",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"t1"}});
  Object.assign(f.config.bindings,{"agent.text":"text-family","text.generate":"text-family","vision.ocr":"text-family"});
  await f.repo.current();await db.ensureSchema();
  const admin=await(await import("../src/lib/model-config/server")).getModelAdministration();const original=await admin.repo.current(),billing=await admin.billing.current();
  const handler=(await import("../src/lib/model-config/management-access")).createModelManagementHandler({authorize:async()=>({actor:"fixture-admin"}),managed:async()=>true,administration:async()=>admin});
  const req=(body?:unknown)=>new Request(f.origin+"/api/admin/model-management",{method:body?"POST":"GET",headers:{"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const view=await(await handler(req())).json(),row=view.rows.find((r:any)=>r.id==="text-family");assert.equal(row.channelsEditable,true);assert.ok(row.candidateIds.includes("t2"));assert.ok(!row.candidateIds.includes("t3"));
  const channels=[{upstreamId:"t1",enabled:true,priority:1,weight:7},{upstreamId:"t2",enabled:true,priority:2,weight:3}],op={action:"channels",id:randomUUID(),expectedVersion:original.version,rowId:row.id,policy:{mode:"priority",channels}};
  assert.equal((await handler(req({...op,id:randomUUID(),policy:{mode:"priority",channels:[{...channels[0],upstreamId:"u1"}]}}))).status,400);
  assert.equal((await handler(req({...op,id:randomUUID(),policy:{mode:"priority",channels:[{...channels[0],upstreamId:"t3"}]}}))).status,400);
  const saved=await handler(req(op));assert.equal(saved.status,200,await saved.clone().text());const current=await admin.repo.current();assert.equal((await handler(req(op))).status,200);assert.equal((await admin.repo.current()).version,current.version);assert.deepEqual(await admin.billing.current(),billing);
  const executor=await(await import("../src/lib/model-config/execution")).getModelExecutor(),frozen=await executor.resolve({feature:"canvas.assistant",binding:"text.generate",requestedModelId:row.id,snapshot:current,billing}),oldFrozen=await executor.resolve({binding:"text.generate",requestedModelId:row.id,snapshot:original,billing});
  const client=(await executor.clientFor(frozen)).client;assert.equal((await executor.clientFor(oldFrozen)).wireModel,"text-one");
  const run=(stream=false)=>client.chat.completions.create({model:"text-family",messages:[{role:"user",content:"fixture"}],stream} as any);
  for(const mode of ["http","empty","disconnect","timeout"]){failure=mode;calls.length=0;await db.getPool().query("DELETE FROM app_model_channel_health");const result:any=await run();assert.equal(result.choices[0].message.content,"text-two result");assert.deepEqual(calls.map(c=>c.model),["text-one","text-two"]);}
  failure="prelude";calls.length=0;await db.getPool().query("DELETE FROM app_model_channel_health");let text="";for await(const chunk of await run(true) as any)text+=chunk.choices[0]?.delta?.content||"";assert.equal(text,"text-two result");assert.deepEqual(calls.map(c=>c.model),["text-one","text-two"]);
  failure="partial";calls.length=0;await db.getPool().query("DELETE FROM app_model_channel_health");await assert.rejects(async()=>{for await(const _ of await run(true) as any){}});assert.deepEqual(calls.map(c=>c.model),["text-one"],"Never append another supplier after visible tokens");
  assert.equal(Number((await db.getPool().query("SELECT count(*) FROM app_model_provider_leases")).rows[0].count),0);
  failure="";await db.getPool().query("DELETE FROM app_model_channel_health");const stream:any=await run(true);calls.length=0;const overflow:any=await run();assert.equal(overflow.choices[0].message.content,"text-two result");for await(const _ of stream){};
  await db.getPool().query("DELETE FROM app_model_channel_health");const cancelled:any=await run(true);cancelled.controller.abort();await new Promise(r=>setTimeout(r,40));assert.equal(Number((await db.getPool().query("SELECT count(*) FROM app_model_provider_leases")).rows[0].count),0);assert.equal(Number((await db.getPool().query("SELECT count(*) FROM app_model_channel_health WHERE failures>0")).rows[0].count),0);
  allFail=true;await db.getPool().query("DELETE FROM app_model_channel_health");calls.length=0;await assert.rejects(run());assert.deepEqual(calls.map(c=>c.model),["text-one","text-two"]);allFail=false;
  const next={...op,id:randomUUID(),expectedVersion:current.version,policy:{mode:"balanced",channels:channels.map(c=>({...c,priority:1}))}};assert.equal((await handler(req(next))).status,200);const balanced=await admin.repo.current(),balancedFrozen=await executor.resolve({binding:"text.generate",requestedModelId:row.id,snapshot:balanced,billing}),weighted=(await executor.clientFor(balancedFrozen)).client;calls.length=0;await db.getPool().query("DELETE FROM app_model_channel_health");for(let i=0;i<10;i++)await weighted.chat.completions.create({model:row.id,messages:[{role:"user",content:"fixture"}]});assert.equal(calls.filter(c=>c.model==="text-one").length,7);
  const register={action:"register",id:randomUUID(),expectedVersion:balanced.version,providerId:"t3",model:"text-new",confirmed:true,vision:true,edit:false,qualityRank:2,qualities:[],resolutions:[],maxReferenceImages:4};assert.equal((await handler(req(register))).status,200);const refreshed=await(await handler(req())).json();assert.ok(refreshed.rows.find((r:any)=>r.id===row.id).candidateIds.includes("mvp-"+register.id));
  assert.deepEqual(await admin.billing.current(),billing);assert.equal(Number((await db.getPool().query("SELECT count(*) FROM app_model_provider_leases")).rows[0].count),0);
  console.log("TEXT_SUPPLIER_CHANNELS=PASS API_SAVE_REPLAY=PASS CROSS_MODALITY_VISION_GUARD=PASS HTTP_EMPTY_TIMEOUT_DISCONNECT_PRETOKEN_FALLBACK=PASS PARTIAL_NO_SPLICE=PASS WEIGHT_7_3=PASS STREAM_CAPACITY_OVERFLOW_RELEASE=PASS FROZEN_HISTORY=PASS REGISTER_THEN_CANDIDATE=PASS BILLING_UNCHANGED=1 REAL_PAID_CALLS=0");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
