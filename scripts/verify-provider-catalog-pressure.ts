import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {createModelFixture} from './model-config-fixture';

async function until(check:()=>boolean,reason:string){
 const end=Date.now()+2500;while(!check()){assert.ok(Date.now()<end,reason);await delay(15);}
}
async function main(){
 assert.match(new URL(process.env.DATABASE_URL??'http://invalid').pathname,/fixture/);
 const baseline=process.argv.includes('--baseline'),pending=new Map<string,ServerResponse[]>(),aborted=new Set<ServerResponse>();
 let modelGets=0,publicGets=0,holdPublic=false,publicBody:ServerResponse|undefined,routeStatus:number|undefined;
 let handler:((request:Request)=>Promise<Response>)|undefined;
 const f=await createModelFixture(async(req,res)=>{
  if(req.url==='/api/admin/bi/model-config/catalog'&&handler){
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
   const result=await handler(new Request(f.origin+req.url,{method:'POST',headers:{origin:req.headers.origin??'','content-type':'application/json'},body:Buffer.concat(chunks),signal:signalFromNodeResponse(res)}));
   routeStatus=result.status;
   if(!res.destroyed)res.writeHead(result.status).end(await result.text());
   return;
  }
  if(req.url==='/api/pricing'){publicGets++;if(holdPublic){publicBody=res;return;}res.writeHead(404).end('{}');return;}
  assert.equal(req.method,'GET');const name=req.url!.split('/')[1];modelGets++;
  const active=pending.get(name)??[];active.push(res);pending.set(name,active);
  res.once('close',()=>{if(!res.writableFinished)aborted.add(res);});
  res.writeHead(200,{'content-type':'application/json'}).write('{"data":[{"id":"');
 });
 const observer=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:2,options:`-c search_path=${f.schemaName}`});
 const {refreshProviderCatalog,readProviderCatalog}=await import('../src/lib/model-config/catalog-store');
 const {createCredentialStore}=await import('../src/lib/model-config/credentials');
 const providers=await Promise.all(Array.from({length:4},async(_,i)=>{
  const id='catalog-'+i,ref=await f.credentials.importPlain({providerId:id,plain:'fixture-'+i,actor:'fixture'});
  return {...f.config.providers[0],id,credentialRef:ref.id,baseUrl:`${f.origin}/p${i}/v1`};
 }));
 const peer=createCredentialStore(observer),work:Promise<unknown>[]=[];
 const release=(res:ServerResponse,id:string)=>{if(!res.destroyed&&!res.writableEnded)res.end(id+'"}]}');};
 const refresh=(i:number,force=false,signal?:AbortSignal)=>{
  const result=refreshProviderCatalog(f.sql,providers[i],f.credentials,[f.origin],fetch,force,signal);
  work.push(result.catch(()=>{}));return result;
 };
 try{
  const all=providers.map((_,i)=>refresh(i));
  await until(()=>modelGets===4,'four upstream requests did not reach their held bodies');
  const waiting=(await observer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n;
  assert.equal(waiting,baseline?4:0);
  assert.equal((await f.sql.query('SELECT 1 AS n')).rows[0].n,1);
  const duplicate=await refreshProviderCatalog(observer,providers[0],peer,[f.origin],fetch,true);
  assert.equal(duplicate.refreshing,true);assert.equal(modelGets,4);
  for(const [path,list] of pending)release(list[0],'fresh-'+path);
  const receipts=await Promise.all(all);
  assert.ok(receipts.every(value=>value.status==='ok'&&value.metadataSaved));
  assert.equal(publicGets,4);
  assert.deepEqual((await readProviderCatalog(f.sql,providers)).map(e=>e.models[0].id),['fresh-p0','fresh-p1','fresh-p2','fresh-p3']);
  if(!baseline){
   const controller=new AbortController(),stopped=refresh(0,true,controller.signal);
   await until(()=>pending.get('p0')?.length===2,'abort probe did not begin');
   controller.abort();await assert.rejects(stopped,e=>e===controller.signal.reason);
   await until(()=>aborted.has(pending.get('p0')![1]),'abort did not close upstream body');
   assert.equal((await readProviderCatalog(f.sql,[providers[0]]))[0].models[0].id,'fresh-p0');
   const slow=refresh(0,true);
   await until(()=>pending.get('p0')?.length===3,'retry did not reacquire the released lease');
   const key=createHash('sha256').update(JSON.stringify([providers[0].id,providers[0].baseUrl,providers[0].protocol,providers[0].credentialRef])).digest('hex');
   await observer.query("UPDATE app_model_provider_catalog_refresh SET expires_at=now()-interval '1 second' WHERE fingerprint=$1",[key]);
   const winner=refreshProviderCatalog(observer,providers[0],peer,[f.origin],fetch,true);
   work.push(winner.catch(()=>{}));
   await until(()=>pending.get('p0')?.length===4,'expired refresh was not reclaimable');
   release(pending.get('p0')![3],'replacement');assert.equal((await winner).models[0].id,'replacement');
   release(pending.get('p0')![2],'obsolete');assert.equal((await slow).models[0].id,'replacement');
   assert.equal((await readProviderCatalog(f.sql,[providers[0]]))[0].models[0].id,'replacement');

   holdPublic=true;
   const oldMetadata=refresh(0,true);
   await until(()=>pending.get('p0')?.length===5,'metadata probe did not start');
   release(pending.get('p0')![4],'legacy-metadata');
   await until(()=>!!publicBody,'public directory phase did not start');
   const cacheHit=await refreshProviderCatalog(observer,providers[0],peer,[f.origin],fetch,false);
   assert.equal(cacheHit.cached,true);assert.equal(cacheHit.refreshing,undefined);assert.equal(cacheHit.models[0].id,'legacy-metadata');
   holdPublic=false;
   await observer.query("UPDATE app_model_provider_catalog_refresh SET expires_at=now()-interval '1 second' WHERE fingerprint=$1",[key]);
   const newest=refreshProviderCatalog(observer,providers[0],peer,[f.origin],fetch,true);
   work.push(newest.catch(()=>{}));
   await until(()=>pending.get('p0')?.length===6,'a new metadata owner did not acquire the expired claim');
   release(pending.get('p0')![5],'current-metadata');assert.equal((await newest).models[0].id,'current-metadata');
   publicBody!.writeHead(404).end('{}');
   assert.equal((await oldMetadata).models[0].id,'current-metadata');
   const metadata=(await observer.query("SELECT model_id FROM app_supplier_model_metadata WHERE provider_id=$1 AND model_id=ANY($2::text[])",[providers[0].id,['legacy-metadata','current-metadata']])).rows;
   assert.deepEqual(metadata.map(row=>row.model_id),['current-metadata']);

   const racing=refresh(0,true);
   await until(()=>pending.get('p0')?.length===7,'rolling compatibility probe did not start');
   const legacy=await observer.connect();
   try{
    await legacy.query('BEGIN');
    await legacy.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['provider-catalog:'+key]);
    await legacy.query("UPDATE app_model_provider_catalog SET result=jsonb_set(result,'{models}',$2::jsonb),updated_at=now() WHERE fingerprint=$1",[key,JSON.stringify([{id:'legacy-winner',label:'Legacy winner'}])]);
    await legacy.query('COMMIT');
   }finally{await legacy.query('ROLLBACK');legacy.release();}
   release(pending.get('p0')![6],'would-overwrite-legacy');
   assert.equal((await racing).models[0].id,'legacy-winner');

   const {createCatalogHandler}=await import('../src/lib/model-config/catalog-access');
   f.config.providers.push(...providers);
   const actor='catalog-pressure-actor',draft=await f.repo.draft(actor),provider=providers[2];
   await observer.query("UPDATE app_model_provider_catalog SET updated_at=now()-interval '6 minutes' WHERE provider_id=$1",[provider.id]);
   handler=createCatalogHandler({authorize:async()=>({actor}),administration:async()=>({pool:f.sql,repo:f.repo,credentials:f.credentials,trustedOrigins:[f.origin]}) as never,fetcher:fetch});
   const client=new AbortController();
   const response=fetch(f.origin+'/api/admin/bi/model-config/catalog',{method:'POST',headers:{origin:f.origin,'content-type':'application/json'},
     body:JSON.stringify({providerId:provider.id,draftId:draft.id,expectedRevision:draft.revision}),signal:client.signal}).catch(error=>{if(!client.signal.aborted)throw error;});
   try{
    await until(()=>pending.get('p2')?.length===2,'actual catalogue HTTP route did not reach supplier');
    client.abort();
    await until(()=>routeStatus===499&&aborted.has(pending.get('p2')![1]),'HTTP disconnect did not leave the supplier transport');
   }finally{client.abort();await response;}
   assert.equal((await readProviderCatalog(f.sql,[provider]))[0].models[0].id,'fresh-p2');
   assert.equal((await observer.query('SELECT count(*)::int AS n FROM app_model_provider_catalog_refresh')).rows[0].n,0);
  }
  console.log((baseline?'PROVIDER_CATALOG_PRESSURE_BASELINE=PASS':'PROVIDER_CATALOG_PRESSURE=PASS')+` IDLE_IN_TX=${waiting} CROSS_POOL_DEDUP=1 ABORT_FENCE=${baseline?0:1} METADATA_FENCE=${baseline?0:1} ROLLING_CAS=${baseline?0:1} HTTP_ABORT=${baseline?0:1}`);
 }finally{
  for(const list of pending.values())for(const res of list)release(res,'cleanup');
  if(publicBody&&!publicBody.writableEnded)publicBody.writeHead(404).end('{}');
  await Promise.allSettled(work);await observer.end();await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
