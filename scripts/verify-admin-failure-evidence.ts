import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const baseline=process.argv.includes('--baseline'),database='admin_failure_fixture_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE DATABASE ${database}`);
 url.pathname='/'+database;process.env.DATABASE_URL=url.toString();process.env.NAUMI_RELEASE_RUNTIME='0';
 process.env.SETTINGS_SECRET='admin-failure-fixture-settings-secret-only';process.env.NATIVE_SESSION_SECRET='admin-failure-fixture-session-secret-only';
 let pool:Pool|undefined;let checks=0;
 const check=(name:string,run:()=>unknown)=>{run();checks++;console.log('PASS '+name);};
 try{
  const db=await import('../src/lib/db'),schema=await import('../src/lib/saas/creation-schema'),tenants=await import('../src/lib/saas/tenants');
  await tenants.ensureTenantSchema();await schema.ensureCreationSchema();pool=db.getPool();
  const bi=await import('../src/lib/bi/repository');await bi.ensureBiSchema();
  const supplier=await import('../src/lib/supplier-cost/schema');await supplier.ensureSupplierSchema(pool);
  const owner='owner@admin-failure.fixture',other='foreign@admin-failure.fixture',adminEmail='admin@admin-failure.fixture';
  for(const email of [owner,other,adminEmail])await db.getOrCreateUser(email,email);
  await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[adminEmail]);
  const tenant=await tenants.createTenant({email:adminEmail,admin:true,consoleAdmin:true},{commandId:randomUUID(),name:'Failure fixture',ownerEmail:owner,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:false}});
  const foreignTenant=await tenants.createTenant({email:adminEmail,admin:true,consoleAdmin:true},{commandId:randomUUID(),name:'Foreign fixture',ownerEmail:other,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:false}});
  const root=`cr-${randomUUID()}`,child=`cr-${randomUUID()}`,foreign=`cr-${randomUUID()}`;
  const job='fixture-parent',childJob='fixture-child',foreignJob='fixture-foreign-child';
  await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'imagegen',$3::jsonb,'{}',false),($4,$2,'generate',$5::jsonb,'{}',false),($6,$7,'generate',$5::jsonb,'{}',false)",[
   job,owner,JSON.stringify({status:'error',result:{status:'failed',error:{code:'EXECUTION_FAILED',message:'DO_NOT_EXPOSE_PROMPT'}},children:{a:{jobId:childJob},foreign:{jobId:foreignJob}}}),
   childJob,JSON.stringify({status:'error',failureCode:'image-result-unavailable',error:'DO_NOT_EXPOSE_TOKEN'}),foreignJob,other]);
  for(const [id,parent,email,tenantId,sourceId,kind] of [[root,null,owner,tenant.tenantId,job,'image:imagegen'],[child,root,owner,tenant.tenantId,childJob,'image:generate'],[foreign,root,other,foreignTenant.tenantId,foreignJob,'image:generate']]){
   await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,status,request_snapshot) VALUES($1,$2,'tenant',$3,$4,$5,$6,'failed','{}')",[id,email,tenantId,kind,sourceId,parent]);
   await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,$2,$3,$4)",[id,kind,sourceId,email]);
  }
  await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,charged_credits,reserved_credits,ledger_id) VALUES($1,$2,'image','{}','fixture','released',0,0,$3)",[childJob,owner,'fixture-ledger']);
  await pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,'billing',$2,$3)",[child,childJob,owner]);
  await pool.query("INSERT INTO app_supplier_accounts(id,provider_id,protocol,base_url,label) VALUES('fixture-account','fixture-provider','fixture','https://fixture.invalid','Fixture supplier')");
  const call=async(id:string,email:string,evidence:object,state='unknown',delivered:number|null=null,time='2026-10-26T01:00:00Z')=>{
   const callId=randomUUID();await pool!.query("INSERT INTO app_supplier_calls(id,operation_id,user_email,feature,attempt_id,account_id,provider_id,model,phase,state,cost_status,evidence,delivered,started_at) VALUES($1::uuid,$2,$3,'image',$1::text,'fixture-account','fixture-provider','fixture-image','edit',$4,'pending',$5::jsonb,$6,$7)",[callId,id,email,state,JSON.stringify(evidence),delivered,time]);return callId;
  };
  const firstCall=await call(childJob,owner,{source:'transport-unknown',transportCode:'ECONNRESET',failureCategory:'transport',apiKey:'DO_NOT_EXPOSE_SECRET',message:'DO_NOT_EXPOSE_BODY',url:'https://secret.invalid?token=secret'});
  await call(foreignJob,other,{failureCategory:'quota',httpStatus:403},'rejected',null,'2026-10-26T01:30:00Z');
  // Same operation identifier with a different owner must never override the receipt.
  await call(childJob,other,{failureCategory:'quota',httpStatus:403},'rejected',null,'2026-10-26T02:00:00Z');
  const newList=await import('../src/lib/saas/creations'),legacy=await import('../src/lib/saas/legacy-creations'),contracts=await import('../src/lib/saas/creation-contracts');
  const adminRoute=await import('../src/app/api/admin/creations/route'),detailRoute=await import('../src/app/api/admin/creations/[id]/route'),enterpriseRoute=await import('../src/app/api/enterprise/creations/route'),enterpriseDetail=await import('../src/app/api/enterprise/creations/[id]/route'),native=await import('../src/lib/native-auth');
  const request=(path:string,email?:string)=>new Request('http://fixture.test'+path,{headers:email?{cookie:`nv_user=${native.signUserSession(email,Date.now())}`}:{}});
  const get=async(path:string,email=adminEmail)=>{const response=await adminRoute.GET(request(path,email));assert.equal(response.status,200);return response.json();};
  const detail=async(id:string)=>{const response=await detailRoute.GET(request('/api/admin/creations/'+id,adminEmail),{params:Promise.resolve({id})});assert.equal(response.status,200);return response.json();};
  const filter=contracts.creationFiltersSchema.parse({source:'legacy',period:'all',user:owner,size:100});
  const legacyId=legacy.legacyCreationId({table:'app_image_jobs',id:job,email:owner});
  const before=async()=>createHash('sha256').update(JSON.stringify((await pool!.query("SELECT (SELECT jsonb_agg(j ORDER BY id) FROM app_image_jobs j) AS jobs,(SELECT jsonb_agg(s ORDER BY id) FROM app_supplier_calls s) AS suppliers,(SELECT jsonb_agg(b ORDER BY id) FROM app_billing_operations b) AS billing,(SELECT jsonb_agg(l ORDER BY id) FROM app_ledger l) AS ledger")).rows)).digest('hex');
  const hashBefore=await before();
  const a=await get('/api/admin/creations'),b=await detail(root),c=await legacy.listLegacyCreations(filter),d=(await legacy.legacyCreationDetail(legacyId)).detail;
  if(baseline){
   for(const row of [a.items.find((x:any)=>x.id===root),b,c.items.find(x=>x.id===legacyId),d])assert.equal(row.failure,undefined);
   assert.equal(await before(),hashBefore);
   console.log('BASELINE=REPRODUCED ADMIN_REASON_ABSENT=4 SOURCE_FAILURE_EVIDENCE_PRESENT=1 SUPPLIER_POSTS=0');return;
  }
  for(const [name,row] of [['new-list',a.items.find((x:any)=>x.id===root)],['new-detail',b],['legacy-list',c.items.find(x=>x.id===legacyId)],['legacy-detail',d]] as const){
   const f=row!.failure;check(name+' exact child transport reason',()=>{assert.equal(f?.code,'ECONNRESET');assert.equal(f?.evidence,'supplier_receipt');assert.equal(f?.title,'供应调用连接被重置');assert.equal(f?.customerBilling?.charged,0);assert.equal(f?.customerBilling?.reserved,0);assert.equal(f?.customerBilling?.state,'released');assert.equal(f?.supplier?.costStatus,'pending');assert.equal(f?.supplier?.state,'unknown');assert.doesNotMatch(JSON.stringify(f),/DO_NOT_EXPOSE|secret.invalid|apiKey|requestBody|foreign/);});
  }
  const hashAfter=await before();check('read only business facts unchanged',()=>assert.equal(hashAfter,hashBefore));
  check('root request not doubled by child',()=>{assert.equal(a.pagination.total,1);assert.equal(a.items.length,1);assert.equal(b.childPagination.total,1);});
  const ep=await(await enterpriseRoute.GET(request(`/api/enterprise/creations?tenantId=${tenant.tenantId}`,owner))).json();
  const ed=await(await enterpriseDetail.GET(request(`/api/enterprise/creations/${root}?tenantId=${tenant.tenantId}`,owner),{params:Promise.resolve({id:root})})).json();
  check('enterprise projection excludes admin-only diagnostics',()=>{assert.equal(ep.items[0].failure,undefined);assert.equal(ed.failure,undefined);assert.doesNotMatch(JSON.stringify(ep)+JSON.stringify(ed),/ECONNRESET|fixture-provider|fixture-image|transportCode/);});
  for(const email of [undefined,owner]){const r=await adminRoute.GET(request('/api/admin/creations',email));check('admin auth '+String(email),()=>assert.ok([401,403].includes(r.status)));}
  const diagnostic=await import('../src/lib/saas/creation-failures');
  const input:any={call_id:'fixture',call_state:'unknown',cost_status:'pending',failure_category:'transport',transport_code:'ECONNRESET',updated_at:new Date().toISOString()};
  for(const [category,title] of Object.entries({quota:'额度',credential:'鉴权','model-permission':'权限','content-policy':'审核','rate-limit':'限流','authorization-or-edge':'访问被拒绝','upstream-unavailable':'服务异常','upstream-rejected':'拒绝请求'}))check('category '+category,()=>assert.match(diagnostic.creationFailureFromRow({...input,transport_code:null,failure_category:category,http_status:403}).title,new RegExp(title)));
  check('403 without quota proof is not quota',()=>assert.doesNotMatch(diagnostic.creationFailureFromRow({...input,transport_code:null,failure_category:null,http_status:403}).title,/额度|余额/));
  check('timeout is explicit',()=>assert.equal(diagnostic.creationFailureFromRow({...input,transport_code:'ETIMEDOUT'}).title,'供应调用超时'));
  check('same call later success overrides retained transport tags',()=>{const f=diagnostic.creationFailureFromRow({...input,http_status:200,call_state:'response-received',delivered:1});assert.match(f.title,/供应响应已有输出/);assert.equal(f.code,null);});
  check('exact postaccept download failure is not generation transport failure',()=>{const f=diagnostic.creationFailureFromRow({...input,http_status:200,call_state:'response-received',delivered:1,transport_code:null,failure_category:null,post_stage:'download-image',post_causes:[{code:'ECONNRESET'}]});assert.equal(f.title,'原结果图片下载连接被重置');assert.equal(f.stage,'下载原结果图片');assert.equal(f.code,'ECONNRESET');});
  check('unknown fields are not invented zero',()=>{const f=diagnostic.creationFailureFromRow({});assert.equal(f.customerBilling,null);assert.equal(f.supplier,null);assert.equal(f.code,null);});
  check('untrusted field text never becomes diagnostic',()=>{const f=diagnostic.creationFailureFromRow({...input,transport_code:'sk-DO_NOT_EXPOSE',provider_id:'https://secret.invalid',model:'Bearer\nDO_NOT_EXPOSE',failure_category:'DO_NOT_EXPOSE',failure_code:'DO_NOT_EXPOSE'});assert.doesNotMatch(JSON.stringify(f),/DO_NOT_EXPOSE|secret.invalid/);});
  check('present billing null values remain null',()=>{const f=diagnostic.creationFailureFromRow({billing_state:'hold',charged_credits:null,reserved_credits:null});assert.equal(f.customerBilling?.charged,null);assert.equal(f.customerBilling?.reserved,null);});
  const later=await call(childJob,owner,{httpStatus:200},'response-received',1,'2026-10-26T03:00:00Z');
  const delivered=await detail(root);check('latest response does not reuse older reset',()=>{assert.equal(delivered.failure.code,null);assert.match(delivered.failure.title,/供应响应已有输出/);assert.doesNotMatch(delivered.failure.title,/连接|额度/);});
  await pool.query('DELETE FROM app_supplier_calls WHERE id=$1',[later]);
  await pool.query('DELETE FROM app_supplier_calls WHERE id=$1',[firstCall]);
  const noReceipt=await detail(root);check('other owner or tenant receipt excluded',()=>{assert.notEqual(noReceipt.failure.code,'ECONNRESET');assert.equal(noReceipt.failure.supplier,null);assert.doesNotMatch(noReceipt.failure.title,/额度/);});
  await pool.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{status}','\"done\"') WHERE id=$1",[childJob]);
  await call(childJob,owner,{failureCategory:'quota',httpStatus:403});
  const successChild=await detail(root);check('successful child old error not assigned to failed parent',()=>assert.equal(successChild.failure.supplier,null));
  await pool.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{result,status}','\"succeeded\"') WHERE id=$1",[job]);
  const success=await detail(root);check('successful record has no failure panel',()=>assert.equal(success.failure,undefined));
  const changed=await get('/api/admin/creations?status=succeeded');check('status filter and pagination unchanged',()=>{assert.equal(changed.pagination.total,1);assert.equal(changed.items[0].failure,undefined);});
  const noMatch=await get('/api/admin/creations?user=none%40fixture.test');check('empty selected page stays empty',()=>assert.equal(noMatch.items.length,0));
  await pool.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{result,status}','\"failed\"') WHERE id=$1",[job]);
  await pool.query('ALTER TABLE app_supplier_calls RENAME TO fixture_hidden_supplier_calls');
  try{const missing=await detail(root);check('missing optional supplier schema does not invent a cause',()=>{assert.equal(missing.failure.supplier,null);assert.notEqual(missing.failure.evidence,'supplier_receipt');});}finally{await pool.query('ALTER TABLE fixture_hidden_supplier_calls RENAME TO app_supplier_calls');}
  await assert.rejects(diagnostic.creationFailures(pool,Array.from({length:101},()=>({id:root,email:owner}))),/FAILURE_PAGE_LIMIT/);checks++;
  const foreignProjection=await diagnostic.creationFailures(pool,[{id:root,email:other}]);check('exact root owner required',()=>assert.equal(foreignProjection.get(root)?.evidence,'not_recorded'));
  // A malicious/old cross-tenant child with the SAME owner is also excluded.
  const sameOwnerForeign=`cr-${randomUUID()}`,sameOwnerJob='same-owner-foreign-tenant';
  await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id,status) VALUES($1,$2,'tenant',$3,'image:generate',$4,$5,'failed')",[sameOwnerForeign,owner,foreignTenant.tenantId,sameOwnerJob,root]);
  await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'generate','{\"status\":\"error\"}','{}',false)",[sameOwnerJob,owner]);
  await call(sameOwnerJob,owner,{failureCategory:'quota',httpStatus:403});
  const isolated=await diagnostic.creationFailures(pool,[{id:root,email:owner}]);check('same owner foreign tenant child excluded',()=>assert.equal(isolated.get(root)?.supplier,null));
  // Fixed selected page only: unrelated errors must not add a list row.
  const page=await get('/api/admin/creations?size=1');check('diagnostic enrichment preserves exact page size',()=>assert.equal(page.items.length,1));
  const deep=Array.from({length:10},(_,i)=>'deep-'+i);
  for(let i=0;i<deep.length;i++)await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES($1,$2,'generate',$3::jsonb,'{}',false)",[deep[i],owner,JSON.stringify({status:'error',children:i+1<deep.length?{next:{jobId:deep[i+1]}}:{}})]);
  const clipped=await diagnostic.legacyCreationFailures(pool,[{root:'deep-root',table_name:'app_image_jobs',id:deep[0],email:owner}]);check('depth boundary is explicitly incomplete',()=>{assert.equal(clipped.get('deep-root')?.incomplete,true);assert.equal(clipped.get('deep-root')?.supplier,null);});
  await pool.query("UPDATE app_image_jobs SET snapshot=jsonb_set(snapshot,'{children}',$2::jsonb) WHERE id=$1",[deep[0],JSON.stringify({self:{jobId:deep[0]}})]);
  const cycle=await diagnostic.legacyCreationFailures(pool,[{root:'cycle-root',table_name:'app_image_jobs',id:deep[0],email:owner}]);check('cycle terminates without another task cause',()=>assert.equal(cycle.get('cycle-root')?.supplier,null));
  await pool.query('ALTER TABLE app_supplier_calls RENAME COLUMN evidence TO fixture_hidden_evidence');
  try{
   const failed=await detailRoute.GET(request('/api/admin/creations/'+root,adminEmail),{params:Promise.resolve({id:root})});
   check('evidence query failure is 503 not a healthy result',()=>assert.equal(failed.status,503));
   await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,batch_id) VALUES('fixture-image',$1,'fixture','fixture','','/media/fixture.png','',$2)",[owner,job]);
   const media=(await legacy.legacyCreationDetail(legacyId,{diagnostics:false})).detail.assets[0];
   const read=await legacy.legacyCreationAsset(legacyId,media.id);check('optional diagnostics never break original media lookup',()=>assert.equal(read.url,'/media/fixture.png'));
  }finally{await pool.query('ALTER TABLE app_supplier_calls RENAME COLUMN fixture_hidden_evidence TO evidence');}
  console.log(`ADMIN_FAILURE_EVIDENCE=PASS CHECKS=${checks} REAL_PG=1 NEW_AND_LEGACY=1 ENTERPRISE_PRIVATE=1 SUPPLIER_POSTS=0 BUSINESS_READS_ONLY=1`);
 }finally{
  if(pool)await pool.end();await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);await admin.end();console.log('ISOLATED_DATABASE_CLEANUP=PASS');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
