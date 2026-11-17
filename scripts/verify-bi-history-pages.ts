import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import {parseBiQuery} from '../src/lib/bi/contracts';

type Sql={sql:string;values:unknown[]};
async function main(){
 const url=new URL(process.env.DATABASE_URL!);
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 Object.assign(process.env,{SETTINGS_SECRET:'bi-history-pages-isolated-fixture',NAUMI_MULTI_USER:'1'});
 const {getPool}=await import('../src/platform/db/pool');
 const bi=await import('../src/lib/bi/repository'),pool=getPool();
 try{
  assert.equal((await pool.query("SELECT to_regclass('app_artworks') AS present")).rows[0].present,null,'use a disposable empty database');
  await bi.ensureBiSchema();
  const owner='owner@history.fixture',member='member@history.fixture',foreign='foreign@history.fixture',emails=[owner,member];
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,deleted_at)
   SELECT 'work-'||lpad(i::text,6,'0'),CASE i%3 WHEN 0 THEN $1 WHEN 1 THEN $2 ELSE $3 END,'作品-'||i,'upload',
    repeat(md5(i::text),25),'data:image/png;base64,'||repeat(md5((i+1)::text),12),'fixture',
    '2026-11-17T01:00:00Z'::timestamptz+(i/4)*interval '1 second',CASE WHEN i%10=0 THEN now() END
   FROM generate_series(1,36000)i`,[owner,member,foreign]);
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,cost,created_at)
   SELECT 'image-'||lpad(i::text,6,'0'),CASE i%3 WHEN 0 THEN $1 WHEN 1 THEN $2 ELSE $3 END,'generate',
    jsonb_build_object('status',CASE WHEN i%7=0 THEN 'running' ELSE 'done' END),
    jsonb_build_object('p',jsonb_build_object('prompt','prompt-'||i)),false,9,
    '2026-11-17T01:00:00Z'::timestamptz+(i/3)*interval '1 second' FROM generate_series(1,18000)i`,[owner,member,foreign]);
  await pool.query(`INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,status,created_at)
   SELECT 'image-'||lpad(i::text,6,'0'),$1,'source','completed','2026-11-17T01:00:00Z'::timestamptz+(i/3)*interval '1 second'
   FROM generate_series(1,9000)i`,[owner]);
  await pool.query(`INSERT INTO app_video_tasks(id,email,upstream_id,status,prompt,created_at)
   SELECT 'image-'||lpad(i::text,6,'0'),$1,'fixture','completed','video-'||i,'2026-11-17T01:00:00Z'::timestamptz+(i/3)*interval '1 second'
   FROM generate_series(1,3000)i`,[member]);
  await pool.query("INSERT INTO app_ledger(id,email,delta,kind,reason) VALUES('led-image-image-000003',$1,-6,'consume','fixture')",[owner]);
  await pool.query('ANALYZE app_artworks; ANALYZE app_image_jobs; ANALYZE app_canvas_image_tasks; ANALYZE app_video_tasks');
  const q=(section:string,filters:Record<string,string>={})=>parseBiQuery(new URLSearchParams({section,from:'2026-11-17',to:'2026-11-17',size:'30',...filters}));
  const statements:Sql[]=[];
  const instrument=(tx:PoolClient)=>({query:(sql:string,values:unknown[])=>{statements.push({sql,values});return tx.query(sql,values);}} as unknown as PoolClient);
  const reader=await pool.connect(),scope={client:instrument(reader),allowedEmails:emails};
  try{
   await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await reader.query("SET LOCAL work_mem='1MB'");
   const artwork=await bi.queryBi(q('artworks',{page:'600'}),scope);
   assert.equal(artwork.total,21600);
   const artworkIds=(await reader.query(`SELECT id FROM app_artworks WHERE email=ANY($1) AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET 17970`,[emails])).rows.map(r=>r.id);
   assert.deepEqual(artwork.rows.map(r=>r.id),artworkIds);assert(artwork.rows.every(r=>!('image_url' in r)&&!('source_url' in r)));
   const page=statements.find(s=>s.sql.includes('selected AS MATERIALIZED'))!;
   assert(page);
   // Reconstruct the old wide sort using the same scope and hydration query.
   const wide=page.sql.replace('SELECT a.id,a.created_at FROM app_artworks a','SELECT a.* FROM app_artworks a')
    .replace('FROM selected k JOIN app_artworks a ON a.id=k.id','FROM selected a');
   assert.notEqual(wide,page.sql);
   assert.deepEqual((await reader.query(page.sql,page.values)).rows,(await reader.query(wide,page.values)).rows);
   type Node={'Node Type':string;'Parent Relationship'?:string;'Subplan Name'?:string;'Actual Rows':number;'Plan Width':number;'Temp Written Blocks'?:number;Plans?:Node[]};
   const plan=async(sql:string)=>(await reader.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,page.values)).rows[0]['QUERY PLAN'][0].Plan as Node;
   const nodes=(p:Node):Node[]=>[p,...(p.Plans??[]).flatMap(nodes)];
   const sort=(p:Node)=>{
    const keyPage=nodes(p).find(n=>n['Subplan Name']==='CTE selected');assert(keyPage);
    return nodes(keyPage).find(n=>n['Node Type'].endsWith('Sort')&&n['Actual Rows']>0);
   };
   const before=await plan(wide),after=await plan(page.sql);
   const oldSort=sort(before),newSort=sort(after);
   const shape=(p:Node)=>nodes(p).map(n=>[n['Node Type'],n['Actual Rows'],n['Plan Width'],n['Subplan Name']]);
   assert(oldSort&&newSort,JSON.stringify({before:shape(before),after:shape(after)}));
   assert(oldSort['Plan Width']>newSort['Plan Width']*4,'deep page must sort narrow keys');
   assert((before['Temp Written Blocks']??0)>(after['Temp Written Blocks']??0));
   const jobs=await bi.queryEnterpriseOperations(q('operations',{page:'600'}),scope);
   assert.equal(jobs.total,24000);
   const sources=(await reader.query(`SELECT src,id FROM (
     SELECT 'app_image_jobs' AS src,id,created_at FROM app_image_jobs WHERE email=ANY($1)
     UNION ALL SELECT 'app_canvas_image_tasks',id,created_at FROM app_canvas_image_tasks WHERE email=ANY($1)
     UNION ALL SELECT 'app_video_tasks',id,created_at FROM app_video_tasks WHERE email=ANY($1)
    ) t ORDER BY created_at DESC,src,id LIMIT 30 OFFSET 17970`,[emails])).rows;
   assert.deepEqual(jobs.rows.map(r=>({src:r.source_table,id:r.id})),sources);
   const running=await bi.queryEnterpriseOperations(q('operations',{status:'running'}),scope);
   const runningCount=(await reader.query("SELECT count(*)::int AS n FROM app_image_jobs WHERE email=ANY($1) AND snapshot->>'status'='running'",[emails])).rows[0].n;
   assert.equal(running.total,runningCount);assert(running.rows.every(r=>r.source_table==='app_image_jobs'&&r.status==='running'));
   for(const [kind,source,operation] of [['canvas-task','app_canvas_image_tasks','canvas-text-edit'],['video-task','app_video_tasks','video']] as const){
    const single=await bi.queryEnterpriseOperations(q('operations'),scope,{kind,id:'image-000003'});
    assert.equal(single.total,1);assert.equal(single.rows[0].source_table,source);
    if(kind==='video-task')assert.equal(single.rows[0].kind,operation);
    else assert.match(String(single.rows[0].kind),/^canvas-/);
   }
   console.log(`BI_HISTORY_DEPTH_PASS artworks=${artwork.total} operations=${jobs.total} payload_rows=30 artwork_sort_width=${oldSort['Plan Width']}->${newSort['Plan Width']} temp_blocks=${before['Temp Written Blocks']}->${after['Temp Written Blocks']??0}`);
  }finally{await reader.query('ROLLBACK');reader.release();}

  const locked=async(tables:string,run:(access:{client:PoolClient;allowedEmails:string[]})=>Promise<void>)=>{
   const a=await pool.connect(),b=await pool.connect();
   try{
    await a.query('BEGIN');await a.query('LOCK TABLE '+tables+' IN ACCESS EXCLUSIVE MODE');
    await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await b.query("SET LOCAL lock_timeout='250ms'");
    statements.length=0;await run({client:instrument(b),allowedEmails:emails});
   }finally{await b.query('ROLLBACK');b.release();await a.query('ROLLBACK');a.release();}
  };
  await locked('app_canvas_image_tasks,app_video_tasks',async access=>{
   const empty=await bi.queryBi(q('artworks',{page:'10000'}),access);
   assert.equal(empty.total,21600);assert.deepEqual(empty.rows,[]);
   assert.equal(statements.length,1);
   const image=await bi.queryEnterpriseOperations(q('operations',{from:'2020-01-01',to:'2020-01-01'}),access,{kind:'image-job',id:'image-000003'});
   assert.equal(image.total,1);assert.equal(image.rows[0].billed_credits,'6');
   assert.equal((await bi.queryEnterpriseOperations(q('operations'),{...access,allowedEmails:[foreign]},{kind:'image-job',id:'image-000003'})).total,0);
  });
  await locked('app_ledger',async access=>{
   for(const read of [()=>bi.queryEnterpriseOperations(q('operations',{page:'10000'}),access),()=>bi.queryBi(q('operations',{page:'10000'}),access)]){
    statements.length=0;const empty=await read();assert.equal(empty.total,24000);assert.deepEqual(empty.rows,[]);assert.equal(statements.length,1);
   }
  });
  console.log('BI_HISTORY_LOCKS_PASS artwork_and_operation_past_end_count_only=1 exact_image_other_tables_locked=1 cross_scope_denied=1 legacy_date_bypass=1');
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
