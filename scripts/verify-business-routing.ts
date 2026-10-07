import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  const calls: string[] = [], prepared = new Set<string>(), receipts = new Map<string,unknown>();
  let active = "", imageMode = "ok", noUsage = false, release: (()=>void)|undefined, entered: (()=>void)|undefined;
  const png=await sharp({create:{width:128,height:128,channels:3,background:"#ffffff"}}).png().toBuffer();
  const media=await mkdtemp(join(tmpdir(),"naumi-business-routing-"));process.env.MEDIA_DIR=media;process.env.STORAGE_DRIVER="local";
  const f=await createModelFixture(async(req,res)=>{
    const parts=[];for await(const p of req)parts.push(p);const body=parts.length?JSON.parse(Buffer.concat(parts).toString()):{};
    const send=(status:number,data:unknown)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(data));};
    if(req.url==="/internal/config/state")return send(200,{digest:active});
    if(req.url==="/internal/config/prepare"){prepared.add(body.digest);return send(200,{digest:body.digest,phase:"prepared"});}
    if(req.url==="/internal/config/activate"){assert.ok(prepared.has(body.digest));if(body.expectedDigest!==active)return send(409,{});active=body.digest;const r={id:body.id,digest:body.digest,phase:"applied"};receipts.set(body.id,r);return send(200,r);}
    if(req.url?.startsWith("/internal/config/publications/")){const r=receipts.get(req.url.split("/").at(-1)!);return send(r?200:404,r||{});}
    if(req.url?.includes("chat/completions")){
      calls.push(body.model);
      if(entered){entered();await new Promise<void>(resolve=>{release=resolve;});}
      if(body.stream){res.writeHead(200,{"content-type":"text/event-stream"});res.end(`data: ${JSON.stringify({id:"fixture-stream",choices:[{delta:{content:"供应商流式回执"}}]})}\n\ndata: ${JSON.stringify({id:"fixture-stream",choices:[],usage:{prompt_tokens:1000,completion_tokens:500,prompt_tokens_details:{cached_tokens:200}}})}\n\ndata: [DONE]\n\n`);return;}
      return send(200,{id:"fixture-text",model:body.model,choices:[{message:{role:"assistant",content:"真实协议回执验证"},finish_reason:"stop"}],...(noUsage?{}:{usage:{prompt_tokens:1000,completion_tokens:500,prompt_tokens_details:{cached_tokens:200}}})});
    }
    if(req.url?.includes("images/generations")){
      calls.push(body.model);
      if(imageMode==="unknown") {res.destroy();return;}
      if(body.model==="wire-image-one"&&imageMode==="reject")return send(429,{error:{message:"rate limit",billing_status:"not_charged"}});
      if(body.model==="wire-image-one"&&imageMode==="unconfirmed")return send(429,{error:{message:"unknown acceptance"}});
      return send(200,{data:[{b64_json:png.toString("base64")}]});
    }
    send(404,{});
  });
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  process.env.NAUMI_MULTI_USER="1";process.env.NAUMI_ROUTER_MANAGEMENT_URL=f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN="fixture-business-admin-token-independent";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET="fixture-business-envelope-secret-independent";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS=f.origin;
  process.env.VIDEO_WORKER_SECRET="fixture-business-worker-independent-secret";
  const db=await import("../src/lib/db"), { signUserSession }=await import("../src/lib/native-auth");
  const {getModelAdministration}=await import("../src/lib/model-config/server");
  const {getBillingRuntime}=await import("../src/lib/billing/server");
  const {publicModelCatalog}=await import("../src/lib/model-config/runtime");
  const {validateModelConfig}=await import("../src/lib/model-config/schema");
  const {createModelExecutor}=await import("../src/lib/model-config/execution");
  const {withBiRequest,withBiModelContext,observeOpenAI}=await import("../src/lib/bi/model-observer");
  const {withBillingRequest,configuredToolCost}=await import("../src/lib/billing/synchronous");
  const {modelAwareOpenAI}=await import("../src/lib/model-config/clients");
  const quoteApi=await import("../src/app/api/billing/quote/route");
  const textApi=await import("../src/app/api/canvas/text-generate/route");
  const modelsApi=await import("../src/app/api/models/route");
  const {businessPreview}=await import("../src/lib/model-config/business-preview");
  const email="business-user@example.test",adminEmail="business-admin@example.test";
  const userCookie=`nv_user=${signUserSession(email,Date.now())}`;
  const request=(path:string,body?:unknown,headers:Record<string,string>={})=>new Request(`http://fixture.test${path}`,{method:body?"POST":"GET",headers:{cookie:userCookie,"content-type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});
  try {
    await db.ensureSchema();await db.setSetting("multi_user_enabled","1");await db.getOrCreateUser(email,"业务验收");await db.addCreditBatch(email,10000,{source:"grant",reason:"isolated fixture"});
    await f.repo.current();
    const config=structuredClone(f.config), textKey=(await f.credentials.importPlain({providerId:"text-provider",plain:"fixture-private-text-key",actor:adminEmail})).id;
    config.providers.push({...config.providers[0],id:"text-provider",protocol:"openai-chat",credentialRef:textKey});
    config.upstreamModels.push({...structuredClone(config.upstreamModels[0]),id:"u2",model:"wire-image-two"});
    const cost={currency:"CNY" as const,basis:"image" as const,amountMicros:"200000",source:"fixture supplier catalog",updatedAt:new Date().toISOString()};
    config.upstreamModels[0].procurement=cost;config.upstreamModels[1].procurement={...cost,amountMicros:"300000"};
    config.upstreamModels.push({...structuredClone(config.upstreamModels[0]),id:"text-u",providerId:"text-provider",model:"wire-text-private",modality:"text",capabilities:{...config.upstreamModels[0].capabilities,vision:true},procurement:{currency:"CNY",basis:"tokens",inputMicrosPerMillion:"1000000",outputMicrosPerMillion:"2000000",cachedInputMicrosPerMillion:"500000",source:"fixture text catalog",updatedAt:cost.updatedAt}});
    config.publicModels.push({id:"text-public",label:"灵动文字",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"text-u"}});
    config.bindings["agent.text"]="text-public";config.bindings["vision.reference"]="text-public";
    config.fixedMonthlyCosts=[{id:"monthly-server",name:"固定服务器月费",amountCnyMicros:"99000000",enabled:true}];
    config.business={"image.generate":{enabled:true,defaultModelId:"image-a",options:[{modelId:"image-a",enabled:true,sort:0,unit:"image",pricing:{mode:"cny-fixed",amountMicros:"500000",creditsPerCnyMicros:"100000000",rounding:"ceil"},routing:{enabled:true,defaultUpstreamId:"u1",maxAttempts:2,costCapCnyMicros:"800000",rules:[{id:"request-large",stage:"request",priority:100,when:{minInputLength:1000},targetUpstreamId:"u2"},{id:"confirmed-rejection",stage:"failure",priority:50,when:{status:[429]},targetUpstreamId:"u2"}]}}]},"canvas.text-generate":{enabled:true,defaultModelId:"text-public",options:[{modelId:"text-public",enabled:true,sort:0,unit:"task",pricing:{mode:"cny-fixed",amountMicros:"500000",creditsPerCnyMicros:"100000000",rounding:"ceil"}}]}};
    const billing=await getBillingRuntime(), b=await billing.config.current(),bc=structuredClone(b.config);bc.switches.metering="on";await billing.config.publish({id:randomUUID(),expectedVersion:b.version,config:bc,actor:adminEmail,reason:"fixture metering"});
    const management=await getModelAdministration();
    const apply=async(c:typeof config)=>{const draft=await management.repo.draft(adminEmail),saved=await management.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:c,actor:adminEmail}),current=await management.repo.current();const pub=await management.runtime.publish({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:adminEmail,reason:"business fixture application"});assert.equal(pub.phase,"applied");return management.repo.current();};
    const first=await apply(config);
    assert.ok(active);assert.deepEqual((await management.repo.draft(adminEmail)).config.business,config.business);
    const catalog=await modelsApi.GET(request("/api/models?feature=canvas.text-generate"));assert.equal(catalog.status,200);const publicCatalog=await catalog.json();assert.deepEqual(publicCatalog.models.map((m:any)=>m.id),["text-public"]);assert.ok(!JSON.stringify(publicCatalog).includes("wire-text-private"));assert.ok(!JSON.stringify(publicCatalog).includes("fixture-private"));
    assert.deepEqual(publicModelCatalog(first,"image","canvas.text-generate").models,[]);
    const incompatible=structuredClone(config);incompatible.business!["canvas.text-generate"]!.options[0].modelId="image-a";assert.throws(()=>validateModelConfig(incompatible,{trustedOrigins:[f.origin]}));
    const keptBase=structuredClone(config);keptBase.business!["image.generate"]!.options[0].postprocess={enabled:true,kind:"resize",processor:"sharp-lanczos3",width:256,height:192,failure:"keep-base"};assert.throws(()=>validateModelConfig(keptBase,{trustedOrigins:[f.origin]}),"Do not complete billing on under-spec base images");
    const poolOption=structuredClone(config);poolOption.pools.push({id:"legacy-pool",modality:"image",strategy:"priority",candidates:["u1"],rules:[]});poolOption.publicModels[0].target={type:"pool",id:"legacy-pool"};assert.throws(()=>validateModelConfig(poolOption,{trustedOrigins:[f.origin]}),"Route-off must not silently use a pool");
    const imageFacts={task:"product" as const,quality:"medium",resolution:"1K",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0,inputLength:10};
    const executor=createModelExecutor({runtime:management.runtime,credentials:management.credentials,trustedOrigins:[f.origin],gateway:()=>{throw new Error("Direct route must not call Router generation");}});
    const frozen=await executor.resolve({feature:"image.generate",binding:"image.generate",snapshot:first,billing:await billing.config.current(),facts:imageFacts});
    const scope=await executor.describe(frozen);assert.equal(scope.connection.wireModel,"wire-image-one");
    const long=await executor.resolve({feature:"image.generate",binding:"image.generate",snapshot:first,billing:await billing.config.current(),facts:{...imageFacts,inputLength:1500}});assert.equal(long.target.id,"u2");
    const before=calls.length;imageMode="reject";await executor.run(frozen,async()=>{const result=await modelAwareOpenAI({apiKey:"unused"}).images.generate({model:"image-a",prompt:"fixture",n:1});assert.equal(result.data!.length,1);});assert.deepEqual(calls.slice(before),["wire-image-one","wire-image-two"]);
    imageMode="unconfirmed";const uncertainBefore=calls.length;await assert.rejects(executor.run(frozen,()=>modelAwareOpenAI({apiKey:"unused"}).images.generate({model:"image-a",prompt:"fixture",n:1})));assert.equal(calls.length,uncertainBefore+1,"No retry when supplier billing acceptance is unconfirmed");
    imageMode="unknown";const lostBefore=calls.length;await assert.rejects(executor.run(frozen,()=>modelAwareOpenAI({apiKey:"unused"}).images.generate({model:"image-a",prompt:"fixture",n:1})));assert.equal(calls.length,lostBefore+1);
    imageMode="ok";
    const offConfig=structuredClone(config);offConfig.business!["image.generate"]!.options[0].routing!.enabled=false;
    const off=await executor.resolve({feature:"image.generate",binding:"image.generate",snapshot:{...first,config:offConfig},billing:await billing.config.current(),facts:imageFacts});assert.equal(off.target.id,"u1");
    const priority=structuredClone(config);priority.business!["image.generate"]!.options[0].routing!.rules.push({id:"all-requests",priority:1000,stage:"request",when:{},targetUpstreamId:"u1"});
    const {businessRoutePlan}=await import("../src/lib/model-config/business");assert.equal(businessRoutePlan(priority,priority.business!["image.generate"]!.options[0],{...imageFacts,inputLength:1500})?.matchedRuleId,"all-requests");
    const multiBefore=calls.length;await assert.rejects(executor.run(frozen,()=>modelAwareOpenAI({apiKey:"unused"}).images.generate({model:"image-a",prompt:"fixture",n:2})));assert.equal(calls.length,multiBefore);
    imageMode="unconfirmed";const unknownId=randomUUID();
    const unknownQuote=await (await quoteApi.POST(request("/api/billing/quote",{feature:"image.generate",quantity:1,modelId:"image-a"}))).json();
    const unknownRequest=request("/api/generate-image",{prompt:"fixture"},{"x-naumi-billing-operation-id":unknownId,"x-naumi-feature-model":"image-a","x-naumi-billing-version":String(unknownQuote.version),"x-naumi-billing-credits":String(unknownQuote.credits)});
    const unknownResponse=await withBillingRequest(unknownRequest,"image.generate",()=>withBiRequest(unknownRequest,async()=>{await configuredToolCost();await observeOpenAI(modelAwareOpenAI({apiKey:"unused"})).images.generate({model:"image-a",prompt:"fixture",n:1});return Response.json({ok:true});}));
    assert.equal(unknownResponse.status,409);const unknownOperation=(await db.getPool().query("SELECT state,charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${unknownId}`])).rows[0];assert.ok(["hold","manual"].includes(unknownOperation.state));assert.equal(Number(unknownOperation.charged_credits),0);imageMode="ok";
    const budgetId=randomUUID(),budgetBefore=calls.length;
    await withBiModelContext(email,"fixture-budget",budgetId,()=>executor.run(frozen,async()=>{
      await modelAwareOpenAI({apiKey:"unused"}).images.generate({model:"image-a",prompt:"fixture",n:1});
      await modelAwareOpenAI({apiKey:"unused"}).images.generate({model:"image-a",prompt:"fixture",n:1});
      await assert.rejects(modelAwareOpenAI({apiKey:"unused"}).images.generate({model:"image-a",prompt:"fixture",n:1}));
    }));assert.equal(calls.length,budgetBefore+2);
    const textQuote=async()=>{const r=await quoteApi.POST(request("/api/billing/quote",{feature:"canvas.text-generate",quantity:1,modelId:"text-public"}));assert.equal(r.status,200,await r.clone().text());return r.json();};
    const submitText=async(id:string)=>{const q=await textQuote();return textApi.POST(request("/api/canvas/text-generate",{prompt:"生成一句商品描述"},{"x-naumi-billing-operation-id":id,"x-naumi-billing-version":String(q.version),"x-naumi-billing-credits":String(q.credits),"x-naumi-model-version":String(q.modelVersion),"x-naumi-feature-model":"text-public"}));};
    assert.equal((await textQuote()).credits,50);
    const fixedId=randomUUID();assert.equal((await submitText(fixedId)).status,200);assert.equal(Number((await db.getPool().query("SELECT charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${fixedId}`])).rows[0].charged_credits),50);
    const replayBefore=calls.length;assert.equal((await submitText(fixedId)).status,200);assert.equal(calls.length,replayBefore);
    const pendingId=randomUUID(),started=new Promise<void>(resolve=>{entered=resolve;});const pending=submitText(pendingId);await started;
    const secondConfig=structuredClone(config);secondConfig.business!["canvas.text-generate"]!.options[0].pricing={mode:"usage",inputMicrosPerMillion:"2000000",outputMicrosPerMillion:"4000000",cachedInputMicrosPerMillion:"1000000",authorizationCnyMicros:"1000000",creditsPerCnyMicros:"100000000",rounding:"ceil"};
    const second=await apply(secondConfig);entered=undefined;release!();assert.equal((await pending).status,200);assert.equal(Number((await db.getPool().query("SELECT charged_credits,quote FROM app_billing_operations WHERE id=$1",[`tool-${pendingId}`])).rows[0].charged_credits),50,"In-flight keeps original fixed price");
    const usageId=randomUUID();const actual=await submitText(usageId);assert.equal(actual.status,200,await actual.clone().text());const settled=(await db.getPool().query("SELECT * FROM app_billing_operations WHERE id=$1",[`tool-${usageId}`])).rows[0];assert.equal(settled.state,"settled");assert.equal(Number(settled.charged_credits),1);assert.equal(settled.settlement_result.usage.inputTokens,1000);
    noUsage=true;const missingId=randomUUID(),missing=await submitText(missingId);assert.equal(missing.status,409);const manual=(await db.getPool().query("SELECT state,charged_credits FROM app_billing_operations WHERE id=$1",[`tool-${missingId}`])).rows[0];assert.equal(manual.state,"manual");assert.equal(Number(manual.charged_credits),0);const missingReplay=calls.length;assert.equal((await submitText(missingId)).status,409);assert.equal(calls.length,missingReplay);noUsage=false;
    const partialQuote=await textQuote();const partialId=randomUUID(),partialRequest=request("/api/canvas/text-generate",{prompt:"multiple"},{"x-naumi-billing-operation-id":partialId,"x-naumi-feature-model":"text-public","x-naumi-billing-version":String(partialQuote.version),"x-naumi-billing-credits":String(partialQuote.credits)});
    const partial=await withBillingRequest(partialRequest,"canvas.text-generate",()=>withBiRequest(partialRequest,async()=>{await configuredToolCost();const client=observeOpenAI(modelAwareOpenAI({apiKey:"unused"}));await client.chat.completions.create({model:"text-public",messages:[{role:"user",content:"one"}]});noUsage=true;await client.chat.completions.create({model:"text-public",messages:[{role:"user",content:"two"}]});noUsage=false;return Response.json({text:"paid outputs retained"});}));assert.equal(partial.status,409);assert.equal((await db.getPool().query("SELECT state FROM app_billing_operations WHERE id=$1",[`tool-${partialId}`])).rows[0].state,"manual");
    const {settlementFor}=await import("../src/lib/billing/quote");const over=structuredClone(settled.quote);over.tariff.pricing.authorizationCnyMicros="1";assert.equal(settlementFor(over,settled.settlement_result).state,"manual");
    const adminApi=await import("../src/app/api/admin/bi/model-config/route");assert.equal((await adminApi.POST(request("/api/admin/bi/model-config",{id:randomUUID()}))).status,404);
    const {createModelRepository}=await import("../src/lib/model-config/repository");const reopened=createModelRepository({pool:f.sql,initialize:async()=>{throw new Error("Existing version must persist");},trustedOrigins:[f.origin]});assert.equal((await reopened.current()).version,second.version);assert.deepEqual((await reopened.current()).config.business,secondConfig.business);assert.deepEqual((await reopened.current()).config.fixedMonthlyCosts,secondConfig.fixedMonthlyCosts);
    const textFrozen=await executor.resolve({feature:"canvas.text-generate",binding:"text.generate",snapshot:second,billing:await billing.config.current()});
    const streamId=randomUUID();await withBiModelContext(email,"fixture-stream",streamId,()=>executor.run(textFrozen,async()=>{const stream=await modelAwareOpenAI({apiKey:"unused"}).chat.completions.create({model:"text-public",messages:[{role:"user",content:"stream fixture"}],stream:true});for await(const _chunk of stream){/* Consume the actual supplier stream. */}}));
    const streamStage=(await db.getPool().query("SELECT * FROM app_model_execution_stages WHERE operation_id=$1",[streamId])).rows[0];assert.equal(streamStage.state,"stream-completed");assert.equal(streamStage.cost_status,"usage-calculated");assert.equal(streamStage.cost_cny_micros,"1900");
    const restore=await management.runtime.restore({id:randomUUID(),targetVersion:first.version,expectedVersion:second.version,actor:adminEmail,reason:"fixture rollback"});assert.equal(restore.phase,"applied");assert.equal((await textQuote()).credits,50);
    const {runPostprocess,resumePostprocess}=await import("../src/lib/media-postprocess");const postCalls=calls.length,post=await runPostprocess({id:"fixture-postprocess",parentId:"fixture-paid-base",email,modelVersion:first.version,bytes:png,policy:{enabled:true,kind:"resize",processor:"sharp-lanczos3",width:256,height:192,failure:"hold"}});assert.equal(post.width,256);assert.equal(post.height,192);await db.getPool().query("UPDATE app_media_postprocess SET state='failed',result_url=NULL WHERE operation_id='fixture-postprocess'");const recovered=await resumePostprocess("fixture-postprocess",email);assert.equal(recovered.width,256);assert.equal(calls.length,postCalls,"Restoring postprocess must not pay generation supplier again");
    await db.getPool().query("UPDATE app_media_postprocess SET state='failed',attempts=3 WHERE operation_id='fixture-postprocess'");
    await assert.rejects(resumePostprocess("fixture-postprocess",email));
    assert.equal((await db.getPool().query("SELECT attempts FROM app_media_postprocess WHERE operation_id='fixture-postprocess'")).rows[0].attempts,3);
    assert.equal((await resumePostprocess("fixture-postprocess",email,true)).width,256);
    const badPost=await runPostprocess({id:"fixture-native-mismatch",parentId:"fixture-base",email,modelVersion:first.version,bytes:png,policy:{enabled:true,kind:"native",processor:"none",width:256,height:256,failure:"keep-base"}});assert.equal(badPost.status,"failed-kept-base");assert.equal(badPost.width,128);
    await db.addArtworks(email,[{id:"fixture-resize-artwork",title:"普通缩放",category:"main",prompt:"fixture",status:"completed",image:post.url,gradient:"",width:post.width,height:post.height,processingKind:"resize",postprocessStatus:"succeeded"}]);const art=(await db.listArtworksByIds(email,["fixture-resize-artwork"]))[0];assert.equal(art.processingKind,"resize");assert.equal(art.width,256);assert.equal(art.postprocessStatus,"succeeded");
    const stages=(await db.getPool().query("SELECT * FROM app_model_execution_stages")).rows;assert.ok(stages.some(s=>s.matched_rule_id==="confirmed-rejection"&&s.wire_model==="wire-image-two"));assert.ok(stages.some(s=>s.state==="unknown"));assert.ok(!JSON.stringify(stages).includes("fixture-private"));
    const supplierCalls=(await db.getPool().query("SELECT * FROM app_supplier_calls")).rows;
    const canvasCalls=supplierCalls.filter(c=>c.operation_id===`tool-${fixedId}`);assert.equal(canvasCalls.length,1);assert.equal(canvasCalls[0].feature,'canvas.text-generate');assert.equal(canvasCalls[0].public_model_id,'text-public');assert.equal(canvasCalls[0].amount_micros,'1900');assert.equal(canvasCalls[0].cost_status,'estimated');
    const toolCalls=supplierCalls.filter(c=>c.operation_id===`tool-${unknownId}`);assert.equal(toolCalls.length,1);assert.equal(toolCalls[0].feature,'image.generate');assert.equal(toolCalls[0].cost_status,'pending');assert.equal(toolCalls[0].amount_micros,null);
    assert.ok(supplierCalls.some(c=>c.phase==='fallback'&&c.model==='wire-image-two'));assert.ok(!JSON.stringify(supplierCalls).includes('fixture-private'));
    console.log('SUPPLIER_TOOL_CANVAS=PASS SUPPLIER_REAL_TRANSPORT=PASS SUPPLIER_REPLAY=ONE SUPPLIER_FALLBACK=RECORDED USER_PRICE_INDEPENDENT=PASS');
    assert.ok(stages.some(s=>s.state==="rejected-not-charged"&&s.cost_cny_micros==="0"));assert.ok(stages.some(s=>s.state==="unknown"&&s.cost_cny_micros===null));
    console.log("STREAM_COST=1900micros COST_UNKNOWN=NOT_ZERO ARTWORK_METADATA=DB_REOPEN POOL_ROUTE_OFF=REJECTED UNDERSPEC_BILLING=HELD");
    console.log("BUSINESS_ROUTING=PASS ROUTE_OFF=PASS PRIORITY=PASS MAX_ATTEMPTS=PASS UNKNOWN_BILLING=HELD PARTIAL_USAGE=MANUAL OVER_AUTH=MANUAL PUBLIC_CATALOG=PASS DB_REOPEN=PASS PUBLISH=PASS FROZEN_PRICE=PASS FIXED_CHARGE=50 USAGE_CHARGE=1 MISSING_USAGE=MANUAL REPLAY=NO_DUPLICATE NON_ADMIN=404 CONFIRMED_FALLBACK=PASS UNKNOWN_RETRY=0 POSTPROCESS=256x192 POSTPROCESS_RECOVERY=NO_GENERATION ROLLBACK=PASS");
  } finally {await db.getPool().end();await f.cleanup();await rm(media,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
