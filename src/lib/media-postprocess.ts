import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Pool } from "pg";
import { dbEnabled, getPool } from "./db";
import { uploadImage } from "./storage";
import { readManagedObject } from "./storage";
import { assertMutableStagingTask } from "./staging-history";
import type { Postprocess } from "./model-config/business-schema";
export class PostprocessPending extends Error { constructor(public operationId: string) { super("底图已保存，后处理未完成；恢复只重做此阶段"); } }
const ready = new WeakMap<Pool, Promise<unknown>>();
type PostprocessResult = { url:string; width:number; height:number; kind:Postprocess["kind"]|"base"; status:"succeeded"|"failed-kept-base" };
export async function ensurePostprocessSchema(pool: Pool) {
  let p = ready.get(pool);
  if (!p) { p = pool.query(`CREATE TABLE IF NOT EXISTS app_media_postprocess(
    operation_id text PRIMARY KEY,parent_operation_id text NOT NULL,email text NOT NULL,model_version bigint NOT NULL,
    digest text NOT NULL,policy jsonb NOT NULL,base_url text NOT NULL,result_url text,width int,height int,
    state text NOT NULL,attempts int NOT NULL DEFAULT 0,lease_id uuid,lease_until timestamptz,error text,
    processing_kind text NOT NULL,cost_cny_micros numeric(30,0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE app_media_postprocess ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;`).catch(e => { ready.delete(pool); throw e; }); ready.set(pool,p); }
  await p;
}
export async function transformImage(bytes: Buffer, policy: Postprocess) {
  if (policy.kind === "ai-upscale") throw new Error("AI 超分供应商回执尚未接通");
  const raw = policy.kind === "resize" ? await sharp(bytes).resize(policy.width,policy.height,{fit:"fill",kernel:"lanczos3"}).png().toBuffer() : bytes;
  const m = await sharp(raw).metadata();
  if (m.width !== policy.width || m.height !== policy.height) throw new Error("实际输出像素与约定不一致");
  return { bytes: raw, width:m.width, height:m.height, kind:policy.kind };
}
export async function runPostprocess(input: { id: string; parentId: string; email: string; modelVersion: number; bytes: Buffer; policy: Postprocess }): Promise<PostprocessResult> {
  if (!dbEnabled) { const r=await transformImage(input.bytes,input.policy);return {url:await uploadImage(r.bytes,"image/png",`postprocess/${createHash("sha256").update(input.id).digest("hex")}.png`),width:r.width,height:r.height,kind:r.kind,status:"succeeded"}; }
  const pool=getPool(); await ensurePostprocessSchema(pool);
  await assertMutableStagingTask(pool, "app_media_postprocess", input.id);
  await assertMutableStagingTask(pool, "app_billing_operations", input.parentId);
  await assertMutableStagingTask(pool, "app_image_jobs", input.parentId);
  await assertMutableStagingTask(pool, "app_canvas_image_tasks", input.parentId);
  const digest=createHash("sha256").update(input.bytes).update(JSON.stringify(input.policy)).digest("hex"), key=createHash("sha256").update(input.id).digest("hex");
  const exists=(await pool.query("SELECT * FROM app_media_postprocess WHERE operation_id=$1",[input.id])).rows[0];
  if (exists && (exists.digest!==digest || exists.email!==input.email || Number(exists.model_version)!==input.modelVersion)) throw new Error("后处理任务与冻结配置不一致");
  if (!exists) {
    // Save the paid base before CPU work. A retry never calls the generation supplier.
    const url=await uploadImage(input.bytes,"image/png",`postprocess/${key}-base.png`);
    await pool.query("INSERT INTO app_media_postprocess(operation_id,parent_operation_id,email,model_version,digest,policy,base_url,state,processing_kind,cost_cny_micros) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'pending',$8,0) ON CONFLICT(operation_id) DO NOTHING",[input.id,input.parentId,input.email,input.modelVersion,digest,JSON.stringify(input.policy),url,input.policy.kind]);
  }
  return resumePostprocess(input.id,input.email);
}
export async function resumePostprocess(id: string, email: string, explicitRetry = false): Promise<PostprocessResult> {
  const pool=getPool(); await ensurePostprocessSchema(pool);
  let row=(await pool.query("SELECT * FROM app_media_postprocess WHERE operation_id=$1 AND email=$2",[id,email])).rows[0];
  if (!row) throw new Error("后处理任务不存在");
  if (row.state==="succeeded") return {url:row.result_url,width:row.width,height:row.height,kind:row.processing_kind,status:"succeeded"};
  await assertMutableStagingTask(pool, "app_media_postprocess", id);
  await assertMutableStagingTask(pool, "app_billing_operations", row.parent_operation_id);
  await assertMutableStagingTask(pool, "app_image_jobs", row.parent_operation_id);
  await assertMutableStagingTask(pool, "app_canvas_image_tasks", row.parent_operation_id);
  if (row.state === "failed" && row.policy.failure === "keep-base" && !explicitRetry) {
    const base=await readManagedObject(row.base_url,64*1024*1024),meta=await sharp(base.bytes).metadata();
    return {url:row.base_url,width:meta.width||0,height:meta.height||0,kind:"base",status:"failed-kept-base"};
  }
  const lease=randomUUID();
  const claimed=await pool.query("UPDATE app_media_postprocess SET state='running',lease_id=$3,lease_until=now()+interval '120 seconds',attempts=CASE WHEN $4 THEN 1 ELSE attempts+1 END WHERE operation_id=$1 AND email=$2 AND (lease_until IS NULL OR lease_until<now()) AND state<>'succeeded' AND ($4 OR (attempts<3 AND (next_attempt_at IS NULL OR next_attempt_at<=now()))) RETURNING *",[id,email,lease,explicitRetry]);
  if (!claimed.rowCount) throw new PostprocessPending(id);
  row=claimed.rows[0];
  try {
    const base=await readManagedObject(row.base_url,64*1024*1024), result=await transformImage(base.bytes,row.policy);
    const url=await uploadImage(result.bytes,"image/png",`postprocess/${createHash("sha256").update(id).digest("hex")}-result.png`);
    const changed=await pool.query("UPDATE app_media_postprocess SET state='succeeded',result_url=$3,width=$4,height=$5,error=NULL,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE operation_id=$1 AND lease_id=$2 RETURNING operation_id",[id,lease,url,result.width,result.height]);
    if(!changed.rowCount)throw new PostprocessPending(id);
    return {url,width:result.width,height:result.height,kind:result.kind,status:"succeeded"};
  } catch {
    await pool.query("UPDATE app_media_postprocess SET state='failed',error='后处理或像素校验失败',lease_id=NULL,lease_until=NULL,next_attempt_at=now()+make_interval(secs=>LEAST(300,60*attempts)),updated_at=now() WHERE operation_id=$1 AND lease_id=$2",[id,lease]);
    if(row.policy.failure==="keep-base") {const base=await readManagedObject(row.base_url,64*1024*1024),meta=await sharp(base.bytes).metadata();return {url:row.base_url,width:meta.width||0,height:meta.height||0,kind:"base",status:"failed-kept-base"};}
    throw new PostprocessPending(id);
  }
}
