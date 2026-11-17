import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {PoolClient} from 'pg';
import {NextResponse} from 'next/server';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig} from './billing-unit-fixture';
import {readPublishedBillingConfig} from '../src/lib/billing/catalog';
import {createOnboardingHandler} from '../src/lib/model-config/onboarding-access';
import {onboardingDraftOwner} from '../src/lib/model-config/onboarding-read';
import {readPublishedModelSnapshot} from '../src/lib/model-config/published-repository';
import {planModelOnboarding} from '../src/lib/model-config/onboarding';

async function until(test:()=>Promise<boolean>,reason:string){const end=Date.now()+2500;while(!await test()){assert.ok(Date.now()<end,reason);await delay(20);}}
async function bounded<T>(promise:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('draft read blocked despite row-only lock')),1400);})]);}
 finally{if(timer)clearTimeout(timer);}
}

async function main(){
 const baseline=process.argv.includes('--baseline');
 let handler:ReturnType<typeof createOnboardingHandler>|undefined,abortedStatus=0;
 const f=await createModelFixture(async(req,res)=>{
  if(!handler){res.writeHead(404).end();return;}
  const signal=signalFromNodeResponse(res);
  const result=await handler(new Request(f.origin+req.url,{headers:{'x-fixture-user':String(req.headers['x-fixture-user']??'')},signal}));
  if(signal.aborted)abortedStatus=result.status;
  if(!res.destroyed)res.writeHead(result.status).end(await result.text());
 });
 let owner:PoolClient|undefined,waiting:Promise<Response|null>|undefined;
 const actor='draft-read-fixture@example.test',other='other-draft-admin@example.test',url=f.origin+'/api/admin/model-management/onboarding';
 const request=(body?:unknown,user=actor)=>new Request(url,{headers:{'x-fixture-user':user,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 try{
  const snapshot=await f.repo.current(),billing={version:1,config:fixtureConfig()},trustedOrigins=[f.origin];
  await f.sql.query(`CREATE TABLE app_settings(k text PRIMARY KEY,v text NOT NULL);
   CREATE TABLE app_billing_config_versions(version bigint PRIMARY KEY,config jsonb NOT NULL,actor text NOT NULL,request_fingerprint text NOT NULL);
   INSERT INTO app_settings VALUES('billing_config_version','1');`);
  await f.sql.query('INSERT INTO app_billing_config_versions VALUES($1,$2,$3,$4)',[1,JSON.stringify(billing.config),actor,'fixture']);
  let adminCalls=0,readCalls=0;
  handler=createOnboardingHandler({authorize:async request=>{
   const actor=request.headers.get('x-fixture-user');return actor?{actor}:NextResponse.json({},{status:404});
  },administration:async()=>{adminCalls++;return {pool:f.sql,repo:f.repo,billing:{current:async()=>billing},trustedOrigins} as never;},
  ...(baseline?{}:{readPorts:()=>{readCalls++;return {pool:f.sql,trustedOrigins,model:tx=>readPublishedModelSnapshot(tx,{trustedOrigins}),billingVersion:async tx=>(await readPublishedBillingConfig(tx)).version};}})});
  const count=async()=>Number((await f.sql.query('SELECT count(*) FROM app_model_drafts')).rows[0].count);
  const before=await count(),response=await handler(request());assert.equal(response.status,200);
  const {draft}=await response.json();assert.equal(draft.revision,1);assert.equal(draft.billingVersion,1);assert.deepEqual(draft.entries,[]);
  const lockWait=async()=>Boolean((await f.sql.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%app_model_drafts%'`)).rowCount);
  const release=async()=>{await owner!.query('ROLLBACK');owner!.release();owner=undefined;};
  if(baseline){
   assert.equal(await count()-before,1,'empty wizard GET creates a draft row');
   owner=await f.sql.connect();await owner.query('BEGIN');await owner.query('SELECT id FROM app_model_drafts WHERE id=$1 FOR UPDATE',[draft.id]);
   waiting=handler(request());await until(lockWait,'wizard GET did not reproduce the row lock wait');
   await release();assert.equal((await waiting)?.status,200);
   console.log('ONBOARDING_DRAFT_READ_BASELINE=PASS EMPTY_GET_INSERTS=1 EXISTING_GET_BLOCKS_ON_ROW=1 REAL_PG=1 SUPPLIER_CALLS=0');return;
  }
  assert.equal(await count()-before,0);assert.equal(adminCalls,0);assert.equal(readCalls,1);
  assert.deepEqual((await (await handler(request())).json()).draft,draft);
  const unauthorized=await handler(request(undefined,''));assert.equal(unauthorized.status,404);assert.equal(readCalls,2);
  const entries=['published-later','recover-later'].map(publicId=>({publicId,label:publicId,source:{upstreamId:'u1'},features:['image.generate'] as const,price:{mode:'fixed' as const,credits:7}})).map(e=>({...e,features:[...e.features]}));
  const save={action:'save',expectedVersion:snapshot.version,expectedRevision:1,expectedBillingVersion:1,entries,enabled:true,capabilityConfirmed:true};
  const wrong=await handler(request({...save,expectedRevision:4}));assert.equal(wrong.status,409);assert.equal(await count(),0);
  const concurrent=await Promise.all([handler(request(save)),handler(request(save))]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  const saved=(await concurrent.find(r=>r.ok)!.json()).draft;assert.equal(saved.id,draft.id);assert.equal(saved.revision,2);assert.equal(await count(),1);
  owner=await f.sql.connect();await owner.query('BEGIN');
  await owner.query('UPDATE app_model_drafts SET revision=9 WHERE id=$1',[saved.id]);
  await owner.query("UPDATE app_model_public_models SET label='uncommitted' WHERE draft_id=$1",[saved.id]);
  waiting=handler(request());const whileLocked=await bounded(waiting);assert.equal(whileLocked?.status,200);assert.deepEqual((await whileLocked!.json()).draft,saved);
  await release();
  // During a rolling update the old code can create an initial random ID; the
  // new save uses the real owner row, never the stale proposed virtual ID.
  const foreignVirtual=(await (await handler(request(undefined,other))).json()).draft;
  const old=await f.repo.draft(onboardingDraftOwner(other,snapshot.version).actor);
  assert.notEqual(old.id,foreignVirtual.id);
  const otherEntry={...entries[1],publicId:'other-private'};
  const mixed=await handler(request({...save,entries:[otherEntry]},other));assert.equal(mixed.status,200);assert.equal((await mixed.json()).draft.id,old.id);
  const publisher='publisher-fixture@example.test',id=randomUUID();
  const source=await f.repo.draft(publisher),config=planModelOnboarding(snapshot,billing,{...save,entries:[entries[0]]}).config;
  const changed=await f.repo.saveDraft({id:source.id,actor:publisher,config,expectedRevision:source.revision});
  const publication=await f.repo.stage({id,actor:publisher,draftId:source.id,expectedRevision:changed.revision,expectedVersion:snapshot.version,reason:'fixture rollover'});
  const latest=await f.repo.markApplied(id,publication.digest,source.id);
  const rolledCount=await count(),rolled=await handler(request());assert.equal(rolled.status,200);
  const recovered=(await rolled.json()).draft;assert.equal(recovered.revision,1);assert.equal(recovered.basedOnVersion,latest.version);assert.equal(recovered.recoveredFromVersion,snapshot.version);
  assert.deepEqual(recovered.entries.map((e:{publicId:string})=>e.publicId),['recover-later']);assert.equal(await count(),rolledCount);
  await assert.rejects(()=>f.repo.saveOnboardingDraft({initialId:randomUUID(),actor:onboardingDraftOwner(other,snapshot.version).actor,expectedVersion:snapshot.version,expectedRevision:2,config}),
   (error:{code?:string})=>error.code==='CONFIG_CONFLICT');
  owner=await f.sql.connect();await owner.query('BEGIN');await owner.query('LOCK app_model_drafts IN ACCESS EXCLUSIVE MODE');
  const controller=new AbortController();waiting=fetch(url,{headers:{'x-fixture-user':actor},signal:controller.signal}).catch(()=>null);
  await until(lockWait,'HTTP read did not reach a blocked statement');controller.abort();
  await until(async()=>abortedStatus===499&&!await lockWait(),'aborted read retained a PostgreSQL waiter');await release();assert.equal(await waiting,null);
  await f.sql.query('DELETE FROM app_model_config_state');
  assert.equal((await handler(request())).status,503);
  assert.equal((await f.sql.query('SELECT count(*)::int AS n FROM app_model_config_state')).rows[0].n,0,'cold read cannot initialize active model pointer');
  console.log('ONBOARDING_DRAFT_READ=PASS EMPTY_GET_INSERTS=0 ROW_LOCK_WAIT=0 CONCURRENT_FIRST_SAVE=ONE ROLLING_ID=KEPT RECOVERY_OWNER=EXACT HTTP_ABORT=1 REAL_PG=1 SUPPLIER_CALLS=0');
 }finally{
  if(owner){await owner.query('ROLLBACK').catch(()=>{});owner.release();}
  await waiting?.catch(()=>{});await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
