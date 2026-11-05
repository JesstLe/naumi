import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig} from "./billing-unit-fixture";
import {createModelManagementHandler} from "../src/lib/model-config/management-access";
import {createModelRuntime} from "../src/lib/model-config/runtime";
import {createRouterControl,type RouterStatus} from "../src/lib/model-config/router-client";
import {ModelConfigError} from "../src/lib/model-config/types";

async function main(){
 const f=await createModelFixture();
 const out=path.resolve(process.argv.slice(2).find(value=>!value.startsWith("--"))||process.env.MODEL_MANAGEMENT_CONCURRENCY_EVIDENCE||path.join("output/model-management-concurrency",randomUUID()));await mkdir(out,{recursive:true});
 await writeFile(path.join(out,"FIXTURE_SCHEMA.json"),JSON.stringify({schema:f.schemaName,poolMax:f.sql.options.max}));
 let activations=0,activeDigest="",dropNext=false;const applied=new Map<string,RouterStatus>();
 const router=createRouterControl({baseUrl:f.origin,token:"concurrency-fixture-router-token-independent-long",envelopeSecret:"concurrency-fixture-envelope-independent-long",trustedOrigins:[f.origin]});
 router.prepare=async()=>{};router.state=async()=>activeDigest;router.status=async id=>applied.get(id)||null;
 router.activate=async(id,expected,digest)=>{assert.equal(expected,activeDigest);activations++;await new Promise(resolve=>setTimeout(resolve,40));activeDigest=digest;const result:RouterStatus={id,digest,phase:"applied"};applied.set(id,result);if(dropNext){dropNext=false;throw new ModelConfigError("ROUTER_UNAVAILABLE","fixture lost activation acknowledgement",503);}return result;};
 const billing={version:1,config:fixtureConfig()},runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,trustedOrigins:[f.origin],billing:async()=>billing,billingByVersion:async()=>billing});
 const administration=async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,router,runtime,billing:{current:async()=>billing},trustedOrigins:[f.origin]}) as never;
 const actor="mvp-concurrent@example.test";
 // Two independently assembled handlers share only real PostgreSQL locks.
 const handlers=Array.from({length:2},()=>createModelManagementHandler({authorize:async()=>({actor}),administration,managed:async()=>true}));
 const request=(body:unknown,signal?:AbortSignal)=>new Request("http://fixture.test/api/admin/model-management",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal});
 const watchdog=setTimeout(()=>{const result={state:"TIMEOUT",poolMax:f.sql.options.max,total:f.sql.totalCount,idle:f.sql.idleCount,waiting:f.sql.waitingCount,activations};console.error("MODEL_MANAGEMENT_FIRST_WRITE="+JSON.stringify(result));void writeFile(path.join(out,"TIMEOUT.json"),JSON.stringify(result)).finally(()=>process.exit(124));},10000);
 let holder:ChildProcessWithoutNullStreams|undefined;
 try{
  assert.equal(f.sql.options.max,5);const before=await f.repo.current(),draft=await f.repo.draft(actor);
  const body={action:"rename",id:randomUUID(),expectedVersion:before.version,rowId:before.config.publicModels[0].id,label:"并发首次发布"};
  if(process.argv.includes("--distinct-first")){
   const bodies=Array.from({length:8},(_,i)=>({...body,id:randomUUID(),label:"不同操作并发 "+i}));
   const responses=await Promise.all(bodies.map((value,i)=>handlers[i%2](request(value))));
   const payloads=await Promise.all(responses.map(async response=>({status:response.status,body:await response.json()})));
   assert.equal(payloads.filter(result=>result.status===200).length,1,JSON.stringify(payloads));assert.ok(payloads.filter(result=>result.status!==200).every(result=>result.status===409&&["CONFIG_CONFLICT","PUBLICATION_PENDING"].includes(result.body.code)),JSON.stringify(payloads));
   assert.equal(activations,1);assert.equal((await f.repo.current()).version,before.version+1);assert.deepEqual(await f.repo.draft(actor),draft);
   console.log("MODEL_MANAGEMENT_DISTINCT_FIRST=PASS POOL_MAX=5 PARALLEL=8 HANDLERS=2 APPLIED=1 CAS_REJECTED=7 ACTIVATIONS=1 ORIGINAL_DRAFT=UNCHANGED");
   await writeFile(path.join(out,"RESULT.json"),JSON.stringify({pass:true,poolMax:5,parallel:8,distinctOperations:true,payloads,activations,paidSupplierCalls:0},null,2));return;
  }
  const responses=await Promise.all(Array.from({length:8},(_,i)=>handlers[i%handlers.length](request(body))));
  const payloads=await Promise.all(responses.map(async response=>({status:response.status,body:await response.json()})));
  assert.ok(payloads.every(response=>response.status===200),JSON.stringify(payloads));assert.equal(activations,1);assert.equal((await f.repo.current()).version,before.version+1);
  assert.ok(payloads.every(response=>response.body.publication.id===body.id));assert.deepEqual(await f.repo.draft(actor),draft);
  const versions=await f.sql.query("SELECT count(*) n FROM app_model_config_versions WHERE operation_id=$1",[body.id]);assert.equal(Number(versions.rows[0].n),1);
  const changed=await handlers[0](request({...body,label:"不同输入"}));assert.equal(changed.status,409);assert.equal((await changed.json()).code,"OPERATION_CONFLICT");
  console.log("MODEL_MANAGEMENT_FIRST_WRITE=PASS POOL_MAX=5 PARALLEL=8 HANDLERS=2 APPLIED=8 ACTIVATIONS=1 VERSIONS=1 ORIGINAL_DRAFT=UNCHANGED MUTATED_INPUT=409");
  const second={...body,id:randomUUID(),expectedVersion:before.version+1,label:"独立进程锁释放后发布"};
  holder=spawn(process.execPath,["-e",`const{Pool}=require('pg');(async()=>{const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1}),c=await p.connect();await c.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[process.argv[1]]);process.stdout.write('LOCK_READY\\n');process.stdin.once('data',async()=>{await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[process.argv[1]]);c.release();await p.end();process.stdout.write('LOCK_RELEASED\\n');process.stdin.destroy();});})().catch(e=>{console.error(e);process.exit(1)});`,`admin-mvp:${second.id}`],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
  const ready=new Promise<void>((resolve,reject)=>{holder!.once("error",reject);holder!.once("exit",code=>{if(code!==0)reject(Error("fixture lock-holder exit "+code));});holder!.stdout.once("data",data=>{assert.match(data.toString(),/LOCK_READY/);resolve();});});
  const stopped=new Promise<void>((resolve,reject)=>holder!.once("exit",code=>code===0?resolve():reject(Error("fixture holder exit "+code))));
  await ready;const blocked=Promise.all(Array.from({length:8},(_,i)=>handlers[i%2](request(second))));
  await new Promise(resolve=>setTimeout(resolve,150));assert.equal(activations,1,"independent process still owns the original advisory lock");
  assert.ok(f.sql.idleCount>0,"lock waiters release their business-pool connections");await f.sql.query("SELECT 1 AS available");
  const bounded=createModelManagementHandler({authorize:async()=>({actor}),administration,managed:async()=>true,mutationWaitMs:40});
  const queuedBody={...second,id:randomUUID(),label:"排队到期不发布"};
  const queueExpired=await bounded(request(queuedBody));assert.equal(queueExpired.status,409);assert.deepEqual(await queueExpired.json(),{error:"模型设置正在发布，请使用同一操作稍后重试",code:"PUBLICATION_LOCK_PENDING",operationNotStaged:false});
  const abort=new AbortController(),cancelled=handlers[0](request({...queuedBody,id:randomUUID()},abort.signal));setTimeout(()=>abort.abort(),15);
  const aborted=await cancelled;assert.equal(aborted.status,409);assert.equal((await aborted.json()).code,"PUBLICATION_LOCK_PENDING");assert.equal(activations,1);
  holder.stdin.write("release\n");const afterRelease=await blocked;assert.ok(afterRelease.every(response=>response.status===200));assert.equal(activations,2);await stopped;
  assert.equal(Number((await f.sql.query("SELECT count(*) n FROM app_model_config_versions WHERE operation_id=$1",[second.id])).rows[0].n),1);assert.deepEqual(await f.repo.draft(actor),draft);
  console.log("MODEL_MANAGEMENT_PROCESS_LOCK=PASS EXTERNAL_PROCESS=1 WHILE_LOCKED_ACTIVATIONS=0 POOL_AVAILABLE=1 AFTER_RELEASE_APPLIED=8 ACTIVATIONS=1 VERSIONS=1");
  const lockExpiredBody={...second,id:randomUUID(),expectedVersion:before.version+2,label:"跨会话锁到期不发布"},external=await f.sql.connect();
  try{await external.query("SELECT pg_advisory_lock(hashtextextended($1,0))",[`admin-mvp:${lockExpiredBody.id}`]);const expired=await bounded(request(lockExpiredBody));assert.equal(expired.status,409);const data=await expired.json();assert.equal(data.code,"PUBLICATION_LOCK_PENDING");assert.equal(data.operationNotStaged,false);assert.equal(activations,2);}finally{await external.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[`admin-mvp:${lockExpiredBody.id}`]);external.release();}
  const next=await handlers[0](request({...lockExpiredBody,id:randomUUID(),label:"等待失败后正常发布"}));assert.equal(next.status,200);assert.equal(activations,3);
  const rejectedCount=await f.sql.query("SELECT count(*) n FROM app_model_config_versions WHERE operation_id=ANY($1::uuid[])",[[queuedBody.id,lockExpiredBody.id]]);assert.equal(Number(rejectedCount.rows[0].n),0);
  console.log("MODEL_MANAGEMENT_WAIT_BOUNDARY=PASS QUEUE_TIMEOUT=409 QUEUE_ABORT=409 PG_LOCK_TIMEOUT=409 REJECTED_VERSIONS=0 FOLLOWING_PUBLICATION=200");
  const unknownBody={...body,id:randomUUID(),expectedVersion:before.version+3,label:"等待到期保留未知发布"};dropNext=true;
  const uncertain=await handlers[0](request(unknownBody));assert.equal(uncertain.status,202);assert.equal((await uncertain.json()).publication.phase,"unknown");assert.equal(activations,4);
  const unknownHolder=await f.sql.connect();
  try{await unknownHolder.query("SELECT pg_advisory_lock(hashtextextended($1,0))",[`admin-mvp:${unknownBody.id}`]);const pending=await bounded(request(unknownBody));assert.equal(pending.status,409);const data=await pending.json();assert.equal(data.operationNotStaged,false);assert.equal(data.code,"PUBLICATION_LOCK_PENDING");assert.equal((await f.repo.publication(unknownBody.id)).phase,"unknown");assert.equal(activations,4);}finally{await unknownHolder.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[`admin-mvp:${unknownBody.id}`]);unknownHolder.release();}
  const recovered=await handlers[0](request(unknownBody));assert.equal(recovered.status,200);assert.equal((await recovered.json()).publication.id,unknownBody.id);assert.equal(activations,4);assert.equal((await f.repo.current()).version,before.version+4);
  const pricingBody={action:"pricing",id:randomUUID(),expectedVersion:before.version+4,expectedBillingVersion:1,rowId:body.rowId,features:["image.generate"],pricing:null},pricingHolder=await f.sql.connect();
  try{await pricingHolder.query("SELECT pg_advisory_lock(hashtextextended($1,0))",[`admin-mvp:${pricingBody.id}`]);const waiting=await bounded(request(pricingBody));assert.equal(waiting.status,409);const data=await waiting.json();assert.equal(data.code,"PUBLICATION_LOCK_PENDING");assert.equal(data.operationNotStaged,false);assert.equal(activations,4);}finally{await pricingHolder.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[`admin-mvp:${pricingBody.id}`]);pricingHolder.release();}
  console.log("MODEL_MANAGEMENT_WAIT_IDENTITY=PASS UNKNOWN=RETAINED OPERATION_NOT_STAGED=false SAME_ID_RECOVERY=200 REACTIVATIONS=0");
  console.log("MODEL_MANAGEMENT_PRICING_WAIT=PASS ORIGINAL_ID=PRESERVED OPERATION_NOT_STAGED=false");
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({pass:true,poolMax:5,parallel:8,handlers:2,activations,versionsPerOperation:1,payloads,externalProcessLock:true,boundedQueue:true,abortQueue:true,boundedPgLock:true,unknownReceiptPreserved:true,pricingWaitIdentity:true,paidSupplierCalls:0},null,2));
  console.log("MODEL_MANAGEMENT_CONCURRENCY=PASS REAL_PG=1 POOL_MAX=5 SAME_ID=8 EXTERNAL_PROCESS_LOCK=PASS BOUNDED_ABORT_WAIT=PASS UNKNOWN_IDENTITY=PRESERVED SUPPLIER_CALLS=0");
 }finally{clearTimeout(watchdog);if(holder&&!holder.killed&&holder.exitCode===null)holder.kill();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
