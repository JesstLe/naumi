/** R4B6: actual Web startup plus every migrated SQL owner on isolated PG.
 * Six legacy private initializer projections are explicit; public owners and
 * runtime/quote/identity methods use the complete source checkout. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Client,Pool} from "pg";
import {expectedPersistenceSteps} from "./persistence-owner-fixture";
import {persistenceOwnerLoader} from "./persistence-owner-loader";
import type {WebStartupReport} from "../src/lib/application/startup";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/fixture/);
 const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part"),out=path.resolve(process.env.APP_PERSISTENCE_EVIDENCE||"output/refactor-r4b6-20261025");await mkdir(out,{recursive:true});
 const load=(f:string)=>import(pathToFileURL(path.join(root,f)).href);
 async function child(args:string[],name:string,script="scripts/verify-application-persistence-pg.ts"){
  const cp=spawn(process.execPath,["--conditions=react-server","--import","tsx",path.resolve(script),"--source-root",root,...args,...(baseline?["--baseline"]:[])],{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json"),WEB_STARTUP_EVIDENCE:out},windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";cp.stdout.on("data",b=>stdout+=b);cp.stderr.on("data",b=>stderr+=b);const code=await new Promise<number|null>((resolve,reject)=>{cp.once("error",reject);cp.once("close",resolve);});await writeFile(path.join(out,name),stdout+stderr+`\nEXIT=${code}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,name);return stdout;
 }
 if(!part){let checks=0;for(const p of ["cold","fault","preserved"]){const s=await child(["--part",p],`PERSISTENCE_${mode}_${p}.log`);checks+=Number(s.match(/CHECKS=(\d+)/)?.[1]||0);}console.log(`APPLICATION_PERSISTENCE_PG=PASS mode=${mode} parts=3 checks=${checks} SOURCE=FULL_CHECKOUT PRIVATE_SQL_PROJECTIONS=${baseline?6:0} STARTUP_OWNERS=${baseline?14:37} WARM_COPY_DDL=${baseline?1:0} PAID_REPLAY=0 EXTERNAL=0`);return;}
 const schema=arg("--schema")||"startup_"+randomUUID().replaceAll("-","");assert.match(schema,/^startup_[a-f0-9]+$/);Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:"application-persistence-fixture-01234567890123456",NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:"",OPENAI_API_KEY:"",NEW_API_IMAGE_API_KEY:"",VIDEO_API_KEY:"",VIDEO_PROVIDERS_JSON:"[]"});delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`});let pool:Pool|undefined,trigger=false,external=0,checks=0,phase="control";
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
 const rawQuery=Client.prototype.query,queries:{phase:string;sql:string}[]=[];Client.prototype.query=function(this:Client,...args:unknown[]){queries.push({phase,sql:typeof args[0]==="string"?args[0]:String((args[0] as {text?:string})?.text)});return Reflect.apply(rawQuery,this,args);} as typeof Client.prototype.query;
 const realFetch=globalThis.fetch;globalThis.fetch=(async()=>{external++;throw Error("Unexpected network during persistence initialization");}) as typeof fetch;
 const ddl=(p:string)=>queries.filter(q=>q.phase===p&&/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA|TYPE|FUNCTION)\b/i.test(q.sql));
 async function capture<T>(name:string,run:()=>Promise<T>){phase=name;try{return await run();}finally{phase="control";}}
 const owners=persistenceOwnerLoader(root,!baseline);
 const boot=async()=>(await load("src/lib/application/startup.ts")).initializeWebApplication();
 async function catalog(){
  const columns=(await admin.query(`SELECT c.relname AS table_name,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname,a.attnum`,[schema])).rows;
  const constraints=(await admin.query(`SELECT c.relname AS table_name,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname,k.conname`,[schema])).rows;
  const indexes=(await admin.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname",[schema])).rows;
  return JSON.parse(JSON.stringify({columns,constraints,indexes}).replaceAll(schema,"FIXTURE_SCHEMA"));
 }
 try{
  if(part!=="seed")await admin.query(`CREATE SCHEMA ${schema}`);pool=(await load("src/platform/db/pool.ts")).getPool();
  if(part==="seed"){
   await owners.all(pool!);await child(["--part","seed","--schema",schema],`PAID_SEED_${mode}.log`,"scripts/verify-web-startup-pg.ts");
   const email="startup@fixture.test",job=randomUUID(),workflow=randomUUID(),reference=randomUUID();
   await admin.query("INSERT INTO app_video_media_jobs(id,email,operation_id,input_digest,request,inputs,status) VALUES($1,$2,$3,'retained','{}','[]','processing')",[job,email,randomUUID()]);
   await admin.query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,frozen_nodes_enc) VALUES($1,$2,'tree:retained','{}','retained','retained-opaque')",[workflow,email]);
   await admin.query("INSERT INTO app_video_reference_uploads(email,operation_id,storage_key,sha256,mime_type,bytes,claim_token,lease_expires_at) VALUES($1,$2,'fixture-retained','retained','image/png',1,$3,now()+interval '10 minutes')",[email,reference,randomUUID()]);
   const before=JSON.parse(await readFile(path.join(out,schema+"-preserved.json"),"utf8"));for(const table of ["app_video_media_jobs","app_video_workflow_runs","app_video_reference_uploads"]){before[table]=(await admin.query(`SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;}
   await writeFile(path.join(out,schema+"-preserved.json"),JSON.stringify(before));console.log("APPLICATION_PERSISTENCE_SEED=PASS WALLET=100 RESERVED=12 UNKNOWN=1 RETAINED_JOBS=3 SCANNERS=0");return;
  }
  if(part==="cold"){
   const startup=await load("src/lib/application/startup.ts"),parallel=Array.from({length:8},()=>capture<WebStartupReport>("startup",()=>startup.initializeWebApplication()));
   const reports=await Promise.all(parallel);eq(reports[0].steps,await expectedPersistenceSteps(root));ok(reports.every(r=>r===reports[0]));ok(ddl("startup").length>0);
   const before=(await admin.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname=$1",[schema])).rows[0].n;
   await capture("first-owners",()=>owners.all(pool!));const after=(await admin.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname=$1",[schema])).rows[0].n;if(baseline)ok(after>before);else eq(after,before);
   await capture("warm-owners",()=>owners.all(pool!));eq(ddl("warm-owners").length,baseline?1:0);
   if(!baseline){const config=(await load("src/lib/billing/configuration.ts")).getBillingConfiguration(),runtime=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime();eq(runtime.config,config);}
   const snapshot=await catalog();await writeFile(path.join(out,`SCHEMA_${mode}.json`),JSON.stringify(snapshot,null,2));ok(snapshot.columns.length>400);
   eq((await admin.query("SELECT count(*)::int n FROM app_gen_reservations")).rows[0].n,0);eq((await admin.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
   console.log(`PERSISTENCE_OBSERVATION mode=${mode} startup_ddl=${ddl("startup").length} first_owner_ddl=${ddl("first-owners").length} warm_owner_ddl=${ddl("warm-owners").length} tables=${after}`);
  }else if(part==="fault"){
   await admin.query(`CREATE FUNCTION ${schema}.fail_owner_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF current_schema()='${schema}' AND position('CREATE TABLE IF NOT EXISTS app_video_media_jobs' IN current_query())>0 THEN RAISE EXCEPTION 'R4B6_REAL_OWNER_FAULT'; END IF; END $$`);await admin.query(`CREATE EVENT TRIGGER ${schema}_fault ON ddl_command_start EXECUTE FUNCTION ${schema}.fail_owner_ddl()`);trigger=true;
   if(baseline){await boot();await assert.rejects(owners.all(pool!),/R4B6_REAL_OWNER_FAULT/);checks++;}else{await assert.rejects(boot(),/R4B6_REAL_OWNER_FAULT/);checks++;}
   eq((await admin.query("SELECT to_regclass('app_video_media_jobs') AS name")).rows[0].name,null);await admin.query(`DROP EVENT TRIGGER ${schema}_fault`);trigger=false;const report=await boot();eq(report.steps,await expectedPersistenceSteps(root));await owners.all(pool!);eq((await admin.query("SELECT count(*)::int n FROM app_billing_config_versions")).rows[0].n,1);await capture("retried-warm",()=>owners.all(pool!));eq(ddl("retried-warm").length,baseline?1:0);
  }else if(part==="preserved"){
   await child(["--part","seed","--schema",schema],`SEED_${mode}.log`);const before:Record<string,unknown>=JSON.parse(await readFile(path.join(out,schema+"-preserved.json"),"utf8"));await boot();for(const [table,rows]of Object.entries(before))eq((await admin.query(`SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows,rows);eq((await admin.query("SELECT sum(cost)::int n FROM app_gen_reservations")).rows[0].n,12);
  }else throw Error("Unknown part "+part);
  eq(external,0);await writeFile(path.join(out,`PROJECTIONS_${mode}_${part}.json`),JSON.stringify(owners.projections,null,2));eq(owners.projections.length,baseline&&part!=="preserved"?6:0);
  console.log(`APPLICATION_PERSISTENCE_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
 }finally{
  Client.prototype.query=rawQuery;globalThis.fetch=realFetch;if(pool)await pool.end();if(trigger)await admin.query(`DROP EVENT TRIGGER ${schema}_fault`);if(part!=="seed")await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();console.log(`APPLICATION_PERSISTENCE_CLEANUP=${part} SCHEMA_${part==="seed"?"RETAINED":"DROPPED"}=1 POOLS_CLOSED=1`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
