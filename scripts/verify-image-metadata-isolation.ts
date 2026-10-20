import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";

/** Metadata failures are injected only into a disposable local fixture schema. */
async function main() {
  const wires:Record<string,unknown>[]=[];
  const png=await sharp({create:{width:256,height:256,channels:3,background:"white"}}).png().toBuffer();
  const f=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
    assert.equal(req.url,"/v1/images/generations");
    wires.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.setHeader("content-type","application/json");res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"metadata-isolation-router-fixture-long",MODEL_CONFIG_ENVELOPE_SECRET:"metadata-isolation-envelope-fixture-long",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,OPENAI_API_KEY:"fixture-only",STORAGE_DRIVER:"local"});
  f.config.upstreamModels[0].parameterMap={qualityPolicy:{mode:"map",choices:[{id:"medium",label:"标准",value:"published-tier"}]},resolutionPolicy:{mode:"map",field:"size",values:{"1K":"1024x1024","2K":"2048x2048"}}};
  const initial=await f.repo.current(),db=await import("../src/lib/db");
  try{
    await db.ensureSchema();const owner=`metadata-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,"Fixture");
    const {getModelAdministration}=await import("../src/lib/model-config/server"),admin=await getModelAdministration(),billing=await admin.billing.current();
    const {createModelExecutor}=await import("../src/lib/model-config/execution"),executor=createModelExecutor({runtime:{byVersion:f.repo.byVersion,prepareExecution:async()=>{throw Error("No Router allowed");}},credentials:f.credentials,billingByVersion:async()=>billing,trustedOrigins:[f.origin],gateway:()=>{throw Error("No gateway allowed");}});
    const facts={task:"product" as const,quality:"medium",resolution:"2K",requestedResolution:"2K",ratio:"1:1",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0};
    const freeze=(snapshot=initial)=>executor.resolve({binding:"image.generate",feature:"image.generate",requestedModelId:"image-a",snapshot,billing,facts});
    const frozen=await freeze(),frozenBytes=JSON.stringify(frozen);
    const send=async(model=frozen)=>{const {client}=await executor.clientFor(model);return executor.run(model,()=>client.images.generate({model:"stale-display-id",prompt:"local metadata isolation fixture",n:1,quality:"high"}));};
    const {planImagegen}=await import("../src/lib/imagegen/plan"),request=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"draw a bottle",parameters:{quality:"medium",resolution:"2K",ratio:"1:1"}});
    const planned=await planImagegen(request,owner);assert.deepEqual(planned.steps[0].eligibleUpstreamIds,["u1"]);assert.equal(wires.length,0);
    const {ingestSupplierDirectory,ingestSupplierSources}=await import("../src/lib/supplier-models/repository");
    const {unknownSupplierMetadata,supplierMetadataSchema}=await import("../src/lib/supplier-models/types");
    const {readQualityDefaults}=await import("../src/lib/supplier-models/quality-access"),{readResolutionDefaults}=await import("../src/lib/supplier-models/resolution-access"),{readImagegenDefaults}=await import("../src/lib/supplier-models/imagegen-access");
    const provider=initial.config.providers[0],wireModel=initial.config.upstreamModels[0].model;
    await ingestSupplierDirectory(f.sql,provider,[{id:wireModel,label:"fixture directory"}]);
    const conflicting=unknownSupplierMetadata();
    conflicting.capabilities.generate=false;conflicting.capabilities.edit=false;
    conflicting.parameterMetadata={qualityDefaults:{mode:"map",values:{medium:"metadata-tier"}},resolutionDefaults:{mode:"map",field:"resolution",values:{"2K":"metadata-2k"}},imagegen:{capabilities:{edit:{state:"unsupported",source:"local metadata fixture",checkedAt:"2026-10-20"}},wireMap:{transparent:"omit"}}};
    await f.sql.query("UPDATE app_supplier_model_metadata SET metadata=$1::jsonb,revision=revision+1",[JSON.stringify(supplierMetadataSchema.parse(conflicting))]);
    assert.equal((await readQualityDefaults(admin.pool,initial.config)).get("u1")!.values.medium,"metadata-tier");
    assert.equal((await readResolutionDefaults(admin.pool,initial.config)).get("u1")!.field,"resolution");
    assert.equal((await readImagegenDefaults(admin.pool,initial.config)).get("u1")!.capabilities.edit?.state,"unsupported");
    assert.deepEqual(await planImagegen(request,owner),planned,"Library false/unknown and conflicting suggestions must not replace published policy");
    await send();assert.equal(wires.at(-1)!.quality,"published-tier");assert.equal(wires.at(-1)!.size,"2048x2048");assert.equal(wires.at(-1)!.resolution,undefined);
    await ingestSupplierSources(f.sql,provider,{models:[{id:wireModel,label:"refreshed fixture"}],status:"ok",fetchedAt:"2026-10-20T15:45:00Z"},null);
    assert.deepEqual(await f.repo.current(),initial);assert.deepEqual(await admin.billing.current(),billing);assert.deepEqual(await planImagegen(request,owner),planned);
    // Corruption must affect metadata editing, not the already published image path.
    await f.sql.query("UPDATE app_supplier_model_metadata SET metadata='{}'::jsonb");
    await assert.rejects(()=>readImagegenDefaults(admin.pool,initial.config));
    assert.deepEqual(await planImagegen(request,owner),planned);await send();
    // A missing library is stronger than an empty response: its actual reader fails.
    await f.sql.query("ALTER TABLE app_supplier_model_metadata RENAME TO app_supplier_model_metadata_unavailable");
    await assert.rejects(()=>readImagegenDefaults(admin.pool,initial.config),/app_supplier_model_metadata/);
    const coldRepo=(await import("../src/lib/model-config/repository")).createModelRepository({pool:f.sql,trustedOrigins:[f.origin],initialize:async()=>{throw Error("Existing config cannot be bootstrapped again");}});
    assert.deepEqual(await coldRepo.current(),initial);assert.deepEqual(await coldRepo.byVersion(initial.version),initial);
    assert.deepEqual(await planImagegen(request,owner),planned);await send();
    // Only explicit publication changes NEW execution; the old immutable version stays put.
    const next=structuredClone(initial.config);next.upstreamModels[0].parameterMap.qualityPolicy!.choices[0].value="published-new";
    next.upstreamModels[0].parameterMap.resolutionPolicy={mode:"map",field:"resolution",ratioField:"aspect_ratio",values:{"1K":"1k","2K":"2k"}};
    const d=await f.repo.draft("fixture-admin"),saved=await f.repo.saveDraft({id:d.id,expectedRevision:d.revision,config:next,actor:"fixture-admin"});
    const publication=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:initial.version,actor:"fixture-admin",reason:"explicit fixture publication"});
    await f.repo.markApplied(publication.id,publication.digest);const current=await f.repo.current();
    await send(await freeze(current));assert.equal(wires.at(-1)!.quality,"published-new");assert.equal(wires.at(-1)!.resolution,"2k");assert.equal(wires.at(-1)!.aspect_ratio,"1:1");assert.equal(wires.at(-1)!.size,undefined);
    await send();assert.equal(wires.at(-1)!.quality,"published-tier");assert.equal(wires.at(-1)!.size,"2048x2048");assert.equal(JSON.stringify(frozen),frozenBytes);
    assert.equal(wires.length,5);assert.deepEqual(await admin.billing.current(),billing);
    assert.equal((await db.getPool().query("SELECT count(*)::int n FROM app_image_jobs")).rows[0].n,0,"This fixture verifies planning/wire isolation, not paid user-job acceptance");
    console.log("IMAGE_METADATA_ISOLATION=PASS MANUAL_PUBLISHED_POLICY_WINS=PASS REFRESH_NO_LIVE_OVERRIDE=PASS CORRUPT_AND_MISSING_LIBRARY_NO_IMAGE_BLOCK=PASS COLD_REPO=PASS EXPLICIT_PUBLICATION_ONLY=PASS FROZEN_TASK_UNCHANGED=PASS LOOPBACK_POSTS=5 EXTERNAL_CALLS=0");
  }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
