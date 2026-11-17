import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const operation='long-chain-fixture',other='different-chain-fixture';
async function main(){
 const baseline=process.argv.includes('--baseline');
 process.env.SETTINGS_SECRET='fixture-settings-0123456789abcdef0123456789abcdef0123456789';
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  await (await import('../src/lib/billing/schema')).ensureBillingSchema(f.pool);
  await (await import('../src/lib/supplier-cost/schema')).ensureSupplierSchema(f.pool);
  const {signSession}=await import('../src/lib/admin-auth');
  const {GET}=await import('../src/app/api/admin/supplier-cost/operations/[id]/route');
  const cookie='nv_admin='+signSession(Date.now());
  const fetchChain=(suffix='',id=operation,authorized=true)=>GET(new Request('http://localhost/api/admin/supplier-cost/operations/'+id+suffix,{headers:authorized?{cookie}:{}}),{params:Promise.resolve({id})});
  await f.pool.query("INSERT INTO app_supplier_accounts(id,provider_id,protocol,base_url,label) VALUES('fixture','fixture','openai-images','http://127.0.0.1:1','fixture')");
  await f.pool.query(`INSERT INTO app_supplier_calls(id,operation_id,feature,attempt_id,account_id,provider_id,model,phase,started_at,parameters,usage,evidence)
   SELECT md5('long-call-'||i)::uuid,CASE WHEN i=134 THEN $2 ELSE $1 END,'canvas.image',i::text,'fixture','fixture','model','stage-'||i,
    '2026-01-01T00:00:00Z'::timestamptz+make_interval(secs=>i/8),
    jsonb_build_object('detailOnly',repeat('fixture parameter ',625)),jsonb_build_object('fixtureUsage',i),
    jsonb_build_object('evidence',repeat('fixture evidence ',625)) FROM generate_series(1,134) i`,[operation,other]);
  await f.pool.query(`INSERT INTO app_supplier_call_outputs(call_id,output_index,state)
   SELECT id,i,'succeeded' FROM app_supplier_calls CROSS JOIN generate_series(0,2) i`);
  const callIds=(await f.pool.query('SELECT id FROM app_supplier_calls WHERE operation_id=$1 ORDER BY started_at,id',[operation])).rows.map(row=>row.id);
  await f.pool.query(`INSERT INTO app_billing_operations(id,email,feature,quote,state,request_fingerprint,ledger_id,settlement_result)
   VALUES($1,'fixture@example.test','canvas.image','{"imagePreset":{"factorBps":20000}}','settled','fixture','fixture','{"items":[{"state":"succeeded"}]}')`,[operation]);
  await f.pool.query(`INSERT INTO app_billing_api_cost_reviews(id,operation_id,after_result,status,created_at)
   SELECT 'fee-'||lpad(i::text,3,'0'),$1,'{"fixture":true}','reviewed','2026-01-01T00:00:00Z'::timestamptz+make_interval(secs=>i/3)
   FROM generate_series(1,37) i`,[operation]);
  for(let i=0;i<31;i++)await f.pool.query(`INSERT INTO app_supplier_cost_adjustments(id,call_id,kind,before_receipt,after_receipt,reason,actor)
   VALUES($1,$2,'revision','{}','{}','fixture','fixture')`,[randomUUID(),callIds[0]]);
  const all=await fetchChain();assert.equal(all.status,200);
  const raw=await all.text(),legacy=JSON.parse(raw);
  assert.deepEqual(legacy.rows.map((row:{id:string})=>row.id),callIds);assert.equal(legacy.outputs.length,399);
  assert.equal(legacy.adjustments.length,31);assert.equal(legacy.feeReviews.length,37);
  assert.equal(legacy.billing.factor_bps,'20000');
  assert.ok(Buffer.byteLength(raw)>2_000_000);
  if(baseline){
   console.log(`SUPPLIER_CHAIN_BASELINE=PASS BYTES=${Buffer.byteLength(raw)} CALLS=133 OUTPUTS=399`);
   return;
  }
  assert.equal((await fetchChain('?view=calls',operation,false)).status,404);
  assert.equal((await fetchChain('?view=calls&after=missing')).status,400);
  const callOfOther=(await f.pool.query('SELECT id FROM app_supplier_calls WHERE operation_id=$1',[other])).rows[0].id;
  assert.equal((await fetchChain('?view=call&call='+callOfOther)).status,404);
  assert.deepEqual(await (await fetchChain('?view=calls&after='+callOfOther)).json(),{view:'calls',rows:[],next:null});
  const first=await fetchChain('?view=calls');
  assert.equal(first.status,200);assert.match(first.headers.get('cache-control')??'',/private.*no-store/);
  const firstRaw=await first.text(),firstPage=JSON.parse(firstRaw);
  assert.ok(Buffer.byteLength(firstRaw)<25000);assert.equal(firstPage.rows.length,25);
  assert.ok(firstPage.rows.every((row:Record<string,unknown>)=>!('evidence'in row)&&!('parameters'in row)&&!('usage'in row)));
  const walk=async(view:string)=>{
   const rows:any[]=[];let cursor:string|null=null,pages=0;
   do{
    const suffix=cursor?'&after='+encodeURIComponent(cursor):'';
    const response=await fetchChain('?view='+view+suffix);
    assert.equal(response.status,200);const page=await response.json();assert.equal(page.view,view);
    assert.ok(page.rows.length<=25);rows.push(...page.rows);cursor=page.next;
    assert.ok(++pages<=10);
   }while(cursor);
   return rows;
  };
  assert.deepEqual((await walk('calls')).map(row=>row.id),callIds);
  for(const [view,key] of [['reviews','feeReviews'],['adjustments','adjustments']]){
   const current=await walk(view),previous=legacy[key];
   const sorted=(rows:{id:string}[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
   assert.deepEqual(sorted(current),sorted(previous));
  }
  assert.deepEqual(await (await fetchChain('?view=billing')).json(),{view:'billing',billing:legacy.billing});
  const selected=legacy.rows[117];
  assert.deepEqual(await (await fetchChain('?view=call&call='+selected.id)).json(),{view:'call',detail:{
   parameters:selected.parameters,usage:selected.usage,fx:selected.fx,evidence:selected.evidence,
   outputs:legacy.outputs.filter((output:{call_id:string})=>output.call_id===selected.id),
  }});
  console.log(`SUPPLIER_CHAIN_PAGED=PASS LEGACY_BYTES=${Buffer.byteLength(raw)} FIRST_BYTES=${Buffer.byteLength(firstRaw)} CALLS=133 PAGES=6 FEE_ROWS=37 ADJUSTMENTS=31 SCOPE_BOUND=1 EXACT_DETAILS=1 REAL_PG=1`);
 }finally{await f.close();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
