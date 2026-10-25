/** Real Next build/start fixture. Complete source copy, actual login/health and
 * owner functions. This is not the full product image or a browser acceptance. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {spawn,execFileSync,type ChildProcess} from "node:child_process";
import {createServer} from "node:net";
import {access,copyFile,mkdtemp,mkdir,readFile,symlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool} from "pg";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/fixture/);
 const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",out=path.resolve(process.env.WEB_STARTUP_EVIDENCE||"output/refactor-r4b4-20261025");await mkdir(out,{recursive:true});
 const original=JSON.parse(await readFile(path.join(out,"BASELINE.json"),"utf8")) as {originalHashes:Record<string,string>};
 const additions=execFileSync("git",["ls-files","--others","--exclude-standard","-z"],{cwd:process.cwd(),encoding:"utf8"}).split("\0").filter(Boolean),files=[...new Set([...Object.keys(original.originalHashes),...additions])].sort();
 // Next 15's webpack entries use path.relative to its installed package. Keep
 // the fixture on the dependency volume; Windows cross-volume paths are not
 // relative paths. No dependency installation or old-cache removal is needed.
 const fixtureParent=path.resolve(arg("--fixture-parent")||path.join(out,"next-fixtures"));await mkdir(fixtureParent,{recursive:true});
 const fixture=await mkdtemp(path.join(fixtureParent,`naumi-r4b4-${mode.toLowerCase()}-`)),source=path.join(fixture,"code"),hashes:Record<string,string>={};await mkdir(source,{recursive:true});
 for(const f of files){try{await access(path.join(root,f));}catch(e){if(f in original.originalHashes)throw e;continue;}const target=path.join(source,f);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,f),target);const from=await readFile(path.join(root,f)),to=await readFile(target);assert.deepEqual(to,from);hashes[f]=createHash("sha256").update(to).digest("hex");if(baseline&&f in original.originalHashes)assert.equal(hashes[f],original.originalHashes[f]);}
 assert.ok(Object.keys(hashes).length>=4238);await writeFile(path.join(out,`NEXT_${mode}_SOURCE.json`),JSON.stringify({root,fixture,files:Object.keys(hashes).length,hashes},null,2));
 await symlink(path.resolve("node_modules"),path.join(fixture,"node_modules"),"junction");
 const put=async(f:string,text:string)=>{await mkdir(path.dirname(path.join(fixture,f)),{recursive:true});await writeFile(path.join(fixture,f),text);};
 await put("package.json",JSON.stringify({name:"naumi-startup-fixture",private:true,version:"0.0.0",dependencies:{next:"15.5.27",react:"19.3.0","react-dom":"19.3.0"}}));
 await put("tsconfig.json",JSON.stringify({compilerOptions:{target:"es2017",lib:["dom","esnext"],strict:true,skipLibCheck:true,noEmit:true,esModuleInterop:true,module:"esnext",moduleResolution:"bundler",resolveJsonModule:true,isolatedModules:true,jsx:"preserve",plugins:[{name:"next"}],paths:{"@/*":["./code/src/*"]}},include:["src/**/*.ts","src/**/*.tsx",".next/types/**/*.ts"],exclude:["node_modules","code"]},null,2));
 await put("next.config.mjs",`import actual from './code/next.config.mjs';\nexport default {...actual,output:undefined,experimental:{...actual.experimental,cpus:1},typescript:{ignoreBuildErrors:true},eslint:{ignoreDuringBuilds:true}};\n`);
 const observer=path.join(fixture,"observer.cjs");await put("observer.cjs",`
const fs=require('node:fs'),pg=require('pg');
const state=globalThis[Symbol.for('naumi.r4b4.observer')]={phase:process.env.R4B4_PHASE||'startup'};
function record(value){fs.appendFileSync(process.env.R4B4_SQL_LOG,JSON.stringify({pid:process.pid,phase:state.phase,...value})+'\\n');}
const query=pg.Client.prototype.query;pg.Client.prototype.query=function(...args){record({kind:'sql',sql:typeof args[0]==='string'?args[0]:args[0]?.text});return Reflect.apply(query,this,args);};
const connect=pg.Client.prototype.connect;pg.Client.prototype.connect=function(...args){record({kind:'connect'});return Reflect.apply(connect,this,args);};
const realFetch=globalThis.fetch;globalThis.fetch=async function(input,init){const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)){record({kind:'external',url:u.origin});throw Error('R4B4 unexpected external fetch');}return realFetch(input,init);};
`);
 const hook=hashes["src/instrumentation.ts"]?`const actual=await import('../code/src/instrumentation');await actual.register();`:"// Baseline has no production startup hook; observer only.";
 await put("src/instrumentation.ts",`export async function register(){if(process.env.NEXT_RUNTIME!=='nodejs')return;const state=(globalThis as any)[Symbol.for('naumi.r4b4.observer')];state.phase='startup';${hook}\nstate.phase='idle';}\n`);
 await put("src/app/layout.tsx",`export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>;}\n`);
 await put("src/app/page.tsx",`export default function Page(){return <main>Startup fixture</main>;}\n`);
 const phase=`const state=(globalThis as any)[Symbol.for('naumi.r4b4.observer')];`;
 await put("src/app/api/auth/login/route.ts",`import {POST as actual} from '@/app/api/auth/login/route';export const runtime='nodejs';export const dynamic='force-dynamic';export async function POST(r:Request){${phase}state.phase='request:login';try{return await actual(r);}finally{state.phase='idle';}}\n`);
 await put("src/app/api/health/route.ts",`import {GET as actual} from '@/app/api/health/route';export const runtime='nodejs';export const dynamic='force-dynamic';export async function GET(){${phase}state.phase='request:health';try{return await actual();}finally{state.phase='idle';}}\n`);
 await put("src/app/api/probe/route.ts",`import {getPool} from '@/platform/db/pool';export const runtime='nodejs';export const dynamic='force-dynamic';export async function GET(){${phase}state.phase='request:probe';try{
const pool=getPool();await(await import('@/lib/persistence/schema')).ensureSchema();await(await(await import('@/lib/billing/runtime')).getBillingRuntime()).config.current();
await(await import('@/lib/model-config/schema')).ensureModelSchema(pool);await(await import('@/lib/model-config/runtime-schema')).ensureModelRuntimeSchema(pool);await(await import('@/lib/video/frozen-capability')).ensureVideoDefaultsSchema(pool);
await(await import('@/lib/saas/creation-schema')).ensureCreationSchema();await(await import('@/lib/media-assets')).ensureMediaSchema();await(await import('@/lib/auth-login-limit')).ensureLoginGuardSchema(pool);
await(await import('@/lib/image-skills/server')).ensureImageSkills();await(await import('@/lib/imagegen/quotes')).ensureImagegenQuotes();await(await import('@/lib/billing/image-quotes')).ensureImageBillingQuotes();await(await import('@/lib/imagegen/batch-repository')).ensureImagegenBatches();await(await import('@/lib/reference-workbench/repository')).ensureWorkbench();
return Response.json({ok:true,owners:13});}finally{state.phase='idle';}}\n`);
 const schema="nextstartup_"+randomUUID().replaceAll("-",""),admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`});await admin.query(`CREATE SCHEMA ${schema}`);
 let child:ChildProcess|undefined,childExit:Promise<number|null>|undefined,checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
 const next=path.resolve("node_modules/next/dist/bin/next"),buildSql=path.join(out,`NEXT_${mode}_BUILD_SQL.jsonl`),runtimeSql=path.join(out,`NEXT_${mode}_RUNTIME_SQL.jsonl`);await writeFile(buildSql,"");await writeFile(runtimeSql,"");
 const env={...process.env,NEXT_TELEMETRY_DISABLED:"1",NAUMI_MULTI_USER:"1",SETTINGS_SECRET:"next-startup-fixture-012345678901234567890",NAUMI_BUILD_CPUS:"1",NEXT_DIST_DIR:".next",NODE_OPTIONS:`--require="${observer.replaceAll("\\","/")}" --max-old-space-size=4096`,NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_ANON_KEY:"",FLEET_PORTAL_ONLY:"0",NAUMI_AUTH_LOGIN_ONLY:"0"};
 const sql=async(file:string)=>(await readFile(file,"utf8")).trim().split("\n").filter(Boolean).map(s=>JSON.parse(s) as {phase:string;kind:string;sql?:string});
 const ddl=(rows:Awaited<ReturnType<typeof sql>>)=>rows.filter(r=>r.kind==="sql"&&/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|SCHEMA|TYPE|FUNCTION)\b/i.test(r.sql||""));
 try{
  const build=spawn(process.execPath,[next,"build"],{cwd:fixture,env:{...env,DATABASE_URL:"postgresql://fixture:fixture-local-only@127.0.0.1:1/build_fixture",R4B4_SQL_LOG:buildSql,R4B4_PHASE:"build"},windowsHide:true,stdio:["ignore","pipe","pipe"]});let buildOutput="";build.stdout.on("data",b=>buildOutput+=b);build.stderr.on("data",b=>buildOutput+=b);const buildCode=await new Promise<number|null>((resolve,reject)=>{build.once("error",reject);build.once("close",resolve);});await writeFile(path.join(out,`NEXT_${mode}_BUILD.log`),buildOutput+`\nEXIT=${buildCode}\n`);eq(buildCode,0);eq((await sql(buildSql)).length,0);
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,"127.0.0.1",resolve));const port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
  child=spawn(process.execPath,[next,"start","--hostname","127.0.0.1","--port",String(port)],{cwd:fixture,env:{...env,DATABASE_URL:process.env.DATABASE_URL,PGOPTIONS:`-c search_path=${schema}`,R4B4_SQL_LOG:runtimeSql,R4B4_PHASE:"startup"},windowsHide:true,stdio:["ignore","pipe","pipe"]});let output="";child.stdout!.on("data",b=>output+=b);child.stderr!.on("data",b=>output+=b);childExit=new Promise<number|null>((resolve,reject)=>{child!.once("error",reject);child!.once("close",resolve);});
  try{
   const deadline=Date.now()+120000;while(!/Ready in/.test(output)){if(child.exitCode!==null)throw Error("Next exited before ready: "+output);if(Date.now()>deadline)throw Error("Next readiness timed out: "+output);await pause(100);}
   // Next's CLI can print Ready while its lazy server.prepare() is still
   // awaiting instrumentation. An actual health request, not that log, is the
   // readiness contract. Launch it now and inspect SQL phase ordering below.
   const origin=`http://127.0.0.1:${port}`,earlyHealth=baseline?undefined:fetch(origin+"/api/health",{signal:AbortSignal.timeout(120000)});
   if(!baseline){while(!/APP_STARTUP=PASS mode=application steps=13/.test(output)){if(child.exitCode!==null)throw Error("Next startup failed: "+output);if(Date.now()>deadline)throw Error("Application initialization timed out: "+output);await pause(100);}const response=await earlyHealth!;eq(response.status,200);eq((await response.json()).db.ok,true);}
   const startupSql=await sql(runtimeSql),startupDdl=ddl(startupSql);if(baseline){eq(startupDdl.length,0);ok(!/APP_STARTUP=PASS/.test(output));}else{ok(startupDdl.length>0);ok(/APP_STARTUP=PASS mode=application steps=13/.test(output));}
   const login=(email:string,password:string)=>fetch(origin+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json","x-real-ip":"127.0.0.1"},body:JSON.stringify({email,password})});
   eq((await login("unknown@fixture.test","wrong-fixture-password")).status,401);const first=(await sql(runtimeSql)).slice(startupSql.length),firstDdl=ddl(first).length;if(baseline)ok(firstDdl>0);else eq(firstDdl,0);
   const probe=await fetch(origin+"/api/probe");eq(probe.status,200);eq(await probe.json(),{ok:true,owners:13});
   const health=await fetch(origin+"/api/health");eq(health.status,200);eq((await health.json()).db.ok,true);
   const password=(await import(pathToFileURL(path.join(root,"src/lib/pw.ts")).href)).hashPassword("Startup-valid-fixture-password");await admin.query("INSERT INTO app_users(email,name,renews_at,password_hash,credits_total,credits_used) VALUES('login@fixture.test','fixture',now()+interval '1 month',$1,0,0)",[password]);
   const valid=await login("login@fixture.test","Startup-valid-fixture-password");eq(valid.status,200);ok(valid.headers.get("set-cookie")?.includes("nv_user="));eq((await valid.json()).user.email,"login@fixture.test");
   const runtime=await sql(runtimeSql),requestDdl=ddl(runtime.filter(r=>r.phase.startsWith("request:"))).length;if(!baseline){eq(requestDdl,0);const firstRequest=runtime.findIndex(r=>r.phase.startsWith("request:")),lastStartup=runtime.findLastIndex(r=>r.phase==="startup");ok(firstRequest>lastStartup);eq(runtime.filter(r=>r.kind==="connect").length,1);}else ok(requestDdl>0);eq(runtime.filter(r=>r.kind==="external").length,0);
   const result={status:"PASS",mode,checks,fixture,sourceFiles:Object.keys(hashes).length,buildDbQueries:0,startupDdl:startupDdl.length,firstLoginDdl:firstDdl,allRequestDdl:requestDdl,actualNext:"15.5.27",actualHandlers:["auth/login","health"],domainOwners:13,productBuild:false,standalone:false,production:false};await writeFile(path.join(out,`NEXT_${mode}.json`),JSON.stringify(result,null,2));console.log(`WEB_STARTUP_NEXT=PASS mode=${mode} checks=${checks} build_sql=0 startup_ddl=${startupDdl.length} first_login_ddl=${firstDdl} request_ddl=${requestDdl} owners=13 LOGIN=ACTUAL HEALTH=ACTUAL SOURCE=FULL_COPY SUPPLIER=0 EXTERNAL=0`);
  }finally{if(child.exitCode===null)child.kill();await childExit;await writeFile(path.join(out,`NEXT_${mode}_START.log`),output+`\nSTOPPED=1\n`);}
 }finally{await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();console.log(`WEB_STARTUP_NEXT_CLEANUP=${mode} SCHEMA_DROPPED=1 NEXT_STOPPED=1 ADMIN_POOL_CLOSED=1`);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
