import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {createModelFixture} from "./model-config-fixture";
import {createSupplierModelsHandler} from "../src/lib/supplier-models/access";
import {importConfiguredSupplierModels,ingestSupplierDirectory,listSupplierModels,readSupplierModel,saveSupplierModel,supplierModelHistory} from "../src/lib/supplier-models/repository";
import {unknownSupplierMetadata,supplierMetadataSchema} from "../src/lib/supplier-models/types";
import {refreshProviderCatalog} from "../src/lib/model-config/catalog-store";
import {SUPPLIER_MODELS_SQL} from "../src/lib/supplier-models/schema";
async function main(){
 const f=await createModelFixture(),actor="metadata-admin@example.test";
 try{
  const now=new Date().toISOString();f.config.upstreamModels[0].procurement={currency:"USD",basis:"image",amountMicros:"12500",source:"Isolated supplier estimate",updatedAt:now};
  const models=await f.repo.current(),beforeDraft=await f.repo.draft(actor);
  await f.sql.query(SUPPLIER_MODELS_SQL);await f.sql.query(SUPPLIER_MODELS_SQL);
  assert.equal((await readFile("scripts/migrations/20261009-supplier-model-metadata.sql","utf8")).trim(),SUPPLIER_MODELS_SQL.trim());
  await ingestSupplierDirectory(f.sql,f.config.providers[0],[{id:"wire-image-one",label:"Directory one"},{id:"unclassified-model",label:"Unknown supplier model",ownedBy:"owner-is-not-brand"}]);
  await importConfiguredSupplierModels(f.sql,f.config);
  const filter={query:"",provider:"",family:"",brand:"",basis:"",state:"",page:1};
  const list=await listSupplierModels(f.sql,filter),known=list.models.find(m=>m.modelId==="wire-image-one")!,unknown=list.models.find(m=>m.modelId==="unclassified-model")!;
  assert.equal(known.capabilityState,"configured");assert.equal(known.revision,2);assert.equal(known.prices[0].amountMicros,"12500");
  assert.equal(unknown.capabilities.mask,null);assert.equal(unknown.capabilities.generate,null);assert.equal(unknown.brand,"");assert.equal(unknown.prices.length,0);assert.equal(unknown.catalogOwner,"owner-is-not-brand");
  const handler=createSupplierModelsHandler({authorize:async()=>({actor}),administration:async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,trustedOrigins:[f.origin]}) as never});
  const req=(body?:unknown,path="",origin?:string)=>new Request("http://fixture.test/api/admin/mvp/library"+path,{method:body?"POST":"GET",headers:{"content-type":"application/json",...(origin?{origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const curated=structuredClone(unknownSupplierMetadata());curated.family="Fixture family";curated.brand="Fixture brand";curated.modality="text";curated.capabilityState="documented";curated.capabilitySource="Isolated fixture documentation";curated.checkedAt=now.slice(0,10);curated.capabilities.streaming=true;curated.capabilities.contextTokens=128000;curated.parameterMetadata={temperature:{type:"number",minimum:0,maximum:2,default:0.7}};
  curated.prices=[{id:randomUUID(),quality:"",resolution:"",basis:"token",currency:"USD",amountMicros:null,inputMicrosPerMillion:"1000000",outputMicrosPerMillion:"3000000",cachedInputMicrosPerMillion:"250000",imageInputMicrosPerMillion:null,source:"Isolated fixture tariff",sourceUrl:"https://example.test/prices",checkedAt:now.slice(0,10),status:"documented"}];
  const body={action:"save",id:randomUUID(),modelId:known.id,expectedRevision:known.revision,metadata:curated};
  const saved=await handler(req(body));assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.revision,3);
  assert.equal((await handler(req(body))).status,200);assert.equal((await readSupplierModel(f.sql,known.id)).revision,3);
  assert.equal((await handler(req({...body,metadata:{...curated,brand:"different"}}))).status,409);
  assert.equal((await handler(req({...body,id:randomUUID()}))).status,409,"Concurrent stale revision");
  const matching=await listSupplierModels(f.sql,{...filter,brand:"Fixture brand",family:"Fixture family",provider:"p1",basis:"token",state:"documented"});assert.equal(matching.total,1);
  assert.equal((await listSupplierModels(f.sql,{...filter,basis:"image",brand:"Fixture brand"})).total,0);
  assert.equal((await f.sql.query("SELECT input_micros_per_million::text AS amount FROM app_supplier_model_price_points WHERE model_id=$1",[known.id])).rows[0].amount,"1000000");
  await importConfiguredSupplierModels(f.sql,f.config);await ingestSupplierDirectory(f.sql,f.config.providers[0],[{id:"wire-image-one",label:"Refreshed catalog name"}]);
  const preserved=await readSupplierModel(f.sql,known.id);assert.equal(preserved.brand,"Fixture brand");assert.deepEqual(preserved.parameterMetadata,curated.parameterMetadata);assert.deepEqual(preserved.prices,curated.prices);
  assert.equal((await supplierModelHistory(f.sql,known.id)).length,3);
  const invalid=structuredClone(curated);invalid.prices[0].amountMicros="200";assert.equal((await handler(req({...body,id:randomUUID(),expectedRevision:3,metadata:invalid}))).status,400);
  const noProof=structuredClone(curated);noProof.capabilitySource="";assert.equal(supplierMetadataSchema.safeParse(noProof).success,false);
  assert.equal(supplierMetadataSchema.safeParse({...curated,parameterMetadata:{authorization:"forbidden-credential-field"}}).success,false);
  assert.equal((await handler(req(body,"","https://evil.test"))).status,403);
  const denied=createSupplierModelsHandler({authorize:async()=>Response.json({},{status:404}) as never,administration:async()=>{throw Error("Must not read");}});assert.equal((await denied(req())).status,404);
  const auto=await refreshProviderCatalog(f.sql,f.config.providers[0],f.credentials,[f.origin],async()=>Response.json({data:[{id:"auto-discovered-model"}]}),true);assert.equal(auto.metadataSaved,true);
  assert.equal((await listSupplierModels(f.sql,{...filter,query:"auto-discovered"})).total,1);
  // Five simultaneous discovery requests must release their connection before metadata ingestion.
  await Promise.race([Promise.all(Array.from({length:5},()=>refreshProviderCatalog(f.sql,f.config.providers[0],f.credentials,[f.origin],async()=>Response.json({data:[{id:"parallel-model"}]}),true))),new Promise((_,reject)=>setTimeout(()=>reject(Error("Directory pool deadlock")),5000))]);
  assert.deepEqual(await f.repo.current(),models);assert.deepEqual(await f.repo.draft(actor),beforeDraft);
  console.log("SUPPLIER_METADATA=PASS ADDITIVE_REPLAY=PASS DIRECTORY_AUTO_INGEST=PASS UNKNOWN_NOT_FALSE_OR_ZERO=PASS OWNER_NOT_BRAND=PASS INPUT_OUTPUT_CACHE_COST=PASS FILTERS=PASS PARAMETER_SCHEMA=PASS CURATION_PRESERVED=PASS REVISION_HISTORY_CONFLICT=PASS AUTH_CSRF=PASS POOL_PARALLEL=PASS MODEL_DRAFT_PRICES_UNCHANGED=PASS PAID_GENERATION=0");
 }finally{await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
