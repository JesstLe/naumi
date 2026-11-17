import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type ServerResponse} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import type {PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {fixtureModelConfig} from './model-config-unit-fixture';

async function until(test:()=>boolean|Promise<boolean>,message:string){
 const end=Date.now()+3000;while(!await test()){assert.ok(Date.now()<end,message);await delay(15);}
}
const path='/api/admin/billing/image25-prices';
async function main(){
 const baseline=process.argv.includes('--baseline');
 process.env.SETTINGS_SECRET='fixture-settings-0123456789abcdef0123456789abcdef0123456789';
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 let held:ServerResponse|undefined;const requests:string[]=[];
 const router=createServer((req,res)=>{requests.push(req.url??'');held=res;});
 let lock:PoolClient|undefined,routeBusy:Promise<void>|undefined,routerListening=false,appListening=false;
 let handle:((signal:AbortSignal)=>Promise<Response>)|undefined,onRouteFinish:(status:number)=>void=()=>{};
 const app=createServer(async(_req,res)=>{
  const response=await handle!(signalFromNodeResponse(res));onRouteFinish(response.status);
  if(!res.destroyed){res.statusCode=response.status;res.end(await response.text());}
 });
 try{
  await new Promise<void>(resolve=>router.listen(0,'127.0.0.1',resolve));routerListening=true;
  const trusted='http://127.0.0.1:'+(router.address() as {port:number}).port;
  Object.assign(process.env,{NAUMI_ROUTER_MANAGEMENT_URL:trusted,MODEL_CONFIG_TRUSTED_ORIGINS:trusted,
   NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-management-0123456789abcdef0123456789abcdef',
   MODEL_CONFIG_ENVELOPE_SECRET:'fixture-envelope-0123456789abcdef0123456789abcdef'});
  const {ensureModelSchema}=await import('../src/lib/model-config/storage-schema');
  await ensureModelSchema(f.pool);
  const {GET}=await import('../src/app/api/admin/billing/image25-prices/route'),{signSession}=await import('../src/lib/admin-auth');
  const headers={cookie:'nv_admin='+signSession(Date.now())},make=(signal?:AbortSignal)=>new Request('http://localhost'+path,{headers,signal});
  handle=signal=>GET(make(signal));
  assert.equal((await GET(new Request('http://localhost'+path))).status,404);
  if(baseline){
   const cancel=new AbortController();let returned=false;
   const reading=GET(make(cancel.signal)).finally(()=>{returned=true;});
   await until(()=>!!held,'cold price GET did not call user-independent Router discovery');
   assert.deepEqual(requests,['/internal/config/legacy']);
   cancel.abort();await delay(50);assert.equal(returned,false);assert.equal(held!.destroyed,false);
   held!.writeHead(503).end('{}');assert.equal((await reading).status,200);
   delete process.env.NAUMI_ROUTER_MANAGEMENT_URL;
  }else{
   const cold=await GET(make(AbortSignal.timeout(1500)));assert.equal(cold.status,200);
   const value=await cold.json();assert.equal(value.conversion.referenceOnly,true);
   assert.equal(requests.length,0);
  }
  const records=async()=>(await f.pool.query(`SELECT (SELECT count(*)::int FROM app_model_config_versions) versions,
      (SELECT count(*)::int FROM app_model_config_state) pointers,(SELECT count(*)::int FROM app_model_credentials) credentials`)).rows[0];
  assert.deepEqual(await records(),{versions:0,pointers:0,credentials:0});
  const cfg=fixtureModelConfig(trusted,randomUUID());
  delete cfg.providers[0].credentialRef;
  const {initializeImagePreset}=await import('../src/lib/model-config/image-preset');
  cfg.defaultImagePreset={...initializeImagePreset(cfg),fx:{rateMicros:'7250000',basis:'admin-rate',evidence:'fixture verified rate',updatedAt:'2026-01-02T00:00:00Z'},
    creditsPerCnyMicros:'12000000',rounding:'ceil'};
  const insert=async(config:unknown)=>Number((await f.pool.query(`INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest)
   VALUES($1,'fixture','test',$2::jsonb,'fixture') RETURNING version`,[randomUUID(),JSON.stringify(config)])).rows[0].version);
  const active=await insert(cfg);
  const later=await insert({...cfg,defaultImagePreset:{...cfg.defaultImagePreset,fx:{...cfg.defaultImagePreset.fx,rateMicros:'8100000'}}});
  await f.pool.query('INSERT INTO app_model_config_state(singleton,active_version) VALUES(true,$1)',[active]);
  if(baseline){
   const published=await (await GET(make())).json();assert.equal(published.conversion.rateMicros,'7000000');
   assert.equal(published.conversion.referenceOnly,true);
   console.log('IMAGE25_ADMIN_READ_BASELINE=PASS COLD_ROUTER_DISCOVERY=1 DISCONNECT_RETAINS_ROUTER=1 PUBLISHED_REQUIRES_ROUTER_CONFIG=1 REAL_PG=1');
   return;
  }
  delete process.env.NAUMI_ROUTER_MANAGEMENT_URL;
  const published=await GET(make());assert.equal(published.status,200);assert.match(published.headers.get('cache-control')??'',/private.*no-store/);
  const value=await published.json();
  assert.equal(value.conversion.modelVersion,active);assert.equal(value.conversion.rateMicros,'7250000');
  assert.equal(value.rows[0].prices.medium.gold.saleCny,'0.229158');assert.equal(value.liveBillingChanged,false);
  await f.pool.query('UPDATE app_model_config_state SET active_version=$1',[later]);
  const next=await (await GET(make())).json();
  assert.equal(next.conversion.modelVersion,later);assert.equal(next.conversion.rateMicros,'8100000');
  assert.equal(next.rows[0].prices.medium.gold.saleCny,'0.256025');
  const malformed=await insert({...cfg,defaultImagePreset:{...cfg.defaultImagePreset,fx:{rateMicros:8100000,evidence:{mustNotLeak:'fixture-internal'}}}});
  await f.pool.query('UPDATE app_model_config_state SET active_version=$1',[malformed]);
  const fallback=await GET(make());
  const fallbackText=await fallback.text();assert.equal(JSON.parse(fallbackText).conversion.referenceOnly,true);assert.ok(!fallbackText.includes('mustNotLeak'));
  await f.pool.query('UPDATE app_model_config_state SET active_version=$1',[later]);
  lock=await f.pool.connect();await lock.query('BEGIN; LOCK TABLE app_model_config_versions IN ACCESS EXCLUSIVE MODE');
  await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));appListening=true;
  let status=0;routeBusy=new Promise(resolve=>{onRouteFinish=result=>{status=result;resolve();};});
  const cancel=new AbortController();
  const http=fetch('http://127.0.0.1:'+(app.address() as {port:number}).port+path,{signal:cancel.signal}).catch(e=>e);
  const waiting=async()=>Boolean((await f.pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
   AND wait_event_type='Lock' AND query LIKE '%app_model_config_versions%'`)).rowCount);
  await until(waiting,'price GET did not reach the held table');
  cancel.abort();await http;await routeBusy;
  await until(async()=>!await waiting(),'aborted price GET kept its lock wait');assert.equal(status,499);
  await lock.query('ROLLBACK');lock.release();lock=undefined;
  assert.deepEqual(await records(),{versions:3,pointers:1,credentials:0});assert.equal(requests.length,0);
  console.log('IMAGE25_ADMIN_READ=PASS ROUTER_DISCOVERY=0 NO_GET_BOOTSTRAP=1 PUBLISHED_VERSION_CONSISTENT=1 INVALID_FX_FALLBACK=1 DISCONNECT_RELEASE=1 PRIVATE=1 REAL_PG=1');
 }finally{
  if(lock){await lock.query('ROLLBACK');lock.release();}
  if(held&&!held.writableEnded)held.writeHead(503).end('{}');
  if(routeBusy)await routeBusy;
  if(appListening){app.closeAllConnections();await new Promise<void>(resolve=>app.close(()=>resolve()));}
  if(routerListening){router.closeAllConnections();await new Promise<void>(resolve=>router.close(()=>resolve()));}
  await f.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
