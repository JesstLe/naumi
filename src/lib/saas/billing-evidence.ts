import "server-only";
import type {PoolClient} from "pg";
/** Secondary evidence only. A failed projection never poisons its caller's
 * authoritative billing transaction. No pool checkout or external I/O. */
export async function releaseBillingCreationEvidenceTx(tx:PoolClient,id:string,email:string,released:number|null):Promise<boolean>{
 if(!(await tx.query("SELECT to_regclass('app_creation_links') AS name")).rows[0]?.name)return true;
 await tx.query("SAVEPOINT billing_creation_release");
 try{await tx.query("UPDATE app_creation_links SET released_credits=$3 WHERE target_type='billing' AND target_id=$1 AND actor_email=$2",[id,email,released]);await tx.query("RELEASE SAVEPOINT billing_creation_release");return true;}
 catch{await tx.query("ROLLBACK TO SAVEPOINT billing_creation_release");await tx.query("RELEASE SAVEPOINT billing_creation_release");return false;}
}
