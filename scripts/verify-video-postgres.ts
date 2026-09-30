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
  const email = `video-runtime-${stamp}@example.test`;
  const sourceId = `source-${stamp}`;
  const completedId = `completed-${stamp}`;
  const failedId = `failed-${stamp}`;
  const deletableId = `deletable-${stamp}`;
  const intentAId = `intent-a-${stamp}`;
  const intentBId = `intent-b-${stamp}`;
  const intentKey = `intent-key-${stamp}`;

  function taskInput(id: string, source = "canvas") {
    return {
      id,
      email,
      upstreamId: `upstream-${id}`,
      model: "fixture-video-model",
      prompt: `runtime verification ${id}`,
      size: "1280x720",
      seconds: "4",
      cost: 20,
      requestBody: JSON.stringify({ id }),
      providerId: "openai-videos",
      source,
      sourceId,
      parameters: { durationSeconds: 4 },
      videoReferences: [{ id: sourceId, kind: "image", role: "first_frame", artworkId: sourceId, url: "/media/runtime.png" }],
      capabilitySnapshot: { durations: [4] },
      idempotencyKey: id,
    };
  }

  let exitCode = 0;
  try {
    await db.getOrCreateUser(email, "Video Runtime Verification");
    await db.addCreditBatch(email, 200, { source: "admin", reason: "video runtime verification" });
    await db.addArtworks(email, [{
      id: sourceId,
      title: "runtime source",
      category: "main",
      prompt: "",
      status: "completed",
      image: "/media/runtime.png",
      gradient: "from-white to-slate-100",
      parentId: null,
      parentIds: [],
      origin: "canvas",
    }]);

    const before = await sql.query<{ remaining: number; credits_used: number }>(
      `SELECT COALESCE(sum(b.remaining),0)::int AS remaining, max(u.credits_used)::int AS credits_used
         FROM app_users u LEFT JOIN app_credit_batches b ON b.email = u.email
        WHERE u.email = $1 GROUP BY u.email`,
      [email]
    );
    const startingPrincipal = Number(before.rows[0].remaining);

    const intentBase = taskInput(intentAId);
    const [intentA, intentB] = await Promise.all([
      db.createVideoTaskWithReservation({ ...intentBase, id: intentAId, idempotencyKey: intentKey }),
      db.createVideoTaskWithReservation({ ...intentBase, id: intentBId, idempotencyKey: intentKey }),
    ]);
    assert.equal(Number(intentA.created) + Number(intentB.created), 1, "idempotent creation has one owner");
    const durableIntent = intentA.created ? intentA.task : intentB.task;
    assert.equal(durableIntent.status, "queued", "creation intent persisted before upstream call");
    assert.equal(durableIntent.upstreamId, "", "queued creation has no fabricated upstream id");
    const intentRows = await sql.query<{ tasks: number; reservations: number }>(
      `SELECT
         (SELECT count(*)::int FROM app_video_tasks WHERE email = $1 AND idempotency_key = $2) AS tasks,
         (SELECT count(*)::int FROM app_gen_reservations WHERE job_id = $3) AS reservations`,
      [email, intentKey, durableIntent.id]
    );
    assert.equal(intentRows.rows[0].tasks, 1, "one durable intent row");
    assert.equal(intentRows.rows[0].reservations, 1, "reservation committed with intent");
    await db.markVideoTaskCreationUnknown({ email, id: durableIntent.id, error: "ambiguous fixture" });
    assert.equal((await db.getVideoTask(email, durableIntent.id))?.status, "needs_attention");
    assert.equal(await db.sweepStaleReservations(0), 0, "active/needs-attention reservation is never swept");
    assert.equal(await db.bindUnknownVideoTaskUpstream({ email, id: durableIntent.id, upstreamId: `upstream-${durableIntent.id}` }), true);
    assert.equal(await db.scheduleVideoTaskRetry(email, durableIntent.id, 3, "network", true), 1);
    assert.equal(await db.scheduleVideoTaskRetry(email, durableIntent.id, 3, "network", true), 2);
    assert.equal(await db.scheduleVideoTaskRetry(email, durableIntent.id, 3, "", false), 0, "normal progress resets failures");
    assert.equal(await db.scheduleVideoTaskRetry(email, durableIntent.id, 3, "network", true), 1);
    assert.equal(await db.noteVideoTaskResultObserved(email, durableIntent.id), 0, "first completed observation gets fresh budget");
    assert.equal(await db.scheduleVideoTaskRetry(email, durableIntent.id, 3, "storage", true, true), 1);
    await db.stageVideoTaskResult({ email, id: durableIntent.id, videoUrl: "/media/staged.mp4", resultStorageKey: "staged.mp4" });
    const staged = await db.getVideoTask(email, durableIntent.id);
    assert.equal(staged?.status, "processing");
    assert.equal(staged?.videoUrl, "/media/staged.mp4", "staged result survives settlement retry");
    await db.failVideoTask({ email, id: durableIntent.id, error: "fixture cleanup" });

    assert.equal(await db.reserveCredits(email, 20), true, "success task reservation");
    await db.addReservation(completedId, email, 20);
    await db.createVideoTask(taskInput(completedId));
    assert.equal(await db.claimVideoTaskPoll(email, completedId, 60), true, "first lease claim");
    assert.equal(await db.claimVideoTaskPoll(email, completedId, 60), false, "second lease claim blocked");
    await db.releaseVideoTaskPoll(email, completedId);
    assert.equal(await db.claimVideoTaskPoll(email, completedId, 60), true, "lease claim after release");
    await db.releaseVideoTaskPoll(email, completedId);

    await db.completeVideoTask({
      email,
      id: completedId,
      artworkId: `vid-art-${completedId}`,
      videoUrl: "/media/runtime-result.mp4",
      resultStorageKey: "runtime-result.mp4",
      lastResponse: { status: "completed" },
    });
    await assert.rejects(
      () => db.completeVideoTask({
        email,
        id: completedId,
        artworkId: `vid-art-${completedId}`,
        videoUrl: "/media/different-result.mp4",
        resultStorageKey: "different-result.mp4",
      }),
      /产物不可覆盖/,
      "completed result is terminal and immutable"
    );
    await db.completeVideoTask({
      email,
      id: completedId,
      artworkId: `vid-art-${completedId}`,
      videoUrl: "/media/runtime-result.mp4",
      resultStorageKey: "runtime-result.mp4",
      lastResponse: { status: "completed" },
    });

    const successState = await sql.query<{ remaining: number; credits_used: number; ledger_count: number; result_count: number }>(
      `SELECT
         (SELECT COALESCE(sum(remaining),0)::int FROM app_credit_batches WHERE email = $1) AS remaining,
         (SELECT credits_used::int FROM app_users WHERE email = $1) AS credits_used,
         (SELECT count(*)::int FROM app_ledger WHERE id = $2) AS ledger_count,
         (SELECT count(*)::int FROM app_video_results WHERE task_id = $3) AS result_count`,
      [email, `led-video-${completedId}`, completedId]
    );
    assert.equal(successState.rows[0].remaining, startingPrincipal - 20, "principal deducted exactly once");
    assert.equal(successState.rows[0].credits_used, 0, "success reservation released");
    assert.equal(successState.rows[0].ledger_count, 1, "success ledger idempotent");
    assert.equal(successState.rows[0].result_count, 1, "result history idempotent");

    assert.equal(await db.reserveCredits(email, 20), true, "failed task reservation");
    await db.addReservation(failedId, email, 20);
    await db.createVideoTask(taskInput(failedId, "workbench"));
    await db.failVideoTask({ email, id: failedId, error: "fixture failure" });
    await db.failVideoTask({ email, id: failedId, error: "fixture failure repeated" });
    const failureState = await sql.query<{ remaining: number; credits_used: number; reservation_count: number }>(
      `SELECT
         (SELECT COALESCE(sum(remaining),0)::int FROM app_credit_batches WHERE email = $1) AS remaining,
         (SELECT credits_used::int FROM app_users WHERE email = $1) AS credits_used,
         (SELECT count(*)::int FROM app_gen_reservations WHERE job_id = $2) AS reservation_count`,
      [email, failedId]
    );
    assert.equal(failureState.rows[0].remaining, startingPrincipal - 20, "failure does not consume principal");
    assert.equal(failureState.rows[0].credits_used, 0, "failure refund idempotent");
    assert.equal(failureState.rows[0].reservation_count, 0, "failure reservation cleared");

    const orphanId = `orphan-${stamp}`;
    assert.equal(await db.reserveCredits(email, 7), true, "orphan reservation");
    await db.addReservation(orphanId, email, 7);
    await sql.query(`UPDATE app_gen_reservations SET created_at = now() - interval '1 hour' WHERE job_id = $1`, [orphanId]);
    assert.equal(await db.sweepStaleReservations(1), 1, "orphan refund and reservation deletion commit together");
    const orphanState = await sql.query<{ credits_used: number; reservations: number }>(
      `SELECT
         (SELECT credits_used::int FROM app_users WHERE email = $1) AS credits_used,
         (SELECT count(*)::int FROM app_gen_reservations WHERE job_id = $2) AS reservations`,
      [email, orphanId]
    );
    assert.equal(orphanState.rows[0].credits_used, 0, "orphan precharge refunded");
    assert.equal(orphanState.rows[0].reservations, 0, "orphan reservation cleared");

    await db.createVideoTask(taskInput(deletableId));
    await assert.rejects(() => db.deleteFinishedVideoTask(email, deletableId), /进行中的任务不能删除/);
    await db.failVideoTask({ email, id: deletableId, error: "ready to delete" });
    assert.equal(await db.deleteFinishedVideoTask(email, deletableId), true, "finished task deleted");

    const canvasTasks = await db.listVideoTasks(email, { source: "canvas", limit: 100 });
    assert.ok(canvasTasks.every((task) => task.source === "canvas"), "source filter isolates canvas tasks");
    assert.equal(await db.setArtworkOrigin(email, sourceId, null), true);
    assert.equal(await db.setArtworkOrigin(email, sourceId, "canvas"), true);

    console.log(`PASS video postgres runtime: schema=ready creation=atomic+recoverable unknown=needs_attention+bind active_reservation=protected transient_counter=consecutive staged_result=resumable lease=exclusive completion=terminal+idempotent billing=exact refund=idempotent orphan_refund=atomic source_filter=canvas delete=terminal_only email=${email}`);
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    await sql.end().catch(() => {});
    process.exit(exitCode);
  }
}

void main();
