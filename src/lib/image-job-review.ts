import "server-only";
import { dbEnabled, getPool } from "./db";
export const IMAGE_REVIEW_MESSAGE="本次任务已暂停核查，暂未取得可交付图片；请联系管理员，不会重新生成或重复扣费";
/** Stored evidence only. A receipt read never queries/restarts a supplier. */
export async function storedImageReview(id:string,owner:string):Promise<boolean>{
 if(!dbEnabled)return false;
 // Supplier accounting initializes lazily, including a fresh database's first
 // image. Absence is not review evidence and must not break receipt polling.
 if(!(await getPool().query("SELECT to_regclass('app_supplier_calls') AS name")).rows[0]?.name)return false;
 return !!(await getPool().query("SELECT 1 FROM app_supplier_calls WHERE operation_id=$1 AND user_email=$2 AND state IN ('reconciling','waiting_login','waiting_client') AND evidence->>'source' IN ('reverse-hub-task-query','reverse-hub-submit') LIMIT 1",[id,owner.toLowerCase()])).rowCount;
}
