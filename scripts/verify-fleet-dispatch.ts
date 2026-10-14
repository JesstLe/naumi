import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
async function main(){
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');Object.assign(process.env,{FLEET_CONTROL_ENABLED:'1',FLEET_ISOLATED_TEST:'1',SETTINGS_SECRET:'fleet-dispatch-fixture-012345678901234567890',VIDEO_WORKER_SECRET:'fleet-dispatch-worker-012345678901234567890'});
  const db=await import('../src/lib/db'),fleet=await import('../src/lib/fleet/server'),releases=await import('../src/lib/fleet/releases'),wire=await import('../src/lib/fleet/release-wire'),relay=await import('../src/lib/fleet/release-relay'),poll=await import('../src/app/api/fleet/releases/poll/route'),ack=await import('../src/app/api/fleet/releases/ack/route');
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');const privatePem=privateKey.export({format:'pem',type:'pkcs8'}).toString(),publicPem=publicKey.export({format:'pem',type:'spki'}).toString();process.env.FLEET_RELEASE_SIGNING_PRIVATE_KEY=privatePem;
  const keys=await import('../src/lib/fleet/release-keys');process.env.FLEET_RELEASE_SIGNING_PRIVATE_KEY_FILE=path.join(tmpdir(),'fleet-definitely-missing-key.pem');await assert.rejects(()=>keys.releaseSigningKey());delete process.env.FLEET_RELEASE_SIGNING_PRIVATE_KEY_FILE;
  const pool=db.getPool();await releases.ensureFleetReleaseSchema();const mainSite=await fleet.createInstance('fixture','103','main'),enterprise=await fleet.createInstance('fixture','47','enterprise'),other=await fleet.createInstance('fixture','other','enterprise');
  const source='1'.repeat(40),baseSource='0'.repeat(40),manifest={schemaVersion:1 as const,sourceCommit:source,buildVersion:123,platform:'linux/amd64' as const,mediaVariants:true as const,provenance:{repository:'JesstLe/naumi' as const,workflowCommit:'2'.repeat(40),runId:'1',attempt:'1'},images:Object.fromEntries(['ui','desktop','enterprise'].map((flavor,i)=>{const d=String(i+3).repeat(64);return [flavor,{reference:'ghcr.io/jesstle/naumi@sha256:'+d,digest:'sha256:'+d,tag:'ghcr.io/jesstle/naumi:'+source+(flavor==='ui'?'':'-'+flavor),imageId:'sha256:'+d}];}))};
  await pool.query('UPDATE app_fleet_instances SET last_seen=now(),status=$2 WHERE id=$1',[mainSite.id,JSON.stringify({source,version:'123'})]);await pool.query('UPDATE app_fleet_instances SET last_seen=now(),status=$2 WHERE id=$1',[enterprise.id,JSON.stringify({source:baseSource,version:'1'})]);
  const registered=await releases.registerRelease('fixture',releases.releaseRegistrationSchema.parse({action:'release-register',id:randomUUID(),sourceInstanceId:mainSite.id,manifest,evidenceSha256:'a'.repeat(64)}));
  await releases.saveReleasePolicy({actor:'fixture',root:true},{action:'release-policy',instanceId:enterprise.id,sourceInstanceId:mainSite.id,enabled:true,expectedVersion:0});
  const planId=randomUUID();await pool.query('INSERT INTO app_fleet_release_plans(id,instance_id,release_id,local_day,base_source,base_version) VALUES($1,$2,$3,$4,$5,$6)',[planId,enterprise.id,registered.id,'2026-10-14',baseSource,'1']);
  assert.equal(await releases.leaseRelease(enterprise.id),null);process.env.FLEET_RELEASE_DISPATCH_ENABLED='1';
  const dir=await mkdtemp(path.join(tmpdir(),'naumi-release-relay-')),inbox=path.join(dir,'inbox'),outbox=path.join(dir,'outbox');await mkdir(outbox);
  const keyFile=path.join(dir,'central-private.pem');await writeFile(keyFile,privatePem,{mode:0o600});process.env.FLEET_RELEASE_SIGNING_PRIVATE_KEY_FILE=keyFile;assert.equal(await keys.releaseSigningKey(),privatePem);delete process.env.FLEET_RELEASE_SIGNING_PRIVATE_KEY;
  let dropped=false,dropAck=false;
  const server=createServer(async(req,res)=>{try{const parts:Buffer[]=[];for await(const chunk of req)parts.push(Buffer.from(chunk));if(req.url?.endsWith('/ack')&&dropAck&&!dropped){dropped=true;res.destroy();return;}const request=new Request('http://127.0.0.1:'+port+req.url,{method:'POST',headers:req.headers as Record<string,string>,body:Buffer.concat(parts)});const response=req.url?.endsWith('/poll')?await poll.POST(request):await ack.POST(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
  const options={central:'http://127.0.0.1:'+port,instanceId:enterprise.id,token:enterprise.token,publicKey:publicPem,inbox,outbox,isolated:true};
  try{
    // More than 20 historical acknowledged receipts must not starve new releases.
    await mkdir(inbox);for(let i=0;i<25;i++){const old=randomUUID()+'.json';await writeFile(path.join(outbox,old),'{}');await writeFile(path.join(inbox,old+'.ack'),'acknowledged');}
    // Simulate a poll response lost before the relay saved it; retry retains the exact lease.
    const lost=await releases.leaseRelease(enterprise.id);assert.ok(lost);
    assert.equal((await relay.relayRelease(options)).queued,1);const envelope=JSON.parse(await readFile(path.join(inbox,planId+'.json'),'utf8')),job=wire.verifyRelease(envelope,publicPem,enterprise.id);assert.deepEqual(envelope,lost);assert.equal(job.id,planId);assert.equal(job.baseSource,baseSource);assert.equal((await relay.relayRelease(options)).queued,0);
    assert.throws(()=>wire.verifyRelease(envelope,publicPem,other.id));assert.throws(()=>wire.verifyRelease({...envelope,payload:envelope.payload.replace(source,'f'.repeat(40))},publicPem,enterprise.id));
    assert.throws(()=>wire.verifyRelease({...envelope,signature:'0'.repeat(128)},publicPem,enterprise.id));
    const result={planId,leaseId:job.leaseId,state:'accepted',code:'OK',source,version:'123',evidenceSha:'b'.repeat(64)};await writeFile(path.join(outbox,planId+'.json'),JSON.stringify(result));
    dropAck=true;await assert.rejects(()=>relay.relayRelease(options));assert.equal(dropped,true);dropAck=false;assert.equal((await relay.relayRelease(options)).acknowledged,1);assert.equal((await relay.relayRelease(options)).acknowledged,0);
    assert.equal((await pool.query('SELECT state FROM app_fleet_release_plans WHERE id=$1',[planId])).rows[0].state,'accepted');assert.equal((await releases.recordReleaseResult(enterprise.id,result)).replayed,true);await assert.rejects(()=>releases.recordReleaseResult(other.id,result));await assert.rejects(()=>releases.recordReleaseResult(enterprise.id,{...result,source:'f'.repeat(40)}));
    await assert.rejects(()=>releases.recordReleaseResult(enterprise.id,result,'0'.repeat(64)));assert.equal(await releases.leaseRelease(enterprise.id,'0'.repeat(64)),null);
    const pendingId=randomUUID();await pool.query('INSERT INTO app_fleet_release_plans(id,instance_id,release_id,local_day,base_source,base_version) VALUES($1,$2,$3,$4,$5,$6)',[pendingId,enterprise.id,registered.id,'2026-10-15',baseSource,'1']);
    const next=await releases.leaseRelease(enterprise.id);assert.ok(next);await pool.query("UPDATE app_fleet_release_plans SET leased_until=now()-interval '1 second' WHERE id=$1",[pendingId]);assert.equal(await releases.leaseRelease(enterprise.id),null);assert.equal((await pool.query('SELECT state FROM app_fleet_release_plans WHERE id=$1',[pendingId])).rows[0].state,'blocked');
    const pendingJob=wire.verifyRelease(next,publicPem,enterprise.id),blocked={planId:pendingId,leaseId:pendingJob.leaseId,state:'blocked',code:'UNKNOWN'};
    assert.equal((await releases.recordReleaseResult(enterprise.id,blocked)).replayed,false);
    const auditCount=(await pool.query('SELECT count(*)::int AS n FROM app_fleet_audit')).rows[0].n;
    assert.equal((await releases.recordReleaseResult(enterprise.id,blocked)).replayed,true);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_fleet_audit')).rows[0].n,auditCount);
    const laterId=randomUUID();await pool.query('INSERT INTO app_fleet_release_plans(id,instance_id,release_id,local_day,base_source,base_version) VALUES($1,$2,$3,$4,$5,$6)',[laterId,enterprise.id,registered.id,'2026-10-16',baseSource,'1']);
    assert.equal(await releases.leaseRelease(enterprise.id),null);assert.equal((await pool.query('SELECT state FROM app_fleet_release_plans WHERE id=$1',[laterId])).rows[0].state,'planned');
    const night=new Date('2026-10-17T12:00:00Z');await pool.query('UPDATE app_fleet_instances SET last_seen=$2 WHERE id=$1',[mainSite.id,night]);assert.equal((await releases.planNightlyReleases(night)).created,0);
    // Recover only the original authentic lease's actual receipt; never retry the unknown deployment.
    await releases.recordReleaseResult(enterprise.id,{planId:pendingId,leaseId:pendingJob.leaseId,state:'failed',code:'CHECK_FAILED'});
    await pool.query('UPDATE app_fleet_instances SET last_seen=now() WHERE id=$1',[mainSite.id]);assert.ok(await releases.leaseRelease(enterprise.id));
    console.log('FLEET_RELEASE_DISPATCH=PASS REAL_HTTP=1 ED25519_SCOPE=1 RELAY_NO_ROOT=1 LEASE_ONCE=1 LOST_POLL_RETRY=1 LOST_ACK_RETRY=1 RECEIPT_ONCE=1 BLOCKED_ACK_ONCE=1 PRIVATE_KEY_FILE=1 EXPIRED_UNKNOWN_BLOCKED=1 NEXT_NIGHT_UNKNOWN_BLOCKED=1 AUTHENTIC_RECEIPT_RESOLVES=1 DEFAULT_OFF=1 AUTO_DEPLOY=0 PRODUCTION_WRITES=0');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
