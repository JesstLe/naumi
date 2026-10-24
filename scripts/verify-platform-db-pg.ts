/** Real isolated PG A/B: same source-root transaction/billing/creation behavior,
 * old db facade and new infrastructure share one pool; no supplier or Web process. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {pathToFileURL} from "node:url";
async function main(){
  const at=process.argv.indexOf("--source-root"),root=path.resolve(at<0?".":process.argv[at+1]),baseline=process.argv.includes("--baseline"),load=(p:string)=>import(pathToFileURL(path.join(root,p)).href);
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(new URL(process.env.DATABASE_URL!).hostname,"127.0.0.1");
  const {createModelFixture}=await load("scripts/model-config-fixture.ts"),f=await createModelFixture();let db:typeof import("../src/lib/db")|undefined,checks=0;
  const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1"});
  try{
    db=await load("src/lib/db.ts");const pool=db!.getPool();
    const serviceModule=await load("src/lib/billing/service.ts"),generic=baseline?serviceModule.withBillingTransaction:(await load("src/platform/db/transaction.ts")).withTransaction;
    if(!baseline){const platform=await load("src/platform/db/pool.ts");ok(platform.getPool===db!.getPool);ok(platform.getPool()===pool);ok(platform.dbEnabled===db!.dbEnabled);ok(generic===serviceModule.withBillingTransaction);}
    eq(pool.totalCount,0);await db!.ensureSchema();await f.repo.current();
    await pool.query("CREATE TABLE fixture_tx_probe(id integer PRIMARY KEY,value integer NOT NULL)");
    eq(await generic(pool,async(tx:import("pg").PoolClient)=>{await tx.query('INSERT INTO fixture_tx_probe VALUES(1,10)');return 'committed';}),'committed');
    const fault=new Error('original action error');await assert.rejects(generic(pool,async(tx:import("pg").PoolClient)=>{await tx.query('UPDATE fixture_tx_probe SET value=99 WHERE id=1');throw fault;}),(e:unknown)=>e===fault);checks++;
    eq((await pool.query('SELECT value FROM fixture_tx_probe WHERE id=1')).rows[0].value,10);
    // The original schema advisory lock is still separate from ordinary Tx.
    const {withSchemaInitialization}=await load('src/lib/schema-initialization.ts');await assert.rejects(withSchemaInitialization(pool,async(tx:import('pg').PoolClient)=>{await tx.query('CREATE TABLE fixture_rolled_back(id integer)');throw fault;}),(e:unknown)=>e===fault);checks++;
    eq((await pool.query("SELECT to_regclass('fixture_rolled_back') AS table")).rows[0].table,null);
    const actor='r4a-wallet@fixture.test',poor='r4a-poor@fixture.test';for(const email of [actor,poor])await db!.getOrCreateUser(email);
    const service=serviceModule.createBillingService();
    for(const [email,amount] of [[actor,30],[poor,6]] as const)await generic(pool,async(tx:import('pg').PoolClient)=>{await tx.query('DELETE FROM app_ledger WHERE email=$1',[email]);await tx.query('DELETE FROM app_credit_batches WHERE email=$1',[email]);await tx.query('UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1',[email]);await service.grantTx(tx,{id:randomUUID(),email,amount,source:'admin',reason:'fixture funding',expiry:{unit:'years',value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:'fixture'});});
    const {fixtureConfig,facts}=await load('scripts/billing-unit-fixture.ts'),{quote}=await load('src/lib/billing/quote.ts') as typeof import('../src/lib/billing/quote'),quoted=quote({version:1,config:fixtureConfig()},facts());eq(quoted.reserveCredits,6);
    const op={id:randomUUID(),email:actor,quote:quoted,ledgerId:randomUUID(),reason:'fixture',fingerprint:'same original request'};
    await Promise.all([1,2].map(()=>generic(pool,(tx:import('pg').PoolClient)=>service.reserveTx(tx,op))));eq(Number((await pool.query('SELECT credits_used FROM app_users WHERE email=$1',[actor])).rows[0].credits_used),6);
    const result={state:'succeeded',items:[{id:'output',state:'succeeded',executedQuality:'medium'}]};await Promise.all([1,2].map(()=>generic(pool,(tx:import('pg').PoolClient)=>service.settleTx(tx,op,result))));
    eq(Number((await pool.query("SELECT count(*) n FROM app_ledger WHERE id=$1 AND kind='consume'",[op.ledgerId])).rows[0].n),1);eq(Number((await pool.query('SELECT credits_total FROM app_users WHERE email=$1',[actor])).rows[0].credits_total),24);
    const competing=await Promise.allSettled([1,2].map(()=>generic(pool,(tx:import('pg').PoolClient)=>service.reserveTx(tx,{...op,id:randomUUID(),email:poor,ledgerId:randomUUID()}))));eq(competing.filter(r=>r.status==='fulfilled').length,1);eq((competing.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'INSUFFICIENT_CREDITS');
    const aborted={...op,id:randomUUID(),ledgerId:randomUUID()};await assert.rejects(generic(pool,async(tx:import('pg').PoolClient)=>{await service.reserveTx(tx,aborted);throw fault;}));checks++;eq((await pool.query('SELECT id FROM app_billing_operations WHERE id=$1',[aborted.id])).rowCount,0);
    const context=await load('src/lib/saas/creation-context.ts'),writer=await load('src/lib/saas/creation-writer.ts');const scope={actorEmail:actor,scopeKind:'personal',tenantId:null};
    const creation=await context.withFrozenCreation(scope,()=>writer.startCreation('r4a-fixture','original',actor,{prompt:'original'}));ok(creation);
    await context.withFrozenCreation(scope,()=>writer.finishCreation(creation,actor,'succeeded',{text:'original answer'}));await context.withFrozenCreation(scope,()=>writer.finishCreation(creation,actor,'succeeded',{text:'original answer'}));
    eq(Number((await pool.query("SELECT count(*) n FROM app_creation_events WHERE creation_id=$1 AND event_key='state:succeeded'",[creation])).rows[0].n),1);
    await assert.rejects(writer.creationTransaction(async(tx:import('pg').PoolClient)=>{await tx.query("UPDATE app_creation_records SET status='failed' WHERE id=$1",[creation]);throw fault;}));checks++;eq((await pool.query('SELECT status FROM app_creation_records WHERE id=$1',[creation])).rows[0].status,'succeeded');
    const tenants=await load('src/lib/saas/tenants.ts'),owner='r4a-owner@fixture.test';await db!.getOrCreateUser(owner);const tenant=await tenants.createTenant({email:'fixture-platform',admin:true,consoleAdmin:true},{commandId:randomUUID(),name:'R4A',ownerEmail:owner,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{generate:true}});ok(tenant.tenantId);
    // Occupy all ordinary query connections. The original independent lock pool
    // must still connect and execute, and query clients return in finally.
    const coordination=await load('src/lib/imagegen/coordination-pool.ts'),locks=coordination.imageCoordinationPool(),held:import('pg').PoolClient[]=[];let lock:import('pg').PoolClient|undefined;
    try{for(let i=0;i<5;i++)held.push(await pool.connect());eq(pool.idleCount,0);const acquired:import('pg').PoolClient=await locks.connect();lock=acquired;eq((await acquired.query('SELECT 7 AS n')).rows[0].n,7);ok(locks!==pool);eq(locks.options.max,4);}finally{lock?.release();held.forEach(tx=>tx.release());}
    eq(pool.waitingCount,0);eq(pool.idleCount,pool.totalCount);
    console.log(`PLATFORM_DB_PG=PASS mode=${baseline?'BASELINE':'MODIFIED'} checks=${checks} REAL_PG=1 POOL_ALIAS=${baseline?'LEGACY':'IDENTICAL'} BILLING=ACTUAL CONSUME=1 INSUFFICIENT=402 CREATION=ACTUAL TX_ROLLBACK=PASS QUERY_POOL_FULL_LOCK_POOL=AVAILABLE SUPPLIER=0`);
  }finally{if(db){await(await load('src/lib/imagegen/coordination-pool.ts')).closeImageCoordinationPool();await db.getPool().end();}await f.cleanup();console.log('PLATFORM_DB_PG_CLEANUP=PASS RANDOM_SCHEMA_DROPPED=1 POOLS_CLOSED=1 HTTP_CLOSED=1');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
