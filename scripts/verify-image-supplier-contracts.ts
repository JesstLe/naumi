import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";

async function main() {
  const baseline = process.argv.includes("--baseline"), calls: any[] = [];
  let failure: "none" | "unknown" | "accepted" | "rejected" = "none";
  const active = new Map<string, number>(), peaks = new Map<string, number>();
  const png = await sharp({create:{width:256,height:256,channels:3,background:"white"}}).png().toBuffer();
  const f = await createModelFixture(async (req,res) => {
    const chunks:Buffer[]=[]; for await(const c of req) chunks.push(Buffer.from(c));
    const request=new Request(f.origin+req.url,{method:"POST",headers:{"content-type":req.headers["content-type"]||"application/json"},body:Buffer.concat(chunks)});
    const body=request.headers.get("content-type")!.includes("multipart")?Object.fromEntries(await request.formData()):await request.json();
    calls.push(body); active.set(body.model,(active.get(body.model)||0)+1); peaks.set(body.model,Math.max(peaks.get(body.model)||0,active.get(body.model)!));
    await new Promise(r=>setTimeout(r,40)); active.set(body.model,active.get(body.model)!-1);
    res.setHeader("content-type","application/json");
    if(body.model==="wire-image-one"&&failure!=="none") {
      res.statusCode=failure==="accepted"?422:400;
      return res.end(JSON.stringify({error:{code:"fixture-rejection",...(failure==="accepted"?{billing_status:"task_failed"}:failure==="rejected"?{billing_status:"not_charged"}:{})}}));
    }
    res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"contracts-router-fixture-token-long",MODEL_CONFIG_ENVELOPE_SECRET:"contracts-envelope-fixture-secret-long",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",STORAGE_DRIVER:"local"});
  const second=await f.credentials.importPlain({providerId:"p2",plain:"fixture-independent-supplier-contract",actor:"fixture"});
  f.config.providers[0].maxConcurrent=3;
  f.config.providers.push({...f.config.providers[0],id:"p2",name:"Second fixture",credentialRef:second.id,maxConcurrent:2});
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"u2",providerId:"p2",model:"wire-image-two"});
  for(const u of f.config.upstreamModels)u.capabilities.preserveIdentity=true;
  f.config.upstreamModels[0].parameterMap={qualityPolicy:{mode:"map",choices:[{id:"medium",label:"标准",value:"vendor-medium"}]},resolutionPolicy:{mode:"map",field:"size",values:{"1K":"1024x1024","2K":"2048x2048"}}};
  f.config.upstreamModels[1].parameterMap={qualityPolicy:{mode:"omit",choices:[{id:"medium",label:"标准"}]},resolutionPolicy:{mode:"map",field:"resolution",ratioField:"size",values:{"1K":"1k","2K":"2k"}}};
  f.config.publicModels[0].supplierRouting={mode:"balanced",channels:[{upstreamId:"u1",enabled:true,priority:1,weight:3},{upstreamId:"u2",enabled:true,priority:1,weight:2}]};
  const initial=await f.repo.current(),db=await import("../src/lib/db");
  try {
    await db.ensureSchema(); const owner=`supplier-contract-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,"Fixture");
    const admin=await(await import("../src/lib/model-config/server")).getModelAdministration(),billing=await admin.billing.current();
    const executor=(await import("../src/lib/model-config/execution")).createModelExecutor({runtime:{byVersion:f.repo.byVersion,prepareExecution:async()=>{throw Error("No external Router allowed");}},credentials:f.credentials,billingByVersion:async()=>billing,trustedOrigins:[f.origin],gateway:()=>{throw Error("No gateway allowed");}});
    const facts={task:"draft" as const,quality:"medium",resolution:"2K",requestedResolution:"2K",ratio:"1:1",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0};
    const freeze=(snapshot=initial,extra:Record<string,unknown>={})=>executor.resolve({binding:"image.generate",feature:"image.generate",requestedModelId:"image-a",snapshot,billing,facts,...extra});
    const publish=async(config:typeof f.config)=>{const current=await f.repo.current(),d=await f.repo.draft("contracts-fixture"),saved=await f.repo.saveDraft({id:d.id,expectedRevision:d.revision,config,actor:"contracts-fixture"});const p=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor:"contracts-fixture",reason:"isolated supplier contracts"});await f.repo.markApplied(p.id,p.digest);return f.repo.current();};
    if(!baseline){
      const client=(await executor.clientFor(await freeze())).client;
      await Promise.all(Array.from({length:5},()=>client.images.generate({model:"stale-name",prompt:"fixture",n:1,quality:"high"})));
      assert.equal(calls.filter(c=>c.model==="wire-image-one").length,3);assert.equal(calls.filter(c=>c.model==="wire-image-two").length,2);
      assert.ok((peaks.get("wire-image-one")||0)<=3);assert.ok((peaks.get("wire-image-two")||0)<=2);
      for(const c of calls){if(c.model==="wire-image-one"){assert.equal(c.quality,"vendor-medium");assert.equal(c.size,"2048x2048");assert.equal(c.resolution,undefined);}else{assert.equal(c.quality,undefined);assert.equal(c.size,"1:1");assert.equal(c.resolution,"2k");}}
      const {executionFetch}=await import("../src/lib/model-config/clients");
      const {toFile}=await import("openai");
      for(const id of ["u1","u2"]){
        const scope=await executor.describe(await freeze(initial,{imageUpstreamIds:[id]}));
        const fd=new FormData();fd.set("model","stale");fd.set("quality","high");fd.set("size","wrong");fd.set("resolution","wrong");fd.set("prompt","fixture edit");fd.set("image",await toFile(png,"reference.png",{type:"image/png"}));
        await(await executionFetch(scope,{trustedOrigins:[f.origin]})(f.origin+"/v1/images/edits",{method:"POST",body:fd})).text();
        const c=calls.at(-1);assert.equal(c.model,id==="u1"?"wire-image-one":"wire-image-two");assert.ok(c.image instanceof File);assert.deepEqual(Buffer.from(await c.image.arrayBuffer()),png);
        if(id==="u1"){assert.equal(c.quality,"vendor-medium");assert.equal(c.size,"2048x2048");assert.equal(c.resolution,undefined);}else{assert.equal(c.quality,undefined);assert.equal(c.size,"1:1");assert.equal(c.resolution,"2k");}
      }
    }
    const priority=structuredClone(initial.config);priority.publicModels[0].supplierRouting!.mode="priority";priority.publicModels[0].supplierRouting!.channels[1].priority=2;
    const prioritySnapshot=await publish(priority),priorityClient=(await executor.clientFor(await freeze(prioritySnapshot))).client;
    for(const mode of ["unknown","accepted","rejected"] as const){
      await db.getPool().query("DELETE FROM app_model_channel_health");failure=mode;const n=calls.length;
      const call=()=>priorityClient.images.generate({model:"image-a",prompt:"fixture rejection",n:1});
      if(baseline||mode==="rejected")await call();else await assert.rejects(call);
      assert.deepEqual(calls.slice(n).map(c=>c.model),baseline||mode==="rejected"?["wire-image-one","wire-image-two"]:["wire-image-one"]);
    }
    failure="none";
    const nativeRoute=structuredClone(prioritySnapshot.config);
    nativeRoute.upstreamModels[0].capabilities.nativeResolutions=["1K"];
    delete nativeRoute.upstreamModels[0].parameterMap.resolutionPolicy!.values["2K"];
    nativeRoute.upstreamModels.push({...structuredClone(nativeRoute.upstreamModels[1]),id:"u3",providerId:"p1",model:"missing-native-map",parameterMap:{}});
    nativeRoute.publicModels[0].supplierRouting!.channels.push({upstreamId:"u3",enabled:true,priority:1,weight:3});
    const nativeSnapshot=await publish(nativeRoute);
    const resolveNative=()=>freeze(nativeSnapshot,{facts:{...facts,nativeResolution:true}});
    if(baseline)await assert.rejects(resolveNative,/映射/);else{
      const frozenNative=await resolveNative(),nativeScope=await executor.describe(frozenNative);
      assert.deepEqual(nativeScope.supplierRouting!.targets.map(t=>t.upstreamId),["u2"],"An incompatible primary must not block a compatible native-resolution supplier");
      const n=calls.length;await(await executor.clientFor(frozenNative)).client.images.generate({model:"image-a",prompt:"native fixture",n:1});
      assert.equal(calls.length,n+1);assert.equal(calls.at(-1).model,"wire-image-two");assert.equal(calls.at(-1).resolution,"2k");
    }
    const ratioConfig=structuredClone(prioritySnapshot.config);ratioConfig.providers[0].options={imageAdapter:"reverse-hub"};ratioConfig.upstreamModels[0].model="jimeng/jimeng-image-5.0-pro";
    const ratioSnapshot=await publish(ratioConfig),{planImagegen}=await import("../src/lib/imagegen/plan");
    const request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"draw a bottle",modelId:"image-a",parameters:{quality:"medium",resolution:"1K",ratio:"4:5"}});
    const plan=await planImagegen(request,owner);assert.deepEqual(plan.steps[0].eligibleUpstreamIds,["u2"]);
    const described=await executor.describe(await freeze(ratioSnapshot,{facts:{...facts,resolution:"1K",requestedResolution:"1K",ratio:"4:5"},imageUpstreamIds:plan.steps[0].eligibleUpstreamIds}));
    assert.deepEqual(described.supplierRouting!.targets.map(t=>t.upstreamId),baseline?["u1","u2"]:["u2"]);
    // Drive the real step -> withModelRequest -> frozen child path without a supplier POST.
    if(!baseline){
      const {withImagegenStep}=await import("../src/lib/imagegen/context"),{withModelRequest}=await import("../src/lib/model-config/requests"),{currentModelExecution}=await import("../src/lib/model-config/context");
      await withImagegenStep(plan.request,plan.intent,()=>withModelRequest(new Request(f.origin+"/api/generate-image",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:"image-a",prompt:"fixture",ratio:"4:5",resolution:"1K",quality:"medium"})}),async()=>assert.deepEqual(currentModelExecution("image")!.supplierRouting!.targets.map(t=>t.upstreamId),["u2"])),plan.ratioContractVersion,plan.requestedParameters,plan.steps[0].eligibleUpstreamIds);
      const legacy=await executor.describe(await freeze(ratioSnapshot,{facts:{...facts,resolution:"1K",requestedResolution:"1K",ratio:"4:5"}}));assert.equal(legacy.supplierRouting!.targets.length,2,"Historical tasks without a frozen admission list retain their old interpretation");
      await assert.rejects(()=>freeze(ratioSnapshot,{imageUpstreamIds:[]}));
    }
    const native=structuredClone(prioritySnapshot.config);
    for(const u of native.upstreamModels)u.capabilities.imagegen={inputFidelity:{state:"supported",values:["high"],source:"local fixture",checkedAt:"2026-10-20"}};
    native.upstreamModels[0].parameterMap.imagegen={inputFidelity:"omit"};native.upstreamModels[1].parameterMap.imagegen={inputFidelity:"input_fidelity"};
    await publish(native);const advanced=imagegenRequestSchema.parse({...request,parameters:{quality:"medium",resolution:"1K",ratio:"1:1",inputFidelity:"high"}});
    if(baseline)await assert.rejects(()=>planImagegen(advanced,owner),/参数映射/);else{const p=await planImagegen(advanced,owner);assert.deepEqual(p.steps[0].eligibleUpstreamIds,["u2"]);}
    assert.equal((await db.getPool().query("SELECT count(*)::int n FROM app_model_provider_leases")).rows[0].n,0);
    console.log(baseline?"BASELINE_REPRODUCED=UNPROVEN_4XX_FAILOVER_AND_PLAN_CANDIDATE_DRIFT_AND_ADVANCED_FAMILY_REJECTION":"SUPPLIER_CONTRACTS=PASS FIVE_REQUESTS=3:2 JSON_MULTIPART_DISTINCT_MAPS=PASS FROZEN_CANDIDATES=PASS LEGACY_RETAINED=PASS ADVANCED_FILTER=PASS UNPROVEN_4XX_NO_SECOND_POST=PASS EXPLICIT_NOT_CHARGED_FALLBACK=PASS EXTERNAL_CALLS=0");
  }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
