import {settleLegacyTaskTx,clearTaskReservationTx} from "@/lib/billing/task-settlement";
import "server-only";
import {getPool} from "@/platform/db/pool";
import type {CompetitorItem} from "@/lib/competitor-types";
import {competitorRow} from "./repository";
import {refreshBalance} from "@/lib/billing/wallet-balance";
import {ledId} from "@/lib/billing/legacy-ledger";

/** Version, principal deduction, ledger and reservation complete in one transaction. */
export async function finishCompetitorGeneration(email: string, item: CompetitorItem, jobId: string, cost: number) {
  const client = await getPool().connect();
  let saved: CompetitorItem;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`UPDATE app_competitor_items SET state=$4::jsonb,
      revision=revision+1,job_id=NULL,busy_until=NULL WHERE email=$1 AND id=$2 AND job_id=$3 RETURNING *`,
      [email, item.id, jobId, JSON.stringify(item)]);
    if (!rows[0]) throw new Error("Generation lease lost");
    const {currentSynchronousBilling,settleSynchronous}=await import("@/lib/billing/synchronous-operation");
    if(currentSynchronousBilling())await settleSynchronous("竞品工作台生成",undefined,client);
    else if (cost > 0) {
      await settleLegacyTaskTx(client,{email,charge:cost,reservedCredits:cost,ledgerId:ledId(),reason:"竞品工作台生成",idempotency:"task-lock"});
    }
    await clearTaskReservationTx(client,jobId);
    await client.query("COMMIT");
    saved = competitorRow(rows[0]);
  } catch(e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  // Balance refresh owns a fresh short transaction; release the completed
  // generation transaction before borrowing its connection.
  await refreshBalance(email).catch(() => {});
  return saved;
}
