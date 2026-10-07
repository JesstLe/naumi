import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { createSupplierLedger } from "./repository";
import { validTaskId } from "./adapters";
import { parseReceiptJson } from "./money";
/** No documented APIMart signature scheme is available: all external callbacks are untrusted query hints. */
export async function enqueueCallback(ledger: ReturnType<typeof createSupplierLedger>, accountId: string, raw: string) {
  const hint = parseReceiptJson(raw);
  if (!validTaskId(hint?.id)) throw new Error("invalid callback identity");
  const call = await ledger.task(accountId,hint.id);
  if (!call) return { accepted:false }; // Unknown IDs cannot create bills or cause arbitrary supplier queries.
  return ledger.transaction(async tx => {
    const payloadHash = createHash("sha256").update(raw).digest("hex");
    const inserted=await tx.query("INSERT INTO app_supplier_callback_inbox(id,account_id,task_id,payload_hash,hint) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING", [randomUUID(),accountId,hint.id,payloadHash,JSON.stringify({ id:hint.id,source:"unverified-apimart-callback" })]);
    if(inserted.rowCount && (!call.last_observed_at||Date.now()-new Date(call.last_observed_at).getTime()>=60000))await ledger.enqueue(`task:${call.id}`,"task",{callId:call.id},accountId,tx);
    return { accepted:true };
  });
}
