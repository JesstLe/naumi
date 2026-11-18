import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {overviewActivitySql,readOverviewActivity,type TenantDateWindow} from '../src/lib/saas/overview-activity';
import {ensurePlatformOverviewIndex} from './ops/platform-overview-index';

const recent={from:'2026-11-02',to:'2026-11-08',start:'2026-11-01T16:00:00Z',end:'2026-11-08T16:00:00Z'};
const year={...recent,from:'2025-11-09',start:'2025-11-08T16:00:00Z'};
const empty={from:'2026-11-10',to:'2026-11-10',start:'2026-11-09T16:00:00Z',end:'2026-11-10T16:00:00Z'};
const scopes=[recent,year,empty];

async function main(){
 process.env.PGPOOL_MAX='5';
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema');
  await ensureCreationSchema();
  await f.pool.query(`INSERT INTO app_creation_records (id,actor_email,scope_kind,tenant_id,source_kind,source_id,accepted_at,status,request_snapshot)
    SELECT 'history-'||g,'fixture@example.test',CASE WHEN g%5=0 THEN 'personal' ELSE 'tenant' END,
      CASE WHEN g%5<>0 THEN md5((g%500)::text)::uuid END,'fixture','history-'||g,
      '2020-01-01T00:00Z'::timestamptz+(g::bigint*199) % 2490 * interval '1 day',
      CASE WHEN g%11=0 THEN 'needs_review' WHEN g%13=0 THEN 'failed' ELSE 'succeeded' END,
      jsonb_build_object('payload',repeat(md5(g::text),12))
    FROM generate_series(1,240000) g`);
  await f.pool.query(`INSERT INTO app_creation_records (id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,accepted_at,status)
    SELECT 'hot-'||g,'fixture@example.test',CASE WHEN g%5=0 THEN 'personal' ELSE 'tenant' END,
      CASE WHEN g%5<>0 THEN md5((g%500)::text)::uuid END,'fixture','hot-'||g,
      CASE WHEN g%7=0 THEN 'history-1' END,
      '2026-11-01T16:00Z'::timestamptz+(g%7)*interval '1 day'+(g%1000)*interval '1 second',
      CASE WHEN g%11=0 THEN 'needs_review' WHEN g%13=0 THEN 'failed' ELSE 'succeeded' END
    FROM generate_series(1,3000) g`);
  await f.pool.query(`INSERT INTO app_creation_records (id,actor_email,scope_kind,source_kind,source_id,accepted_at,status)
    VALUES ('begin','fixture@example.test','legacy_unconfirmed','fixture','begin','2026-11-01T16:00Z','failed'),
      ('inside','fixture@example.test','personal','fixture','inside','2026-11-08T15:59:59.999999Z','needs_review'),
      ('end','fixture@example.test','personal','fixture','end','2026-11-08T16:00Z','failed')`);
  await f.pool.query('VACUUM ANALYZE app_creation_records');
  const inputs=(w:TenantDateWindow)=>[w.from,w.to,w.start,w.end];
  const expected=await Promise.all(scopes.map(w=>readOverviewActivity(f.pool,w)));
  assert.deepEqual(expected[2],{creations:0,active:0,failed:0,review:0,trend:[{date:'2026-11-10',count:0}]});
  const known=(await f.pool.query(`SELECT count(*)::int creations,count(DISTINCT tenant_id)::int active,
      count(*) FILTER(WHERE status='failed')::int failed,count(*) FILTER(WHERE status='needs_review')::int review
    FROM app_creation_records WHERE parent_id IS NULL AND accepted_at>=$1 AND accepted_at<$2`,[recent.start,recent.end])).rows[0];
  assert.deepEqual({...expected[0],trend:undefined},{...known,trend:undefined});
  assert.equal(expected[0].trend.reduce((sum,r)=>sum+r.count,0),known.creations);
  const explain=async(w:TenantDateWindow,client:Pick<typeof f.pool,'query'>=f.pool)=>{
   const result=(await client.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+overviewActivitySql,inputs(w))).rows[0]['QUERY PLAN'][0];
   const scans:string[]=[];const visit=(node:Record<string,any>)=>{
    if(node['Relation Name']==='app_creation_records'||node['Index Name'])scans.push(node['Index Name']??node['Node Type']);
    for(const sub of node.Plans??[])visit(sub);
   };visit(result.Plan);
   return {scans,ms:result['Execution Time'],blocks:(result.Plan['Shared Hit Blocks']??0)+(result.Plan['Shared Read Blocks']??0)};
  };
  const before=[];for(const w of scopes)before.push(await explain(w));
  console.log('PLATFORM_OVERVIEW_INDEX_BASELINE='+JSON.stringify({recent:before[0],year:before[1],empty:before[2]}));
  assert.ok(before[0].blocks>=1000&&before[2].blocks>=1000);
  if(process.argv.includes('--baseline'))return;
  const writeSample=async()=>{
   const tx=await f.pool.connect();
   try{
    await tx.query('BEGIN');
    const r=(await tx.query(`EXPLAIN (ANALYZE,WAL,BUFFERS,FORMAT JSON) UPDATE app_creation_records
      SET status='queued',updated_at=now() WHERE id IN (SELECT 'hot-'||i FROM generate_series(1,750) i)`)).rows[0]['QUERY PLAN'][0];
    return {rows:750,walBytes:r.Plan['WAL Bytes'],ms:r['Execution Time'],duringUpdate:await explain(recent,tx)};
   }finally{await tx.query('ROLLBACK');tx.release();}
  };
  const baseWrites=await writeSample();
  if(process.argv.includes('--compare')){
   for(const sql of [
    'CREATE INDEX fixture_recent ON app_creation_records (accepted_at) WHERE parent_id IS NULL',
    'CREATE INDEX fixture_recent ON app_creation_records (accepted_at) INCLUDE (tenant_id,status) WHERE parent_id IS NULL',
    'CREATE INDEX fixture_recent ON app_creation_records USING brin(accepted_at) WHERE parent_id IS NULL',
   ]){
    await f.pool.query(sql);await f.pool.query('VACUUM ANALYZE app_creation_records');
    const recent=await explain(scopes[0]),year=await explain(scopes[1]);
    const writes=await writeSample();
    const bytes=Number((await f.pool.query("SELECT pg_relation_size('fixture_recent') AS n")).rows[0].n);
    console.log('PLATFORM_OVERVIEW_INDEX_OPTION='+JSON.stringify({sql,recent,year,baseWrites,writes,bytes}));
    await f.pool.query('DROP INDEX fixture_recent');
   }
   return;
  }
  await assert.rejects(ensurePlatformOverviewIndex(f.pool),/must be valid/);
  await f.pool.query('CREATE INDEX app_creation_root_accepted_time ON app_creation_records(tenant_id)');
  await assert.rejects(ensurePlatformOverviewIndex(f.pool,true),/match the planned definition/);
  await f.pool.query('DROP INDEX app_creation_root_accepted_time');
  // Hold one pre-existing writer while the real migration starts. A second
  // writer on a different row must still complete while the index build waits.
  const writer=await f.pool.connect();
  let build:ReturnType<typeof ensurePlatformOverviewIndex>|undefined;
  try{
   await writer.query("BEGIN; UPDATE app_creation_records SET updated_at=now() WHERE id='hot-2999'");
   build=ensurePlatformOverviewIndex(f.pool,true);
   // Explicitly join the build after releasing the test writer.
   void build.catch(()=>{});
   const until=Date.now()+3_000;
   for(;;){
    const {rows}=await f.pool.query(`SELECT phase FROM pg_stat_progress_create_index
      WHERE relid=to_regclass('app_creation_records') AND phase='waiting for writers before build'`);
    if(rows.length)break;
    assert.ok(Date.now()<until,'concurrent index did not reach the writer wait');
    await delay(20);
   }
   const other=await f.pool.connect();
   try{
    await other.query("BEGIN; SET LOCAL statement_timeout='1s'");
    assert.equal((await other.query("UPDATE app_creation_records SET updated_at=now() WHERE id='hot-3000'")).rowCount,1);
    await other.query('COMMIT');
   }finally{await other.query('ROLLBACK');other.release();}
  }finally{
   try{await writer.query('ROLLBACK');}finally{writer.release();}
   await build;
  }
  const definition=await build;
  assert.equal(await ensurePlatformOverviewIndex(f.pool,true),definition);
  assert.equal(await ensurePlatformOverviewIndex(f.pool),definition);
  await f.pool.query('VACUUM ANALYZE app_creation_records');
  const after=[];for(const w of scopes)after.push(await explain(w));
  assert.deepEqual(await Promise.all(scopes.map(w=>readOverviewActivity(f.pool,w))),expected);
  assert.ok(after[0].scans.includes('app_creation_root_accepted_time'));
  assert.ok(after[0].blocks*10<before[0].blocks);
  assert.ok(after[1].scans.includes('app_creation_root_accepted_time'));
  assert.ok(after[1].blocks*10<before[1].blocks);
  assert.ok(after[2].blocks<before[2].blocks);
  const writes=await writeSample();
  assert.ok(baseWrites.walBytes>0&&writes.walBytes>0);
  assert.deepEqual(await readOverviewActivity(f.pool,recent),expected[0]);
  const bytes=Number((await f.pool.query("SELECT pg_relation_size('app_creation_root_accepted_time') AS n")).rows[0].n);
  console.log('PLATFORM_OVERVIEW_INDEX=PASS '+JSON.stringify({recent:after[0],year:after[1],empty:after[2],baseWrites,writes,bytes}));
 }finally{await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
