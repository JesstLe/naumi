import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig} from './billing-unit-fixture';
import {createModelManagementHandler} from '../src/lib/model-config/management-access';
import {createOnboardingHandler} from '../src/lib/model-config/onboarding-access';
import {createModelRuntime} from '../src/lib/model-config/runtime';
import {createRouterControl,type RouterStatus} from '../src/lib/model-config/router-client';

async function until(predicate:()=>boolean,message:string){const deadline=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<deadline,message);await delay(15);}}
async function main(){
 const baseline=process.argv.includes('--baseline');
 let open:ServerResponse|undefined,gets=0,closedEarly=0;
 const f=await createModelFixture((req,res)=>{
  if(req.url==='/v1/models'){
   gets++;open=res;res.setTimeout(8000,()=>res.destroy());res.once('close',()=>{if(!res.writableFinished)closedEarly++;});
   res.writeHead(200,{'content-type':'application/json'}).write('{"data":[{"id":"');return;
  }
  res.writeHead(404).end('{}');
 });
 let pending:Promise<Response>|undefined;
 const finish=(model='test-discovered')=>{if(open&&!open.writableEnded&&!open.destroyed)open.end(`${model}"}]}`);open=undefined;};
 try{
  const actor='registration-fixture@example.test',trustedOrigins=[f.origin],billing={version:1,config:fixtureConfig()};
  let digest='',activations=0;
  const statuses=new Map<string,RouterStatus>();
  const router=createRouterControl({baseUrl:f.origin,token:'mvp-fixture-router-token-independent-long',envelopeSecret:'mvp-fixture-envelope-independent-long',trustedOrigins});
  router.prepare=async()=>{};router.state=async()=>digest;router.status=async id=>statuses.get(id)??null;
  router.activate=async(id,expected,next)=>{assert.equal(digest,expected);digest=next;activations++;const receipt:RouterStatus={id,digest,phase:'applied'};statuses.set(id,receipt);return receipt;};
  const runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,trustedOrigins,billing:async()=>billing,billingByVersion:async()=>billing});
  const deps={authorize:async()=>({actor}),administration:async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,router,runtime,billing:{current:async()=>billing},trustedOrigins}) as never};
  const handler=createModelManagementHandler({...deps,managed:async()=>true,mutationWaitMs:900});
  const onboarding=createOnboardingHandler(deps);
  const request=(body?:unknown,signal?:AbortSignal,wizard=false)=>new Request('http://fixture.test/api/admin/model-management'+(wizard?'/onboarding':''),body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal}:undefined);
  const initial=await f.repo.current(),view=await handler(request());assert.equal(view.status,200);const rowId=(await view.json()).rows[0].id;
  const register={action:'register',id:randomUUID(),expectedVersion:initial.version,providerId:'p1',model:'test-discovered',confirmed:true,edit:false,vision:false,qualities:['medium'],resolutions:['1K'],maxReferenceImages:0};
  const available=async(id:string)=>(await f.sql.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS available',['admin-mvp:'+id])).rows[0].available;
  const noOperation=async(id:string)=>{
   await assert.rejects(()=>f.repo.publication(id),(e:{code?:string})=>e.code==='PUBLICATION_UNAVAILABLE');
   const rows=await f.sql.query('SELECT 1 FROM app_model_drafts WHERE actor LIKE $1',['%#mvp:'+id+':%']);assert.equal(rows.rowCount,0);
  };
  pending=handler(request(register));await until(()=>!!open,'registration never opened the directory');
  assert.equal(await available(register.id),!baseline);
  if(!baseline){
   const duplicate=await handler(request(register));assert.equal(duplicate.status,409);
   const evidence=await duplicate.json();assert.equal(evidence.code,'PUBLICATION_LOCK_PENDING');assert.equal(evidence.operationNotStaged,false);assert.equal(gets,1);
  }
  const rename=await handler(request({action:'rename',id:randomUUID(),expectedVersion:initial.version,rowId,label:'Independent model label'}));
  assert.equal(rename.status,baseline?409:200);
  if(baseline)assert.equal((await rename.json()).code,'PUBLICATION_LOCK_PENDING');
  finish();const first=await pending;assert.equal(first.status,baseline?200:409);
  if(!baseline){assert.equal((await first.json()).code,'CONFIG_CONFLICT');await noOperation(register.id);}
  const latest=await f.repo.current(),success=baseline?register:{...register,id:randomUUID(),expectedVersion:latest.version};
  const applied=await handler(request(success));assert.equal(applied.status,200);const original=await applied.json();
  const count=activations,replay=await handler(request(success));assert.equal(replay.status,200);assert.equal((await replay.json()).publication.version,original.publication.version);assert.equal(activations,count);
  const missing=await handler(request({...success,id:randomUUID(),expectedVersion:(await f.repo.current()).version,model:'not-in-directory'}));
  assert.equal(missing.status,400);assert.equal((await missing.json()).code,'CATALOG_UNAVAILABLE');
  const latestSnapshot=await f.repo.current(),entry={publicId:'explicit-fixture',label:'Explicit fixture',source:{upstream:{...f.config.upstreamModels[0],id:'explicit-upstream',model:'explicit-wire'}},features:['image.generate'],price:{mode:'fixed',credits:7}};
  const wizard={entries:[entry],expectedVersion:latestSnapshot.version,expectedBillingVersion:1,enabled:true,capabilityConfirmed:true};
  const expired=()=>f.sql.query('DELETE FROM app_model_provider_catalog');
  await expired();
  if(baseline){
   pending=onboarding(request({...wizard,action:'preview'},undefined,true));await until(()=>!!open,'old preview did not reproduce its unused refresh');finish();assert.equal((await pending).status,200);
   await expired();const id=randomUUID();pending=handler(request({...wizard,action:'create-models',id}));await until(()=>!!open,'old create-models did not reproduce its unused refresh');
   assert.equal(await available(id),false);finish();assert.equal((await pending).status,200);
  }else{
   const before=gets,preview=await onboarding(request({...wizard,action:'preview'},undefined,true));assert.equal(preview.status,200);
   const draft=(await (await onboarding(request(undefined,undefined,true))).json()).draft;
   const saved=await onboarding(request({...wizard,action:'save',expectedRevision:draft.revision},undefined,true));assert.equal(saved.status,200);
   const published=await handler(request({...wizard,action:'create-models',id:randomUUID()}));assert.equal(published.status,200);
   assert.equal(gets,before,'explicit onboarding does not fetch supplier catalogs');
   const state=billing.version;billing.version++;
   const staleBilling=await onboarding(request({...wizard,action:'preview',expectedVersion:(await f.repo.current()).version},undefined,true));
   assert.equal(staleBilling.status,409);assert.equal((await staleBilling.json()).code,'CONFIG_CONFLICT');billing.version=state;
   const current=await f.repo.current(),canceled={...register,id:randomUUID(),expectedVersion:current.version,model:'canceled-fixture'},controller=new AbortController();
   pending=handler(request(canceled,controller.signal));await until(()=>!!open,'cancel scenario did not reach catalog');controller.abort();
   assert.equal((await pending).status,499);await until(()=>closedEarly===1,'client cancellation left supplier body open');await noOperation(canceled.id);
   open=undefined;
   const savedOperation={...register,id:randomUUID(),expectedVersion:current.version,model:'saved-draft-wire'};
   const publish=runtime.publish.bind(runtime);
   runtime.publish=async input=>{if(input.id===savedOperation.id)throw Error('fixture interruption before staging');return publish(input);};
   pending=handler(request(savedOperation));await until(()=>!!open,'draft scenario did not reach the directory');finish(savedOperation.model);
   const interrupted=await pending;assert.equal(interrupted.status,503);assert.equal((await interrupted.json()).operationNotStaged,false);
   const savedRevision=(await f.sql.query('SELECT revision FROM app_model_drafts WHERE actor LIKE $1',['%#mvp:'+savedOperation.id+':%'])).rows[0]?.revision;
   assert.equal(Number(savedRevision),2);await expired();
   runtime.publish=publish;
   const beforeResume=gets,resumed=await handler(request(savedOperation));assert.equal(resumed.status,200);
   assert.equal((await resumed.json()).publication.phase,'applied');assert.equal(gets,beforeResume,'saved revision resumes even after cache removal');
  }
  console.log(`MANAGEMENT_REGISTRATION_READ=${baseline?'BASELINE_REPRODUCED':'PASS'} REGISTER_LOCK_DURING_FETCH=${baseline?1:0} INDEPENDENT_PUBLISH=${baseline?0:1} ONBOARDING_DISCOVERY=${baseline?2:0} STALE_NO_DRAFT=${baseline?0:1} SAVED_DRAFT_RESUME=${baseline?0:1} REPLAY_ACTIVATIONS=0 SUPPLIER_CALLS=0`);
 }finally{finish();await pending?.catch(()=>{});await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
