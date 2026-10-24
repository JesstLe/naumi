import "server-only";
import { dbEnabled } from "@/platform/db/pool";
import { supplierLedger } from "./runtime";
import { genericReceipt } from "./adapters";
import {ensureSupplierSchema} from "./schema";
/** Durable task IDs connect asynchronous metadata to the original paid submit, never a new expense. */
export async function videoSupplierReceipt(operationId:string,taskId:string,state:string,raw:unknown){
  if(!dbEnabled)return;
  const ledger=supplierLedger();await ensureSupplierSchema(ledger.pool);
  const calls=(await ledger.pool.query("SELECT * FROM app_supplier_calls WHERE operation_id=$1 AND phase='video-generation' AND (task_id=$2 OR request_id=$2) ORDER BY started_at DESC LIMIT 1",[operationId,taskId])).rows;
  // No guessed assignment to every retry: the submit receipt must identify this exact task.
  for(const call of calls){const receipt=genericReceipt(raw,state,call.procurement);receipt.taskId=taskId;receipt.source='video-task-observation';await ledger.apply(call.id,receipt);}
}
