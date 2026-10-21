import assert from "node:assert/strict";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import type { ModelExecutionScope } from "../src/lib/model-config/context";

async function main() {
  const png = await sharp({create:{width:256,height:256,channels:4,background:"white"}}).png().toBuffer();
  const wrongPixels = await sharp({create:{width:128,height:256,channels:4,background:"white"}}).png().toBuffer();
  const tasks = new Map<string, {model:string; mode:string; n:number}>();
  const posts: any[] = [], gets: string[] = [], direct: any[] = [];
  let uploads=0, checks=0, origin="", transientDownloads=0;
  const f = await createModelFixture(async(req,res)=>{
    try {
      const url=new URL(req.url!,origin);
      if(url.pathname.startsWith("/media/")) {
        assert.equal(req.headers.authorization,undefined,"media must never receive supplier credentials");
        const mode=url.pathname.split("/")[2];
        if(mode==="transient"&&transientDownloads++===0){res.statusCode=503;return res.end("try download again");}
        return res.end(mode==="corrupt"?Buffer.from("not an image"):mode==="pixels"?wrongPixels:png);
      }
      assert.match(String(req.headers.authorization),/^Bearer fixture-/);
      if(url.pathname==="/v1/uploads/images") {
        uploads++; for await(const _ of req) { /* bounded fixture upload */ }
        return res.end(JSON.stringify({url:"https://fixture.invalid/uploaded.png"}));
      }
      if(url.pathname.startsWith("/v1/tasks/")) {
        const id=decodeURIComponent(url.pathname.split("/").pop()!); gets.push(id);
        const task=tasks.get(id)!; assert.ok(task,"must query the original task ID");
        const count=task.mode==="count"?task.n+1:task.n;
        return res.end(JSON.stringify({data:{id:task.mode==="identity"?"wrong_task":id, model:task.mode==="model"?"wrong-model":task.model,
          status:task.mode==="failed"?"failed":task.mode==="running"?"processing":"completed",cost:"0.01",usage:{output_tokens:1},
          result:{images:[{url:Array.from({length:count},()=>`${origin}/media/${task.mode}/output.png`)}]}}}));
      }
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const payload=JSON.parse(Buffer.concat(chunks).toString());
      if(payload.model==="wire-openai-backup") {direct.push(payload);return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));}
      posts.push(payload); assert.equal(req.url,"/v1/images/generations");
      assert.ok(req.headers["idempotency-key"]);assert.equal(req.headers["x-apimart-response-version"],"2026-07-27");
      const mode=payload.prompt.split(":")[0];
      if(mode==="reject") {res.statusCode=400;return res.end(JSON.stringify({error:{billing_status:"not_charged"}}));}
      if(mode==="http") {res.statusCode=503;return res.end(JSON.stringify({error:{message:"ambiguous supplier failure"}}));}
      if(mode==="lost")return req.socket.destroy();
      if(mode==="missing")return res.end(JSON.stringify({data:{status:"submitted"}}));
      const id=`task_${posts.length}`;tasks.set(id,{model:payload.model,mode,n:payload.n});
      res.end(JSON.stringify(mode==="legacy"?{data:[{task_id:id}]}:{data:{id,status:"submitted"}}));
    } catch(error) {res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
  });
  origin=f.origin;
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_MULTI_USER:"1"});
  const db=await import("../src/lib/db");
  try {
    const {ensureSupplierSchema}=await import("../src/lib/supplier-cost/schema");
    const {createModelExecutor}=await import("../src/lib/model-config/execution");
    const {executionFetch}=await import("../src/lib/model-config/clients");
    const {apimartImagesFetch}=await import("../src/lib/model-config/apimart-preset");
    const {runModelExecution}=await import("../src/lib/model-config/context");
    const {withImageOperation,ImageOperationPending,isImageGatewayModel}=await import("../src/lib/image-gateway");
    const {channelOperationKey,recoverableChannelIdentity,guardChannelSubmission,recoverableAPIMartImageOperation}=await import("../src/lib/model-config/channel-availability");
    const {compileRouterProjection}=await import("../src/lib/model-config/projection");
    const {validateModelConfig}=await import("../src/lib/model-config/schema");
    const {modelConfigDigest}=await import("../src/lib/model-config/repository");
    const {resolutionConfiguration}=await import("../src/lib/model-config/resolution-policy");
    const {qualityConfiguration}=await import("../src/lib/model-config/quality-policy");
    const {channelEditable}=await import("../src/lib/model-config/channel-policy");
    const c=f.config, u=c.upstreamModels[0];
    c.providers[0].protocol="apimart-images";c.providers[0].timeoutMs=1000;
    u.capabilities.maxReferenceImages=16;u.model="wire-apimart-exact";u.capabilities.qualityRank=5;u.capabilities.qualities=["medium","high"];
    u.parameterMap={apimartImages:{schemaVersion:1,maxOutputs:2,supportsMask:true,ratios:["1:1"],outputDimensions:{"1K:1:1":{width:256,height:256},"2K:1:1":{width:256,height:256}}},
      qualityPolicy:{mode:"map",choices:[{id:"medium",label:"标准",value:"standard"},{id:"high",label:"高",value:"high"}]},
      resolutionPolicy:{mode:"map",field:"resolution",ratioField:"aspect_ratio",values:{"1K":"1MP","2K":"2K"}}};
    for(const [id,protocol,model] of [["p2","openai-images","wire-openai-backup"],["p3","apimart-images","wire-apimart-other"]] as const) {
      const key=await f.credentials.importPlain({providerId:id,plain:`fixture-${id}`,actor:"fixture"});
      c.providers.push({...c.providers[0],id,protocol,credentialRef:key.id,name:id});
      c.upstreamModels.push({...structuredClone(u),id:id==="p2"?"u2":"u3",providerId:id,model,parameterMap:id==="p2"?{}:structuredClone(u.parameterMap)});
    }
    const channels=(ids:string[])=>({mode:"priority" as const,channels:ids.map((upstreamId,i)=>({upstreamId,enabled:true,priority:i+1,weight:1}))});
    c.publicModels.push({...c.publicModels[0],id:"image-family",supplierRouting:channels(["u1","u2"])});
    c.publicModels.push({...c.publicModels[0],id:"async-family",supplierRouting:{...channels(["u1","u3"]),mode:"balanced",channels:channels(["u1","u3"]).channels.map(ch=>({...ch,priority:1}))}});
    await db.ensureSchema();await ensureSupplierSchema(f.sql);
    const snapshot=await f.repo.current(),billing={version:1,config:fixtureConfig()};
    let routerPrepares=0;
    const runtime={byVersion:async()=>snapshot,prepareExecution:async()=>{routerPrepares++;return compileRouterProjection(snapshot,billing,{trustedOrigins:[origin]});},validateExecutionProjection:async()=>{}};
    const executor=createModelExecutor({runtime,credentials:f.credentials,billingByVersion:async()=>billing,gateway:()=>({baseUrl:origin,apiKey:"fixture-router"}),trustedOrigins:[origin]});
    const facts={task:"product" as const,quality:"high",resolution:"1K",ratio:"1:1",needsEdit:false,needsText:false,preserveIdentity:false,nativeResolution:true,references:0};
    const resolve=async(id="image-a")=>executor.describe(await executor.resolve({snapshot,billing,binding:"image.generate",requestedModelId:id,facts}));
    const scope=await resolve(),family=await resolve("image-family"),balanced=await resolve("async-family");
    const run=(s:ModelExecutionScope,unit:string,mode="success",extra:Record<string,unknown>={},fetcher=executionFetch(s,{trustedOrigins:[origin]}))=>runModelExecution(s,()=>withImageOperation(s.frozen.publicModelId,{id:unit},()=>fetcher(`${origin}/v1/images/generations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:`${mode}:fixture`,quality:"high",n:1,...extra})})));
    const pending=async(action:()=>Promise<unknown>)=>{await assert.rejects(action,ImageOperationPending);checks++;};
    const row=async(unit:string)=>(await f.sql.query("SELECT * FROM app_supplier_calls WHERE billing_unit_id=$1 ORDER BY started_at",[unit])).rows;
    const disable=async(off:boolean)=>{const live=structuredClone(c);live.providers[0].enabled=!off;live.upstreamModels[0].enabled=!off;for(const m of live.publicModels)for(const ch of m.supplierRouting?.channels||[])if(ch.upstreamId==="u1")ch.enabled=!off;await f.sql.query("UPDATE app_model_config_versions SET config=$2::jsonb WHERE version=$1",[snapshot.version,JSON.stringify(live)]);};
    assert.equal(scope.connection.protocol,"apimart-images");assert.equal(scope.frozen.routerDigest,undefined);assert.equal(routerPrepares,0);checks++;
    assert.equal(compileRouterProjection(snapshot,billing,{trustedOrigins:[origin]}).payload.config.routes.length,0);checks++;
    assert.ok(channelEditable(c,["image-a"]));assert.ok(qualityConfiguration(c,["u1"]).routes[0].editable);assert.ok(resolutionConfiguration(c,["u1"]).routes[0].editable);checks++;
    const old=structuredClone(snapshot);delete old.config.upstreamModels[0].parameterMap.apimartImages;delete old.config.upstreamModels[0].parameterMap.qualityPolicy;delete old.config.upstreamModels[0].parameterMap.resolutionPolicy;old.config.publicModels=old.config.publicModels.filter(m=>!m.supplierRouting);old.digest=modelConfigDigest(old.config);
    const oldExecutor=createModelExecutor({runtime:{...runtime,byVersion:async()=>old,prepareExecution:async()=>compileRouterProjection(old,billing,{trustedOrigins:[origin]})},credentials:f.credentials,trustedOrigins:[origin],gateway:()=>({baseUrl:origin,apiKey:"fixture-router"})});
    const frozenOld=await oldExecutor.resolve({snapshot:old,billing,binding:"image.generate",requestedModelId:"image-a",facts});assert.ok(frozenOld.routerDigest);assert.equal((await oldExecutor.describe(frozenOld)).connection.protocol,"router-images");checks++;
    const invalid=structuredClone(c);delete invalid.upstreamModels[0].parameterMap.apimartImages;assert.throws(()=>validateModelConfig(invalid,{trustedOrigins:[origin]}));checks++;
    for(const mode of ["legacy","success"]) {assert.equal((await run(scope,`direct-${mode}`,mode)).status,200);checks++;}
    assert.equal(posts[0].quality,"high","no preset medium cap");assert.equal(posts[0].resolution,"1MP");assert.equal(posts[0].aspect_ratio,"1:1");assert.equal(posts[0].model,"wire-apimart-exact");checks++;
    const before=posts.length;await run(scope,"direct-success");assert.equal(posts.length,before);checks++;
    assert.equal((await run(scope,"direct-success","success",{prompt:"changed"})).status,409);assert.equal(posts.length,before);checks++;
    const same=await Promise.allSettled([run(scope,"concurrent"),run(scope,"concurrent")]);assert.ok(same.some(r=>r.status==="fulfilled"));assert.equal(posts.length,before+1);assert.equal((await row("concurrent")).length,1);checks++;
    await run(family,"family-success");assert.equal(direct.length,0);assert.ok(await recoverableChannelIdentity(f.sql,family,"family-success"));checks++;
    assert.equal(await runModelExecution(family,async()=>isImageGatewayModel("image-family")),false,"mixed family is recoverable only after a pin");checks++;
    const familyPosts=posts.length;await disable(true);await run(family,"family-success");await run(scope,"direct-success");assert.equal(posts.length,familyPosts);checks++;
    const disabled=await run(scope,"new-disabled");assert.equal(disabled.status,422);assert.equal(posts.length,familyPosts);checks++;
    await disable(false);
    const key=channelOperationKey(family,"family-success")!;await f.sql.query("DELETE FROM app_model_channel_operations WHERE operation_key=$1",[key]);assert.ok(await recoverableChannelIdentity(f.sql,family,"family-success"));checks++;
    const raceStart=posts.length;const races=await Promise.allSettled(Array.from({length:6},()=>run(balanced,"balanced-race")));assert.ok(races.some(r=>r.status==="fulfilled"));assert.equal(posts.length,raceStart+1,"competing suppliers cannot double-submit");checks++;
    // Unknown/invalid outputs must retain task+cost evidence and never fall back.
    for(const mode of ["lost","missing","http","identity","corrupt"]) {
      // These are independent fault scenarios in this test's private schema.
      // A prior mode's real circuit cooldown must not suppress the next mode's
      // initial POST and make the assertion depend on test-machine speed.
      await f.sql.query("DELETE FROM app_model_channel_health");
      const start=posts.length;await pending(()=>run(family,`bad-${mode}`,mode));await pending(()=>run(family,`bad-${mode}`,mode));
      assert.equal(posts.length,start+1);assert.equal(direct.length,0);assert.equal((await row(`bad-${mode}`))[0].parameters.acceptedOutputs,undefined);checks++;
    }
    for(const mode of ["model","count","pixels","transient"]){
      await f.sql.query("DELETE FROM app_model_channel_health");
      const start=posts.length,response=await run(family,`bad-${mode}`,mode);assert.equal(response.status,200);
      const body=await response.json();assert.equal(body.data.length,1);await sharp(Buffer.from(body.data[0].b64_json,"base64")).metadata();
      await run(family,`bad-${mode}`,mode);assert.equal(posts.length,start+1);assert.equal(direct.length,0);
      const kept=(await row(`bad-${mode}`))[0];assert.equal(kept.parameters.acceptedOutputs,1);if(mode!=="transient")assert.ok(kept.parameters.deliveryNotices.length);else assert.equal(transientDownloads,3);checks++;
    }
    const failed=await run(family,"terminal-failed","failed");assert.equal(failed.status,422);assert.equal(direct.length,0);assert.ok(await recoverableChannelIdentity(f.sql,family,"terminal-failed"));checks++;
    const lossKey=channelOperationKey(family,"bad-lost")!;await f.sql.query("DELETE FROM app_model_channel_operations WHERE operation_key=$1",[lossKey]);assert.ok(await recoverableChannelIdentity(f.sql,family,"bad-lost"));await pending(()=>run(family,"bad-lost","lost"));checks++;
    // Definite not-charged responses alone may release the pin and choose backup.
    const rejected=await run(family,"not-charged","reject");assert.equal(rejected.status,200);assert.equal(direct.length,1);assert.equal((await row("not-charged"))[0].amount_micros,"0");checks++;
    const forms=(image:Buffer,mask?:Buffer)=>{const form=new FormData();form.set("prompt","success:edit");form.set("image",new File([image],"input.png",{type:"image/png"}));if(mask)form.set("mask",new File([mask],"mask.png",{type:"image/png"}));return form;};
    const edit=(unit:string,form:FormData)=>runModelExecution(scope,()=>withImageOperation("image-a",{id:unit},()=>executionFetch(scope,{trustedOrigins:[origin]})(`${origin}/v1/images/edits`,{method:"POST",body:form})));
    const uploadStart=uploads;assert.equal((await edit("valid-edit",forms(png,png))).status,200);assert.equal(uploads,uploadStart+1);assert.ok(posts.at(-1).mask_url.startsWith("data:image/png;base64,"));checks++;
    assert.equal((await edit("bad-input",forms(Buffer.from("bad")))).status,400);assert.equal((await edit("bad-mask",forms(png,wrongPixels))).status,400);assert.equal(uploads,uploadStart+1);checks++;
    assert.equal((await run(scope,"remote-reference","success",{image_urls:["https://private.invalid/image"]})).status,400);assert.equal((await run(scope,"too-many","success",{n:3})).status,400);checks++;
    const markerScope={...scope,capacityReserved:true,connection:{...scope.connection,timeoutMs:40}};
    const fast=apimartImagesFetch(markerScope,{trustedOrigins:[origin]},{pollMs:1});await pending(()=>run(markerScope,"timeout-original","running",{},fast));
    const timeoutPosts=posts.length;const saved=(await row("timeout-original"))[0];tasks.get(saved.task_id)!.mode="success";
    await disable(true);assert.equal((await run(markerScope,"timeout-original","running",{},fast)).status,200);assert.equal(posts.length,timeoutPosts);await disable(false);checks++;
    const guardScope={...family.supplierRouting!.targets[0].scope,channelGuard:{upstreamId:"u1",operationKey:channelOperationKey(family,"upload-gate")}};
    const {modelEndpointFetch}=await import("../src/lib/model-config/transport");
    await modelEndpointFetch(origin,{trustedOrigins:[origin]},{...guardScope.connection,costDisabled:true,costScope:guardScope})(`${origin}/v1/uploads/images`,{method:"POST",headers:{authorization:`Bearer ${f.marker}`},body:"fixture upload"});
    assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_model_channel_operations WHERE operation_key=$1",[guardScope.channelGuard.operationKey])).rows[0].n,0,"upload POST alone must not create generation dispatch pin");checks++;
    await guardChannelSubmission(f.sql,guardScope);assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_model_channel_operations WHERE operation_key=$1",[guardScope.channelGuard.operationKey])).rows[0].n,1);checks++;
    assert.equal(await recoverableAPIMartImageOperation(f.sql,scope,"direct-success"),true);
    assert.equal(await recoverableAPIMartImageOperation(f.sql,scope,"no-marker"),false);
    assert.equal(await recoverableAPIMartImageOperation(f.sql,family,"family-success"),true);
    assert.equal(await recoverableAPIMartImageOperation(f.sql,family,"no-marker"),false);
    assert.equal(await recoverableAPIMartImageOperation(f.sql,family,"not-charged"),false,"synchronous fallback is not async recovery");checks++;
    // A durable task with a confirmed task ID continues querying; marker-only
    // and expired tasks never acquire permission for a second paid submission.
    const {DurableImageJobs}=await import("../src/lib/durable-image-jobs");
    const durable=new DurableImageJobs<any>("generate");
    await db.getOrCreateUser("async-delivery@fixture.test");
    await durable.create("async-receipt-fixture","async-delivery@fixture.test",{status:"pending",createdAt:Date.now(),paidOperations:{"family-success":{state:"started",replayable:true}}},{},0,false);
    await f.sql.query("UPDATE app_supplier_calls SET operation_id='async-receipt-fixture',state='processing' WHERE billing_unit_id='family-success'");
    const postCount=posts.length;
    await runModelExecution(family,()=>durable.handlePending("async-receipt-fixture",new ImageOperationPending("family-success",Error("query deadline"))));
    assert.equal((await durable.get("async-receipt-fixture"))?.status,"pending");
    await durable.patch("async-receipt-fixture",{supplierQueryResumes:3});
    await runModelExecution(family,()=>durable.handlePending("async-receipt-fixture",new ImageOperationPending("family-success",Error("query deadline"))));
    assert.equal((await durable.get("async-receipt-fixture"))?.status,"error");assert.equal(posts.length,postCount);checks++;
    const good=(await row("direct-success"))[0];assert.equal(good.parameters.acceptedOutputs,1);assert.equal(good.amount_micros,"10000");assert.equal(good.cost_status,"reported");assert.equal(Number(good.model_version),snapshot.version);checks++;
    assert.ok((await f.sql.query("SELECT count(*)::int n FROM app_supplier_cost_jobs WHERE kind='task'")).rows[0].n>0);checks++;
    const {createSupplierLedger}=await import("../src/lib/supplier-cost/repository");
    const {runSupplierCostWorker}=await import("../src/lib/supplier-cost/worker");
    await f.sql.query("UPDATE app_supplier_accounts SET usage_enabled=false");
    await f.sql.query("UPDATE app_supplier_cost_jobs SET due_at=now()+interval '1 day'");
    const badPixels=(await row("bad-pixels"))[0];
    await f.sql.query("UPDATE app_supplier_cost_jobs SET due_at=now()-interval '1 second' WHERE key=$1",[`task:${badPixels.id}`]);
    const workerPosts=posts.length;
    const worker=await runSupplierCostWorker(createSupplierLedger(f.sql),{batch:1,fetcher:async(input,init)=>{const req=new Request(input,init);assert.equal(req.method,"GET");assert.equal(new URL(req.url).origin,origin);return fetch(req);}});
    assert.equal(worker.processed,1);assert.equal(posts.length,workerPosts);assert.equal((await row("bad-pixels"))[0].parameters.acceptedOutputs,1,"cost Worker preserves decoded delivered pixels");checks++;
    const sixteen=new FormData();sixteen.set("prompt","success:sixteen");for(let i=0;i<16;i++)sixteen.append("image",new File([png],`ref-${i}.png`,{type:"image/png"}));const sixteenUploads=uploads;assert.equal((await edit("sixteen-references",sixteen)).status,200);assert.equal(uploads,sixteenUploads+16);assert.equal(posts.at(-1).image_urls.length,16);checks++;
    console.log('APIB_REFERENCE_TRANSPORT=PASS INPUT_FILES=16 UPLOADS=16 WIRE_IMAGE_URLS=16 REAL_PAID_API_CALLS=0');
    console.log(`PASS APIMart async images: ${checks} checks; direct/family routing, legacy Router freeze, explicit parameters, task pin/CAS, concurrent suppliers, GET-only disabled recovery, marker-only hold, lost/ambiguous response, receipt identity/model/count/pixels/decode, uploads/mask, cost and acceptedOutputs gates`);
    console.log(`MOCK_ONLY posts=${posts.length} gets=${gets.length} uploads=${uploads} fallback=${direct.length}; REAL_PAID_API_CALLS=0`);
  } finally {await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
