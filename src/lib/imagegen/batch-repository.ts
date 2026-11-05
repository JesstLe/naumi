import {ensureImagegenBatches} from "@/lib/imagegen/storage-schema";
export {ensureImagegenBatches};

import "server-only";

import {getPool} from "@/platform/db/pool";
import type {ImagegenRequest,ImagegenPlan,ImagegenResult} from "./types";

export type ImagegenBatchRow={id:string;owner:string;fingerprint:string;request:ImagegenRequest;plan:ImagegenPlan;state:string};
export type ImagegenBatchItem={batch_id:string;key:string;ordinal:number;child_operation_id:string;request:ImagegenRequest;plan:ImagegenPlan;state:string;attempts:number;result:ImagegenResult|null;lease_token:string|null};
export async function imagegenBatchRow(id:string,owner?:string){await ensureImagegenBatches();return (await getPool().query<ImagegenBatchRow>(`SELECT * FROM app_imagegen_batches WHERE id=$1 ${owner===undefined?"":"AND owner=$2"}`,[id,...(owner===undefined?[]:[owner.toLowerCase()])])).rows[0]||null;}
export async function imagegenBatchItems(id:string){return (await getPool().query<ImagegenBatchItem>("SELECT * FROM app_imagegen_batch_items WHERE batch_id=$1 ORDER BY ordinal",[id])).rows;}
