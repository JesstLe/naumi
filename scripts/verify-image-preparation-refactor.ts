/** Actual pricing/planning/HTTP handlers and isolated PG; same script runs on the full baseline. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {Client,Pool} from "pg";
import {createModelFixture} from "./model-config-fixture";

async function main(){
  const baseline=process.argv.includes("--baseline");let checks=0,supplier=0,db:any;
  const check=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);checks++;};
  const png=await sharp({create:{width:1024,height:1024,channels:4,background:"white"}}).png().toBuffer();
  const wires:any[]=[];
  const f=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));res.setHeader("content-type","application/json");
    if(req.url?.endsWith("/images/generations")){supplier++;const body=JSON.parse(Buffer.concat(chunks).toString());wires.push(body);return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));}
    if(req.url?.endsWith("/images/edits")){supplier++;const form=await new Request(f.origin+req.url,{method:"POST",headers:{"content-type":req.headers["content-type"]!},body:Buffer.concat(chunks)}).formData();wires.push(Object.fromEntries([...form].filter(([,v])=>typeof v==="string")));return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));}
    res.statusCode=404;res.end("{}");
  });
  const media=await mkdtemp(join(tmpdir(),"naumi-preparation-r1b-"));
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"fixture-router-preparation-20261024",MODEL_CONFIG_ENVELOPE_SECRET:"fixture-envelope-preparation-20261024",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",OPENAI_BASE_URL:f.origin+"/v1",OPENAI_IMAGE_QUALITY:"medium",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media});
  try{
    f.config.upstreamModels[0].capabilities.preserveIdentity=true;f.config.upstreamModels[0].capabilities.qualities=["medium"];
    f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"u2",capabilities:{...f.config.upstreamModels[0].capabilities,qualities:["medium","high"]}});
    f.config.publicModels.push({...structuredClone(f.config.publicModels[0]),id:"image-b",label:"Second image",target:{type:"upstream",id:"u2"}});
    await f.repo.current();db=await import("../src/lib/db");await db.ensureSchema();
    const owner=`prepare-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,"Preparation fixture");
    const {createBillingService,withBillingTransaction}=await import("../src/lib/billing/service");await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:owner,amount:200,source:"admin",reason:"isolated preparation fixture",expiry:{unit:"years",value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:"fixture"}));
    const {getModelAdministration}=await import("../src/lib/model-config/server"),admin=await getModelAdministration();
    const old=await admin.billing.current(),cfg=structuredClone(old.config);cfg.switches.metering="on";
    for(const feature of ["canvas.image","image.generate"] as const){cfg.features[feature].pricing={mode:"fixed",credits:3};cfg.features[feature].rules=[{id:"other-price",priority:100,when:{modelId:["image-b"]},pricing:{mode:"fixed",credits:9}}];}
    const pricing=await admin.billing.publish({id:randomUUID(),expectedVersion:old.version,config:cfg,actor:"fixture",reason:"R1B identity and default tiers"});
    const {quoteForActor,quoteForRequest}=await import("../src/lib/billing/server"),{withModelRequest,withModelOperation}=await import("../src/lib/model-config/requests"),{currentModelExecution,runExecutionBundle}=await import("../src/lib/model-config/context");
    const {imagegenRequestSchema}=await import("../src/lib/imagegen/schema"),{planImagegen}=await import("../src/lib/imagegen/plan"),{issueImagegenQuote,publicImagegenPlan}=await import("../src/lib/imagegen/quotes");
    const {USER_COOKIE,signUserSession}=await import("../src/lib/native-auth"),cookie=`${USER_COOKIE}=${signUserSession(owner,Date.now())}`;
    const request=(path:string,body:unknown)=>new Request("http://internal"+path,{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify(body)});
    const facts={feature:"canvas.image" as const,quantity:1,modelId:"image-a",quality:"medium",resolution:"1K",ratio:"1:1"};
    const originalCurrent=admin.repo.current.bind(admin.repo),originalQuery=Client.prototype.query;let modelReads=0;
    const observeQuery=function(this:Client,...args:unknown[]){if(/FROM app_model_config_state s\s+(?:LEFT\s+)?JOIN app_model_config_versions v ON v.version=s.active_version/.test(String(args[0])))modelReads++;return Reflect.apply(originalQuery,this,args);} as typeof Client.prototype.query;
    Client.prototype.query=observeQuery;
    const baseRequest=globalThis.Request;let fabricated=0;
    (globalThis as any).Request=new Proxy(baseRequest,{construct(target,args,newTarget){fabricated++;return Reflect.construct(target,args,newTarget);}});
    let q;
    try{q=await quoteForActor(owner,facts);}finally{globalThis.Request=baseRequest;Client.prototype.query=originalQuery;}
    check(q.requestedCredits,3,"normal quote");check(fabricated,baseline?1:0,"typed quote never fabricates Request");check(modelReads,baseline?2:1,"one model snapshot per new quote");
    const httpQuote=await quoteForRequest(request("/api/billing/quote",facts),facts);check(httpQuote,q,"HTTP and typed quote share full contract");
    const malformed={...facts,quality:"standard"};const defaultQuote=await quoteForActor(owner,malformed);
    const savedDefaultB=await quoteForActor(owner,{...malformed,modelId:"image-b"});
    const canonical=await quoteForActor(owner,{...facts,modelId:"image-b",quality:" HIGH "});check(canonical.facts.quality,baseline?"medium":"high","quality case normalization matches actual execution");
    if(!baseline){const {assertImageBillingSelection}=await import("../src/lib/billing/image-quotes");assert.doesNotThrow(()=>assertImageBillingSelection(canonical,{...facts,modelId:"image-b",quality:" HIGH "}));checks++;assert.throws(()=>assertImageBillingSelection(canonical,{...facts,modelId:"image-b",quality:"low"}),/原报价/);checks++;}
    check(defaultQuote.facts.quality,"medium","quote engine default retained");
    if(!baseline){check(defaultQuote.requestedParameters?.quality,"standard","raw quality retained for audit");check(defaultQuote.effectiveParameters?.quality,"medium","effective quality shown");}
    let legacyQuality="";await withModelRequest(request("/api/generate-image",{prompt:"draw a bottle",origin:"canvas",model:"image-a",quality:"standard",resolution:"1K",ratio:"1:1"}),async()=>{legacyQuality=currentModelExecution("image")!.frozen.facts!.quality;});check(legacyQuality,"medium","legacy HTTP fallback retained");
    const plans:any[]=[];
    for(const entry of ["canvas","agent","workbench"] as const){
      const raw=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry,mode:"generate",prompt:"draw a bottle",modelId:"image-a",parameters:{quality:"standard",resolution:"1K",ratio:"1:1"}});
      if(baseline){await assert.rejects(()=>planImagegen(raw,owner));checks++;}
      else{const plan=await planImagegen(raw,owner);check(plan.steps[0].parameters.quality,"medium",entry+" preparation uses shared quality");check(plan.steps[0].billingQuote?.facts.quality,"medium",entry+" price matches execution");check(plan.totalCredits,3,entry+" original default price");check(plan.steps[0].preparedImage?.facts.quality,"medium",entry+" saves prepared execution facts");plans.push({raw,plan});}
    }
    // Preparing a different selected model inside an existing scope must not inherit its identity or price.
    let inside:any;await withModelRequest(request("/api/generate-image",{prompt:"fixture",origin:"canvas",model:"image-a",quality:"medium"}),async()=>{inside=await quoteForActor(owner,{...facts,modelId:"image-b"});});
    check([inside.facts.modelId,inside.requestedCredits],baseline?["image-a",3]:["image-b",9],"explicit selected model wins over unrelated enclosing scope");
    // Reusing an explicitly supplied model snapshot performs no repeated current reads.
    if(!baseline){const models=await originalCurrent();modelReads=0;Client.prototype.query=observeQuery;admin.repo.current=async()=>{throw Error("current snapshot must not be reread");};
      try{await runExecutionBundle({frozen:{modelVersion:models.version,billingVersion:pricing.version},billing:pricing,models},()=>quoteForActor(owner,facts));check(modelReads,0,"prepared pair reused");}finally{admin.repo.current=originalCurrent;Client.prototype.query=originalQuery;}
    }
    check(supplier,0,"preparation is readonly: no supplier");check((await db.getPool().query("SELECT count(*)::int n FROM app_image_jobs")).rows[0].n,0,"preparation creates no job");
    const raw=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"draw another bottle",modelId:"image-a",parameters:{quality:"medium",resolution:"1K",ratio:"1:1"}});
    const plan=await planImagegen(raw,owner);check(plan.steps[0].preparedImage===undefined,baseline,"prepared contract exists only in new source");
    check("preparedImage" in publicImagegenPlan(plan).steps[0],false,"private prepared contract omitted from browser plan");
    await issueImagegenQuote(raw,owner,plan);
    // Current registry and environment change after preview. The accepted contract stays fixed.
    const newConfig=structuredClone(pricing.config);for(const feature of ["canvas.image","image.generate"] as const){newConfig.features[feature].pricing={mode:"fixed",credits:17};newConfig.features[feature].rules=[];}
    await admin.billing.publish({id:randomUUID(),expectedVersion:pricing.version,config:newConfig,actor:"fixture",reason:"later price"});
    const models=await f.repo.current(),mc=structuredClone(models.config);mc.publicModels[0].label="New label";
    const draft=await f.repo.draft("fixture"),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:mc,actor:"fixture"}),publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:models.version,actor:"fixture",reason:"later model"});await f.repo.markApplied(publication.id,publication.digest);
    process.env.OPENAI_IMAGE_QUALITY="high";
    let quotedQuality="";await withModelOperation({path:"/api/generate-image",body:{origin:"canvas",model:"image-b",quality:"standard",resolution:"1K",ratio:"1:1"},featureModel:"image-b",references:0,quote:savedDefaultB},async()=>{quotedQuality=currentModelExecution("image")!.frozen.facts!.quality;});
    check(quotedQuality,"medium","saved quote's raw standard audit label cannot reselect high after environment drift");
    if(!baseline){
      const prepared=plan.steps[0].preparedImage!;
      let actual:any;await withModelOperation({path:"/api/generate-image",body:{origin:"canvas",quality:"standard",resolution:"4K",model:"image-a"},references:0,featureModel:"image-a",versions:{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion},preparedImage:prepared},async()=>{actual=currentModelExecution("image")!.frozen;});
      check(actual.facts,prepared.facts,"execution consumes saved decision, not changed body/defaults");
      await assert.rejects(()=>withModelOperation({path:"/api/generate-image",body:{origin:"canvas"},references:0,preparedImage:{...prepared,modelDigest:"0".repeat(64)},versions:{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion}},async()=>{}),/准备方案/);checks++;
    }
    const {submitImagegen,getImagegenResult}=await import("../src/lib/imagegen/dispatch");let result=await submitImagegen(raw,owner);
    for(let i=0;i<500&&!['succeeded','failed','needs_attention'].includes(result.status);i++){await new Promise(r=>setTimeout(r,20));result=(await getImagegenResult(raw.operationId,owner))!;}
    check(result.status,"succeeded",JSON.stringify(result));check(result.chargedCredits,3,"original price on accepted task");check(supplier,1,"one supplier");
    check(wires[0].quality,"medium","frozen medium wire after default drift");check((await db.getPool().query("SELECT count(*)::int n FROM app_ledger WHERE email=$1 AND kind='consume'",[owner])).rows[0].n,1,"one consume");
    await submitImagegen(raw,owner);check(supplier,1,"accepted replay never reposts");
    // Historical plan JSON without the new field remains executable via the existing legacy adapter.
    const historical={...plan,request:{...plan.request,operationId:randomUUID()},steps:plan.steps.map(s=>{const copy={...s};delete copy.preparedImage;return copy;})};
    const {submitGenerationCore}=await import("../src/lib/imagegen/generation-core");const legacy=await submitGenerationCore(historical,"generate",owner);check(legacy.status,200,"old plan shape remains accepted");
    let child:any;for(let i=0;i<500;i++){child=(await db.getPool().query("SELECT snapshot,billing_settled FROM app_image_jobs WHERE id=$1",[legacy.body.jobId])).rows[0];if(['done','error'].includes(child?.snapshot.status))break;await new Promise(r=>setTimeout(r,20));}
    check(child?.snapshot.status,"done","old shape still delivered");check(supplier,2,"old plan executes only its own new operation");
    // Publish between the old identity and pricing reads: a quote must never mix those snapshots.
    const publish=async(config:typeof models.config)=>{const current=await originalCurrent(),actor=`fixture-${randomUUID()}`,d=await f.repo.draft(actor),s=await f.repo.saveDraft({id:d.id,expectedRevision:d.revision,config,actor}),p=await f.repo.stage({id:randomUUID(),draftId:s.id,expectedRevision:s.revision,expectedVersion:current.version,actor,reason:"mid-quote publication"});return f.repo.markApplied(p.id,p.digest);};
    const beforeConfig=structuredClone((await f.repo.current()).config);beforeConfig.business={...beforeConfig.business,"tool.retouch":{enabled:true,defaultModelId:"image-a",options:[{modelId:"image-a",enabled:true,sort:1,unit:"image",pricing:{mode:"cny-fixed",amountMicros:"30000",creditsPerCnyMicros:"100000000",rounding:"ceil"}}]}};
    const beforeSnapshot=await publish(beforeConfig),afterConfig=structuredClone(beforeConfig);afterConfig.business!["tool.retouch"]!.options[0].pricing={mode:"cny-fixed",amountMicros:"90000",creditsPerCnyMicros:"100000000",rounding:"ceil"};
    const originalPoolQuery=Pool.prototype.query;
    let raceReads=0,afterVersion=0,publishing=false;Pool.prototype.query=function(this:Pool,...args:unknown[]){
      if(!publishing&&/FROM app_model_config_state s\s+(?:LEFT\s+)?JOIN app_model_config_versions v ON v.version=s.active_version/.test(String(args[0]))){raceReads++;const pending=Reflect.apply(originalPoolQuery,this,args);if(raceReads===1)return pending.then(async(value:unknown)=>{publishing=true;try{afterVersion=(await publish(afterConfig)).version;}finally{publishing=false;}return value;});return pending;}
      return Reflect.apply(originalPoolQuery,this,args);
    } as typeof Pool.prototype.query;
    let raced;try{raced=await quoteForActor(owner,{...facts,feature:"tool.retouch"});}finally{Pool.prototype.query=originalPoolQuery;}
    check(raceReads,baseline?2:1,"mid-publication snapshot reads");check(raced.requestedCredits,baseline?9:3,"price uses the selected snapshot, not next publication");check(raced.modelVersion,baseline?afterVersion:beforeSnapshot.version,"model version and selected snapshot consistent");check(supplier,2,"registry publication test never generates");
    console.log(`IMAGE_PREPARATION_REFACTOR=PASS mode=${baseline?"BASELINE":"MODIFIED"} checks=${checks} MODEL_READS=${baseline?2:1} SYNTHETIC_REQUESTS=${baseline?1:0} MID_PUBLICATION_PRICE=${baseline?9:3} SHARED_QUALITY=${baseline?"LEGACY_ONLY":"HTTP_CANVAS_AGENT_WORKBENCH"} SELECTED_MODEL=${baseline?"SCOPE_OVERRIDES":"EXPLICIT"} PREPARED_EXECUTION=${baseline?0:1} OLD_PLAN=DELIVERED ORIGINAL_PRICE=3 CURRENT_PRICE=17 SUPPLIER_CALLS=2 CONSUME_REPLAY=0 REAL_PG=1 EXTERNAL=0`);
  }finally{if(db){await(await import("../src/lib/imagegen/coordination-pool")).closeImageCoordinationPool();await db.getPool().end();}await f.cleanup();await rm(media,{recursive:true,force:true});console.log("PREPARATION_CLEANUP=PASS SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1 MEDIA_REMOVED=1");}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
