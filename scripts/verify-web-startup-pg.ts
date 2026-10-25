/** R4B4: actual startup/domain functions, isolated PG, cold child processes.
 * A query observer records synchronously and preserves pg's return contract. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {access,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Client,Pool} from "pg";
import type {WebStartupReport} from "../src/lib/application/startup";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const steps=["persistence","billing","models","model-runtime","video-defaults","supplier-video","creation","media","login","image-skills","imagegen-quotes","billing-quotes","imagegen-batches","workbench"];
const owner="startup@fixture.test";
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/fixture/);
 const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part"),out=path.resolve(process.env.WEB_STARTUP_EVIDENCE||"output/refactor-r4b4-20261025");await mkdir(out,{recursive:true});
 const load=(f:string)=>import(pathToFileURL(path.join(root,f)).href);
 async function child(args:string[],name:string){
  const cp=spawn(process.execPath,["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-web-startup-pg.ts"),"--source-root",root,...args,...(baseline?["--baseline"]:[])],{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";
  cp.stdout.on("data",b=>stdout+=b);cp.stderr.on("data",b=>stderr+=b);const code=await new Promise<number|null>((resolve,reject)=>{cp.once("error",reject);cp.once("close",resolve);});await writeFile(path.join(out,name),stdout+stderr+`\nEXIT=${code}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,name);return stdout;
 }
 if(!part){const parts=baseline?["cold","preserved"]:["guards","no-database","fleet-sidecar","auth-sidecar","cold","retry","preserved"];let checks=0;for(const p of parts){const s=await child(["--part",p],`PG_${mode}_${p}.log`);checks+=Number(s.match(/CHECKS=(\d+)/)?.[1]||0);}console.log(`WEB_STARTUP_PG=PASS mode=${mode} parts=${parts.length} checks=${checks} SOURCE=FULL_CHECKOUT NEXT=SEPARATE_FIXTURE INFLIGHT=UNCHANGED SUPPLIER=0 EXTERNAL=0`);return;}
 let checks=0,external=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
 const rawQuery=Client.prototype.query,queries:string[]=[];Client.prototype.query=function(this:Client,...args:unknown[]){const q=args[0];queries.push(typeof q==="string"?q:String((q as {text?:string})?.text||q));return Reflect.apply(rawQuery,this,args);} as typeof Client.prototype.query;
 const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{external++;throw Error("Unexpected fetch during startup fixture");}) as typeof fetch;
 const ddl=()=>queries.filter(s=>/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA|TYPE|FUNCTION)\b/i.test(s));
 const report=()=>console.log(`WEB_STARTUP_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
 if(part==="guards"||part==="no-database"||part.endsWith("sidecar")){
  try{
   if(part==="guards"){
    const instrumentation=await load("src/instrumentation.ts");process.env.NEXT_RUNTIME="edge";await instrumentation.register();process.env.NEXT_RUNTIME="nodejs";process.env.NEXT_PHASE="phase-production-build";await instrumentation.register();delete process.env.NEXT_RUNTIME;delete process.env.NEXT_PHASE;await instrumentation.register();eq(queries.length,0);eq(external,0);
   }else{
    if(part==="no-database")delete process.env.DATABASE_URL;
    else process.env[part==="fleet-sidecar"?"FLEET_PORTAL_ONLY":"NAUMI_AUTH_LOGIN_ONLY"]="1";
    const initialize:()=>Promise<WebStartupReport>=(await load("src/lib/application/startup.ts")).initializeWebApplication;eq(await initialize(),{mode:part==="no-database"?"no-database":"sidecar",steps:[]});eq(queries.length,0);eq(external,0);eq((await load("src/platform/db/pool.ts")).getPool().totalCount,0);
   }report();
  }finally{Client.prototype.query=rawQuery;globalThis.fetch=originalFetch;}return;
 }
 const schema=arg("--schema")||"startup_"+randomUUID().replaceAll("-","");assert.match(schema,/^startup_[a-f0-9]+$/);process.env.PGOPTIONS=`-c search_path=${schema}`;
 Object.assign(process.env,{SETTINGS_SECRET:"web-startup-fixture-012345678901234567890",NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:""});delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`});let pool:Pool|undefined,trigger=false;
 // Baseline has no composition root; use its original owners only for fixture
 // seeding/compatibility checks, never describe this helper as a startup hook.
 async function originalOwners(){
  await(await load("src/lib/persistence/schema.ts")).ensureSchema();await(await(await load("src/lib/billing/runtime.ts")).getBillingRuntime()).config.current();
  await(await load("src/lib/model-config/schema.ts")).ensureModelSchema(pool);await(await load("src/lib/model-config/runtime-schema.ts")).ensureModelRuntimeSchema(pool);await(await load("src/lib/video/frozen-capability.ts")).ensureVideoDefaultsSchema(pool);
  await(await load("src/lib/supplier-models/video-access.ts")).ensureSupplierVideoSchema(pool);
  await(await load("src/lib/saas/creation-schema.ts")).ensureCreationSchema();await(await load("src/lib/media-assets.ts")).ensureMediaSchema();await(await load("src/lib/auth-login-limit.ts")).ensureLoginGuardSchema(pool);
  await(await load("src/lib/image-skills/server.ts")).ensureImageSkills();await(await load("src/lib/imagegen/quotes.ts")).ensureImagegenQuotes();await(await load("src/lib/billing/image-quotes.ts")).ensureImageBillingQuotes();await(await load("src/lib/imagegen/batch-repository.ts")).ensureImagegenBatches();await(await load("src/lib/reference-workbench/repository.ts")).ensureWorkbench();
 }
 const watched=["app_users","app_credit_batches","app_ledger","app_gen_reservations","app_billing_operations","app_billing_intents","app_imagegen_quotes","app_image_billing_quotes","app_imagegen_batches","app_imagegen_batch_items","app_reference_operations","app_video_tasks"];
 async function snapshot(){const tables:string[]=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname=$1",[schema])).rows.map(r=>r.tablename);const result:Record<string,unknown>={};for(const table of watched.filter(t=>tables.includes(t)))result[table]=(await admin.query(`SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;return result;}
 try{
  if(part!=="seed")await admin.query(`CREATE SCHEMA ${schema}`);
  pool=(await load("src/platform/db/pool.ts")).getPool();
  if(part==="seed"){
   await originalOwners();const runtime=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime(),current=await runtime.config.current(),config=structuredClone(current.config);config.credits.signup.amount=0;config.switches.metering="on";config.features["image.generate"].pricing={mode:"fixed",credits:6};const billing=await runtime.config.publish({id:randomUUID(),actor:"fixture",reason:"startup preservation",expectedVersion:current.version,config});
   await(await load("src/lib/accounts/session.ts")).getOrCreateUser(owner);
   await admin.query("INSERT INTO app_credit_batches(id,email,source,amount,remaining,expires_at) VALUES($1,$2,'fixture',100,100,now()+interval '30 days')",[randomUUID(),owner]);
   const quote=(await load("src/lib/billing/quote.ts")).quote(billing,{feature:"image.generate",quantity:1,quality:"medium",resolution:"1K",metered:true,byok:false,paidFen:0,userGroup:"default"}),ids=[randomUUID(),randomUUID()];
   const tx=await pool!.connect();try{await tx.query("BEGIN");for(const id of ids)await runtime.service.reserveTx(tx,{id,email:owner,quote,ledgerId:id,fingerprint:id});await tx.query("COMMIT");}catch(e){await tx.query("ROLLBACK");throw e;}finally{tx.release();}
   await admin.query("UPDATE app_billing_operations SET state='pending_reconciliation' WHERE id=$1",[ids[1]]);
   await admin.query("INSERT INTO app_video_tasks(id,email,upstream_id,status,cost,billing_quote) VALUES($1,$2,'fixture-accepted','processing',6,$3::jsonb)",[randomUUID(),owner,JSON.stringify(quote)]);
   await admin.query("INSERT INTO app_image_billing_quotes(id,owner,scope_key,quote,expires_at) VALUES($1,$2,'personal',$3::jsonb,now()-interval '1 day')",[randomUUID(),owner,JSON.stringify(quote)]);
   await writeFile(path.join(out,schema+"-preserved.json"),JSON.stringify(await snapshot()));console.log("WEB_STARTUP_SEED=PASS PROCESS=SEPARATE WALLET=100 RESERVED=12 UNKNOWN=RETAINED FROZEN_PRICE=6");return;
  }
  if(part==="preserved"){
   await child(["--part","seed","--schema",schema],`SEED_${mode}_${schema}.log`);const before=JSON.parse(await readFile(path.join(out,schema+"-preserved.json"),"utf8"));queries.length=0;
   if(baseline){await assert.rejects(access(path.join(root,"src/instrumentation.ts")));checks++;await originalOwners();}
   else{eq((await(await load("src/lib/application/startup.ts")).initializeWebApplication()).steps,steps);}
   eq(await snapshot(),before);eq((await admin.query("SELECT count(*)::int n FROM app_billing_operations WHERE state='pending_reconciliation'")).rows[0].n,1);eq((await admin.query("SELECT sum(cost)::int n FROM app_gen_reservations")).rows[0].n,12);eq((await admin.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
  }else if(part==="cold"){
   queries.length=0;
   if(baseline){await assert.rejects(access(path.join(root,"src/instrumentation.ts")));checks++;eq(ddl().length,0);}
   else{
    const initialize:()=>Promise<WebStartupReport>=(await load("src/lib/application/startup.ts")).initializeWebApplication;
    const parallel=Array.from({length:8},()=>initialize());ok(parallel.every(p=>p===parallel[0]));const results=await Promise.all(parallel);eq(results[0],{mode:"application",steps,modelRegistry:{state:"legacy"}});ok(results.every(r=>r===results[0]));ok(ddl().length>0);
    const tables=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname=$1",[schema])).rows.map(r=>r.tablename);for(const name of ["app_users","app_billing_operations","app_model_router_projections","app_video_model_defaults","app_creation_records","app_media_assets","app_auth_login_attempts","app_image_skills","app_imagegen_quotes","app_image_billing_quotes","app_imagegen_batches","app_reference_operations"])ok(tables.includes(name));
    const count=queries.length;eq(await initialize(),results[0]);eq(queries.length,count);
    const readiness=(await load("src/platform/db/schema-readiness.ts")).databaseSchemaReadiness;
    eq(readiness(pool,"core"),readiness(pool,"core"));ok(readiness(pool,"core")!==readiness(pool,"another-owner"));
    const anotherPool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});ok(readiness(pool,"core")!==readiness(anotherPool,"core"));eq(anotherPool.totalCount,0);await anotherPool.end();
   }
   queries.length=0;const response=await(await load("src/app/api/auth/login/route.ts")).POST(new Request("http://127.0.0.1/api/auth/login",{method:"POST",headers:{"content-type":"application/json","x-real-ip":"127.0.0.1"},body:JSON.stringify({email:owner,password:"wrong-fixture-password"})}));eq(response.status,401);const firstDdl=ddl().length;if(baseline)ok(firstDdl>0);else eq(firstDdl,0);console.log(`WEB_STARTUP_LOGIN mode=${mode} status=${response.status} first_request_ddl=${firstDdl}`);
   await originalOwners();queries.length=0;await originalOwners();eq(ddl().length,0);
  }else if(part==="retry"){
   await admin.query(`CREATE FUNCTION ${schema}.fail_model_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF current_schema()='${schema}' AND position('CREATE TABLE IF NOT EXISTS app_model_credentials' IN current_query())>0 THEN RAISE EXCEPTION 'R4B4_REAL_PG_DDL_FAULT'; END IF; END $$`);
   await admin.query(`CREATE EVENT TRIGGER ${schema}_fault ON ddl_command_start EXECUTE FUNCTION ${schema}.fail_model_ddl()`);trigger=true;
   const initialize:()=>Promise<WebStartupReport>=(await load("src/lib/application/startup.ts")).initializeWebApplication;const failed=initialize();await assert.rejects(failed,/R4B4_REAL_PG_DDL_FAULT/);checks++;
   eq((await admin.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname=$1 AND tablename='app_model_credentials'",[schema])).rows[0].n,0);eq((await admin.query("SELECT count(*)::int n FROM app_users")).rows[0].n,0);
   await admin.query(`DROP EVENT TRIGGER ${schema}_fault`);trigger=false;const retried=initialize();ok(retried!==failed);eq((await retried).steps,steps);queries.length=0;await originalOwners();eq(ddl().length,0);
  }else throw Error("Unknown part: "+part);
  eq(external,0);report();
 }finally{
  Client.prototype.query=rawQuery;globalThis.fetch=originalFetch;if(pool)await pool.end();if(trigger)await admin.query(`DROP EVENT TRIGGER ${schema}_fault`);if(part!=="seed")await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();console.log(`WEB_STARTUP_CLEANUP=${part} SCHEMA_${part==="seed"?"RETAINED_FOR_PARENT":"DROPPED"}=1 POOLS_CLOSED=1`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
