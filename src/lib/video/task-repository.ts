import "server-only";
import type {PoolClient} from "pg";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {mapVideoTask,type VideoTaskRow,type VideoResultRow} from "./task-types";

export async function createVideoTask(input: {
  id: string;
  email: string;
  upstreamId: string;
  model: string;
  prompt: string;
  size: string;
  seconds: string;
  cost: number;
  requestBody: string;
  providerId?: string;
  source?: string;
  sourceId?: string;
  parameters?: unknown;
  videoReferences?: unknown;
  capabilitySnapshot?: unknown;
  idempotencyKey?: string;
  channelId?: string;
  providerSnapshot?: unknown;
  responseBody?: string;
}): Promise<VideoTaskRow> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO app_video_tasks
       (id, email, upstream_id, model, prompt, size, seconds, status, cost, request_body,
        provider_id, source, source_id, parameters, video_references, capability_snapshot, idempotency_key,
        started_at, next_poll_at, channel_id, provider_snapshot, response_body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'processing',$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,now(),now(),$17,$18::jsonb,$19)`,
    [
      input.id,
      input.email.toLowerCase(),
      input.upstreamId,
      input.model,
      input.prompt,
      input.size,
      input.seconds,
      input.cost,
      input.requestBody.slice(0, 4000),
      input.providerId ?? "openai-videos",
      input.source ?? "canvas",
      input.sourceId ?? "",
      JSON.stringify(input.parameters ?? {}),
      JSON.stringify(input.videoReferences ?? []),
      JSON.stringify(input.capabilitySnapshot ?? {}),
      (input.idempotencyKey ?? "").slice(0, 100),
      (input.channelId ?? input.providerId ?? "").slice(0, 100),
      JSON.stringify(input.providerSnapshot ?? {}),
      (input.responseBody ?? "").slice(0, 8000),
    ]
  );
  return {
    id: input.id,
    upstreamId: input.upstreamId,
    model: input.model,
    prompt: input.prompt,
    status: "processing",
    progress: 0,
    cost: input.cost,
    artworkId: "",
    videoUrl: "",
    error: "",
    providerId: input.providerId ?? "openai-videos",
    source: input.source ?? "canvas",
    sourceId: input.sourceId ?? "",
    parameters: {},
    videoReferences: [],
    capabilitySnapshot: {},
    seconds: input.seconds,
    pollAttempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export async function getVideoTask(
  email: string,
  id: string,
  tx?:Pick<PoolClient,"query">
): Promise<VideoTaskRow | null> {
  await ensureSchema();
  const { rows } = await (tx||getPool()).query(
    `SELECT id, upstream_id, model, prompt, status, progress, cost, artwork_id, video_url, error,
            provider_id, source, source_id, parameters, video_references, capability_snapshot,
            next_poll_at, poll_attempts, seconds, created_at, updated_at, completed_at,
            provider_snapshot, response_body, last_response, error_detail, result_storage_key,
            idempotency_key,billing_quote
            , cancellation_requested_at,cancellation_sent_at,cancellation_supported,error_code
       FROM app_video_tasks
      WHERE email = $1 AND id = $2`,
    [email.toLowerCase(), id]
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return mapVideoTask(r);
}

export async function getVideoTaskByIdempotencyKey(
  email: string,
  idempotencyKey: string
): Promise<VideoTaskRow | null> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id FROM app_video_tasks WHERE email = $1 AND idempotency_key = $2 LIMIT 1`,
    [email.toLowerCase(), idempotencyKey.slice(0, 100)]
  );
  return rows[0]?.id ? getVideoTask(email, String(rows[0].id)) : null;
}

/** 任务列表(工作台/恢复用):按创建时间倒序。 */
export async function listVideoTasks(
  email: string,
  opts: { status?: string; source?: string; sourceIds?: string[]; projectKey?: string; nodeId?: string; limit?: number;cursor?:{createdAt:string;id:string};pendingOnly?:boolean;attachedTaskIds?:string[] } = {}
): Promise<VideoTaskRow[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 30), 1), 501);
  const params: unknown[] = [email.toLowerCase()];
  let where = `email = $1`;
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  if (opts.source) {
    params.push(opts.source);
    where += ` AND source = $${params.length}`;
  }
  if (opts.sourceIds?.length) {
    params.push(Array.from(new Set(opts.sourceIds.filter(Boolean))).slice(0, 500));
    where += ` AND source_id = ANY($${params.length}::text[])`;
  }
  let attachedParameter:number|undefined;
  if((opts.projectKey||opts.nodeId)&&opts.attachedTaskIds?.length){params.push(opts.attachedTaskIds);attachedParameter=params.length;}
  for (const [field, value] of [["projectKey", opts.projectKey], ["nodeId", opts.nodeId]]) {
    if (value) { params.push(value); where += ` AND (parameters->>'${field}' = $${params.length}${attachedParameter?` OR id = ANY($${attachedParameter}::text[])`:''})`; }
  }
  if(opts.pendingOnly)where += " AND status IN ('queued','processing','needs_attention')";
  if(opts.cursor){params.push(opts.cursor.createdAt,opts.cursor.id);where += ` AND (created_at,id)<($${params.length-1}::timestamptz,$${params.length}::text)`;}
  const { rows } = await getPool().query(
    `SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,id, upstream_id, model, prompt, status, progress, cost, artwork_id, video_url, error,
            provider_id, source, source_id, parameters, video_references, capability_snapshot,
            next_poll_at, poll_attempts, seconds, created_at, updated_at, completed_at,
            provider_snapshot, response_body, last_response, error_detail, result_storage_key,
            idempotency_key,billing_quote,error_code,cancellation_requested_at,cancellation_sent_at,cancellation_supported
       FROM app_video_tasks
      WHERE ${where}
      ORDER BY created_at DESC,id DESC
      ${opts.pendingOnly?"":`LIMIT ${limit}`}`,
    params
  );
  return rows.map((row:Record<string,unknown>)=>mapVideoTask(row));
}

/** 删除已结束的视频任务历史。作品与媒体可能仍被画布引用，因此只删任务/结果记录。 */
export async function deleteFinishedVideoTask(email: string, id: string): Promise<boolean> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const task = await client.query<{ status: string }>(
      `SELECT status FROM app_video_tasks WHERE email = $1 AND id = $2 FOR UPDATE`,
      [email.toLowerCase(), id]
    );
    const status = String(task.rows[0]?.status || "");
    if (!status) {
      await client.query("ROLLBACK");
      return false;
    }
    if (status === "processing" || status === "queued" || status === "needs_attention") {
      throw new Error("进行中的任务不能删除");
    }
    await client.query(`DELETE FROM app_video_results WHERE email = $1 AND task_id = $2`, [email.toLowerCase(), id]);
    const deleted = await client.query(`DELETE FROM app_video_tasks WHERE email = $1 AND id = $2`, [email.toLowerCase(), id]);
    await client.query("COMMIT");
    return (deleted.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listVideoResults(email: string, limit = 50): Promise<VideoResultRow[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT id, task_id, artwork_id, provider_id, model, prompt, video_url,
            result_storage_key, parameters, reference_items, created_at
       FROM app_video_results
      WHERE email = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT $2`,
    [email.toLowerCase(), Math.min(Math.max(limit, 1), 100)]
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id), taskId: String(r.task_id), artworkId: String(r.artwork_id || ""),
    providerId: String(r.provider_id || ""), model: String(r.model || ""),
    prompt: String(r.prompt || ""), videoUrl: String(r.video_url || ""),
    resultStorageKey: String(r.result_storage_key || ""),
    parameters: (r.parameters || {}) as Record<string, unknown>,
    references: (r.reference_items || []) as unknown[],
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : "",
  }));
}

export async function deleteVideoResult(email: string, id: string): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE app_video_results SET deleted_at = now()
      WHERE email = $1 AND id = $2 AND deleted_at IS NULL`,
    [email.toLowerCase(), id]
  );
  return (result.rowCount || 0) > 0;
}
