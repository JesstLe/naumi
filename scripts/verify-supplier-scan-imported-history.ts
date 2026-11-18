/** A staging copy carries another site's frozen usage job under this site's key.
 * The supplier cost scan must not upsert that read-only row (55000 aborted the
 * whole scan on 47 and left an UNKNOWN fence); it keeps its own usage job. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {createModelFixture} from "./model-config-fixture";

async function verify(){
  Object.assign(process.env,{NAUMI_STAGING_HISTORY_GUARD:"1",NAUMI_ENVIRONMENT:"staging"});
  const f=await createModelFixture(async(_req,res)=>{res.writeHead(500);res.end("{}");});
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  let checks=0;const check=(ok:unknown,msg:string)=>{assert.ok(ok,msg);checks++;};
  try{
    const {ensureSupplierSchema}=await import("../src/lib/supplier-cost/schema");
    const {createSupplierLedger}=await import("../src/lib/supplier-cost/repository");
    const {scanSupplierCostJobs}=await import("../src/lib/supplier-cost/scan");
    await ensureSupplierSchema(f.sql);
    // Same guard as the 47 staging database (naumi_staging_guard.freeze_imported_row).
    await f.sql.query(`CREATE SCHEMA naumi_staging_guard;
      CREATE TABLE naumi_staging_guard.origin_rows(table_name text NOT NULL,key_column text NOT NULL,row_key text NOT NULL,snapshot_sha256 text,imported_at timestamptz DEFAULT now(),PRIMARY KEY(table_name,row_key));
      CREATE FUNCTION naumi_staging_guard.freeze_imported_row() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE old_key text; BEGIN old_key := to_jsonb(OLD)->>TG_ARGV[0];
        IF EXISTS (SELECT 1 FROM naumi_staging_guard.origin_rows WHERE table_name=TG_TABLE_NAME AND row_key=old_key) THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='STAGING_IMPORTED_HISTORY_READ_ONLY'; END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $fn$;`);
    await f.sql.query("CREATE TRIGGER naumi_staging_history_freeze BEFORE DELETE OR UPDATE ON app_supplier_cost_jobs FOR EACH ROW EXECUTE FUNCTION naumi_staging_guard.freeze_imported_row('key')");
    const ledger=createSupplierLedger(f.sql);
    const credential=(await f.credentials.importPlain({providerId:"cost-apimart",plain:"fixture-private-key",actor:"fixture"})).id;
    const account=`acct-${randomUUID().replaceAll("-","")}`;
    await ledger.account({id:account,providerId:"cost-apimart",protocol:"apimart-images",baseUrl:f.origin,credentialRef:credential});
    await f.sql.query("UPDATE app_supplier_accounts SET usage_enabled=true,last_usage_at=NULL WHERE id=$1",[account]);
    const frozenKey=`staging:usage:${account}`;
    await f.sql.query("INSERT INTO app_supplier_cost_jobs(key,kind,account_id,payload,state) VALUES($1,'usage',$2,'{}','queued')",[frozenKey,account]);
    await f.sql.query("INSERT INTO naumi_staging_guard.origin_rows(table_name,key_column,row_key) VALUES('app_supplier_cost_jobs','key',$1)",[frozenKey]);
    const before=(await f.sql.query("SELECT to_jsonb(j) v FROM app_supplier_cost_jobs j WHERE key=$1",[frozenKey])).rows[0].v;

    let failure:unknown;
    try{await scanSupplierCostJobs(ledger,{fetcher:async()=>new Response("{}",{status:500}),batch:3});}catch(error){failure=error;}
    check(failure===undefined,`scan completes despite a frozen usage job (got ${(failure as {code?:string})?.code||failure})`);
    const after=(await f.sql.query("SELECT to_jsonb(j) v FROM app_supplier_cost_jobs j WHERE key=$1",[frozenKey])).rows[0].v;
    assert.deepEqual(after,before);checks++;
    const own=(await f.sql.query("SELECT key,kind,account_id FROM app_supplier_cost_jobs WHERE key=$1",[`${frozenKey}:site`])).rows;
    check(own.length===1&&own[0].kind==="usage"&&own[0].account_id===account,"this site keeps its own usage job");
    await scanSupplierCostJobs(ledger,{fetcher:async()=>new Response("{}",{status:500}),batch:3});
    check((await f.sql.query("SELECT count(*)::int n FROM app_supplier_cost_jobs WHERE account_id=$1 AND kind='usage'",[account])).rows[0].n===2,"repeat scans reuse the same site key");
    console.log(`SUPPLIER_SCAN_IMPORTED_HISTORY=PASS checks=${checks}`);
  }finally{
    await f.cleanup();
  }
}
async function main(){
  const fixtureUrl=new URL(process.env.DATABASE_URL||"http://invalid");
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
  assert.ok(["postgres:","postgresql:"].includes(fixtureUrl.protocol));
  assert.equal(fixtureUrl.hostname,"127.0.0.1");
  assert.match(fixtureUrl.pathname,/^\/[A-Za-z0-9_]*fixture[A-Za-z0-9_]*$/);

  // The guard uses a fixed, qualified schema name. A random search_path
  // cannot isolate it from later cases sharing the CI database.
  const admin=new Pool({connectionString:fixtureUrl.toString(),ssl:false});
  const database="supplier_guard_fixture_"+randomUUID().replaceAll("-","");
  let created=false;
  try{
    await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);
    created=true;
    fixtureUrl.pathname="/"+database;
    process.env.DATABASE_URL=fixtureUrl.toString();
    await verify();
  }finally{
    try{if(created)await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);}
    finally{await admin.end();}
  }
}
main().catch(error=>{console.error(error);process.exit(1);});
