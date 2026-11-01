import "server-only";
import type {Pool} from "pg";
import type {Tx} from "./types";
import {excludeImportedHistory} from "../staging-history";
/** Billing owns its pending-operation selection; callers do not inspect quotes. */
export async function pendingApiCostOperations(db:Pick<Pool,"query">){
 return(await db.query(`SELECT id FROM app_billing_operations WHERE quote->'tariff'->'pricing'->>'mode'='api-cost-plus'
 AND state IN('manual','hold','settled') AND settlement_result IS NOT NULL
 AND (state IN('manual','hold') OR EXISTS(SELECT 1 FROM app_supplier_calls c WHERE c.operation_id=app_billing_operations.id AND c.updated_at>app_billing_operations.updated_at))
 ${excludeImportedHistory("app_billing_operations")} ORDER BY CASE WHEN state IN('manual','hold') THEN 0 ELSE 1 END,updated_at ASC LIMIT 100`)).rows as {id:string}[];
}
export async function requestCanvasRecoveryTx(tx:Tx,id:string){await tx.query(`UPDATE app_billing_operations SET result_response=COALESCE(result_response,'{}'::jsonb)||'{"canvasRecoveryPending":true}'::jsonb WHERE id=$1`,[id]);}
export async function pendingCanvasRecoveries(db:Pick<Pool,"query">){return(await db.query(`SELECT id,email FROM app_billing_operations WHERE result_response->>'canvasRecoveryPending'='true' ${excludeImportedHistory("app_billing_operations")} ORDER BY updated_at,id LIMIT 100`)).rows as {id:string;email:string}[];}
export async function canvasRecoveryRequestTx(tx:Tx,id:string){return(await tx.query("SELECT id,email FROM app_billing_operations WHERE id=$1 AND result_response->>'canvasRecoveryPending'='true'",[id])).rows[0] as {id:string;email:string}|undefined;}
export async function finishCanvasRecoveryTx(tx:Tx,id:string,email:string){await tx.query("UPDATE app_billing_operations SET result_response=result_response-'canvasRecoveryPending' WHERE id=$1 AND email=$2",[id,email]);}
