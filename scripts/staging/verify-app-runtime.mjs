// Run inside the isolated staging app container. Keep session fixture in memory.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire('/app/server.js');
const { Pool } = require('pg');
assert.equal(process.env.NAUMI_ENVIRONMENT, 'staging');
assert.equal(process.env.NAUMI_STAGING_HISTORY_GUARD, '1');
assert.equal(process.env.STORAGE_DRIVER, 'local');
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const origin = 'http://127.0.0.1:3000';
try {
  assert.equal((await db.query('SELECT current_database() db')).rows[0].db, 'naumi_staging');
  const hash = (await db.query("SELECT v FROM app_settings WHERE k='admin_password_hash'")).rows[0]?.v;
  assert.ok(hash);
  const user = (await db.query("SELECT email FROM app_users WHERE role='admin' AND NOT banned ORDER BY joined_at LIMIT 1")).rows[0];
  assert.ok(user);
  const exp = Date.now()+600000;
  const mac = createHmac('sha256', process.env.SETTINGS_SECRET).update(`admin-access:${exp}:${hash}`).digest('hex');
  const eb = Buffer.from(user.email).toString('base64url');
  const umac = createHmac('sha256', process.env.SETTINGS_SECRET).update(`user:${eb}.${exp}`).digest('hex');
  const cookie = `nv_admin=${exp}.${mac}; nv_user=${eb}.${exp}.${umac}`;
  const request = async (path, body, authenticated=true) => {
    const response = await fetch(origin+path, { method:body === undefined?'GET':'POST',
      headers:{...(authenticated?{cookie}:{}),'content-type':'application/json','origin':origin},
      ...(body === undefined?{}:{body:JSON.stringify(body)}), signal:AbortSignal.timeout(45000) });
    return { status:response.status, body:await response.json() };
  };
  assert.equal((await request('/api/admin/usage',undefined,false)).status,403);
  const authed=await request('/api/admin/usage'); assert.equal(authed.status,200);
  const settings=await request('/api/admin/settings');assert.equal(settings.status,200);
  assert.equal(settings.body.wechatReady,false);assert.equal(settings.body.rechargeLive,false);
  const catalog=await request('/api/models?feature=image.generate');assert.equal(catalog.status,200);
  assert.ok(catalog.body.models.length);
  const model=catalog.body.defaultModelId||catalog.body.models[0].id;
  console.log(`STAGING_APP_AUTH_FIXTURE=PASS ADMIN_UNAUTH=403 ADMIN_AUTH=200 MODELS=200 MODEL_COUNT=${catalog.body.models.length} LOGIN_PASSWORD_NOT_TESTED=1`);
  const verifyJob = process.argv.find(x=>x.startsWith('--verify-job='))?.slice('--verify-job='.length);
  if (verifyJob) {
    assert.match(verifyJob,/^job-[a-f0-9-]{36}$/);
    assert.equal((await db.query("SELECT count(*)::int n FROM naumi_staging_guard.origin_rows WHERE table_name='app_image_jobs' AND row_key=$1",[verifyJob])).rows[0].n,0);
    const result=await request('/api/generate-image?job='+verifyJob);assert.equal(result.status,200);assert.equal(result.body.status,'done');
    const billing=(await db.query('SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1',[verifyJob])).rows[0];
    assert.equal(billing.state,'settled');assert.equal(billing.reserved_credits,0);
    const ledger=(await db.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',[`led-image-${verifyJob}`])).rows[0];
    assert.equal(ledger.n,1);
    const media=await fetch(origin+result.body.images[0].url,{headers:{cookie},signal:AbortSignal.timeout(15000)});
    assert.equal(media.status,200);
    console.log(`STAGING_POST_RESTART=PASS JOB_ID=${verifyJob} STATUS=done CHARGED=${billing.charged_credits} RESERVED=0 LEDGER_ROWS=1 MEDIA=200`);
  }
  if (process.argv.includes('--real-image')) {
    const oldIds=(await db.query("SELECT row_key FROM naumi_staging_guard.origin_rows WHERE table_name='app_image_jobs'")).rows.map(x=>x.row_key);
    const quote=await request('/api/billing/quote',{feature:'image.generate',quantity:1,quality:'medium',resolution:'1K',modelId:model});
    assert.equal(quote.status,200,`quote status=${quote.status} code=${quote.body.code||''}`);
    const created=await request('/api/generate-image',{prompt:'预发布验收：白色背景上的一只红色陶瓷杯，商品摄影，无文字，无水印。',quality:'medium',resolution:'1K',ratio:'1:1',count:1,model,
      billingVersion:quote.body.version,billingCredits:quote.body.authorization?quote.body.authorizedCredits:quote.body.credits});
    assert.equal(created.status,200,`create status=${created.status} code=${created.body.code||''}`);
    const id=created.body.jobId;assert.ok(id);assert.ok(!oldIds.includes(id));
    console.log(`STAGING_REAL_IMAGE_SUBMITTED JOB_ID=${id} MODEL=${model} NEW_TASK=1`);
    let result;
    for(let n=0;n<180;n++) {
      result=await request('/api/generate-image?job='+encodeURIComponent(id));
      assert.equal(result.status,200);
      if(['done','error','needs_attention'].includes(result.body.status))break;
      await new Promise(r=>setTimeout(r,2000));
    }
    const saved=(await db.query('SELECT billing_settled,snapshot FROM app_image_jobs WHERE id=$1',[id])).rows[0];
    const billing=(await db.query('SELECT state,charged_credits,reserved_credits FROM app_billing_operations WHERE id=$1',[id])).rows[0];
    const ledger=(await db.query('SELECT count(*)::int n FROM app_ledger WHERE id=$1',[`led-image-${id}`])).rows[0];
    const receipt=(await db.query('SELECT count(*)::int n FROM app_supplier_calls WHERE operation_id=$1',[id])).rows[0];
    console.log(`STAGING_REAL_IMAGE_RESULT JOB_ID=${id} STATUS=${result.body.status} BILLING=${billing?.state||'none'} CHARGED=${billing?.charged_credits||0} RESERVED=${billing?.reserved_credits||0} LEDGER_ROWS=${ledger.n} SUPPLIER_CALLS=${receipt.n}`);
    assert.equal(result.body.status,'done');assert.notEqual(result.body.mock,true);
    assert.ok(result.body.images?.length);
    assert.equal(saved.billing_settled,true);assert.equal(billing.state,'settled');assert.equal(billing.reserved_credits,0);
    assert.ok(receipt.n>0);
    const media=await fetch(origin+result.body.images[0].url,{headers:{cookie},signal:AbortSignal.timeout(15000)});
    assert.equal(media.status,200);assert.ok((await media.arrayBuffer()).byteLength>0);
    console.log(`STAGING_REAL_IMAGE=PASS JOB_ID=${id} LOCAL_MEDIA=200 SETTLEMENT=ONCE`);
  }
} finally { await db.end(); }
