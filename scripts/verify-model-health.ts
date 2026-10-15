import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {spawn} from "node:child_process";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
import { configuredHealthTargets,healthTargetKey } from "../src/lib/model-health/targets";
import { createHealthRepository } from "../src/lib/model-health/repository";
import { executeHealthProbe,healthExecutionScope } from "../src/lib/model-health/executor";
import { classifyHealthFailure } from "../src/lib/model-health/outcomes";
import { healthObservedFetch } from "../src/lib/model-health/observe";
import { createHealthHandler,healthWorkerAuthorized } from "../src/lib/model-health/access";
import { getPool } from "../src/lib/db";
import type { HealthTarget } from "../src/lib/model-health/targets";
import type { ModelSnapshot } from "../src/lib/model-config/types";

async function main(){
  const png=await sharp({create:{width:8,height:8,channels:3,background:"#1570ef"}}).png().toBuffer();
  const submitted:{model:string;n:number;id:string|null}[]=[];let mode="success",catalogCalls=0;
  const f=await createModelFixture(async(req,res)=>{
    if(req.url==="/v1/models"){catalogCalls++;res.end(JSON.stringify({data:Array.from({length:258},(_,i)=>({id:`catalog-${i}`}))}));return;}
    if(req.method==="GET"&&req.url?.startsWith("/image.png")){res.writeHead(mode==="download-failed"?503:200,{"content-type":"image/png"});res.end(png);return;}
    let raw="";for await(const part of req)raw+=part;const body=JSON.parse(raw);
    submitted.push({model:body.model,n:body.n,id:req.headers["idempotency-key"] as string||null});
    const code=Number(mode);if(code){res.writeHead(code,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"secret-must-not-persist"}}));return;}
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify(mode==="missing"?{data:[]}:mode==="corrupt"?{data:[{b64_json:Buffer.from("not-an-image").toString("base64")}]}:mode==="download-failed"?{data:[{url:`${f.origin}/image.png?signature=private`}]}:{data:[{b64_json:png.toString("base64")}]}));
  });
  const url=new URL(process.env.DATABASE_URL!);url.searchParams.set("options",`-c search_path=${f.schemaName}`);process.env.DATABASE_URL=url.toString();
  const db=getPool();const repo=createHealthRepository(f.sql);const success={success:true,reason:null,status:200,latencyMs:25} as const;
  const config=structuredClone(f.config);
  config.upstreamModels=[0,1,2].map(i=>({...structuredClone(config.upstreamModels[0]),id:`u${i}`,model:`wire-${i}`}));
  config.upstreamModels.push({...structuredClone(config.upstreamModels[0]),id:"alias"},{...structuredClone(config.upstreamModels[0]),id:"disabled",model:"disabled",enabled:false});
  const snapshot:ModelSnapshot={version:1,digest:"a".repeat(64),config};
  const targets=configuredHealthTargets(config);
  const reset=async()=>{await f.sql.query("TRUNCATE app_model_health_observations,app_model_health_probes");await f.sql.query("UPDATE app_model_health_policy SET enabled=true,stale_hours=6,daily_max_calls=12");};
  try{
    const policy=await repo.policy();assert.equal(policy.staleHours,6);assert.equal(policy.dailyMaxCalls,12);assert.equal(policy.timeZone,"Asia/Shanghai");
    assert.equal(targets.length,3);assert.equal(targets.find(t=>t.upstream.model==="wire-0")!.upstreamIds.length,2);
    console.log("PASS configured targets: 3, aliases deduplicated, disabled excluded, catalog calls: 0");
    const rotated=structuredClone(config);rotated.providers[0].credentialRef=randomUUID();assert.notEqual(configuredHealthTargets(rotated)[0].key,targets[0].key);
    const changed=structuredClone(config);changed.upstreamModels[0].parameterMap={qualityPolicy:{mode:"omit",choices:[{id:"medium",label:"标准"}]}};assert.notEqual(configuredHealthTargets(changed)[0].key,targets[0].key);
    for(const t of targets)assert.equal(healthTargetKey(healthExecutionScope(snapshot,t,"not-in-key")),t.key);
    console.log("PASS identity: credential/parameter changes invalidate health, exact wire model retained");
    for(const target of targets)await repo.observe(target,success);
    assert.equal(await repo.claim(targets,1),null);
    await f.sql.query("UPDATE app_model_health_observations SET last_business_success_at=now()-interval '6 hours 1 second'");
    const claim=await repo.claim(targets,1);assert.ok(claim);
    await repo.finish(claim.id,success);assert.equal((await repo.overview(snapshot)).budget.used,1);
    console.log("PASS six-hour suppression and expiry, successful probe consumes one global slot");
    await reset();
    const claims=await Promise.all(Array.from({length:24},()=>createHealthRepository(f.sql).claim(targets,1)));
    assert.equal(claims.filter(Boolean).length,1);await repo.finish(claims.find(Boolean)!.id,success);
    const many:HealthTarget[]=Array.from({length:32},(_,i)=>({...structuredClone(targets[0]),key:`test-target-${i}`,upstream:{...targets[0].upstream,model:`wire-${i}`}}));
    for(let i=1;i<18;i++){const c=await repo.claim(many,1);if(c)await repo.finish(c.id,success);}
    assert.equal((await repo.overview(snapshot)).budget.used,12);assert.equal(await repo.claim(many,1),null);
    console.log("PASS 24 concurrent claimants -> 1 running; global daily limit -> 12 including failures/reservations");
    await reset();
    const processes=await Promise.all(Array.from({length:4},()=>new Promise<{id:string|null}>((resolve,reject)=>{
      const child=spawn(process.execPath,["node_modules/tsx/dist/cli.mjs","scripts/model-health-claim-fixture.ts",JSON.stringify(snapshot)],{env:process.env,windowsHide:true});
      let stdout="",stderr="";child.stdout.on("data",b=>stdout+=b);child.stderr.on("data",b=>stderr+=b);child.on("error",reject);child.on("exit",code=>{if(code)reject(Error(stderr));else try{resolve(JSON.parse(stdout));}catch(e){reject(e);}});
    })));
    assert.equal(processes.filter(p=>p.id).length,1);await repo.finish(processes.find(p=>p.id)!.id!,success);
    for(let i=1;i<12;i++){const c=await repo.claim(many,1);assert.ok(c);await repo.finish(c.id,success);}
    assert.equal(await repo.claim(many,1),null);
    console.log("PASS four independent Node processes share one running claim and persistent 12-call budget");
    assert.equal((await f.sql.query("SELECT (t AT TIME ZONE 'Asia/Shanghai')::date::text AS day FROM (VALUES ('2026-10-14 15:59:59Z'::timestamptz),('2026-10-14 16:00:00Z'::timestamptz)) v(t)")).rows.map(r=>r.day).join(","),"2026-10-14,2026-10-15");
    await f.sql.query("UPDATE app_model_health_probes SET budget_day=budget_day-1");
    assert.ok(await repo.claim(many,1));
    console.log("PASS Shanghai midnight resets persisted daily budget, not process restart");
    await reset();const crash=await repo.claim([targets[0]],1);assert.ok(crash);
    await f.sql.query("UPDATE app_model_health_probes SET expires_at=now()-interval '1 second'");
    await f.sql.query("UPDATE app_model_health_observations SET probe_not_before=now()-interval '7 hours'");
    assert.equal(await repo.claim([targets[0]],1),null);assert.equal((await repo.overview(snapshot)).recent[0].state,"unknown");
    assert.equal(await createHealthRepository(f.sql).claim([targets[0]],1),null);
    console.log("PASS expired/crashed attempt is unknown and never resubmitted after restart");
    await repo.observe(targets[0],success);assert.equal(await repo.claim([targets[0]],1),null);
    await repo.observe(targets[0],{success:false,reason:"authentication",status:401,latencyMs:1});
    const mixed=await repo.overview(snapshot);assert.equal(mixed.providers[0].models.find(m=>m.key===targets[0].key)!.state,"unhealthy");
    await repo.observe(targets[1],success);assert.equal((await repo.overview(snapshot)).providers[0].state,"degraded");
    await f.sql.query("UPDATE app_model_health_observations SET last_success_at=now()-interval '7 hours',last_business_success_at=now()-interval '7 hours' WHERE key=$1",[targets[1].key]);
    assert.equal((await repo.overview(snapshot)).providers[0].models.find(m=>m.key===targets[1].key)!.state,"stale");
    console.log("PASS latest failure beats historic success; mixed provider aggregates degraded; stale != healthy");
    await reset();await f.sql.query("CREATE TABLE IF NOT EXISTS app_ledger(id int PRIMARY KEY,credits int); INSERT INTO app_ledger VALUES(1,123) ON CONFLICT DO NOTHING");
    const before=JSON.stringify((await f.sql.query("SELECT * FROM app_ledger")).rows);
    for(const t of targets){const c=await repo.claim([t],1);assert.ok(c);const r=await executeHealthProbe({pool:f.sql,snapshot,target:t,id:c.id,readCredential:f.credentials.read,trustedOrigins:[f.origin]});assert.equal(r.success,true);await repo.finish(c.id,r);}
    assert.equal(submitted.length,3);assert.equal(catalogCalls,0);assert.ok(submitted.every(s=>s.n===1&&s.id?.startsWith("health-")));assert.equal(new Set(submitted.map(s=>s.model)).size,3);
    const costs=await f.sql.query("SELECT * FROM app_supplier_calls");assert.equal(costs.rows.length,3);assert.ok(costs.rows.every(r=>r.feature==="system.model-health"&&r.operation_id.startsWith("health:")&&!r.user_email));
    assert.equal(JSON.stringify((await f.sql.query("SELECT * FROM app_ledger")).rows),before);
    assert.equal((await f.sql.query("SELECT count(last_business_success_at)::int n FROM app_model_health_observations")).rows[0].n,0);
    console.log("PASS real local HTTP adapter: 3 configured models, 1 image each, 3 supplier costs, 0 customer ledger changes");
    for(const test of [{mode:"401",reason:"authentication"},{mode:"403",reason:"authentication"},{mode:"402",reason:"quota"},{mode:"429",reason:"rate-limited"},{mode:"503",reason:"upstream-error"},{mode:"missing",reason:"invalid-output"},{mode:"corrupt",reason:"invalid-output"},{mode:"download-failed",reason:"image-download"}]){
      mode=test.mode;const before=submitted.length;const result=await executeHealthProbe({pool:f.sql,snapshot,target:targets[0],id:randomUUID(),readCredential:f.credentials.read,trustedOrigins:[f.origin]});assert.equal(result.success,false);assert.equal(result.reason,test.reason,test.mode);assert.equal(submitted.length,before+1,"each failure submits once without fallback");
    }
    assert.equal(classifyHealthFailure(new Error("network unreachable")).uncertain,true);
    console.log("PASS 401/403/402/429/503/HTTP200 empty/corrupt/download failure classified without fallback");
    mode="success";
    const businessScope=healthExecutionScope(snapshot,targets[0],f.marker);businessScope.frozen.feature="image.product";
    const observer=healthObservedFetch(businessScope,async()=>Response.json({data:[{b64_json:png.toString("base64")}]}),{});
    await observer(`${f.origin}/v1/images/generations`,{method:"POST"});assert.equal((await repo.overview(snapshot)).providers[0].models.find(m=>m.key===targets[0].key)!.state,"healthy");
    assert.equal(await repo.claim([targets[0]],1),null);
    const bad=healthObservedFetch(businessScope,async()=>Response.json({data:[]}),{});await assert.rejects(()=>bad(`${f.origin}/v1/images/generations`,{method:"POST"}));
    assert.equal((await repo.overview(snapshot)).providers[0].models.find(m=>m.key===targets[0].key)!.state,"unhealthy");
    console.log("PASS passive business observation requires decoded output; HTTP200 empty does not suppress failure");
    let ticks=0;const deps={administration:async()=>({pool:f.sql,repo:{current:async()=>snapshot}} as any),tick:async()=>{ticks++;return {processed:0};}};
    const denied=createHealthHandler({...deps,authorize:async()=>new Response(null,{status:403})});assert.equal((await denied(new Request("http://admin/api/admin/model-health"))).status,403);
    const handler=createHealthHandler({...deps,authorize:async()=>({actor:"fixture-admin"})});
    assert.equal((await handler(new Request("http://admin/api/admin/model-health",{method:"POST",headers:{origin:"https://evil.invalid"},body:JSON.stringify({action:"tick"})}))).status,403);assert.equal(ticks,0);
    assert.equal((await handler(new Request("http://admin/api/admin/model-health",{method:"POST",body:JSON.stringify({action:"tick"})}))).status,200);assert.equal(ticks,1);
    const info=await (await handler(new Request("http://admin/api/admin/model-health"))).json();
    assert.equal((await handler(new Request("http://admin/api/admin/model-health",{method:"POST",body:JSON.stringify({action:"policy",revision:info.revision,policy:{enabled:false,staleHours:6,dailyMaxCalls:12}})}))).status,200);
    assert.equal((await handler(new Request("http://admin/api/admin/model-health",{method:"POST",body:JSON.stringify({action:"policy",revision:info.revision,policy:{enabled:false,staleHours:6,dailyMaxCalls:12}})}))).status,409);
    assert.equal((await handler(new Request("http://admin/api/admin/model-health",{method:"POST",body:JSON.stringify({action:"policy",revision:info.revision+1,policy:{enabled:true,staleHours:1,dailyMaxCalls:13}})}))).status,400);
    const exposed=JSON.stringify(info);assert.ok(!exposed.includes(f.marker)&&!exposed.includes("secret-must-not-persist")&&!exposed.includes("signature=private"));
    delete process.env.MODEL_HEALTH_WORKER_SECRET;assert.equal(healthWorkerAuthorized(new Request("http://app")),false);process.env.MODEL_HEALTH_WORKER_SECRET="x".repeat(32);assert.equal(healthWorkerAuthorized(new Request("http://app",{headers:{"x-model-health-worker-secret":"x".repeat(32)}})),true);
    console.log("PASS admin authorization, CSRF, revision conflict, hard expense bounds, worker secret, secret-free output");
    await reset();const skipped=await repo.claim([targets[0]],1);assert.ok(skipped);
    const {ModelConfigError}=await import("../src/lib/model-config/types");
    const busy=await executeHealthProbe({pool:f.sql,snapshot,target:targets[0],id:skipped.id,readCredential:f.credentials.read,trustedOrigins:[f.origin]},{reserve:async()=>{throw new ModelConfigError("PROVIDER_BUSY","local busy",429);}});
    assert.equal(busy.skipped,true);await repo.finish(skipped.id,busy);let view=await repo.overview(snapshot);assert.equal(view.budget.used,0);assert.equal(view.providers[0].models.find(m=>m.key===targets[0].key)!.state,"unknown");
    console.log("PASS local capacity busy: skipped, no unhealthy result, no daily fee slot consumed");
    await reset();const unknown=await repo.claim([targets[0]],1);assert.ok(unknown);await repo.finish(unknown.id,{success:false,reason:"acceptance-unknown",status:null,latencyMs:null,uncertain:true});
    const observed=(await repo.overview(snapshot)).providers[0].models.find(m=>m.key===targets[0].key)!;assert.ok(observed.lastObservedAt);
    assert.equal(await repo.reconcile(targets[0].key,"2000-01-01T00:00:00.000Z","fixture-admin"),false);
    assert.equal(await repo.reconcile(targets[0].key,observed.lastObservedAt,"fixture-admin"),true);
    assert.equal(await repo.claim([targets[0]],1),null);assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_model_health_reconciliations")).rows[0].n,1);
    const ambiguous={success:false,reason:"upstream-error",status:502,latencyMs:10,uncertain:true} as const;await repo.observe(targets[1],ambiguous);
    assert.equal((await repo.overview(snapshot)).providers[0].models.find(m=>m.key===targets[1].key)!.state,"unknown");
    console.log("PASS audited reconciliation uses optimistic state, does not replay, waits six hours; passive uncertainty retained");
    console.log("MODEL_HEALTH_FIXTURE=PASS; EXTERNAL_SUPPLIER_CALLS=0");
  }finally{await db.end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
