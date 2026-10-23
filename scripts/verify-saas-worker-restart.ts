import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const db=await import('../src/lib/db'),ctx=await import('../src/lib/saas/creation-context');
 const pool=db.getPool();
 if(process.argv[2]==='child'){
  const info=JSON.parse(process.argv[3]),{DurableImageJobs}=await import('../src/lib/durable-image-jobs');
  const {ImageOperationPending}=await import('../src/lib/image-gateway');
  const jobs=new DurableImageJobs<{status:string}>('imagegen');
  let complete!:()=>void;const done=new Promise<void>(resolve=>complete=resolve);
  await ctx.withFrozenCreation({actorEmail:info.email,scopeKind:'tenant',tenantId:info.tenantId},()=>jobs.kick(info.id,async(payload)=>{
   if(info.phase===3){assert.equal(ctx.currentCreationContext(),undefined);await jobs.patch(info.id,{status:'done'});complete();return;}
   assert.equal(ctx.currentCreationContext()?.tenantId,info.tenantId);assert.equal(ctx.currentCreationContext()?.creationId,info.creationId);
   assert.equal((payload.request as any).prompt,'accepted original');assert.deepEqual(payload.frozenTerms,{configVersion:17,quotedCredits:12,payer:info.email});
   const execute=()=>jobs.paidOperation(info.id,'fixture-non-gateway',{id:'accepted-external-once',managedGateway:false} as any,async()=>{
    await pool.query('INSERT INTO fixture_supplier_accepts(job_id) VALUES($1)',[info.id]);
    // Abrupt process exit after the accepted intent is durable, before any result.
    process.exit(71);
   });
   if(info.phase===1)await execute();
   else{await assert.rejects(execute(),ImageOperationPending);await jobs.patch(info.id,{status:'needs_attention'});complete();}
  }));
  await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('worker fixture did not finish')),20000).unref())]);
  // Wait for the real kick finally block to release the lease before closing PG.
  for(let i=0;i<100;i++){if(!(await pool.query('SELECT lease_token FROM app_image_jobs WHERE id=$1',[info.id])).rows[0].lease_token)break;await new Promise(resolve=>setTimeout(resolve,10));}
  await pool.end();return;
 }
 const tenants=await import('../src/lib/saas/tenants'),writer=await import('../src/lib/saas/creation-writer'),images=await import('../src/lib/image-job-repository');
 await tenants.ensureTenantSchema();await (await import('../src/lib/saas/creation-schema')).ensureCreationSchema();const owner='owner@restart.fixture',email='member@restart.fixture';for(const account of [owner,email])await db.getOrCreateUser(account,account);
 const tenant=await tenants.createTenant({email:'fixture-admin',admin:true},{commandId:randomUUID(),name:'Restart fixture',ownerEmail:owner,seatLimit:5,validUntil:null,entitlementName:null,featurePolicy:{generate:true}});
 await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[tenant.tenantId,email,owner]);
 await pool.query('CREATE TABLE fixture_supplier_accepts(job_id text NOT NULL)');
 const id=`restart-${randomUUID()}`;
 await ctx.withFrozenCreation({actorEmail:email,scopeKind:'tenant',tenantId:tenant.tenantId,requestText:'accepted original'},()=>images.createImageJob(id,email,'imagegen',{status:'pending',paidOperationVersion:1},{request:{prompt:'accepted original'},frozenTerms:{configVersion:17,quotedCredits:12,payer:email}},0,false));
 const creation=(await pool.query("SELECT * FROM app_creation_records WHERE source_kind='image:imagegen' AND source_id=$1",[id])).rows[0];
 const child=async(phase:number,jobId=id)=>new Promise<number|null>((resolve,reject)=>{const processChild=spawn(process.execPath,['--conditions=react-server','--import','tsx',fileURLToPath(import.meta.url),'child',JSON.stringify({id:jobId,email,tenantId:tenant.tenantId,creationId:creation.id,phase})],{env:process.env,stdio:'inherit'});processChild.once('error',reject);processChild.once('exit',resolve);});
 assert.equal(await child(1),71);
 assert.equal(Number((await pool.query('SELECT count(*) n FROM fixture_supplier_accepts')).rows[0].n),1);
 const accepted=await images.getImageJob(id,'imagegen');assert.equal((accepted!.snapshot.paidOperations as any)['accepted-external-once'].state,'started');
 // Only this fixture job's dead lease expires; current membership/config no longer grant access.
 await pool.query("UPDATE app_image_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[id]);
 await pool.query("UPDATE app_enterprise_members SET membership_status='suspended',left_at=now() WHERE enterprise_id=$1 AND email=$2",[tenant.tenantId,email]);
 await pool.query("UPDATE app_account_teams SET enabled=false WHERE id=$1",[tenant.tenantId]);
 assert.equal(await child(2),0);
 assert.equal(Number((await pool.query('SELECT count(*) n FROM fixture_supplier_accepts')).rows[0].n),1);
 const result=(await pool.query('SELECT * FROM app_creation_records WHERE id=$1',[creation.id])).rows[0];assert.equal(result.tenant_id,tenant.tenantId);assert.equal(result.payer_account_id,email);assert.equal(result.request_snapshot.text,'accepted original');assert.equal(result.status,'needs_review');
 assert.equal(ctx.frozenCreationScope((await images.getImageJob(id,'imagegen'))!.payload.creationScope,email)?.tenantId,tenant.tenantId);
 const legacyId=`legacy-${randomUUID()}`;await ctx.withFrozenCreation(undefined,()=>images.createImageJob(legacyId,email,'imagegen',{status:'pending',paidOperationVersion:1},{request:{prompt:'historical-no-scope'}},0,false));
 assert.equal(await child(3,legacyId),0);assert.equal((await pool.query('SELECT 1 FROM app_creation_records WHERE source_id=$1',[legacyId])).rowCount,0);assert.equal((await images.getImageJob(legacyId,'imagegen'))!.payload.creationScope,undefined);
 console.log('SAAS_WORKER_RESTART_FIXTURE_PASS independent_processes=3 abrupt_exit_after_accept=1 real_durable_claim=1 membership_revoked=1 frozen_scope_request_terms_payer=1 unknown_paid_not_replayed=1 legacy_ambient_scope_cleared=1 local_fixture_accepts=1 real_supplier_calls=0');
 await pool.end();
}
void main().catch(error=>{console.error(error);process.exitCode=1;setTimeout(()=>process.exit(1),100).unref();});
