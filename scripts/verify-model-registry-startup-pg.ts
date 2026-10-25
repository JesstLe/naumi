/** R4B5 full-source A/B. Real PG and actual startup/read/admin functions.
 * Metadata discovery is loopback; paid submission and task replay stay zero. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Client,Pool} from "pg";
import type {ModelSnapshot} from "../src/lib/model-config/types";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const parts=["cold-read","web-startup","published","retry","orphaned","accepted-missing","inflight","unconfigured","setup","sidecar"];
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/fixture/);
 const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part"),out=path.resolve(process.env.MODEL_REGISTRY_EVIDENCE||"output/refactor-r4b5-20261025");await mkdir(out,{recursive:true});
 const load=(f:string)=>import(pathToFileURL(path.join(root,f)).href);
 async function child(args:string[],name:string,script="scripts/verify-model-registry-startup-pg.ts"){
  const cp=spawn(process.execPath,["--conditions=react-server","--import","tsx",path.resolve(script),"--source-root",root,...args,...(baseline?["--baseline"]:[])],{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json"),WEB_STARTUP_EVIDENCE:out},windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";cp.stdout.on("data",b=>stdout+=b);cp.stderr.on("data",b=>stderr+=b);const code=await new Promise<number|null>((resolve,reject)=>{cp.once("error",reject);cp.once("close",resolve);});await writeFile(path.join(out,name),stdout+stderr+`\nEXIT=${code}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,name);return stdout;
 }
 if(!part){let checks=0;for(const p of parts){const s=await child(["--part",p],`REGISTRY_${mode}_${p}.log`);checks+=Number(s.match(/CHECKS=(\d+)/)?.[1]||0);}console.log(`MODEL_REGISTRY_STARTUP_PG=PASS mode=${mode} parts=${parts.length} checks=${checks} SOURCE=FULL_CHECKOUT READ=${baseline?"FIRST_USE_IMPORT_REPRODUCED":"SELECT_ONLY"} DISCOVERY=STARTUP_OR_ADMIN INFLIGHT=UNCHANGED SUPPLIER_POST=0 EXTERNAL=0`);return;}
 const schema=arg("--schema")||"startup_"+randomUUID().replaceAll("-","");assert.match(schema,/^startup_[a-f0-9]+$/);process.env.PGOPTIONS=`-c search_path=${schema}`;
 let metadata=0,suppliers=0,external=0,routerFault=part==="retry";
 const server=createServer((req,res)=>{res.setHeader("content-type","application/json");if(req.url==="/internal/config/legacy"){metadata++;if(routerFault){routerFault=false;res.writeHead(500);res.end('{}');return;}res.end('{"providers":[],"routes":[],"aliases":[]}');return;}if(req.url==="/internal/config/legacy/credentials"){metadata++;res.end('{"credentials":[]}');return;}suppliers++;res.writeHead(500);res.end('{}');});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const modelOrigin=part==="seed"?process.env.FIXTURE_MODEL_ORIGIN||origin:origin;
 Object.assign(process.env,{SETTINGS_SECRET:"model-registry-startup-fixture-0123456789012345",NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:modelOrigin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"registry-fixture-control-independent-0123456789",MODEL_CONFIG_ENVELOPE_SECRET:"registry-fixture-envelope-independent-9876543210",MODEL_CONFIG_TRUSTED_ORIGINS:modelOrigin,OPENAI_BASE_URL:modelOrigin+"/v1",OPENAI_API_KEY:"fixture-not-a-real-key",OPENAI_IMAGE_MODEL:"fixture-wire",OPENAI_IMAGE_MODELS:"fixture-wire",OPENAI_TEXT_MODEL:"fixture-text",AGENT_MODEL:"fixture-text",FIXTURE_MODEL_ORIGIN:modelOrigin});delete process.env.NEW_API_IMAGE_API_KEY;delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const originalFetch=globalThis.fetch;globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{const u=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(u.origin!==origin){external++;throw Error("Unexpected external fixture request");}return originalFetch(input,init);}) as typeof fetch;
 const admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`});let pool:Pool|undefined,trigger=false,checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
 const originalQuery=Client.prototype.query,queries:string[]=[];Client.prototype.query=function(this:Client,...args:unknown[]){queries.push(typeof args[0]==="string"?args[0]:String((args[0] as {text?:string})?.text));return Reflect.apply(originalQuery,this,args);} as typeof Client.prototype.query;
 const mutations=()=>queries.filter(q=>/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(q));
 const count=async(table:string)=>Number((await admin.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);
 const current=async():Promise<ModelSnapshot>=>(await load("src/lib/model-config/published.ts")).readPublishedModelSnapshot();
 const prepare=async()=>(await load("src/lib/model-config/startup.ts")).prepareModelRegistry();
 const boot=async()=>(await load("src/lib/application/startup.ts")).initializeWebApplication();
 async function badLogin(){const response=await(await load("src/app/api/auth/login/route.ts")).POST(new Request(origin+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json","x-real-ip":"127.0.0.1"},body:JSON.stringify({email:"unknown@fixture.test",password:"wrong-fixture-password"})}));eq(response.status,401);}
 async function rejectRead(version?:number){await assert.rejects((await load("src/lib/model-config/published.ts")).readPublishedModelSnapshot(version),e=>(e as {code?:string}).code==="CONFIG_UNAVAILABLE");checks++;}
 try{
  if(part!=="seed")await admin.query(`CREATE SCHEMA ${schema}`);
  if(part==="seed"){
   pool=(await load("src/platform/db/pool.ts")).getPool();await(await load("src/lib/persistence/schema.ts")).ensureSchema();await(await load("src/lib/model-config/schema.ts")).ensureModelSchema(pool);
   const credentials=(await load("src/lib/model-config/credentials.ts")).createCredentialStore(pool),ref=await credentials.importPlain({providerId:"p1",plain:"fixture-credential-not-real",actor:"fixture"}),config=(await load("scripts/model-config-unit-fixture.ts")).fixtureModelConfig(modelOrigin+"/v1",ref.id),repo=(await load("src/lib/model-config/repository.ts")).createModelRepository({pool,trustedOrigins:[modelOrigin],initialize:async()=>config}),snapshot=await repo.current();await writeFile(path.join(out,schema+".json"),JSON.stringify(snapshot));console.log("MODEL_REGISTRY_SEED=PASS separate_process=1");return;
  }
  if(["published","orphaned"].includes(part))await child(["--part","seed","--schema",schema],`SEED_${mode}_${schema}.log`);
  const saved:ModelSnapshot|undefined=["published","orphaned"].includes(part)?JSON.parse(await readFile(path.join(out,schema+".json"),"utf8")):undefined;
  if(part==="published"){process.env.PGOPTIONS+=" -c default_transaction_read_only=on";process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN="";}
  if(part==="unconfigured")process.env.NAUMI_ROUTER_MANAGEMENT_URL="";
  if(part==="setup")Object.assign(process.env,{OPENAI_API_KEY:"",AGENT_API_KEY:"",VIDEO_API_KEY:"",VIDEO_PROVIDERS_JSON:"[]"});
  if(part==="sidecar")process.env.FLEET_PORTAL_ONLY="1";
  pool=(await load("src/platform/db/pool.ts")).getPool();queries.length=0;
  if(part==="cold-read"){
   if(baseline){ok((await current()).version>0);eq(metadata,2);eq(await count("app_model_config_versions"),1);}
   else{await rejectRead();eq(metadata,0);eq(mutations().length,0);eq((await admin.query("SELECT to_regclass('app_model_config_state') AS n")).rows[0].n,null);}
  }else if(part==="web-startup"){
   const report=await boot();eq(report.steps.length,baseline?13:14);eq(report.modelRegistry,baseline?undefined:{state:"initialized",version:1});eq(metadata,baseline?0:2);const before=metadata;queries.length=0;const snapshot=await current();ok(snapshot.config.publicModels.some(m=>m.id==="fixture-wire"));const writes=mutations().length;if(baseline)ok(writes>0);else eq(writes,0);eq(metadata-before,baseline?2:0);await badLogin();
  }else if(part==="published"){
   if(!baseline)eq(await prepare(),{state:"published",version:saved!.version});eq(await current(),saved);eq(await(await load("src/lib/model-config/published.ts")).readPublishedModelSnapshot(saved!.version),saved);eq(mutations().length,0);eq(metadata,0);eq((await pool!.query("SHOW transaction_read_only")).rows[0].transaction_read_only,"on");
  }else if(part==="retry"){
   const initial=await boot();if(baseline){eq(initial.modelRegistry,undefined);await assert.rejects(current(),e=>(e as {code?:string}).code==="ROUTER_UNAVAILABLE");checks++;}else eq(initial.modelRegistry,{state:"unavailable",code:"ROUTER_UNAVAILABLE"});eq(metadata,1);await badLogin();eq(await count("app_model_config_versions"),0);eq(await count("app_model_credentials"),0);
   await admin.query(`CREATE FUNCTION ${schema}.fail_model_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'R4B5_REAL_INSERT_FAULT'; END $$; CREATE TRIGGER fail_model_insert BEFORE INSERT ON app_model_config_versions FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_model_insert()`);trigger=true;
   if(baseline)await rejectRead();else eq(await prepare(),{state:"unavailable",code:"CONFIG_UNAVAILABLE"});eq(await count("app_model_config_versions"),0);eq(await count("app_model_credentials"),0);eq(metadata,3);await admin.query("DROP TRIGGER fail_model_insert ON app_model_config_versions");trigger=false;
   const administration=await load("src/lib/model-config/server.ts"),all=await Promise.all(Array.from({length:8},()=>administration.getModelAdministration()));ok(all.every(x=>x===all[0]));eq(await count("app_model_config_versions"),1);eq(await count("app_model_config_state"),1);eq(metadata,5);const before=metadata;queries.length=0;ok((await current()).version>0);eq(mutations().length,0);eq(metadata,before);
  }else if(part==="orphaned"){
   await admin.query("DELETE FROM app_model_config_state");queries.length=0;
   if(baseline){ok((await current()).version>saved!.version);eq(await count("app_model_config_versions"),2);eq(metadata,2);}
   else{await rejectRead();eq(await prepare(),{state:"unavailable",code:"CONFIG_UNAVAILABLE"});eq(mutations().length,0);eq(await count("app_model_config_versions"),1);eq(metadata,0);}
   eq(await(await load("src/lib/model-config/published.ts")).readPublishedModelSnapshot(saved!.version),saved);
  }else if(part==="accepted-missing"){
   await rejectRead(77);eq(metadata,0);eq(mutations().length,0);eq((await admin.query("SELECT to_regclass('app_model_config_versions') AS n")).rows[0].n,null);
  }else if(part==="inflight"){
   await child(["--part","seed","--schema",schema],`INFLIGHT_SEED_${mode}.log`,"scripts/verify-web-startup-pg.ts");const before:Record<string,unknown>=JSON.parse(await readFile(path.join(out,schema+"-preserved.json"),"utf8"));await boot();
   for(const [table,rows] of Object.entries(before))eq((await admin.query(`SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows,rows);
   eq((await admin.query("SELECT sum(cost)::int n FROM app_gen_reservations")).rows[0].n,12);eq(await count("app_billing_operations"),2);eq((await admin.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);eq(metadata,baseline?0:2);
  }else if(part==="unconfigured"){
   const report=await boot();eq(report.modelRegistry,baseline?undefined:{state:"legacy"});eq(await count("app_model_config_versions"),0);await badLogin();eq(metadata,0);
  }else if(part==="setup"){
   const report=await boot();eq(report.modelRegistry,baseline?undefined:{state:"unconfigured"});eq(await count("app_model_config_versions"),0);eq(await count("app_model_credentials"),0);eq(metadata,baseline?0:2);
   const route=await load("src/app/api/setup/route.ts"),request=()=>new Request(origin+"/api/setup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({apiKey:"setup-fixture-key-not-real",siteName:"Fixture"})});eq((await route.POST(request())).status,200);eq(await count("app_model_config_versions"),baseline?0:1);queries.length=0;ok((await current()).config.publicModels.some(m=>m.id==="fixture-wire"));if(baseline)ok(mutations().length>0);else eq(mutations().length,0);eq((await route.POST(request())).status,403);eq(await count("app_model_config_versions"),1);eq(await count("app_gen_reservations"),0);
  }else if(part==="sidecar"){
   eq(await boot(),{mode:"sidecar",steps:[]});eq(queries.length,0);await rejectRead();eq(metadata,0);eq(mutations().length,0);
  }else throw Error("Unknown part: "+part);
  eq(suppliers,0);eq(external,0);console.log(`MODEL_REGISTRY_PART=${part} MODE=${mode} CHECKS=${checks} METADATA_GET=${metadata} RESULT=PASS`);
 }finally{
  Client.prototype.query=originalQuery;globalThis.fetch=originalFetch;if(pool)await pool.end();if(trigger)await admin.query("DROP TRIGGER fail_model_insert ON app_model_config_versions");if(part!=="seed")await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await new Promise<void>(resolve=>server.close(()=>resolve()));console.log(`MODEL_REGISTRY_CLEANUP=${part} SCHEMA_${part==="seed"?"RETAINED":"DROPPED"}=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
