import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool,Client} from 'pg';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const out=resolve(process.env.EVIDENCE_OUT!),root=resolve(process.env.SOURCE_ROOT||process.cwd()),baseline=process.argv.includes('--baseline');mkdirSync(out,{recursive:true});
 const schema='history_'+randomUUID().replaceAll('-',''),adminDb=new Pool({connectionString:url.toString()});await adminDb.query('CREATE SCHEMA '+schema);
 process.env.PGOPTIONS='-c search_path='+schema;
 Object.assign(process.env,{SETTINGS_SECRET:'creation-history-fixture-secret-20261113',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',STORAGE_DRIVER:'local',MEDIA_DIR:resolve(out,'media')});
 const load=(p:string)=>import(pathToFileURL(resolve(root,p)).href);
 const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('Unexpected network')};
 let db:any;const nativeQuery=Client.prototype.query;let captured:any;
 (Client.prototype as any).query=function(...args:any[]){if(typeof args[0]==='string'&&(/WITH RECURSIVE status_records|WITH creation_keys/.test(args[0])))captured={sql:args[0],values:args[1]};return (nativeQuery as any).apply(this,args);};
 try{
  db=await load('src/lib/db.ts');const tenants=await load('src/lib/saas/tenants.ts'),schemaOwner=await load('src/lib/saas/creation-schema.ts');await tenants.ensureTenantSchema();await schemaOwner.ensureCreationSchema();const pool=db.getPool();
  const [admin,owner,otherOwner,member,foreign,perf]=['admin','owner','other-owner','member','foreign','performance'].map(x=>x+'@history.fixture');
  for(const email of [admin,owner,otherOwner,member,foreign,perf])await db.getOrCreateUser(email,email);
  await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const create=(email:string)=>tenants.createTenant({email:admin,admin:true,consoleAdmin:true},{commandId:randomUUID(),name:email,ownerEmail:email,validUntil:null,seatLimit:30,entitlementName:null,featurePolicy:{}});
  const a=await create(owner),b=await create(otherOwner);
  for(const email of [member,perf])await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment)VALUES($1,$2,$3,'permanent')",[a.tenantId,email,owner]);
  const reader={platform:false as const,actor:{email:owner,admin:false},tenantId:a.tenantId};
  const model=await load('src/lib/saas/creations.ts'),legacy=await load('src/lib/saas/legacy-creations.ts'),contracts=await load('src/lib/saas/creation-contracts.ts');
  const filters=contracts.creationFiltersSchema.parse({view:'unified',period:'all',user:member,size:20});
  const ids=Object.fromEntries(['personal','tenant','foreign','text'].map(x=>[x,'cr-'+randomUUID()]));
  const image=async(id:string,email=member)=>pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled,created_at)VALUES($1,$2,'generate','{\"status\":\"done\"}',$3,false,true,'2026-10-01T00:00:00Z')",[id,email,JSON.stringify({p:{userPrompt:'Historical '+id,resolution:'2K',ratio:'3:4',watermark:false,seed:0}})]);
  for(const id of ['personal','tenant','foreign','old'])await image(id);
  for(const [key,tenant,kind]of [['personal',null,'image:generate'],['tenant',a.tenantId,'image:generate'],['foreign',b.tenantId,'image:generate'],['text',null,'canvas.text-generate']]){
   await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,status,request_snapshot,accepted_at)VALUES($1,$2,$3,$4,$2,$5,$6,'succeeded','{\"state\":\"recorded\",\"text\":\"Historical request\"}','2026-10-01T00:00:00Z')",[ids[key as string],member,tenant?'tenant':'personal',tenant,kind,key]);
   await pool.query('INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id)VALUES($1,$2,$3,$4)',[ids[key as string],member,kind,key]);
  }
  const asset='ca-'+randomUUID();await pool.query("INSERT INTO app_creation_assets(id,creation_id,actor_email,direction,role,storage_ref)VALUES($1,$2,$3,'input','reference','/media/history-fixture.png')",[asset,ids.personal,member]);
  for(let n=0;n<27;n++)await pool.query("INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary)VALUES($1,$2,$3,'execution','succeeded','INTERNAL_SECRET')",['ev-'+randomUUID(),ids.personal,'history-'+n]);
  const before=(await pool.query('SELECT id,to_jsonb(c)::text AS data FROM app_creation_records c ORDER BY id')).rows;
  let checks=0;const check=(value:unknown,name:string)=>{assert.ok(value,name);checks++;};
  const full=await model.listUnifiedCreations(reader,filters),personalLegacy=legacy.legacyCreationId({table:'app_image_jobs',id:'personal',email:member});
  if(baseline){check(!full.items.some((i:any)=>i.id===personalLegacy),'baseline hides personal recorded history');check(full.pagination.total===2,'baseline only tenant and never-recorded history remain');}
  else{
   check(full.pagination.total===3,'personal ledger history restored without foreign tenant');
   check(full.items.some((i:any)=>i.id===personalLegacy),'restored original task uses historical identity');
   const page=await model.listUnifiedCreationPage(reader,filters);
   check(page.pagination.total===full.pagination.total&&JSON.stringify(page.items)===JSON.stringify(full.items),'light page exactly matches full list');
   check(!('summary'in page)&&!('memberUsage'in page),'light page omits unused global metrics instead of inventing zeros');
   const detail=await model.creationDetail(reader,ids.personal,{eventPage:2});
   check(detail.events.length===3&&detail.eventPagination.total===27,'restored personal ledger retains real event pagination');
   check(detail.tenantId===null&&detail.scopeKind==='personal','read never transfers original ownership');
   check(!detail.technical&&!JSON.stringify(detail).includes('INTERNAL_SECRET'),'enterprise personal history remains public projection');
   check(detail.parameters.values.resolution==='2K'&&detail.parameters.values.watermark===false&&detail.parameters.values.seed===0,'frozen source fields retained');
   check((await model.creationAsset(reader,ids.personal,asset)).url==='/media/history-fixture.png','canonical personal media remains authorized');
   await assert.rejects(()=>model.creationDetail(reader,ids.foreign),{status:404});checks++;
   await assert.rejects(()=>model.creationDetail(reader,ids.text),{status:404});checks++;
   const native=await load('src/lib/native-auth.ts'),http=await load('src/lib/saas/creation-http.ts');
   const req=(path:string,email=owner)=>new Request('http://fixture.test'+path,{headers:{cookie:`nv_user=${native.signUserSession(email,Date.now())}`}});
   const response=await http.creationListRoute(req(`/api/enterprise/creations?view=unified&projection=list&tenantId=${a.tenantId}&user=${member}`),true);const body=await response.json();
   check(response.status===200&&body.pagination.total===3&&body.appliedFilters.period==='all','real authenticated list route includes old personal history');
   const oldDetail=await http.creationDetailRoute(req(`/api/enterprise/creations/${personalLegacy}?tenantId=${a.tenantId}&eventPage=2`),personalLegacy,true);const oldBody=await oldDetail.json();
   check(oldDetail.status===200&&oldBody.id===ids.personal&&oldBody.events.length===3,'legacy deep link resolves complete canonical personal evidence');
   const foreignLegacy=legacy.legacyCreationId({table:'app_image_jobs',id:'foreign',email:member});
   check((await http.creationDetailRoute(req(`/api/enterprise/creations/${foreignLegacy}?tenantId=${a.tenantId}`),foreignLegacy,true)).status===404,'legacy ID cannot strip confirmed foreign tenant');
   check((await http.creationListRoute(new Request(`http://fixture.test/api/enterprise/creations?tenantId=${a.tenantId}&view=unified&projection=list`),true)).status===401,'anonymous request stays denied');
   const historyLink=await load('src/lib/saas/creation-history-link.ts');let readinessReads=0;
   await historyLink.assertLegacySourceTenant({query:async()=>{readinessReads++;return{rows:[{ready:false}]};}},{table:'app_image_jobs',id:'old',email:member},a.tenantId);
   check(readinessReads===1,'pre-ledger installations retain legacy read compatibility');
   for(const selected of [{status:'succeeded'}, {q:'Historical'}, {page:50}, {from:'2026-10-01',to:'2026-10-01'}]){
    const f={...filters,...selected},x=await model.listUnifiedCreationPage(reader,f),y=await model.listUnifiedCreations(reader,f);
    check(x.pagination.total===y.pagination.total&&JSON.stringify(x.items)===JSON.stringify(y.items),'exact filters and empty-page totals '+JSON.stringify(selected));
   }
   await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2",[a.tenantId,member]);
   check((await model.listUnifiedCreationPage(reader,filters)).pagination.total===1,'suspended member loses historical personal visibility, tenant owner retains enterprise ledger');
   await assert.rejects(()=>model.creationDetail(reader,ids.personal),{status:404});checks++;
   await assert.rejects(()=>model.creationAsset(reader,ids.personal,asset),{status:404});checks++;
   check((await http.creationDetailRoute(req(`/api/enterprise/creations/${personalLegacy}?tenantId=${a.tenantId}`),personalLegacy,true)).status===404,'old history links honor immediate revocation');
   await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE enterprise_id=$1 AND email=$2",[a.tenantId,member]);
  }
  assert.deepEqual((await pool.query('SELECT id,to_jsonb(c)::text AS data FROM app_creation_records c ORDER BY id')).rows,before);checks++;
  // Production-shaped root/child distribution: 36,700 source jobs, 28,700
  // ledger rows. No production prompts, media bytes or credentials are copied.
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled,created_at)
   SELECT 'parent-'||n,$1,'imagegen',jsonb_build_object('status','done','children',jsonb_build_object('generate',jsonb_build_object('jobId','child-'||n)),
   'result',jsonb_build_object('status','succeeded','billingStatus','confirmed','chargedCredits',1)),
   jsonb_build_object('plan',jsonb_build_object('request',jsonb_build_object('prompt','Personal history '||n))),false,true,'2026-10-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,14000)n
   UNION ALL SELECT 'child-'||n,$1,'generate','{"status":"done"}',jsonb_build_object('p',jsonb_build_object('userPrompt','Child '||n)),false,true,'2026-10-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,14000)n
   UNION ALL SELECT 'tenant-'||n,$1,'generate','{"status":"done"}',jsonb_build_object('p',jsonb_build_object('userPrompt','Tenant '||n)),false,true,'2026-11-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,700)n
   UNION ALL SELECT 'old-'||n,$1,'generate',jsonb_build_object('status',CASE WHEN n%5=0 THEN 'error' ELSE 'done' END),jsonb_build_object('p',jsonb_build_object('userPrompt','Ancient '||n)),false,true,'2001-01-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,8000)n`,[perf]);
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,status,request_snapshot,accepted_at)
   SELECT 'cr-'||md5('p'||n)::uuid::text,$1,'personal',NULL::uuid,'image:imagegen','parent-'||n,NULL,'succeeded','{"state":"recorded","text":"Personal history"}'::jsonb,'2026-10-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,14000)n
   UNION ALL SELECT 'cr-'||md5('c'||n)::uuid::text,$1,'personal',NULL::uuid,'image:generate','child-'||n,'cr-'||md5('p'||n)::uuid::text,'succeeded','{"state":"recorded","text":"Child history"}','2026-10-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,14000)n
   UNION ALL SELECT 'cr-'||md5('t'||n)::uuid::text,$1,'tenant',$2::uuid,'image:generate','tenant-'||n,NULL,'succeeded','{"state":"recorded","text":"Tenant history"}','2026-11-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,700)n`,[perf,a.tenantId]);
  await pool.query('INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id)SELECT id,actor_email,source_kind,source_id FROM app_creation_records WHERE actor_email=$1',[perf]);
  const f={...filters,user:perf,size:20},timings:number[]=[];let measured:any;
  for(let n=0;n<(baseline?1:3);n++){const start=performance.now();measured=await(baseline?model.listUnifiedCreations:model.listUnifiedCreationPage)(reader,f);timings.push(performance.now()-start);}
  check(measured.pagination.total===(baseline?8700:22700),'large-fixture root coverage');check(measured.items.length===20,'bounded page');
  if(!baseline){
   const second=await model.listUnifiedCreationPage(reader,{...f,page:2});check(new Set([...measured.items,...second.items].map((x:any)=>x.id)).size===40,'large page boundaries do not duplicate');
   const failed=await model.listUnifiedCreationPage(reader,{...f,status:'failed'});check(failed.pagination.total===1600&&failed.items.every((x:any)=>x.status==='failed'),'status filter uses authoritative raw states');
   const plainSql=captured; // Capture an unfiltered page rather than failure diagnostics.
   await model.listUnifiedCreationPage(reader,{...f,user:''});
   writeFileSync(resolve(out,'LIST_QUERY.json'),JSON.stringify({...captured,tenantFixture:a.tenantId},null,2));
   assert.ok(plainSql);check(timings.every(ms=>ms<3000),'36,700-source fixture list below 3s on each run');
  }
  else{await model.listUnifiedCreations(reader,{...f,user:''});writeFileSync(resolve(out,'LIST_QUERY_BASELINE.json'),JSON.stringify({...captured,tenantFixture:a.tenantId},null,2));}
  check(network===0,'no supplier requests');
  const result={mode:baseline?'BASELINE':'MODIFIED',checks,sourceJobs:36700,ledgerRows:28700,displayedRoots:measured.pagination.total,expectedRoots:22700,timingsMs:timings,readWrites:0,supplierCalls:network};
  writeFileSync(resolve(out,baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json'),JSON.stringify(result,null,2));
  console.log(`${baseline?'BASELINE':'MODIFIED'}=${baseline?'REPRODUCED':'PASS'} CHECKS=${checks} ROOTS=${measured.pagination.total}/22700 SOURCE_JOBS=36700 REAL_PG=1 PERSONAL_HISTORY=${baseline?'MISSING':'RESTORED'} READ_WRITES=0 SUPPLIER_CALLS=0`);
 }finally{(Client.prototype as any).query=nativeQuery;globalThis.fetch=originalFetch;if(db)await db.getPool().end();await adminDb.query('DROP SCHEMA '+schema+' CASCADE');await adminDb.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
