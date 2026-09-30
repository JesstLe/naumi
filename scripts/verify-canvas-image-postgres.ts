import assert from "node:assert/strict";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.NAUMI_MULTI_USER = "1";
  process.env.NAUMI_EDITION = "pro";
  process.env.PRO_LICENSE_KEY = "LOCAL-OFFLINE";
  const db = await import("../src/lib/db");
  const sql = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `canvas-image-runtime-${stamp}@example.test`;
  const sourceId = `source-${stamp}`;
  const completedId = `imgtask-complete-${stamp}`;
  const failedId = `imgtask-fail-${stamp}`;
  try {
    await db.getOrCreateUser(email, "Canvas Image Runtime Verification");
    await db.addCreditBatch(email, 100, { source: "admin", reason: "canvas image runtime verification" });
    await db.addArtworks(email, [{
      id: sourceId, title: "source", category: "main", prompt: "", status: "completed",
      image: "/media/source.png", gradient: "from-white to-slate-100", parentId: null,
      parentIds: [], origin: "canvas",
    }]);
    const before = await sql.query<{ remaining: number }>(
      `SELECT COALESCE(sum(remaining),0)::int AS remaining FROM app_credit_batches WHERE email=$1`, [email]
    );
    const starting = Number(before.rows[0].remaining);

    assert.equal(await db.reserveCredits(email, 10), true);
    await db.addReservation(completedId, email, 10);
    await db.createCanvasImageTask({
      id: completedId, email, sourceArtworkId: sourceId, cost: 10,
      parameters: { artworkId: sourceId, oldText: "春", newText: "夏", box: { x: 1, y: 2, width: 3, height: 4 }, canvasX: 320, canvasY: 180 },
    });
    const created = await db.getCanvasImageTask(email, completedId);
    assert.equal(created?.kind, "text-edit");
    assert.equal(created?.sourceArtworkId, sourceId);
    assert.equal(created?.parameters.canvasX, 320);
    assert.equal((await db.claimNextCanvasImageTask(60))?.id, completedId, "first lease claims task");
    assert.equal(await db.claimNextCanvasImageTask(60), null, "leased task cannot be double claimed");
    await db.updateCanvasImageTaskProgress(completedId, 82);
    await db.completeCanvasImageTask({ id: completedId, email, resultArtworkId: `txtedit-${completedId}` });
    await db.completeCanvasImageTask({ id: completedId, email, resultArtworkId: `txtedit-${completedId}` });
    const success = await sql.query<{ remaining: number; used: number; ledger: number; reservations: number }>(
      `SELECT
        (SELECT COALESCE(sum(remaining),0)::int FROM app_credit_batches WHERE email=$1) AS remaining,
        (SELECT credits_used::int FROM app_users WHERE email=$1) AS used,
        (SELECT count(*)::int FROM app_ledger WHERE id=$2) AS ledger,
        (SELECT count(*)::int FROM app_gen_reservations WHERE job_id=$3) AS reservations`,
      [email, `led-canvas-image-${completedId}`, completedId]
    );
    assert.equal(success.rows[0].remaining, starting - 10, "principal charged once");
    assert.equal(success.rows[0].used, 0, "reservation released after success");
    assert.equal(success.rows[0].ledger, 1, "ledger idempotent");
    assert.equal(success.rows[0].reservations, 0, "reservation row cleared");

    assert.equal(await db.reserveCredits(email, 10), true);
    await db.addReservation(failedId, email, 10);
    await db.createCanvasImageTask({ id: failedId, email, sourceArtworkId: sourceId, cost: 10, parameters: {} });
    assert.equal((await db.claimNextCanvasImageTask(60))?.id, failedId);
    await db.failCanvasImageTask({ id: failedId, email, error: "fixture failure" });
    await db.failCanvasImageTask({ id: failedId, email, error: "fixture failure repeated" });
    const failure = await sql.query<{ remaining: number; used: number; reservations: number }>(
      `SELECT
        (SELECT COALESCE(sum(remaining),0)::int FROM app_credit_batches WHERE email=$1) AS remaining,
        (SELECT credits_used::int FROM app_users WHERE email=$1) AS used,
        (SELECT count(*)::int FROM app_gen_reservations WHERE job_id=$2) AS reservations`,
      [email, failedId]
    );
    assert.equal(failure.rows[0].remaining, starting - 10, "failure consumes no principal");
    assert.equal(failure.rows[0].used, 0, "failure refund idempotent");
    assert.equal(failure.rows[0].reservations, 0, "failure reservation cleared");
    assert.ok((await db.listCanvasImageTasks(email)).some((task) => task.id === completedId && task.status === "completed"));
    console.log(`PASS canvas image postgres runtime: schema=ready lease=exclusive completion=idempotent billing=exact refund=idempotent restore=position email=${email}`);
  } finally {
    await sql.end().catch(() => {});
  }
}

void main();
