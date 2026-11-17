import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

async function main(){
 const baseline=process.argv.includes('--baseline');
 const {validateHierarchy,enterpriseHeavyReportRead}=await import('../src/lib/enterprise/server');
 const roles=Array.from({length:102},(_,i)=>({id:'r'+(i+1),level:i+1,manage_members:true,view_records:true}));
 const chain=(depth:number)=>Array.from({length:depth},(_,i)=>({email:'n'+(i+1),role_id:'r'+(i+1),supervisor_email:i?'n'+i:'owner'}));
 for(const reversed of [false,true]){
  const order=<T>(nodes:T[])=>reversed?nodes.reverse():nodes;
  validateHierarchy('owner',order(chain(101)),roles);
  assert.throws(()=>validateHierarchy('owner',order(chain(102)),roles),/层级过深/);
 }
 assert.throws(()=>validateHierarchy('owner',[{email:'a',role_id:'r1',supervisor_email:'b'},{email:'b',role_id:'r2',supervisor_email:'a'}],roles),/循环/);
 assert.throws(()=>validateHierarchy('owner',[{email:'a',role_id:'r1',supervisor_email:'outside'}],roles),/上级不属于/);
 assert.throws(()=>validateHierarchy('owner',[{email:'a',role_id:'unknown',supervisor_email:'owner'}],roles),/岗位不属于/);
 assert.throws(()=>validateHierarchy('owner',[{email:'owner',role_id:null,supervisor_email:'outside'}],roles),/老板不能/);
 assert.throws(()=>validateHierarchy('owner',chain(2),roles.map(r=>({...r,manage_members:false}))),/上级必须/);
 let edges=0;
 const deep=[...Array.from({length:10_000},(_,i)=>({email:'leaf'+i,role_id:null,supervisor_email:'n90'})),...chain(90).reverse()]
  .map(({supervisor_email,...node})=>({...node,get supervisor_email(){edges++;return supervisor_email;}}));
 validateHierarchy('owner',deep,roles);
 assert.ok(baseline?edges>900_000:edges<=deep.length*5,'supervisor edge visits: '+edges);
 console.log('ENTERPRISE_SCOPE_EDGE_VISITS='+edges);
 if(!baseline){
  const {descendantScope}=await import('../src/lib/enterprise/hierarchy');
  const nodes=chain(4).reverse(),active=(node:{email:string})=>node.email!=='n3';
  const scope=descendantScope(nodes,'n1',true,true,active);
  assert.deepEqual([...scope.visible],['n1','n2']);
  assert.deepEqual([...scope.manageable],['n1','n2','n3','n4']);
  assert.deepEqual([...descendantScope(nodes,'n1',false,true,active).visible],['n1']);
  assert.deepEqual([...descendantScope(nodes,'n1',true,false,active).manageable],['n1']);
  assert.deepEqual([...descendantScope(nodes,'n1',false,false,active).manageable],['n1']);
  edges=0;
  const full=descendantScope(deep,'n1',true,true,()=>true);
  assert.equal(full.visible.size,deep.length);assert.equal(full.manageable.size,deep.length);
  assert.equal(edges,deep.length,'subtree indexing reads each edge once');
 }
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  const db=await import('../src/lib/db'),tenant=await import('../src/lib/saas/tenants');
  await tenant.ensureTenantSchema();
  const owner='owner@scope-fixture.test',manager='guide-1@scope-fixture.test',qty=10000,depth=90;
  await db.getOrCreateUser(owner,'Fixture owner');
  await f.pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]')",[owner]);
  const {tenantId}=await tenant.createTenant({email:'local-admin',admin:true,consoleAdmin:true},{commandId:randomUUID(),
   name:'Scale fixture',ownerEmail:owner,validUntil:null,seatLimit:null,entitlementName:null,featurePolicy:{team:true}});
  await f.pool.query(`INSERT INTO app_users(email,name,renews_at)
    SELECT 'guide-'||i||'@scope-fixture.test','Guide',now()+interval '1 year' FROM generate_series(1,$1::int) i
    UNION ALL SELECT 'leaf-'||i||'@scope-fixture.test','Leaf',now()+interval '1 year' FROM generate_series(1,$2::int) i
    UNION ALL SELECT 'other-'||i||'@scope-fixture.test','Other',now()+interval '1 year' FROM generate_series(1,200) i`,[depth,qty]);
  await f.pool.query(`INSERT INTO app_enterprise_roles(enterprise_id,id,name,level,manage_members,view_records)
    SELECT $1,md5('scope-role-'||i)::uuid,'Guide '||i,i,true,true FROM generate_series(1,$2::int) i`,[tenantId,depth]);
  await f.pool.query(`INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,role_id,employment)
    SELECT $1::uuid,'leaf-'||i||'@scope-fixture.test','guide-'||$2::int||'@scope-fixture.test',NULL::uuid,'permanent' FROM generate_series($3::int,1,-1) i
    UNION ALL SELECT $1,'guide-'||i||'@scope-fixture.test',CASE WHEN i=1 THEN $4 ELSE 'guide-'||(i-1)||'@scope-fixture.test' END,
     md5('scope-role-'||i)::uuid,'permanent' FROM generate_series($2,1,-1) i
    UNION ALL SELECT $1,'other-'||i||'@scope-fixture.test',$4,NULL::uuid,'permanent' FROM generate_series(1,200) i`,[tenantId,depth,qty,owner]);
  await f.pool.query('ANALYZE app_users; ANALYZE app_enterprise_members; ANALYZE app_enterprise_roles');
  const actor={email:manager,admin:false};
  const probe=async(visible:number)=>{
   const start=performance.now();let midpoint=0;
   const result=await enterpriseHeavyReportRead(actor,tenantId,async(_tx,s)=>{
    midpoint=performance.now();
    return {visible:s.visible.size,manageable:s.manageable.size,nodes:s.nodes.length,
     guideAt:s.nodes.findIndex(n=>n.email===manager),firstLeaf:s.nodes.findIndex(n=>n.email.startsWith('leaf-'))};
   });
   assert.deepEqual([result.visible,result.manageable,result.nodes],[visible,qty+depth,qty+depth+200]);
   return {...result,snapshotMs:Math.round(midpoint-start),reauthorizeMs:Math.round(performance.now()-midpoint)};
  };
  console.log('ENTERPRISE_SCOPE_SCALE_OPEN='+JSON.stringify(await probe(qty+depth)));
  console.log('ENTERPRISE_SCOPE_SCALE_REPEAT='+JSON.stringify(await probe(qty+depth)));
  await f.pool.query("UPDATE app_enterprise_members SET membership_status='suspended',version=version+1 WHERE email='guide-45@scope-fixture.test'");
  console.log('ENTERPRISE_SCOPE_SCALE_PAUSED='+JSON.stringify(await probe(44)));
  await f.pool.query("UPDATE app_enterprise_members SET membership_status='active',version=version+1 WHERE email='guide-45@scope-fixture.test'");
  await assert.rejects(enterpriseHeavyReportRead(actor,tenantId,async(_tx,s)=>{
   assert.equal(s.visible.size,qty+depth);
   await f.pool.query("UPDATE app_enterprise_members SET supervisor_email='guide-89@scope-fixture.test',version=version+1 WHERE email='leaf-1@scope-fixture.test'");
   return 'stale snapshot';
  }),{status:409});
  await assert.rejects(enterpriseHeavyReportRead(actor,tenantId,async(_tx,s)=>{
   assert.equal(s.visible.size,qty+depth);
   await f.pool.query("UPDATE app_enterprise_roles SET view_records=false,version=version+1 WHERE enterprise_id=$1 AND level=1",[tenantId]);
   return 'stale snapshot';
  }),{status:403});
  console.log(baseline?'ENTERPRISE_SCOPE_SCALE_BASELINE=PASS':'ENTERPRISE_SCOPE_SCALE=PASS LIVE_REVOKE=403 SAME_COUNT_CHANGE=409 REAL_PG=1');
 }finally{await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
