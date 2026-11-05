import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";

async function main() {
  const f=await createModelFixture();
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"entry-fixture-control-token-20261020",MODEL_CONFIG_ENVELOPE_SECRET:"entry-fixture-envelope-secret-20261020",OPENAI_IMAGE_QUALITY:"medium"});
  const first=f.config.upstreamModels[0];
  first.capabilities.edit=false;
  first.capabilities.qualities=["medium"];
  first.parameterMap={};
  f.config.upstreamModels.push({...structuredClone(first),id:"u2",model:"edit-only",capabilities:{...first.capabilities,generate:false,edit:true,preserveIdentity:true,maxReferenceImages:8}});
  f.config.publicModels[0].supplierRouting={mode:"priority",channels:[{upstreamId:"u1",enabled:true,priority:1,weight:1},{upstreamId:"u2",enabled:true,priority:2,weight:1}]};
  const snapshot=await f.repo.current();
  const db=await import("../src/lib/db");
  const {withModelRequest}=await import("../src/lib/model-config/requests");
  const {currentModelExecution,runModelExecution}=await import("../src/lib/model-config/context");
  const {withQualityFallback}=await import("../src/lib/image-quality-request");
  const {resolveConfiguredImageQuality}=await import("../src/lib/model-config/image-quality");
  const {publicModelCatalog}=await import("../src/lib/model-config/runtime");
  const {validateToolScopes}=await import("../src/lib/model-config/tool-scope");
  const {batchFeatureAvailability}=await import("../src/lib/model-config/batch");
  const failures:string[]=[];
  const check=async(name:string,run:()=>unknown)=>{try{await run();console.log(`PASS ${name}`);}catch(error){failures.push(name);console.error(`FAIL ${name}`,error);}};
  const json=(body:Record<string,unknown>)=>new Request("http://fixture.test/api/generate-image",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({origin:"canvas",model:"image-a",prompt:"fixture",...body})});
  const scope=(r:Request)=>withModelRequest(r,async()=>{const s=currentModelExecution("image");assert.ok(s);return s;});
  try {
    await check("plain canvas selects generation and only generation-capable channels",async()=>{
      const s=await scope(json({}));assert.equal(s.frozen.binding,"image.generate");assert.equal(s.frozen.facts!.needsEdit,false);assert.equal(s.frozen.facts!.references,0);assert.deepEqual(s.supplierRouting!.targets.map(t=>t.upstreamId),["u1"]);
    });
    await check("JSON null never crashes model admission before route validation",async()=>{
      await withModelRequest(new Request("http://fixture.test/api/generate-image",{method:"POST",headers:{"content-type":"application/json"},body:"null"}),async()=>{});
    });
    await check("multipart ref/top pictures are counted, masks excluded, edit selected",async()=>{
      const body=new FormData();body.set("model","image-a");body.set("origin","canvas");
      for(const key of ["ref","top","mask"])body.set(key,new File([new Uint8Array([1])],`${key}.png`,{type:"image/png"}));
      const s=await scope(new Request("http://fixture.test/api/generate-image",{method:"POST",body}));
      assert.equal(s.frozen.facts!.references,2);assert.equal(s.frozen.binding,"image.edit");assert.deepEqual(s.supplierRouting!.targets.map(t=>t.upstreamId),["u2"]);
    });
    await check("unsupported or malformed quality uses default before transport; raw audit retained",async()=>{
      for(const raw of ["high","unrecognized"]){const chosen=await scope(json({quality:raw}));assert.equal(chosen.frozen.facts!.quality,"medium");assert.equal(chosen.frozen.requestedParameters!.quality,raw);}
      const s=await scope(json({quality:" MEDIUM "}));assert.equal(s.frozen.facts!.quality,"medium");
      const quality=await runModelExecution(s,async()=>resolveConfiguredImageQuality("high"));assert.equal(quality.requested,"medium");assert.equal(quality.executed,"medium");
    });
    await check("managed quality error never downgrades or posts twice",async()=>{
      const s=await scope(json({images:["fixture-reference"]}));
      const q={requested:"high",executed:"high" as const,fallbackReason:null};let attempts=0;
      await assert.rejects(()=>runModelExecution(s,()=>withQualityFallback(q,async()=>{attempts++;if(attempts===1)throw Object.assign(new Error("quality is unsupported"),{status:400});return "wrong-second-submit";})));
      assert.equal(attempts,1);assert.equal(q.executed,"high");assert.equal(q.fallbackReason,null);
    });
    await check("generation-only models can be listed and assigned to canvas, not edit tools",async()=>{
      const config=structuredClone(snapshot.config);config.publicModels[0].supplierRouting=undefined;delete config.bindings["image.edit"];
      config.publicModels[0].toolScope={features:["canvas.image"],defaultFor:["canvas.image"]};
      validateToolScopes(config);
      assert.deepEqual(publicModelCatalog({...snapshot,config},"image","canvas.image").models.map(m=>m.id),["image-a"]);
      const availability=batchFeatureAvailability(config,"u1");assert.equal(availability.find(a=>a.feature==="canvas.image")!.compatible,true);assert.equal(availability.find(a=>a.feature==="tool.retouch")!.compatible,false);
      const invalid=structuredClone(config);invalid.publicModels[0].toolScope!.features=["tool.retouch"];invalid.publicModels[0].toolScope!.defaultFor=[];assert.throws(()=>validateToolScopes(invalid));
      const d=await f.repo.draft("entry-fixture"),saved=await f.repo.saveDraft({id:d.id,expectedRevision:d.revision,config,actor:"entry-fixture"});
      const p=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:snapshot.version,actor:"entry-fixture",reason:"isolated generation-only canvas"});await f.repo.markApplied(p.id,p.digest);
      const owner=`entry-${randomUUID()}@example.test`;await db.getOrCreateUser(owner);
      const {quoteForActor}=await import("../src/lib/billing/server");
      const quote=await quoteForActor(owner,{feature:"canvas.image",modelId:"image-a",quantity:1,quality:"medium",resolution:"1K"});
      assert.equal(quote.facts.modelId,"image-a");assert.equal(quote.modelVersion,2);
      assert.equal((await scope(json({}))).frozen.binding,"image.generate");
    });
    assert.deepEqual(failures,[],`Entry regressions: ${failures.join(", ")}`);
    console.log(`IMAGE_ENTRY_CONSISTENCY=PASS FIXTURE=${randomUUID()} EXTERNAL_CALLS=0`);
  } finally {await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
