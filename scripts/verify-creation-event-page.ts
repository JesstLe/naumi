import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {creationFamilySql,evidencePageSize} from '../src/lib/saas/creation-detail-evidence';

const previousSql=`${creationFamilySql} SELECT e.id,e.event_key,e.type,e.status,e.summary,e.occurred_at,e.observed_at
 FROM app_creation_events e JOIN family f ON f.id=e.creation_id ORDER BY e.occurred_at,e.id LIMIT $2 OFFSET $3`;

async function main(){
 const baseline=process.argv.includes('--baseline');
 Object.assign(process.env,{PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'fixture-events-0123456789abcdef0123456789abcdef'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  const db=await import('../src/lib/db'),tenants=await import('../src/lib/saas/tenants');
  const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema');
  const {creationEventsRoute}=await import('../src/lib/saas/creation-http'),{signUserSession}=await import('../src/lib/native-auth');
  await tenants.ensureTenantSchema();await ensureCreationSchema();
  const admin='event-admin@fixture.test',owner='event-owner@fixture.test',stranger='event-stranger@fixture.test';
  for(const email of [admin,owner,stranger])await db.getOrCreateUser(email,email);
  await db.setUserRole(admin,'admin');
  await f.pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]')",[owner]);
  const {tenantId}=await tenants.createTenant({email:admin,admin:true,consoleAdmin:true},
   {commandId:randomUUID(),name:'Event pages',ownerEmail:owner,validUntil:null,seatLimit:null,entitlementName:null,featurePolicy:{team:true}});
  const root='cr-'+randomUUID();
  await f.pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id)
   VALUES($1,$2,'tenant',$3,'fixture','root')`,[root,owner,tenantId]);
  await f.pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id)
   SELECT 'event-child-'||g,$2,'tenant',$3::uuid,'fixture','child-'||g,$1 FROM generate_series(1,2000) g
   UNION ALL SELECT 'event-leaf-'||g,$2,'tenant',$3::uuid,'fixture','leaf-'||g,'event-child-'||((g-1)%2000+1) FROM generate_series(1,4000) g
   UNION ALL SELECT 'foreign-edge',$4,'tenant',$3::uuid,'fixture','bad',$1
   UNION ALL SELECT 'foreign-descendant',$2,'tenant',$3::uuid,'fixture','bad-child','foreign-edge'
   UNION ALL SELECT 'foreign-tenant',$2,'tenant',$5::uuid,'fixture','bad-tenant',$1`,[root,owner,tenantId,stranger,randomUUID()]);
  await f.pool.query(`INSERT INTO app_creation_events(id,creation_id,event_key,type,status,summary,occurred_at,observed_at)
   SELECT c.id||'-'||g,c.id,'private-'||g,'execution','succeeded',repeat(md5(c.id||g::text),23),
    '2026-11-09T00:00Z'::timestamptz+(g/2)*interval '1 second','2026-11-20T00:00Z'::timestamptz
   FROM app_creation_records c CROSS JOIN generate_series(1,8) g;
   ANALYZE app_creation_records; `);
  await f.pool.query('VACUUM ANALYZE app_creation_events');
  const read=(page:number,tenant=false,id=root,projection=false,scope=tenantId)=>creationEventsRoute(new Request(
   'http://localhost/api/'+(tenant?'enterprise':'admin')+'/creations/'+id+'/events?eventPage='+page+'&tenantId='+scope+(projection?'&projection=page':''),
   {headers:{cookie:'nv_user='+signUserSession(tenant?owner:admin,Date.now())}}),id,tenant);
  const tx=await f.pool.connect();
  try{
   await tx.query("BEGIN READ ONLY; SET LOCAL work_mem='1MB'");
   const measure=async(sql:string,page:number)=>{
    const data=(await tx.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,[root,evidencePageSize,(page-1)*evidencePageSize])).rows[0]['QUERY PLAN'][0];
    return {temp:(data.Plan['Temp Read Blocks']??0)+(data.Plan['Temp Written Blocks']??0),
     blocks:(data.Plan['Shared Hit Blocks']??0)+(data.Plan['Shared Read Blocks']??0),ms:data['Execution Time']};
   };
   const deep=1700,old=await measure(previousSql,deep);
   assert.ok(old.temp>2000,JSON.stringify(old));
   console.log('CREATION_EVENT_PAGE_BASELINE='+JSON.stringify(old));
   for(const page of [1,2,deep,2001,3000]){
    const expected=(await tx.query(previousSql,[root,evidencePageSize,(page-1)*evidencePageSize])).rows;
    assert.equal(expected.length,page===2001?8:page>2001?0:24);
    assert.ok(expected.every(row=>!row.id.startsWith('foreign')));
    const adminRead=await read(page),enterpriseRead=await read(page,true);
    assert.equal(adminRead.status,200);assert.equal(enterpriseRead.status,200);
    const aBody=await adminRead.json(),eBody=await enterpriseRead.json(),a=aBody.items,e=eBody.items;
    assert.equal(aBody.pagination,undefined);assert.equal(eBody.pagination,undefined);
    assert.deepEqual(a,expected.map(row=>({id:row.id,eventKey:row.event_key,type:row.type,status:row.status,summary:row.summary,
     occurredAt:row.occurred_at.toISOString(),observedAt:row.observed_at.toISOString()})));
    assert.deepEqual(e,a.map((item:Record<string,unknown>)=>({...item,eventKey:item.type,summary:'执行状态更新'})));
    if(!baseline)for(const tenant of [false,true]){
     const res=await read(page,tenant,root,true),next=await res.json();
     assert.equal(res.status,200);assert.deepEqual(next.items,tenant?e:a);
     assert.deepEqual(next.pagination,{page,size:evidencePageSize,total:48008});
    }
   }
   if(!baseline){
    const {creationEventPageSql,creationEventPageWithTotalSql}=await import('../src/lib/saas/creation-detail-evidence');
    const now=await measure(creationEventPageSql,deep);
    assert.ok(now.temp*3<old.temp&&now.blocks<old.blocks,JSON.stringify({old,now}));
    const pageWithTotal=await measure(creationEventPageWithTotalSql,deep);
    assert.ok(pageWithTotal.temp*3<old.temp&&pageWithTotal.blocks<old.blocks,JSON.stringify({old,pageWithTotal}));
    console.log('CREATION_EVENT_PAGE=PASS '+JSON.stringify({old,now,pageWithTotal,order:'occurred_at,id',rows:48008}));
   }
  }finally{await tx.query('ROLLBACK');tx.release();}
  if(!baseline){
   await f.pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled)
    VALUES('event-linked-job',$1,'generate','{"status":"done"}','{}',false,true),
    ('event-unlinked-job',$1,'generate','{"status":"done"}','{}',false,true)`,[owner]);
   await f.pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email)
    VALUES($1,'image:generate','event-linked-job',$2)`,[root,owner]);
   const {legacyCreationId}=await import('../src/lib/saas/creation-history-identity');
   const legacy=(id:string)=>legacyCreationId({table:'app_image_jobs',id,email:owner});
   for(const tenant of [false,true]){
    const actual=await read(2,tenant,legacy('event-linked-job'),true),body=await actual.json();
    assert.equal(actual.status,200,JSON.stringify(body));
    const formal=await(await read(2,tenant,root,true)).json();assert.deepEqual(body.items,formal.items);assert.deepEqual(body.pagination,formal.pagination);
    const unlinked=await read(2,tenant,legacy('event-unlinked-job'),true),empty=await unlinked.json();
    assert.equal(unlinked.status,200,JSON.stringify(empty));assert.deepEqual(empty.items,[]);assert.deepEqual(empty.pagination,{page:2,size:24,total:0});
   }
   assert.equal((await read(2,true,root,true,randomUUID())).status,404);
   console.log('CREATION_EVENT_PAGE_COMPAT=PASS LEGACY_LINK=1 LEGACY_UNKNOWN=1 CROSS_TENANT=1');
  }
 }finally{await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
