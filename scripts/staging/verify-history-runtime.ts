import assert from "node:assert/strict";
import { getPool, ensureSchema, sweepStaleReservations, claimNextCanvasImageTask, listDueVideoTaskRefs } from "../../src/lib/db";
import * as images from "../../src/lib/image-job-repository";
import { DurableImageJobs } from "../../src/lib/durable-image-jobs";
import { exposeAbandonedBillingOperations } from "../../src/lib/billing/synchronous";
import { refreshApiCostOperation, withBillingTransaction } from "../../src/lib/billing/service";
import { runSupplierCostWorker } from "../../src/lib/supplier-cost/worker";
import { createSupplierLedger } from "../../src/lib/supplier-cost/repository";
import { recoverPostprocess } from "../../src/lib/postprocess-recovery";
import { getPaymentSettings, getSmtpConfig, getWechatSettings } from "../../src/lib/settings";
import { smsEnabled, sendSmsCode } from "../../src/lib/sms";

async function main() {
  assert.equal(process.env.NAUMI_ENVIRONMENT, "staging");
  assert.equal(process.env.NAUMI_STAGING_HISTORY_GUARD, "1");
  const pool = getPool();
  try {
    assert.equal((await pool.query("SELECT current_database() name")).rows[0].name, "naumi_staging_history_fixture");
    // Only this disposable clone is used: never test billing by changing the working copy.
    const manifest = (await pool.query("SELECT table_name,key_column FROM naumi_staging_guard.origin_rows GROUP BY 1,2 ORDER BY 1")).rows;
    const originHashes = async () => {
      const hashes = [];
      for (const t of manifest) {
        assert.match(t.table_name, /^app_[a-z_]+$/); assert.match(t.key_column, /^[a-z_]+$/);
        hashes.push((await pool.query(`SELECT md5(COALESCE(string_agg(md5(to_jsonb(r)::text),'' ORDER BY r.${t.key_column}::text),'')) hash FROM public.${t.table_name} r JOIN naumi_staging_guard.origin_rows o ON o.table_name=$1 AND o.row_key=r.${t.key_column}::text`, [t.table_name])).rows[0].hash);
      }
      return hashes;
    };
    const before = await originHashes();
    assert.equal(await getSmtpConfig(), null);
    assert.equal((await getWechatSettings()).enabled, false);
    assert.equal((await getPaymentSettings()).payEnabled, false);
    assert.equal((await getPaymentSettings()).wxpayApiv3, "");
    assert.equal(smsEnabled, false);
    await assert.rejects(sendSmsCode("staging-fixture"), /预发布环境/);
    await ensureSchema();
    const old = (await pool.query("SELECT id,email,kind FROM app_image_jobs ORDER BY id LIMIT 1")).rows[0];
    assert.ok(old);
    assert.equal(await images.claimImageJob(old.id, old.kind), null);
    assert.equal((await images.dueImageJobs()).length, 0);
    assert.equal(await claimNextCanvasImageTask(), null);
    assert.equal((await listDueVideoTaskRefs()).length, 0);
    const durable = new DurableImageJobs<{ status: string }>(old.kind);
    let paid = 0, resumed = 0;
    await durable.kick(old.id, async () => { resumed++; });
    await assert.rejects(durable.paidOperation(old.id, "fixture", { id: "fixture" }, async () => { paid++; return "unexpected"; }), /历史任务/);
    assert.equal(resumed, 0); assert.equal(paid, 0);
    await assert.rejects(images.reserveReviewedImageJob(old.id), /历史任务/);
    await assert.rejects(images.failUndeliveredImageJob(old.id, null, "fixture"), /历史任务/);
    await sweepStaleReservations(0);
    await exposeAbandonedBillingOperations();
    const oldBills = (await pool.query("SELECT row_key FROM naumi_staging_guard.origin_rows WHERE table_name='app_billing_operations'")).rows;
    for (const b of oldBills) await withBillingTransaction(pool, tx => refreshApiCostOperation(tx, b.row_key));
    let supplierFetches = 0;
    const worker = await runSupplierCostWorker(createSupplierLedger(pool), { batch: 10, fetcher: async () => { supplierFetches++; throw new Error("fixture-no-network"); } });
    // Usage GETs can be independently scheduled, but no imported task/call is leased.
    const leasedOld = await pool.query("SELECT 1 FROM app_supplier_cost_jobs j JOIN naumi_staging_guard.origin_rows o ON o.table_name='app_supplier_cost_jobs' AND o.row_key=j.key WHERE j.lease_id IS NOT NULL");
    assert.equal(leasedOld.rowCount, 0);
    for (const row of (await pool.query("SELECT operation_id,email FROM app_media_postprocess p WHERE EXISTS(SELECT 1 FROM naumi_staging_guard.origin_rows o WHERE o.table_name='app_media_postprocess' AND o.row_key=p.operation_id)")).rows) {
      await assert.rejects(recoverPostprocess(row.operation_id, row.email), /历史任务/);
    }
    assert.deepEqual(await originHashes(), before, "all imported tasks and accounting rows remain byte-equivalent");
    const id = "staging-history-runtime-new-task";
    await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'generate','{\"status\":\"pending\",\"paidOperationVersion\":1}','{}',0,false)", [id, old.email]);
    const claimed = await images.claimImageJob(id, "generate"); assert.ok(claimed);
    await images.saveImageJob(id, { status: "done" }, claimed.lease_token);
    await images.settleImageJob(id, 0, "staging-runtime-fixture", claimed.lease_token);
    assert.equal((await images.getImageJob(id, "generate"))?.billing_settled, true);
    await pool.query("DELETE FROM app_image_jobs WHERE id=$1", [id]);
    assert.deepEqual(await originHashes(), before);
    console.log(`STAGING_HISTORY_RUNTIME=PASS IMPORTED_ROWS=UNCHANGED PAID_REPLAY=${paid} RESUMED=${resumed} NEW_TASK=SETTLED`);
    console.log(`SUPPLIER_FIXTURE=PASS NETWORK=MOCKED CLAIMED_NEW=${worker.claimed} MOCK_FETCHES=${supplierFetches}`);
    console.log('STAGING_EXTERNAL_ACTIONS=BLOCKED SMTP=OFF SMS=OFF WECHAT=OFF PAYMENT=OFF');
  } finally { await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
