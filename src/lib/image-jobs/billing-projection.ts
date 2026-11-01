import "server-only";
import type {PoolClient} from "pg";
/** Normal completion holds the task before billing. Fee recovery uses the same
 * order, keeping settlement and this projection in the same transaction. */
export async function lockImageBillingProjectionTx(tx:PoolClient,id:string){return(await tx.query("SELECT id,email FROM app_image_jobs WHERE id=$1 FOR UPDATE",[id])).rows[0] as {id:string;email:string}|undefined;}
export async function markImageBillingSettledTx(tx:PoolClient,id:string,email:string){await tx.query("UPDATE app_image_jobs SET billing_settled=true WHERE id=$1 AND email=$2",[id,email]);}
