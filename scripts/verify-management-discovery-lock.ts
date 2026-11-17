import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createModelFixture} from './model-config-fixture';
import {fixtureConfig} from './billing-unit-fixture';
import {createModelManagementHandler} from '../src/lib/model-config/management-access';
import {createModelRuntime} from '../src/lib/model-config/runtime';
import {createRouterControl,type RouterStatus} from '../src/lib/model-config/router-client';

async function main(){
 const baseline=process.argv.includes('--baseline');
 let held:ServerResponse|undefined,gets=0,disconnected=false;
 const f=await createModelFixture((req,res)=>{
  if(req.url==='/slow/v1/models'||req.url==='/canceled/v1/models'){
   ++gets;held=res;res.once('close',()=>{if(!res.writableFinished)disconnected=true;});
   res.writeHead(200,{'content-type':'application/json'}).write('{"data":[{"id":"');return;
  }
  res.writeHead(404).end('{}');
 });
 let pending:Promise<Response>|undefined;
 const finish=()=>{if(held&&!held.writableEnded&&!held.destroyed)held.end('test-discovered"}]}');};
 try{
  let digest='',activations=0;
  const status=new Map<string,RouterStatus>();
  const router=createRouterControl({baseUrl:f.origin,token:'mvp-fixture-router-token-independent-long',envelopeSecret:'mvp-fixture-envelope-independent-long',trustedOrigins:[f.origin]});
  router.prepare=async()=>{};router.state=async()=>digest;router.status=async id=>status.get(id)??null;
  router.activate=async(id,expected,next)=>{
   assert.equal(digest,expected);digest=next;activations++;
   const receipt:RouterStatus={id,digest,phase:'applied'};status.set(id,receipt);return receipt;
  };
  const billing={version:1,config:fixtureConfig()},trustedOrigins=[f.origin],actor='management-fixture@example.test';
  const runtime=createModelRuntime({pool:f.sql,repo:f.repo,credentials:f.credentials,router,trustedOrigins,billing:async()=>billing,billingByVersion:async()=>billing});
  const handler=createModelManagementHandler({authorize:async()=>({actor}),administration:async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,router,runtime,billing:{current:async()=>billing},trustedOrigins}) as never,managed:async()=>true,mutationWaitMs:900});
  const request=(body?:unknown,signal?:AbortSignal)=>new Request('http://fixture.test/api/admin/model-management',body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal}:undefined);
  const initial=await f.repo.current();
  const initialView=await handler(request());assert.equal(initialView.status,200);
  const rowId=(await initialView.json()).rows[0].id;
  const id=randomUUID(),credential=await f.credentials.importPlain({providerId:`mvp-${id}`,plain:'fixture-supplier-credential',actor});
  const connect={action:'connect',id,expectedVersion:initial.version,name:'Slow fixture provider',protocol:'openai-images',baseUrl:f.origin+'/slow/v1',credentialRef:credential.id};
  pending=handler(request(connect));
  const until=Date.now()+2600;while(!held){assert.ok(Date.now()<until,'connect did not reach optional catalog discovery');await delay(15);}
  assert.equal(gets,1);
  const publication=await f.repo.publication(id);assert.equal(publication.phase,'applied');
  const lock=await f.sql.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS available',['admin-mvp:'+id]);
  assert.equal(lock.rows[0].available,!baseline);
  const rename={action:'rename',id:randomUUID(),expectedVersion:publication.version,rowId,label:'Unrelated rename while discovery waits'};
  const unrelated=await handler(request(rename));assert.equal(unrelated.status,baseline?409:200);
  if(baseline){const payload=await unrelated.json();assert.equal(payload.code,'PUBLICATION_LOCK_PENDING');assert.equal(payload.operationNotStaged,false);}
  assert.equal(activations,baseline?1:2);
  finish();const response=await pending;assert.equal(response.status,200);
  const receipt=await response.json();assert.equal(receipt.publication.version,publication.version);assert.equal(receipt.discovery.status,'ok');
  const replay=await handler(request(connect));assert.equal(replay.status,200);
  const repeated=await replay.json();assert.equal(repeated.publication.version,publication.version);assert.equal(repeated.discovery.status,'ok');
  assert.equal(gets,1);assert.equal(activations,baseline?1:2);
  if(!baseline){
   const id=randomUUID(),ref=await f.credentials.importPlain({providerId:`mvp-${id}`,plain:'cancellation-fixture',actor});
   const current=await f.repo.current(),controller=new AbortController();
   const canceled={...connect,id,expectedVersion:current.version,name:'Cancel optional metadata',baseUrl:f.origin+'/canceled/v1',credentialRef:ref.id};
   held=undefined;pending=handler(request(canceled,controller.signal));
   const deadline=Date.now()+2600;
   while(!held){assert.ok(Date.now()<deadline,'second connect did not reach directory');await delay(15);}
   controller.abort();const original=await pending;assert.equal(original.status,200);
   assert.equal((await original.json()).publication.phase,'applied');
   while(!disconnected){assert.ok(Date.now()<deadline,'cancellation did not close optional supplier body');await delay(15);}
   assert.equal((await f.repo.publication(id)).phase,'applied');assert.equal(activations,3);
  }
  console.log(`MANAGEMENT_DISCOVERY_LOCK=${baseline?'BASELINE_REPRODUCED':'PASS'} POST_PUBLISH_LOCK_HELD=${baseline?1:0} UNRELATED_PUBLISH=${baseline?0:1} ORIGINAL_RECEIPT=1 REPLAY_ACTIVATIONS=0 CANCELED_DISCOVERY=${baseline?0:1} SUPPLIER_CALLS=0`);
 }finally{finish();await pending?.catch(()=>{});await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
