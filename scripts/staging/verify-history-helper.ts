import assert from "node:assert/strict";
import { Pool } from "pg";
import { assertMutableStagingTask, excludeImportedHistory, isImportedHistory } from "../../src/lib/staging-history";

async function main() {
  process.env.NAUMI_ENVIRONMENT = "staging";
  delete process.env.NAUMI_STAGING_HISTORY_GUARD;
  assert.equal(excludeImportedHistory("app_image_jobs"), "");
  let queries = 0;
  const fake = { async query() { queries++; return { rowCount: 1 }; } };
  assert.equal(await isImportedHistory(fake, "app_image_jobs", "old"), false);
  assert.equal(queries, 0);
  process.env.NAUMI_STAGING_HISTORY_GUARD = "1";
  assert.equal(await isImportedHistory(fake, "app_image_jobs", "old"), true);
  await assert.rejects(assertMutableStagingTask(fake, "app_image_jobs", "old"), /历史任务/);
  assert.match(excludeImportedHistory("app_image_jobs"), /naumi_staging_guard/);
  assert.throws(() => excludeImportedHistory("app_image_jobs", "unsafe;SQL"));
  process.env.NAUMI_ENVIRONMENT = "production";
  assert.throws(() => excludeImportedHistory("app_image_jobs"), /配置错误/);
  process.env.NAUMI_ENVIRONMENT = "staging";
  if (process.env.STAGING_VERIFY_DATABASE_URL) {
    const db = new Pool({ connectionString: process.env.STAGING_VERIFY_DATABASE_URL });
    try {
      const result = await db.query("SELECT id FROM app_image_jobs ORDER BY id LIMIT 1");
      const id = result.rows[0].id;
      assert.equal(await isImportedHistory(db, "app_image_jobs", id), true);
      assert.equal(await isImportedHistory(db, "app_image_jobs", "brand-new-test-task"), false);
      await assert.rejects(assertMutableStagingTask(db, "app_image_jobs", id), /历史任务/);
      const due = await db.query(`SELECT id FROM app_image_jobs WHERE true ${excludeImportedHistory("app_image_jobs")}`);
      assert.equal(due.rowCount, 0);
      console.log("STAGING_HISTORY_DATABASE=PASS IMPORTED_EXCLUDED=1 NEW_TASK_ALLOWED=1");
    } finally { await db.end(); }
  }
  console.log("STAGING_HISTORY_HELPER=PASS PRODUCTION_DEFAULT=UNCHANGED FAIL_CLOSED=1");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
