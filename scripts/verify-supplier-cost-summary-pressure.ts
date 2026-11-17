import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';

type Plan={['Node Type']:string;['Relation Name']?:string;['Index Name']?:string;['Actual Rows']:number;['Actual Loops']:number;['Plan Width']:number;['Shared Hit Blocks']?:number;['Shared Read Blocks']?:number;Plans?:Plan[]};
type Captured={query:string;args:unknown[];rows:number;bytes:number};
const nodes=(item:Plan):Plan[]=>[item,...(item.Plans??[]).flatMap(nodes)];
function order(value:unknown):unknown{
 if(Array.isArray(value))return value.map(order);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,order(item)]));
 return value;
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(order(value))).digest('hex');

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 assert.equal(new URL(process.env.DATABASE_URL??'http://invalid').hostname,'127.0.0.1');
 const baseline=process.argv.includes('--baseline');
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  const {ensureBillingSchema}=await import('../src/lib/billing/schema'),{ensureSupplierSchema}=await import('../src/lib/supplier-cost/schema');
  await ensureBillingSchema(f.pool);await ensureSupplierSchema(f.pool);
  const {createSupplierLedger}=await import('../src/lib/supplier-cost/repository'),{costsSummary}=await import('../src/lib/supplier-cost/admin');
  const ledger=createSupplierLedger(f.pool);
  await ledger.account({id:'fixture-load',providerId:'fixture',protocol:'openai-images',baseUrl:'http://127.0.0.1:1'});
  await f.pool.query(`INSERT INTO app_supplier_calls(id,operation_id,user_email,feature,attempt_id,account_id,provider_id,model,phase,
    state,cost_status,amount_micros,currency,credits_micros,cny_micros,fx,started_at,parameters)
   SELECT md5('fixture-'||op||'-'||stage)::uuid,'operation-'||op,'load@example.test','canvas.image',op||'-'||stage,'fixture-load','fixture',
    CASE WHEN stage=1 THEN 'selected-model' ELSE 'other-model' END,'generation','completed',
    (ARRAY['reported','estimated','pending','reconciled'])[1+(op+stage)%4],
    (op+stage)::numeric,CASE WHEN op%17=0 THEN NULL WHEN op%2=0 THEN 'CNY' ELSE 'USD' END,(op*6+stage)::numeric,
    CASE WHEN op%13=0 THEN NULL ELSE (op*7+stage)::numeric END,jsonb_build_object('basis',CASE WHEN op%19=0 THEN 'budget' ELSE 'admin-rate' END),
    '2026-01-01T00:00:00Z'::timestamptz+make_interval(secs=>CASE WHEN op=1 AND stage=8 THEN 864000 ELSE op*10+stage END),
    jsonb_build_object('fixturePadding',repeat(md5(op::text||':'||stage),24))
   FROM generate_series(1,6000) op CROSS JOIN generate_series(1,8) stage`);
  await f.pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,state,charged_credits,request_fingerprint,ledger_id,settlement_result)
   SELECT 'operation-'||op,'load@example.test','canvas.image',
    jsonb_build_object('tariff',jsonb_build_object('unit',CASE WHEN op%7=0 THEN 'request' ELSE 'image' END,'pricing',jsonb_build_object('creditsPerCnyMicros',CASE WHEN op%9=0 THEN '12500000000'::jsonb ELSE '"12500000000"'::jsonb END)),
    'more',repeat(md5(op::text),64)),CASE WHEN op%11=0 THEN 'manual' ELSE 'settled' END,op%50,'fixture','ledger-'||op,
    jsonb_build_object('items',CASE WHEN op%23=0 THEN '{"unexpected":true}'::jsonb ELSE '[{"state":"succeeded"},{"state":"failed"},{"state":"succeeded"}]'::jsonb END,'more',repeat(md5(op::text),64))
   FROM generate_series(1,6000) op`);
  await f.pool.query(`INSERT INTO app_supplier_variable_costs(id,operation_id,amount_cny_micros,label,evidence,actor)
   SELECT md5('extra-'||op||':'||cost)::uuid,'operation-'||op,(op+cost)::numeric,'fixture','fixture','fixture'
   FROM generate_series(1,6000) op CROSS JOIN generate_series(1,5) cost`);
  await f.pool.query('ANALYZE app_supplier_calls; ANALYZE app_billing_operations; ANALYZE app_supplier_variable_costs');
  const tx=await f.pool.connect();
  const measure=async<T>(call:()=>Promise<T>)=>{
   const captured:Captured[]=[],original=tx.query;
   tx.query=function(this:PoolClient,...args:unknown[]){
    return Promise.resolve(Reflect.apply(original,this,args)).then(value=>{
     const rows=(value as {rows:unknown[]}).rows;
     captured.push({query:String(args[0]),args:(args[1]??[]) as unknown[],rows:rows.length,bytes:Buffer.byteLength(JSON.stringify(rows))});
     return value;
    });
   } as PoolClient['query'];
   try{return {value:await call(),captured};}finally{tx.query=original;}
  };
  try{
   const filter={model:'selected-model',from:'2026-01-01T00:00:00Z',to:'2026-01-02T00:00:00Z'};
   const long=await measure(()=>costsSummary(ledger,filter,tx));
   const deep=await measure(()=>ledger.list({page:749},tx));
   assert.equal(long.value.calls,6000);assert.equal(long.value.groups.length,500);
   assert.equal(long.value.groups[0].operation_id,'operation-1');assert.equal(long.value.groups[0].calls,8);
   assert.equal(long.value.marginStatus,'暂估／数据未齐');
   assert.equal(deep.value.total,48000);assert.equal(deep.value.rows.length,50);
   const highRows=(await tx.query('SELECT * FROM app_supplier_calls ORDER BY started_at DESC,id LIMIT 50 OFFSET 37400')).rows;
   assert.deepEqual(deep.value.rows,highRows);
   const brief=await ledger.list({page:749},tx,true);
   assert.deepEqual(brief.rows.map(row=>row.id),highRows.map(row=>row.id));assert.equal(brief.total,48000);assert.ok(!('parameters'in brief.rows[0]));
   const explain=async({query,args}:Captured):Promise<Plan>=> (await tx.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query,args)).rows[0]['QUERY PLAN'][0].Plan;
   const longPlans:Plan[]=[];for(const statement of long.captured)longPlans.push(await explain(statement));
   const deepPlan=await explain(deep.captured[1]);
   const sorts=nodes(deepPlan).filter(n=>n['Node Type'].includes('Sort'));
   const metric={
    mode:baseline?'baseline':'modified',matchedCalls:long.value.calls,groups:long.value.groups.length,queries:long.captured.length,
    rawRows:long.captured.reduce((sum,stmt)=>sum+stmt.rows,0),rawBytes:long.captured.reduce((sum,stmt)=>sum+stmt.bytes,0),
    sharedBlocks:longPlans.reduce((sum,plan)=>sum+(plan['Shared Hit Blocks']??0)+(plan['Shared Read Blocks']??0),0),
    sortWidths:sorts.map(n=>n['Plan Width']).sort((a,b)=>a-b),
    sortRows:sorts.map(n=>n['Actual Rows']*n['Actual Loops']).sort((a,b)=>b-a),
    summaryDigest:digest({...long.value,currencies:[...long.value.currencies].sort((a,b)=>String(a.currency).localeCompare(String(b.currency)))}),
    pageDigest:digest(deep.value),
   };
   assert.equal(metric.summaryDigest,'49861924d3b12fce0ae46d28ae6c627987142cbeeb320105a520c522d63a5a93');
   assert.equal(metric.pageDigest,'18ff0979bf94f4743beee859a1baed12d4e54a629a8b01726ccb9fc3951f63a4');
   if(!baseline){
    assert.equal(metric.queries,3);assert.ok(metric.rawBytes<600_000,JSON.stringify(metric));
    const largeSort=sorts.find(n=>n['Actual Rows']*n['Actual Loops']>=37400);
    assert.ok(largeSort&&largeSort['Plan Width']<=32,JSON.stringify(metric));
    const none=await costsSummary(ledger,{model:'no-such-model'},tx);
    assert.deepEqual([none.calls,none.cny_micros,none.delivered,none.groups,none.currencies],[0,null,'0',[],[]]);
   }
   console.log('SUPPLIER_COST_PRESSURE_METRIC='+JSON.stringify(metric));
   console.log(baseline?'SUPPLIER_COST_PRESSURE_BASELINE=PASS':'SUPPLIER_COST_PRESSURE=PASS');
  }finally{tx.release();}
 }finally{await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
