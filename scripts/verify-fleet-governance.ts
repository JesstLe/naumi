import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
  Object.assign(process.env,{FLEET_CONTROL_ENABLED:'1',FLEET_ISOLATED_TEST:'1',NAUMI_MULTI_USER:'1',NAUMI_VIDEO_WORKER:'0',SETTINGS_SECRET:'fleet-governance-fixture-012345678901234567890',VIDEO_WORKER_SECRET:'fleet-governance-worker-012345678901234567890'});
  const db=await import('../src/lib/db'),fleet=await import('../src/lib/fleet/server'),releases=await import('../src/lib/fleet/releases'),api=await import('../src/app/api/admin/fleet/route'),releaseAPI=await import('../src/app/api/admin/fleet/releases/route'),native=await import('../src/lib/native-auth'),auth=await import('../src/lib/admin-auth');
  const pool=db.getPool();await fleet.ensureFleetSchema();await releases.ensureFleetReleaseSchema();for(const email of ['root@fleet.test','op@fleet.test','other@fleet.test'])await db.getOrCreateUser(email);await db.setUserRole('root@fleet.test','admin');await auth.setAdminPassword('fleet-governance-password');const rootCookie='nv_admin='+await auth.authenticateAdminPassword('fleet-governance-password');
  const req=(body?:unknown,email='root@fleet.test',url='/api/admin/fleet')=>new Request('http://localhost'+url,{method:body?'POST':'GET',headers:{'content-type':'application/json',cookie:'nv_user='+native.signUserSession(email,Date.now())+(email==='root@fleet.test'?'; '+rootCookie:'')},...(body?{body:JSON.stringify(body)}:{})});
  const root={actor:'root@fleet.test',root:true},op={actor:'op@fleet.test',root:false};
  const mainSite=await fleet.createInstance(root.actor,'103主站fixture','main'),enterprise=await fleet.createInstance(root.actor,'47企业fixture','enterprise'),other=await fleet.createInstance(root.actor,'其他企业fixture','enterprise');
  const source='1'.repeat(40),version=123456;
  const row=(flavor:string,digit:string)=>({reference:'ghcr.io/jesstle/naumi@sha256:'+digit.repeat(64),digest:'sha256:'+digit.repeat(64),tag:'ghcr.io/jesstle/naumi:'+source+(flavor==='ui'?'':'-'+flavor),imageId:'sha256:'+'f'.repeat(64)});
  const manifest={schemaVersion:1 as const,sourceCommit:source,buildVersion:version,platform:'linux/amd64' as const,mediaVariants:true as const,provenance:{repository:'JesstLe/naumi' as const,workflowCommit:'2'.repeat(40),runId:'42',attempt:'1'},images:{ui:row('ui','a'),desktop:row('desktop','b'),enterprise:row('enterprise','c')}};
  const registration={action:'release-register' as const,id:randomUUID(),sourceInstanceId:mainSite.id,manifest,evidenceSha256:'9'.repeat(64)};
  try{
    assert.equal((await api.GET(req(undefined,'op@fleet.test'))).status,403);
    assert.equal((await api.POST(req({action:'grant',instanceId:enterprise.id,email:op.actor,allowed:['read','credits','release'],expectedVersion:0,expiresAt:null}))).status,200);
    const limited=await api.GET(req(undefined,op.actor));assert.equal(limited.status,200);const snap=await limited.json();assert.equal(snap.root,false);assert.deepEqual(snap.instances.map((i:{id:string})=>i.id),[enterprise.id]);assert.equal(snap.grants.length,0);assert.ok(!JSON.stringify(snap).includes(other.id));
    assert.equal((await api.POST(req({action:'rotate',instanceId:enterprise.id},op.actor))).status,403);
    const query={type:'users.list' as const,search:'',page:1};assert.equal((await api.POST(req({action:'command',instanceId:other.id,id:randomUUID(),operation:query},op.actor))).status,403);
    assert.equal((await api.POST(req({action:'command',instanceId:enterprise.id,id:randomUUID(),operation:{type:'features.set',email:'x@y.test',mode:'custom',allowed:['canvas'],expectedVersion:0}},op.actor))).status,403);
    const queued=randomUUID();assert.equal((await api.POST(req({action:'command',instanceId:enterprise.id,id:queued,operation:{type:'credits.adjust',email:'x@y.test',delta:10,reason:'fixture'}},op.actor))).status,202);
    await fleet.saveGrant(root.actor,{instanceId:enterprise.id,email:op.actor,allowed:[],expectedVersion:1,expiresAt:null});
    const poll=()=>new Request('http://localhost/api/fleet/poll',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+enterprise.token,'x-naumi-instance':enterprise.id},body:JSON.stringify({nonce:randomUUID(),timestamp:Date.now(),status:{source:'0'.repeat(40),version:'1',storage:'s3',nas:'unknown',connector:1}})});
    assert.equal((await fleet.connectorExchange(poll()) as {command:unknown}).command,null);assert.equal((await pool.query('SELECT state FROM app_fleet_commands WHERE id=$1',[queued])).rows[0].state,'failed');assert.equal((await api.GET(req(undefined,op.actor))).status,403);
    await fleet.saveGrant(root.actor,{instanceId:enterprise.id,email:op.actor,allowed:['read','release'],expectedVersion:2,expiresAt:null});
    const leasedId=randomUUID();await fleet.enqueueCommand(op.actor,enterprise.id,leasedId,query,op);
    const leased=await fleet.connectorExchange(poll()) as {command:{payload:string};leaseId:string};assert.equal(JSON.parse(leased.command.payload).id,leasedId);
    await fleet.saveGrant(root.actor,{instanceId:enterprise.id,email:op.actor,allowed:[],expectedVersion:3,expiresAt:null});
    await pool.query("UPDATE app_fleet_commands SET leased_until=now()-interval '1 second' WHERE id=$1",[leasedId]);assert.equal((await fleet.connectorExchange(poll()) as {command:unknown}).command,null);assert.equal((await pool.query('SELECT state FROM app_fleet_commands WHERE id=$1',[leasedId])).rows[0].state,'blocked');
    // A released command may have run before revocation: retain uncertainty and accept its authentic result.
    const ack=new Request('http://localhost/api/fleet/ack',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+enterprise.token,'x-naumi-instance':enterprise.id},body:JSON.stringify({nonce:randomUUID(),timestamp:Date.now(),commandId:leasedId,leaseId:leased.leaseId,result:{status:'succeeded',data:{users:[],total:0,page:1}}})});assert.equal((await fleet.connectorExchange(ack,true) as {ok:boolean}).ok,true);
    await fleet.saveGrant(root.actor,{instanceId:enterprise.id,email:op.actor,allowed:['read','release'],expectedVersion:4,expiresAt:null});
    await pool.query("UPDATE app_fleet_grants SET expires_at=now()-interval '1 second' WHERE instance_id=$1 AND email=$2",[enterprise.id,op.actor]);assert.equal((await api.GET(req(undefined,op.actor))).status,403);await pool.query('UPDATE app_fleet_grants SET expires_at=NULL WHERE instance_id=$1 AND email=$2',[enterprise.id,op.actor]);
    await assert.rejects(()=>fleet.saveGrant(root.actor,{instanceId:enterprise.id,email:op.actor,allowed:['read'],expectedVersion:1,expiresAt:null}));
    assert.equal((await releaseAPI.POST(req(registration,op.actor,'/api/admin/fleet/releases'))).status,403);
    assert.equal((await releaseAPI.POST(req(registration,root.actor,'/api/admin/fleet/releases'))).status,409);
    const now=new Date('2026-10-15T12:00:00.000Z');
    await pool.query('UPDATE app_fleet_instances SET last_seen=$2,status=$3 WHERE id=$1',[mainSite.id,new Date(),JSON.stringify({source,version:String(version),storage:'r2',nas:'unknown',connector:1})]);
    assert.equal((await releaseAPI.POST(req({...registration,manifest:{...manifest,sourceCommit:'3'.repeat(40)}},root.actor,'/api/admin/fleet/releases'))).status,400);
    assert.equal((await releaseAPI.POST(req(registration,root.actor,'/api/admin/fleet/releases'))).status,201);assert.equal((await releases.registerRelease(root.actor,registration)).replayed,true);await assert.rejects(()=>releases.registerRelease(root.actor,{...registration,evidenceSha256:'8'.repeat(64)}));
    await releases.saveReleasePolicy(op,{action:'release-policy',instanceId:enterprise.id,sourceInstanceId:mainSite.id,enabled:true,expectedVersion:0});
    assert.equal((await releases.planNightlyReleases(new Date('2026-10-15T11:59:59Z'))).reason,'before-window');
    await pool.query('UPDATE app_fleet_instances SET last_seen=$2 WHERE id=$1',[mainSite.id,now]);
    const [first,second]=await Promise.all([releases.planNightlyReleases(now),releases.planNightlyReleases(now)]);assert.equal(first.created+second.created,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_fleet_release_plans')).rows[0].n,1);
    const snapshot=await releases.releaseSnapshot(op);assert.equal(snapshot.plans.length,1);assert.equal(snapshot.releases.length,0);const plan=snapshot.plans[0];assert.equal(plan.manifest.sourceCommit,source);assert.equal(String(plan.base_source),'0'.repeat(40));assert.equal(snapshot.executorEnabled,false);
    await releases.reviewReleasePlan(op,{action:'release-plan-review',planId:plan.id,decision:'hold',expectedVersion:0});await assert.rejects(()=>releases.reviewReleasePlan(op,{action:'release-plan-review',planId:plan.id,decision:'resume',expectedVersion:0}));
    assert.equal((await releases.releaseSnapshot({actor:'other@fleet.test',root:false})).plans.length,0);
    // Same source/version is a no-op on the next day, not a repeated deployment.
    const next=new Date('2026-10-16T12:00:00Z');await pool.query('UPDATE app_fleet_instances SET last_seen=$2 WHERE id=$1',[mainSite.id,next]);await pool.query('UPDATE app_fleet_instances SET status=$2 WHERE id=$1',[enterprise.id,JSON.stringify({source,version:String(version)})]);assert.equal((await releases.planNightlyReleases(next)).created,0);
    // A rollback/unaccepted runtime is never selected just because it is newest in Git.
    const after=new Date('2026-10-17T12:00:00Z');await pool.query('UPDATE app_fleet_instances SET last_seen=$2,status=$3 WHERE id=$1',[mainSite.id,after,JSON.stringify({source:'4'.repeat(40),version:'999'})]);assert.equal((await releases.planNightlyReleases(after)).created,0);
    await pool.query('UPDATE app_fleet_instances SET last_seen=$2 WHERE id=$1',[mainSite.id,new Date('2026-10-17T11:00:00Z')]);assert.equal((await releases.planNightlyReleases(after)).created,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_fleet_commands')).rows[0].n,2); // planner did not enqueue deploy commands
    console.log('FLEET_GOVERNANCE=PASS INSTANCE_SCOPE=1 ROOT_ONLY_SECRETS=1 GRANT_CAS=1 REVOCATION_BEFORE_DISPATCH=1 RELEASE_SOURCE_ACTUAL=1 FROZEN_MANIFEST=1 SHANGHAI_20=1 CONCURRENT_ONCE=1 SAME_VERSION_NOOP=1 UNACCEPTED_SKIP=1 STALE_SKIP=1 PLAN_REVIEW_CAS=1 AUTO_DEPLOY=0 PRODUCTION_WRITES=0');
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
