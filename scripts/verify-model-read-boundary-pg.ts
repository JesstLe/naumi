/** R4B1 full-checkout real-PG A/B. The seed runs in a separate process so the
 * observed application has genuinely cold module/schema caches. Router discovery
 * uses loopback only; no generation, payment, external HTTP or product database. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Pool,Client} from "pg";
import type {ModelSnapshot} from "../src/lib/model-config/types";
const arg=(n:string)=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const parts=["readonly","control-unavailable","versions","corrupt-state","http","cold-retry","accepted-missing","sidecar"];
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
  const root=path.resolve(arg("--source-root")||"."),baseline=process.argv.includes("--baseline"),mode=baseline?"BASELINE":"MODIFIED",part=arg("--part"),out=path.resolve(process.env.MODEL_READ_EVIDENCE||"output/refactor-r4b1-20261025");
  const load=(file:string)=>import(pathToFileURL(path.join(root,file)).href);await mkdir(out,{recursive:true});
  async function child(args:string[],file:string,extra:Partial<NodeJS.ProcessEnv>={}){
    const cp=spawn(process.execPath,["--conditions=react-server","--import","tsx",path.resolve("scripts/verify-model-read-boundary-pg.ts"),"--source-root",root,...args,...(baseline?["--baseline"]:[])],{env:{...process.env,...extra,TSX_TSCONFIG_PATH:path.join(root,"tsconfig.json")},windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";cp.stdout.on("data",v=>stdout+=v);cp.stderr.on("data",v=>stderr+=v);const code=await new Promise<number|null>((resolve,reject)=>{cp.once("error",reject);cp.once("exit",resolve);});
    await writeFile(path.join(out,file),stdout+stderr+`\nEXIT=${code}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,file);return stdout;
  }
  if(!part){let checks=0;for(const p of parts){const stdout=await child(["--part",p],`PG_${mode}_${p}.log`);checks+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);}console.log(`MODEL_READ_BOUNDARY_PG=PASS mode=${mode} parts=${parts.length} checks=${checks} SOURCE=FULL_CHECKOUT COLD_MODULES=1 READONLY=${baseline?"DDL_BLOCK_REPRODUCED":"SELECT_ONLY"} CONTROL=${baseline?"READ_COUPLED":"READ_INDEPENDENT"} VERSIONS=EXACT COLD_BOOTSTRAP=RETRY_ATOMIC HTTP=ACTUAL SUPPLIER=0 EXTERNAL=0`);return;}
  if(part==="seed"){
    const schema=arg("--schema")!;assert.match(schema,/^modelread_[a-f0-9]+$/);process.env.PGOPTIONS=`-c search_path=${schema}`;
    const db=await load("src/lib/db.ts");const pool=db.getPool();
    try{
      await db.ensureSchema();const {ensureModelSchema}=await load("src/lib/model-config/schema.ts");await ensureModelSchema(pool);
      const credentials=(await load("src/lib/model-config/credentials.ts")).createCredentialStore(pool),ref=await credentials.importPlain({providerId:"p1",plain:"fixture-not-a-real-supplier-key",actor:"fixture"});
      const config=(await load("scripts/model-config-unit-fixture.ts")).fixtureModelConfig(process.env.FIXTURE_MODEL_ORIGIN+"/v1",ref.id);
      const repo=(await load("src/lib/model-config/repository.ts")).createModelRepository({pool,trustedOrigins:[process.env.FIXTURE_MODEL_ORIGIN!],initialize:async()=>config});
      const models=await repo.current(),billing=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime();await billing.config.current();await db.getOrCreateUser("model-reader@fixture.test");
      await writeFile(path.join(out,schema+".json"),JSON.stringify(models));console.log("MODEL_READ_SEED=PASS separate_process=1");
    }finally{await pool.end();}return;
  }
  assert.ok(parts.includes(part));
  let checks=0,discovery=0,external=0,routerFault=part==="cold-retry",writeFault=part==="cold-retry";
  const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
  const reject=async(p:Promise<unknown>,code?:string)=>{await assert.rejects(p,e=>!code||(e as {code?:string}).code===code);checks++;};
  const server=createServer((req,res)=>{
    const url=new URL(req.url||"/","http://fixture");res.setHeader("content-type","application/json");
    if(url.pathname==="/internal/config/legacy"){discovery++;if(routerFault){routerFault=false;res.writeHead(500);res.end('{}');return;}res.end(JSON.stringify({providers:[],routes:[],aliases:[]}));return;}
    if(url.pathname==="/internal/config/legacy/credentials"){discovery++;res.end('{"credentials":[]}');return;}
    res.writeHead(500);res.end('{"error":"unexpected fixture request"}');
  });await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const schema="modelread_"+randomUUID().replaceAll("-",""),admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`});await admin.query(`CREATE SCHEMA ${schema}`);
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:"model-read-fixture-settings-secret-0123456789",NAUMI_MULTI_USER:"1",NAUMI_ROUTER_MANAGEMENT_URL:origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"model-reader-fixture-control-independent-012345",MODEL_CONFIG_ENVELOPE_SECRET:"model-reader-fixture-envelope-independent-67890",MODEL_CONFIG_TRUSTED_ORIGINS:origin,OPENAI_BASE_URL:origin+"/v1",OPENAI_API_KEY:"fixture-not-a-real-key",OPENAI_IMAGE_MODEL:"wire-image-one",OPENAI_IMAGE_MODELS:"wire-image-one",OPENAI_TEXT_MODEL:"fixture-text",AGENT_MODEL:"fixture-text",FIXTURE_MODEL_ORIGIN:origin});
  delete process.env.NEW_API_IMAGE_API_KEY;delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  const realFetch=globalThis.fetch;globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(url.origin!==origin){external++;throw Error("External request blocked by fixture");}return realFetch(input,init);}) as typeof fetch;
  let db:typeof import("../src/lib/db")|undefined;
  const rawQuery=Client.prototype.query;const queries:string[]=[];
  try{
    const seeded=["readonly","control-unavailable","versions","corrupt-state","http"].includes(part);
    if(seeded)await child(["--part","seed","--schema",schema],`SEED_${mode}_${schema}.log`);
    const saved:ModelSnapshot|undefined=seeded?JSON.parse(await readFile(path.join(out,schema+".json"),"utf8")):undefined;
    if(part==="readonly")process.env.PGOPTIONS+=` -c default_transaction_read_only=on`;
    if(part==="control-unavailable")process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN="";
    if(part==="sidecar")process.env.FLEET_PORTAL_ONLY="1";
    db=await load("src/lib/db.ts");const pool=db!.getPool(),snapshots=await load("src/lib/model-config/snapshot-reader.ts"),catalog=await load("src/lib/image-model-catalog.ts");
    Client.prototype.query=function(this:Client,...args:unknown[]){const sql=String(args[0]);queries.push(sql);if(writeFault&&sql.includes("INSERT INTO app_model_config_versions(")){writeFault=false;return Reflect.apply(rawQuery,this,["SELECT 1/0"]);}return Reflect.apply(rawQuery,this,args);} as typeof Client.prototype.query;
    if(part==="readonly"){
      eq(pool.totalCount,0);
      if(baseline){await reject(snapshots.readManagedModelSnapshot(),"25006");ok(queries.some(s=>/\b(?:CREATE|ALTER)\b/i.test(s)));}
      else{
        const result=await snapshots.readManagedModelSnapshot();eq(result,saved);eq(await snapshots.readManagedModelSnapshot(saved!.version),saved);ok((await catalog.getImageModelCatalog()).some((m:{id:string})=>m.id==="image-a"));eq(queries.filter(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)).length,0);
        eq((await pool.query("SHOW transaction_read_only")).rows[0].transaction_read_only,"on");
      }
      eq(discovery,0);
    }else if(part==="control-unavailable"){
      if(baseline){await reject(snapshots.readManagedModelSnapshot(),"ROUTER_UNAVAILABLE");await reject(catalog.getImageModelCatalog(undefined,saved),"ROUTER_UNAVAILABLE");}
      else{
        eq(await snapshots.readManagedModelSnapshot(),saved);
        queries.length=0;ok((await catalog.getImageModelCatalog(undefined,saved)).some((m:{id:string})=>m.id==="image-a"));eq(queries.length,0);
      }
      eq(discovery,0);
    }else if(part==="versions"){
      eq(await snapshots.readManagedModelSnapshot(),saved);const repo=(await load("src/lib/model-config/repository.ts")).createModelRepository({pool:admin,trustedOrigins:[origin],initialize:async()=>{throw Error("seed must never repeat");}});
      const draft=await repo.draft("fixture"),config=structuredClone(draft.config);config.publicModels[0].label="Changed label";
      const updated=await repo.saveDraft({id:draft.id,actor:"fixture",expectedRevision:draft.revision,config}),pub=await repo.stage({id:randomUUID(),draftId:draft.id,actor:"fixture",expectedRevision:updated.revision,expectedVersion:saved!.version,reason:"Actual staged version"});
      eq((await snapshots.readManagedModelSnapshot()).version,saved!.version);await repo.markApplied(pub.id,pub.digest);const current=await snapshots.readManagedModelSnapshot();eq(current.version,pub.version);eq(current.config.publicModels[0].label,"Changed label");
      const old=await snapshots.readManagedModelSnapshot(saved!.version);eq(old,saved);old.config.publicModels[0].label="poison local copy";eq(await snapshots.readManagedModelSnapshot(saved!.version),saved);
      queries.length=0;await Promise.all(Array.from({length:8},()=>snapshots.readManagedModelSnapshot(saved!.version)));eq(queries.filter(s=>s.includes("SELECT * FROM app_model_config_versions WHERE version=$1")).length,0);
      const context=await load("src/lib/model-config/context.ts"),billing=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime(),b=await billing.config.current();queries.length=0;
      const inherited=await context.runExecutionBundle({frozen:{modelVersion:saved!.version,billingVersion:b.version},models:saved,billing:b},()=>snapshots.readManagedModelSnapshot());eq(inherited,saved);eq(queries.length,0);
      queries.length=0;await reject(snapshots.readManagedModelSnapshot(999999),"CONFIG_UNAVAILABLE");eq(queries.some(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)),false);
      await context.runLegacyModelExecution(async()=>eq(await snapshots.readManagedModelSnapshot(),null));
      const digest=(await load("src/lib/model-config/repository.ts")).modelConfigDigest;const bad=(await admin.query("INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,'fixture','corrupt fixture',$2,'bad') RETURNING version",[randomUUID(),JSON.stringify(config)])).rows[0].version;
      await admin.query("UPDATE app_model_config_state SET active_version=$1",[bad]);await reject(snapshots.readManagedModelSnapshot(),"CONFIG_UNAVAILABLE");await admin.query("UPDATE app_model_config_state SET active_version=$1",[current.version]);eq((await snapshots.readManagedModelSnapshot()).digest,digest(config));eq(discovery,0);
    }else if(part==="corrupt-state"){
      // Warm the old management assembler, then break the pointer, not the
      // accepted version. A broken live registry must never look like a new DB.
      eq(await snapshots.readManagedModelSnapshot(),saved);
      await admin.query("UPDATE app_model_config_state SET active_version=NULL");queries.length=0;
      await reject(snapshots.readManagedModelSnapshot(),"CONFIG_UNAVAILABLE");eq(queries.some(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)),false);
      eq(await snapshots.readManagedModelSnapshot(saved!.version),saved);
      await admin.query("UPDATE app_model_config_state SET active_version=$1",[saved!.version]);
      // A missing versions table with an existing pointer is damage, not a
      // bootstrap invitation. Retain the original relation for exact recovery.
      await admin.query("ALTER TABLE app_model_config_versions RENAME TO retained_model_versions");queries.length=0;
      await reject(snapshots.readManagedModelSnapshot());eq(queries.some(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)),false);eq(discovery,0);
      await admin.query("ALTER TABLE retained_model_versions RENAME TO app_model_config_versions");eq(await snapshots.readManagedModelSnapshot(),saved);
    }else if(part==="http"){
      await db!.ensureSchema();const billing=await(await load("src/lib/billing/runtime.ts")).getBillingRuntime();await billing.config.current();
      const native=await load("src/lib/native-auth.ts"),caps=await load("src/app/api/imagegen/capabilities/route.ts"),videos=await load("src/app/api/video/catalog/route.ts");queries.length=0;
      const response=await caps.GET(new Request("http://fixture.test/api/imagegen/capabilities?modelId=image-a",{headers:{cookie:"nv_user="+native.signUserSession("model-reader@fixture.test",Date.now())}}));eq(response.status,200);eq(await response.json(),{values:{edit:[]}});eq(response.headers.get("cache-control"),"private, no-store");
      const video=await videos.GET();eq(video.status,200);const body=await video.json();eq(body.version,saved!.version);eq(body.models,[]);eq(body.configured,false);
      const ddl=queries.filter(s=>/\b(?:CREATE|ALTER)\b/i.test(s)).length;eq(ddl>0,baseline);eq(discovery,0);await writeFile(path.join(out,`HTTP_${mode}.json`),JSON.stringify({imageStatus:response.status,video:body,ddl}));
    }else if(part==="cold-retry"){
      await reject(snapshots.readManagedModelSnapshot(),"ROUTER_UNAVAILABLE");eq((await admin.query("SELECT count(*)::int n FROM app_model_config_state")).rows[0].n,0);
      await reject(snapshots.readManagedModelSnapshot(),"CONFIG_UNAVAILABLE");eq(writeFault,false);eq((await admin.query("SELECT count(*)::int n FROM app_model_config_versions")).rows[0].n,0);eq((await admin.query("SELECT count(*)::int n FROM app_model_credentials")).rows[0].n,0);
      const all=await Promise.all(Array.from({length:8},()=>snapshots.readManagedModelSnapshot()));ok(all.every(s=>s.version===all[0].version&&s.digest===all[0].digest));eq((await admin.query("SELECT count(*)::int n FROM app_model_config_state")).rows[0].n,1);eq((await admin.query("SELECT count(*)::int n FROM app_model_config_versions")).rows[0].n,1);eq((await admin.query("SELECT count(*)::int n FROM app_model_publications WHERE phase='applied'")).rows[0].n,1);
      const before=discovery;queries.length=0;eq((await snapshots.readManagedModelSnapshot()).digest,all[0].digest);eq(discovery,before);eq(queries.some(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)),false);
    }else if(part==="accepted-missing"){
      await reject(snapshots.readManagedModelSnapshot(77),"CONFIG_UNAVAILABLE");const exists=(await admin.query("SELECT to_regclass('app_model_config_state') AS relation")).rows[0].relation;eq(!!exists,baseline);eq(discovery>0,baseline);if(!baseline)eq(queries.some(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)),false);
    }else if(part==="sidecar"){
      await reject(snapshots.readManagedModelSnapshot());eq(discovery,0);eq((await admin.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=current_schema()")).rows[0].n,0);eq(queries.some(s=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(s)),false);
    }
    eq(external,0);eq(pool.waitingCount,0);console.log(`MODEL_READ_PART=${part} MODE=${mode} CHECKS=${checks} RESULT=PASS`);
  }finally{
    Client.prototype.query=rawQuery;globalThis.fetch=realFetch;if(db)await db.getPool().end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();server.closeIdleConnections?.();await new Promise<void>(resolve=>server.close(()=>resolve()));console.log(`MODEL_READ_CLEANUP=${part} SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
