/** Real isolated PG, actual stored-delivery recovery, no supplier transport. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  const fixture = await createModelFixture();
  process.env.PGOPTIONS = `-c search_path=${fixture.schemaName}`;
  process.env.STORAGE_DRIVER = "local";
  const db = await import("../src/lib/db");
  const repository = await import("../src/lib/image-job-repository");
  const { recoverStoredDelivery } = await import("../src/lib/imagegen/stored-delivery");
  const { closeImageCoordinationPool } = await import("../src/lib/imagegen/coordination-pool");
  await db.ensureSchema();
  const owner = `delivery-pool-${randomUUID()}@fixture.test`;
  await db.getOrCreateUser(owner);
  const pool = db.getPool(), count = Number(pool.options.max);
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer();
  const url = `data:image/png;base64,${png.toString("base64")}`;
  const parents: string[] = [], children: string[] = [];
  for (let i = 0; i < count; i++) {
    const operationId = randomUUID(), parent = `imagegen-${operationId}`, child = `job-${randomUUID()}`;
    const plan = { request: { operationId, entry: "canvas", mode: "generate", inputs: [], prompt: "pool fixture", variants: 1, output: { format: "png" } }, intent: { background: null }, steps: [{ operation: "generate" }] };
    await repository.createImageJob(child, owner, "generate", { status: "needs_attention", paidOperationVersion: 1, paidOperations: { [child]: { state: "done", result: [{ url }] } } }, { p: { resolution: "1K", count: 1 }, cost: 0 }, 0, false);
    await repository.createImageJob(parent, owner, "imagegen", { status: "needs_attention", children: { generate: { jobId: child } } }, { plan }, 0, false);
    parents.push(parent); children.push(child);
  }
  const blockers = await Promise.all(Array.from({ length: count }, () => pool.connect()));
  blockers.forEach(client => client.on("error", () => {}));
  pool.on("error", () => {});
  const pids = (await Promise.all(blockers.map(client => client.query("SELECT pg_backend_pid() pid")))).map(result => result.rows[0].pid);
  let finished = 0;
  const work = parents.map(parent => recoverStoredDelivery(parent, owner).then(result => { assert.equal(result.complete, true); finished++; }));
  const settled = Promise.allSettled(work);
  await new Promise(resolve => setTimeout(resolve, 50));
  blockers.forEach(client => client.release());
  for (let i = 0; i < 100 && finished < count; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const stalled = finished !== count;
  console.log("DELIVERY_POOL=" + JSON.stringify({ finished, expected: count, waiting: pool.waitingCount, total: pool.totalCount, stalled, supplierCalls: 0 }));
  if (stalled && process.argv.includes("--expect-stall")) {
    // A JS pool wait is not an executing SQL query and cannot be cancelled by
    // terminating a backend. Exit this isolated diagnostic process after
    // removing only its fixture schema; process exit releases its clients.
    await fixture.cleanup();
    console.log("BASELINE_DELIVERY_POOL_STALL=REPRODUCED");
    process.exit(0);
  }
  try {
    if (stalled) {
      // Terminate only this fixture's captured query backends, never business sessions.
      for (const pid of pids) await fixture.sql.query("SELECT pg_terminate_backend($1)", [pid]);
      await settled;
    }
    if (process.argv.includes("--expect-stall")) {
      assert.equal(stalled, true, "Baseline must reproduce query-pool exhaustion");
      console.log("BASELINE_DELIVERY_POOL_STALL=REPRODUCED");
      return;
    }
    assert.equal(stalled, false, "Concurrent recoveries must leave the business query pool usable");
    assert.ok((await settled).every(result => result.status === "fulfilled"));
    const rows = await pool.query("SELECT id,snapshot->'deliveryRecovery' recovery FROM app_image_jobs WHERE id=ANY($1)", [children]);
    assert.equal(rows.rowCount, count);
    assert.ok(rows.rows.every(row => row.recovery.complete && row.recovery.ids.length === 1));
    await Promise.all(parents.map(parent => recoverStoredDelivery(parent, owner)));
    assert.equal((await pool.query("SELECT count(*)::int n FROM app_artworks WHERE email=$1", [owner])).rows[0].n, count);
    assert.equal((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1 AND kind='consume'", [owner])).rows[0].n, 0);
    console.log("DELIVERY_RECOVERY_POOL=PASS CONCURRENT=5 REPEAT_ARTIFACTS=0 SUPPLIER_CALLS=0");
  } finally {
    await closeImageCoordinationPool();
    await pool.end();
    await fixture.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
