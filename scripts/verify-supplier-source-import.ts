import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";
import { refreshProviderCatalog } from "../src/lib/model-config/catalog-store";
import { listSupplierModels, readSupplierModel, saveSupplierModel } from "../src/lib/supplier-models/repository";

async function main() {
 const f = await createModelFixture();
 try {
  const initial = await f.repo.current();
  let amount = 0.12;
  const fetcher: typeof fetch = async (url, init) => {
   if (String(url).endsWith("/api/pricing")) {
    assert.equal(new Headers(init?.headers).has("authorization"),false);
    return Response.json({success:true,data:[{model_name:"gpt-image-2.5",icon:"OpenAI",tags:"image,openai",description:"Public parameters",price:{currency:"CNY",unit:"image",request:amount},group_prices:{"生图":{currency:"CNY",unit:"image",request:0.08}},api_key:"sk-test0000000000000000"},{model_name:"unavailable-text",icon:"Claude.Color",tags:"text",price:{currency:"USD",unit:"1M_tokens",input:1,output:3}},{model_name:"ratio-only",model_ratio:2,completion_ratio:3}]});
   }
   return Response.json({data:[{id:"gpt-image-2.5",owned_by:"system",extra:{parameters:["size","quality"],authorization:"secret"}}]});
  };
  const refresh = () => refreshProviderCatalog(f.sql,f.config.providers[0],f.credentials,[f.origin],fetcher,true);
  const first = await refresh(); assert.equal(first.metadataSaved,true); assert.equal(first.models.length,1); assert.equal("sourceModels" in first,false);
  const filter={query:"",provider:"p1",family:"",brand:"",basis:"",state:"",page:1};
  let listing=await listSupplierModels(f.sql,filter); assert.equal(listing.total,3);
  const image=listing.models.find(m=>m.modelId==="gpt-image-2.5")!,text=listing.models.find(m=>m.modelId==="unavailable-text")!,ratio=listing.models.find(m=>m.modelId==="ratio-only")!;
  assert.equal((image.parameterMetadata.upstreamImport as any).accessibleWithCurrentKey,true);
  assert.equal((text.parameterMetadata.upstreamImport as any).accessibleWithCurrentKey,false);
  assert.equal(image.prices[0].amountMicros,"120000"); assert.equal(image.prices[1].amountMicros,"80000");
  assert.equal(text.prices[0].inputMicrosPerMillion,"1000000"); assert.equal(ratio.prices.length,0);
  assert.equal(image.capabilityState,"documented"); assert.equal(image.capabilities.edit,null);
  assert.ok(!JSON.stringify(listing).includes("sk-test")); assert.ok(!JSON.stringify(listing).includes('"authorization"'));
  await refresh(); assert.equal((await readSupplierModel(f.sql,image.id)).revision,image.revision);
  assert.equal((await f.sql.query("SELECT count(*) FROM app_supplier_source_snapshots")).rows[0].count,"2");
  const {id,providerId,providerName,modelId,label,catalogOwner,revision,lastSeenAt,updatedAt,...manual}=image;
  manual.brand="Manual brand"; manual.parameterMetadata.qualityDefaults={mode:"map",values:{low:"high"}}; manual.prices[0].amountMicros="777000";
  await saveSupplierModel(f.sql,{id:randomUUID(),modelId:image.id,expectedRevision:image.revision,metadata:manual,actor:"fixture-admin"});
  amount=0.2; await refresh();
  const updated=await readSupplierModel(f.sql,image.id); assert.equal(updated.brand,"Manual brand");assert.equal(updated.prices[0].amountMicros,"777000"); assert.deepEqual(updated.parameterMetadata.qualityDefaults,manual.parameterMetadata.qualityDefaults);
  assert.equal((updated.parameterMetadata.upstreamImport as any).publicModel.price.request,0.2);
  assert.equal((await f.sql.query("SELECT count(*) FROM app_supplier_source_snapshots")).rows[0].count,"3");
  assert.equal((await listSupplierModels(f.sql,{...filter,basis:"token",brand:"Claude"})).total,1);
  assert.deepEqual(await f.repo.current(),initial,"public directory never opens execution models or changes prices");
  console.log("SUPPLIER_SOURCE_IMPORT=PASS PUBLIC_VS_KEY_ACCESS=PASS EXPLICIT_CURRENCY_UNITS=PASS RATIOS_NOT_PRICES=PASS IDEMPOTENT_REVISION=PASS RAW_SOURCE_HISTORY=PASS MANUAL_PRICES_MAPPING_PRESERVED=PASS NO_CREDENTIALS=PASS NO_AUTO_EXECUTION_MODEL=PASS");
 } finally {await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
