import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig} from "./billing-unit-fixture";
import {createModelManagementHandler} from "../src/lib/model-config/management-access";
import {createModelRuntime} from "../src/lib/model-config/runtime";
import {importConfiguredSupplierModels,listSupplierModels,saveSupplierModel} from "../src/lib/supplier-models/repository";
import {metadataQualityDefaults} from "../src/lib/supplier-models/quality-defaults";
import {policyQuality,DISPLAY_QUALITY_IDS,DEFAULT_QUALITY_LABELS} from "../src/lib/model-config/quality-policy";
async function main(){
 const f=await createModelFixture();let digest="";const published=new Map();
 const router={prepare:async()=>{},state:async()=>digest,status:async(id:string)=>published.get(id)||null,activate:async(id:string,_old:string,next:string)=>{digest=next;const s={id,digest:next,phase:"applied"};published.set(id,s);return s;}} as never;
 const billing={version:1,config:fixtureConfig()},runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,trustedOrigins:[f.origin],billing:async()=>billing});
 const actor="metadata-default-test",handler=createModelManagementHandler({authorize:async()=>({actor}),managed:async()=>true,administration:async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,router,runtime,billing:{current:async()=>billing},trustedOrigins:[f.origin]}) as never});
 const req=(body?:unknown)=>new Request(f.origin+"/api/admin/model-management",{method:body?"POST":"GET",headers:{"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 try{
  const credential=await f.credentials.importPlain({providerId:"p2",plain:"fixture-only-second-provider",actor:"fixture"});
  f.config.providers.push({...f.config.providers[0],id:"p2",credentialRef:credential.id});
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"u2",providerId:"p2",parameterMap:{quality:{high:"vendor2_high"}}});
  f.config.publicModels.push({...structuredClone(f.config.publicModels[0]),id:"image-b",target:{type:"upstream",id:"u2"}});
  const before=await f.repo.current(),draft=await f.repo.draft(actor),missing=await(await handler(req())).json();assert.equal(missing.rows[0].qualityConfig.routes[0].mode,"omit");
  await importConfiguredSupplierModels(f.sql,before.config);const entries=await listSupplierModels(f.sql,{query:"",provider:"",family:"",brand:"",basis:"",state:"",page:1});const record=entries.models.find(m=>m.providerId==="p1")!;
  const defaults=metadataQualityDefaults({...record,capabilities:{...record.capabilities,qualities:["low","medium","high"]}});assert.equal(defaults.values.xhigh,"high");assert.equal(defaults.values.max,"high");
  assert.equal(metadataQualityDefaults({...record,capabilities:{...record.capabilities,qualities:["strange_vendor_enum"]},parameterMetadata:{}}).available,false);
  const metadata={...record,capabilities:{...record.capabilities,qualities:["low","medium","high"]},parameterMetadata:{qualityDefaults:{mode:"map",values:{low:"low",medium:"medium",high:"high",xhigh:"high",max:"high"}}}};
  const editable=Object.fromEntries(Object.keys((await import("../src/lib/supplier-models/types")).unknownSupplierMetadata()).map(k=>[k,metadata[k as keyof typeof metadata]])) as never;
  const saved=await saveSupplierModel(f.sql,{id:randomUUID(),modelId:record.id,expectedRevision:record.revision,metadata:editable,actor});
  const state=await(await handler(req())).json(),row=state.rows[0],route=row.qualityConfig.routes[0];assert.equal(route.metadataDefaults.revision,saved.revision);assert.equal(route.mode,"map");assert.equal(route.values.max,"high");
  const other=state.rows.find((r:any)=>r.id!==row.id);assert.notEqual(other.qualityConfig.routes[0].metadataDefaults.id,record.id);assert.equal(other.qualityConfig.routes[0].values.high,"vendor2_high");
  const body={action:"parameters",id:randomUUID(),expectedVersion:before.version,rowId:row.id,parameters:{choices:DISPLAY_QUALITY_IDS.map(id=>({id,label:DEFAULT_QUALITY_LABELS[id]})),routes:[{upstreamId:route.upstreamId,mode:"map",values:{max:"medium"},metadataRef:route.metadataRef}]}};
  assert.equal((await handler(req(body))).status,200);const frozen=await f.repo.current();assert.equal(policyQuality(frozen.config.upstreamModels[0].parameterMap.qualityPolicy,"xhigh"),"high");assert.equal(policyQuality(frozen.config.upstreamModels[0].parameterMap.qualityPolicy,"max"),"medium");
  const updated=structuredClone(editable) as any;updated.parameterMetadata.qualityDefaults.values.max="low";
  await saveSupplierModel(f.sql,{id:randomUUID(),modelId:record.id,expectedRevision:saved.revision,metadata:updated,actor});
  assert.equal((await handler(req(body))).status,200,"A replay retains its frozen library-derived mapping");
  assert.equal((await handler(req({...body,id:randomUUID(),expectedVersion:frozen.version}))).status,409,"Stale metadata must be rejected before publication");
  assert.equal(policyQuality((await f.repo.current()).config.upstreamModels[0].parameterMap.qualityPolicy,"max"),"medium");
  assert.deepEqual(await f.repo.draft(actor),draft);assert.deepEqual(frozen.config.publicModels,before.config.publicModels);
  console.log("METADATA_DEFAULTS=PASS EXACT_SUPPLIER_MODEL=PASS KNOWN_TIER_FALLBACK=PASS UNKNOWN_NO_GUESS=PASS NATIVE_PUBLISH=PASS MANUAL_OVERRIDE=PASS BLANK_DEFAULT=PASS STALE_METADATA=409 REPLAY_FROZEN=PASS DRAFT_PRICE_PRESERVED=PASS PAID_CALLS=0");
 }finally{await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
