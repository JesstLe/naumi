import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const out=resolve(process.env.EVIDENCE_OUT||'output/unified-creations');mkdirSync(out,{recursive:true});
 const baseline=process.argv.includes('--baseline'),schema=`unified_${randomUUID().replaceAll('-','')}`,adminDb=new Pool({connectionString:url.toString()});
 await adminDb.query(`CREATE SCHEMA ${schema}`);process.env.PGOPTIONS=`-c search_path=${schema}`;
 Object.assign(process.env,{SETTINGS_SECRET:'unified-local-fixture-only-20261112-123456789',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',STORAGE_DRIVER:'local',MEDIA_DIR:resolve(out,'media')});
 let db:any;let oldFile='';const originalFetch=globalThis.fetch;let supplierCalls=0;
 globalThis.fetch=async()=>{supplierCalls++;throw Error('Unexpected network request in read-only creation test')};
 try{
  db=await import('../src/lib/db');const tenants=await import('../src/lib/saas/tenants'),creationSchema=await import('../src/lib/saas/creation-schema');
  await tenants.ensureTenantSchema();await creationSchema.ensureCreationSchema();
  const pool=db.getPool(),[admin,ownerA,ownerB,manager,member,peer]=['admin','owner-a','owner-b','manager','member','peer'].map(x=>`${x}@unified.fixture`);
  for(const email of [admin,ownerA,ownerB,manager,member,peer])await db.getOrCreateUser(email,email);
  await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  const actor={email:admin,admin:true,consoleAdmin:true};
  const create=(email:string)=>tenants.createTenant(actor,{commandId:randomUUID(),name:email,ownerEmail:email,validUntil:null,seatLimit:30,entitlementName:null,featurePolicy:{}});
  const a=await create(ownerA),b=await create(ownerB),role=randomUUID();
  await pool.query("INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records) VALUES($1,$2,'Manager',10,true,true)",[a.tenantId,role]);
  await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment) VALUES($1,$2,$3,$4,'permanent'),($1,$5,$2,NULL,'permanent'),($1,$6,$3,NULL,'permanent')",[a.tenantId,manager,ownerA,role,member,peer]);
  const root=`cr-${randomUUID()}`,child=`cr-${randomUUID()}`,job='job-'+randomUUID(),childJob='job-'+randomUUID();
  const record=async(id:string,email:string,tenant:string|null,kind:string,sourceId:string,parent:string|null=null,status='succeeded',time='2026-11-12T08:00:00Z')=>pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,payer_account_id,source_kind,source_id,parent_id,status,request_snapshot,parameters_snapshot,model_snapshot,accepted_at) VALUES($1,$2,$3,$4,$2,$5,$6,$7,$8,$9,'{"state":"not_recorded","values":{"executionPlans":{"fixture":{"version":1,"upstreamId":"fixture-upstream","requested":{"ratio":"3:4","resolution":"2K","quality":"high"},"wire":{"size":"1536x2048","quality":"high"}}}}}', '{"state":"recorded","label":"Fixture Image"}',$10)`,[id,email,tenant?'tenant':'personal',tenant,kind,sourceId,parent,status,JSON.stringify({state:'recorded',text:'Original request fixture'}),time]);
  const image=async(id:string,email:string,prompt:string,at='2026-11-12T07:00:00Z',status='done',kind='generate')=>pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled,created_at) VALUES($1,$2,$3,$4,$5,false,true,$6)`,[id,email,kind,JSON.stringify({status}),JSON.stringify({p:{userPrompt:prompt,prompt:'Compiled '+prompt,ratio:'3:4',quality:'high',resolution:'2K',count:1,watermark:false,seed:0,apiKey:'DO_NOT_EXPOSE'}}),at]);
  await image(job,member,'Original request fixture');await image(childJob,member,'Child request fixture');
  await record(root,member,a.tenantId,'image:generate',job);await record(child,member,a.tenantId,'image:generate',childJob,root);
  for(const [id,target]of [[root,job],[child,childJob]])await pool.query("INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id) VALUES($1,$2,'image:generate',$3)",[id,member,target]);
  if(baseline){
   oldFile=resolve(`src/lib/saas/.creation-unified-baseline-${randomUUID()}.ts`);
   writeFileSync(oldFile,readFileSync(resolve(process.env.BASELINE_SOURCE||'../naumi/output/admin-creation-detail-parity-20261112/BASELINE/src/lib/saas/creations.ts')));
   const old=await import(pathToFileURL(oldFile).href),detail=await old.creationDetail({platform:true},root);
   assert.equal(detail.parameters.state,'not_recorded');assert.ok(detail.parameters.values.executionPlans);assert.equal(detail.parameters.values.resolution,undefined);
   console.log('BASELINE=REPRODUCED PARAMETERS_HIDDEN=1 SOURCE_FIELDS_MISSING=1 READ_ONLY=1 SUPPLIER_CALLS=0');return;
  }
  let checks=0;const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++};
  const modern=await import('../src/lib/saas/creations'),legacy=await import('../src/lib/saas/legacy-creations'),contracts=await import('../src/lib/saas/creation-contracts');
  const native=await import('../src/lib/native-auth'),http=await import('../src/lib/saas/creation-http');
  const request=(path:string,email?:string)=>new Request('http://fixture.test'+path,{headers:email?{cookie:`nv_user=${native.signUserSession(email,Date.now())}`}:{}});
  const op='op-'+randomUUID();await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id) VALUES($1,$2,'fixture','{\"requestedCredits\":12}','fixture','settled',12,$3)",[op,member,'led-'+op]);
  for(const id of [root,child])await pool.query("INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id,reserved_credits,released_credits) VALUES($1,$2,'billing',$3,12,12)",[id,member,op]);
  const asset='ca-'+randomUUID();await pool.query("INSERT INTO app_creation_assets(id,creation_id,actor_email,direction,role,storage_ref) VALUES($1,$2,$3,'input','reference','/media/fixture.png')",[asset,root,member]);
  for(let n=0;n<31;n++)await pool.query("INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary) VALUES($1,$2,$3,'input-prepared','running','INTERNAL_CHANNEL_SECRET')",['ev-'+randomUUID(),root,'fixture-'+n]);
  const d=await modern.creationDetail({platform:true},root);check(d.parameters.state==='recorded','stale evidence state corrected on read');
  check((d.parameters.values.executionPlans as any).fixture.wire.size==='1536x2048','frozen wire parameters retained without recomputing mapping');
  check(d.parameters.values.resolution==='2K'&&d.parameters.values.quality==='high','frozen source parameters recovered');
  check(d.parameters.values.watermark===false&&d.parameters.values.seed===0,'explicit false and zero preserved');
  check(d.request.text==='Original request fixture','original request wins over compiled source prompt');
  check(d.parameters.values.apiKey===undefined,'secrets excluded');check(d.billing.charged===12,'parent and child charge counted once');
  const oldId=legacy.legacyCreationId({table:'app_image_jobs',id:job,email:member});
  const linked=(await legacy.legacyCreationDetail(oldId,{eventPage:2})).detail;
  check(linked.id===root,'old task links resolve canonical detail');check(linked.events.length===7&&linked.eventPagination.total===31,'old links preserve event pagination');
  check(linked.billing.charged===12&&linked.assets.some((x:any)=>x.id===asset),'old links include canonical media and billing');
  check((await legacy.legacyCreationAsset(oldId,asset)).url==='/media/fixture.png','old asset endpoint supports canonical asset IDs');
  const legacyOnly='legacy-'+randomUUID(),ancient='ancient-'+randomUUID(),foreignJob='foreign-'+randomUUID(),peerJob='peer-'+randomUUID();
  await image(legacyOnly,member,'Standalone historic fixture','2026-11-12T06:00:00Z');await image(ancient,member,'Ancient fixture','2001-01-01T00:00:00Z');
  await image(foreignJob,ownerB,'Other tenant secret');await image(peerJob,peer,'Peer historical request');
  const agent='cr-'+randomUUID();await record(agent,member,a.tenantId,'agent-turn','turn-'+randomUUID(),null,'succeeded','2026-11-12T09:00:00Z');
  const filters=contracts.creationFiltersSchema.parse({view:'unified',period:'all',user:member,size:2});
  const page1=await modern.listUnifiedCreations({platform:true},filters),page2=await modern.listUnifiedCreations({platform:true},{...filters,page:2});
  check(page1.pagination.total===4&&page2.pagination.total===4,'single total covers canonical roots and unlinked history');
  const ids=[...page1.items,...page2.items].map((x:any)=>x.id);check(new Set(ids).size===4,'paging is globally sorted and deduplicated');
  check(!ids.includes(child)&&!ids.includes(legacy.legacyCreationId({table:'app_image_jobs',id:childJob,email:member})),'recorded child is not repeated as raw history');
  check(page1.items[0].id===agent&&page2.items.at(-1)?.acceptedAt.startsWith('2001-'),'all source kinds and ancient history retained');
  check(page1.summary.settledCredits===12&&page2.summary.settledCredits===12,'whole-filter totals independent of page size');
  const empty=await modern.listUnifiedCreations({platform:true},{...filters,page:100});check(empty.items.length===0&&empty.pagination.total===4,'empty page keeps exact totals');
  const raw=(await legacy.legacyCreationDetail(legacy.legacyCreationId({table:'app_image_jobs',id:legacyOnly,email:member}))).detail;
  check(raw.id.startsWith('legacy-')&&raw.events.length===0,'unlinked history never receives fabricated timeline');check(raw.parameters.values.resolution==='2K','raw history uses same frozen parameter parser');
  const parentJob='orchestrator-'+randomUUID(),rawChild='raw-child-'+randomUUID(),childWork='work-'+randomUUID();
  await image(parentJob,member,'Historical parent fixture','2026-11-12T07:30:00Z','done','imagegen');await image(rawChild,member,'Historical child fixture','2026-11-12T07:31:00Z');
  await pool.query("UPDATE app_image_jobs SET snapshot=$2,payload=$3 WHERE id=$1",[parentJob,JSON.stringify({status:'done',children:{generate:{state:'done',jobId:rawChild},invalid:{state:'done',jobId:foreignJob}},result:{status:'succeeded',chargedCredits:7,billingStatus:'confirmed'}}),JSON.stringify({plan:{request:{prompt:'Historical parent fixture',parameters:{resolution:'2K'}},totalCredits:7}})]);
  await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,batch_id) VALUES($1,$2,'Grouped output','fixture','','/media/grouped.png','',$3)",[childWork,member,rawChild]);
  await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,ledger_id) VALUES($1,$2,'fixture','{\"requestedCredits\":7}','fixture','settled',7,$3)",[rawChild,member,'led-'+rawChild]);
  const groupedPage=await modern.listUnifiedCreations({platform:true},{...filters,size:100});
  check(groupedPage.pagination.total===5&&groupedPage.items.every((x:any)=>x.id!==legacy.legacyCreationId({table:'app_image_jobs',id:rawChild,email:member})),'unregistered parent/child displayed once');
  check(groupedPage.summary.settledCredits===19,'historical parent receipt and canonical family charge never double count child');
  const parentId=legacy.legacyCreationId({table:'app_image_jobs',id:parentJob,email:member}),grouped=(await legacy.legacyCreationDetail(parentId)).detail;
  check(grouped.children.length===1&&grouped.children[0].actorEmail===member,'historical child IDs rechecked against owner');
  check(grouped.assets.length===1&&grouped.billing.charged===7&&grouped.billing.operations.length===1,'historical root exposes child result and actual billing');
  check((await legacy.legacyCreationAsset(parentId,grouped.assets[0].id)).url==='/media/grouped.png','grouped historical media remains reachable');
  const tenant=await modern.listUnifiedCreations({platform:false,actor:{email:ownerA,admin:false},tenantId:a.tenantId},{...filters,user:'',size:100});
  check(tenant.items.some((x:any)=>x.id===root)&&tenant.items.some((x:any)=>x.id.startsWith('legacy-')),'enterprise combines authorized records and visible-member history');
  check(tenant.items.every((x:any)=>x.actorEmail!==ownerB),'other enterprise excluded');
  const managerView=await modern.listUnifiedCreations({platform:false,actor:{email:manager,admin:false},tenantId:a.tenantId},{...filters,user:'',size:100});
  check(managerView.items.every((x:any)=>x.actorEmail===member),'manager sees only current descendants');
  const bound=await modern.listUnifiedCreations({platform:true,boundTenantId:a.tenantId},{...filters,user:'',size:100});
  check(bound.items.every((x:any)=>x.tenantId===a.tenantId&&!x.id.startsWith('legacy-')),'tenant-bound platform view never reattributes personal history');
  const entityOld=await http.creationDetailRoute(request(`/api/enterprise/creations/${oldId}?tenantId=${a.tenantId}&eventPage=2`,ownerA),oldId,true);
  check(entityOld.status===200,'real enterprise old-link HTTP succeeds');const entityDetail=await entityOld.json();
  check(entityDetail.id===root&&entityDetail.events.length===7,'HTTP old-link uses canonical pagination');
  check(entityDetail.parameters.values.executionPlans===undefined&&!JSON.stringify(entityDetail).includes('INTERNAL_CHANNEL_SECRET'),'enterprise projection hides internal execution plans and messages');
  check(entityDetail.parameters.values.resolution==='2K','enterprise still receives public creation fields');
  check((await http.creationListRoute(request(`/api/admin/creations?view=unified&user=${member}`,admin))).status===200,'real unified admin route succeeds');
  const whole=await(await http.creationListRoute(request(`/api/admin/creations?view=unified&user=${member}`,admin))).json();
  check(whole.appliedFilters.period==='all'&&whole.pagination.total===5,'unified UI default does not hide old records');
  check([401,403].includes((await http.creationListRoute(request('/api/admin/creations?view=unified'))).status),'anonymous denied');
  check((await http.creationDetailRoute(request(`/api/enterprise/creations/${oldId}?tenantId=${b.tenantId}`,ownerB),oldId,true)).status===404,'other enterprise cannot open legacy link');
  const before=(await pool.query("SELECT md5(string_agg(id||parameters_snapshot::text,'' ORDER BY id)) hash FROM app_creation_records")).rows[0].hash;
  await modern.creationDetail({platform:true},root);await modern.listUnifiedCreations({platform:true},filters);
  check((await pool.query("SELECT md5(string_agg(id||parameters_snapshot::text,'' ORDER BY id)) hash FROM app_creation_records")).rows[0].hash===before,'read-time enrichment never rewrites old snapshots');
  const {withFrozenCreation}=await import('../src/lib/saas/creation-scope'),writer=await import('../src/lib/saas/creation-writer');
  const future=await withFrozenCreation({actorEmail:member,scopeKind:'tenant',tenantId:a.tenantId},()=>writer.creationTransaction((tx:any)=>writer.acceptCreationTx(tx,'image:generate','future-only-'+randomUUID(),member,{p:{userPrompt:'Actual user words',prompt:'Compiled supplier words',quality:'high',resolution:'4K',ratio:'16:9'}})));
  check(!!future,'future evidence accepted without supplier work');
  const frozen=(await pool.query('SELECT request_snapshot,parameters_snapshot FROM app_creation_records WHERE id=$1',[future])).rows[0];
  check(frozen.request_snapshot.text==='Actual user words'&&frozen.parameters_snapshot.values.resolution==='4K','new writes retain original words and scalar generation parameters');
  await withFrozenCreation({actorEmail:member,scopeKind:'tenant',tenantId:a.tenantId,creationId:future!},()=>writer.recordImageParameterPlan({upstreamId:'fixture-upstream',requested:{ratio:'16:9'}} as any));
  check((await pool.query('SELECT parameters_snapshot FROM app_creation_records WHERE id=$1',[future])).rows[0].parameters_snapshot.state==='recorded','parameter-plan writer marks evidence recorded');
  const uiPage=await modern.listUnifiedCreations({platform:true},{...filters,size:100});
  const uiDetails:Record<string,unknown>={};for(const row of uiPage.items)uiDetails[row.id]=row.id.startsWith('legacy-')?(await legacy.legacyCreationDetail(row.id)).detail:await modern.creationDetail({platform:true},row.id);
  writeFileSync(resolve(out,'UI_FIXTURE.json'),JSON.stringify({page:uiPage,details:uiDetails,eventPages:{[root]:[d.events,linked.events]},root,oldId},null,2));
  await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2",[a.tenantId,member]);
  check((await modern.listUnifiedCreations({platform:false,actor:{email:manager,admin:false},tenantId:a.tenantId},{...filters,user:'',size:100})).items.length===0,'revocation removes both canonical and historical descendants');
  // A mixed historical page is globally sorted before LIMIT, never a merge of
  // independently paginated lists. Exercise the actual SQL with a nontrivial set.
  const perf='performance@unified.fixture';
  await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled,created_at)
   SELECT 'perf-'||n,$1,'generate',jsonb_build_object('status',CASE n%4 WHEN 0 THEN 'done' WHEN 1 THEN 'error' WHEN 2 THEN 'pending' ELSE 'needs_attention' END),
   jsonb_build_object('p',jsonb_build_object('prompt','Load fixture '||n)),false,true,'2010-01-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,2000)n`,[perf]);
  await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,parent_id,request_snapshot,accepted_at)
   SELECT 'cr-'||md5(n::text)::uuid::text,$1,'personal','image:generate','perf-'||n,
   CASE WHEN n>500 THEN 'cr-'||md5((n-500)::text)::uuid::text ELSE NULL END,
   jsonb_build_object('state','recorded','text','Load fixture '||n),'2010-01-01T00:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,1000)n`,[perf]);
  await pool.query(`INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id)
   SELECT id,actor_email,source_kind,source_id FROM app_creation_records WHERE actor_email=$1`,[perf]);
  const started=performance.now(),perfPage=await modern.listUnifiedCreations({platform:true},{...filters,user:perf,size:25,page:1});
  const durationMs=performance.now()-started;
  check(perfPage.pagination.total===1500&&perfPage.items.length===25,'2000 raw + 1000 recorded minus overlaps and children = 1500 roots');
  check(perfPage.summary.pending===375&&perfPage.summary.failed===375&&perfPage.summary.needsReview===375,'mixed-source status totals cover full result');
  const failed=await modern.listUnifiedCreations({platform:true},{...filters,user:perf,status:'failed',size:25,page:2});
  check(failed.pagination.total===375&&failed.items.every((x:any)=>x.status==='failed'),'status filtering uses the same union before pagination');
  check(new Set([...perfPage.items,...failed.items].map((x:any)=>x.id)).size>=25,'stable IDs survive mixed-source views');
  writeFileSync(resolve(out,'QUERY_SAMPLE.json'),JSON.stringify({sourceRows:2000,recordedRows:1000,expectedRoots:1500,firstPageSize:25,durationMs},null,2));
  check(supplierCalls===0,'no supplier calls');
  const result={status:'PASS',checks,realPostgres:true,realAuthRoutes:true,supplierCalls};writeFileSync(resolve(out,'RESULT.json'),JSON.stringify(result,null,2));
  console.log(`UNIFIED_CREATIONS=PASS CHECKS=${checks} REAL_PG=1 REAL_HTTP_AUTH=1 DEDUP=1 LEGACY_LINKS=1 PARAMETERS=RECOVERED READ_WRITES=0 SUPPLIER_CALLS=0`);
 }finally{
  globalThis.fetch=originalFetch;if(oldFile)unlinkSync(oldFile);await db?.getPool?.().end().catch(()=>{});await adminDb.query(`DROP SCHEMA ${schema} CASCADE`);await adminDb.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
