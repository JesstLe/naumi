import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { importConfiguredSupplierModels, readSupplierModel, listSupplierModels, saveSupplierModel } from "../src/lib/supplier-models/repository";

async function main(){
  const f=await createModelFixture();process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  const base=process.argv[2]||"48d1445e4f3076aa7bec8461707201c111fe2afc";
  const oldFile=resolve(`src/lib/model-config/.management-baseline-${randomUUID()}.ts`);
  writeFileSync(oldFile,execFileSync("git",["show",`${base}:src/lib/model-config/management-access.ts`]));
  const current=await import("../src/lib/model-config/management-access");
  const previous=await import(pathToFileURL(oldFile).href);
  const db=await import("../src/lib/db");
  try{
    // Duplicate wire identities under different upstream IDs must not multiply metadata reads.
    for(let i=0;i<60;i++)f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:`copy-${i}`,model:i%2?"wire-image-one":`wire-${i}`});
    const snapshot=await f.repo.current();await importConfiguredSupplierModels(f.sql,snapshot.config);
    const billing={version:8,config:fixtureConfig()};
    const deps={authorize:async()=>({actor:"fixture-admin"}),administration:async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,billing:{current:async()=>billing}}) as never,managed:async()=>true};
    const before=previous.createModelManagementHandler(deps),after=current.createModelManagementHandler(deps);
    const request=()=>new Request("http://fixture.test/api/admin/model-management");
    // Warm the existing schema creation paths; measured reads include no discovery or writes.
    assert.equal((await after(request())).status,200);
    const q=f.sql.query.bind(f.sql);let reads=0,writes=0;
    (f.sql as any).query=(...args:any[])=>{
      const sql=String(args[0]);if(sql.includes("SELECT m.* FROM app_supplier_model_metadata"))reads++;
      if(/^\s*(INSERT|UPDATE|DELETE)/i.test(sql))writes++;
      return (q as any)(...args);
    };
    const records=[];
    for(let n=0;n<3;n++){
      const bodies=[];const counts=[];
      for(const [label,handler] of [["baseline",before],["modified",after]] as const){
        reads=0;const t=performance.now(),r=await handler(request());assert.equal(r.status,200);bodies.push(await r.json());counts.push(reads);
        records.push({label,ms:Math.round(performance.now()-t),metadataReads:reads});
      }
      assert.deepEqual(bodies[1],bodies[0]);assert.deepEqual(counts,[3,1]);
    }
    assert.equal(writes,0);
    const listing=await listSupplierModels(f.sql,{query:"",provider:"",family:"",brand:"",basis:"",state:"",page:1});
    const model=listing.models.find(m=>m.modelId==="wire-image-one")!;
    const {id,providerId,providerName,modelId,label,catalogOwner,revision,lastSeenAt,updatedAt,...updated}=await readSupplierModel(f.sql,model.id);updated.parameterMetadata.qualityDefaults={mode:"omit"};
    await saveSupplierModel(f.sql,{id:randomUUID(),modelId:model.id,expectedRevision:model.revision,metadata:updated,actor:"fixture-admin"});
    updated.parameterMetadata.documentPadding="x".repeat(35000);
    await saveSupplierModel(f.sql,{id:randomUUID(),modelId:model.id,expectedRevision:model.revision+1,metadata:updated,actor:"fixture-admin"});
    const full=await listSupplierModels(f.sql,{query:"",provider:"",family:"",brand:"",basis:"",state:"",page:1});
    const summary=await listSupplierModels(f.sql,{query:"",provider:"",family:"",brand:"",basis:"",state:"",page:1},true);
    assert.equal(full.total,summary.total);assert.deepEqual(full.facets,summary.facets);
    assert.equal(summary.models.length,full.models.length);
    for(let i=0;i<full.models.length;i++){
      const {notes,parameterMetadata,capabilityUrl,capabilities,...rest}=full.models[i];
      assert.deepEqual(summary.models[i],{...rest,capabilities:{resolutions:capabilities.resolutions}});
    }
    assert.ok(JSON.stringify(summary).length<JSON.stringify(full).length-30000);
    assert.ok((await readSupplierModel(f.sql,model.id)).parameterMetadata.documentPadding);
    const oldBody=await(await before(request())).json(),newBody=await(await after(request())).json();assert.deepEqual(newBody,oldBody);
    assert.ok(JSON.stringify(newBody).includes('"mode":"omit"'),"No stale cross-request metadata cache");
    assert.deepEqual(await f.repo.current(),snapshot);assert.deepEqual(billing,{version:8,config:fixtureConfig()});
    const denied=current.createModelManagementHandler({...deps,authorize:async()=>Response.json({},{status:404}) as never,administration:async()=>{throw Error("must not read");}});
    assert.equal((await denied(request())).status,404);
    writeFileSync(resolve("output/admin-query-performance-20261021/MANAGEMENT_PERFORMANCE.json"),JSON.stringify(records,null,2));
    console.log("ADMIN_MANAGEMENT_PERFORMANCE=PASS comparisons=4 metadataReads=3->1 duplicateWireIdentities=PASS nextRevision=FRESH mutations=0 denied=404 supplierCalls=0");
  }finally{unlinkSync(oldFile);await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
