/** Compare the actual exact-total query with an indexed seek prototype.
 * Synthetic data only. Indexes created here are deliberately fixture-only. */
import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';
import type {LegacySource} from '../src/lib/saas/creation-history-identity';

const legacy=[
 {table:'app_image_jobs',kind:"'image:'||r.kind"},
 {table:'app_canvas_image_tasks',kind:"'canvas-image'"},
 {table:'app_video_tasks',kind:"'video'"},
] as const;
const prefix=(table:string)=>`'legacy:${table}:'||`;
type Key={id:string;actor_email:string;source_id:string;legacy_table:LegacySource['table']|null;accepted_at:string};
type Bookmark={id:string;accepted_at:string};

function seek(after:Bookmark, materializeArchive=false) {
 const ranked=legacy.map(({table,kind})=>{
  const key=prefix(table)+'r.id';
  return `(SELECT ${key} AS id,r.email AS actor_email,r.created_at AS accepted_at,r.id AS source_id,'${table}'::text AS legacy_table
   FROM ${table} r
   WHERE (r.created_at,(${key}))<($1::timestamptz,$2::text)
   ${materializeArchive?`AND NOT EXISTS(SELECT 1 FROM archived a WHERE a.actor_email=r.email AND a.source_kind=${kind} AND a.source_id=r.id)`:`AND NOT EXISTS(SELECT 1 FROM app_creation_records known WHERE known.actor_email=r.email AND known.source_kind=${kind} AND known.source_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM app_creation_links l JOIN app_creation_records known ON known.id=l.creation_id AND known.actor_email=l.actor_email
    WHERE l.actor_email=r.email AND l.target_id=r.id AND l.target_type=${kind})`}
   ${table==='app_image_jobs'?`AND NOT EXISTS(SELECT 1 FROM children c WHERE c.email=r.email AND c.child_id=r.id)`:''}
   ORDER BY r.created_at DESC,(${key}) DESC LIMIT $3)`;
 });
 const archive=materializeArchive?`archived AS MATERIALIZED (
  SELECT actor_email,source_kind,source_id FROM app_creation_records
  UNION ALL
  SELECT l.actor_email,l.target_type,l.target_id FROM app_creation_links l
   JOIN app_creation_records known ON known.id=l.creation_id AND known.actor_email=l.actor_email
 ), `:'';
 return {sql:`WITH ${archive}children AS MATERIALIZED (
   SELECT p.email,c.value->>'jobId' AS child_id FROM app_image_jobs p
   CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.snapshot->'children')='object' THEN p.snapshot->'children' ELSE '{}'::jsonb END)c
   WHERE p.kind='imagegen' AND jsonb_typeof(p.snapshot->'children')='object'
   AND c.value->>'jobId' IS NOT NULL AND c.value->>'jobId'<>p.id
 ), ranked AS (
  (SELECT id,actor_email,accepted_at,source_id,NULL::text AS legacy_table FROM app_creation_records
   WHERE parent_id IS NULL AND (accepted_at,id)<($1::timestamptz,$2::text)
   ORDER BY accepted_at DESC,id DESC LIMIT $3)
  UNION ALL ${ranked.join(' UNION ALL ')}
 )
 SELECT id,actor_email,accepted_at::text AS accepted_at,source_id,legacy_table FROM ranked
 ORDER BY ranked.accepted_at DESC,id DESC LIMIT $3`,args:[after.accepted_at,after.id,20]};
}

async function main() {
 const url=new URL(process.env.DATABASE_URL!);
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const db=`creation_keyset_fixture_${Date.now()}`;
 const admin=new Pool({connectionString:url.toString()});
 await admin.query(`CREATE DATABASE ${db}`);await admin.end();url.pathname='/'+db;process.env.DATABASE_URL=url.toString();
 const {getPool}=await import('../src/platform/db/pool');
 const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema');
 const {listUnifiedCreationPage}=await import('../src/lib/saas/creations');
 const {creationFiltersSchema}=await import('../src/lib/saas/creation-contracts');
 const {legacyCreationId,parseLegacyCreationId}=await import('../src/lib/saas/creation-history-identity');
 await ensureCreationSchema();const pool=getPool();
 const logPlan=async(mode:string,tx:Pick<PoolClient,'query'>,sql:string,args:unknown[])=>{
  const plan=(await tx.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,args)).rows[0]['QUERY PLAN'][0];
  const scans:string[]=[];
  const collect=(node:Record<string,any>)=>{if(node['Index Name']?.startsWith('probe_seek_'))scans.push(node['Index Name']);for(const child of node.Plans??[])collect(child);};
  collect(plan.Plan);
  const result={mode,ms:plan['Execution Time'],hits:plan.Plan['Shared Hit Blocks'],reads:plan.Plan['Shared Read Blocks'],indexScans:[...new Set(scans)].sort()};
  console.log(JSON.stringify(result));
  return result;
 };
 try {
  // Many ties within the same second; the microsecond precision must survive
  // cursors. Multiple origins overlap in time and identity.
  const at="('2026-11-01T00:00:00.000999Z'::timestamptz-(n/50)*interval '1 second')";
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,created_at)
   SELECT 'img-'||n,'audit-'||(n%50)||'@fixture.test','generate','{"status":"done"}',
   jsonb_build_object('p',jsonb_build_object('prompt',repeat(md5(n::text),32))),false,${at}
   FROM generate_series(1,40000) AS n`);
  await pool.query(`INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,created_at)
   SELECT 'canvas-'||n,'audit-'||(n%50)||'@fixture.test','fixture',${at} FROM generate_series(1,12000) n`);
  await pool.query(`INSERT INTO app_video_tasks(id,email,upstream_id,created_at)
   SELECT 'video-'||n,'audit-'||(n%50)||'@fixture.test','fixture-'||n,${at} FROM generate_series(1,12000) n`);
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,status,accepted_at)
   SELECT 'rec-'||n,'audit-'||(n%50)||'@fixture.test','personal','image:generate','img-'||n,'succeeded',${at}
   FROM generate_series(1,10000) n`);
  await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email)
   SELECT 'rec-'||n,'canvas-image','canvas-'||n,'audit-'||(n%50)||'@fixture.test' FROM generate_series(1,300) n`);
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,created_at)
   VALUES('family-parent','audit-1@fixture.test','imagegen','{"status":"done","children":{"slot":{"jobId":"img-10001"}}}','{}',false,'2026-11-01T00:00Z')`);
  await pool.query('ANALYZE app_image_jobs; ANALYZE app_creation_records; ANALYZE app_video_tasks; ANALYZE app_canvas_image_tasks');
  // Capture the actual product SQL only when comparing the same distant page.
  const patched=new WeakSet<PoolClient>();let baselinePlan:string|null=null;
  pool.on('acquire',client=>{
   if(patched.has(client))return;patched.add(client);
   const original=client.query.bind(client);
   client.query=((sql:unknown,params:unknown,...rest:unknown[])=>{
    if(!baselinePlan||typeof sql!=='string'||!sql.includes('WITH creation_keys AS MATERIALIZED'))return Reflect.apply(original,client,[sql,params,...rest]);
    const label=baselinePlan;baselinePlan=null;
    return logPlan(label,{query:original},sql,params as unknown[]).then(()=>original(sql,params as unknown[]));
   }) as typeof client.query;
  });
  const exact=(page:number)=>listUnifiedCreationPage({platform:true},creationFiltersSchema.parse({view:'unified',projection:'list',period:'all',page,size:20}));
  const rowId=(r:Key)=>r.legacy_table?legacyCreationId({table:r.legacy_table,id:r.source_id,email:r.actor_email}):r.id;
  const execute=async(bookmark:Bookmark)=>{const {sql,args}=seek(bookmark);return (await pool.query<Key>(sql,args)).rows;};
  const rawBookmark=async(id:string):Promise<Bookmark>=>{
   if(id.startsWith('legacy-')){
    const ref=parseLegacyCreationId(id);
    assert(legacy.some(source=>source.table===ref.table));
    const {rows}=await pool.query(`SELECT created_at::text AS stamp FROM ${ref.table} WHERE id=$1 AND email=$2`,[ref.id,ref.email]);
    return {id:`legacy:${ref.table}:${ref.id}`,accepted_at:rows[0].stamp};
   }
   const {rows}=await pool.query('SELECT accepted_at::text AS stamp FROM app_creation_records WHERE id=$1',[id]);
   return {id,accepted_at:rows[0].stamp};
  };
  const initial={id:'',accepted_at:'2027-01-01T00:00:00Z'};
  let bookmark=initial;
  for(let i=1;i<=3;i++){
   const page=await execute(bookmark),control=await exact(i);
   assert.deepEqual(page.map(rowId),control.items.map(r=>r.id));
   assert.equal(control.pagination.total,63700);
   bookmark=page.at(-1)!;
  }
  // Use the raw bookmark from the preceding exact order. Never turn the
  // serialized millisecond display date into a DB cursor.
  let prev:Key[]=[],cursor=initial;
  for(let i=0;i<39;i++){prev=await execute(cursor);cursor=prev.at(-1)!;}
  assert.match(cursor.accepted_at,/\.000999/);
  const deepCursor=await rawBookmark((await exact(1900)).items.at(-1)!.id);
  assert.match(deepCursor.accepted_at,/\.000999/);
  baselinePlan='exact-page-1901-with-total';const deepControl=await exact(1901);
  baselinePlan='exact-page-40-with-total';const control=await exact(40);
  const {sql,args}=seek(cursor);
  const plain=await logPlan('seek-page-40-without-new-indexes',pool,sql,args);
  assert.deepEqual((await execute(cursor)).map(rowId),control.items.map(r=>r.id));
  await pool.query('CREATE INDEX probe_seek_creations ON app_creation_records(accepted_at DESC,id DESC) WHERE parent_id IS NULL');
  for(const {table} of legacy)await pool.query(`CREATE INDEX probe_seek_${table} ON ${table}(created_at DESC,((${prefix(table)}id)) DESC)`);
  await pool.query("CREATE INDEX probe_seek_family ON app_image_jobs(id) WHERE kind='imagegen' AND jsonb_typeof(snapshot->'children')='object'");
  const indexed=await logPlan('seek-page-40-with-candidate-indexes',pool,sql,args);
  assert(indexed.indexScans.length>0,'fixture should exercise candidate indexes');
  assert(indexed.hits+indexed.reads<plain.hits+plain.reads,'indexed seek should read fewer blocks than unindexed');
  assert.deepEqual((await execute(cursor)).map(rowId),control.items.map(r=>r.id));
  const deeper=seek(deepCursor);
  await logPlan('seek-page-1901-with-candidate-indexes',pool,deeper.sql,deeper.args);
  assert.deepEqual((await execute(deepCursor)).map(rowId),deepControl.items.map(r=>r.id));
  for(const [page,bookmark,expected] of [[40,cursor,control],[1901,deepCursor,deepControl]] as const){
   const batch=seek(bookmark,true);
   await logPlan(`seek-page-${page}-with-materialized-archive`,pool,batch.sql,batch.args);
   assert.deepEqual((await pool.query<Key>(batch.sql,batch.args)).rows.map(rowId),expected.items.map(r=>r.id));
  }
  console.log('CREATION_KEYSET_PROBE_PASS exact_ids_and_order=1 mixed_sources=1 canonical_link_dedup=1 child_excluded=1 microsecond_ties=1 production_changes=0');
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
