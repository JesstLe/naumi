import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {createModelFixture} from './model-config-fixture';

async function until(check:()=>boolean,description:string){
 const deadline=Date.now()+2200;
 while(!check()){assert.ok(Date.now()<deadline,description);await delay(15);}
}

async function main(){
 assert.match(new URL(process.env.DATABASE_URL??'http://invalid').pathname,/fixture/);
 const baseline=process.argv.includes('--baseline');
 let upstream:ServerResponse|undefined,calls=0,upstreamAborts=0;
 const f=await createModelFixture((req,res)=>{
  assert.equal(req.method,'GET');assert.equal(req.url,'/balance');calls++;
  upstream=res;
  res.once('close',()=>{if(!res.writableFinished)upstreamAborts++;upstream=undefined;});
  res.writeHead(200,{'content-type':'application/json'});res.write('{"remaining":');
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1'});
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {getSetting,setSetting}=await import('../src/lib/settings/repository');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {createProviderOpsHandler}=await import('../src/lib/model-config/provider-balance-access');
 const {biAuthorize}=await import('../src/lib/bi/access');
 const {createProviderBalanceService,readProviderBalanceCredential,createPublishedProviderBalanceReader}=await import('../src/lib/model-config/provider-balance');
 const pool=getPool(),admin='admin@provider-abort.fixture';
 const responses=new Map<string,number>();
 let host='',creds=0,writes=0,time=Date.now();
 const service=createProviderBalanceService({
  secret:process.env.SETTINGS_SECRET!,
  now:()=>time,
  adapters:[{id:'fixture-adapter',origins:[f.origin],path:'/balance',source:{label:'Fixture',documentationUrl:null,revision:'fixture-1'},parse(body){
    const {remaining}=body as {remaining:number};return {kind:'account_balance',remaining,used:null,total:null,unlimited:null,unit:null};
  }}],
  readCredential:async (ref,id)=>{const value=await readProviderBalanceCredential(pool,ref,id);creds++;return value;},
  readCache:getSetting,writeCache:async (key,value)=>{writes++;await setSetting(key,value);},transport:()=>fetch,
 });
 const handler=createProviderOpsHandler({authorize:biAuthorize,overview:createPublishedProviderBalanceReader(pool,service)});
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,host),id=req.headers['x-fixture-probe'] as string;
   const response=await handler(new Request(url,{headers:{cookie:'nv_user='+signUserSession(admin,Date.now())},signal:signalFromNodeResponse(res)}));
   responses.set(id,response.status);
   if(!res.destroyed)res.writeHead(response.status,Object.fromEntries(response.headers)).end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.destroyed)res.writeHead(500).end();}
 });
 const requests:{controller:AbortController;done:Promise<Response|undefined>}[]=[];
 try{
  await f.repo.current();await getOrCreateUser(admin);await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));host=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const start=(id:string,refresh=false)=>{
   const controller=new AbortController(),done=fetch(host+'/api/admin/bi/provider-ops?view=balances'+(refresh?'&refresh=1':''),{headers:{'x-fixture-probe':id},signal:controller.signal}).catch(error=>{if(!controller.signal.aborted)throw error;return undefined;});
   const item={controller,done};requests.push(item);return item;
  };
  const first=start('first');await until(()=>!!upstream,'route did not reach the supplier HTTP body');
  const second=start('second');await until(()=>creds===2,'second authorized request did not reach the account read');
  first.controller.abort();await delay(100);
  assert.equal(calls,1);assert.equal(upstreamAborts,0);assert.ok(upstream,'second request still needs the shared supplier body');
  second.controller.abort();
  if(baseline){
   await delay(150);assert.equal(upstreamAborts,0);assert.ok(upstream);assert.equal(responses.size,0);
   upstream.end('7}');
   await until(()=>responses.size===2,'baseline did not finish abandoned work');
   assert.equal(writes,1);
   console.log('PROVIDER_BALANCE_CANCEL_BASELINE=PASS SHARED_REQUEST=1 LAST_DISCONNECT_DID_NOT_ABORT=1 ABANDONED_CACHE_WRITE=1');
  }else{
   await until(()=>upstreamAborts===1&&responses.get('first')===499&&responses.get('second')===499,'last disconnect did not cancel the shared read');
   assert.equal(writes,0);
   const retry=start('retry');await until(()=>calls===2&&!!upstream,'retry did not start an independent probe');
   upstream!.end('7}');
   const response=await retry.done;assert.equal(response?.status,200);assert.equal((await response!.json()).accounts[0].measurement.remaining,7);assert.equal(writes,1);
   time+=16_000;
   const next=start('next',true);await until(()=>calls===3&&!!upstream,'manual refresh did not start');
   const other=start('other',true);await until(()=>creds===5,'shared refresh did not admit its second page');
   next.controller.abort();await until(()=>responses.get('next')===499,'first refresh subscriber did not stop');
   assert.equal(upstreamAborts,1);assert.equal(calls,3);
   upstream!.end('9}');
   const otherResponse=await other.done;assert.equal(otherResponse?.status,200);
   assert.equal((await otherResponse!.json()).accounts[0].measurement.remaining,9);assert.equal(writes,2);
   console.log('PROVIDER_BALANCE_CANCEL=PASS LAST_DISCONNECT_ABORTED=1 SHARED_REQUEST=1 OTHER_PAGE_COMPLETES=1 RETRY_FRESH=1');
  }
 }finally{
  for(const request of requests)request.controller.abort();
  upstream?.end('7}');await Promise.allSettled(requests.map(request=>request.done));
  if(server.listening){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  await closeDatabasePools();await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
