import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {overviewActivitySql,readOverviewActivity} from '../src/lib/saas/overview-activity';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 const connection=new URL(process.env.DATABASE_URL!);assert.equal(connection.hostname,'127.0.0.1');assert.match(connection.pathname,/fixture/);
 const pool=new Pool({connectionString:connection.toString(),max:1}),tx=await pool.connect();
 const window={from:'2026-11-02',to:'2026-11-09',start:'2026-11-01T16:00:00Z',end:'2026-11-09T16:00:00Z'};
 const oldCounts=`SELECT count(*)::int creations,count(DISTINCT tenant_id)::int active,
  count(*) FILTER(WHERE status='needs_review')::int review,count(*) FILTER(WHERE status='failed')::int failed
  FROM app_creation_records WHERE parent_id IS NULL AND accepted_at>=$1 AND accepted_at<$2`;
 const oldDaily=`SELECT to_char(d,'YYYY-MM-DD') AS date,COALESCE(c.n,0)::int AS count FROM generate_series($1::date,$2::date,'1 day') d
  LEFT JOIN(SELECT (accepted_at AT TIME ZONE 'Asia/Shanghai')::date AS date_key,count(*)::int n FROM app_creation_records
    WHERE parent_id IS NULL AND accepted_at>=$3 AND accepted_at<$4 GROUP BY date_key)c ON c.date_key=d::date ORDER BY d`;
 const args=[window.from,window.to,window.start,window.end];
 async function explain(sql:string,values:string[]){
  const plan=(await tx.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`,values)).rows[0]['QUERY PLAN'][0];
  const count=(node:any):number=>(node['Relation Name']==='app_creation_records'?1:0)+(node.Plans??[]).reduce((n:number,p:any)=>n+count(p),0);
  return {ms:plan['Execution Time'],scans:count(plan.Plan),buffers:['Shared Hit Blocks','Shared Read Blocks','Local Hit Blocks','Local Read Blocks'].reduce((n,k)=>n+(plan.Plan[k]??0),0)};
 }
 try{
  // A connection-local fixture, with production-equivalent time/parent/tenant indexes.
  await tx.query(`CREATE TEMP TABLE app_creation_records(id text PRIMARY KEY,parent_id text,tenant_id uuid,status text,accepted_at timestamptz,
   request_snapshot jsonb NOT NULL DEFAULT '{}');
   CREATE INDEX ON app_creation_records(parent_id);CREATE INDEX ON app_creation_records(tenant_id,accepted_at DESC,id DESC);`);
  await tx.query(`INSERT INTO app_creation_records
   SELECT 'r'||g,CASE WHEN g%17=0 THEN 'fixture-parent' END,CASE WHEN g%5<>0 THEN md5((g%2048)::text)::uuid END,
    CASE WHEN g%11=0 THEN 'needs_review' WHEN g%13=0 THEN 'failed' ELSE 'succeeded' END,
    '2026-11-01T16:00Z'::timestamptz+(g%7)*interval '1 day'+(g%10000)*interval '1 second',jsonb_build_object('name',repeat(md5(g::text),6))
   FROM generate_series(1,200000) g;
   INSERT INTO app_creation_records(id,status,accepted_at) VALUES('before','failed','2026-11-01T15:59:59.999999Z'),('end','failed','2026-11-09T16:00Z');
   ANALYZE app_creation_records;`);
  const expected={...(await tx.query(oldCounts,args.slice(2))).rows[0],trend:(await tx.query(oldDaily,args)).rows};
  assert.deepEqual(await readOverviewActivity(tx,window),expected);assert.deepEqual(expected.trend.at(-1),{date:'2026-11-09',count:0});
  const legacy=[await explain(oldCounts,args.slice(2)),await explain(oldDaily,args)],current=await explain(overviewActivitySql,args);
  const old=legacy.reduce((a,b)=>({ms:a.ms+b.ms,scans:a.scans+b.scans,buffers:a.buffers+b.buffers}),{ms:0,scans:0,buffers:0});
  assert.equal(old.scans,2);assert.equal(current.scans,1);assert(current.buffers<old.buffers);
  assert.deepEqual(await readOverviewActivity(tx,{from:'2026-11-10',to:'2026-11-10',start:'2026-11-09T16:00:01Z',end:'2026-11-10T16:00:00Z'}),
   {active:0,creations:0,review:0,failed:0,trend:[{date:'2026-11-10',count:0}]});
  console.log('SAAS_OVERVIEW_ACTIVITY_PASS',JSON.stringify({fixtureRows:200002,old,current}));
 }finally{tx.release();await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
