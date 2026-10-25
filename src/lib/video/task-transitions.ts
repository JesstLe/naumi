import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {currentCreationContext} from "@/lib/saas/creation-scope";
import {acceptCreationTx,creationLinkTx,captureCreationMediaTx,creationTransaction,recordSourceOutcomeTx} from "@/lib/saas/creation-writer";
import {ensureCreationSchema} from "@/lib/saas/creation-schema";
import {durableCreationOutcomeTx} from "@/lib/saas/creation-writer";
import {creditMeteringEnabled} from "@/lib/billing/runtime";
import {deductPrincipalFIFO,expireDueBatches,refreshBalance} from "@/lib/billing/wallet-balance";
import {reserveTaskBillingTx,settleTaskBillingTx,videoRequestFingerprint} from "@/lib/billing/task-operation";
import {BillingError} from "@/lib/billing/types";
import type {PoolClient} from "pg";
import {mapVideoTask,type VideoTaskRow} from "./task-types";
import {addArtworksTx} from "@/lib/artworks/writer";
import type {ArtworkRecord} from "@/lib/artworks/types";

/**
 * Atomically claims an idempotent video creation and reserves its credits.
 *
 * Only the short transaction owns a pool connection. The upstream request is
 * deliberately made after this function returns, so a slow provider cannot
 * starve the (small) application pool. A queued row with an empty upstream id
 * is a durable creation intent, not proof of non-dispatch. Recovery retains the
 * original identity; provider-specific code decides whether any create is retryable.
 */
export async function createVideoTaskWithReservation(input: {
  onReserved?: (client: PoolClient, task: VideoTaskRow) => Promise<void>;
  billingQuote?:import("@/lib/billing/types").BillingQuote;
  id: string;
  email: string;
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
  idempotencyKey: string;
  channelId?: string;
  providerSnapshot?: unknown;
  leaseSeconds?: number;
}): Promise<{ task: VideoTaskRow; created: boolean }> {
  await ensureSchema();
  if(currentCreationContext())await ensureCreationSchema();
  const email = input.email.toLowerCase();
  const requestHash=videoRequestFingerprint(input);
  const idempotencyKey = input.idempotencyKey.slice(0, 100);
  const meterOn = input.billingQuote?.facts.metered??await creditMeteringEnabled();
  if (!input.billingQuote && meterOn && input.cost > 0) await expireDueBatches(email);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `video-create:${email}:${idempotencyKey}`,
    ]);
    const existing = await client.query(
      `SELECT * FROM app_video_tasks WHERE email = $1 AND idempotency_key = $2 LIMIT 1`,
      [email, idempotencyKey]
    );
    if (existing.rows[0]) {
      const oldDigest=existing.rows[0].parameters?.creationInputDigest,newDigest=(input.parameters as Record<string,unknown>|undefined)?.creationInputDigest;
      if(oldDigest&&newDigest&&oldDigest!==newDigest)throw new BillingError("OPERATION_CONFLICT","操作编号已用于不同视频任务",409);
      if(input.billingQuote&&existing.rows[0].billing_request_fingerprint&&existing.rows[0].billing_request_fingerprint!==requestHash)throw new BillingError("OPERATION_CONFLICT","操作编号已用于不同任务",409);
      await client.query("COMMIT");
      return { task: mapVideoTask(existing.rows[0] as Record<string, unknown>), created: false };
    }
    const scope=currentCreationContext();let creation:string|null=null;
    const parameters={...(input.parameters as Record<string,unknown>||{})};
    if(scope){
      const references=Array.isArray(input.videoReferences)?input.videoReferences as {artworkId?:string;id?:string;role?:string}[]:[];
      const inputs=references.filter(r=>typeof r.artworkId==='string').map(r=>({artworkId:r.artworkId!,role:r.role||'reference'}));
      creation=await acceptCreationTx(client,'video',input.id,email,{prompt:input.prompt,parameters:{...parameters,seconds:input.seconds,size:input.size},inputs});
      if(creation)await captureCreationMediaTx(client,creation,email,references);
      Object.assign(parameters,{creationScope:{...scope,creationId:creation}});
      if(creation&&input.billingQuote)await creationLinkTx(client,creation,email,'billing',input.id);
      if(creation&&!input.billingQuote&&input.cost===0)await creationLinkTx(client,creation,email,'no-charge',input.id,'explicit-no-charge');
    }
    if(input.billingQuote){await reserveTaskBillingTx(client,input.id,email,input.billingQuote,`led-video-${input.id}`);}else if (meterOn && input.cost > 0) {
      const reserved = await client.query(
        `UPDATE app_users u
            SET credits_used = credits_used + $2
          WHERE u.email = $1
            AND (SELECT COALESCE(SUM(remaining),0) FROM app_credit_batches b
                  WHERE b.email = u.email AND b.expires_at > now() AND b.remaining > 0)
                - u.credits_used >= $2`,
        [email, input.cost]
      );
      if ((reserved.rowCount ?? 0) === 0) {
        throw new Error(`积分不足，本条视频需要 ${input.cost} 积分`);
      }
    }
    if(!input.billingQuote)await client.query(
      `INSERT INTO app_gen_reservations (job_id, email, cost) VALUES ($1,$2,$3)`,
      [input.id, email, input.cost]
    );
    const created = await client.query(
      `INSERT INTO app_video_tasks
         (id, email, upstream_id, model, prompt, size, seconds, status, cost, request_body,
          provider_id, source, source_id, parameters, video_references, capability_snapshot,
          idempotency_key, next_poll_at, poll_lock_until, channel_id, provider_snapshot,billing_quote,billing_request_fingerprint)
       VALUES ($1,$2,'',$3,$4,$5,$6,'queued',$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,
               $15,now(),now() + ($18 || ' seconds')::interval,$16,$17::jsonb,$19::jsonb,$20)
       RETURNING *`,
      [
        input.id,
        email,
        input.model,
        input.prompt,
        input.size,
        input.seconds,
        input.cost,
        input.requestBody.slice(0, 4000),
        input.providerId ?? "openai-videos",
        input.source ?? "canvas",
        input.sourceId ?? "",
        JSON.stringify(parameters),
        JSON.stringify(input.videoReferences ?? []),
        JSON.stringify(input.capabilitySnapshot ?? {}),
        idempotencyKey,
        (input.channelId ?? input.providerId ?? "").slice(0, 100),
        JSON.stringify(input.providerSnapshot ?? {}),
        Math.max(30, Math.trunc(input.leaseSeconds ?? 210)),
        input.billingQuote?JSON.stringify(input.billingQuote):null,requestHash,
      ]
    );
    const task = mapVideoTask(created.rows[0] as Record<string, unknown>);
    if (input.onReserved) await input.onReserved(client, task);
    await client.query("COMMIT");
    return { task, created: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Marks a durable creation intent as submitted to the upstream provider. */
export async function markVideoTaskCreated(input: {
  email: string;
  id: string;
  upstreamId: string;
  responseBody?: string;
}): Promise<void> {
  await ensureSchema();
  if (!input.upstreamId.trim()) throw new Error("视频服务未返回任务 ID");
  await getPool().query(
    `UPDATE app_video_tasks
        SET upstream_id = $3, status = 'processing', started_at = COALESCE(started_at, now()),
            next_poll_at = now(), poll_attempts = 0, error = '', poll_lock_until = NULL,
            response_body = $4, updated_at = now()
      WHERE email = $1 AND id = $2 AND status IN ('queued','processing')`,
    [input.email.toLowerCase(), input.id, input.upstreamId, (input.responseBody ?? "").slice(0, 8000)]
  );
  await creationTransaction(tx=>durableCreationOutcomeTx(tx,'video',input.id,input.email,'running')).catch(()=>{});
}

/** Provider cannot safely deduplicate a repeated create after an ambiguous failure. */
export async function markVideoTaskCreationUnknown(input: {
  email: string;
  id: string;
  error: string;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_video_tasks
        SET status = 'needs_attention', error_code = 'creation_unknown', error = $3, next_poll_at = NULL,
            poll_lock_until = NULL, updated_at = now()
      WHERE email = $1 AND id = $2 AND status = 'queued'`,
    [input.email.toLowerCase(), input.id, input.error.slice(0, 500)]
  );
  await creationTransaction(tx=>durableCreationOutcomeTx(tx,'video',input.id,input.email,'needs_review')).catch(()=>{});
}

export async function markVideoTaskAttention(email:string,id:string,code:string,message:string){
  await ensureSchema();await getPool().query(`UPDATE app_video_tasks SET status='needs_attention',error_code=$3,error=$4,
    next_poll_at=NULL,poll_lock_until=NULL,updated_at=now() WHERE email=$1 AND id=$2 AND status IN ('queued','processing')`,[email.toLowerCase(),id,code,message.slice(0,500)]);
  await creationTransaction(tx=>durableCreationOutcomeTx(tx,'video',id,email,'needs_review')).catch(()=>{});
}

export async function resumeVideoTaskPolling(email:string,id:string){
  await ensureSchema();const result=await getPool().query(`UPDATE app_video_tasks SET status='processing',error_code='',error='',poll_attempts=0,next_poll_at=now(),updated_at=now()
    WHERE email=$1 AND id=$2 AND status='needs_attention' AND error_code='poll_unknown' AND upstream_id<>''`,[email.toLowerCase(),id]);return !!result.rowCount;
}

export async function bindUnknownVideoTaskUpstream(input: {
  email: string;
  id: string;
  upstreamId: string;
}): Promise<boolean> {
  await ensureSchema();
  if (!input.upstreamId.trim()) return false;
  const result = await getPool().query(
    `UPDATE app_video_tasks
        SET status = 'processing', upstream_id = $3, error_code = '', error = '',
            started_at = COALESCE(started_at, now()), next_poll_at = now(), updated_at = now()
      WHERE email = $1 AND id = $2 AND status = 'needs_attention'
        AND error_code = 'creation_unknown'`,
    [input.email.toLowerCase(), input.id, input.upstreamId.trim().slice(0, 500)]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function completeVideoTask(input: {
  email: string;
  id: string;
  artworkId: string;
  videoUrl: string;
  resultStorageKey?: string;
  lastResponse?: unknown;
  artworks?:Omit<ArtworkRecord,"createdAt">[];
  resultAssets?:import("./result-assets").SavedVideoResultAsset[];
  resultMetadataWarnings?:Array<{artworkId:string;code:string;expected:unknown;actual:unknown}>;
}): Promise<void> {
  await ensureSchema();
  await (await import("@/lib/canvas/video-node-repository")).ensureVideoNodeSchema();
  const email = input.email.toLowerCase();
  let meterOn = false;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{
      billing_quote?:import("@/lib/billing/types").BillingQuote;parameters?:any;
      status: string;
      cost: number;
      artwork_id: string;
      video_url: string;
      result_storage_key: string;
      source: string;
    }>(
      `SELECT status, cost, artwork_id, video_url, result_storage_key,billing_quote,parameters,source FROM app_video_tasks
        WHERE email = $1 AND id = $2 FOR UPDATE`,
      [email, input.id]
    );
    const task = locked.rows[0];
    meterOn=task?.billing_quote?.facts.metered??await creditMeteringEnabled(client);
    if (!task) throw new Error("视频任务不存在");
    if (task.status === "completed") {
      if (
        task.artwork_id !== input.artworkId
        || task.video_url !== input.videoUrl
        || task.result_storage_key !== (input.resultStorageKey || "")
      ) {
        throw new Error("已完成视频任务的产物不可覆盖");
      }
      await client.query(`DELETE FROM app_gen_reservations WHERE job_id = $1`, [input.id]);
      await client.query("COMMIT");
      return;
    }
    if(task.status==="failed"||task.status==="cancelled")throw new Error("终止的视频任务不能再次结算完成");
    if(input.resultAssets?.length){
      const existing=(await client.query("SELECT id,email,image_url,video_url FROM app_artworks WHERE id=ANY($1::text[]) FOR SHARE",[input.resultAssets.map(asset=>asset.artworkId)])).rows;
      for(const row of existing){const asset=input.resultAssets.find(item=>item.artworkId===row.id)!;
        if(row.email!==email||(asset.kind==="image"?row.image_url:row.video_url||row.image_url)!==asset.url)throw new Error("视频产物作品身份冲突，不能完成结算");}
    }
    const projectKey=task.parameters?.projectKey;
    let detached=false;
    if(typeof task.parameters?.nodeId==="string"){
      const node=(await client.query("SELECT deleted_at FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 FOR UPDATE",[email,task.parameters.nodeId])).rows[0];detached=!node||!!node.deleted_at;
    }
    if(typeof projectKey==="string"){
      const project=(await client.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2 FOR SHARE",[email,projectKey])).rows[0];detached=detached||!!project?.deleted_at;
    }
    if(input.artworks)await addArtworksTx(client,email,input.artworks.map(art=>({...art,origin:detached||task.source==="workbench"?"workbench":art.origin})));
    if(input.resultAssets)for(const asset of input.resultAssets)await client.query("UPDATE app_artworks SET image_width=$3,image_height=$4 WHERE email=$1 AND id=$2",[email,asset.artworkId,asset.probe?.width||null,asset.probe?.height||null]);
    if(typeof projectKey==="string"&&/^(?:tree|batch):[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(projectKey)){
      const kind=projectKey.slice(0,projectKey.indexOf(":")),projectId=projectKey.slice(projectKey.indexOf(":")+1);
      const linked=await client.query(`UPDATE app_artworks SET group_id=CASE WHEN $3='tree' THEN $4 ELSE group_id END,
        batch_id=CASE WHEN $3='batch' THEN $4 ELSE batch_id END WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL`,[email,input.artworks?.map(art=>art.id)||[input.artworkId],kind,projectId]);
      if(!linked.rowCount)throw new Error("视频产物不存在，不能完成项目关联");
    }
    if(task.parameters?.workflowRunId&&task.parameters?.workflowNodeId){const {completeWorkflowTaskTx}=await import("./workflow-links");await completeWorkflowTaskTx(client,email,task.parameters.workflowRunId,task.parameters.workflowNodeId,input.id,input.resultAssets);}
    if(task.billing_quote){await settleTaskBillingTx(client,input.id,email,task.billing_quote,`led-video-${input.id}`,{state:"succeeded",items:[{id:input.id,state:"succeeded",executedQuality:task.parameters?.qualityAudit?.executed||task.billing_quote.facts.quality}]});}else if (meterOn && Number(task.cost) > 0) {
      const ledgerId = `led-video-${input.id}`;
      const seen = await client.query(`SELECT 1 FROM app_ledger WHERE id = $1`, [ledgerId]);
      if (!(seen.rowCount ?? 0)) {
        await deductPrincipalFIFO(client, email, Number(task.cost));
        await client.query(
          `UPDATE app_users
              SET credits_used = GREATEST(credits_used - $2, 0)
            WHERE email = $1`,
          [email, Number(task.cost)]
        );
        await client.query(
          `INSERT INTO app_ledger (id, email, delta, reason, kind)
           VALUES ($1,$2,$3,'视频生成','consume')`,
          [ledgerId, email, -Number(task.cost)]
        );
      }
    }
    await client.query(
      `UPDATE app_video_tasks SET
         status = 'completed', progress = 100, artwork_id = $3, video_url = $4,
         error = '', poll_lock_until = NULL, completed_at = now(), updated_at = now(),
         result_storage_key = $5, last_response = $6::jsonb,
         parameters=CASE WHEN $7::jsonb IS NULL THEN parameters ELSE parameters || jsonb_build_object('resultAssets',$7::jsonb,'resultArtworkIds',$8::jsonb,'resultMetadataWarnings',$9::jsonb) END
       WHERE email = $1 AND id = $2`,
      [email, input.id, input.artworkId, input.videoUrl, input.resultStorageKey || "", JSON.stringify(input.lastResponse ?? {}),input.resultAssets?JSON.stringify(input.resultAssets):null,
        JSON.stringify(input.resultAssets?.map(asset=>asset.artworkId)||[]),JSON.stringify(input.resultMetadataWarnings||[])]
    );
    await client.query(
      `INSERT INTO app_video_results
         (id, task_id, email, artwork_id, provider_id, model, prompt, video_url,
          result_storage_key, parameters, reference_items)
       SELECT $3, id, email, $4, provider_id, model, prompt, $5, $6, parameters, video_references
         FROM app_video_tasks WHERE email = $1 AND id = $2
       ON CONFLICT (task_id) DO UPDATE SET
         artwork_id = EXCLUDED.artwork_id, video_url = EXCLUDED.video_url,
         result_storage_key = EXCLUDED.result_storage_key, deleted_at = NULL`,
      [email, input.id, `vid-result-${input.id}`, input.artworkId, input.videoUrl, input.resultStorageKey || ""]
    );
    await client.query(`DELETE FROM app_gen_reservations WHERE job_id = $1`, [input.id]);
    if (typeof task.parameters?.nodeId === "string") {
      const { completeVideoNodeTx } = await import("@/lib/canvas/video-node-repository");
      await completeVideoNodeTx(client, email, task.parameters.nodeId, input.id, input.artworkId);
    }
    await durableCreationOutcomeTx(client,'video',input.id,email,'succeeded',input.artworks?.map(a=>a.id)||[input.artworkId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (meterOn) await refreshBalance(email).catch(() => {});
}

/** 失败任务只退一次预扣积分，并原子落失败状态。 */
export async function failVideoTask(input: {
  email: string;
  id: string;
  error: string;
}): Promise<void> {
  await ensureSchema();
  const email = input.email.toLowerCase();
  let meterOn = false;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ status: string; cost: number; credits_refunded: boolean;billing_quote?:import("@/lib/billing/types").BillingQuote }>(
      `SELECT status, cost, credits_refunded,billing_quote FROM app_video_tasks
        WHERE email = $1 AND id = $2 FOR UPDATE`,
      [email, input.id]
    );
    const task = locked.rows[0];
    meterOn=task?.billing_quote?.facts.metered??await creditMeteringEnabled(client);
    if (!task) throw new Error("视频任务不存在");
    if(["completed","failed","cancelled"].includes(task.status)){await client.query("COMMIT");return;}
    if(task.billing_quote&&task.status!=="completed"){await settleTaskBillingTx(client,input.id,email,task.billing_quote,`led-video-${input.id}`,{state:"failed",items:[]});}else if (!task.billing_quote&&task.status !== "completed" && !task.credits_refunded && meterOn && Number(task.cost) > 0) {
      await client.query(
        `UPDATE app_users SET credits_used = GREATEST(credits_used - $2, 0)
          WHERE email = $1`,
        [email, Number(task.cost)]
      );
    }
    if (task.status !== "completed") {
      await client.query(
        `UPDATE app_video_tasks SET
           status = 'failed', error = $3, credits_refunded = true,
           poll_lock_until = NULL, updated_at = now()
         WHERE email = $1 AND id = $2`,
        [email, input.id, input.error.slice(0, 1000)]
      );
    }
    await client.query(`DELETE FROM app_gen_reservations WHERE job_id = $1`, [input.id]);
    await durableCreationOutcomeTx(client,'video',input.id,email,'failed');
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (meterOn) await refreshBalance(email).catch(() => {});
}

/** 轮询后回写状态;completed 时同时记录产物节点与地址。 */
export async function updateVideoTask(
  email: string,
  id: string,
  patch: Partial<Pick<VideoTaskRow, "status" | "progress" | "error" | "artworkId" | "videoUrl">>
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE app_video_tasks SET
       status = COALESCE($3, status),
       progress = COALESCE($4, progress),
       error = COALESCE($5, error),
       artwork_id = COALESCE($6, artwork_id),
       video_url = COALESCE($7, video_url),
       last_polled_at = now(),
       updated_at = now()
      WHERE email = $1 AND id = $2`,
    [
      email.toLowerCase(),
      id,
      patch.status ?? null,
      patch.progress ?? null,
      patch.error ?? null,
      patch.artworkId ?? null,
      patch.videoUrl ?? null,
    ]
  );
  if(patch.status)await creationTransaction(async tx=>{await recordSourceOutcomeTx(tx,'video',id,email,({completed:'succeeded',processing:'running',queued:'queued',failed:'failed',cancelled:'cancelled',needs_attention:'needs_review'} as const)[patch.status as 'completed']||'needs_review',{artworkIds:patch.artworkId?[patch.artworkId]:[]});}).catch(()=>{});
}
