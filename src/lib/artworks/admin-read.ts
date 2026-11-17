import "server-only";
import {bannedEmailsAmongTx} from "@/lib/accounts/repository";
import {ensureSchema} from "@/lib/persistence/schema";
import {checkReadClientSocket,withOwnedReportClient} from "@/platform/db/owned-read-client";
import {getPool} from "@/platform/db/pool";
import {importedArtworkIdsTx,listAllArtworksTx} from "./administration";

/** Site admin authorization is required at the entry before this projection. */
export async function readAdminArtworkPage(page:number,pageSize:number,signal:AbortSignal) {
  signal.throwIfAborted();
  await ensureSchema();
  return withOwnedReportClient(getPool(),async tx=>{
    await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='3s'"+checkReadClientSocket);
    const {artworks,total}=await listAllArtworksTx(tx,pageSize,page*pageSize);
    const importedIds=await importedArtworkIdsTx(tx,artworks.map(row=>row.id));
    const bannedEmails=await bannedEmailsAmongTx(tx,artworks.map(row=>row.email));
    await tx.query("COMMIT");
    return {artworks,total,page,pageSize,importedIds,bannedEmails};
  },signal);
}
