import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client,type PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function until<T>(read:()=>Promise<T>,matches:(v:T)=>boolean,message:string){
 const end=Date.now()+2500;
 for(;;){const v=await read();if(matches(v))return v;assert.ok(Date.now()<end,message);await delay(15);}
}

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(new URL(process.env.DATABASE_URL??'http://invalid').hostname,'127.0.0.1');
 const baseline=process.argv.includes('--baseline');
 Object.assign(process.env,{SETTINGS_SECRET:'fixture-settings-0123456789abcdef0123456789abcdef0123456789',PGPOOL_MAX:'5'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 const guard=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
 let server:Server|undefined,locked=false,guardConnected=false;
 const pending:Promise<unknown>[]=[],controllers:AbortController[]=[];
 try{
  await guard.connect();guardConnected=true;
  await (await import('../src/lib/supplier-cost/schema')).ensureSupplierSchema(f.pool);
  await (await import('../src/lib/billing/schema')).ensureBillingSchema(f.pool);
  const {signSession}=await import('../src/lib/admin-auth');
  const {GET:list}=await import('../src/app/api/admin/supplier-cost/route');
  const {GET:chain}=await import('../src/app/api/admin/supplier-cost/operations/[id]/route');
  const {createSupplierLedger}=await import('../src/lib/supplier-cost/repository');
  const headers={cookie:'nv_admin='+signSession(Date.now())};
  const base='/api/admin/supplier-cost',operation='fixture-operation';
  const readChain=()=>chain(new Request('http://localhost'+base+'/operations/'+operation,{headers}),{params:Promise.resolve({id:operation})});
  assert.equal((await list(new Request('http://localhost'+base+'?view=calls',{headers}))).status,200);
  assert.equal((await readChain()).status,200);
  assert.equal((await chain(new Request('http://localhost'+base+'/operations/'+operation),{params:Promise.resolve({id:operation})})).status,404);
  const active=new Set<string>(),done=new Map<string,number>();
  server=createServer(async(req,res)=>{
   const id=String(req.headers['x-fixture-id']);active.add(id);
   try{
    const request=new Request('http://localhost'+req.url,{headers,signal:signalFromNodeResponse(res)});
    const response=req.url?.includes('/operations/')?await chain(request,{params:Promise.resolve({id:operation})}):await list(request);
    done.set(id,response.status);
    if(!res.destroyed){res.statusCode=response.status;res.end(await response.text());}
   }finally{active.delete(id);}
  });
  await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
  const waiting=async()=>{await guard.query('SELECT pg_stat_clear_snapshot()');return Number((await guard.query(`SELECT count(*) AS n FROM pg_stat_activity
   WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()
   AND query LIKE '%FROM app_supplier_calls%'`)).rows[0].n);};
  for(const kind of (baseline?['list','chain']:['list','chain','mixed'])){
   await guard.query('BEGIN; LOCK TABLE app_supplier_calls IN ACCESS EXCLUSIVE MODE');locked=true;
   const ids=Array.from({length:5},(_,i)=>kind+i);
   for(const [i,id] of ids.entries()){
    const controller=new AbortController();controllers.push(controller);
    const tail=kind==='chain'||kind==='mixed'&&i%2?'/operations/'+operation:'?view=calls';
    pending.push(fetch(origin+base+tail,{signal:controller.signal,headers:{'x-fixture-id':id}}).catch(e=>e));
   }
   const max=baseline?5:2;
   await until(waiting,n=>n===max,'unexpected concurrent supplier database waits: '+kind);
   await until(async()=>active.size,n=>n===5,'all HTTP requests did not enter the route');
   assert.equal(await waiting(),max);
   if(!baseline){
    const probe=await Promise.race([f.pool.query('SELECT 1 AS n'),delay(350).then(()=>null)]);
    assert.equal(probe?.rows[0].n,1,'business connection was not available during report burst');
   }
   for(const controller of controllers)controller.abort();
   await Promise.all(pending);
   if(baseline){assert.equal(await waiting(),max);await guard.query('ROLLBACK');locked=false;}
   else{await until(waiting,n=>n===0,'HTTP abort did not release blocked supplier reads');assert.equal(locked,true);}
   await until(async()=>ids.every(id=>done.has(id)),Boolean,'request handlers did not finish');
   if(!baseline){assert.deepEqual(ids.map(id=>done.get(id)),Array(5).fill(499));await guard.query('ROLLBACK');locked=false;}
  }
  if(!baseline){
   const ledger=createSupplierLedger(f.pool);
   await ledger.account({id:'fixture-account',providerId:'fixture',protocol:'openai-images',baseUrl:'http://127.0.0.1:1'});
   const call=await ledger.begin({operationId:operation,attemptId:'fixture-attempt',accountId:'fixture-account',providerId:'fixture',model:'fixture-model',phase:'generation',feature:'canvas.image'});
   const tracking=new Map<PoolClient,PoolClient['query']>(),queries:{tx:PoolClient;sql:string}[]=[];let inserted=false;
   const acquire=(tx:PoolClient)=>{
    if(tracking.has(tx))return;
    const original=tx.query;tracking.set(tx,original);
    tx.query=function(this:PoolClient,...args:unknown[]){
     const sql=typeof args[0]==='string'?args[0]:'';
     queries.push({tx,sql});
     const result=Reflect.apply(original,this,args);
     if(!inserted&&sql.startsWith('SELECT * FROM app_supplier_calls WHERE operation_id=')){
      inserted=true;
      return Promise.resolve(result).then(async value=>{
       await guard.query("INSERT INTO app_supplier_call_outputs(call_id,output_index,state) VALUES($1,0,'succeeded')",[call.id]);
       return value;
      });
     }
     return result;
    } as PoolClient['query'];
   };
   f.pool.on('acquire',acquire);
   try{
    const response=await readChain();assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/private.*no-store/);
    const old=await response.json();assert.equal(old.rows[0].id,call.id);assert.deepEqual(old.outputs,[]);
    const start=queries.findIndex(({sql})=>sql.includes('REPEATABLE READ READ ONLY'));
    const end=queries.findIndex(({sql})=>sql==='COMMIT');
    assert.ok(start>=0&&end>start);
    const chainReads=queries.slice(start,end);
    assert.equal(new Set(chainReads.map(({tx})=>tx)).size,1);
    assert.equal(chainReads.filter(({sql})=>sql.startsWith('SELECT')).length,5);
    assert.ok(queries.every(({sql})=>!/\b(?:CREATE|ALTER)\b/.test(sql)));
   }finally{f.pool.off('acquire',acquire);for(const [tx,q] of tracking)tx.query=q;}
   const next=await (await readChain()).json();
   assert.equal(next.outputs[0].call_id,call.id);assert.equal(next.outputs[0].state,'succeeded');
  }
  console.log(baseline?'SUPPLIER_COST_ADMIN_BASELINE=PASS LIST_WAITS=5 CHAIN_WAITS=5 DISCONNECT_RETAINS_SQL=2 REAL_PG=1':
   'SUPPLIER_COST_ADMIN_READ=PASS LIST_WAITS=2 CHAIN_WAITS=2 MIXED_WAITS=2 DISCONNECT_RELEASE=3 BUSINESS_POOL_FREE=1 CHAIN_SNAPSHOT=1 ONE_CHAIN_CLIENT=1 REAL_PG=1');
 }finally{
  for(const controller of controllers)controller.abort();
  if(locked)await guard.query('ROLLBACK');
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  await Promise.allSettled(pending);
  if(guardConnected)await guard.end();
  await f.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
