/** R4B3 full-checkout A/B. Seed in another process, then observe genuinely cold
 * execution. Real PG and handlers; Router control is loopback, generation is zero. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool,Client} from "pg";
import type {ModelSnapshot,ModelFacts} from "../src/lib/model-config/types";
import type {ConfigSnapshot} from "../src/lib/billing/types";
import type {ExecutionModel,createModelExecutor} from "../src/lib/model-config/execution";

const arg=(n:string)=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const parts=["readonly-direct","readonly-router","no-control","frozen-operation","projection-lease","corrupt"];
type Saved={models:ModelSnapshot;billing:ConfigSnapshot;currentBilling:ConfigSnapshot;direct:ExecutionModel;routed:ExecutionModel;ref:string};
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");assert.match(new URL(process.env.DATABASE_URL!).pathname,/fixture/);
 const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part"),out=path.resolve(process.env.MODEL_EXECUTION_EVIDENCE||"output/refactor-r4b3-20261025");await mkdir(out,{recursive:true});
 const load=(f:string)=>import(pathToFileURL(path.join(root,f)).href);
 async function child(args:string[],name:string){
  const cp=spawn(process.execPath,["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-model-execution-boundary-pg.ts"),"--source-root",root,...args,...(baseline?["--baseline"]:[])],{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";cp.stdout.on("data",v=>stdout+=v);cp.stderr.on("data",v=>stderr+=v);const code=await new Promise<number|null>((resolve,reject)=>{cp.once("error",reject);cp.once("close",resolve);});await writeFile(path.join(out,name),stdout+stderr+`\nEXIT=${code}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,name);return stdout;
 }
 if(!part){let checks=0;for(const p of parts){const stdout=await child(["--part",p],`PG_${mode}_${p}.log`);checks+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);}console.log(`MODEL_EXECUTION_BOUNDARY_PG=PASS mode=${mode} parts=${parts.length} checks=${checks} SOURCE=FULL_CHECKOUT COLD_MODULES=1 FROZEN=${baseline?"ADMIN_DDL_COUPLING_REPRODUCED":"SELECT_ONLY"} PRICE=ORIGINAL ROUTER_PREPARE=LEASED ROUTER_DIGEST=VERIFIED HTTP=ACTUAL SUPPLIER=0 EXTERNAL=0`);return;}
 const owner="executor@fixture.test",facts:ModelFacts={task:"product",quality:"medium",resolution:"1K",ratio:"1:1",needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0};
 if(part==="seed"){
  const schema=arg("--schema")!;assert.match(schema,/^modelexec_[a-f0-9]+$/);process.env.PGOPTIONS=`-c search_path=${schema}`;const db=await load("src/lib/db.ts"),pool=db.getPool();
  const seedFetch=globalThis.fetch;let seedExternal=0;globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(url.origin!==process.env.FIXTURE_MODEL_ORIGIN){seedExternal++;throw Error("External seed request blocked");}return seedFetch(input,init);}) as typeof fetch;
  try{
   await db.ensureSchema();await(await load("src/lib/model-config/schema.ts")).ensureModelSchema(pool);
   const credentials=(await load("src/lib/model-config/credentials.ts")).createCredentialStore(pool),ref=await credentials.importPlain({providerId:"p1",plain:"execution-fixture-key-not-a-supplier-key",actor:"fixture"});
   const config=(await load("scripts/model-config-unit-fixture.ts")).fixtureModelConfig(process.env.FIXTURE_MODEL_ORIGIN+"/v1",ref.id);
   config.pools.push({id:"pool-one",modality:"image",strategy:"priority",candidates:["u1"],rules:[]});config.publicModels.push({id:"image-pool",label:"Fixture pool",modality:"image",enabled:true,visible:true,target:{type:"pool",id:"pool-one"}});
   const repo=(await load("src/lib/model-config/repository.ts")).createModelRepository({pool,trustedOrigins:[process.env.FIXTURE_MODEL_ORIGIN!],initialize:async()=>config}),models=await repo.current();
   const runtime=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime();let current=await runtime.config.current(),billingConfig=structuredClone(current.config);billingConfig.credits.signup.amount=0;billingConfig.switches.metering="on";billingConfig.costs["supplier-cost-estimate"]={currency:"CNY",amountMicros:"10000",unit:"image",source:"manual-estimate"};
   for(const id of ["image.generate","canvas.image"] as const)billingConfig.features[id].pricing={mode:"fixed",credits:6};
   const billing=await runtime.config.publish({id:randomUUID(),actor:"fixture",reason:"initial price",expectedVersion:current.version,config:billingConfig});await db.getOrCreateUser(owner);
   const executor:ReturnType<typeof createModelExecutor>=await(await load("src/lib/model-config/execution.ts")).getModelExecutor();
   const direct=await executor.resolve({snapshot:models,billing,binding:"image.generate",requestedModelId:"image-a",facts}),routed=await executor.resolve({snapshot:models,billing,binding:"image.generate",requestedModelId:"image-pool",facts});
   current=await runtime.config.current();billingConfig=structuredClone(current.config);for(const id of ["image.generate","canvas.image"] as const)billingConfig.features[id].pricing={mode:"fixed",credits:99};
   const currentBilling=await runtime.config.publish({id:randomUUID(),actor:"fixture",reason:"later price",expectedVersion:current.version,config:billingConfig});
   await writeFile(path.join(out,schema+".json"),JSON.stringify({models,billing,currentBilling,direct,routed,ref:ref.id} satisfies Saved));assert.equal(seedExternal,0);console.log("MODEL_EXECUTION_SEED=PASS separate_process=1 EXTERNAL=0");
  }finally{globalThis.fetch=seedFetch;await pool.end();}return;
 }
 assert.ok(parts.includes(part));let checks=0,prepares=0,discoveries=0,suppliers=0,external=0,failPrepare=false;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
 const reject=async(p:Promise<unknown>,code?:string)=>{await assert.rejects(p,e=>!code||(e as {code?:string}).code===code);checks++;};
 const server=createServer(async(req,res)=>{const pathname=new URL(req.url||"/","http://fixture").pathname;res.setHeader("content-type","application/json");
  if(pathname==="/internal/config/prepare"){prepares++;const chunks:Buffer[]=[];for await(const b of req)chunks.push(Buffer.from(b));const body=JSON.parse(Buffer.concat(chunks).toString());if(failPrepare){failPrepare=false;res.writeHead(500);res.end('{}');return;}res.end(JSON.stringify({digest:body.digest,phase:"prepared"}));return;}
  if(pathname.startsWith("/internal/config/legacy")){discoveries++;res.end(pathname.endsWith("credentials")?'{"credentials":[]}':'{"providers":[],"routes":[],"aliases":[]}');return;}
  if(pathname.startsWith("/v1/"))suppliers++;res.writeHead(500);res.end('{"error":"unexpected fixture request"}');
 });await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const schema="modelexec_"+randomUUID().replaceAll("-",""),admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`});await admin.query(`CREATE SCHEMA ${schema}`);
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:"model-execution-fixture-012345678901234567890",NAUMI_MULTI_USER:"1",MODEL_CONFIG_TRUSTED_ORIGINS:origin,NAUMI_ROUTER_MANAGEMENT_URL:origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"execution-fixture-control-independent-0123456",MODEL_CONFIG_ENVELOPE_SECRET:"execution-fixture-envelope-independent-67890",NAUMI_ROUTER_GENERATION_URL:origin+"/v1",NAUMI_ROUTER_GENERATION_TOKEN:"execution-fixture-generation-only",FIXTURE_MODEL_ORIGIN:origin});delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const realFetch=globalThis.fetch;globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(url.origin!==origin){external++;throw Error("External request blocked by execution fixture");}return realFetch(input,init);}) as typeof fetch;
 let pool:Pool|undefined;const rawQuery=Client.prototype.query,queries:string[]=[];
 try{
  await child(["--part","seed","--schema",schema],`SEED_${mode}_${schema}.log`);const saved:Saved=JSON.parse(await readFile(path.join(out,schema+".json"),"utf8"));prepares=discoveries=0;
  if(part.startsWith("readonly"))process.env.PGOPTIONS+=" -c default_transaction_read_only=on";
  if(part==="no-control")process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN="";
  const db=await load("src/platform/db/pool.ts");pool=db.getPool();
  Client.prototype.query=function(this:Client,...args:unknown[]){queries.push(String(args[0]));return Reflect.apply(rawQuery,this,args);} as typeof Client.prototype.query;
  const execution=await load("src/lib/model-config/execution.ts"),context=await load("src/lib/model-config/context.ts");
  if(part.startsWith("readonly")){
   eq(pool!.totalCount,0);
   if(baseline){await reject(execution.getModelExecutor(),"25006");ok(queries.some(s=>/\b(?:CREATE|ALTER)\b/i.test(s)));}
   else{
    const executor:ReturnType<typeof createModelExecutor>=await execution.getModelExecutor();eq(queries.length,0);
    const frozen=part==="readonly-router"?saved.routed:saved.direct,described=await executor.describe(frozen);eq(described.frozen,frozen);eq(described.connection.wireModel,part==="readonly-router"?"image-pool":"wire-image-one");
    if(part==="readonly-direct")eq(described.connection.apiKey,"execution-fixture-key-not-a-supplier-key");
    const bundle={modelVersion:saved.models.version,billingVersion:saved.billing.version,primary:"image" as const,image:frozen};
    const result=await execution.withFrozenExecutionBundle(bundle,async()=>({models:context.currentModelExecution()?.frozen.modelVersion,billing:context.currentModelBillingSnapshot()?.version}));eq(result,{models:saved.models.version,billing:saved.billing.version});
    eq(queries.filter(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)).length,0);eq((await pool!.query("SHOW transaction_read_only")).rows[0].transaction_read_only,"on");
   }eq(prepares,0);eq(discoveries,0);
  }else if(part==="no-control"){
   if(baseline)await reject(execution.getModelExecutor(),"ROUTER_UNAVAILABLE");
   else{
    const executor:ReturnType<typeof createModelExecutor>=await execution.getModelExecutor();eq((await executor.describe(saved.direct)).connection.wireModel,"wire-image-one");eq((await executor.describe(saved.routed)).connection.protocol,"router-images");
    const bundle={modelVersion:saved.models.version,billingVersion:saved.billing.version,primary:"image" as const,image:saved.direct};eq(await execution.withFrozenExecutionBundle(bundle,async()=>context.currentModelBillingSnapshot()?.version),saved.billing.version);
   }
   const native=await load("src/lib/native-auth.ts"),route=await load("src/app/api/imagegen/plan/route.ts"),body={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"fixture product image",augment:false,inputs:[],parameters:{quality:"medium",resolution:"1K",ratio:"1:1"},output:{format:"png"},variants:1};
   const response=await route.POST(new Request(origin+"/api/imagegen/plan",{method:"POST",headers:{cookie:`nv_user=${native.signUserSession(owner,Date.now())}`,"content-type":"application/json"},body:JSON.stringify(body)}));eq(response.status,baseline?400:200);const result=await response.json();if(baseline)ok(typeof result.error==="string");else {eq(result.totalCredits,99);ok(result.quote.id);}
   eq(prepares,0);eq(discoveries,0);
  }else if(part==="frozen-operation"){
   const requests=await load("src/lib/model-config/requests.ts");let calls=0;queries.length=0;
   const result=await requests.withModelOperation({path:"/api/generate-image",body:{model:"image-a",prompt:"original frozen operation",quality:"medium",resolution:"1K",ratio:"1:1"},references:0,featureModel:"image-a",versions:{modelVersion:saved.models.version,billingVersion:saved.billing.version}},async()=>{calls++;return {model:context.currentModelExecution()?.frozen.modelVersion,billing:context.currentModelBillingSnapshot()?.version};});
   eq(result,{model:saved.models.version,billing:saved.billing.version});eq(calls,1);
   if(!baseline){eq(queries.filter(s=>s.includes("app_model_config_state")&&/active_version/.test(s)).length,0);eq(queries.filter(s=>s.includes("app_settings")&&s.includes("app_billing_config_versions")).length,0);}
   const plan=(await load("src/lib/imagegen/plan.ts")).planImagegen;const request={version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",modelId:"image-a",prompt:"original contract",augment:false,inputs:[],parameters:{quality:"medium",resolution:"1K",ratio:"1:1"},output:{format:"png"},variants:1};
   const quoted=await plan(request,owner,{modelVersion:saved.models.version,billingVersion:saved.billing.version});eq(quoted.totalCredits,6);eq(quoted.billingVersion,saved.billing.version);eq((await plan({...request,operationId:randomUUID()},owner)).totalCredits,99);
   eq((await admin.query("SELECT count(*)::int n FROM app_gen_reservations")).rows[0].n,0);eq((await admin.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);eq(prepares,0);eq(discoveries,0);
  }else if(part==="projection-lease"){
   const runtime=baseline?(await(await load("src/lib/model-config/server.ts")).getModelAdministration()).runtime:(await load("src/lib/model-config/execution-services.ts")).getModelExecutionServices().runtime;
   failPrepare=true;await reject(runtime.prepareExecution({snapshot:saved.models,billing:saved.currentBilling}),"ROUTER_UNAVAILABLE");eq(prepares,1);eq((await admin.query("SELECT phase FROM app_model_router_projections WHERE model_version=$1 AND billing_version=$2",[saved.models.version,saved.currentBilling.version])).rows[0].phase,"unknown");
   const results=await Promise.all(Array.from({length:8},()=>runtime.prepareExecution({snapshot:saved.models,billing:saved.currentBilling})));eq(new Set(results.map((r:{digest:string})=>r.digest)).size,1);eq(prepares,2);
   const projection=results[0];await runtime.validateExecutionProjection({modelVersion:saved.models.version,billingVersion:saved.currentBilling.version,digest:projection.digest});eq((await admin.query("SELECT phase,lease_id,lease_until FROM app_model_router_projections WHERE model_version=$1 AND billing_version=$2",[saved.models.version,saved.currentBilling.version])).rows[0],{phase:"prepared",lease_id:null,lease_until:null});
   await runtime.prepareExecution({snapshot:saved.models,billing:saved.currentBilling});eq(prepares,2);eq(discoveries,0);
  }else if(part==="corrupt"){
   const executor:ReturnType<typeof createModelExecutor>=await execution.getModelExecutor();eq((await executor.describe(saved.direct)).connection.wireModel,"wire-image-one");
   const versionReader=baseline?(await(await load("src/lib/model-config/server.ts")).getModelAdministration()).runtime:(await load("src/lib/model-config/execution-services.ts")).getModelExecutionServices().runtime;
   queries.length=0;await reject(versionReader.byVersion(undefined as unknown as number),"INVALID_CONFIG");eq(queries.length,0);
   await reject(executor.describe({...saved.direct,modelDigest:"0".repeat(64)}),"EXECUTION_MISMATCH");await reject(executor.describe({...saved.direct,credentialRef:randomUUID()}),"EXECUTION_MISMATCH");await reject(executor.describe({...saved.direct,modelVersion:999999}),"CONFIG_UNAVAILABLE");
   const original=(await admin.query("SELECT key_enc FROM app_model_credentials WHERE id=$1",[saved.ref])).rows[0].key_enc;await admin.query("UPDATE app_model_credentials SET key_enc='invalid-fixture' WHERE id=$1",[saved.ref]);await reject(executor.describe(saved.direct),"CREDENTIAL_UNAVAILABLE");await admin.query("UPDATE app_model_credentials SET key_enc=$2 WHERE id=$1",[saved.ref,original]);
   const billing=baseline?(await(await load("src/lib/billing/runtime.ts")).getBillingRuntime()).config:{byVersion:(await load("src/lib/billing/frozen-config.ts")).readFrozenBillingSnapshot};await reject(billing.byVersion(0),"INVALID_CONFIG");await reject(billing.byVersion(999999),"CONFIG_UNAVAILABLE");
   const row=(await admin.query("SELECT payload FROM app_model_router_projections WHERE model_version=$1 AND billing_version=$2",[saved.models.version,saved.billing.version])).rows[0];await admin.query("UPDATE app_model_router_projections SET payload=payload||'{\"digest\":\"bad\"}'::jsonb WHERE model_version=$1 AND billing_version=$2",[saved.models.version,saved.billing.version]);await reject(executor.describe(saved.routed),"EXECUTION_MISMATCH");await admin.query("UPDATE app_model_router_projections SET payload=$3::jsonb WHERE model_version=$1 AND billing_version=$2",[saved.models.version,saved.billing.version,JSON.stringify(row.payload)]);
   await reject(executor.runBundle({modelVersion:saved.models.version,billingVersion:saved.billing.version+99,image:saved.direct},saved.billing,async()=>{}),"EXECUTION_MISMATCH");eq(prepares,0);eq(discoveries,0);
  }
  eq(suppliers,0);eq(external,0);console.log(`MODEL_EXECUTION_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
 }finally{Client.prototype.query=rawQuery;globalThis.fetch=realFetch;if(pool)await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await new Promise<void>(resolve=>server.close(()=>resolve()));console.log(`MODEL_EXECUTION_CLEANUP=${part} SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1`);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
