import "server-only";
import {getPool} from "@/platform/db/pool";
import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import {createHash} from "node:crypto";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {assistedReviewRequestSchema,reviewFramesSchema,type ReviewTarget,reviewSource} from "./assisted-review";

/** Provenance link only. Billing owns reservation, result, UNKNOWN and retry;
 * media owns extraction. This table has no duplicate task/execution state. */
async function ensure(){
 const state=databaseSchemaReadiness(getPool(),"storyboard-review-requests-v1");
 state.pending ||=getPool().query(`CREATE TABLE IF NOT EXISTS app_storyboard_review_requests (
  email text NOT NULL,operation_id uuid NOT NULL,project_key text NOT NULL,plan_id uuid NOT NULL,node_id text NOT NULL,
  source jsonb NOT NULL,frame_job_id uuid NOT NULL,input_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
  CREATE INDEX IF NOT EXISTS app_storyboard_review_requests_plan ON app_storyboard_review_requests(email,project_key,plan_id);
  CREATE TABLE IF NOT EXISTS app_storyboard_review_frames (
   email text NOT NULL,operation_id uuid NOT NULL,project_key text NOT NULL,plan_id uuid NOT NULL,node_id text NOT NULL,
   source jsonb NOT NULL,frame_job_id uuid NOT NULL,input_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id));
  CREATE INDEX IF NOT EXISTS app_storyboard_review_frames_plan ON app_storyboard_review_frames(email,project_key,plan_id);`).then(()=>undefined).catch(error=>{state.pending=undefined;throw error;});await state.pending;
}
export async function recordReviewFrameRequest(actor:string,raw:unknown,jobId:string){
 const input=reviewFramesSchema.parse(raw);await ensure();const digest=createHash("sha256").update(canonicalConfig(input)).digest("hex");
 const row=(await getPool().query(`INSERT INTO app_storyboard_review_frames(email,operation_id,project_key,plan_id,node_id,source,frame_job_id,input_digest)
 VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT(email,operation_id) DO UPDATE SET input_digest=app_storyboard_review_frames.input_digest RETURNING input_digest,frame_job_id`,[actor,input.operationId,input.projectKey,input.planId,input.nodeId,JSON.stringify(reviewSource(input)),jobId,digest])).rows[0];
 if(row.input_digest!==digest||row.frame_job_id!==jobId)throw new ModelConfigError("STORYBOARD_REVIEW_OPERATION_CONFLICT","抽帧编号已用于其他审片输入",409);
}
export async function readReviewFrameRequests(actor:string,projectKey:string,planId:string){
 await ensure();return (await getPool().query("SELECT operation_id,source,frame_job_id FROM app_storyboard_review_frames WHERE email=$1 AND project_key=$2 AND plan_id=$3 ORDER BY created_at",[actor.toLowerCase(),projectKey,planId])).rows.map(row=>({operationId:String(row.operation_id),source:row.source as ReviewTarget,frameJobId:String(row.frame_job_id)}));
}
export async function recordAssistedReviewRequest(actor:string,raw:unknown){
 const input=assistedReviewRequestSchema.parse(raw);await ensure();const digest=createHash("sha256").update(canonicalConfig(input)).digest("hex");
 const row=(await getPool().query(`INSERT INTO app_storyboard_review_requests(email,operation_id,project_key,plan_id,node_id,source,frame_job_id,input_digest)
 VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT(email,operation_id) DO UPDATE SET input_digest=app_storyboard_review_requests.input_digest RETURNING input_digest`,[actor,input.operationId,input.projectKey,input.planId,input.nodeId,JSON.stringify(reviewSource(input)),input.frameJobId,digest])).rows[0];
 if(row.input_digest!==digest)throw new ModelConfigError("STORYBOARD_REVIEW_OPERATION_CONFLICT","辅助检查编号已用于其他输入",409);
}
export async function readAssistedReviewRequests(actor:string,projectKey:string,planId:string){
 await ensure();return (await getPool().query("SELECT operation_id,source,frame_job_id FROM app_storyboard_review_requests WHERE email=$1 AND project_key=$2 AND plan_id=$3 ORDER BY created_at",[actor.toLowerCase(),projectKey,planId])).rows.map(row=>({operationId:String(row.operation_id),source:row.source as ReviewTarget,frameJobId:String(row.frame_job_id)}));
}
