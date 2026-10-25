import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import "server-only";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";
import type {ImagegenRequest,ImagegenPlan,ImagegenResult} from "./types";
export async function ensureImagegenBatches(){
 const state=databaseSchemaReadiness(getPool(),"imagegen-batches");
 if(!state.pending)state.pending=ensureSchema().then(()=>getPool().query(`
 CREATE TABLE IF NOT EXISTS app_imagegen_batches(
 id uuid PRIMARY KEY,owner text NOT NULL REFERENCES app_users(email),fingerprint text NOT NULL,
 request jsonb NOT NULL,plan jsonb NOT NULL,state text NOT NULL DEFAULT 'running',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS app_imagegen_batch_items(
 batch_id uuid NOT NULL REFERENCES app_imagegen_batches(id),key text NOT NULL,ordinal integer NOT NULL,
 child_operation_id uuid NOT NULL UNIQUE,request jsonb NOT NULL,plan jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 1,
 result jsonb,lease_token uuid,lease_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(batch_id,key));
 CREATE INDEX IF NOT EXISTS app_imagegen_batches_owner ON app_imagegen_batches(owner,created_at DESC);
 CREATE INDEX IF NOT EXISTS app_imagegen_batches_due ON app_imagegen_batches(updated_at) WHERE state IN ('running','cancelling');
 `)).then(()=>{}).catch(e=>{state.pending=undefined;throw e;});return state.pending;
}
export type ImagegenBatchRow={id:string;owner:string;fingerprint:string;request:ImagegenRequest;plan:ImagegenPlan;state:string};
export type ImagegenBatchItem={batch_id:string;key:string;ordinal:number;child_operation_id:string;request:ImagegenRequest;plan:ImagegenPlan;state:string;attempts:number;result:ImagegenResult|null;lease_token:string|null};
export async function imagegenBatchRow(id:string,owner?:string){await ensureImagegenBatches();return (await getPool().query<ImagegenBatchRow>(`SELECT * FROM app_imagegen_batches WHERE id=$1 ${owner===undefined?"":"AND owner=$2"}`,[id,...(owner===undefined?[]:[owner.toLowerCase()])])).rows[0]||null;}
export async function imagegenBatchItems(id:string){return (await getPool().query<ImagegenBatchItem>("SELECT * FROM app_imagegen_batch_items WHERE batch_id=$1 ORDER BY ordinal",[id])).rows;}
