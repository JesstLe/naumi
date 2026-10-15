import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { createModelExecutor } from "../src/lib/model-config/execution";
import { channelRoutingFetch } from "../src/lib/model-config/channel-fetch";
import { channelOperationKey, readChannelOperationPin } from "../src/lib/model-config/channel-availability";
import { ImageOperationPending, withImageOperation } from "../src/lib/image-gateway";
import type { ModelConfig, ModelSnapshot } from "../src/lib/model-config/types";

async function main() {
  const png=await sharp({create:{width:32,height:32,channels:4,background:"white"}}).png().toBuffer();
  let posts=0,gets=0,paid=0,backups=0,drop=false,complete=false;
  const tasks=new Map<string,any>();
  const f=await createModelFixture(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
    const path=req.url||"",body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    res.setHeader("content-type","application/json");
    if(path==="/v1/tasks" && req.method==="POST"){
      posts++;let task=tasks.get(body.operation_id);
      if(!task){paid++;task={id:randomUUID(),operation_id:body.operation_id,model:body.model,state:"reconciling"};tasks.set(body.operation_id,task)}
      if(drop){drop=false;return req.socket.destroy()}
      res.statusCode=202;return res.end(JSON.stringify(task));
    }
    if(path.startsWith("/v1/tasks/")){
      gets++;const task=[...tasks.values()].find(t=>path.endsWith(t.id));assert.ok(task);
      const result=complete?{...task,state:"succeeded",result:{data:[{b64_json:png.toString("base64")}]}}:task;
      return res.end(JSON.stringify(result));
    }
    if(path==="/v1/images/generations"){backups++;return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}))}
    res.statusCode=404;res.end("{}");
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
  const db=await import("../src/lib/db");
  try{
    const cred=await f.credentials.importPlain({providerId:"p2",plain:"fixture-backup",actor:"fixture"});
    f.config.providers.push({...f.config.providers[0],id:"p2",credentialRef:cred.id});
    f.config.providers[0].options={imageAdapter:"reverse-hub"};
    f.config.upstreamModels[0].model="jimeng/jimeng-image-5.0-pro";
    f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"u2",providerId:"p2",model:"fixture-backup"});
    f.config.publicModels[0].supplierRouting={mode:"priority",channels:[{upstreamId:"u1",enabled:true,priority:1,weight:1},{upstreamId:"u2",enabled:true,priority:2,weight:1}]};
    await f.repo.current();await db.ensureSchema();
    const publish=async(config:ModelConfig)=>{
      const actor="fixture-recovery",d=await f.repo.draft(actor),s=await f.repo.saveDraft({id:d.id,expectedRevision:d.revision,config,actor});
      const p=await f.repo.stage({id:randomUUID(),draftId:s.id,expectedRevision:s.revision,expectedVersion:(await f.repo.current()).version,actor,reason:"recovery fixture"});
      return f.repo.markApplied(p.id,p.digest);
    };
    const billing={version:1,digest:"b".repeat(64),config:fixtureConfig()};
    const executor=createModelExecutor({runtime:{byVersion:v=>f.repo.byVersion(v),prepareExecution:async()=>{throw Error("no router")}},credentials:f.credentials,billingByVersion:async()=>billing,trustedOrigins:[f.origin],gateway:()=>({baseUrl:f.origin,apiKey:"fixture"})});
    const freeze=async(snapshot:ModelSnapshot)=>executor.describe(await executor.resolve({feature:"image.generate",binding:"image.generate",requestedModelId:"image-a",snapshot,billing,facts:{task:"draft",quality:"medium",resolution:"1K",ratio:"1:1",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0}}));
    const before=await f.repo.current(),scope=await freeze(before);
    const fetcher=channelRoutingFetch(scope,{trustedOrigins:[f.origin]});
    const run=(id:string)=>withImageOperation("image-a",{id},()=>fetcher(f.origin+"/v1/images/generations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:"image-a",prompt:"fixture",n:1})}));
    await assert.rejects(run("accepted-one"),ImageOperationPending);
    assert.equal(posts,1);assert.equal(paid,1);assert.equal(backups,0);
    // Simulate an operation accepted by the pre-upgrade App: remove only the
    // routing pin, retain the real durable supplier task/receipt.
    await f.sql.query("DELETE FROM app_model_channel_operations");
    const off=structuredClone(before.config);off.publicModels[0].supplierRouting!.channels[0].enabled=false;await publish(off);
    complete=true;
    const result=await run("accepted-one");assert.equal(result.status,200);assert.equal((await result.json()).data.length,1);
    assert.equal(posts,1,"Disabled accepted task must use GET, never POST");assert.equal(paid,1);assert.equal(backups,0);
    assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_model_channel_operations")).rows[0].n,1,"Legacy ledger restores pin");
    console.log("LEGACY_ACCEPTED_HUB_DISABLED_GET_ONLY=PASS; NATIVE_PAID_OPERATIONS=1; BACKUP_POSTS=0");

    await publish(before.config);drop=true;complete=false;
    await assert.rejects(run("lost-receipt"),ImageOperationPending);assert.equal(posts,2);assert.equal(paid,2);
    await publish(off);
    await assert.rejects(run("lost-receipt"),ImageOperationPending);
    assert.equal(posts,2,"Unknown paid acceptance + closed channel must hold, not re-POST");assert.equal(backups,0);
    complete=true;await publish(before.config);
    const recovered=await run("lost-receipt");assert.equal(recovered.status,200);await recovered.json();
    assert.equal(posts,3,"Re-enabled original Hub may replay its same idempotent operation");assert.equal(paid,2,"Idempotent replay must not create another paid native task");assert.equal(backups,0);
    console.log("LOST_RECEIPT_DISABLED_HOLD_ORIGINAL_IDEMPOTENT_RECOVERY=PASS; NATIVE_PAID_OPERATIONS=2; BACKUP_POSTS=0");

    // A missing ACTIVE pointer fails closed. It cannot silently revive frozen
    // channels; restore the fixture pointer in the finally block.
    const active=(await f.repo.current()).version;
    await f.sql.query("UPDATE app_model_config_state SET active_version=NULL WHERE singleton=true");
    try{await assert.rejects(run("missing-active"),(e:any)=>e.code==="CONFIG_UNAVAILABLE");assert.equal(backups,0)}
    finally{await f.sql.query("UPDATE app_model_config_state SET active_version=$1 WHERE singleton=true",[active])}
    assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_model_provider_leases")).rows[0].n,0);
    assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_model_channel_health WHERE failures>0")).rows[0].n,0,"Uncertain Hub work is not a failed channel probe");
    console.log(`RECOVERY=PASS; GETS=${gets}; CAPACITY_LEAKS=0; MISSING_ACTIVE_FAIL_CLOSED=PASS; REAL_PAID_CALLS=0`);
  }finally{await db.getPool().end();await f.cleanup();console.log("ISOLATED_SCHEMA_CLEANUP=PASS")}
}
main().catch(e=>{console.error(e);process.exitCode=1});
