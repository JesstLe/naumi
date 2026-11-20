import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig} from './billing-unit-fixture';
import {createModelExecutor} from '../src/lib/model-config/execution';
import {claimChannel,recordChannelOutcome,channelHealthKey,channelHealthSummary} from '../src/lib/model-config/channel-scheduler';
import {guardChannelSubmission} from '../src/lib/model-config/channel-availability';
import {retryAfterMs,channelFailurePolicy} from '../src/lib/model-config/channel-health-policy';
import {modelEndpointFetch} from '../src/lib/model-config/transport';
import {ImageOperationPending} from '../src/lib/image-gateway';
import type {ModelConfig} from '../src/lib/model-config/types';
async function main(){
 let posts=0,gets=0;
 const f=await createModelFixture((req,res)=>{if(req.method==='POST')posts++;else gets++;res.end('{}')});
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 const db=await import('../src/lib/db');
 try{
  const credential=await f.credentials.importPlain({providerId:'p2',plain:'fixture-backup-only',actor:'fixture'});
  f.config.providers.push({...f.config.providers[0],id:'p2',name:'Backup fixture',credentialRef:credential.id});
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:'u2',providerId:'p2',model:'wire-image-two'});
  f.config.publicModels[0].supplierRouting={mode:'priority',channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1},{upstreamId:'u2',enabled:true,priority:2,weight:1}]};
  const before=await f.repo.current(),billing={version:1,digest:'b'.repeat(64),config:fixtureConfig()};
  const executor=createModelExecutor({runtime:{byVersion:v=>f.repo.byVersion(v),prepareExecution:async()=>{throw Error('No router expected')}},credentials:f.credentials,billingByVersion:async()=>billing,trustedOrigins:[f.origin],gateway:()=>({baseUrl:f.origin,apiKey:'fixture'})});
  const frozen=await executor.resolve({binding:'image.generate',feature:'image.generate',requestedModelId:'image-a',snapshot:before,billing,facts:{task:'draft',quality:'medium',resolution:'1K',needsEdit:false,preserveIdentity:false,needsText:false,nativeResolution:false,references:0}});
  let edit=0;
  const publish=async(config:ModelConfig)=>{const actor='fixture-live-guards-'+(++edit),current=await f.repo.current(),draft=await f.repo.draft(actor),saved=await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor}),p=await f.repo.stage({id:randomUUID(),draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor,reason:'isolated channel guard fixture'});return f.repo.markApplied(p.id,p.digest)};
  const off=structuredClone(before.config);off.publicModels[0].supplierRouting!.channels[0].enabled=false;await publish(off);
  const scope=await executor.describe(frozen),p=scope.supplierRouting!,claim=await claimChannel(f.sql,'image-a',p.policy,p.targets,new Set());
  try{assert.equal(claim.target.upstreamId,process.argv.includes('--baseline')?'u1':'u2')}finally{await claim.release()}
  console.log(process.argv.includes('--baseline')?'BASELINE=REPRODUCED OLD_TASK_SELECTED_DISABLED_U1':'MODIFIED=PASS OLD_TASK_SKIPPED_DISABLED_U1');
  if(process.argv.includes('--baseline')){console.log('REAL_PAID_CALLS=0');return;}
  const pick=()=>claimChannel(f.sql,'image-a',p.policy,p.targets,new Set());
  const t=p.targets[0],key=channelHealthKey(t);
  const clear=()=>f.sql.query('DELETE FROM app_model_channel_health');
  const health=async()=> (await f.sql.query('SELECT *,extract(epoch FROM open_until-now())*1000 AS remaining_ms FROM app_model_channel_health WHERE key=$1',[key])).rows[0];
  await publish(before.config);
  const admitted=await pick();assert.equal(admitted.target.upstreamId,'u1');
  await publish(off);
  await assert.rejects(guardChannelSubmission(f.sql,admitted.target.scope),(e:any)=>e.code==='CHANNEL_DISABLED');await admitted.release();
  const wire=modelEndpointFetch(f.origin+'/v1',{trustedOrigins:[f.origin]},{...t.scope.connection,costScope:t.scope,costDisabled:true});
  await assert.rejects(wire(f.origin+'/v1/images/generations',{method:'POST',body:'{}'}),(e:any)=>e.code==='CHANNEL_DISABLED');
  assert.equal(posts,0);
  await wire(f.origin+'/v1/tasks/known');assert.equal(gets,1,'Accepted-task GET is never gated');
  console.log('FINAL_DISPATCH_GATE=PASS; DISABLED_POSTS=0; ACCEPTED_TASK_GET=PASS');
  await publish(before.config);
  const observedPool=db.getPool(),originalConnect=observedPool.connect.bind(observedPool);let closeDuringLedger=true;
  (observedPool as any).connect=(callback?:any)=>{
   const pending=originalConnect().then(client=>{
    const query=client.query,release=client.release;
    (client as any).query=(...args:any[])=>typeof args.at(-1)==='function'?(query as any).apply(client,args):(async()=>{const result=await (query as any).apply(client,args);if(closeDuringLedger&&String(args[0]).includes('INSERT INTO app_supplier_calls(')){closeDuringLedger=false;await publish(off)}return result})();
    client.release=(...args:any[])=>{client.query=query;client.release=release;return (release as any).apply(client,args)};return client;
   });
   if(callback){void pending.then(client=>callback(null,client,client.release),callback);return}return pending;
  };
  try{
   const meteredWire=modelEndpointFetch(f.origin+'/v1',{trustedOrigins:[f.origin]},{...t.scope.connection,costScope:t.scope});
   await assert.rejects(meteredWire(f.origin+'/v1/images/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'wire-image-one',prompt:'fixture'})}),(e:any)=>e.code==='CHANNEL_DISABLED');
   assert.equal(posts,0);const receipt=(await f.sql.query('SELECT state,cost_status,amount_micros::text FROM app_supplier_calls ORDER BY started_at DESC LIMIT 1')).rows[0];
   assert.equal(receipt.state,'rejected');assert.equal(receipt.cost_status,'reported');assert.equal(receipt.amount_micros,'0');
  }finally{(observedPool as any).connect=originalConnect}
  console.log('DISABLE_DURING_COST_PREPARATION_ZERO_POST_ZERO_SUPPLIER_COST=PASS');

  const replacement=structuredClone(before.config);replacement.publicModels[0].supplierRouting=undefined;replacement.publicModels[0].target={type:'upstream',id:'u2'};
  await publish(replacement);const replaced=await pick();assert.equal(replaced.target.upstreamId,'u2');await replaced.release();
  const allOff=structuredClone(before.config);allOff.upstreamModels.push({...structuredClone(allOff.upstreamModels[1]),id:'u3',model:'new-wire'});allOff.publicModels[0].supplierRouting!.channels=[{upstreamId:'u3',enabled:true,priority:1,weight:1}];
  await publish(allOff);await assert.rejects(pick(),(e:any)=>e.code==='CHANNEL_DISABLED');
  const providerOff=structuredClone(off);providerOff.providers[0].enabled=false;await publish(providerOff);const ps=await pick();assert.equal(ps.target.upstreamId,'u2');await ps.release();
  await publish(before.config);assert.deepEqual(await executor.describe(frozen).then(s=>s.frozen),frozen);
  assert.deepEqual(billing.config,fixtureConfig(),'Live switch gate must not mutate frozen billing');
  const rotated=structuredClone(before.config);rotated.upstreamModels[0].model='wire-image-rotated';await publish(rotated);
  const retained=await pick();assert.equal(retained.target.scope.connection.wireModel,'wire-image-one','Switch overlay must preserve accepted wire model/mappings');await retained.release();await publish(before.config);
  console.log('REMOVED_CHANNEL_PROVIDER_DISABLE_NO_UNFROZEN_TARGETS=PASS; FROZEN_PARAMETERS_BILLING=PASS');

  assert.equal(retryAfterMs('120'),120000);assert.equal(retryAfterMs('9999999'),900000);assert.equal(retryAfterMs('bad'),undefined);
  assert.equal(retryAfterMs(new Date(200000).toUTCString(),100000),100000);
  assert.equal(channelFailurePolicy(400),undefined);assert.equal(channelFailurePolicy(422),undefined);
  for(const status of [401,403,429]){
   await clear();await recordChannelOutcome(f.sql,t,false,status,{retryAfterMs:120000});const h=await health();
   assert.equal(h.failures,1);assert.ok(Number(h.remaining_ms)>119000);const backup=await pick();assert.equal(backup.target.upstreamId,'u2');await backup.release();
  }
  for(const [status,kind] of [[503,'unavailable'],[504,'timeout'],[200,'invalid-output'],[undefined,'transport']] as const){
   await clear();await recordChannelOutcome(f.sql,t,false,status);assert.equal((await health()).open_until,null);
   await recordChannelOutcome(f.sql,t,false,status);assert.ok(Number((await health()).remaining_ms)>29000);assert.equal((await health()).last_failure_kind,kind);
  }
  const first=Number((await health()).remaining_ms);await recordChannelOutcome(f.sql,t,false);assert.ok(Number((await health()).remaining_ms)>first*1.5);
  await clear();await recordChannelOutcome(f.sql,t,false,400);assert.equal(await health(),undefined);
  await recordChannelOutcome(f.sql,t,true,200);await recordChannelOutcome(f.sql,t,false,503);assert.equal((await channelHealthSummary(f.sql,before.config)).u1.state,'failed','Past success must not hide newer failures');
  console.log('CLASSIFIED_COOLDOWN_RETRY_AFTER_BACKOFF=PASS; INVALID_REQUEST_NO_PENALTY=PASS; HEALTH_NO_STALE_GREEN=PASS');

  await clear();const stale=await pick();await recordChannelOutcome(f.sql,t,false,429);
  await recordChannelOutcome(f.sql,t,true,200,{startedAt:stale.startedAt});assert.equal((await health()).failures,1,'Old success cannot cancel a newer cooldown');await stale.release();
  await f.sql.query("UPDATE app_model_channel_health SET open_until=now()-interval '1 second' WHERE key=$1",[key]);
  const claims=await Promise.all(Array.from({length:4},(_,i)=>claimChannel(f.sql,'image-a',{...p.policy,mode:i%2?'balanced':'priority'},p.targets,new Set())));
  assert.equal(claims.filter(c=>c.target.upstreamId==='u1').length,1,'Single half-open probe across different schedule keys');
  const probe=claims.find(c=>c.target.upstreamId==='u1')!;
  const token=(await health()).probe_token;assert.ok(token);
  await f.sql.query("UPDATE app_model_channel_health SET probe_until=now()-interval '1 second' WHERE key=$1",[key]);
  const newer=await pick();assert.equal(newer.target.upstreamId,'u1');const newToken=(await health()).probe_token;assert.notEqual(newToken,token);
  for(const c of claims)await c.release();assert.equal((await health()).probe_token,newToken,'Stale release cannot clear another process probe');
  await newer.release();assert.equal((await health()).probe_until,null,'Cancellation/pre-submit abandonment releases probe');
  const recovery=await pick();assert.equal(recovery.target.upstreamId,'u1');await recordChannelOutcome(f.sql,recovery.target,true,200,{startedAt:recovery.startedAt});await recovery.release();assert.equal((await health()).failures,0);assert.equal((await health()).open_until,null);
  console.log('STALE_SUCCESS_FENCE_CROSS_SCHEDULE_SINGLE_PROBE_TOKEN_RELEASE=PASS; HALF_OPEN_RECOVERY=PASS');

  const op='fixture-operation-'+randomUUID(),hubScope={...t.scope,connection:{...t.scope.connection,options:{imageAdapter:'reverse-hub' as const}},channelGuard:{upstreamId:'u1',operationKey:op}};
  // The adapter option is frozen; eligibility compares endpoint/protocol/model,
  // not unrelated current presentation/price edits.
  await guardChannelSubmission(f.sql,hubScope);
  assert.equal((await f.sql.query('SELECT upstream_id FROM app_model_channel_operations WHERE operation_key=$1',[op])).rows[0].upstream_id,'u1');
  await publish(off);await recordChannelOutcome(f.sql,t,false,429);
  for(const mode of ['priority','balanced','random'] as const){const resume=await claimChannel(f.sql,'image-a',{...p.policy,mode},p.targets,new Set(),op);assert.equal(resume.target.upstreamId,'u1');assert.equal(resume.recovering,true);await resume.release();}
  await assert.rejects(guardChannelSubmission(f.sql,hubScope),ImageOperationPending);
  await wire(f.origin+'/v1/tasks/known');assert.equal(gets,2);assert.equal(posts,0);
  assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_model_provider_leases')).rows[0].n,0);
  console.log('ACCEPTED_HUB_ORIGINAL_CHANNEL_PIN_NO_DUPLICATE_POST=PASS; CAPACITY_LEAKS=0');
  console.log('REAL_PAID_CALLS=0');
 }finally{await db.getPool().end();await f.cleanup();console.log('ISOLATED_SCHEMA_CLEANUP=PASS')}
}
main().catch(e=>{console.error(e);process.exitCode=1});
