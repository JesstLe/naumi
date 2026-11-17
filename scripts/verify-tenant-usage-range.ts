import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';

type Plan = { ['Node Type']:string; ['Subplan Name']?:string; ['Relation Name']?:string;
 ['Actual Rows']:number; ['Actual Loops']:number; ['Shared Hit Blocks']?:number; ['Shared Read Blocks']?:number;
 ['Temp Read Blocks']?:number; ['Temp Written Blocks']?:number; Plans?:Plan[] };
const walk=(plan:Plan):Plan[]=>[plan,...(plan.Plans??[]).flatMap(walk)];
const target='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const selected='fixture-3@example.test';
const qty=36_000;

async function seed(tx:PoolClient){
 await tx.query(`CREATE TEMP TABLE usage_fixture AS
   SELECT n,(n-1)%12 AS m,'fixture-'||((n-1)/12)%20||'@example.test' AS email,
    CASE WHEN n<=$1 THEN $2::uuid ELSE $3::uuid END AS tenant,
    '2026-01-01 04:00:00+00'::timestamptz+((n-1)/120)*interval '1 day' AS accepted
   FROM generate_series(1,$1::int+12000) n`,[qty,target,other]);
 await tx.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,accepted_at)
   SELECT 'r-'||n,email,'tenant',tenant,email,'fixture','r-'||n,accepted FROM usage_fixture
   UNION ALL SELECT 'p-'||n,email,'personal',NULL,email,'fixture','p-'||n,accepted FROM usage_fixture WHERE m=6`);
 await tx.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,accepted_at,parent_id)
   SELECT 'a-'||n,CASE WHEN m=1 THEN 'other-actor@example.test' ELSE email END,'tenant',tenant,email,'fixture','a-'||n,accepted,'r-'||n FROM usage_fixture`);
 await tx.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,accepted_at,parent_id)
   SELECT 'b-'||n,CASE WHEN m=1 THEN 'other-actor@example.test' ELSE email END,'tenant',tenant,email,'fixture','b-'||n,accepted,'a-'||n FROM usage_fixture`);
 await tx.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,reserved_credits,charged_credits,ledger_id)
    SELECT 'op-'||n,CASE WHEN m=5 THEN 'wrong-payer@example.test' ELSE email END,'fixture','{}','fixture',
     CASE WHEN m=2 THEN 'pending' WHEN m=3 THEN 'released' ELSE 'settled' END,
     CASE WHEN m=2 THEN 3 ELSE 0 END,CASE WHEN m=2 THEN 0 WHEN m=3 THEN 2 ELSE 5 END,'ledger-'||n
    FROM usage_fixture WHERE m NOT IN (0,8,10)`);
 await tx.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation)
    SELECT 'b-'||n,'billing','op-'||CASE WHEN m=8 THEN n-1 ELSE n END,
     CASE WHEN m=1 THEN 'other-actor@example.test' ELSE email END,'execution' FROM usage_fixture WHERE m NOT IN (0,10)
    UNION ALL SELECT 'p-'||n,'billing','op-'||n,email,'execution' FROM usage_fixture WHERE m=6
    UNION ALL SELECT 'r-'||n,'billing','op-'||n,email,'execution' FROM usage_fixture WHERE m=2
    UNION ALL SELECT 'r-'||n,'billing',CASE WHEN m=9 THEN 'op-'||n ELSE 'missing-'||n END,
      CASE WHEN m=9 THEN 'wrong-actor@example.test' ELSE email END,'execution'
      FROM usage_fixture WHERE m IN (7,9,10)
    UNION ALL SELECT 'r-'||n,'no-charge','free-'||n,email,'explicit-no-charge' FROM usage_fixture WHERE m IN (0,10)
    UNION ALL SELECT 'r-'||n,'no-charge','more-free-'||n,email,'explicit-no-charge' FROM usage_fixture WHERE m=0`);
 await tx.query('ANALYZE app_creation_records; ANALYZE app_creation_links; ANALYZE app_billing_operations');
}

async function main(){
 const baseline=process.argv.includes('--baseline');
 const fixture=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  await (await import('../src/lib/saas/creation-schema')).ensureCreationSchema();
  const {readTenantUsage}=await import('../src/lib/saas/tenant-usage');
  const tx=await fixture.pool.connect();
  try{
   await seed(tx);
   const spec={tenantId:target,from:'2026-01-01',to:'2026-12-31'};
   const test=async(label:string,range:typeof spec,visible:string[]|null,batches:number)=>{
    let statement:{query:string;values:unknown[]}|undefined;
    await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL work_mem='1MB'; SET LOCAL statement_timeout='25s'");
    const original=tx.query;
    tx.query=function(this:PoolClient,...args:unknown[]){
     const query=String(args[0]);
     if(query.startsWith('WITH RECURSIVE'))statement={query,values:args[1] as unknown[]};
     return Reflect.apply(original,this,args);
    } as PoolClient['query'];
    const usage=await readTenantUsage(tx,range,visible).finally(()=>{tx.query=original;});
    assert.deepEqual([usage.creations,usage.unrecordedCreations,usage.chargedCredits,usage.reservedCredits,usage.settledOperations,usage.pendingOperations],
     [batches*12,batches*6,batches*22,batches*3,batches*5,batches],label);
    assert.ok(statement);
    const r=(await tx.query('EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, FORMAT JSON) '+statement.query,statement.values)).rows[0]['QUERY PLAN'][0] as {Plan:Plan;['Execution Time']:number};
    const nodes=walk(r.Plan), filterLoops=nodes.filter(n=>n['Subplan Name']?.startsWith('SubPlan')).map(n=>({name:n['Subplan Name'],loops:n['Actual Loops']}));
    await tx.query('COMMIT');
    const metric={label,roots:usage.creations,ms:r['Execution Time'],
     blocks:(r.Plan['Shared Hit Blocks']??0)+(r.Plan['Shared Read Blocks']??0),
     tempIO:(r.Plan['Temp Read Blocks']??0)+(r.Plan['Temp Written Blocks']??0),filterLoops};
    console.log('TENANT_USAGE_RANGE_METRIC='+JSON.stringify(metric));
    return metric;
   };
   await test('full-year',spec,null,3000);
   await test('regional-manager',spec,[selected],150);
   await test('single-day',{...spec,to:spec.from},null,10);
   await test('empty-scope',spec,[],0);
   console.log(baseline?'TENANT_USAGE_RANGE_BASELINE=PASS':'TENANT_USAGE_RANGE=PASS');
  }finally{await tx.query('ROLLBACK').catch(()=>{});tx.release();}
 }finally{await fixture.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
