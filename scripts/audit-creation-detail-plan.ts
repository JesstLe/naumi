import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool,type PoolClient} from 'pg';
import type {CreationDetail} from '../src/lib/saas/creation-contracts';

type Query={sql:string;values:unknown[]};
type Repo=typeof import('../src/lib/saas/creations');
const reader={platform:true} as const;
const sorted=(detail:CreationDetail)=>({...detail,billing:{...detail.billing,operations:[...detail.billing.operations].sort((a,b)=>a.id.localeCompare(b.id))}});

async function main(){
 const url=new URL(process.env.DATABASE_URL!);
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const baseline=process.argv[2];assert.match(baseline,/^[a-f0-9]{40}$/);
 const db=`creation_detail_fixture_${Date.now()}`;
 const admin=new Pool({connectionString:url.toString()});try{await admin.query(`CREATE DATABASE ${db}`);}finally{await admin.end();}
 url.pathname=`/${db}`;process.env.DATABASE_URL=url.toString();
 const token=randomUUID();
 const oldView=resolve(`src/lib/saas/.detail-view-${token}.ts`),oldRepo=resolve(`src/lib/saas/.detail-repo-${token}.ts`);
 const at=(file:string)=>execFileSync('git',['show',`${baseline}:src/lib/saas/${file}`],{encoding:'utf8'});
 const {getPool}=await import('../src/platform/db/pool');const pool=getPool();
 try{
  await writeFile(oldView,at('creation-asset-view.ts'));
  await writeFile(oldRepo,at('creations.ts').replace("'./creation-asset-view'",`'./.detail-view-${token}'`));
  const previous:Repo=await import(pathToFileURL(oldRepo).href),current=await import('../src/lib/saas/creations');
  const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema');await ensureCreationSchema();
  const owner='audit@detail.fixture';
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,status,request_snapshot)
   VALUES('root',$1,'personal','fixture','root','succeeded','{"state":"recorded","text":"fixture"}'),
   ('empty',$1,'personal','fixture','empty','succeeded','{}'),('free',$1,'personal','fixture','free','succeeded','{}'),
   ('stranger','stranger@detail.fixture','personal','fixture','stranger','succeeded','{}')`,[owner]);
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,parent_id,status,accepted_at)
   SELECT 'child-'||n,$1,'personal','fixture','child-'||n,'root','succeeded','2026-11-01Z'::timestamptz+(n/8)*interval '1 second' FROM generate_series(1,2000)n
   UNION ALL SELECT 'leaf-'||n,$1,'personal','fixture','leaf-'||n,'child-'||((n-1)%2000+1),'succeeded','2026-11-02Z'::timestamptz FROM generate_series(1,4000)n
   UNION ALL SELECT 'other-'||n,$1,'personal','fixture','other-'||n,'stranger','succeeded','2026-11-03Z'::timestamptz FROM generate_series(1,8000)n`,[owner]);
  // The branch's owner stays the same as the root on the last edge; the
  // intervening edge is unauthorized and must still cut off its descendants.
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,parent_id,status)
   VALUES('wrong-edge','stranger@detail.fixture','personal','fixture','wrong-edge','root','succeeded'),
   ('wrong-descendant',$1,'personal','fixture','wrong-descendant','wrong-edge','succeeded')`,[owner]);
  await pool.query(`INSERT INTO app_creation_assets(id,creation_id,direction,role,position,variant,storage_ref,actor_email,hash,media_type,text_content)
   SELECT 'asset-'||r.id||'-'||n,r.id,CASE WHEN n=3 THEN 'output' ELSE 'input' END,
   CASE n WHEN 1 THEN 'reference' WHEN 2 THEN 'edit-target' ELSE 'result' END,n,
   CASE WHEN n=1 THEN 'original' WHEN n=2 AND length(r.id)%2=0 THEN 'processed' ELSE 'original' END,
   CASE WHEN n=3 THEN 'artwork:fixture-'||r.id ELSE '/media/fixture/'||r.id||'.png' END,r.actor_email,
   CASE WHEN n<=2 THEN md5(r.id)||md5(r.id) END,'image',CASE WHEN n=3 THEN repeat(md5(r.id),20) END
   FROM app_creation_records r CROSS JOIN generate_series(1,3)n WHERE r.parent_id IS NOT NULL;
   INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary,occurred_at,observed_at)
   SELECT 'event-'||r.id||'-'||n,r.id,'fixture-'||n,'execution','succeeded',repeat(md5(r.id),24),r.accepted_at+(n/2)*interval '1 second',r.accepted_at
   FROM app_creation_records r CROSS JOIN generate_series(1,4)n WHERE r.parent_id IS NOT NULL;
   INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient)
   SELECT 'fixture-'||id,actor_email,'fixture','fixture','','/media/fixture/'||id||'.png','' FROM app_creation_records WHERE id IN ('leaf-1','wrong-descendant','other-1');`);
  await pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id)
   SELECT 'op-'||n,$1,'fixture',jsonb_build_object('requestedCredits',n),'fixture',CASE WHEN n=2 THEN 'released' ELSE 'settled' END,CASE WHEN n=2 THEN 0 ELSE n END,'ledger-'||n FROM generate_series(1,45)n`,[owner]);
  await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,reserved_credits,released_credits)
   SELECT id,'billing','op-'||(right(id,1)::int+1),actor_email,length(id),length(id)-1 FROM app_creation_records WHERE id LIKE 'child-%' OR id LIKE 'leaf-%';
   INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation)
   SELECT id,'no-charge','fixture',actor_email,'explicit-no-charge' FROM app_creation_records WHERE id='free';
   INSERT INTO app_billing_api_cost_reviews(id,operation_id,after_result,status,refund_credits) VALUES
    ('rv-1','op-2','{}','confirmed',2),('rv-2','op-2','{}','refunded',1),('rv-3','op-2','{}','ignored',900),('rv-4','op-40','{}','confirmed',1000);
   ANALYZE`);
  const wrapped=new WeakSet<PoolClient>();let capture:Query[]|null=null;
  pool.on('acquire',client=>{if(wrapped.has(client))return;wrapped.add(client);const query=client.query.bind(client);
   client.query=((...args:any[])=>{if(capture&&typeof args[0]==='string'&&/^(WITH|SELECT) /i.test(args[0]))capture.push({sql:args[0],values:args[1]||[]});return (query as any)(...args);}) as typeof client.query;
  });
  const run=async<T>(read:()=>Promise<T>)=>{const queries:Query[]=[];capture=queries;try{return {data:await read(),queries};}finally{capture=null;}};
  const plans=async(queries:Query[])=>{
   const metrics={selects:queries.length,familyQueries:0,blocks:0,tempBlocks:0,ms:0};
   const tx=await pool.connect();try{
    await tx.query('BEGIN READ ONLY');
    for(const {sql,values} of queries){
     if(/WITH RECURSIVE family AS/i.test(sql))metrics.familyQueries++;
     const [plan]=(await tx.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,values)).rows[0]['QUERY PLAN'];
     metrics.blocks+=(plan.Plan['Shared Hit Blocks']||0)+(plan.Plan['Shared Read Blocks']||0);
     metrics.tempBlocks+=(plan.Plan['Temp Read Blocks']||0)+(plan.Plan['Temp Written Blocks']||0);
     metrics.ms+=plan['Execution Time'];
    }
   }finally{await tx.query('ROLLBACK');tx.release();}
   metrics.ms=Math.round(metrics.ms*1000)/1000;return metrics;
  };
  const cases=[{id:'root',pages:{}},{id:'root',pages:{assetPage:470,eventPage:900,childPage:81}},
   {id:'root',pages:{assetPage:9999,eventPage:9999,childPage:9999}},{id:'leaf-1',pages:{}},{id:'empty',pages:{}},{id:'free',pages:{}}];
  for(const [i,c] of cases.entries()){
   const before=await run(()=>previous.creationDetail(reader,c.id,c.pages)),after=await run(()=>current.creationDetail(reader,c.id,c.pages));
   assert.deepEqual(sorted(after.data),sorted(before.data),JSON.stringify(c));
   if(i<3){
    assert.equal(after.data.assetPagination.total,12000);assert.equal(after.data.eventPagination.total,24000);assert.equal(after.data.childPagination.total,2000);
    assert.equal(after.data.billing.refunded,3);assert.equal(after.data.billing.operations.length,10);
    const old=await plans(before.queries),now=await plans(after.queries);
    assert.ok(now.familyQueries<old.familyQueries);assert.ok(now.blocks<old.blocks,JSON.stringify({old,now}));
    console.log(JSON.stringify({case:`detail-${i+1}`,old,now}));
   }
  }
  for(const repo of [previous,current]){
   await assert.rejects(repo.creationAsset(reader,'root','asset-wrong-descendant-3'),/无权|不存在/);
   await assert.rejects(repo.creationAsset(reader,'root','asset-other-1-3'),/无权|不存在/);
  }
  const oldAsset=await run(()=>previous.creationAsset(reader,'root','asset-leaf-1-3')),newAsset=await run(()=>current.creationAsset(reader,'root','asset-leaf-1-3'));
  assert.deepEqual(oldAsset.data,newAsset.data);assert.equal(newAsset.data.url,'/media/fixture/leaf-1.png');
  const old=await plans(oldAsset.queries),now=await plans(newAsset.queries);assert.ok(now.blocks<old.blocks/10);
  console.log(JSON.stringify({case:'single-asset',old,now,comparedDetails:cases.length}));
 }finally{await pool.end();await Promise.allSettled([unlink(oldRepo),unlink(oldView)]);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
