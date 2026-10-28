import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {excludeImportedHistory,isImportedHistory} from "@/lib/staging-history";

/**
 * 领取一次视频上游轮询/落盘执行权。短锁避免浏览器并发轮询重复下载视频、
 * 重复落作品节点或重复结算积分；执行进程异常后锁会自动过期。
 */
export async function claimVideoTaskPoll(
  email: string,
  id: string,
  leaseSeconds = 210
): Promise<boolean> {
  await ensureSchema();
  if (await isImportedHistory(getPool(), "app_video_tasks", id)) return false;
  const { rowCount } = await getPool().query(
    `UPDATE app_video_tasks
        SET poll_lock_until = now() + ($3 || ' seconds')::interval,
            last_polled_at = now(),
            updated_at = now()
      WHERE email = $1 AND id = $2 AND status IN ('queued','processing')
        AND (next_poll_at IS NULL OR next_poll_at <= now())
        AND (poll_lock_until IS NULL OR poll_lock_until < now())`,
    [email.toLowerCase(), id, Math.max(15, Math.trunc(leaseSeconds))]
  );
  return (rowCount ?? 0) > 0;
}

export async function releaseVideoTaskPoll(email: string, id: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_video_tasks SET poll_lock_until = NULL, updated_at = now()
      WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
}

export async function recordVideoTaskPoll(
  email: string,
  id: string,
  progress: number,
  lastResponse: unknown,
  errorDetail?: unknown
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_video_tasks SET progress = $3, last_response = $4::jsonb,
            error_detail = $5::jsonb, last_polled_at = now(), updated_at = now()
      WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id, Math.max(0, Math.min(100, Math.trunc(progress))), JSON.stringify(lastResponse ?? {}), JSON.stringify(errorDetail ?? {})]
  );
}

/** First completed observation starts a fresh consecutive-failure budget. */
export async function noteVideoTaskResultObserved(email: string, id: string): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ poll_attempts: number }>(
    `UPDATE app_video_tasks
        SET poll_attempts = CASE WHEN result_observed_at IS NULL THEN 0 ELSE poll_attempts END,
            result_observed_at = COALESCE(result_observed_at, now()),
            updated_at = now()
      WHERE email = $1 AND id = $2
      RETURNING poll_attempts`,
    [email.toLowerCase(), id]
  );
  return Number(rows[0]?.poll_attempts ?? 0);
}

/** Persist a downloaded/uploaded result before artwork + billing settlement. */
export async function stageVideoTaskResult(input: {
  email: string;
  id: string;
  videoUrl: string;
  resultStorageKey?: string;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_video_tasks
        SET video_url = $3, result_storage_key = $4, updated_at = now()
      WHERE email = $1 AND id = $2 AND status = 'processing'`,
    [input.email.toLowerCase(), input.id, input.videoUrl, input.resultStorageKey || ""]
  );
}

/** worker/恢复扫描:领取到期且无锁的 queued/processing 任务(id+email)。 */
export async function listDueVideoTaskRefs(limit = 5): Promise<
  { id: string; email: string }[]
> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, email
       FROM app_video_tasks
      WHERE status IN ('queued','processing')
        AND error_code <> 'creation_unknown'
        AND (next_poll_at IS NULL OR next_poll_at <= now())
        AND (poll_lock_until IS NULL OR poll_lock_until < now())
      ${excludeImportedHistory("app_video_tasks")} ORDER BY created_at
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 20)]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    email: String(r.email),
  }));
}

/**
 * 轮询调度回写。poll_attempts 只表示连续瞬时失败次数：正常的
 * queued/processing 状态不会消耗失败预算，并会把之前的瞬时失败清零。
 */
export async function scheduleVideoTaskRetry(
  email: string,
  id: string,
  delaySeconds: number,
  errorMessage: string,
  incrementTransientFailure = true,
  completionPhase = false,
  successfulPollPhase = false
): Promise<number> {
  await ensureSchema();
  const { rows } = await getPool().query<{ poll_attempts: number }>(
    `UPDATE app_video_tasks
        SET next_poll_at = CASE
              WHEN cancellation_requested_at > last_polled_at THEN now()
              ELSE now() + ($3 || ' seconds')::interval
            END,
            poll_attempts = CASE
              WHEN $6 AND result_observed_at IS NULL THEN 1
              WHEN $7 THEN 1
              WHEN $5 THEN poll_attempts + 1
              ELSE 0
            END,
            result_observed_at = CASE
              WHEN $6 THEN COALESCE(result_observed_at, now())
              ELSE result_observed_at
            END,
            error = $4,
            error_code = CASE WHEN $6 THEN 'result_settlement_retry' ELSE error_code END,
            poll_lock_until = NULL,
            updated_at = now()
      WHERE email = $1 AND id = $2 AND status IN ('queued','processing')
      RETURNING poll_attempts`,
    [
      email.toLowerCase(),
      id,
      Math.max(3, Math.trunc(delaySeconds)),
      errorMessage.slice(0, 500),
      incrementTransientFailure,
      completionPhase,
      successfulPollPhase,
    ]
  );
  return Number(rows[0]?.poll_attempts ?? 0);
}
