/** Synthetic PostgreSQL probe for the actual unified history list statement.
 * Use a disposable database; never reads or seeds production history. */
import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';

async function main(){
 const base=new URL(process.env.DATABASE_URL!);
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(base.hostname,'127.0.0.1');assert.match(base.pathname,/fixture/);
 const dbName=`creation_plan_fixture_${Date.now()}`;
 const admin=new Pool({connectionString:base.toString()});
 await admin.query(`CREATE DATABASE ${dbName}`);await admin.end();
 base.pathname='/'+dbName;process.env.DATABASE_URL=base.toString();
 const {getPool}=await import('../src/platform/db/pool');
 const {listUnifiedCreationPage}=await import('../src/lib/saas/creations');
 const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema');
 const {creationFiltersSchema}=await import('../src/lib/saas/creation-contracts');
 await ensureCreationSchema();
 const pool=getPool();
 try{
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,created_at)
   SELECT 'audit-image-'||n,'audit-'||(n%50)||'@fixture.test','generate','{"status":"done"}',
   jsonb_build_object('p',jsonb_build_object('prompt',repeat(md5(n::text),32))),false,now()-n*interval '1 minute'
   FROM generate_series(1,40000) AS n`);
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,status,accepted_at)
   SELECT 'audit-record-'||n,'audit-'||(n%50)||'@fixture.test','personal','image:generate','audit-image-'||n,'succeeded',now()-n*interval '1 minute'
   FROM generate_series(1,10000) AS n`);
  await pool.query('ANALYZE app_image_jobs; ANALYZE app_creation_records');
  const patched=new WeakSet<PoolClient>();
  pool.on('acquire',client=>{
   if(patched.has(client))return;patched.add(client);
   const original=client.query.bind(client);
   client.query=((sql:unknown,values:unknown,...rest:unknown[])=>{
    if(typeof sql!=='string'||!sql.includes('WITH creation_keys AS MATERIALIZED'))
     return Reflect.apply(original,client,[sql,values,...rest]);
    return (async()=>{
     const count='(SELECT count(*)::int FROM creation_keys) AS total';
     assert.ok(sql.includes(count));
     for(const [mode,statement] of [['exact-total',sql],['without-count-probe',sql.replace(count,'NULL::int AS total')]]){
      const data=(await original('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+statement,values as any[])).rows[0]['QUERY PLAN'][0];
      console.log(JSON.stringify({mode,offset:(values as unknown[]).at(-1),ms:data['Execution Time'],hit:data.Plan['Shared Hit Blocks'],read:data.Plan['Shared Read Blocks']}));
     }
     return original(sql,values as any[]);
    })();
   }) as typeof client.query;
  });
  for(const page of [1,250,1,250]){
   const rows=await listUnifiedCreationPage({platform:true},creationFiltersSchema.parse({view:'unified',projection:'list',period:'all',page,size:20}));
   assert.equal(rows.pagination.total,40000);assert.equal(rows.items.length,20);
  }
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
