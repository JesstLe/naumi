import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool, type PoolClient} from 'pg';
import {NextResponse} from 'next/server';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';
import {createModelFixture} from './model-config-fixture';

const first='/api/admin/model-management/library',alias='/api/admin/mvp/library';
async function until(check:()=>Promise<boolean>,reason:string){
 const end=Date.now()+2300;
 while(!await check()){assert.ok(Date.now()<end,reason);await delay(20);}
}
async function main(){
 assert.match(new URL(process.env.DATABASE_URL??'http://invalid').pathname,/fixture/);
 const baseline=process.argv.includes('--baseline');
 const exportBaseline=process.argv.includes('--export-baseline');
 let handler:((request:Request)=>Promise<Response>)|undefined;
 const f=await createModelFixture(async(req,res)=>{
  const path=req.url??'';
  if(!handler||![first,alias].includes(path.split('?')[0])){res.writeHead(404).end();return;}
  const result=await handler(new Request(f.origin+path,{headers:{'x-fixture-access':String(req.headers['x-fixture-access']??'')},signal:signalFromNodeResponse(res)}));
  if(!res.destroyed)res.writeHead(result.status).end(await result.text());
 });
 const observer=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:2,options:`-c search_path=${f.schemaName}`});
 const {createSupplierModelsHandler}=await import('../src/lib/supplier-models/access');
 const {readPublishedModelSnapshot}=await import('../src/lib/model-config/published-repository');
 const {ensureSupplierModels}=await import('../src/lib/supplier-models/schema');
 const {unknownSupplierMetadata}=await import('../src/lib/supplier-models/types');
 const actor='supplier-library-admin@example.test';
 const work:Promise<unknown>[]=[];
 let lock:PoolClient|undefined;
 let facetRows=0;
 let metadataStatements:string[]=[];
 let insertAfterPage:(()=>Promise<void>)|undefined;
 try{
  await ensureSupplierModels(f.sql);
  const stable=await f.repo.current();
  handler=createSupplierModelsHandler({authorize:async request=>request.headers.get('x-fixture-access')==='denied'?NextResponse.json({},{status:404}):({actor}),administration:async()=>{
   assert.ok(baseline,'GET must not initialize or assemble the model administration runtime');
   return {...f,pool:f.sql,trustedOrigins:[f.origin]} as never;
  },...(baseline?{}:{readPorts:()=>({pool:f.sql,model:tx=>readPublishedModelSnapshot(tx,{trustedOrigins:[f.origin]})})})});
  await f.sql.query(`INSERT INTO app_supplier_model_metadata(id,provider_id,provider_name,model_id,label,family,brand,metadata)
   SELECT gen_random_uuid(),'provider-'||(g%4),CASE WHEN g%4=0 AND g<9 THEN 'A' ELSE 'Z'||(g%4) END,
    'model-'||g,'Model '||g,'family-'||(g%8),'brand-'||(g%6),$1::jsonb FROM generate_series(1,12000) g`,[JSON.stringify(unknownSupplierMetadata())]);
  const patched=new WeakSet<PoolClient>();
  f.sql.on('acquire',client=>{
   if(patched.has(client))return;patched.add(client);
   const query=client.query.bind(client);
   (client as any).query=(sql:any,...args:any[])=>{
    if(typeof sql==='string'&&sql.includes('FROM app_supplier_model_metadata'))metadataStatements.push(sql);
    const facet=typeof sql==='string'&&/provider_name/.test(sql)&&/family/.test(sql)&&/brand/.test(sql)&&!sql.includes('LIMIT 50')&&!sql.includes('INSERT');
    if(facet&&typeof args.at(-1)==='function'){
     const callback=args.at(-1);
     args[args.length-1]=(error:unknown,response:any)=>{if(!error)facetRows+=response.rowCount;callback(error,response);};
     return (query as any)(sql,...args);
    }
    const result=(query as any)(sql,...args);
    if(facet)return result.then((response:any)=>{facetRows+=response.rowCount;return response;});
    if(insertAfterPage&&typeof sql==='string'&&sql.includes('LIMIT 50 OFFSET')){
     const insert=insertAfterPage;insertAfterPage=undefined;
     return result.then(async(response:unknown)=>{await insert();return response;});
    }
    return result;
   };
  });
  const success=await fetch(f.origin+alias+'?view=summary&provider=provider-0&page=2');
  assert.equal(success.status,200);const body=await success.json();
  assert.equal(body.schemaVersion,1);assert.equal(body.modelVersion,stable.version);
  assert.equal(body.total,3000);assert.equal(body.models.length,50);assert.equal(body.page,2);
  assert.deepEqual(body.facets.providers,[0,1,2,3].map(i=>({id:'provider-'+i,name:'Z'+i})));
  assert.deepEqual(body.facets.families,Array.from({length:8},(_,i)=>'family-'+i));
  assert.deepEqual(body.facets.brands,Array.from({length:6},(_,i)=>'brand-'+i));
  if(baseline)assert.equal(facetRows,12000);else assert.ok(facetRows>0&&facetRows<=20);
  const observed=facetRows;
  if(!baseline){
   const filter='q=model&provider=provider-0&family=family-0&brand=brand-0&page=2';
   const classic=await fetch(f.origin+first+'?'+filter);assert.equal(classic.status,200);
   const original=await classic.json();assert.ok(original.total>50&&original.facets.families.length>0);
   assert.equal(original.models.length,50);assert.ok(original.models.every((m:{modelId:string})=>Number(m.modelId.slice(6))%24===0));
   for(const path of [first,alias]){
    metadataStatements=[];
    const response=await fetch(f.origin+path+'?view=export&'+filter);assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.schemaVersion,1);assert.deepEqual(data.models,original.models);
    assert.equal(metadataStatements.length,exportBaseline?3:1);
    assert.match(metadataStatements[0],/LIMIT 50 OFFSET/);
    if(exportBaseline){assert.equal(data.total,original.total);assert.match(metadataStatements[1],/count\(\*\)/i);assert.match(metadataStatements[2],/GROUPING SETS/);}
    else assert.deepEqual(Object.keys(data).sort(),['models','schemaVersion']);
   }
   metadataStatements=[];
   assert.equal((await fetch(f.origin+first+'?view=export&page=2',{headers:{'x-fixture-access':'denied'}})).status,404);
   assert.equal((await fetch(f.origin+alias+'?view=export&page=201')).status,400);
   assert.equal(metadataStatements.length,0);
   console.log(`SUPPLIER_LIBRARY_EXPORT=${exportBaseline?'BASELINE_REPRODUCED':'PASS'} METADATA_STATEMENTS=${exportBaseline?3:1} EXACT_PAGE=1 LEGACY_SHAPE=1 AUTH_LIMITS=1 SUPPLIER_CALLS=0`);
   if(exportBaseline)return;
  }
  lock=await observer.connect();await lock.query('BEGIN');
  await lock.query('LOCK app_supplier_model_metadata IN ACCESS EXCLUSIVE MODE');
  const waiting=async()=>Number((await observer.query(`SELECT count(*) FROM pg_stat_activity
    WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%app_supplier_model_metadata%' AND pid<>pg_backend_pid()`)).rows[0].count);
  const controllers=[new AbortController(),new AbortController()];
  for(const [i,path] of [baseline?first:first+'?view=export',alias].entries())work.push(fetch(f.origin+path,{signal:controllers[i].signal}).catch(()=>null));
  const before=baseline?5:2;
  await until(async()=>await waiting()===before,'Unexpected number of database connections blocked by two library reads');
  controllers[0].abort();
  if(baseline){await delay(350);assert.equal(await waiting(),5);}
  else{await until(async()=>await waiting()===1,'Cancelled library read retained a database connection');assert.equal((await f.sql.query('SELECT 1 AS n')).rows[0].n,1);}
  await lock.query('ROLLBACK');lock.release();lock=undefined;
  const [,second]=await Promise.all(work) as [null,Response];assert.equal(second.status,200);
  if(!baseline){
   const metadata=JSON.stringify(unknownSupplierMetadata());
   await observer.query(`INSERT INTO app_supplier_model_metadata(id,provider_id,provider_name,model_id,label,metadata)
    VALUES(gen_random_uuid(),'snapshot','Snapshot','first','first',$1)`,[metadata]);
   insertAfterPage=async()=>{await observer.query(`INSERT INTO app_supplier_model_metadata(id,provider_id,provider_name,model_id,label,metadata)
    VALUES(gen_random_uuid(),'snapshot','Snapshot','second','second',$1)`,[metadata]);};
   const stableRead=await fetch(f.origin+first+'?view=summary&provider=snapshot');assert.equal(stableRead.status,200);
   const same=await stableRead.json();assert.deepEqual(same.models.map((m:{modelId:string})=>m.modelId),['first']);assert.equal(same.total,1);
   const latest=await (await fetch(f.origin+alias+'?view=summary&provider=snapshot')).json();assert.equal(latest.total,2);
   const id=same.models[0].id,detail=await fetch(f.origin+first+'?id='+id),history=await fetch(f.origin+alias+'?history='+id);
   assert.equal(detail.status,200);assert.equal((await detail.json()).model.modelId,'first');
   assert.equal(history.status,200);assert.deepEqual((await history.json()).versions,[]);
   assert.equal((await fetch(f.origin+alias+'?history=00000000-0000-0000-0000-000000000000')).status,404);
  }
  console.log(`SUPPLIER_LIBRARY_READ_PRESSURE=${baseline?'BASELINE_REPRODUCED':'PASS'} BLOCKED_CONNECTIONS=${before} FACET_ROWS=${observed} HTTP_ABORT_RELEASE=${baseline?0:1} SUPPLIER_CALLS=0`);
 }finally{
  if(lock){await lock.query('ROLLBACK').catch(()=>{});lock.release();}
  await Promise.allSettled(work);await observer.end();await f.cleanup();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
