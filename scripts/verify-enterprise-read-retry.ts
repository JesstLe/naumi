/** enterpriseCreationRead is a read-only REPEATABLE READ snapshot with share locks.
 * A concurrent committed update to a share-locked row raises 40001; the snapshot
 * must be retried (bounded) instead of surfacing as an HTTP 500 on canvas polls. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";

async function main(){
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||new URL(process.env.DATABASE_URL||"http://invalid").hostname!=="127.0.0.1")throw Error("Isolated loopback PG required");
  const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema="erp_retry_"+randomUUID().replaceAll("-","");
  await admin.query(`CREATE SCHEMA ${schema}`);
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:process.env.SETTINGS_SECRET||"enterprise-read-retry-fixture-0123456789abcdef"});
  const other=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`,max:2});
  let checks=0;const check=(ok:unknown,msg:string)=>{assert.ok(ok,msg);checks++;};
  const db=await import("../src/lib/db"),{getPool}=await import("../src/platform/db/pool");
  try{
    await db.ensureSchema();
    const erp=await import("../src/lib/enterprise/server");await erp.ensureEnterpriseSchema();
    const owner=`owner-${randomUUID()}@retry.test`,bystander=`bystander-${randomUUID()}@retry.test`,team=randomUUID();
    await db.getOrCreateUser(owner,"Owner");await db.getOrCreateUser(bystander,"Bystander");
    const pool=getPool();
    await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','fixture','fixture')",[owner]);
    await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Retry',$2,now()+interval '1 day')",[team,owner]);
    await pool.query("INSERT INTO app_enterprise_settings(team_id) VALUES($1)",[team]);
    // Commit an update to a row this snapshot has not locked, then share-lock it: 40001.
    const conflict=async(tx:{query:(sql:string,values?:unknown[])=>Promise<unknown>})=>{
      await other.query("UPDATE app_users SET name=name WHERE email=$1",[bystander]);
      await tx.query("SELECT 1 FROM app_users WHERE email=$1 FOR SHARE",[bystander]);
    };

    let attempts=0;
    const once=await erp.enterpriseCreationRead(owner,team,async(tx,s)=>{attempts++;if(attempts===1)await conflict(tx);return s.team.id;});
    check(once===team&&attempts===2,`one concurrent update is retried transparently (attempts=${attempts})`);

    attempts=0;let code:unknown;
    try{await erp.enterpriseCreationRead(owner,team,async tx=>{attempts++;await conflict(tx);return true;});}catch(error){code=(error as {code?:unknown}).code;}
    check(code==="40001"&&attempts===3,`persistent conflict surfaces after 3 bounded attempts (attempts=${attempts}, code=${String(code)})`);

    attempts=0;
    await assert.rejects(erp.enterpriseCreationRead(owner,team,async()=>{attempts++;throw new Error("not-retryable");}),/not-retryable/);
    check(attempts===1,"ordinary errors are not retried");

    const idle=(await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n;
    check(idle===0,"no transaction is left open after retries");
    console.log(`ENTERPRISE_READ_RETRY=PASS checks=${checks}`);
  }finally{
    await other.end().catch(()=>{});await getPool().end().catch(()=>{});
    await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(()=>{});await admin.end();
  }
}
main().catch(error=>{console.error(error);process.exit(1);});
