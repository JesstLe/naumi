import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const baseline=process.argv.includes('--baseline');
const window={from:'2026-11-02',to:'2026-11-08',start:'2026-11-01T16:00:00Z',end:'2026-11-08T16:00:00Z'};
const oldSql=`SELECT tenant_id,count(*) FILTER(WHERE accepted_at>=$2 AND accepted_at<$3)::int AS n,max(accepted_at) AS last
 FROM app_creation_records WHERE scope_kind='tenant' AND parent_id IS NULL AND tenant_id=ANY($1::uuid[]) GROUP BY tenant_id`;

async function main(){
 Object.assign(process.env,{SETTINGS_SECRET:'fixture-platform-activity-0123456789abcdef01234567',NAUMI_MULTI_USER:'1',PGPOOL_MAX:'5'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  const db=await import('../src/lib/db'),tenant=await import('../src/lib/saas/tenants');
  const list=await import('../src/app/api/admin/tenants/route'),overview=await import('../src/app/api/admin/saas-overview/route');
  const {signUserSession}=await import('../src/lib/native-auth');
  await tenant.ensureTenantSchema();
  const admin='admin@tenant-activity.test';
  await db.getOrCreateUser(admin,'admin');await db.setUserRole(admin,'admin');
  async function make(label:string){
   const ownerEmail=label.toLowerCase().replaceAll(' ','-')+'@tenant-activity.test';
   await db.getOrCreateUser(ownerEmail,label);
   const {tenantId}=await tenant.createTenant({email:admin,admin:true,consoleAdmin:true},
    {name:label,ownerEmail,commandId:randomUUID(),seatLimit:null,validUntil:null,entitlementName:null,featurePolicy:{}});
   return tenantId;
  }
  const alpha=await make('Activity Alpha'),beta=await make('Activity Beta'),empty=await make('Activity Empty');
  const req=(path:string,query='',email=admin)=>new Request('http://localhost'+path+'?from='+window.from+'&to='+window.to+(query?'&'+query:''),{
   headers:{cookie:'nv_user='+signUserSession(email,Date.now())}
  });
  const readList=(q='')=>list.GET(req('/api/admin/tenants','sort=name&'+q));
  const without=await (await readList()).json();
  assert.equal(without.items.length,3);
  assert.ok(without.items.every((item:{creationCount:null;lastActivityAt:null})=>item.creationCount===null&&item.lastActivityAt===null));
  await (await import('../src/lib/saas/creation-schema')).ensureCreationSchema();
  await f.pool.query(`INSERT INTO app_creation_records
    (id,actor_email,scope_kind,tenant_id,source_kind,source_id,accepted_at,request_snapshot)
   SELECT 'history-'||k,$3,'tenant',CASE WHEN k%2=0 THEN $1::uuid ELSE $2::uuid END,
    'fixture','history-'||k,'2023-01-01'::timestamptz+k*interval '3 minutes',jsonb_build_object('text',repeat(md5(k::text),8))
   FROM generate_series(1,160000) k`,[alpha,beta,admin]);
  await f.pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,accepted_at,status)
   VALUES ('begin',$3,'tenant',$1,'fixture','begin','2026-11-01T16:00Z','succeeded'),
    ('inside',$3,'tenant',$1,'fixture','inside','2026-11-08T15:59:59.999999Z','failed'),
    ('end',$3,'tenant',$1,'fixture','end','2026-11-08T16:00Z','queued'),
    ('personal',$3,'personal',NULL,'fixture','personal','2026-11-01T16:00Z','needs_review'),
    ('later-beta',$3,'tenant',$2,'fixture','later-beta','2026-11-15T16:00Z','queued')`,[alpha,beta,admin]);
  await f.pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,accepted_at)
   SELECT 'child',$2,'tenant',$1::uuid,'fixture','child','end','2026-11-06T00:00Z'::timestamptz
   UNION ALL SELECT 'newer-child',$2,'tenant',$1::uuid,'fixture','newer-child','end','2027-01-01T00:00Z'::timestamptz`,[alpha,admin]);
  await f.pool.query('ANALYZE app_creation_records');
  const expected=[
   {tenantId:alpha,creationCount:2,lastActivityAt:'2026-11-08T16:00:00.000Z'},
   {tenantId:beta,creationCount:0,lastActivityAt:'2026-11-15T16:00:00.000Z'},
   {tenantId:empty,creationCount:0,lastActivityAt:null},
  ];
  const fields=({tenantId,creationCount,lastActivityAt}:typeof expected[number])=>({tenantId,creationCount,lastActivityAt});
  const response=await readList(),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.total,3);
  assert.deepEqual(body.items.map(fields),expected);
  const page=await(await readList('size=1&page=2')).json();assert.deepEqual(page.items.map(fields),[expected[1]]);
  assert.equal((await list.GET(req('/api/admin/tenants','','activity-alpha@tenant-activity.test'))).status,403);
  const sums=await(await overview.GET(req('/api/admin/saas-overview','q=Activity%20Alpha'))).json();
  assert.deepEqual(sums.tenants.items.map(fields),[expected[0]]);
  assert.deepEqual(sums.metrics,{tenants:3,expiring:0,activeTenants:1,creations:3,needsReview:1,failed:1});
  assert.equal(sums.trend.at(0).count,2);assert.equal(sums.trend.at(-1).count,1);
  const args=[[alpha,beta,empty],window.start,window.end];
  const explain=async(sql:string)=>{
   const plan=(await f.pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,args)).rows[0]['QUERY PLAN'][0];
   const scans:{rows:number;removed:number;loops:number;index:string|null;condition:string|null}[]=[];
   const visit=(n:Record<string,any>)=>{if(n['Relation Name']==='app_creation_records')scans.push({
    rows:n['Actual Rows'],removed:n['Rows Removed by Filter']??0,loops:n['Actual Loops'],index:n['Index Name']??null,condition:n['Index Cond']??null,
   });for(const p of n.Plans??[])visit(p);};
   visit(plan.Plan);
   return {scans,ms:plan['Execution Time'],blocks:(plan.Plan['Shared Hit Blocks']??0)+(plan.Plan['Shared Read Blocks']??0)};
  };
  const old=await explain(oldSql);
  assert.ok(old.scans.some(s=>(s.rows+s.removed)*s.loops>=160000));
  console.log('PLATFORM_TENANT_ACTIVITY_BASELINE='+JSON.stringify(old));
  if(!baseline){
   const {tenantPageActivitySql}=await import('../src/lib/saas/tenant-activity');
   const now=await explain(tenantPageActivitySql);
   assert.equal(now.scans.length,2);
   assert.ok(now.scans.every(s=>s.index==='app_creation_tenant_time'));
   assert.equal(now.scans.filter(s=>s.condition?.includes('accepted_at')).length,1);
   assert.ok(now.blocks*10<old.blocks,JSON.stringify({old,now}));
   console.log('PLATFORM_TENANT_ACTIVITY=PASS '+JSON.stringify({now}));
  }
 }finally{await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
