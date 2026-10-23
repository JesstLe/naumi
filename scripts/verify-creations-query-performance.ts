import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {creationFiltersSchema,creationStatuses} from '../src/lib/saas/creation-contracts';
import type {CreationSummary} from '../src/lib/saas/creation-contracts';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 const base=process.argv[2]||'9ae4edff57efdaf34d1418ae58fcc12e1c4c1582',out=resolve(process.argv[3]||'output/creations-query-performance');mkdirSync(out,{recursive:true});
 const oldFile=resolve(`src/lib/saas/.creations-baseline-${randomUUID()}.ts`);writeFileSync(oldFile,execFileSync('git',['show',`${base}:src/lib/saas/creations.ts`]));
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema=`creations_perf_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE SCHEMA ${schema}`);let close=async()=>{};
 try{
  process.env.PGOPTIONS=`-c search_path=${schema}`;process.env.SETTINGS_SECRET='creation-performance-fixture-only-01234567890123456789';
  const db=await import('../src/lib/db'),tenants=await import('../src/lib/saas/tenants'),creationSchema=await import('../src/lib/saas/creation-schema');
  const baseline=await import(pathToFileURL(oldFile).href);
  const modified:typeof import('../src/lib/saas/creations')=process.argv[4]?await import(pathToFileURL(resolve(process.argv[4])).href):await import('../src/lib/saas/creations');
  const pool=db.getPool();close=()=>pool.end();await tenants.ensureTenantSchema();await creationSchema.ensureCreationSchema();
  const actor={email:'admin@creations.fixture',admin:true,consoleAdmin:true},ownerA='owner-a@creations.fixture',ownerB='owner-b@creations.fixture',manager='manager@creations.fixture',member='member@creations.fixture';
  for(const email of [actor.email,ownerA,ownerB,manager,member])await db.getOrCreateUser(email,email);
  const create=(ownerEmail:string)=>tenants.createTenant(actor,{commandId:randomUUID(),name:ownerEmail,ownerEmail,validUntil:null,seatLimit:100,entitlementName:null,featurePolicy:{video:false}});
  const a=await create(ownerA),b=await create(ownerB),role=randomUUID();
  await pool.query(`INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'Manager',10,true,true);
   `,[a.tenantId,role]);
  await pool.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent'),($1,$5,$2,NULL,'permanent')`,[a.tenantId,manager,ownerA,role,member]);
  await pool.query(`INSERT INTO app_users(email,name,plan,credits_total,credits_used,banned,joined_at,renews_at)
   SELECT 'user-'||g||'@creations.fixture','User '||g,'free',1000,0,false,'2026-01-01','2027-01-01' FROM generate_series(1,30) g`);
  const raw=['done','completed','success','error','rejected','pending','reviewing','processing','generating','queued','running','succeeded','partial','failed','cancel_requested','cancelled','needs_review','needs_attention','unknown'];
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,status,request_snapshot,parameters_snapshot,accepted_at)
   SELECT 'root-'||g,CASE WHEN g%9=0 THEN $3 WHEN g%7=0 THEN $4 WHEN g%11=0 THEN 'orphan@creations.fixture' ELSE 'user-'||(g%30+1)||'@creations.fixture' END,
   CASE WHEN g%5=0 THEN 'personal' ELSE 'tenant' END,CASE WHEN g%5=0 THEN NULL WHEN g%3=0 THEN $2::uuid ELSE $1::uuid END,
   CASE WHEN g%3=0 THEN 'image:generate' ELSE 'video' END,'source-'||g,($5::text[])[g%19+1],
   jsonb_build_object('state',CASE WHEN g%11=0 THEN 'not_recorded' ELSE 'recorded' END,'text',CASE WHEN g%13=0 THEN 'literal %_\\ search' ELSE 'Prompt '||g END,
    'padding',(SELECT string_agg(md5((g*1000+n)::text),'') FROM generate_series(1,100) n)),jsonb_build_object('private','never_list'),
   '2026-10-20'::timestamptz+(g/2)*interval '1 second' FROM generate_series(1,600) g`,[a.tenantId,b.tenantId,member,manager,raw]);
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,status,accepted_at)
   SELECT 'child-'||n||'-'||r.id,r.actor_email,r.scope_kind,r.tenant_id,'fixture-child',n||'-'||r.source_id,r.id,'succeeded',r.accepted_at
   FROM app_creation_records r CROSS JOIN generate_series(1,2) n WHERE r.parent_id IS NULL;
   INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id)
   SELECT 'op-'||r.id,r.actor_email,'fixture','{}','fixture',CASE WHEN substring(r.id from 6)::int%7=0 THEN 'reserved' WHEN substring(r.id from 6)::int%11=0 THEN 'released' ELSE 'settled' END,
    CASE WHEN substring(r.id from 6)::int%11=0 THEN 0 ELSE 6 END,'ledger-'||r.id FROM app_creation_records r WHERE parent_id IS NULL AND substring(r.id from 6)::int%5<>0;
   INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email)
   SELECT r.id,'billing',o.id,r.actor_email FROM app_creation_records r JOIN app_billing_operations o ON o.id='op-'||COALESCE(r.parent_id,r.id);
   INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email,relation)
   SELECT id,'no-charge',id,actor_email,'explicit-no-charge' FROM app_creation_records WHERE parent_id IS NULL AND substring(id from 6)::int%10=0;
   INSERT INTO app_creation_assets(id,creation_id,direction,role,position,storage_ref,actor_email)
   SELECT 'asset-'||n||'-'||r.id,r.id,'output','result',n,'/media/fixture.png',r.actor_email FROM app_creation_records r CROSS JOIN generate_series(1,4) n WHERE r.parent_id IS NULL;
   INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered)
   SELECT 'job-'||r.id,r.actor_email,'generate',jsonb_build_object('status','done','result',jsonb_build_object('status',CASE WHEN substring(r.id from 6)::int%6=0 THEN 'error' ELSE 'completed' END),
    'padding',(SELECT string_agg(md5((substring(r.id from 6)::int*1000+n)::text),'') FROM generate_series(1,100) n)),'{}',false FROM app_creation_records r WHERE parent_id IS NULL AND substring(id from 6)::int%4=0;
   INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email)
   SELECT r.id,'image:generate',j.id,r.actor_email FROM app_creation_records r JOIN app_image_jobs j ON j.id='job-'||r.id;
   INSERT INTO app_video_tasks(id,email,upstream_id,status)
   SELECT 'video-'||id,actor_email,'fixture','processing' FROM app_creation_records WHERE parent_id IS NULL AND substring(id from 6)::int%8=0;
   INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email)
   SELECT r.id,'video',v.id,r.actor_email FROM app_creation_records r JOIN app_video_tasks v ON v.id='video-'||r.id;
   ANALYZE`);
  // Cross-tenant/actor children must not join the root's billing family.
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,status) VALUES
   ('foreign-child','outsider@creations.fixture','tenant',$1,'fixture','foreign-child','root-9','succeeded'),
   ('wrong-actor-child','outsider@creations.fixture','tenant',$2,'fixture','wrong-actor-child','root-9','succeeded');
   `,[b.tenantId,a.tenantId]);
  await pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id) VALUES('foreign-op','outsider@creations.fixture','fixture','{}','fixture','settled',9999,'foreign-ledger');
   INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES('foreign-child','billing','foreign-op','outsider@creations.fixture'),('wrong-actor-child','billing','foreign-op','outsider@creations.fixture')`);
  let capture:{sql:string;values:unknown[]}[]|null=null;const wrapped=new WeakSet();pool.on('acquire',client=>{if(wrapped.has(client))return;wrapped.add(client);const query=client.query.bind(client);(client as any).query=(...args:any[])=>{if(capture&&typeof args[0]==='string'&&/^(SELECT (count\(\*\)|\*|count\(DISTINCT|actor_email)|WITH RECURSIVE status_records)/.test(args[0]))capture.push({sql:args[0],values:args[1]});return (query as any)(...args);};});
  const clean=(v:any)=>{const {generatedAt,...rest}=v;return rest;};let cases=0;
  const filters:any[]=[{},...creationStatuses.map(status=>({status})),{page:2},{page:25},{page:10000},{size:1},{size:100,page:3},
   {q:'Prompt 1'},{q:'%_\\'},{q:'missing'},{user:member},{user:'ORPHAN@CREATIONS.FIXTURE'},{source:'image:generate'},{tenantId:a.tenantId},{tenantId:b.tenantId},{from:'2026-10-21',to:'2026-10-21'}];
  const readers:any[]=[{platform:true},{platform:false,actor:{email:ownerA,admin:false},tenantId:a.tenantId},{platform:false,actor:{email:manager,admin:false},tenantId:a.tenantId}];
  for(const reader of readers)for(const f of filters){
   const parsed=creationFiltersSchema.parse({from:'2026-10-20',to:'2026-10-20',...f});
   assert.deepEqual(clean(await modified.listCreations(reader,parsed)),clean(await baseline.listCreations(reader,parsed)),JSON.stringify({reader,f}));cases++;
  }
  for(const repo of [baseline,modified]){
   const page=await repo.listCreations(readers[0],creationFiltersSchema.parse({user:member,size:100}));
   assert.equal(page.items.find((x:CreationSummary)=>x.id==='root-9')?.settledCredits,6,'same op linked to root/children is counted once; foreign children excluded');
   await assert.rejects(repo.listCreations({...readers[1],tenantId:b.tenantId},creationFiltersSchema.parse({})),/企业|访问|权限/);cases++;
   await assert.rejects(repo.listCreations({platform:false,actor:{email:member,admin:false},tenantId:a.tenantId},creationFiltersSchema.parse({})),/企业|访问|权限/);cases++;
  }
  for(const repo of [baseline,modified]){
   const page=await repo.listCreations(readers[2],creationFiltersSchema.parse({size:100}));
   assert.ok(page.items.every((x:CreationSummary)=>x.tenantId===a.tenantId&&[manager,member].includes(x.actorEmail)),'manager stays inside current tenant and current subordinate scope');cases++;
  }
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,status) VALUES
   ('wrong-tenant-child',$1,'tenant',$2,'fixture','wrong-tenant-child','root-9','succeeded'),
   ('grandchild',$1,'tenant',$3,'fixture','grandchild','child-1-root-9','succeeded')`,[member,a.tenantId,b.tenantId]);
  await pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id)
   VALUES('deep-op',$1,'fixture','{}','fixture','reserved',3,'deep-ledger');
   `,[member]);
  await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES
   ('wrong-tenant-child','billing','foreign-op','outsider@creations.fixture'),('grandchild','billing','deep-op',$1)`,[member]);
  for(const [state,charge,expected] of [['reserved',3,null],['settled',3,9],['released',0,6]] as const){
   await pool.query('UPDATE app_billing_operations SET state=$1,charged_credits=$2 WHERE id=\'deep-op\'',[state,charge]);
   const f=creationFiltersSchema.parse({user:member,size:100});const next=await modified.listCreations(readers[0],f);
   assert.deepEqual(clean(next),clean(await baseline.listCreations(readers[0],f)));
   assert.equal(next.items.find((x:CreationSummary)=>x.id==='root-9')?.settledCredits,expected);cases++;
  }
  const workflow=await import('../src/lib/video/workflow');await workflow.ensureVideoWorkflowSchema();const runId=randomUUID();
  await pool.query(`INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,creation_evidence_pending) VALUES($1,$2,'tree:fixture','{}','fixture',true)`,[runId,member]);
  await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES('root-9','video-workflow',$1,$2)`,[runId,member]);
  for(const states of [[],['completed'],['completed','blocked'],['blocked'],['cancelled'],['needs_attention'],['needs_confirmation'],['running']]){
   await pool.query('DELETE FROM app_video_workflow_run_nodes WHERE run_id=$1',[runId]);
   for(const [i,status] of states.entries())await pool.query(`INSERT INTO app_video_workflow_run_nodes(run_id,node_id,status) VALUES($1,$2,$3)`,[runId,String(i),status]);
   for(const status of [undefined,...creationStatuses]){
    const f=creationFiltersSchema.parse({user:member,status});assert.deepEqual(clean(await modified.listCreations(readers[0],f)),clean(await baseline.listCreations(readers[0],f)));cases++;
   }
  }
  const reports:any[]=[],profiles:any[]=[];
  for(const scene of [{name:'list',filters:{}},{name:'deep-page',filters:{page:25}},{name:'status-failed',filters:{status:'failed'}},{name:'keyword',filters:{q:'Prompt 1'}},{name:'tenant',filters:{tenantId:a.tenantId}}]){
   const f=creationFiltersSchema.parse({from:'2026-10-20',to:'2026-10-20',...scene.filters});const times={baseline:[] as number[],modified:[] as number[]};const queries:Record<string,number>={};
   for(let i=0;i<5;i++)for(const mode of i%2?['modified','baseline'] as const:['baseline','modified'] as const){
    capture=[];const start=performance.now();await(mode==='baseline'?baseline:modified).listCreations(readers[0],f);times[mode].push(performance.now()-start);const statements=capture;capture=null;queries[mode]=statements.length;
    if(i===4)for(const stmt of statements){const plan=await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+stmt.sql,stmt.values);profiles.push({scene:scene.name,mode,...stmt,plan:plan.rows[0]['QUERY PLAN']});}
   }
   const median=(a:number[])=>Number([...a].sort((a,b)=>a-b)[2].toFixed(2));reports.push({scene:scene.name,baselineMedianMs:median(times.baseline),modifiedMedianMs:median(times.modified),queries,times});
  }
  const records=Number((await pool.query('SELECT count(*)::int n FROM app_creation_records')).rows[0].n);
  writeFileSync(resolve(out,'PERFORMANCE.json'),JSON.stringify({base,cases,records,reports},null,2));writeFileSync(resolve(out,'SQL_PROFILE.json'),JSON.stringify(profiles,null,2));
  console.log(`CREATIONS_QUERY_PERFORMANCE=PASS cases=${cases} equivalent=true records=${records} supplierCalls=0`);
  console.log(JSON.stringify(reports.map(({times,...r})=>r)));assert.ok(readFileSync(oldFile).length);
 }finally{await close();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();unlinkSync(oldFile);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
