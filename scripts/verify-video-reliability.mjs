import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/lib/video/service.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const openai = readFileSync(new URL("../src/lib/video/providers/openai-videos.ts", import.meta.url), "utf8");
const direct = readFileSync(new URL("../src/lib/video/providers/direct.ts", import.meta.url), "utf8");
const download = readFileSync(new URL("../src/lib/video/result-download.ts", import.meta.url), "utf8");
const resolveRoute = readFileSync(new URL("../src/app/api/video/tasks/[id]/resolve/route.ts", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/components/video/video-studio-client.tsx", import.meta.url), "utf8");
const tasksRoute = readFileSync(new URL("../src/app/api/video/tasks/route.ts", import.meta.url), "utf8");
const taskByIdRoute = readFileSync(new URL("../src/app/api/video/tasks/[id]/route.ts", import.meta.url), "utf8");
const providerConfig = readFileSync(new URL("../src/lib/video/providers/config.ts", import.meta.url), "utf8");
const mediaRoute = readFileSync(new URL("../src/app/media/[...path]/route.ts", import.meta.url), "utf8");

const pollStart = service.indexOf("export async function pollAndSettle");
const pollEnd = service.indexOf("export async function listVideoTaskViews", pollStart);
assert.ok(pollStart >= 0 && pollEnd > pollStart, "pollAndSettle body exists");
const poll = service.slice(pollStart, pollEnd);

// Fault injection: every failure point after a completed observation remains
// inside the retrying try/catch, and URL staging makes settlement resumable.
const observed = poll.indexOf("completionObserved = result.status === \"completed\"");
for (const marker of [
  "adapter.fetchResult(snapshot, result)",
  "fetch(file.url",
  "uploadImage(bytes",
  "stageVideoTaskResult({",
  "await addArtworks(email",
  "await completeVideoTask({",
]) {
  assert.ok(poll.indexOf(marker) > observed, `${marker} must run after completed observation`);
}
assert.match(
  poll,
  /if \(!url\) \{[\s\S]*stageVideoTaskResult\([\s\S]*await addArtworks/,
  "a staged URL must skip fetch/download/upload on the next settlement attempt"
);
assert.match(
  poll,
  /if \(pollSucceeded \|\| error instanceof TransientPollError\)[\s\S]*scheduleTransientTaskRetry/,
  "poll success followed by record/schedule/storage/DB failure must retry"
);
assert.match(
  poll,
  /completionObserved[\s\S]*scheduleTransientTaskRetry\([\s\S]*completionObserved\s*\)/,
  "completed settlement failure must use the completion-phase counter"
);

// Consecutive-failure semantics: ordinary provider progress resets to zero;
// first completed result resets prior poll failures and counts settlement as 1.
assert.match(db, /WHEN \$6 AND result_observed_at IS NULL THEN 1/);
assert.match(db, /WHEN \$5 THEN poll_attempts \+ 1[\s\S]*ELSE 0/);
assert.match(db, /result_observed_at = COALESCE\(result_observed_at, now\(\)\)/);
assert.match(poll, /scheduleVideoTaskRetry\(email, id, 10, "", false\)/);
assert.match(service, /if \(completionPhase\)[\s\S]*低频持续重试/, "completed local settlement never auto-refunds");

function injectedAttempt({ previous, successfulProgress = false, firstCompletedFailure = false }) {
  if (successfulProgress) return 0;
  if (firstCompletedFailure) return 1;
  return previous + 1;
}
assert.equal(injectedAttempt({ previous: 39, successfulProgress: true }), 0, "normal processing resets old failures");
assert.equal(injectedAttempt({ previous: 39, firstCompletedFailure: true }), 1, "first result failure gets a fresh budget");
assert.equal(injectedAttempt({ previous: 1 }), 2, "consecutive result failures increment");

// Crash recovery and pool safety: the durable queued intent and reservation
// are committed under a transaction-scoped lock before any upstream request.
assert.match(db, /export async function createVideoTaskWithReservation/);
assert.match(db, /pg_advisory_xact_lock/);
assert.doesNotMatch(db, /pg_advisory_lock\(/);
assert.match(db, /INSERT INTO app_gen_reservations[\s\S]*INSERT INTO app_video_tasks/);
assert.match(db, /status IN \('queued','processing'\)/);
assert.match(db, /app_video_tasks_due_idx[\s\S]*status IN \('queued','processing'\)/);
assert.match(poll, /task.status === "queued" \|\| !task.upstreamId/);
assert.match(service, /idempotencyKey: task.idempotencyKey[\s\S]*submitQueuedVideoTask/);
assert.match(service, /\["header", "body"\][\s\S]*markVideoTaskCreationUnknown/, "missing/none strategy fails closed");
assert.match(service, /function videoCreationRetryConfigMatches/);
assert.match(service, /current\.idempotencyStrategy !== snapshotStrategy/);
assert.match(service, /providerSnapshot\?\.idempotencyBodyField[\s\S]*current\.idempotencyBodyField/);
for (const field of ["protocol", "baseUrl", "createPath", "workflowId", "defaultModel", "credentialFingerprint"]) {
  assert.ok(service.includes(`"${field}"`), `retry domain must compare ${field}`);
}
assert.match(service, /publicProviderSnapshot\(current\)/);
assert.match(direct, /body 幂等策略缺少字段映射/);
assert.match(providerConfig, /idempotencyStrategy === "body" && !idempotencyBodyField\) return null/);
assert.match(providerConfig, /credentialFingerprint: createHash\("sha256"\)/);
assert.match(service, /submitQueuedVideoTask\([\s\S]*videoCreationRetryConfigMatches\(task\)/, "every repeated create is gated by the immutable snapshot");
assert.match(service, /submitQueuedVideoTask\(email, claimed\.task, request, imageForUpload, false\)/, "first claimed create is allowed once even when strategy is none");
assert.match(db, /status = 'needs_attention'[\s\S]*error_code = 'creation_unknown'/);
assert.match(resolveRoute, /cancel_confirmed_not_created/);
assert.match(resolveRoute, /bindUnknownVideoTaskUpstream/);
assert.match(db, /NOT EXISTS \([\s\S]*app_video_tasks[\s\S]*needs_attention[\s\S]*NOT EXISTS \([\s\S]*app_canvas_image_tasks/, "reservation sweep protects active jobs");
assert.match(service, /task\.status === "queued"[\s\S]*catch \(error\) \{[\s\S]*scheduleCreationRetry\(email, task, error\)/, "queued recovery uses typed creation retry semantics");
assert.match(db, /if \(task\.status === "completed"\)[\s\S]*产物不可覆盖/, "completed task result is immutable");
assert.match(db, /sweepStaleReservations[\s\S]*BEGIN[\s\S]*DELETE FROM app_gen_reservations[\s\S]*UPDATE app_users[\s\S]*COMMIT/, "orphan refund and reservation deletion share one transaction");

// Recovery repeats the same provider request key. This is exactly-once for
// providers honoring the standard header and explicitly best-effort otherwise.
assert.match(openai, /"Idempotency-Key": input.idempotencyKey/);
assert.match(direct, /"Idempotency-Key": input.idempotencyKey/);
assert.match(direct, /"X-Idempotency-Key": input.idempotencyKey/);
assert.match(direct, /2xx 响应不是有效 JSON/);
assert.match(direct, /缺少可识别的 status\/url\/error/);
assert.match(direct, /isRecognizedStatus/);
assert.match(direct, /data\.resultJson/);
assert.match(direct, /data\.state/);
assert.match(direct, /Kie 顶层 msg/);
assert.match(download, /response\.body\.getReader\(\)/);
assert.doesNotMatch(download, /arrayBuffer\(/);
assert.match(download, /mimeType\.startsWith\("video\/"\)/);
assert.match(service, /\} else \{[\s\S]*bytes\.byteLength > 8 \* 1024 \* 1024[\s\S]*data:/);
assert.match(service, /sanitizeVideoProviderPayload/);
const storageBranch = service.indexOf("if (storageEnabled) {", service.indexOf("const extension = videoExtensionForMime"));
const base64Fallback = service.indexOf("Buffer.from(bytes).toString(\"base64\")", storageBranch);
assert.ok(storageBranch >= 0 && base64Fallback > storageBranch, "base64 conversion exists only after the storage branch");
const storageBlock = service.slice(storageBranch, service.indexOf("resultStorageKey =", storageBranch));
assert.match(storageBlock, /if \(storageEnabled\)[\s\S]*uploadImage\([\s\S]*\} else \{[\s\S]*Buffer\.from\(bytes\)/);
assert.doesNotMatch(storageBlock.slice(0, storageBlock.indexOf("if (storageEnabled)")), /base64/, "storage path must not preallocate base64");
assert.match(service, /function videoExtensionForMime/);
for (const mime of ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]) {
  assert.ok(service.includes(`"${mime}"`), `MIME mapping missing ${mime}`);
}
assert.match(mediaRoute, /createReadStream/);
assert.match(mediaRoute, /status: 206/);
assert.match(mediaRoute, /content-range/);
assert.match(mediaRoute, /accept-ranges/);
assert.doesNotMatch(mediaRoute, /readFile\(/, "local video delivery must not buffer the whole file");
assert.match(studio, /const idempotencyKey = crypto\.randomUUID\(\)[\s\S]*idempotencyKey,/);
assert.match(tasksRoute, /VALID_STATUS[\s\S]*needs_attention/);
assert.match(tasksRoute, /tasks: tasks\.map\(publicVideoTaskView\)/);
assert.match(tasksRoute, /task: publicVideoTaskView\(task\)/);
assert.match(taskByIdRoute, /task: publicVideoTaskView\(task\)/);
const publicDtoStart = service.indexOf("export function publicVideoTaskView");
const publicDtoEnd = service.indexOf("\n}\n", publicDtoStart) + 3;
const publicDto = service.slice(publicDtoStart, publicDtoEnd);
for (const privateField of [
  "upstreamId",
  "parameters",
  "videoReferences",
  "capabilitySnapshot",
  "providerSnapshot",
  "responseBody",
  "lastResponse",
  "errorDetail",
  "resultStorageKey",
  "idempotencyKey",
]) {
  assert.ok(!publicDto.includes(privateField), `public task DTO leaks ${privateField}`);
}

console.log(
  "PASS video reliability fault injection: progress_reset=0 first_completion_failure=1 consecutive_retry=2 " +
  "creation=durable pool_lock=transactional settlement=resumable idempotency=forwarded"
);
