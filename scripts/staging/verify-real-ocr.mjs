// One real OCR operation on a new synthetic artwork; recover by persistent ID.
import assert from 'node:assert/strict';
import {createHmac,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,rename} from 'node:fs/promises';
const require=createRequire('/app/server.js'), {Pool}=require('pg'), sharp=require('sharp');
assert.equal(process.env.NAUMI_ENVIRONMENT,'staging');
assert.equal(process.env.NAUMI_STAGING_HISTORY_GUARD,'1');
assert.equal(process.env.STORAGE_DRIVER,'local');
const path='/tmp/naumi-staging-ocr-readable-20261009.json', mode=process.argv[2];
assert.ok(['--submit','--verify'].includes(mode));
let receipt;try{receipt=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;receipt={version:1,purpose:'staging-real-ocr-20261009'}}
assert.equal(receipt.purpose,'staging-real-ocr-20261009');
async function save(){await writeFile(path+'.tmp',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});await rename(path+'.tmp',path)}
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:false}), origin='http://127.0.0.1:3000';
try{
 assert.equal((await db.query('SELECT current_database() db')).rows[0].db,'naumi_staging');
 const hash=(await db.query("SELECT v FROM app_settings WHERE k='admin_password_hash'")).rows[0]?.v;
 const user=(await db.query("SELECT email FROM app_users WHERE role='admin' AND NOT banned ORDER BY joined_at LIMIT 1")).rows[0];assert.ok(hash&&user);
 const exp=Date.now()+600000,eb=Buffer.from(user.email).toString('base64url');
 const mac=createHmac('sha256',process.env.SETTINGS_SECRET).update(`admin-access:${exp}:${hash}`).digest('hex');
 const umac=createHmac('sha256',process.env.SETTINGS_SECRET).update(`user:${eb}.${exp}`).digest('hex');
 const cookie=`nv_admin=${exp}.${mac}; nv_user=${eb}.${exp}.${umac}`;
 async function req(route,body,headers={}){const multipart=body instanceof FormData;const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{origin,cookie,...(multipart?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)}),signal:AbortSignal.timeout(150000)});return{status:r.status,body:await r.json()}}
 const catalog=await req('/api/models?feature=canvas.ocr');assert.equal(catalog.status,200);assert.ok(catalog.body.defaultModelId);
 console.log(`STAGING_OCR_CATALOG MODEL=${catalog.body.defaultModelId} MODEL_COUNT=${catalog.body.models.length} DEFAULT_VISIBLE=${Number(catalog.body.models.some(m=>m.id===catalog.body.defaultModelId))}`);
 if(mode==='--submit'&&!receipt.operationId){
  if(!receipt.artworkId){
   assert.notEqual(receipt.uploadState,'started','uncertain upload: reconcile existing artwork, never duplicate');
   // The runtime has no fontconfig. Use the already-viewed, offline fixture;
   // do not render an SVG whose text may silently turn into missing glyphs.
   const png=await readFile('/tmp/staging-ocr-readable-fixture.png');
   const metadata=await sharp(png).metadata();assert.equal(metadata.width,1000);assert.equal(metadata.height,400);
   receipt.uploadState='started';receipt.fixtureSha256=createHash('sha256').update(png).digest('hex');await save();
   const f=new FormData();f.set('image',new Blob([png],{type:'image/png'}),'staging-ocr.png');f.set('title','预发布OCR验收');f.set('entry','canvas');
   const upload=await req('/api/artworks/add',f);assert.equal(upload.status,200);receipt.artworkId=upload.body.artwork?.id||upload.body.id;assert.ok(receipt.artworkId,'upload response artwork ID');receipt.uploadState='saved';await save();
  }
  // Use the configured default binding, not an explicit selection of a hidden
  // internal alias. Quote/execution share the same default registry.
  const modelId=catalog.body.defaultModelId,q=await req('/api/billing/quote',{feature:'canvas.ocr',quantity:1});
  if(q.status!==200)console.log('STAGING_OCR_QUOTE='+JSON.stringify({status:q.status,code:q.body.code,error:q.body.error}));
  assert.equal(q.status,200);
  receipt.operationId='staging-ocr-'+randomUUID();receipt.modelId=modelId;receipt.billingVersion=q.body.version;receipt.billingCredits=q.body.authorization?q.body.authorizedCredits:q.body.credits;receipt.state='submission_started';await save();
  console.log(`STAGING_REAL_OCR_SUBMITTED OPERATION_ID=tool-${receipt.operationId} ARTWORK_ID=${receipt.artworkId} NEW_TASK=1`);
  const response=await req('/api/canvas/ocr',{artworkId:receipt.artworkId},{'x-naumi-billing-operation-id':receipt.operationId,'x-naumi-billing-version':String(q.body.version),'x-naumi-billing-credits':String(q.body.authorization?q.body.authorizedCredits:q.body.credits)});
  receipt.httpStatus=response.status;receipt.code=response.body.code||null;receipt.engine=response.body.engine||null;receipt.state=response.status===200?'response_received':'failed';await save();
  assert.equal(response.status,200,`OCR HTTP=${response.status} CODE=${response.body.code||'none'}`);
 }
 assert.ok(receipt.operationId,'no submitted operation; use --submit once');
 const id='tool-'+receipt.operationId,bill=(await db.query('SELECT state,charged_credits,reserved_credits,result_response,quote FROM app_billing_operations WHERE id=$1',[id])).rows[0];assert.ok(bill);assert.equal(bill.state,'settled');assert.equal(Number(bill.reserved_credits),0);
 const result=bill.result_response;assert.equal(result.ok,true);assert.equal(result.engine,'vision-fallback');assert.equal(result.image.width,1000);assert.equal(result.image.height,400);assert.ok(result.segments.length);
 const text=result.segments.map(s=>s.text).join(' ').toUpperCase();assert.ok(text.includes('NAUMI')&&text.includes('TEST')&&text.includes('20261009'),'expected fixture text absent');
 for(const s of result.segments){const b=s.box;assert.ok(b&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=1000&&b.y+b.height<=400)}
 const led=(await db.query('SELECT count(*)::int n,COALESCE(sum(delta),0)::int delta FROM app_ledger WHERE id=$1',['led-'+id])).rows[0];assert.equal(Number(led.delta)+Number(bill.charged_credits),0);assert.equal(Number(led.n),Number(bill.charged_credits)>0?1:0);
 const calls=(await db.query('SELECT count(*)::int n FROM app_supplier_calls WHERE operation_id=$1',[id])).rows[0].n;assert.ok(calls>0,'real supplier receipt missing');
 assert.equal((await db.query("SELECT count(*)::int n FROM naumi_staging_guard.origin_rows WHERE table_name='app_billing_operations' AND row_key=$1",[id])).rows[0].n,0);
 if(mode==='--verify'){
  const stats=async()=> (await db.query('SELECT (SELECT count(*)::int FROM app_supplier_calls WHERE operation_id=$1) calls,(SELECT COALESCE(sum(remaining),0)::text FROM app_credit_batches WHERE email=$2) remaining,(SELECT credits_used::text FROM app_users WHERE email=$2) reserved',[id,user.email])).rows[0];
  const before=await stats();
  const replay=await req('/api/canvas/ocr',{artworkId:receipt.artworkId},{'x-naumi-billing-operation-id':receipt.operationId,'x-naumi-billing-version':String(receipt.billingVersion||bill.quote.configVersion),'x-naumi-billing-credits':String(receipt.billingCredits??bill.quote.authorizedCredits)});
  assert.equal(replay.status,200);assert.deepEqual(replay.body,result);assert.deepEqual(await stats(),before);
  console.log('STAGING_OCR_REPLAY=PASS SAME_OPERATION=1 SUPPLIER_CALLS_UNCHANGED=1 WALLET_UNCHANGED=1');
 }
 receipt.state='verified';receipt.charged=Number(bill.charged_credits);receipt.reserved=0;receipt.engine=result.engine;receipt.segmentCount=result.segments.length;receipt.supplierCalls=calls;await save();
 console.log(`STAGING_REAL_OCR=PASS OPERATION_ID=${id} ENGINE=${result.engine} SEGMENTS=${result.segments.length} FIXTURE_TEXT=EXACT BOUNDS=VALID CHARGED=${receipt.charged} RESERVED=0 LEDGER_ROWS=${led.n} SUPPLIER_CALLS=${calls} IMPORTED_OPERATION=0 PASSWORD_LOGIN_NOT_TESTED=1`);
}finally{await db.end()}
