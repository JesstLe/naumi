import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";
import { readFile } from "node:fs/promises";
async function main(){
  let posts=0,queries=0,remoteCost="0.021", routerRecord:unknown, originalImageGets=0;
  const f=await createModelFixture(async(req,res)=>{
    if(req.url?.startsWith('/broken-original')){assert.equal(req.method,'GET');originalImageGets++;req.socket.destroy();return;}
    if(req.method==='POST'){posts++;res.writeHead(400);res.end('{}');return;}
    queries++;res.setHeader('content-type','application/json');
    if(req.url?.startsWith('/internal/operations/'))return res.end(JSON.stringify(routerRecord));
    if(req.url?.startsWith('/v1/tasks/'))return res.end(`{"code":200,"data":{"id":"task_one","status":"completed","cost":${remoteCost},"credits_cost":0.21,"completed":1780819200}}`);
    res.writeHead(404);res.end('{}');
  });
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS=f.origin;process.env.NAUMI_MULTI_USER='1';
  const db=await import('../src/lib/db'),{ensureSupplierSchema,SUPPLIER_COST_SQL}=await import('../src/lib/supplier-cost/schema');
  const {createSupplierLedger}=await import('../src/lib/supplier-cost/repository');
  const {apimartTask,submittedAPIMartTask,genericReceipt,apimartUsage}=await import('../src/lib/supplier-cost/adapters');
  const {decimalMicros,parseReceiptJson}=await import('../src/lib/supplier-cost/money');
  const {enqueueCallback}=await import('../src/lib/supplier-cost/callback');
  const {runSupplierCostWorker}=await import('../src/lib/supplier-cost/worker');
  const {reconcileUsage}=await import('../src/lib/supplier-cost/reconciliation');
  const {accountIdentity}=await import('../src/lib/supplier-cost/runtime');
  const {supplierCostFetch}=await import('../src/lib/supplier-cost/collect');
  const {importRouterOperation}=await import('../src/lib/supplier-cost/router');
  const {queryAPIMartUsage}=await import('../src/lib/supplier-cost/apimart');
  const {costsSummary}=await import('../src/lib/supplier-cost/admin');
  const {ReceiptBuffer}=await import('../src/lib/supplier-cost/receipt-buffer');
  const {withBiModelContext}=await import('../src/lib/bi/model-observer');
  const ledger=createSupplierLedger(f.sql),id=accountIdentity(f.origin,'fixture-private-key');
  try{
    await db.ensureSchema();await f.repo.current();await ensureSupplierSchema(f.sql);await f.sql.query(SUPPLIER_COST_SQL);
    const migration=(await readFile('scripts/migrations/20261007-supplier-cost-ledger.sql','utf8')).replace(/\r\n/g,'\n');assert.ok(migration.includes(SUPPLIER_COST_SQL.replace(/\r\n/g,'\n')));await f.sql.query(migration);await f.sql.query(migration);
    assert.equal(decimalMicros('12345678901234567890.123456'),'12345678901234567890123456');assert.equal(decimalMicros('0'),'0');assert.equal(decimalMicros(undefined),null);assert.equal(decimalMicros('5e-7'),'1');assert.equal(parseReceiptJson('{"cost":0.000001,"id":"abc1"}').cost,'0.000001');
    assert.equal(submittedAPIMartTask({data:{id:'task_one'}}),'task_one');assert.equal(submittedAPIMartTask({data:[{task_id:'task_one'}]}),'task_one');assert.throws(()=>submittedAPIMartTask({data:[{id:'a'},{id:'b'}]}));
    const noUsage=apimartTask({data:{id:'task_one',status:'completed',cost:'0.021',credits_cost:'0.21',completed:1780819200,result:{images:[{url:['one','two']}]}}},'task_one');assert.equal(noUsage.usage,null);assert.equal(noUsage.delivered,2);assert.equal(noUsage.status,'reported');
    const top=apimartTask({id:'task_one',status:'completed',cost:'0.021'},'task_one','webhook');assert.equal(top.amountMicros,'21000');assert.throws(()=>apimartTask({id:'task_one',status:'completed',cost:'0.021'},'task_one','poll'));
    const key=(await f.credentials.importPlain({providerId:'cost-apimart',plain:'fixture-private-key',actor:'fixture'})).id;
    await ledger.account({id,providerId:'cost-apimart',protocol:'apimart-images',baseUrl:f.origin,credentialRef:key});
    await f.sql.query("UPDATE app_supplier_accounts SET fx=$2::jsonb,usage_enabled=false WHERE id=$1",[id,JSON.stringify({currency:'USD',rateMicros:'7200000',basis:'admin-rate',evidence:'fixture exchange receipt',updatedAt:new Date().toISOString()})]);
    const row=await ledger.begin({operationId:'fixture-operation',attemptId:'attempt-one',taskId:'task_one',accountId:id,providerId:'cost-apimart',feature:'canvas.image',publicModelId:'灵动2.5',model:'actual-ext',phase:'generation',userEmail:'cost-user@example.test'});
    await Promise.all([enqueueCallback(ledger,id,'{"id":"task_one","cost":999,"prompt":"secret"}'),enqueueCallback(ledger,id,'{"id":"task_one","cost":999,"prompt":"secret"}')]);
    assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_supplier_callback_inbox')).rows[0].n,1);
    assert.equal((await ledger.task(id,'task_one')).amount_micros,null,'untrusted callback cannot confirm costs');
    await Promise.all([ledger.apply(row.id,noUsage),ledger.apply(row.id,noUsage)]);
    assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_supplier_cost_adjustments')).rows[0].n,0);
    assert.equal((await ledger.task(id,'task_one')).cny_micros,'151200');
    assert.equal((await ledger.chain('fixture-operation')).outputs.length,2,'batch children share one paid receipt, without duplicated monetary fields');
    const alias=await ledger.begin({operationId:'fixture-operation',attemptId:'another-attempt',taskId:'task_one',accountId:id,providerId:'cost-apimart',feature:'canvas.image',model:'actual-ext',phase:'generation',userEmail:'cost-user@example.test'});assert.equal(alias.id,row.id);
    await runSupplierCostWorker(ledger,{batch:1});assert.equal(posts,0);assert.equal(queries,1);assert.equal((await ledger.task(id,'task_one')).amount_micros,'21000');
    await ledger.apply(row.id,{state:'completed',status:'pending',source:'missing',evidence:{}});assert.equal((await ledger.task(id,'task_one')).amount_micros,'21000');
    const zero=await ledger.begin({operationId:'fixture-zero',attemptId:'zero',accountId:id,providerId:'cost-apimart',feature:'tool.upscale',model:'model',phase:'upscale'});
    await ledger.apply(zero.id,apimartTask({data:{id:'task_zero',status:'failed',cost:0,credits_cost:0,completed:1780819200}},'task_zero'));assert.equal((await ledger.task(id,'task_zero')).amount_micros,'0');
    const late=await ledger.begin({operationId:'fixture-late',attemptId:'late',accountId:id,providerId:'cost-apimart',feature:'tool.cutout',model:'model',phase:'generation'});
    await ledger.apply(late.id,apimartTask({data:{id:'late',status:'failed'}},'late'));assert.equal((await ledger.task(id,'late')).cost_status,'pending');assert.equal((await ledger.task(id,'late')).amount_micros,null);
    await ledger.apply(late.id,apimartTask({data:{id:'late',status:'failed',cost:'0.3',credits_cost:'3',completed:1780819200}},'late'));assert.equal((await ledger.task(id,'late')).amount_micros,'300000');
    await Promise.all([ledger.apply(late.id,apimartTask({data:{id:'late',status:'failed',cost:'0',credits_cost:'0',completed:1780819200}},'late')),ledger.apply(late.id,apimartTask({data:{id:'late',status:'failed',cost:'0',credits_cost:'0',completed:1780819200}},'late'))]);
    assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_supplier_cost_adjustments WHERE call_id=$1",[late.id])).rows[0].n,1);
    const upgrade=await ledger.begin({operationId:'fixture-operation',attemptId:'upgrade',accountId:id,providerId:'cost-apimart',feature:'canvas.image',model:'premium',phase:'upgrade',parentCallId:row.id,userEmail:'cost-user@example.test'});
    await ledger.apply(upgrade.id,apimartTask({data:{id:'upgrade',status:'completed',cost:'0.1',credits_cost:'1',completed:1780819200}},'upgrade'));
    assert.equal((await f.sql.query('SELECT sum(amount_micros)::text n FROM app_supplier_calls WHERE operation_id=$1',['fixture-operation'])).rows[0].n,'121000');
    const textPrice={currency:'CNY' as const,basis:'tokens' as const,inputMicrosPerMillion:'1000000',outputMicrosPerMillion:'2000000',source:'fixture price',updatedAt:new Date().toISOString()};assert.equal(genericReceipt({},'response-received',textPrice).amountMicros,undefined);assert.equal(genericReceipt({usage:{prompt_tokens:1000,completion_tokens:500}},'response-received',textPrice).amountMicros,'2000');assert.equal(genericReceipt({usage:{prompt_tokens:1000000,completion_tokens:500000},data:[{},{}]},'response-received',{...textPrice,basis:'image',amountMicros:'200000'}).amountMicros,'400000','bundled image pricing never adds tokens');
    const s='2026-06-07T00:00:00.000Z',e='2026-06-08T00:00:00.000Z';
    const usage=apimartUsage(parseReceiptJson(JSON.stringify({success:true,data:{scope:'key',start:Date.parse(s)/1000,end:Date.parse(e)/1000,tz:'Asia/Shanghai',group_by:'model,date',total:{amount_usd:0.141,credits:1.41,requests:3},items:[{model:'actual-ext',date:'2026-06-07',amount_usd:0.021,credits:0.21,requests:1},{model:'premium',date:'2026-06-07',amount_usd:0.1,credits:1,requests:1},{model:'manual-console',date:'2026-06-07',amount_usd:0.02,credits:0.2,requests:1}]}})),{start:s,end:e,timezone:'Asia/Shanghai'});
    const account=(await f.sql.query('SELECT * FROM app_supplier_accounts WHERE id=$1',[id])).rows[0];
    const reconciled=await reconcileUsage(ledger,account,{start:s,end:e,...usage,evidence:{source:'fixture aggregate'}});assert.ok(reconciled.buckets.some(b=>b.model==='manual-console'&&b.status==='unattributed'));assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_supplier_calls WHERE model='manual-console'")).rows[0].n,0);
    await reconcileUsage(ledger,account,{start:s,end:e,...usage,evidence:{source:'fixture repeat'}});assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_supplier_usage_buckets WHERE account_id=$1',[id])).rows[0].n,4);
    assert.equal((await ledger.task(id,'task_one')).cost_status,'reconciled');
    assert.throws(()=>apimartUsage({success:false},{start:s,end:e,timezone:'Asia/Shanghai'}));
    const direct= supplierCostFetch(async()=>Response.json({id:'direct-response',usage:{prompt_tokens:1000,completion_tokens:500},choices:[]}),{providerId:'direct-fixture',apiKey:'direct-secret',baseUrl:f.origin,wireModel:'direct-model',protocol:'openai-chat'});
    await withBiModelContext('cost-user@example.test','tool.extract','direct-operation',async()=>{const response=await direct(f.origin+'/v1/chat/completions',{method:'POST',body:'{}'});await response.json()});
    assert.equal((await db.getPool().query("SELECT count(*)::int n FROM app_supplier_calls WHERE operation_id='direct-operation'")).rows[0].n,1);
    const captured=new ReceiptBuffer();const big=JSON.stringify({data:[{b64_json:'x'.repeat(3*1024*1024)+'\\"tail'}],id:'big-response',usage:{prompt_tokens:100,completion_tokens:20}});
    for(let i=0;i<big.length;i+=8191)captured.push(big.slice(i,i+8191));assert.equal(parseReceiptJson(captured.result()!).id,'big-response');assert.equal(parseReceiptJson(captured.result()!).usage.prompt_tokens,'100');assert.ok(captured.result()!.length<1000);
    const largeFetch=supplierCostFetch(async()=>new Response(big,{headers:{'content-type':'application/json'}}),{providerId:'direct-fixture',apiKey:'direct-secret',baseUrl:f.origin,wireModel:'large-image',protocol:'openai-images'});
    await withBiModelContext('cost-user@example.test','canvas.image.generate','large-operation',async()=>{const response=await largeFetch(f.origin+'/v1/images/generations',{method:'POST',body:'{}'});assert.equal((await response.json()).data[0].b64_json.length,3*1024*1024+6)});
    const large=(await db.getPool().query("SELECT * FROM app_supplier_calls WHERE operation_id='large-operation'")).rows[0];assert.equal(large.usage.prompt_tokens,100);assert.equal(large.request_id,'big-response');assert.equal(large.cost_status,'pending');assert.equal(large.evidence.metadataComplete,true);
    const cfg=await f.repo.current(),rid='router-fixture-operation',routerIdentity=accountIdentity(f.origin+'/v1',f.marker);
    routerRecord={id:rid,state:'completed',config_digest:'fixture-digest',attempts:[{identity:routerIdentity,key:'router-first',credential_ref:f.config.providers[0].credentialRef,route:{id:'low-route',upstream_model:'wire-image-one'},state:'failed',task_id:'router-low',receipt:{CostReported:true,CostUSD:'0.02',TaskID:'router-low'}},{identity:routerIdentity,key:'router-fallback',route:{id:'high-route',upstream_model:'wire-premium'},state:'completed',task_id:'router-high',receipt:{CostReported:true,CostUSD:'0.10',TaskID:'router-high'}}]};
    process.env.NAUMI_ROUTER_COST_URL=f.origin;process.env.NAUMI_ROUTER_COST_TOKEN='fixture-query-token';
    const routerPayload={operation:rid,context:{operationId:rid,userEmail:'cost-user@example.test',feature:'canvas.image.generate',publicModelId:'mixed-public',phase:'generation',modelVersion:cfg.version},frozen:{routerDigest:'fixture-digest'}};
    await Promise.all([importRouterOperation(ledger,routerPayload),importRouterOperation(ledger,routerPayload)]);
    const imported=await ledger.chain(rid);assert.equal(imported.rows.length,2);assert.equal(imported.rows[1].phase,'fallback');assert.equal(imported.rows.reduce((s,r)=>s+BigInt(r.amount_micros),BigInt(0)),BigInt(120000));assert.equal(imported.adjustments.length,0);
    await assert.rejects(importRouterOperation(ledger,{...routerPayload,frozen:{routerDigest:'different'}}));
    const filtered=await costsSummary(ledger,{operation:'fixture-operation',model:'actual-ext'});assert.equal(filtered.calls,1);assert.equal(filtered.groups[0].calls,2);assert.equal(filtered.marginCostCnyMicros,'871200');
    await assert.rejects(queryAPIMartUsage({baseUrl:f.origin,apiKey:'fixture-key',start:new Date(s),end:new Date(Date.parse(s)+32*86400000),timezone:'Asia/Shanghai'}));
    // A task receipt without an outbox entry is recovered after a worker restart; no generation POST.
    await f.sql.query("DELETE FROM app_supplier_cost_jobs WHERE key=$1",[`task:${row.id}`]);await runSupplierCostWorker(ledger,{batch:1});assert.equal((await f.sql.query("SELECT count(*)::int n FROM app_supplier_cost_jobs WHERE key=$1",[`task:${row.id}`])).rows[0].n,1);
    const submitFetch=supplierCostFetch(async()=>Response.json({data:[{status:'submitted',task_id:'task_submit_fixture'}]}),{providerId:'cost-apimart',apiKey:'fixture-private-key',credentialRef:key,baseUrl:f.origin,wireModel:'ext-fixture',protocol:'apimart-images'});
    await withBiModelContext('cost-user@example.test','image.generate','submit-operation',async()=>{await(await submitFetch(f.origin+'/v1/images/generations',{method:'POST',body:'{}'})).json()});
    const submitted=await ledger.task(id,'task_submit_fixture');assert.equal(submitted.cost_status,'pending');assert.equal(submitted.delivered,null);assert.equal((await ledger.chain('submit-operation')).outputs.length,0);
    // Same API Key on endpoint aliases shares one DB query/cache reservation, even across workers.
    await f.sql.query("UPDATE app_supplier_cost_jobs SET due_at=now()+interval '1 day'");
    const aliasId=accountIdentity(f.origin+'/v1','fixture-private-key');await ledger.account({id:aliasId,providerId:'cost-apimart',protocol:'apimart-images',baseUrl:f.origin+'/v1',credentialRef:key});await f.sql.query('UPDATE app_supplier_accounts SET usage_enabled=false');
    await ledger.enqueue('usage-fixture-one','usage',{start:s,end:e},id);await ledger.enqueue('usage-fixture-two','usage',{start:s,end:e},aliasId);
    let usageQueries=0;const usageFetcher:typeof fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);assert.equal(req.method,'GET');assert.equal(url.pathname,'/v1/usage');usageQueries++;return Response.json({success:true,data:{scope:'key',group_by:'model,date',tz:'Asia/Shanghai',start:Date.parse(s)/1000,end:Date.parse(e)/1000,total:{amount_usd:0,credits:0,requests:0},items:[]}})};
    await Promise.all([runSupplierCostWorker(ledger,{batch:1,fetcher:usageFetcher}),runSupplierCostWorker(ledger,{batch:1,fetcher:usageFetcher})]);assert.equal(usageQueries,1);assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_supplier_query_limits')).rows[0].n,1);
    const resumed=createSupplierLedger(f.sql);await runSupplierCostWorker(resumed,{batch:1,fetcher:usageFetcher});assert.equal(usageQueries,1,'DB persisted cooldown survives restart');
    console.log('ROUTER_IMPORT=PASS REPEAT_IMPORT=ONE_CHAIN DIGEST_MISMATCH=REJECTED LARGE_IMAGE_METADATA=PASS FULL_CHAIN_MARGIN=PASS RESTART_OUTBOX=PASS MAX31D=PASS SHARED_KEY_CACHE=PASS CHILD_OUTPUTS=NO_DUPLICATED_COST SUBMIT_ID=PASS');
    const api=await import('../src/app/api/admin/supplier-cost/route'),actions=await import('../src/app/api/admin/supplier-cost/actions/route');
    const {signUserSession}=await import('../src/lib/native-auth');await db.getOrCreateUser('cost-user@example.test','fixture');await db.setSetting('multi_user_enabled','1');
    const userReq=(path:string,method='GET')=>new Request('http://fixture.test'+path,{method,headers:{cookie:`nv_user=${signUserSession('cost-user@example.test',Date.now())}`}});
    assert.equal((await api.GET(userReq('/api/admin/supplier-cost'))).status,404);assert.equal((await actions.POST(userReq('/api/admin/supplier-cost/actions','POST'))).status,404);
    await db.getOrCreateUser('cost-admin@example.test','fixture');
    await f.sql.query("UPDATE app_users SET role='admin' WHERE email='cost-admin@example.test'");
    const read=(path:string)=>api.GET(new Request('http://fixture.test/api/admin/supplier-cost'+path,{headers:{cookie:`nv_user=${signUserSession('cost-admin@example.test',Date.now())}`}}));
    const selected='operation=fixture-operation&model=actual-ext';
    const inspect=async(view:string)=>{
      const response=await read(`?${selected}&view=${view}`);
      assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/private.*no-store/);return response.json();
    };
    const initial=await inspect('calls');assert.deepEqual(Object.keys(initial).sort(),['accounts','rows','total']);assert.equal(initial.total,1);
    assert.equal(initial.rows[0].id,row.id);assert(!('evidence' in initial.rows[0])&&!('usage' in initial.rows[0])&&!('parameters' in initial.rows[0]));
    assert.deepEqual(Object.keys(initial.accounts[0]).sort(),['id','label']);
    assert.deepEqual((await inspect('stats')).stats,filtered);
    assert.deepEqual(Object.keys(await inspect('reconcile')).sort(),['accounts','anomalies','jobs']);
    assert.equal(typeof (await inspect('accounts')).accounts[0].query_configured,'boolean');
    const compatibility=await(await read('?'+selected)).json();
    assert.deepEqual(compatibility.stats,filtered);assert('evidence'in compatibility.rows[0]);assert(Array.isArray(compatibility.jobs));
    assert.equal((await read('?view=invalid')).status,400);
    const veto=await f.sql.connect();
    try {
      await veto.query('BEGIN');await veto.query('LOCK TABLE app_supplier_usage_buckets IN ACCESS EXCLUSIVE MODE');
      assert.equal((await inspect('calls')).total,1,'hidden reconciliation must not read its locked table');
      assert.equal((await read('?view=reconcile')).status,503,'only the selected blocked view should time out');
      assert.equal((await inspect('accounts')).accounts.length,initial.accounts.length);
    }finally{await veto.query('ROLLBACK');veto.release();}
    console.log('SUPPLIER_ADMIN_VIEW_PASS calls=1 brief=1 full_margin_parity=1 blocked_view_isolated=1 compatibility=1');
    const full=(await f.sql.query('SELECT * FROM app_supplier_calls')).rows;assert.ok(!JSON.stringify(full).includes('fixture-private-key'));assert.ok(!JSON.stringify(full).includes('secret prompt'));assert.ok(!JSON.stringify((await f.sql.query('SELECT hint FROM app_supplier_callback_inbox')).rows).includes('999'));
    const reopened=createSupplierLedger(f.sql);assert.equal((await reopened.task(id,'task_one')).amount_micros,'21000');
    // Real collector -> health validator -> exact call's durable diagnostics.
    // Only the result GET uses loopback HTTP; all generation responses are fixtures.
    const {healthObservedFetch}=await import('../src/lib/model-health/observe');
    const originalAccounting=(await f.sql.query("SELECT (SELECT jsonb_agg(b ORDER BY id) FROM app_billing_operations b) billing,(SELECT jsonb_agg(l ORDER BY id) FROM app_ledger l) ledger")).rows;
    const scope={frozen:{feature:'canvas.image',modality:'image',modelVersion:141},connection:{providerId:'diagnostic-fixture'}} as any;
    let fixtureResponses=0;
    const cases=[{id:'diag-download',body:{data:[{url:f.origin+'/broken-original?secret=never-persist-this'}]},stage:'download-image'},
      {id:'diag-decode',body:{data:[{b64_json:Buffer.from('not an image').toString('base64')}]},stage:'decode-pixels'},
      {id:'diag-empty',body:null,stage:'read-response'}];
    await Promise.all(cases.map(async c=>{
      const collected=supplierCostFetch(async()=>{fixtureResponses++;return c.body?Response.json(c.body):new Response(null,{status:200})},
        {providerId:'diagnostic-fixture',apiKey:'fixture-private-key',baseUrl:f.origin,wireModel:'image-fixture',protocol:'openai-images'});
      const observed=healthObservedFetch(scope,collected,{trustedOrigins:[f.origin]});
      await withBiModelContext('cost-user@example.test','canvas.image.generate',c.id,async()=>{
        await assert.rejects(observed(f.origin+'/v1/images/generations',{method:'POST',body:'{}'}),/supplier-image-(download-failed|invalid-output)|empty receipt/);
      });
    }));
    for(const c of cases){
      const rows=(await f.sql.query('SELECT * FROM app_supplier_calls WHERE operation_id=$1',[c.id])).rows;
      assert.equal(rows.length,1);const saved=rows[0];
      assert.equal(saved.state,'response-received');assert.equal(saved.cost_status,'pending');if(c.body)assert.equal(saved.evidence.httpStatus,200);
      assert.equal(saved.evidence.postAcceptanceFailure.stage,c.stage);assert.equal(saved.evidence.postAcceptanceFailure.status,200);
      assert.ok(Number.isFinite(Date.parse(saved.evidence.postAcceptanceFailure.observedAt)));
      assert.ok(!JSON.stringify(saved.evidence).includes('never-persist-this'));assert.ok(!JSON.stringify(saved.evidence).includes('fixture-private-key'));
      if(c.stage==='download-image')assert.ok(saved.evidence.postAcceptanceFailure.causes.some((v:any)=>['ECONNRESET','UND_ERR_SOCKET'].includes(v.code)));
    }
    assert.equal(originalImageGets,2);assert.equal(fixtureResponses,3);assert.equal(posts,0);
    assert.deepEqual((await f.sql.query("SELECT (SELECT jsonb_agg(b ORDER BY id) FROM app_billing_operations b) billing,(SELECT jsonb_agg(l ORDER BY id) FROM app_ledger l) ledger")).rows,originalAccounting);
    console.log('POSTACCEPT_DURABLE_DIAGNOSTICS=PASS REAL_PG=1 EXACT_CALLS=3 CROSS_CALL_LEAK=0 ORIGINAL_IMAGE_GETS=2 GENERATION_RESPONSES=FIXTURE CUSTOMER_ACCOUNTING=UNCHANGED');
    console.log('SUPPLIER_COST=PASS DUPLICATE_CALLBACK=ONE POLL_RACE=ONE ZERO=REPORTED MISSING_USAGE=SUPPORTED FAILED_CHARGE=RECORDED LATE_COST=RECOVERED REFUND_HISTORY=ONE PARTIAL_BATCH=ONE_RECEIPT MIXED_TOTAL=121000 UNATTRIBUTED=NOT_ASSIGNED DECIMAL=EXACT NON_ADMIN=404 DB_REOPEN=PASS PAID_POSTS=0');
  }finally{await db.getPool().end();await f.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
